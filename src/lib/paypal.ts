import { createHash } from 'node:crypto';
import { AppError, ensure } from './errors';
import { formatAmount } from './validation';
const BASE = 'https://api-m.sandbox.paypal.com';
let cachedToken: { token: string; expiresAt: number; credentialHash: string } | null = null;
async function accessToken() {
  const credentials = `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`;
  const credentialHash = createHash('sha256').update(credentials).digest('hex');
  if (
    cachedToken &&
    cachedToken.credentialHash === credentialHash &&
    cachedToken.expiresAt > Date.now()
  )
    return cachedToken.token;
  const response = await fetch(`${BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(credentials).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(15000),
  });
  ensure(response.ok, 503, 'PayPal sandbox authentication is unavailable.');
  const body = await response.json();
  ensure(
    typeof body.access_token === 'string' && Number.isFinite(body.expires_in),
    502,
    'Invalid PayPal token response.',
  );
  cachedToken = {
    token: body.access_token,
    expiresAt: Date.now() + Math.max(0, body.expires_in - 60) * 1000,
    credentialHash,
  };
  return cachedToken.token;
}
export function paypalConfigured() {
  return (
    process.env.PAYPAL_ENV === 'sandbox' &&
    Boolean(
      process.env.PAYPAL_CLIENT_ID &&
      process.env.PAYPAL_CLIENT_SECRET &&
      process.env.PAYPAL_MERCHANT_ID,
    )
  );
}
export class PayPalError extends AppError {
  constructor(public issue: string) {
    super(
      502,
      issue === 'INSTRUMENT_DECLINED'
        ? 'PayPal declined this funding source. Choose another funding source in sandbox checkout.'
        : 'PayPal could not complete this request. Reconcile the payment before retrying.',
    );
  }
}
export async function paypalRequest(
  path: string,
  method = 'GET',
  body?: unknown,
  idempotency?: string,
) {
  ensure(paypalConfigured(), 503, 'PayPal sandbox credentials and merchant ID are not configured.');
  const token = await accessToken();
  for (let attempt = 0; attempt < 3; attempt++) {
    let response: Response;
    try {
      response = await fetch(`${BASE}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
          ...(idempotency ? { 'PayPal-Request-Id': idempotency } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      if (attempt < 2 && (method === 'GET' || idempotency)) {
        await new Promise((r) => setTimeout(r, 300 * 2 ** attempt));
        continue;
      }
      throw new AppError(
        503,
        'PayPal response is uncertain. Reconcile before starting another payment.',
      );
    }
    if ((response.status >= 500 || response.status === 429) && attempt < 2) {
      const retryAfter = Number(response.headers.get('retry-after'));
      await new Promise((r) =>
        setTimeout(
          r,
          Math.min(
            2000,
            Math.max(300 * 2 ** attempt, Number.isFinite(retryAfter) ? retryAfter * 1000 : 0),
          ),
        ),
      );
      continue;
    }
    const result = await response.json();
    if (response.status === 401) cachedToken = null;
    if (!response.ok) {
      console.warn(
        JSON.stringify({
          service: 'paypal',
          status: response.status,
          debugId: typeof result.debug_id === 'string' ? result.debug_id : undefined,
        }),
      );
      throw new PayPalError(result.details?.[0]?.issue ?? result.name ?? 'PAYPAL_ERROR');
    }
    return result;
  }
  throw new AppError(503, 'PayPal is temporarily unavailable.');
}
export type PayPalOrder = {
  id: string;
  status: string;
  purchase_units?: {
    reference_id?: string;
    custom_id?: string;
    amount?: { currency_code: string; value: string };
    payee?: { merchant_id?: string };
    payments?: {
      captures?: {
        id: string;
        status: string;
        amount: { currency_code: string; value: string };
        final_capture?: boolean;
      }[];
    };
  }[];
  links?: { rel: string; href: string }[];
};
export function validateOrder(
  order: PayPalOrder,
  payment: {
    id: string;
    paypalOrderId: string | null;
    amountMinor: number;
    currency: string;
    merchantId: string;
    paypalCaptureId?: string | null;
  },
  requireCapture = false,
) {
  ensure(order.id === payment.paypalOrderId, 502, 'PayPal order does not match this payment.');
  const units = order.purchase_units;
  ensure(units?.length === 1, 502, 'Unexpected PayPal purchase units.');
  const unit = units[0];
  ensure(
    unit.custom_id === payment.id &&
      unit.payee?.merchant_id === payment.merchantId &&
      unit.amount?.currency_code === payment.currency &&
      unit.amount.value === formatAmount(payment.amountMinor),
    502,
    'PayPal amount, currency, reference or recipient mismatch.',
  );
  const captures = unit.payments?.captures ?? [];
  const completed = captures.filter((c) => c.status === 'COMPLETED');
  const knownRefund = captures.find(
    (c) =>
      (c.status === 'REFUNDED' || c.status === 'PARTIALLY_REFUNDED') &&
      c.id === payment.paypalCaptureId,
  );
  const authoritative = completed.length === 1 ? completed[0] : knownRefund;
  if (requireCapture || order.status === 'COMPLETED')
    ensure(
      authoritative &&
        (!requireCapture || authoritative.status === 'COMPLETED') &&
        authoritative.amount.currency_code === payment.currency &&
        authoritative.amount.value === formatAmount(payment.amountMinor) &&
        authoritative.final_capture === true &&
        captures.length === 1,
      502,
      'PayPal capture details do not match the milestone.',
    );
  return authoritative;
}
