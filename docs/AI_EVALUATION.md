# AI and verification evaluation

See [RAG_VERIFICATION.md](RAG_VERIFICATION.md) for the active RAG pipeline and test limits. Scores are computed from evidence, never from model-generated numbers.

Set AI_API_KEY, AI_MODEL and optionally AI_BASE_URL in ignored .env. The server speaks the OpenAI-compatible /chat/completions JSON-object interface; select a provider/model supporting that contract. Compatibility and data terms must be checked for the chosen provider before use. No provider/model credentials were supplied, so no live AI output or benchmark is claimed.

Requirement proposals are schema-validated, editable, and require both parties' agreement. Review results must cover every known criterion exactly once, cite real evidence IDs, and preserve deterministic failures. Missing evidence cannot become a pass. No AI output can select an amount, accept a milestone, or call a payment operation. Notes and check results can be sent to the provider; raw upload bytes are excluded.

Run npm run evaluate for 60 synthetic deterministic artifact cases: clear matches, clear mismatches, missing evidence, manual review, injected instructions and contradictory text. The report is saved in docs/evaluation/latest.json with actual timestamp and measurements. Run npm run evaluate -- --live-ai only after configuring and authorizing the chosen provider; this makes billable model requests.

The deterministic report is not an AI benchmark. Text containing an agreed string can pass the narrow text check even if the surrounding prose contradicts the desired feature; that scenario is deliberately included to show why artifact matching cannot establish semantic or contractual success. JSON manifest checks likewise compare supplied data rather than independently verifying the deployment. Screenshots remain human-review evidence.

No extraction accuracy, semantic failure recall, end-to-end false acceptance rate, manual-review time savings or payment reliability percentage is invented. Measuring those requires an independently labeled representative dataset, defined manual baseline, configured model version and actual sandbox runs. The current fixture-level metrics must not be presented as production assurance or hackathon impact measurements.
