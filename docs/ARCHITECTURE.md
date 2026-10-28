# Architecture

ProofPay is a Next.js App Router modular monolith, using React, strict TypeScript, Tailwind and a custom light blue design system. API handlers call reusable server services. PostgreSQL stores all records and private evidence bytes; Prisma uses the PostgreSQL driver adapter. Auth.js credentials sessions are signed JWTs in HTTP-only cookies, checked against database identity on every protected request.

| Layer          | Implementation                                                                                                                         |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Public UI      | Landing, sample review, sign-up, sign-in, terms/privacy                                                                                |
| Workspace      | Client/freelancer projects, filters, milestones, version history, agreements, uploads, review, decisions, payments, audit and settings |
| Authorization  | Project membership and client/freelancer checks in services, never UI-only                                                             |
| Verification   | Actual text comparison, JSON top-level value comparison and file hash verification; manual criteria remain needs_review                |
| AI             | Server-side OpenAI-compatible JSON chat-completion interface; Zod validation and evidence-reference cross-checks; no financial tools   |
| Payment        | Sandbox-only REST Orders v2 redirect approval, explicit server capture, authoritative GET reconciliation, verified webhooks            |
| Optional tools | AG Grid Community; Elastic consent-filtered criteria search; durable Zapier acceptance outbox; Postman collection; Render blueprint    |

## State and concurrency

The current verification path uses coordinated modules in `src/lib/agents`: requirements retrieval and cited draft extraction, pinned GitHub inspection and optional isolated execution, deterministic weighted scoring, and stored reports. `orchestrator.ts` persists real stage events with a unique active job and expiry lease. PostgreSQL stores source chunks and bounded vector arrays and performs exact project-filtered cosine retrieval. See [RAG_VERIFICATION.md](RAG_VERIFICATION.md) for contracts and limitations. This replaces all earlier training/custom-model flows.

Milestones: DRAFT → AGREED (both parties confirm the same version) → SUBMITTED → UNDER_REVIEW → ACCEPTED, REVISION_REQUESTED or REJECTED. Revised evidence returns through SUBMITTED and UNDER_REVIEW. REJECTED is terminal and cannot be paid. ACCEPTED is retained when checkout fails or is cancelled. Checkout freezes the backend-derived agreed base plus optional nonnegative tip.

Payments are separate: CREATED, PENDING, PAID, FAILED, CANCELLED, REFUNDED. The server derives amount and recipient from a durable payment record. Optimistic milestone revision checks prevent duplicate or stale transitions. A unique payment per milestone, stable PayPal request IDs, and a short capture lease prevent duplicate logical captures. Responses and webhooks reconcile through PayPal, and late failure events cannot overwrite PAID or REFUNDED. Unresolved order creation older than five hours requires operator review rather than unsafe retry past the default idempotency window. Expired-order replacement is intentionally not automatic.

Evidence, checks, AI observations and human decisions are stored separately and linked through IDs and specification versions: the Acceptance Evidence Graph is implemented as relational links plus a drill-down review table, rather than an ornamental graph graphic.

## Deployment

Use a Node web service with PostgreSQL, not a static export. Render blueprint includes migrations before start and database health checks. All external account credentials remain placeholders. HTTPS, final public URLs, legal operator identity, backup policy, deletion processes and production email/password recovery remain deployment responsibilities. No Sites hosting is used because the supplied architecture specifies native Next.js and PostgreSQL/Render.
