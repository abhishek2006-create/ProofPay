# Security and limitations

## Dependency audit on 2026-10-28

The production-only audit (`npm audit --omit=dev --audit-level=high`) reports zero vulnerabilities after pinning transitive Lodash to patched 4.18.1. The full audit still reports 17 development-tool advisories (6 moderate, 10 high, 1 critical), originating in the Newman/Postman execution dependency tree. Newman is development-only, runs only the repository's trusted collection, and is not imported by the application. Do not execute untrusted collections. Before using this toolchain for broader workloads, update or replace the runner and revalidate its behavior. No claim of an entirely vulnerability-free development dependency graph is made.

## Implemented boundaries

- bcrypt password hashing with cost 12; HTTP-only Auth.js session cookies, production secure-cookie behavior, eight-hour signed sessions; database identity and session-version revalidation.
- Role and project membership checks at service boundaries. Freelancer cannot accept work. Client cannot impersonate freelancer submissions. Evidence downloads require the same project membership.
- Cookie-authenticated mutations require exact Origin match. Auth.js handles its own CSRF tokens for authentication. No permissive CORS configuration.
- Strict Zod inputs, bounded JSON parsing, safe filenames, file-size/MIME validation and PNG signatures; JSON/text are validated as content. Uploaded text is rendered escaped by React, never as HTML. Evidence is downloaded as attachment with nosniff and no-store.
- No arbitrary URL fetching or submitted code execution on the application host. GitHub access uses fixed api.github.com endpoints and canonical HTTPS repository URLs, pinned commits, bounded non-secret text files, no symlinks, and project-specific private-repository authorization. Optional execution is delegated only to an operator-reviewed isolated service; without it test execution is explicitly unavailable. Configured provider endpoints and fixed sandbox PayPal APIs are also used.
- AI receives untrusted notes, retrieved requirement passages and authorized bounded repository excerpts as data, has no financial tools, must cover real criterion/evidence references, and cannot upgrade deterministic failures/missing evidence to passed. Raw uploaded evidence bytes are not sent to AI. Document extraction requires client consent; citations must quote this project's source and applicable milestone exactly. Inference consent never authorizes training.
- Integer minor units, supported currencies, backend-only price and merchant, durable unique payment record, stable create/capture request IDs, bounded backoff, verified webhook signatures, monotonic payment reconciliation.
- Database-backed atomic rate limits for sign-in/account creation, user mutations, AI, checks and payment initiation. Secrets remain in ignored .env or deployment environment variables. No secrets in the collection or seed.
- CSP, frame denial, nosniff, referrer and permissions policies; optional sharing is off by default. Elastic search applies membership filters in the query and verifies returned project IDs. No cross-tenant global search.

## Known limits before real-user production

This is a tested prototype, not a compliance certification. It needs verified email and password recovery or a configured managed identity provider, security review, incident/support contacts, operational monitoring, automated retention/deletion, backup restore verification and a dependency audit. There is no self-service password reset, email verification, invitations by email, dispute resolution or marketplace seller payout.

CSP permits inline scripts/styles needed by Next.js and development eval; a nonce-based production CSP should replace unsafe-eval before deployment to real users. HTTPS termination and request-body/time limits must be configured on the host. Auth throttling by account can temporarily lock a targeted address and is not a complete anti-bot system. API registration also has a conservative global cap suitable only for the prototype.

External calls are synchronous and bounded. PayPal webhook processing is inline, so a provider timeout causes a non-2xx retry rather than falsely acknowledging an unprocessed event; move verified events to a durable worker before high-volume use. Zapier dispatch is explicit and limited to three attempts; exactly-once delivery requires receiver deduplication using eventId. Refund support is limited to reconciliation when the event can be mapped to a known order/capture; partial refunds and disputes need a broader payment ledger. Tests mock payment APIs and do not replace live sandbox validation.

Rate-limit rows and test fixtures are not automatically purged. Evidence storage is database-backed; introducing external storage requires signed access URLs and a migration plan. No filesystem paths or storage credentials are accepted from the browser.
