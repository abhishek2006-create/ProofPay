# RAG milestone verification

## Existing application and scope

ProofPay remains the existing Next.js App Router/React/TypeScript application, with Auth.js sessions, PostgreSQL/Prisma, AG Grid, immutable specification versions, private evidence, audit events, and PayPal Orders v2 sandbox checkout. The light-blue workspace and sign-in/sign-out remain. No new application or model training service is required.

The active path is **requirements document → source retrieval → client-edited criteria and bilateral agreement → pinned GitHub submission and/or artifact upload → repository inspection → isolated tests when configured → deterministic weighted score → stored advisory report → client decision → optional tip → separate PayPal sandbox approval/capture**.

Fine-tuning, LoRA scripts, dataset preparation, model comparison, custom-model selection and training UI have been removed. Old `AI_CUSTOM_*` and `AI_VERIFIER_MODE` environment variables have no effect. An ignored local `.venv-training` cache from the previous implementation may remain on disk; the application never imports or invokes it.

## Modules and storage

| Module                                 | Responsibility                                                                                                                                            |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/document-parser.ts`           | PDF page text, DOCX paragraphs and UTF-8 Markdown/TXT lines, bounded parsing and source locations                                                         |
| `src/lib/agents/requirements-agent.ts` | Client-authorized uploads, real provider embeddings, project/milestone-filtered retrieval, exact source-linked AI criterion proposals                     |
| `src/lib/agents/repository-agent.ts`   | GitHub URL validation, private-project authorization, ref resolution, immutable commit/tree and bounded blobs, static structure, optional isolated runner |
| `src/lib/agents/scoring-agent.ts`      | Evidence-driven PASS/PARTIAL/FAIL/UNVERIFIED/BLOCKED and deterministic weighted score                                                                     |
| `src/lib/agents/report-agent.ts`       | Detailed report with provenance, scope, counts, output, missing evidence and human-review limitations                                                     |
| `src/lib/agents/orchestrator.ts`       | Persisted evaluation stages, one active run per milestone, stale-lease recovery, optimistic concurrency and report history                                |

These are coordinated application agents with explicit responsibilities, not autonomous agents with shell access. The model can propose cited criteria and advisory text; it cannot execute tools, alter scores, approve milestones or charge payments.

The additive migration `prisma/migrations/202610290001_rag_agents/migration.sql` adds ProjectDocument, DocumentChunk, EvaluationJob, citation/weight fields, pinned repository metadata, JSON reports, REJECTED and payment base/tip amounts. It backfills existing payment bases and enforces amount = base + tip. PostgreSQL double-precision arrays plus `proofpay_cosine` implement exact vector search, without requiring a pgvector extension. This is appropriate for bounded hackathon projects, not large-scale approximate nearest-neighbor search. Retrieval filters project ownership before similarity calculation. Sources are checked again when criteria are saved. Project documents can be used across its milestones; milestone-specific documents may only ground that milestone's criteria.

## Local setup

Use Node.js 24 (PDF.js requires Node >=22.13 or >=24), npm and PostgreSQL 17. Existing local `.env` values are retained; `.env.example` contains placeholders only.

```powershell
npm install
# First terminal: keep the existing embedded local database running.
npm run db:local
# Second terminal, after copying .env.example to .env if .env does not already exist:
npm run db:migrate
npm run db:generate
$env:ENABLE_DEMO = 'true'
npm run db:seed
Remove-Item Env:ENABLE_DEMO
npm run rag:status
npm run dev
```

Open http://localhost:3000. Seeded demo accounts are client@proofpay.example and freelancer@proofpay.example, password `Demo-Only-Password-2026!`. These are local demonstration accounts; replace them for deployment. Existing setup, Render and sponsor integration documentation still applies. No additional sponsor accounts are required for local document retrieval and artifact checks.

## Environment

| Variable                                                                      | Purpose                                                                                                                                 |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL, APP_URL                          | Existing database/session/public application URLs                                                                                       |
| AI_API_KEY, AI_PRETRAINED_MODEL (or AI_MODEL), AI_BASE_URL                    | Server-only configurable pretrained provider, OpenAI-compatible chat completions; remote HTTPS or local loopback HTTP                   |
| AI_RESPONSE_FORMAT                                                            | `json_schema` default; `json_object` only for compatible providers, still validated server-side                                         |
| EMBEDDING_MODEL                                                               | Actual embedding model identifier; blank disables semantic indexing                                                                     |
| EMBEDDING_API_KEY                                                             | Embedding key, falls back to AI_API_KEY                                                                                                 |
| EMBEDDING_BASE_URL                                                            | Compatible embeddings endpoint base, falls back to AI_BASE_URL then OpenAI v1                                                           |
| GITHUB_TOKEN                                                                  | Optional server-only token for rate limits/private authorized repositories; least-privilege read-only access                            |
| GITHUB_PRIVATE_PROJECT_REPOS_JSON                                             | Explicit operator mapping, e.g. `{"project-id":["owner/repo"]}`; project consent alone never unlocks an operator's private repositories |
| REPOSITORY_RUNNER_URL, REPOSITORY_RUNNER_TOKEN                                | Optional dedicated execution service HTTPS URL and authentication                                                                       |
| RUNNER_SECURITY_APPROVED                                                      | Must explicitly be `true` after reviewing the separate runner's isolation                                                               |
| PAYPAL_ENV                                                                    | Must remain `sandbox`                                                                                                                   |
| PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_MERCHANT_ID, PAYPAL_WEBHOOK_ID | Existing PayPal sandbox configuration                                                                                                   |

Keep credentials in ignored `.env` or deployment secrets, never browser code or chat. Provider model names are intentionally not invented. New uploads are semantically indexed only with working embedding credentials; missing/failing embeddings save readable text with `TEXT_READY_EMBEDDINGS_UNAVAILABLE` and retrieval is explicitly `LEXICAL_FALLBACK`. Existing text-only documents are not silently reindexed after configuration changes: re-upload to index with the new model. Embedding dimensions/model must match at query time. No synthetic vectors or successful AI results are substituted.

## Safe execution service contract

No clone, package install, build, test, subprocess or repository setup command runs on the ProofPay host. GitHub files, READMEs, scripts and setup instructions are untrusted data. Static inspection never proves runtime success. Without a separately deployed and operator-approved isolated runner, reports explicitly show `TEST_EXECUTION_UNAVAILABLE`; SANDBOX_TEST criteria are BLOCKED and no test pass counts are claimed.

An operator may implement a service accepting POST to REPOSITORY_RUNNER_URL with Bearer REPOSITORY_RUNNER_TOKEN. The request body contains `contractVersion:1`, canonical `repositoryUrl`, pinned `commitSha`, agreed suite IDs, and limits `{network:"disabled",timeoutSeconds:90,memoryMb:2048,cpuLimit:2,diskMb:1024}`. It excludes app, PayPal and GitHub credentials and excludes arbitrary setup commands. Private checkout must use the runner's own separately authorized access mechanism; app tokens are never forwarded.

The service must acquire the exact commit in a separate trusted preparation phase, provision dependencies without giving code production secrets, then execute in an ephemeral non-root container/VM with network disabled, read-only source, writable bounded scratch disk, CPU/RAM/time limits, no privileged mode, no Docker/host socket, no host filesystem mounts and no production service access. Resolve agreed suite IDs against an operator-controlled execution policy. Kill the entire process group/container on timeout and destroy the workspace. Merely returning the attestation below does not establish isolation: audit the service implementation before enabling it. The project provides the strict adapter, not a deployed runner or a claim that remote infrastructure is secure.

Example response shape (illustrative protocol, never a live report):

```json
{
  "commitSha": "<40-character pinned commit>",
  "status": "COMPLETED",
  "isolation": {
    "nonRoot": true,
    "network": "disabled",
    "productionSecrets": false,
    "privileged": false,
    "hostSocket": false,
    "sourceReadOnly": true,
    "cpuLimit": 2,
    "memoryMb": 2048,
    "timeoutSeconds": 90,
    "diskMb": 1024
  },
  "commands": [
    {
      "command": "<recorded command>",
      "kind": "test",
      "exitCode": 0,
      "durationMs": 123,
      "stdout": "<actual output>",
      "stderr": ""
    }
  ],
  "suites": [
    { "id": "<agreed suite ID>", "cases": [{ "name": "<actual test name>", "status": "pass" }] }
  ]
}
```

Allowed execution statuses: COMPLETED, SETUP_FAILED, TIMEOUT. Case statuses: pass/fail/skip. Command kinds: test/build/lint/typecheck. Caps: 12 commands, 30 suites, 500 cases/suite, 10KB stdout/stderr per command; response <300KB. Wrong commit, missing isolation, duplicate suites, contradictory failed test exits and all-passing suites, malformed output and timeouts produce SETUP_FAILED without trusted passing cases. Only agreed suite IDs contribute to scores. Known server secrets and bearer values are redacted from recorded command/output. Never put secrets in repository source or test names; arbitrary embedded secrets cannot be detected reliably.

## Scores and report semantics

Each criterion has a positive relative integer weight reviewed before agreement. TEXT_CONTAINS/JSON_VALUE prove only their supplied-artifact assertion. REPO_FILE proves only that exact safe path exists in the pinned GitHub tree. SANDBOX_TEST requires a matching executed agreed suite. MANUAL always remains UNVERIFIED for deterministic scoring. No model-generated score is trusted.

PASS=10, FAIL=0, PARTIAL test-suite score=10 × passed/(passed+failed+skipped). UNVERIFIED/BLOCKED have no criterion score. Overall = sum(weight × earned score)/sum(all weights), rounded to two decimals; unknown weights contribute no earned points and make the score a **provisional lower bound**. Coverage is the percentage of weight with executed/artifact judgments. If all criteria are unknown, overall score is null, displayed as Not scored. Example equal weights with scores 10,5,5,5 yields 6.25/10. The model never fills missing evidence with a guess. Test counts are marked known only after completed runner execution.

Reports persist specification version, submission/commit, document citations, criterion weight/status/evidence, actual test outputs, failures, recommended changes, AI availability and limits. Run history survives revisions. UI progress comes from persisted EvaluationJob events. Evaluations currently execute synchronously in a bounded request; deployments must support its duration. A crashed process may leave a lease until expiry; a subsequent evaluation expires the stale job. This is not a durable distributed worker queue.

## Manual vertical slice and automated checks

1. Client signs in, creates a project with an existing freelancer and uploads TXT/MD/PDF/DOCX requirements with consent. Search and open source chunks. Scanned PDFs require OCR outside the app.
2. Create a milestone. Retrieve passages; use a source as a manual draft or configure the pretrained provider to propose exact cited criteria. Review descriptions, methods, expected paths/suite IDs, weights and sources. Save; both parties confirm the same specification version.
3. Freelancer submits an authorized GitHub HTTPS URL plus branch/tag/SHA and explicit repository consent, optionally evidence files. The server resolves and stores commit/tree before accepting the submission.
4. Either project member runs checks. Observe real stages, repository files/frameworks, missing runner status, score/coverage and report. No provider credentials are required for static inspection, lexical retrieval or artifact checks.
5. Client requests revision, freelancer resubmits and checks again. Old reports remain. Alternatively reject with a reason; rejected milestones cannot create orders. Approve with a rationale to enable separate payment. High scores never approve automatically.
6. For payment, optionally enter a nonnegative two-decimal tip. Confirm server-derived base + tip total before PayPal. The first attempt freezes the tip and amount; retries reuse them. Tampered total/base fields are rejected. Complete buyer approval in PayPal sandbox, then confirm capture/reconcile. Ledger PAID requires validated capture, currency, total, merchant, order and custom reference. Acceptance alone and buyer-return URL alone never mean PAID.

```powershell
npm run typecheck
npm run lint
npm test
npm run build
# With local database and an up-to-date server at localhost:3000:
npm run test:e2e
```

`tests/rag-agents.test.ts` covers real PDF/DOCX/text parsing, score math and unknown scores, URL/secret-path restrictions, mocked pinned GitHub inspection, private-project gating, invalid runner commit, actual PostgreSQL document persistence, tenant isolation, vector cosine retrieval using fixture vectors, report persistence and rejection/payment prohibition. Existing workflow/payment tests use a real local ledger with explicitly mocked external HTTP. They do not certify live AI, GitHub, runner infrastructure or PayPal transactions. See BUILD_STATUS.md for the actual validation results from this change.

## PayPal sandbox setup

Use the official [PayPal Developer dashboard](https://developer.paypal.com/dashboard/) to create a sandbox REST app and business/personal sandbox accounts. Put app client ID/secret and the intended business merchant ID in server `.env`. Configure a reachable HTTPS webhook URL `/api/v1/paypal-webhook`, subscribe to the capture events described in PAYPAL_SANDBOX.md, and store its sandbox webhook ID. Consult the official [PayPal AI Toolkit](https://github.com/paypal/AI-Toolkit) and [Orders integration guide](https://developer.paypal.com/docs/checkout/standard/integrate/); preserve the implemented server-side order/capture checks.

Checkout pays the configured sandbox merchant. ProofPay does not provide escrow, hold freelancer funds, automatically release payouts, or claim a merchant capture is a freelancer payout. No live sandbox buyer approval or capture can be verified until actual sandbox credentials and a buyer account are configured.

## Dependencies, changed files and limits

New runtime dependencies: `mammoth` for DOCX text and `pdfjs-dist` for PDF page text. `jszip` is an explicit development dependency for a real DOCX test fixture. Existing Prisma/PostgreSQL provides vector storage, so no additional vector service registration is needed.

Added: document parser, four agent modules, orchestrator, client API helper, document/grounded-criteria components, evaluation report/progress component, RAG migration, `scripts/rag-status.ts`, `scripts/repository-check.ts`, RAG tests and this guide. Extended: Prisma schema, projects/submissions/validation/AI/payment services, v1 API routes, workspace/types/styles, package/lock/env/config, AI/payment/browser tests, legal/API/OpenAPI/architecture/database/security/README/build-status docs. Removed: training-data/model-evaluation libraries, training-data/compare-models scripts, training tests, Python LoRA trainer/server/smoke tests, Python requirements/environment snapshot and fictional training drafts, plus obsolete MODEL_TRAINING.md.

The removed source paths are `src/lib/training-data.ts`, `src/lib/model-evaluation.ts`, `scripts/training-data.ts`, `scripts/compare-models.ts`, `tests/training.test.ts`, `training/train_lora.py`, `training/serve_model.py`, `training/smoke_test.py`, `training/requirements.txt`, `training/environment-cpu.txt`, `training/examples/review-drafts.jsonl`, and `docs/MODEL_TRAINING.md`. New UI files are `src/components/requirements-documents.tsx` and `src/components/evaluation-report.tsx`; shared request code is `src/lib/client-api.ts`; extended view types are in `src/lib/ui-types.ts`. The executable verification code is covered by `tests/rag-agents.test.ts`, `tests/workflow.test.ts`, `tests/payments-integration.test.ts`, `tests/ai-models.test.ts` and `tests/e2e/workflow.spec.ts`.

Limits: 5MB documents, 120K extracted characters, 50 PDF pages, bounded ZIP expansion, 25 docs/project and 120 chunks/document. No OCR, antivirus certification, automatic reindex worker, durable job queue or deployed sandbox execution service is included. Static inspection reads at most 9 bounded text files and lists at most 3000 safe paths; incomplete trees cannot prove a file absent. Private GitHub access requires explicit per-project operator mapping. Client criteria and human acceptance remain essential. Existing optional Elastic/Zapier integrations are preserved; other sponsor tools remain documented as previously evaluated rather than superficially added to the runtime.
