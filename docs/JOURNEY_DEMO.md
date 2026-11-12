# ProofPay: client-to-payment demonstration

Demonstrated 10 November 2026 with separate fictional client and freelancer sessions.

Client preview: http://localhost:3001. Freelancer preview: http://127.0.0.1:3002. Separate hostnames keep their sign-in cookies independent. Both use the same local database. These previews require the application and PostgreSQL processes to remain running.

## Walkthrough

1. **Client and freelancer accounts:** Alex Client Demo commissions the work; Jamie Freelancer Demo delivers it. The client creates `Client to Freelancer — Complete Demo`, adding the registered freelancer by email.
2. **Shared agreement:** The client defines `Repository handoff and review`, $1.00 USD, due 12 November 2026. Specification v1 requires README.md and package.json to exist in the submitted repository. Both roles review and confirm the same specification. This is the prototype's bilateral scope agreement, not an escrow or dispute-resolution contract.
3. **GitHub delivery:** The freelancer submits https://github.com/abhishek2006-create/ProofPay with ref `codex/proofpay-sandbox-render`, setup notes and explicit repository/AI inspection consent. It resolves to immutable commit `d5c870a94ba27fe772fa2dc25f567e80dab2d0c6`.
4. **Verification:** The repository agent inspects the pinned tree and bounded text files. Deterministic file-presence checks pass for both agreed paths. Scoring records 10.00/10 for those checks. Runtime execution is explicitly unavailable because no approved isolated runner is configured. File presence does not prove a working application, security, deployed behavior, or all source-code correctness.
5. **Real AI review:** Groq's `openai/gpt-oss-20b` returns `All static file checks satisfied in pinned repository.` Application validation accepts the schema and evidence references. The report displays the served model and pinned evidence. AI receives at most nine file excerpts of 800 characters each; the full bounded inspection remains in the stored deterministic report. Earlier failed/unavailable runs remain visible in report history.
6. **Client decision:** The client inspects the report and limitations, then accepts with a rationale. Request revisions and rejection are also available before acceptance. Acceptance does not charge money.
7. **Payment suggestion:** The accepted milestone exposes checkout for the agreed $1.00, plus an optional explicit tip. AI does not set a new amount, accept work, or initiate payment. The backend freezes the agreed base and tip when checkout starts.
8. **PayPal buyer approval:** Client checkout created sandbox order `6BR5024492752110B`. The user signed into the sandbox Personal buyer account and approved. On return, ProofPay still showed Pending and required explicit capture.
9. **Capture:** The client invoked Confirm sandbox capture and the user confirmed its browser dialog. Authoritative PayPal validation recorded PAID, capture `9YR14921FB361651G`. The client view displayed Payment confirmed / Paid with the order and capture references. The freelancer's Payments page independently displayed the same $1.00 milestone as Paid. Check payment status reconciles from PayPal instead of trusting the redirect.

## Demonstration references

- Project: `cmw9owkaz0001tstnykmcoybu`
- Milestone: `cmw9oxilp0003tstnog0gqo4j`
- Payment: `c193eedf-aa66-4749-a2d9-9d3ce46885f9`
- PayPal order: `6BR5024492752110B`
- Capture: `9YR14921FB361651G` — PAID, $1.00 USD
- Actual webhook delivery: not configured; not claimed.

The configured US sandbox merchant receives the sandbox payment. The freelancer account does not receive a payout, and ProofPay does not hold escrow funds.

## Issues found and fixed during the demonstration

- The existing Windows local database used WIN1252. Unicode repository report text caused PostgreSQL 22P05. Copied all 202 existing application records across 17 tables into `proofpay_utf8_20261110`, verified table counts, and switched only after success. The original `proofpay` database remains preserved. Ignored `.data/provider-before-utf8.env` preserves the previous connection configuration. New local clusters/databases now explicitly use UTF8; a regression test stores arrows, checkmarks and Hindi text.
- The full repository AI prompt exceeded this Groq account's 8,000 TPM request allowance (provider returned HTTP 413). Limited AI repository context to explicit excerpts, preserving the immutable references and full deterministic inspection. A real Groq request then returned HTTP 200 with validated evidence references.
- All 70 backend tests and the production build passed after these fixes. These fixes do not establish runtime verification of submitted repositories.
