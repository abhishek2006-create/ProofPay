# ProofPay Python verification service

This service implements immutable GitHub inspection, remote runner integration, deterministic evidence evaluation and scoring. Next.js retains authentication, project authorization, agreed requirements, artifact integrity checks, database transactions, report presentation, AI explanation and payments. Existing Python requirements/RAG files are preserved and are not imported at service startup.

## Local setup

From the ProofPay root, using Python 3.11 or newer:

```powershell
python -m venv ai-service/.venv
ai-service/.venv/Scripts/python.exe -m pip install -r ai-service/requirements-dev.txt
npm ci
npm run db:generate
# Configure the existing database/auth settings as described in the root README.
npm run dev:python
```

On macOS/Linux the environment executable is `ai-service/.venv/bin/python`. `PROOFPAY_PYTHON_EXECUTABLE` overrides discovery. `dev:python` starts both services, generates a fresh shared token in memory, checks the authenticated connection, and shuts down both when stopped. It passes only OS essentials and explicitly permitted GitHub/runner settings into Python; database and payment credentials stay in Next.js. It reads runner settings from `ai-service/.env` or the process environment. It never starts a repository runner.

For separately managed services, set the same random `AI_SERVICE_TOKEN` (at least 32 characters) on both, and `AI_SERVICE_URL=http://127.0.0.1:8001` on Next.js. Start `python -m uvicorn app.main:app --host 127.0.0.1 --port 8001` from this directory. The service itself does not load `.env` implicitly. Use HTTPS for every non-loopback connection, an internal ingress, request rate/body/idle limits, and a process manager in deployment. Do not expose the shared service token to browser clients. Leave both Next.js service variables unset to use the existing TypeScript static/artifact evaluator. A configured but unavailable Python service fails the evaluation job; it never silently switches engines.

## API contract

All POST endpoints require `Authorization: Bearer <AI_SERVICE_TOKEN>`. Only the trusted Next.js backend may call them. `projectId` is a scope supplied after Next.js user authorization, not a substitute for user authorization. The service does not accept a public callback or freelancer-supplied test results.

| Endpoint                        | Input                                                                                                                     | Result                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `GET /health`                   | None                                                                                                                      | Liveness and contract version; not external dependency readiness                             |
| `POST /v1/repositories/resolve` | `projectId`, `repositoryUrl`, `repositoryRef`                                                                             | Canonical GitHub URL, immutable commit and tree                                              |
| `POST /v1/repositories/inspect` | `projectId`, `submission` with URL/commit/tree (or empty for no repository)                                               | Bounded safe paths, verified text blobs, languages, frameworks, scripts as data, limitations |
| `POST /v1/evaluations`          | `requestId`, `projectId`, `submissionId`, `specificationVersion`, `submission`, `requirements`, trusted artifact `checks` | Request-bound repository, tests, requirement-by-requirement scoring and limitations          |

Schemas live in `app/schemas/verification.py`; `/openapi.json` describes them. Unknown fields, inconsistent IDs/methods, missing pins and oversized requests are rejected. Next.js independently validates report identity, evidence references and score arithmetic before saving a report against the current submission/revision. Reports never initiate payment.

## Inspection and evaluation rules

- HTTPS GitHub owner/repository URLs only. No caller-controlled API hosts, redirects, cloning, shell commands, imports, dependency installation or local execution of submissions.
- Private repositories require explicit `GITHUB_PRIVATE_PROJECT_REPOS_JSON={"project-id":["owner/repo"]}` authorization. Use a least-privilege read-only GitHub credential; authorization is rechecked during evaluation.
- The commit is resolved again to verify its tree. Blob SHA-1, size and encoding must match. Symlinks, submodules, secret-like paths and build/dependency directories are excluded.
- At most 3,000 safe paths, 12 small text files, 16,000 characters per file and bounded HTTP responses are inspected. Truncation and excluded paths cannot prove absence. A file-presence pass proves only the agreed file exists.
- `TEXT_CONTAINS`/`JSON_VALUE` accept integrity-checked artifact results from the authenticated backend. `MANUAL` always remains unverified. `SANDBOX_TEST` needs a matching approved runtime suite. Skipped tests earn no points; all-skipped suites remain unverified. Failures cannot become passes through AI prose.
- The score uses the agreed integer weights and reports verified-weight coverage. Unknown weight earns no points, so incomplete scores are provisional lower bounds; all-unknown evaluations have no numeric score. Extracted optional/preferred requirements retain their existing extraction metadata; the client must choose which criteria and weights to agree. This service never silently changes the agreed baseline.
- Existing Next.js AI review remains optional and can explain the available evidence. It cannot upgrade an unsupported result. No new Gemini call or model training is required for deterministic evaluation. General semantic implementation review and arbitrary browser behavior are not automatically proven.

