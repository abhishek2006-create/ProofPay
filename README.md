# ProofPay

**Clear requirements. Verifiable progress. Confident payments.**

A full-stack milestone acceptance workspace for clients and freelance developers. Both parties agree on versioned criteria, the freelancer uploads private evidence, actual artifact checks run, optional AI explains evidence, and the client makes the acceptance decision. A separate backend-controlled PayPal sandbox checkout can then pay the configured merchant.

**This prototype does not provide escrow or freelancer payouts.** It is not an official PayPal product. No real-money environment is enabled.

## What is built

- Responsive light blue landing, sample report, sign-up, sign-in and sign-out.
- Database-backed client and freelancer accounts with service-level project permissions.
- Project creation and member-scoped workspaces; milestones with amount/currency/due dates.
- Versioned draft criteria and explicit agreement by both parties.
- PDF/DOCX/Markdown/TXT requirements, project-scoped semantic retrieval with explicit lexical fallback, and reviewed source-linked weighted criteria.
- Authorized GitHub submissions pinned to a commit, bounded static inspection, isolated-runner adapter and truthful unavailable-test reports.
- Deterministic scores out of ten, persisted evaluation progress, detailed report history, rejection and optional server-validated tips.
- Private text/JSON/PNG evidence uploads, file hashes, submission history and authenticated downloads.
- Executed text and JSON artifact checks, manual-review criteria, traceable AG Grid review rows.
- Configurable AI proposals and evidence-linked review with schema/reference validation and safe unavailable states.
- Client revision requests and acceptance, optimistic concurrency, audit history.
- Sandbox Orders v2 create/approve/capture/reconcile service and verified webhook processing.
- Optional consent-controlled Elastic criteria search and Zapier acceptance-event outbox.
- Postman/Newman collection, Render blueprint, tests and demo fixtures.

**Not verified live:** PayPal, AI provider, Elastic, Zapier and hosted deployment. Credentials were intentionally left as placeholders. The local end-to-end flow is tested through acceptance; payment code is tested using explicitly mocked PayPal responses plus a real PostgreSQL ledger. Do not represent those tests as real sandbox transactions.

## Stack

Next.js 16.4.3 App Router, React 19, strict TypeScript, Tailwind 4, Lucide, Auth.js (next-auth 4.24.15), PostgreSQL 17, Prisma 7.10.1, AG Grid Community 36.2, Vitest, Playwright. Modular monolith with reusable server services. Next.js uses its supported webpack path because Turbopack's CSS worker failed on this Windows environment. Dependencies are locked in package-lock.json.

## Start locally — PowerShell

Requires Node.js 24 and npm, plus PostgreSQL. Commands run from this project folder.

```powershell
npm ci
npm run setup
npm run db:generate
```

Setup creates an ignored `.env` with a random local authentication secret. It preserves any existing `.env`. Never commit that file.

Choose **one** database option. The optional local development launcher works without Docker and persists only under `.data/postgres`:

```powershell
# Terminal 1 — leave running
npm run db:local
```

If this project's database is already running, the launcher verifies it and prints **already running and ready**, then exits successfully. Keep the original database terminal open. A conflicting service or a different PostgreSQL data directory produces a clear error; existing data files are preserved.

Alternatively use `docker compose up -d db`, or configure DATABASE_URL for an existing PostgreSQL instance. Both bundled options use loopback port 5438; do not run them together. The optional embedded launcher uses stable PostgreSQL 17 binaries packaged by a beta-tagged development helper. Use managed/native PostgreSQL for deployment.

```powershell
# Terminal 2
npm run db:migrate
$env:ENABLE_DEMO = 'true'
npm run db:seed
Remove-Item Env:ENABLE_DEMO
npm run dev
```

