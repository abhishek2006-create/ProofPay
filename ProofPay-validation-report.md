# ProofPay integration — validation report

Completed locally on 12 November 2026 in `C:\Users\Ankit123\ProofPay`.

## Delivered

- Python GitHub agent: canonical GitHub URLs, project-scoped private access, immutable commit/tree validation, verified blob contents, bounded source inspection and framework detection.
- Authenticated FastAPI resolution, inspection and evaluation endpoints; request size and evaluation concurrency/deadline limits.
- Remote runner v2 integration with fresh request identity, project/repository/commit/tree binding, operator-approved test-bundle digests, command/case consistency checks and fail-closed results. Legacy v1 execution is disabled.
- Evidence-based per-criterion evaluation, weighted scores, coverage and provisional-score rules. Manual and unavailable runtime checks cannot become automatic passes.
- Next.js submission resolution, Python evaluation calls, independent response/score validation, existing report persistence and explicit evaluator provenance. Existing optional AI explanation remains evidence-constrained.
- `npm run dev:python` starts the application and Python service with an ephemeral shared token and an authenticated readiness check.
- Existing frontend, requirements extraction/RAG source, project workflows and payment code preserved. No submitted repository was executed on this host.

## Verified

| Check | Result |
| --- | --- |
| Python service/security tests | 38 passed, including API authentication, bounds, GitHub pin/blob integrity, private scope, runner replay/bundle/command rejection, scoring and failure paths |
| Application and integration tests | 77 passed across 11 files, run from the original project |
| Real Next.js backend → Python → PostgreSQL | Passed; persisted a Python-generated provisional report and created no payment |
| Browser workflow | Account creation, project/agreement, evidence, Python verification, revision, acceptance, sign-out and access boundaries passed |
| Browser model-settings test | Passed after adding its required fictional account to the disposable test database |
| TypeScript validation and lint | Passed |
| Production build | Passed directly in the original ProofPay folder |
| Applied source verification | All 25 changed/added source files matched the reviewed working copy |

The browser run initially had 2 passes and 1 failure because its existing demo account had not been seeded in the new test database. After seeding that disposable database, the remaining test passed. Earlier restricted-environment runs were unable to use loopback/process/temp-file facilities; successful validation used the required local process access. No application failures remain from those attempts.

Warnings: the test client emits an HTTPX deprecation notice; Vitest reports a future configuration-loader compatibility notice; dependency installation reports existing deprecated development packages. These did not block validation. No new dependency-security audit or live payment transaction was performed.

## Local app and restart

The app was started at **http://localhost:3000**, with the private Python service on loopback port 8001 and local PostgreSQL on port 5438. The combined command verified the authenticated Python connection before starting Next.js. The original project had no root `.env`; its existing setup script created one with a random local authentication secret. Its existing migrations were applied to a newly created local development database. No demo users were added to this original-project database; create an account through the app.

To restart, from the ProofPay folder:

```powershell
# Terminal 1
npm run db:local

# Terminal 2
npm run dev:python
```

Dependencies are installed in the original project. The new Python environment is `ai-service\.venv`; the older `.venv`, Python `.env`, and stored RAG data were preserved. Existing-file backups are retained in this chat's work folder. No commit or push was made.

## Still external or unverified

1. **Live isolated execution:** the old TypeScript code contains only a remote runner adapter. No runner URL, token, security approval or trusted test-bundle registry was configured. An external runner must be provisioned/audited and connected before runtime tests can earn points. No isolation claim is based solely on returned JSON.
2. **Live GitHub/private access:** GitHub behavior was tested with deterministic API fixtures, including real blob-hash verification. A live repository submission/private credential was not exercised.
3. **AI and RAG providers:** existing Python requirements extraction remains intact; its prior Gemini/LangChain/Chroma scripts and live model calls were not revalidated. The new service evaluates deterministically, while the existing Next.js AI reviewer remains optional. Root app AI settings are unconfigured.
4. **PayPal:** payment logic and regression tests were preserved and passed with mocked provider calls. Live sandbox checkout/capture was not run; root app PayPal settings are unconfigured.
5. **Production operation:** evaluations are bounded synchronous requests, not durable background jobs. Deployment needs adequate request timeouts, private authenticated ingress, rate/idle limits and an audited runner. Static inspection covers only bounded safe files; a score does not prove complete functional or security correctness.

See `ProofPay-setup-and-limitations.md` for endpoint schemas, runner requirements and deployment setup. The same setup document is saved in the project at `ai-service/README.md`.
