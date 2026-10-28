# PayPal sandbox setup and verification

Start with [PayPal Developer](https://developer.paypal.com/) and [PayPal AI Toolkit](https://github.com/paypal/AI-Toolkit). The developer-time toolkit guidance was read; no PayPal MCP server is connected. Runtime uses fixed sandbox REST endpoints, never the development MCP server.

1. Sign into your Developer account and create a sandbox REST app under Apps & Credentials. Use a sandbox business merchant and a separate sandbox personal buyer.
2. In ignored .env configure PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET and PAYPAL_MERCHANT_ID for that same sandbox merchant. Keep PAYPAL_ENV=sandbox. Never paste secrets into chat or source code.
3. Set APP_URL and NEXTAUTH_URL to the actual application origin. Local default is http://localhost:3000. Restart the server after changing credentials.
4. On a public HTTPS deployment subscribe /api/v1/paypal-webhook to CHECKOUT.ORDER.APPROVED, PAYMENT.CAPTURE.COMPLETED, PAYMENT.CAPTURE.PENDING, PAYMENT.CAPTURE.DENIED and PAYMENT.CAPTURE.REFUNDED. Put the returned ID in PAYPAL_WEBHOOK_ID. A simulator event is not evidence that an actual capture succeeded.
5. Sign in as the project client, review and accept the milestone. Acceptance creates no payment. Click Continue to PayPal sandbox, approve with the separate sandbox buyer, then return and explicitly confirm sandbox capture. Check payment status to reconcile.

## Semantics

The sandbox buyer pays the configured merchant ID. The merchant may represent the demo operator. No escrow, hold, seller onboarding, split payment, automatic release or third-party freelancer payout is implemented. Do not describe merchant receipt as freelancer receipt. PAID is recorded only after authoritative order and capture amount/currency/merchant/reference validation, with a completed final capture. Accepted remains accepted if payment is cancelled or fails.

## Reliability

Create and capture requests use durable request IDs derived from the payment UUID. Retries reuse the same logical order. Duplicate webhooks are verified then deduplicated. Reconciliation fetches current PayPal state rather than trusting a frontend redirect, event order, or user-submitted amount. A capture lease limits simultaneous requests. An unresolved creation attempt older than five hours needs operator investigation. Replacement of expired orders is not automatic; this avoids accidentally creating a second charge after an uncertain outcome.

## Required live checks (blocked: placeholders requested)

- OAuth exchange with real sandbox credentials.
- Create order and verify buyer/merchant are separate accounts.
- Actual buyer approval and completed capture.
- Cancelled checkout, declined instrument, timeout/retry, approval without capture, stale order, pending capture.
- Real webhook signature verification, duplicate delivery, invalid signature and missed-event reconciliation.
- Check the configured merchant's sandbox transaction record and the amount/currency/recipient.

Unit and database-backed mocked payment tests are labeled as mocks and cannot satisfy this live checklist.

Sources: [Orders workflow](https://developer.paypal.com/api/rest/integration/orders-api/), [authentication](https://developer.paypal.com/api/rest/authentication/), [webhooks](https://developer.paypal.com/api/rest/webhooks/), [Orders v2](https://developer.paypal.com/api/orders/v2).