## Secure runner integration (contract v2)

The runner is an external infrastructure dependency, **not a subprocess/container on the application host**. No live runner is bundled or provisioned. Before enabling one, the operator must audit its isolation and control plane. Set:

```text
REPOSITORY_RUNNER_URL=https://your-trusted-runner.example/v2/run
REPOSITORY_RUNNER_TOKEN=<runner-control-plane-token>
RUNNER_SECURITY_APPROVED=true
RUNNER_TRUSTED_SUITES_JSON={"project-id":{"agreed-suite-id":"sha256:<64 lowercase hex digits>"}}
```

The endpoint receives `contractVersion: 2`, a fresh cryptographic `requestId`, `projectId`, canonical `repositoryUrl`, `commitSha`, `treeSha`, requested suite IDs, immutable `suiteDigests` and limits. It receives no application/payment/GitHub credential and no arbitrary command from the submission. Private repository source delivery must be independently configured at the trusted runner control plane.

The trusted runner must fetch the exact source and operator-owned test bundle outside the guest, prepare dependencies separately, and execute in a disposable VM/microVM (or equivalently audited isolation) on a dedicated host. The guest must have no network, production credentials, host socket, privileged access or writable source mount; run non-root with CPU <= 2, memory <= 2048 MB, disk <= 1024 MB and wall time <= 90 seconds. Provide bounded writable scratch space separately. Enforce process/output/disk limits, destroy the guest after each run, and do not let repository code write the trusted result envelope. Commands and logs from guest stdout alone are not authoritative test results. The approved harness/control plane must own case enumeration, status and bundle digests.

Responses must echo all five identity fields, `contractVersion: 2`, `status`, `isolation`, commands and suites defined by `RunnerReport`. Each suite includes its approved digest and `commandIndex`; cases have unique names and `pass`/`fail`/`skip` statuses. The service rejects replayed identities, different commits/trees, unknown bundles/suites, contradictory command results and unsafe isolation declarations. These declarations validate the contract, **not independently attest to infrastructure security**. TLS and the operator-approved control plane remain trust boundaries.

Legacy runner v1 is disabled because it lacked request and test-bundle binding. Upgrade to the Python v2 path. Missing configuration produces `TEST_EXECUTION_UNAVAILABLE`; malformed/unavailable runner results produce `SETUP_FAILED`; neither earns runtime points.

## Tests and operational limitations

```powershell
# From ai-service:
.venv/Scripts/python.exe -m pytest tests/test_verification_service.py -q
# From root:
npm test
npm run typecheck
npm run lint
npm run build
```

`tests/python-workflow.test.ts` uses a real Python process and database when `DATABASE_URL`, `PROOFPAY_TEST_PYTHON_URL` and `PROOFPAY_TEST_PYTHON_TOKEN` are set. Use a disposable test database. The older `ai-service/tests/test_*` RAG scripts require their existing LangChain/Chroma/Gemini dependencies, API credentials and data; they are not part of the new offline service suite.

The API performs bounded synchronous evaluations (145-second deadline, four concurrent evaluations per process). It is not a durable queue. Deploy Next.js with a request budget sufficient for the service plus optional AI review; short-timeout serverless hosts need a separate durable worker. Existing evaluation leases and optimistic revision checks prevent stale reports replacing changed milestones but are not a replacement for a durable job queue. Reverse proxies must enforce idle timeouts and concurrency for inspection endpoints. GitHub limits, incomplete trees, missing dependencies/test bundles, unavailable models and inaccessible private repositories remain visible limitations.

References: [GitHub tree API](https://docs.github.com/en/rest/git/trees), [GitHub blob API](https://docs.github.com/en/rest/git/blobs), [FastAPI security dependencies](https://fastapi.tiangolo.com/reference/security/).