Open [ProofPay locally](http://localhost:3000). The generated secret and local database are already prepared in this workspace. For a production build use `npm run build`, then `npm start` instead of `npm run dev`.

### Fictional demo accounts

| Role       | Email                       | Password                 |
| ---------- | --------------------------- | ------------------------ |
| Client     | client@proofpay.example     | Demo-Only-Password-2026! |
| Freelancer | freelancer@proofpay.example | Demo-Only-Password-2026! |

These are public, fictional demonstration credentials. Never seed them into a real-user deployment. Use separate browser profiles for the two roles. A new client can also create a project by entering the email of a registered freelancer account.

## Environment variables

The current verification workflow is documented in [RAG_VERIFICATION.md](docs/RAG_VERIFICATION.md). Fine-tuning has been removed; use project-scoped retrieval, pretrained advisory inference, deterministic scoring and human decisions.

Configure ignored `.env`, using `.env.example` as reference. Do not send secrets in chat.

| Variable                               | Purpose                                                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| DATABASE_URL                           | PostgreSQL connection string                                                                                 |
| NEXTAUTH_SECRET                        | Random session secret; generated by npm run setup                                                            |
| NEXTAUTH_URL, APP_URL                  | Same exact app origin; default http://localhost:3000                                                         |
| PAYPAL_ENV                             | Must remain sandbox; production is rejected                                                                  |
| PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET | Sandbox REST app credentials                                                                                 |
| PAYPAL_MERCHANT_ID                     | Recipient merchant for the same sandbox app                                                                  |
| PAYPAL_WEBHOOK_ID                      | Registered webhook identifier for that app                                                                   |
| AI_API_KEY, AI_MODEL                   | Chosen OpenAI-compatible JSON chat provider credentials/model                                                |
| AI_BASE_URL                            | Optional /v1 API base; defaults to https://api.openai.com/v1; selected model must support JSON-object output |
| ELASTIC_URL, ELASTIC_API_KEY           | Optional HTTPS Elasticsearch deployment; least-privilege index key                                           |
| ZAPIER_WEBHOOK_URL                     | Optional https://hooks.zapier.com/hooks/catch/... endpoint                                                   |
| ENABLE_DEMO                            | Explicitly true only when seeding fictional accounts; false for deployment                                   |

The server never sends provider secrets to the browser. Settings reports configured/unconfigured, not a fabricated verified status. No extra sponsor registration is required to run the core application.

## Verify

With the database running:

```powershell
npm run typecheck
npm run lint
npm test
npm run evaluate
npm run build
```

With the built application running on localhost:3000 in another terminal:

```powershell
npx playwright install chromium
npm run test:e2e
npm run test:api
```

The browser suite creates two accounts and exercises project/milestone creation, both-party agreement, incomplete evidence, real failed artifact check, revision, corrected artifact, acceptance, missing-payment-credentials UI, sign-out, access control and 390px responsiveness. Unit/integration tests cover money parsing, evidence integrity, AI injection/reference validation, state permissions, stale revisions, persistent history, mock payment approval/capture and verified webhook deduplication. Use a separate DATABASE_URL for CI tests. Tests insert labeled test data and do not run destructive database resets.

See [BUILD_STATUS.md](BUILD_STATUS.md) for actual results and blockers. The 60-case evaluation is a synthetic **artifact-check evaluation**, not a live AI benchmark or proof of deployed application correctness.

## PayPal setup

Follow [docs/PAYPAL_SANDBOX.md](docs/PAYPAL_SANDBOX.md). Start with the official Developer portal and AI Toolkit, configure the sandbox business merchant and separate personal buyer, register the HTTPS webhook, then exercise actual approval/capture. A client acceptance or a browser redirect never marks a milestone paid. The configured sandbox merchant is the recipient; do not call this escrow or a freelancer payout.

## Sponsor tools

All ten requested tools were evaluated against current official hackathon sponsor pages. AG Grid Community, Postman artifacts and Render deployment configuration are included; Elastic and Zapier have optional server integrations. APIMatic context tooling, Astropods, Bryntum and KERNEL are documented as deferred or access-dependent; Channel3 is excluded because retail product discovery does not serve this workflow. No unimplemented tool is advertised as integrated. See [docs/SPONSOR_TOOLS.md](docs/SPONSOR_TOOLS.md).

## Deploy with Render

Push original source to your repository, connect that repository to Render and review `render.yaml`. It provisions a Node web service and managed PostgreSQL. Review current plans and costs first; no credits or free tier are assumed. Set APP_URL and NEXTAUTH_URL to the resulting HTTPS origin, configure server secrets, keep ENABLE_DEMO=false, and run migrations via the pre-deploy command. Health is `/api/v1/health`. Add optional AI_BASE_URL/Elastic/Zapier variables only when needed.

Deployment is **not performed** without an account/repository connection. Before real users, establish operator/contact details, appropriate terms, account recovery/email verification, retention/deletion and backup policies, security review and operational monitoring. The prototype terms contain explicit unresolved fields rather than invented business details.

## Documentation

- [Architecture](docs/ARCHITECTURE.md), [database](docs/DATABASE.md), [API](docs/API.md), [OpenAPI](docs/openapi.json)
- [Security](docs/SECURITY.md), [legal/privacy](docs/LEGAL_AND_PRIVACY.md)
- [PayPal sandbox](docs/PAYPAL_SANDBOX.md), [AI evaluation](docs/AI_EVALUATION.md), [sponsor evaluation](docs/SPONSOR_TOOLS.md)
- [Demo script and submission handoff](docs/DEMO_SCRIPT.md)

## Limits

Artifact checks validate supplied files, not a live website. Arbitrary external URLs and uploaded code are not executed. Remote browser verification is deferred pending an isolated runner. Agreed scope changes require a new milestone; project editing/deletion and self-service data deletion are not implemented. Payment order expiry replacement, partial refunds, disputes, password recovery, email verification, public hosting, public repository, video and Devpost submission require additional work or account setup. See the explicit operational and live-verification checklist in BUILD_STATUS.

Original source is MIT; third-party packages keep their respective licenses. No proprietary sponsor components or unlicensed visual assets are bundled.
