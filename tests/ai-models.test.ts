import { describe, it, expect, vi, afterEach } from 'vitest';
import { aiModelConfig, publicAiConfig } from '../src/lib/ai-config';
import { diagnoseAi, proposeCriteria, reviewChecksDetailed } from '../src/lib/ai';
const check = {
  requirementId: 'r1',
  status: 'not_verified' as const,
  explanation: 'No evidence',
  evidenceIds: [],
  method: 'MANUAL',
  limitations: 'No deployment verification',
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function configure() {
  vi.stubEnv('AI_API_KEY', 'fixture-secret');
  vi.stubEnv('AI_MODEL', 'pretrained-fixture');
  vi.stubEnv('AI_VERIFIER_MODE', 'pretrained');
  vi.stubEnv('AI_CUSTOM_MODEL', 'custom-fixture');
  vi.stubEnv('AI_CUSTOM_BASE_URL', 'http://127.0.0.1:8001/v1');
  vi.stubEnv('AI_CUSTOM_API_KEY', 'custom-secret');
  vi.stubEnv('AI_CUSTOM_MODEL_APPROVED', 'false');
}
describe('model routing and diagnostics', () => {
  it('ignores retired custom settings and uses only pretrained inference', () => {
    configure();
    vi.stubEnv('AI_VERIFIER_MODE', 'custom');
    expect(aiModelConfig().configured).toBe(true);
    expect(aiModelConfig('criteria').model).toBe('pretrained-fixture');
    expect(publicAiConfig()).not.toHaveProperty('key');
    expect(JSON.stringify(publicAiConfig())).not.toContain('fixture-secret');
  });
  it('uses strict JSON schema and records served model and prompt version', async () => {
    configure();
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({
        model: 'actual-served-model',
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: JSON.stringify({
                summary: 'Missing evidence requires review.',
                results: [check],
              }),
            },
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const result = await reviewChecksDetailed([check], 'notes');
    expect(result.metadata).toEqual({
      model: 'actual-served-model',
      mode: 'rag-pretrained',
      promptVersion: 'proofpay-rag-v1',
    });
    expect(JSON.parse(fetch.mock.calls[0][1]!.body as string).response_format.type).toBe(
      'json_schema',
    );
  });
  it('ignores custom endpoint settings and keeps provider keys out of public state', async () => {
    configure();
    vi.stubEnv('AI_VERIFIER_MODE', 'custom');
    vi.stubEnv('AI_CUSTOM_MODEL_APPROVED', 'true');
    vi.stubEnv('AI_CUSTOM_RESPONSE_FORMAT', 'json_object');
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({
        choices: [
          { message: { content: JSON.stringify({ summary: 'Missing', results: [check] }) } },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetch);
    expect((await reviewChecksDetailed([check], 'notes')).metadata.mode).toBe('rag-pretrained');
    expect(String(fetch.mock.calls[0][0])).toBe('https://api.openai.com/v1/chat/completions');
  });
  it('rejects unsafe remote HTTP and provider URLs containing credentials', () => {
    configure();
    vi.stubEnv('AI_BASE_URL', 'http://remote.example/v1');
    expect(aiModelConfig().configured).toBe(false);
    vi.stubEnv('AI_BASE_URL', 'https://user:secret@remote.example/v1');
    expect(aiModelConfig().configured).toBe(false);
  });
  it('rejects refused or truncated completions', async () => {
    configure();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ choices: [{ finish_reason: 'length', message: { content: '{}' } }] }),
      ),
    );
    await expect(diagnoseAi()).rejects.toThrow('invalid response');
  });
  it('rejects malformed proposed criteria instead of persisting them', async () => {
    configure();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ choices: [{ message: { content: '{"requirements":[]}' } }] }),
      ),
    );
    await expect(proposeCriteria('Build a real dashboard')).rejects.toThrow('schema validation');
  });
});
