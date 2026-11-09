# ProofPay testing and completion

Status reviewed 10 November 2026 (India time).

## Verified in this session

`npm test -- tests/paypal.test.ts tests/payments-integration.test.ts`: 13 tests passed across two files. Payment integration tests use mocked PayPal HTTP and a real local PostgreSQL ledger. They do not prove a real sandbox transaction.

The restricted initial run could not reach PostgreSQL (EACCES); rerunning with local database access passed. The database subsequently stopped and was restarted without resetting data. All 67 backend tests across nine files now pass. Lint, typecheck and production build passed. All three Chromium browser workflows passed against the port-3001 production preview. The deterministic evaluation passed 60/60 cases; it is not an AI benchmark. Local API smoke checks passed five requests and six assertions. Updated stale browser assertions for the current landing page and configured/unconfigured checkout states; settings tests now create their own account instead of relying on seeded credentials.

Real sandbox OAuth, order creation, buyer approval, capture and reconciliation succeeded. Order `3J0610705W951813G`, capture `8F465400JU890415B`, amount $1.00 USD, local status `PAID`, PayPal order status `COMPLETED`. Repeating capture returned the existing paid transaction and capture reference. This used the real sandbox REST API through ProofPay's service layer, a real buyer checkout in the browser, and a dedicated fixture project with agreement, artifact submission, evaluation and acceptance. It was not initiated through a signed-in client payment button; the three separate browser workflows cover application behavior through acceptance and checkout availability.

The original India merchant rejected order `22K62415TH174940V` at checkout with `UNSUPPORTED_PAYEE_CURRENCY`. Its last authoritative status was `PAYER_ACTION_REQUIRED`, with no capture recorded. After explicit approval, a US Business sandbox account and its `ProofPay USD Sandbox` app were created. Their credentials and merchant ID are stored only in ignored `.env`. The original unpaid fixture is preserved; the new merchant's credentials cannot access the original merchant's order. No real-money transaction was attempted. Webhook ID is still missing.

## First: configure sandbox

1. Open https://developer.paypal.com/dashboard/ and sign in yourself.
2. Under Apps & Credentials select Sandbox. Open an existing REST app, or create one for ProofPay associated with a sandbox business account.
3. Under Testing Tools / Sandbox Accounts identify that business account and a separate Personal buyer account. Use sandbox balances only.
4. Edit the ignored project `.env` locally. Set `PAYPAL_ENV=sandbox`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` and `PAYPAL_MERCHANT_ID`. The merchant ID must belong to the business account associated with the REST app. Do not paste credentials into chat or commit them.
5. Set both `APP_URL` and `NEXTAUTH_URL` to the exact origin used in the browser. `http://localhost:3000` and `http://127.0.0.1:3000` are different origins. Restart the application after changes.
6. For webhook testing, use a reachable HTTPS app origin and register `<origin>/api/v1/paypal-webhook` on the same sandbox REST app. Set its returned identifier as `PAYPAL_WEBHOOK_ID`. See PAYPAL_SANDBOX.md for the event list. Local checkout can be tested before public webhook delivery is configured.

## Actual sandbox test record

Use a fresh small USD milestone, for example $1.00 with zero tip. Keep the buyer and business merchant separate. Record identifiers and observed results below without secrets.

| Check                                           | Expected result                                                      | Evidence / actual result                                                 |
| ----------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Review and accept milestone                     | Accepted; no payment created by acceptance                           | Completed via service workflow on dedicated sandbox fixture              |
| Continue to PayPal sandbox                      | Sandbox checkout opens for correct amount and merchant               | Real corrected order created for $1.00 USD; buyer review displayed $1.00 |
| Cancel checkout                                 | Milestone remains accepted and unpaid                                | Pending                                                                  |
| Resume checkout and approve with Personal buyer | Approval alone does not mark paid                                    | Verified APPROVED at PayPal while local payment stayed PENDING           |
| Explicitly confirm sandbox capture              | Completed capture; milestone becomes paid                            | Verified COMPLETED / PAID via payment service                            |
| Repeat capture / check payment status           | Same logical payment; no second charge                               | Verified PAID with same capture ID                                       |
| Merchant sandbox Activity                       | Amount, currency and capture ID match application                    | Pending                                                                  |
| Actual signed webhook                           | Verified event recorded for this app/payment                         | Pending                                                                  |
| Resend same event                               | Deduplicated; no second charge or state regression                   | Pending                                                                  |
| Missed event reconciliation                     | Check payment status recovers authoritative state                    | Reconciliation returned COMPLETED / PAID without a configured webhook    |
| Invalid signature                               | Rejected without changing payment state                              | Pending                                                                  |
| Declined / pending / timeout cases              | Unpaid or pending until authoritative completion; no blind new order | Pending                                                                  |

