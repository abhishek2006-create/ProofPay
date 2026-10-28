export type AiTask = 'criteria' | 'review';
export function aiModelConfig(_task: AiTask = 'review') {
  void _task;
  const model = (process.env.AI_PRETRAINED_MODEL || process.env.AI_MODEL || '').trim();
  const key = process.env.AI_API_KEY || '';
  const baseUrl = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const responseFormat = process.env.AI_RESPONSE_FORMAT || 'json_schema';
  let reason = !model
    ? 'Pretrained model name is missing.'
    : !key
      ? 'Provider key is missing. Configure it only in the server environment.'
      : '';
  try {
    const url = new URL(baseUrl);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !(
        url.protocol === 'https:' ||
        (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      )
    )
      reason = 'Use HTTPS for a remote provider, or HTTP for a local loopback model server.';
  } catch {
    reason = 'Provider base URL is invalid.';
  }
  if (!['json_schema', 'json_object'].includes(responseFormat))
    reason = 'Response format must be json_schema or json_object.';
  return {
    configured: !reason,
    reason,
    mode: 'rag-pretrained' as const,
    model,
    pretrainedModel: model,
    key,
    baseUrl,
    responseFormat,
  };
}
export function publicAiConfig() {
  const c = aiModelConfig();
  return {
    configured: c.configured,
    reason: c.reason,
    mode: c.mode,
    activeModel: c.model || null,
    pretrainedModel: c.model || null,
    promptVersion: 'proofpay-rag-v1',
    responseFormat: c.responseFormat,
    criteriaConfigured: c.configured,
  };
}
