# AI provider and Render deployment

Prepared 10 November 2026. Provider checks were attempted but failed for insufficient API credits; hosted deployment has not run. The successful PayPal sandbox payment is recorded in PROJECT_COMPLETION.md.

## Selected provider configuration

Use OpenAI as the default OpenAI-compatible provider for the existing Chat Completions adapter. `gpt-4.1-mini` supports structured outputs; `text-embedding-3-small` supplies vectors for requirements retrieval. These are compatibility choices, not a claim that they are the latest models. Account model access must be verified with the actual project key.

Set the following in the ignored local `.env` and in the Render service's Environment settings:

```dotenv
AI_API_KEY=
AI_PRETRAINED_MODEL=gpt-4.1-mini
AI_BASE_URL=https://api.openai.com/v1
AI_RESPONSE_FORMAT=json_schema
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_BASE_URL=https://api.openai.com/v1
```

Enter the API key directly in your local editor or Render; never commit it or send it in chat. A blank EMBEDDING_API_KEY reuses AI_API_KEY. If a different provider handles embeddings, set its separate key and base URL. The embedding provider must expose `/embeddings`; chat compatibility alone is insufficient. For another chat provider, change the model/base URL and verify strict JSON-schema support, or explicitly use `AI_RESPONSE_FORMAT=json_object` with application validation still enabled.

After setting credentials, restart the app and run `npm run ai:check` and `npm run rag:status`. The former submits fictional evidence and validates the returned schema/evidence references. Configuration status alone does not prove a provider request succeeded. Upload a new fictional requirements document, retrieve it, generate cited criteria, review them, agree as both roles, and run the evidence report. Confirm semantic retrieval actually ran rather than lexical fallback. Re-upload old documents to create provider embeddings; old fixture vectors do not establish live provider operation.

## Render blueprint

`render.yaml` defines the existing Node web service and managed PostgreSQL, build and migration commands, health endpoint, server-only secrets, and the selected model settings. It now uses the current plan identifiers `0.5c-512mb` and `0.1c-256mb`, pins PostgreSQL 17, and restricts database access to Render's private network. Review the account's displayed price before creating resources. For an existing deployment, inspect its current plans before applying changes: changing from legacy plans can be irreversible. No plan migration was performed here.

1. Connect Render access in this chat and select the intended workspace/service, or open its dashboard yourself.
2. Make the reviewed source available in `https://github.com/abhishek2006-create/ProofPay`. Current local changes have not been committed or pushed. A dashboard deployment of the current remote branch will not include unpushed files.
3. For a new deployment, create a Blueprint using `render.yaml`. For an existing deployment, update the existing service rather than provisioning duplicate resources. Check the service and database names before syncing.
4. Enter sandbox PayPal client ID/secret, merchant ID and AI_API_KEY in the service Environment. Keep PAYPAL_ENV=sandbox and ENABLE_DEMO=false. The successful local test used the US sandbox merchant/app; use that same set together.
5. Set APP_URL and NEXTAUTH_URL to the same exact public HTTPS origin. Keep DATABASE_URL connected to Render's internal database URL and NEXTAUTH_SECRET unique to hosting.
6. Add any new secret values manually when updating an existing Blueprint. Render only prompts for `sync: false` values on initial creation; adding that entry later does not populate the service secret.
7. Wait for build, migration and health success. Run the browser suite with PLAYWRIGHT_BASE_URL set to the public origin only against an intended test deployment/database. The tests create labeled fixture records.

## Finish the PayPal webhook test

Once the HTTPS service is reachable, register `<origin>/api/v1/paypal-webhook` on the same US sandbox REST app. Subscribe to the event list in PAYPAL_SANDBOX.md, save its actual PAYPAL_WEBHOOK_ID in Render, and redeploy. Create a new small accepted test milestone through the hosted client UI, approve with a separate sandbox buyer, confirm capture, then verify the actual signed event and its redelivery deduplication. A simulator event does not prove a capture or signature flow.

## Remaining account-dependent work

- Restricted provider key created with explicit approval, saved in ignored .env, and expiring 10 December 2026. Only chat-completion and embedding requests are enabled. The fictional model diagnostic failed; the embedding check returned HTTP 429 with `credit_balance_exhausted` / `insufficient_quota`. No live AI or embedding success is claimed. Account funding must be completed by the user before retesting.
- Render access is connected and My Workspace is confirmed. Service and PostgreSQL discovery found no existing resources; this will be a new deployment.
- Source published on `codex/proofpay-sandbox-render` at commit `eb80f11`; main and aditya were not changed. Secrets and local session fixtures are excluded.
- Blueprint `exs-dbp20t8m7kps738kpjp0` (ProofPay sandbox demo) was created with autoSync=false. Initial planning failed with `need_payment_info` for the web service and database. No sync was approved and no paid web/database resources were provisioned. Add billing information in the confirmed Render workspace, then replan this existing Blueprint instead of creating another.
- Hosting plan price and the resulting infrastructure plan still require review before applying deployment.
- Public origin and actual webhook registration: pending hosting.
- Runtime repository tests: still unavailable until an approved isolated runner exists. Configuring AI does not enable code execution.

## Official references

- [GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini)
- [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Embeddings](https://developers.openai.com/api/docs/guides/embeddings)
- [Render blueprint fields and secret synchronization](https://render.com/docs/blueprint-spec)
- [Render Next.js hosting](https://render.com/docs/deploy-nextjs-app)
