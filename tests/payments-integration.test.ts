import 'dotenv/config';
import { afterAll, afterEach, describe, it, expect, vi } from 'vitest';
import { db } from '../src/lib/db';
import { createOrder, capturePayment, processWebhook, reconcilePayment } from '../src/lib/payments';
import { PayPalError } from '../src/lib/paypal';
describe.skipIf(!process.env.DATABASE_URL)('mocked PayPal with real PostgreSQL ledger', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  afterAll(() => db.$disconnect());
  it('persists an order, requires explicit approval, captures once and deduplicates verified events', async () => {
    vi.stubEnv('PAYPAL_ENV', 'sandbox');
    vi.stubEnv('PAYPAL_CLIENT_ID', `fixture-${crypto.randomUUID()}`);
    vi.stubEnv('PAYPAL_CLIENT_SECRET', 'fake-unit-test-secret');
    vi.stubEnv('PAYPAL_MERCHANT_ID', 'FIXTURE-MERCHANT');
    vi.stubEnv('PAYPAL_WEBHOOK_ID', 'FIXTURE-WEBHOOK');
    const stamp = crypto.randomUUID();
    const client = await db.user.create({
      data: {
        name: 'Payment test client',
        email: `pc-${stamp}@example.test`,
        passwordHash: 'disabled-test-login',
        role: 'CLIENT',
      },
    });
    const freelancer = await db.user.create({
      data: {
        name: 'Payment test freelancer',
        email: `pf-${stamp}@example.test`,
        passwordHash: 'disabled-test-login',
        role: 'FREELANCER',
      },
    });
    const project = await db.project.create({
      data: {
        title: 'MOCK payment integration',
        description: 'Not a live PayPal transaction',
        clientId: client.id,
        freelancerId: freelancer.id,
      },
    });
    const milestone = await db.milestone.create({
      data: {
        projectId: project.id,
        title: 'Mock sandbox milestone',
        description: 'Test ledger only',
        amountMinor: 1250,
        currency: 'USD',
        dueDate: new Date('2026-11-10'),
        status: 'ACCEPTED',
      },
    });
    let orderStatus = 'CREATED',
      captures = 0,
      signatureValid = true;
    const captureRequestIds: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const target = String(url);
        if (target.endsWith('/v1/oauth2/token'))
          return Response.json({ access_token: 'fixture-token', expires_in: 3600 });
        if (target.endsWith('/verify-webhook-signature'))
          return Response.json({ verification_status: signatureValid ? 'SUCCESS' : 'FAILURE' });
        const payment = await db.payment.findUnique({ where: { milestoneId: milestone.id } });
        if (target.endsWith('/capture')) {
          captures++;
          captureRequestIds.push((init?.headers as Record<string, string>)['PayPal-Request-Id']);
          orderStatus = 'COMPLETED';
        }
        return Response.json({
          id: 'FIXTURE-ORDER-' + stamp,
          status: orderStatus,
          purchase_units: [
            {
              custom_id: payment!.id,
              amount: { value: '15.00', currency_code: 'USD' },
              payee: { merchant_id: 'FIXTURE-MERCHANT' },
              ...(orderStatus === 'COMPLETED'
                ? {
                    payments: {
                      captures: [
                        {
                          id: 'FIXTURE-CAPTURE-' + stamp,
                          status: 'COMPLETED',
                          amount: { value: '15.00', currency_code: 'USD' },
                          final_capture: true,
                        },
                      ],
                    },
                  }
                : {}),
            },
          ],
          links: [
            {
              rel: 'payer-action',
              href: 'https://www.sandbox.paypal.com/checkoutnow?token=FIXTURE',
            },
          ],
        });
      }),
    );
    await expect(createOrder(freelancer, milestone.id)).rejects.toThrow('client');
    await expect(createOrder(client, milestone.id, { tip: '-1.00' })).rejects.toThrow();
    await expect(
      createOrder(client, milestone.id, { tip: '2.50', amountMinor: 1 }),
    ).rejects.toThrow();
    await createOrder(client, milestone.id, { tip: '2.50' });
    const payment = await db.payment.findUniqueOrThrow({ where: { milestoneId: milestone.id } });
    expect(payment.status).toBe('PENDING');
    expect(payment).toMatchObject({ baseAmountMinor: 1250, tipMinor: 250, amountMinor: 1500 });
    await expect(createOrder(client, milestone.id, { tip: '0.00' })).rejects.toThrow(
      'fixed amount',
    );
    expect(captures).toBe(0);
    await expect(capturePayment(client, milestone.id)).rejects.toThrow('Approve');
    orderStatus = 'APPROVED';
    await capturePayment(client, milestone.id);
    expect(captures).toBe(1);
    await capturePayment(client, milestone.id);
    expect(captures).toBe(1);
    expect(captureRequestIds).toEqual([`capture-${payment.id}`]);
    expect((await db.milestone.findUniqueOrThrow({ where: { id: milestone.id } })).status).toBe(
      'ACCEPTED',
    );
    const event = {
      id: 'EVENT-' + stamp,
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: {
        id: 'FIXTURE-CAPTURE-' + stamp,
        supplementary_data: { related_ids: { order_id: 'FIXTURE-ORDER-' + stamp } },
      },
    };
    const headers = new Headers({
      'paypal-auth-algo': 'SHA256withRSA',
      'paypal-cert-url': 'https://api-m.sandbox.paypal.com/cert',
      'paypal-transmission-id': 'transmission',
      'paypal-transmission-sig': 'fixture-signature',
      'paypal-transmission-time': new Date().toISOString(),
    });
    signatureValid = false;
    await expect(processWebhook(headers, event)).rejects.toThrow('signature');
    signatureValid = true;
    await processWebhook(headers, event);
    expect(await processWebhook(headers, event)).toEqual({ duplicate: true });
    expect(await db.webhookEvent.count({ where: { id: event.id } })).toBe(1);
    orderStatus = 'VOIDED';
    await reconcilePayment(payment.id, client.id);
    expect((await db.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe('PAID');
  }, 30000);
  it('does not automatically retry a declined instrument', async () => {
    vi.stubEnv('PAYPAL_ENV', 'sandbox');
    vi.stubEnv('PAYPAL_CLIENT_ID', `decline-${crypto.randomUUID()}`);
    vi.stubEnv('PAYPAL_CLIENT_SECRET', 'fake');
    vi.stubEnv('PAYPAL_MERCHANT_ID', 'fake');
    const fetch = vi.fn(async (url: string) =>
      url.endsWith('/token')
        ? Response.json({ access_token: 'fake', expires_in: 3600 })
        : Response.json({ details: [{ issue: 'INSTRUMENT_DECLINED' }] }, { status: 422 }),
    );
    vi.stubGlobal('fetch', fetch);
    const { paypalRequest } = await import('../src/lib/paypal');
    await expect(
      paypalRequest('/v2/checkout/orders/fake/capture', 'POST', {}, 'same-id'),
    ).rejects.toBeInstanceOf(PayPalError);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
