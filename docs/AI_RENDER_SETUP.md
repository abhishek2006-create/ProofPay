# AI provider and Render deployment

Updated 10 November 2026. Grok via xAI is now the selected provider. The earlier OpenAI checks failed for insufficient credits; xAI credentials and live verification are pending. Hosted deployment has not run. The successful PayPal sandbox payment is recorded in PROJECT_COMPLETION.md.

## Selected provider configuration

Use Grok via xAI with the existing OpenAI-compatible Chat Completions adapter. The selected model is `grok-4.7`, endpoint `https://api.x.ai/v1`, with strict JSON-schema output. Account access and the real response contract must still be verified with an xAI key. No new SDK is required for this existing adapter.

Set the following in the ignored local `.env` and in the Render service's Environment settings:

```dotenv
AI_API_KEY=
AI_PRETRAINED_MODEL=grok-4.7
AI_BASE_URL=https://api.x.ai/v1
AI_RESPONSE_FORMAT=json_schema
EMBEDDING_MODEL=
EMBEDDING_API_KEY=
EMBEDDING_BASE_URL=
```

AI_API_KEY must be an xAI key, not the earlier OpenAI key. Enter it directly in your local editor or Render; never commit it or send it in chat. The earlier local provider settings are preserved in ignored `.data/provider-before-grok.env`. The Grok setup deliberately leaves embeddings disabled and uses labeled lexical retrieval. If a separate provider handles embeddings, explicitly set its own EMBEDDING_API_KEY, model and base URL. The embedding provider must expose `/embeddings`; chat compatibility alone is insufficient. The app otherwise reuses AI_API_KEY when EMBEDDING_API_KEY is blank, so never leave that key blank when mixing providers.

After setting credentials, restart the app and run `npm run ai:check` and `npm run rag:status`. The former submits fictional evidence and validates the returned schema/evidence references. Configuration status alone does not prove a provider request succeeded. Upload a new fictional requirements document, retrieve it, generate cited criteria, review them, agree as both roles, and run the evidence report. With the Grok-only setup, expect explicit lexical fallback. Only claim semantic retrieval after separately configuring and verifying embeddings and re-uploading documents.

## Render blueprint

`render.yaml` defines the existing Node web service and managed PostgreSQL, build and migration commands, health endpoint, server-only secrets, and the selected model settings. It now uses the current plan identifiers `0.5c-512mb` and `0.1c-256mb`, pins PostgreSQL 17, and restricts database access to Render's private network. Review the account's displayed price before creating resources. For an existing deployment, inspect its current plans before applying changes: changing from legacy plans can be irreversible. No plan migration was performed here.

1. Connect Render access in this chat and select the intended workspace/service, or open its dashboard yourself.
2. Use the reviewed `codex/proofpay-sandbox-render` branch in `https://github.com/abhishek2006-create/ProofPay`. Local changes must be committed and pushed before a new Render plan can include them.
3. For a new deployment, create a Blueprint using `render.yaml`. For an existing deployment, update the existing service rather than provisioning duplicate resources. Check the service and database names before syncing.
4. Enter sandbox PayPal client ID/secret, merchant ID and AI_API_KEY in the service Environment. Keep PAYPAL_ENV=sandbox and ENABLE_DEMO=false. The successful local test used the US sandbox merchant/app; use that same set together.
5. Set APP_URL and NEXTAUTH_URL to the same exact public HTTPS origin. Keep DATABASE_URL connected to Render's internal database URL and NEXTAUTH_SECRET unique to hosting.
6. Add any new secret values manually when updating an existing Blueprint. Render only prompts for `sync: false` values on initial creation; adding that entry later does not populate the service secret.
7. Wait for build, migration and health success. Run the browser suite with PLAYWRIGHT_BASE_URL set to the public origin only against an intended test deployment/database. The tests create labeled fixture records.

## Finish the PayPal webhook test

Once the HTTPS service is reachable, register `<origin>/api/v1/paypal-webhook` on the same US sandbox REST app. Subscribe to the event list in PAYPAL_SANDBOX.md, save its actual PAYPAL_WEBHOOK_ID in Render, and redeploy. Create a new small accepted test milestone through the hosted client UI, approve with a separate sandbox buyer, confirm capture, then verify the actual signed event and its redelivery deduplication. A simulator event does not prove a capture or signature flow.

## Remaining account-dependent work

- xAI key and account model access: pending. No xAI request has succeeded yet. The previous OpenAI key was removed from active AI settings without revoking it; its earlier diagnostic returned insufficient quota. Switching providers does not imply free API credits.
- Render access is connected and My Workspace is confirmed. Service and PostgreSQL discovery found no existing resources; this will be a new deployment.
- Source published on `codex/proofpay-sandbox-render` at commit `eb80f11`; main and aditya were not changed. Secrets and local session fixtures are excluded.
- Blueprint `exs-dbp20t8m7kps738kpjp0` (ProofPay sandbox demo) was created with autoSync=false. Initial planning failed with `need_payment_info` for the web service and database. No sync was approved and no paid web/database resources were provisioned. Add billing information in the confirmed Render workspace, then replan this existing Blueprint instead of creating another.
- Hosting plan price and the resulting infrastructure plan still require review before applying deployment.
- Public origin and actual webhook registration: pending hosting.
- Runtime repository tests: still unavailable until an approved isolated runner exists. Configuring AI does not enable code execution.

## Official references

- [Grok 4.7](https://docs.x.ai/developers/grok-4-7)
- [xAI structured outputs](https://docs.x.ai/developers/model-capabilities/text/structured-outputs)
- [xAI Chat Completions](https://docs.x.ai/developers/rest-api-reference/inference/chat-completions)
- [Render blueprint fields and secret synchronization](https://render.com/docs/blueprint-spec)
- [Render Next.js hosting](https://render.com/docs/deploy-nextjs-app)
