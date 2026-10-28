import { AppError } from './errors';
import { type CheckResult } from './validation';
import { validateAiReview, type RequirementInput } from './verification';
import { aiModelConfig, type AiTask } from './ai-config';
import {
  CRITERIA_TASK,
  SYSTEM_BOUNDARY,
  PROMPT_VERSION,
  criteriaResponseSchema,
  makeReviewInput,
  reviewMessages,
  structuredSchema,
  type ReviewInput,
} from './ai-contract';
export function aiConfigured(task: AiTask = 'review') {
  return aiModelConfig(task).configured;
}
export async function completion(
  kind: AiTask,
  messages: { role: 'system' | 'user'; content: string }[],
  schemaOverride?: Record<string, unknown>,
) {
  const config = aiModelConfig(kind);
  if (!config.configured) throw new AppError(503, 'AI is not configured. ' + config.reason);
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        messages,
        response_format:
          config.responseFormat === 'json_schema'
            ? {
                type: 'json_schema',
                json_schema: {
                  name: `proofpay_${kind}`,
                  strict: true,
                  schema:
                    schemaOverride ?? structuredSchema(kind === 'review' ? 'review' : 'criteria'),
                },
              }
            : { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw new AppError(503, 'AI provider unavailable. Deterministic results remain available.');
  }
  if (!response.ok)
    throw new AppError(503, 'AI provider unavailable. Deterministic results remain available.');
  try {
    const body = await response.json();
    const choice = body.choices?.[0];
    if (
      !choice ||
      choice.message?.refusal ||
      (choice.finish_reason && choice.finish_reason !== 'stop')
    )
      throw new Error('Incomplete or refused response.');
    return {
      value: JSON.parse(choice.message.content),
      model: typeof body.model === 'string' ? body.model : config.model,
      mode: config.mode,
    };
  } catch {
    throw new AppError(
      502,
      'AI returned an invalid response. Please review the criteria manually.',
    );
  }
}
export async function proposeCriteria(description: string) {
  const result = await completion('criteria', [
    { role: 'system', content: `${SYSTEM_BOUNDARY} ${CRITERIA_TASK}` },
    { role: 'user', content: JSON.stringify({ description }) },
  ]);
  try {
    return criteriaResponseSchema.parse(result.value);
  } catch {
    throw new AppError(502, 'AI criteria failed schema validation. Define criteria manually.');
  }
}
export async function reviewInput(input: ReviewInput) {
  const result = await completion('review', reviewMessages(input));
  try {
    return {
      report: validateAiReview(result.value, input.checks),
      metadata: { model: result.model, mode: result.mode, promptVersion: PROMPT_VERSION },
    };
  } catch {
    throw new AppError(
      502,
      'AI response failed evidence validation. Deterministic results are preserved.',
    );
  }
}
export async function reviewChecksDetailed(
  checks: CheckResult[],
  notes: string,
  requirements: RequirementInput[] = [],
  context?: unknown,
) {
  return reviewInput(makeReviewInput(checks, notes, requirements, context));
}
export async function reviewChecks(
  checks: CheckResult[],
  notes: string,
  requirements: RequirementInput[] = [],
) {
  return (await reviewChecksDetailed(checks, notes, requirements)).report;
}
export async function diagnoseAi() {
  const check: CheckResult = {
    requirementId: 'diagnostic-criterion',
    status: 'not_verified',
    explanation: 'No evidence was supplied.',
    evidenceIds: [],
    method: 'MANUAL',
    limitations: 'Fictional connection diagnostic only.',
  };
  const result = await reviewChecksDetailed([check], 'Fictional diagnostic. No customer evidence.');
  return {
    status: 'verified',
    ...result.metadata,
    checkedAt: new Date().toISOString(),
    scope:
      'One fictional schema/evidence-boundary check; not a quality benchmark or training result.',
  };
}
