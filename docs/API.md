# API

## RAG verification additions

- `POST /api/v1/projects/:id/documents`: client-only multipart `document`, `consent=true`, optional `milestoneId`; PDF/DOCX/MD/TXT up to 5MB. Returns stored document metadata and indexing availability.
- `GET /api/v1/documents/:id`: member-only parsed source chunks, never embedding vectors or raw credentials.
- `GET /api/v1/projects/:id/requirements?q=...&milestoneId=...`: member-only retrieval with explicit SEMANTIC/LEXICAL_FALLBACK mode and source references.
- `POST /api/v1/projects/:id/extract-criteria`: client-only `{query,milestoneId?,consent:true}`. Exact-cited draft proposals; nothing is agreed automatically.
- Criteria now accept `weight` (positive relative integer, default 1), `sourceChunkId`, `sourceQuote`, and methods REPO_FILE (expected exact path) or SANDBOX_TEST (expected agreed suite ID), alongside existing methods.
- Existing multipart submission adds `repositoryUrl`, `repositoryRef`, `repositoryConsent=true`, `setupInstructions`; files may be omitted for repository submissions. Server resolves and stores commit/tree SHA.
- `POST /api/v1/milestones/:id/verify` runs the coordinated evaluation; `GET /api/v1/milestones/:id/evaluation` returns real persisted latest progress. Verification runs now contain detailed JSON `report`.
- Existing decision accepts REJECTED with a mandatory reason, alongside ACCEPTED/REVISION_REQUESTED.
- Existing order endpoint accepts only `{tip:"0.00"}` (optional, default zero). Backend derives base + tip, freezes checkout, and rejects client-supplied amount fields. Acceptance and verified PayPal buyer approval/capture remain required.

All routes retain session authentication, membership, mutation Origin checks and existing throttling. See RAG_VERIFICATION.md for setup, scoring policy and the optional isolated runner contract.

Base /api/v1. Cookie-authenticated mutation requests require Origin equal to APP_URL. JSON bodies are bounded to 200 KB. Evidence uploads require a declared Content-Length below 12 MB; each file is limited to 1 MB. Strict Zod request schemas reject extra money or identity fields. Ownership is checked using the current database account.

Settings now includes safe `aiModel` metadata (active pretrained model/mode, prompt version and missing-configuration reason), never provider keys. `POST /ai/diagnostic` with `{confirm:true}` is authenticated, origin-checked and limited to three calls per minute per account. It runs one fictional missing-evidence case, can incur an inference charge and does not establish overall model quality. Model configuration is operator-only; no model training or promotion endpoints exist.

| Method    | Route                         | Purpose                                                                           |
| --------- | ----------------------------- | --------------------------------------------------------------------------------- |
| GET       | /health                       | Database readiness; 503 when unavailable                                          |
| POST      | /register                     | name, email, password (12–128 chars), role CLIENT/FREELANCER                      |
| GET       | /me                           | Public session identity or null; no password hashes                               |
| GET/PATCH | /settings                     | Safe credential-availability booleans / optional sharing preferences              |
| GET/POST  | /projects                     | Member-scoped list / client creation with registered freelancerEmail              |
| GET       | /projects/:id                 | Member-scoped complete workspace, excludes evidence bytes                         |
| POST      | /projects/:id/milestones      | title, description, amount string, currency, dueDate, requirements                |
| PATCH     | /milestones/:id/specification | DRAFT-only next version, requires current revision                                |
| POST      | /milestones/:id/agree         | revision and confirm:true; records current party agreement                        |
| POST      | /milestones/:id/submit        | Multipart notes, revision, files and matching requirementIds                      |
| POST      | /milestones/:id/verify        | Runs deterministic checks and optional AI explanation                             |
| POST      | /milestones/:id/decision      | decision ACCEPTED/REVISION_REQUESTED, comment, revision, confirm:true             |
| POST      | /milestones/:id/order         | Client creates/resumes server-priced sandbox order                                |
| POST      | /milestones/:id/capture       | Client explicitly captures approved server-recorded order                         |
| POST      | /milestones/:id/reconcile     | Member checks actual PayPal order/capture state                                   |
| POST      | /milestones/:id/cancel        | Client records local cancellation after PayPal check; cannot cancel approved/paid |
| POST      | /paypal-webhook               | External PayPal event; signature verified before trust or dedup                   |
| GET       | /evidence/:id                 | Private download with attachment and no-store headers                             |
| POST      | /ai/criteria                  | description and consent:true; JSON constrained result, no payment capabilities    |
| POST      | /projects/:id/index           | Client triggers Elastic indexing after both members consent                       |
| GET       | /search?q=                    | Elastic results filtered to authorized, currently consenting projects             |
| POST      | /projects/:id/notify          | Client explicitly dispatches opted-in Zapier outbox events                        |

Auth.js routes under /api/auth implement sign-in, session, CSRF and sign-out. Errors are {error:string}; unauthorized is 401, cross-project resources return 404, role violations 403, stale/invalid transitions 409, unavailable integrations 503. Provider secrets, stack traces and raw payment credentials are not returned.

docs/openapi.json is a portable API contract for core operations. It is handwritten and not an APIMatic-generated SDK. docs/postman.json can run against a live local server through npm run test:api. Sandbox payment scenarios are separately documented and require real sandbox credentials and buyer approval.
