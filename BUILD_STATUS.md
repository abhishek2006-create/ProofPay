# ProofPay RAG update - 2026-10-29

## Local database launcher fix - 2026-10-29

Repeated `npm run db:local` now verifies and reuses the existing cluster on port 5438 rather than trying to spawn a second PostgreSQL process. It checks the actual data directory and application-database readiness, does not take ownership of an existing server, and reports native startup diagnostics even when the embedded library rejects without an Error. Database paths resolve relative to the launcher, and existing files are preserved on failure. Verified against the already-running development database and three targeted regression tests, including a fresh temporary cluster, repeated launches with persistent test data, foreign-service/directory rejection and undefined native errors. Typecheck and lint passed. The original development database was not stopped or reset.

## Signed-in visual refresh - 2026-10-29

The dashboard now has a personalized light-blue overview, readable metrics, clearer project progress cards and collaborator initials. Navigation, spacing, form controls, document uploads, settings and milestone panels share the updated design. Mobile uses a labeled bottom navigation bar and an accessible header sign-out button. Completed evaluation activity and report metadata are expandable; failures and active evaluations stay open. Criteria retain their actual scores, weights and evidence. The public landing page and backend/payment logic are unchanged.

Verified: typecheck, ESLint and production build passed; all 3 existing Chromium workflows passed against the new interface. Dashboard/project/report screenshots at 1440px and 390px and mobile settings were checked for horizontal overflow and visually inspected. `scripts/preview-workspace.ts` regenerates these local fixture-account previews under `.data/previews/workspace`. PLAYWRIGHT_BASE_URL can select a separate preview origin. The refreshed production preview is on http://localhost:3001; the user's port-3000 process was not stopped. A port-3000 server started before this build needs a normal terminal restart to load the new build.

The latest user specification replaces the earlier LoRA/fine-tuning work. The active implementation is RAG with coordinated requirements, repository, deterministic scoring and report agents. No model training or custom-model routing remains active. See [the implementation and operations guide](docs/RAG_VERIFICATION.md) for architecture, file changes, dependencies, environment variables, migration, local setup, isolated runner protocol, PayPal setup and end-to-end steps.

## Implemented

- Existing Next.js/React/TypeScript, Auth.js sign-up/sign-in/sign-out, light-blue UI, PostgreSQL/Prisma, AG Grid and existing project/payment permissions preserved.
- Client PDF/DOCX/MD/TXT document uploads, source locations and chunks, real provider embedding adapter, project-filtered PostgreSQL cosine vector retrieval, explicit lexical fallback when embeddings are unavailable.
- Exact cited criterion proposals from a configurable pretrained provider, client editing of methods/weights/sources, and bilateral version agreement. Unsupported citations are rejected.
- Authorized GitHub HTTPS submissions with ref resolved to immutable commit and tree; bounded static file inspection and stack/test discovery. Private access requires explicit project mapping. Sensitive paths and symlinks are excluded.
- Dedicated isolated-runner adapter with resource/isolation attestations and exact-commit validation. No repository code executes on the application host. No approved service is currently configured, so runtime tests are explicitly unavailable.
- Evidence-based PASS/PARTIAL/FAIL/UNVERIFIED/BLOCKED judgments; deterministic weighted score /10, coverage and provisional lower-bound policy; all-unknown work remains unscored.
- Persisted stages, concurrent-run guard, stale leases, report history, test output and uncertainty. Client revisions, rejection and acceptance with reasons.
- Optional nonnegative tip, server-derived frozen base/tip/total, existing sandbox buyer approval and verified capture flow. Acceptance and scores never charge payments. Merchant capture is not escrow or freelancer payout.
- Removed training libraries, dataset/comparison scripts, Python trainer/server/test/dependency sources and old training guide. Ignored local training cache is inert.

## Verified in this change

- Database migration `202610290001_rag_agents` applied to the existing local PostgreSQL database; both migrations are up to date.
- 62 backend tests across 8 files passed. This includes real PDF/DOCX/text parsing; score math and unknown/blocked states; mocked GitHub and runner boundaries; real PostgreSQL upload, membership, vector retrieval, report persistence, rejection and no payment; existing revision/acceptance workflows; immutable tip totals, capture idempotency and webhook handling with mocked PayPal HTTP.
- Production build passed; standalone typecheck passed after build (an earlier concurrent typecheck raced generated Next.js types and was rerun).
- ESLint passed without warnings after cleanup.
- Production dependency audit reports zero vulnerabilities. Development-only advisories remain in the existing test/development dependency tree; no force/breaking upgrades were applied.
- Real read-only GitHub check on the official PayPal AI Toolkit: commit `1401791aca82568525bd60aa40aaeb3e9a9615d0`, tree `0f94e5cb1c40e874d0616bfb4b60bfed47f79b58`, 47 safe paths listed, README.md/package.json read; no code executed. Reproduce with `npx tsx scripts/repository-check.ts https://github.com/paypal/AI-Toolkit HEAD` (HEAD may resolve differently later).

- All 3 Chromium browser tests passed against the final production preview: real account registration/sign-in, requirements upload and lexical search, agreement, failed evidence, revision/resubmission, report and history, acceptance, truthful disabled PayPal checkout, mobile layout without horizontal overflow, sign-out, access boundaries and placeholder model settings. Desktop/mobile report screenshots were produced in test-results and visually inspected.
- The existing trusted Postman/Newman smoke collection passed all 5 requests and 6 assertions (health, authentication, anonymous identity, Origin enforcement, unsigned-webhook rejection). These are local API checks, not PayPal transactions.
- Final production preview is running at http://localhost:3000 with local PostgreSQL on port 5438. Both are local processes that must remain running while using the preview.

## Current configuration and limits

`npm run rag:status` confirms no pretrained model/key, embeddings, authenticated GitHub token or approved runner is configured. PayPal, Elastic and Zapier credentials remain placeholders. The public GitHub check needed no token.

Not verified live: pretrained inference, embedding provider calls, private GitHub access, remote isolated execution, PayPal sandbox buyer approval/capture, Elastic, Zapier, Render hosting. HTTP fixture tests are clearly separate from live provider operations. The vector test uses fixture vectors stored and queried in a real database, not a claim that an embedding provider ran.

No OCR, large-scale vector index, durable background queue, deployed execution infrastructure or freelancer payout is included. Requests are bounded but synchronous. Re-upload text-only documents after configuring embeddings. Use an audited isolated service before setting RUNNER_SECURITY_APPROVED=true. The app never invokes user repository scripts locally.

Run locally with PostgreSQL available: `npm install`, `npm run db:migrate`, `npm run db:generate`, then `npm run dev`. New installs should first run `npm run setup`; use `npm run db:local` in another terminal if needed. Demo seeding requires explicit ENABLE_DEMO=true. Open http://localhost:3000.