Order ID: `3J0610705W951813G`. Capture ID: `8F465400JU890415B`. Webhook event ID: pending. Amount/currency: $1.00 USD. Never substitute a webhook simulator event for a real payment.

The successful local session is recorded in ignored `.data/sandbox-us-session.json`; `.data/sandbox-session.json` preserves the original failed-currency attempt. The companion script accepts `SANDBOX_SESSION_FILE` and supports `status`, `resume`, `cancel` and `capture`; it uses the existing payment service and durable order IDs. Resume the appropriate session rather than generating another payment when approval or capture is uncertain. Fixture accounts have disabled logins and are separate from real users.

## Then: finish the project prototype

1. **Payment evidence:** complete the table above, fix observed failures, and update README/BUILD_STATUS only for checks actually completed.
2. **AI and retrieval:** configure the chosen pretrained provider and embedding provider locally; run `npm run ai:check` and `npm run rag:status`. Upload a fresh requirements document, verify cited criteria and retrieval, and retain a real report. See RAG_VERIFICATION.md. The existing unavailable state is valid until providers are configured.
3. **Repository verification:** exercise an authorized public repository pinned to a commit. Private repositories need explicit mapping. Runtime execution requires an approved isolated runner; until provisioned, disclose that runtime tests are unavailable.
4. **Regression checks:** run typecheck, lint, backend tests, evaluation, production build, browser tests and API smoke checks as documented in README. Use a separate test database for shared deployments. Do not run builds and typecheck concurrently against generated Next.js types.
5. **Hosted demo:** configure the existing Render blueprint with managed PostgreSQL, secrets and one HTTPS origin. Apply migrations, check health and repeat the browser/payment flow on the hosted origin. Review current service costs before provisioning.
6. **Submission package:** prepare a concise problem statement, architecture diagram, screenshots, actual test results, known limitations, source/license and a short demo video using DEMO_SCRIPT.md. Verify the target project's current submission requirements before publishing.

A finished sandbox prototype can explicitly defer optional Elastic/Zapier integrations and runtime execution. Real-user launch additionally needs account recovery, email verification, operator/legal details, retention/deletion, backups, monitoring, and security review. Merchant payment is not escrow or freelancer payout.

## Resources

- Selected AI provider and Render preparation: [AI_RENDER_SETUP.md](AI_RENDER_SETUP.md). Blueprint includes chat/embedding settings, PostgreSQL 17 and current plan identifiers. Validation against Render's current public JSON Schema passed, including corrected string-valued boolean environment settings. Render is connected and My Workspace is confirmed; no existing web service or database was found. A restricted provider key is saved locally, but live tests are blocked by exhausted API credits (HTTP 429, `credit_balance_exhausted` / `insufficient_quota`). No live AI success is claimed.

- PayPal sandbox accounts and testing: https://developer.paypal.com/sandbox-testing/overview
- REST authentication: https://developer.paypal.com/api/rest/authentication/
- Orders v2: https://developer.paypal.com/api/orders/v2
- Webhook delivery and verification: https://developer.paypal.com/api/rest/webhooks/
- Project guides: PAYPAL_SANDBOX.md, RAG_VERIFICATION.md, ARCHITECTURE.md, DEMO_SCRIPT.md and SPONSOR_TOOLS.md in this directory.
