import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  validateOrder,
  paypalConfigured,
  paypalRequest,
  type PayPalOrder,
} from '../src/lib/paypal';
const payment = {
  id: 'payment-1',
  paypalOrderId: 'ORDER',
  amountMinor: 45000,
  currency: 'USD',
  merchantId: 'MERCHANT',
};
function order(): PayPalOrder {
  return {
    id: 'ORDER',
    status: 'COMPLETED',
    purchase_units: [
      {
        custom_id: 'payment-1',
        payee: { merchant_id: 'MERCHANT' },
        amount: { value: '450.00', currency_code: 'USD' },
        payments: {
          captures: [
            {
              id: 'CAPTURE',
              status: 'COMPLETED',
              amount: { value: '450.00', currency_code: 'USD' },
              final_capture: true,
            },
          ],
        },
      },
    ],
  };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe('PayPal validation', () => {
  it('recognizes refunds only for a previously recorded capture', () => {
    const o = order();
    o.purchase_units![0].payments!.captures![0].status = 'REFUNDED';
    expect(() => validateOrder(o, payment)).toThrow();
    expect(validateOrder(o, { ...payment, paypalCaptureId: 'CAPTURE' })?.status).toBe('REFUNDED');
  });
  it('requires merchant, amount, currency, reference and final capture', () =>
    expect(validateOrder(order(), payment)?.id).toBe('CAPTURE'));
  it.each(['id', 'amount', 'merchant', 'currency', 'reference', 'capture'])(
    'rejects tampered %s',
    (field) => {
      const o = order();
      const u = o.purchase_units![0];
      if (field === 'id') o.id = 'OTHER';
      if (field === 'amount') u.amount!.value = '1.00';
      if (field === 'merchant') u.payee!.merchant_id = 'ATTACKER';
      if (field === 'currency') u.amount!.currency_code = 'EUR';
      if (field === 'reference') u.custom_id = 'other';
      if (field === 'capture') u.payments!.captures![0].final_capture = false;
      expect(() => validateOrder(o, payment)).toThrow();
    },
  );
  it('does not infer paid from approved order', () => {
    const o = order();
    o.status = 'APPROVED';
    o.purchase_units![0].payments = undefined;
    expect(validateOrder(o, payment)).toBeUndefined();
  });
  it('never enables production accidentally', () => {
    vi.stubEnv('PAYPAL_ENV', 'production');
    expect(paypalConfigured()).toBe(false);
  });
  it('reports missing credentials without network call', async () => {
    vi.stubEnv('PAYPAL_CLIENT_ID', '');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(paypalRequest('/v2/checkout/orders')).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});
