import { db } from './db';
import { ensure } from './errors';
import { audit, assertClient, getMilestone, type Actor } from './projects';
import { formatAmount, parseTip } from './validation';
import { z } from 'zod';
import {
  PayPalError,
  paypalConfigured,
  paypalRequest,
  validateOrder,
  type PayPalOrder,
} from './paypal';
export async function createOrder(user: Actor, id: string, input: unknown = {}) {
  const m = await getMilestone(user, id);
  assertClient(user, m.project);
  ensure(m.status === 'ACCEPTED', 409, 'Client acceptance is required before checkout.');
  const data = z
    .object({
      tip: z
        .string()
        .default('0.00')
        .refine((value) => {
          try {
            parseTip(value);
            return true;
          } catch {
            return false;
          }
        }, 'Tip must be a non-negative two-decimal amount.'),
    })
    .strict()
    .parse(input);
  const tipMinor = parseTip(data.tip),
    totalMinor = m.amountMinor + tipMinor;
  ensure(totalMinor <= 10000000, 400, 'Total exceeds the supported payment limit.');
  ensure(
    paypalConfigured(),
    503,
    'PayPal sandbox is not configured. Add the sandbox credentials to enable checkout.',
  );
  let p = await db.payment.upsert({
    where: { milestoneId: id },
    create: {
      milestoneId: id,
      amountMinor: totalMinor,
      baseAmountMinor: m.amountMinor,
      tipMinor,
      currency: m.currency,
      merchantId: process.env.PAYPAL_MERCHANT_ID!,
    },
    update: {},
  });
  ensure(!['PAID', 'REFUNDED'].includes(p.status), 409, 'This milestone has already been paid.');
  ensure(
    p.baseAmountMinor === m.amountMinor && p.tipMinor === tipMinor && p.amountMinor === totalMinor,
    409,
    'This payment attempt already has a fixed amount and tip. Reuse the recorded values.',
  );
  if (p.paypalOrderId) {
    await reconcilePayment(p.id, user.id);
    p = (await db.payment.findUnique({ where: { id: p.id } }))!;
    ensure(!['PAID', 'REFUNDED'].includes(p.status), 409, 'Payment is already complete.');
    ensure(p.approvalUrl, 409, 'Order cannot be resumed. Reconcile or contact the operator.');
    await db.payment.updateMany({
      where: { id: p.id, status: { notIn: ['PAID', 'REFUNDED'] } },
      data: { status: 'PENDING' },
    });
    return { approvalUrl: p.approvalUrl };
  }
  ensure(
    Date.now() - p.createdAt.getTime() < 5 * 60 * 60 * 1000,
    409,
    'This unresolved order attempt is too old to retry safely. Ask the operator to reconcile it with PayPal.',
  );
  const appUrl = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  const order: PayPalOrder = await paypalRequest(
    '/v2/checkout/orders',
    'POST',
    {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: m.id,
          custom_id: p.id,
          description: m.title,
          amount: { currency_code: p.currency, value: formatAmount(p.amountMinor) },
          payee: { merchant_id: p.merchantId },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: 'ProofPay Sandbox',
            shipping_preference: 'NO_SHIPPING',
            user_action: 'PAY_NOW',
            return_url: `${appUrl}/dashboard?payment=${p.id}`,
            cancel_url: `${appUrl}/dashboard?cancel=${p.id}`,
          },
        },
      },
    },
    `create-${p.id}`,
  );
  ensure(order.id, 502, 'PayPal returned no order ID.');
  validateOrder(order, { ...p, paypalOrderId: order.id });
  const approval = order.links?.find((l) => l.rel === 'payer-action' || l.rel === 'approve')?.href;
  ensure(
    approval && new URL(approval).origin === 'https://www.sandbox.paypal.com',
    502,
    'PayPal returned an invalid sandbox approval URL.',
  );
  await db.$transaction(async (tx) => {
    await tx.payment.updateMany({
      where: { id: p.id, status: { notIn: ['PAID', 'REFUNDED'] } },
      data: { paypalOrderId: order.id, approvalUrl: approval, status: 'PENDING' },
    });
    await audit(tx, user.id, m.projectId, 'PAYPAL_ORDER_CREATED', id, {
      paymentId: p.id,
      orderId: order.id,
    });
  });
  return { approvalUrl: approval };
}
export async function reconcilePayment(paymentId: string, actorId: string) {
  const p = await db.payment.findUnique({ where: { id: paymentId }, include: { milestone: true } });
  ensure(p?.paypalOrderId, 404, 'PayPal order not found.');
  const order: PayPalOrder = await paypalRequest(
    `/v2/checkout/orders/${encodeURIComponent(p.paypalOrderId)}`,
  );
  const capture = validateOrder(order, p);
  let status = p.status;
  if (p.status === 'REFUNDED') status = 'REFUNDED';
  else if (capture?.status === 'REFUNDED') status = 'REFUNDED';
  else if (order.status === 'COMPLETED' && capture) status = 'PAID';
  else if (p.status !== 'PAID' && order.status === 'VOIDED') status = 'CANCELLED';
  else if (
    p.status !== 'PAID' &&
    order.purchase_units?.[0].payments?.captures?.some(
      (c) => c.status === 'DECLINED' || c.status === 'DENIED' || c.status === 'FAILED',
    )
  )
    status = 'FAILED';
  if (status !== p.status)
    await db.$transaction(async (tx) => {
      const updated = await tx.payment.updateMany({
        where: {
          id: p.id,
          status: { notIn: status === 'REFUNDED' ? ['REFUNDED'] : ['PAID', 'REFUNDED'] },
        },
        data: { status, paypalCaptureId: capture?.id },
      });
      if (updated.count)
        await audit(tx, actorId, p.milestone.projectId, 'PAYMENT_RECONCILED', p.milestoneId, {
          paymentId: p.id,
          status,
        });
    });
  return { status, orderStatus: order.status };
}
export async function capturePayment(user: Actor, id: string) {
  const m = await getMilestone(user, id);
  assertClient(user, m.project);
  ensure(m.status === 'ACCEPTED', 409, 'Milestone is not accepted.');
  const p = m.payment;
  ensure(p?.paypalOrderId, 409, 'Start checkout first.');
  const state = await reconcilePayment(p.id, user.id);
  if (state.status === 'PAID') return { status: 'PAID' };
  ensure(state.orderStatus === 'APPROVED', 409, 'Approve the order in PayPal before capturing.');
  const lock = await db.payment.updateMany({
    where: { id: p.id, OR: [{ busyUntil: null }, { busyUntil: { lt: new Date() } }] },
    data: { busyUntil: new Date(Date.now() + 120000) },
  });
  ensure(lock.count === 1, 409, 'A payment request is in progress. Reconcile shortly.');
  try {
    await paypalRequest(
      `/v2/checkout/orders/${encodeURIComponent(p.paypalOrderId)}/capture`,
      'POST',
      {},
      `capture-${p.id}`,
    );
    return await reconcilePayment(p.id, user.id);
  } catch (error) {
    if (
      error instanceof PayPalError &&
      ['INSTRUMENT_DECLINED', 'PAYER_CANNOT_PAY', 'TRANSACTION_REFUSED'].includes(error.issue)
    ) {
      await db.$transaction(async (tx) => {
        await tx.payment.updateMany({
          where: { id: p.id, status: { notIn: ['PAID', 'REFUNDED'] } },
          data: { status: 'FAILED' },
        });
        await audit(tx, user.id, m.projectId, 'PAYMENT_FAILED', id, {
          paymentId: p.id,
          issue: error.issue,
        });
      });
    }
    throw error;
  } finally {
    await db.payment.update({ where: { id: p.id }, data: { busyUntil: null } });
  }
}
export async function cancelPayment(user: Actor, id: string) {
  const m = await getMilestone(user, id);
  assertClient(user, m.project);
  ensure(m.payment, 404, 'Payment not found.');
  const state = await reconcilePayment(m.payment.id, user.id);
  ensure(
    state.status !== 'PAID' && state.orderStatus !== 'APPROVED',
    409,
    'Payment is paid or approved. Reconcile its actual state.',
  );
  await db.$transaction(async (tx) => {
    await tx.payment.updateMany({
      where: { id: m.payment!.id, status: { notIn: ['PAID', 'REFUNDED'] } },
      data: { status: 'CANCELLED' },
    });
    await audit(tx, user.id, m.projectId, 'PAYMENT_CANCELLED', id, { paymentId: m.payment!.id });
  });
  return { status: 'CANCELLED' };
}
export async function processWebhook(headers: Headers, event: unknown) {
  ensure(event && typeof event === 'object', 400, 'Invalid event.');
  const e = event as {
    id?: string;
    event_type?: string;
    resource?: {
      id?: string;
      supplementary_data?: { related_ids?: { order_id?: string; capture_id?: string } };
    };
  };
  ensure(
    typeof e.id === 'string' && typeof e.event_type === 'string',
    400,
    'Webhook event is missing an ID or type.',
  );
  ensure(process.env.PAYPAL_WEBHOOK_ID, 503, 'Webhook ID is not configured.');
  const names = [
    'paypal-auth-algo',
    'paypal-cert-url',
    'paypal-transmission-id',
    'paypal-transmission-sig',
    'paypal-transmission-time',
  ];
  ensure(
    names.every((n) => headers.get(n)),
    400,
    'Webhook signature headers are missing.',
  );
  const verification = await paypalRequest('/v1/notifications/verify-webhook-signature', 'POST', {
    auth_algo: headers.get(names[0]),
    cert_url: headers.get(names[1]),
    transmission_id: headers.get(names[2]),
    transmission_sig: headers.get(names[3]),
    transmission_time: headers.get(names[4]),
    webhook_id: process.env.PAYPAL_WEBHOOK_ID,
    webhook_event: event,
  });
  ensure(verification.verification_status === 'SUCCESS', 401, 'Invalid PayPal webhook signature.');
  if (await db.webhookEvent.findUnique({ where: { id: e.id } })) return { duplicate: true };
  const orderId =
    e.resource?.supplementary_data?.related_ids?.order_id ??
    (e.event_type.startsWith('CHECKOUT.ORDER.') ? e.resource?.id : undefined);
  const p = await db.payment.findFirst({
    where: orderId
      ? { paypalOrderId: orderId }
      : e.resource?.supplementary_data?.related_ids?.capture_id || e.resource?.id
        ? {
            paypalCaptureId:
              e.resource?.supplementary_data?.related_ids?.capture_id ?? e.resource!.id,
          }
        : { id: 'not-found' },
  });
  if (p) {
    await reconcilePayment(p.id, 'paypal-webhook');
    if (e.event_type === 'PAYMENT.CAPTURE.REFUNDED') {
      const capture = await paypalRequest(
        `/v2/payments/captures/${encodeURIComponent(p.paypalCaptureId ?? '')}`,
      );
      if (
        capture.status === 'REFUNDED' &&
        capture.id === p.paypalCaptureId &&
        capture.amount?.currency_code === p.currency &&
        capture.amount.value === formatAmount(p.amountMinor)
      )
        await db.$transaction(async (tx) => {
          const updated = await tx.payment.updateMany({
            where: { id: p.id, status: 'PAID' },
            data: { status: 'REFUNDED' },
          });
          if (updated.count)
            await audit(
              tx,
              'paypal-webhook',
              (await tx.milestone.findUniqueOrThrow({ where: { id: p.milestoneId } })).projectId,
              'PAYMENT_REFUNDED',
              p.milestoneId,
              { paymentId: p.id },
            );
        });
    }
  }
  await db.webhookEvent.upsert({
    where: { id: e.id },
    create: { id: e.id, eventType: e.event_type },
    update: {},
  });
  return { received: true };
}
