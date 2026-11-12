import { z } from 'zod';
import { AppError, ensure } from './errors';
import { resultSchema, type CheckResult } from './validation';
import { recomputeExpectedScores, type CriterionInput } from './verification-response-validator';

const sha = z.string().regex(/^[a-f0-9]{40}$/);
const pinnedSchema = z
  .object({
    repositoryUrl: z.string(),
    repositoryRef: z.string(),
    commitSha: sha,
    treeSha: sha,
  })
  .strict();
const repositorySchema = z
  .object({
    status: z.enum(['INSPECTED', 'UNAVAILABLE', 'NOT_SUBMITTED']),
    repositoryUrl: z.string().nullable(),
    commitSha: sha.nullable(),
    treeSha: sha.nullable(),
    paths: z.array(z.string().max(500)).max(3000),
    files: z
      .array(
        z
          .object({
            path: z.string().max(500),
            sha,
            text: z.string().max(16000),
            reference: z.string().max(600),
          })
          .strict(),
      )
      .max(12),
    languages: z.array(z.string()).max(20),
    frameworks: z.array(z.string()).max(20),
    testFiles: z.array(z.string()).max(3000),
    scripts: z.record(z.string(), z.string()),
    limitations: z.array(z.string().max(2000)).max(30),
  })
  .strict();
const testsSchema = z
  .object({
    status: z.enum(['TEST_EXECUTION_UNAVAILABLE', 'COMPLETED', 'SETUP_FAILED', 'TIMEOUT']),
    reason: z.string().max(2000),
    commands: z
      .array(
        z
          .object({
            command: z.string().max(500),
            kind: z.enum(['test', 'build', 'lint', 'typecheck']),
            exitCode: z.number().int().nullable(),
            durationMs: z.number().min(0).max(90000),
            stdout: z.string().max(10000),
            stderr: z.string().max(10000),
          })
          .strict(),
      )
      .max(12),
    suites: z
      .array(
        z
          .object({
            id: z.string().max(200),
            cases: z
              .array(
                z
                  .object({
                    name: z.string().max(300),
                    status: z.enum(['pass', 'fail', 'skip']),
                  })
                  .strict(),
              )
              .max(500),
          })
          .strict(),
      )
      .max(30),
  })
  .strict();
const criterionSchema = z
  .object({
    criterionId: z.string(),
    description: z.string(),
    weight: z.number().int().positive(),
    status: z.enum(['PASS', 'PARTIAL', 'FAIL', 'UNVERIFIED', 'BLOCKED']),
    score: z.number().min(0).max(10).nullable(),
    source: z
      .object({
        chunkId: z.string().nullable(),
        quote: z.string().nullable(),
        baseline: z.string(),
      })
      .strict(),
    evidence: z.array(z.string()).max(30),
    testResult: z.string(),
    explanation: z.string(),
    missingFunctionality: z.string().nullable(),
    recommendedImprovement: z.string(),
  })
  .strict();
const evaluationSchema = z
  .object({
    schemaVersion: z.literal(1),
    requestId: z.string(),
    projectId: z.string(),
    submissionId: z.string(),
    specificationVersion: z.number().int().positive(),
    generatedAt: z.string(),
    repository: repositorySchema,
    tests: testsSchema,
    scoring: z
      .object({
        criteria: z.array(criterionSchema).min(1).max(30),
        scoreOutOf10: z.number().min(0).max(10).nullable(),
        verifiedWeightPercent: z.number().min(0).max(100),
        provisional: z.boolean(),
        scorePolicy: z.string(),
      })
      .strict(),
    limitations: z.array(z.string()).max(30),
  })
  .strict();

export function pythonServiceConfigured() {
  return Boolean(process.env.AI_SERVICE_URL && (process.env.AI_SERVICE_TOKEN?.length ?? 0) >= 32);
}

async function callService(path: string, body: unknown, timeoutMs: number) {
  try {
    ensure(
      pythonServiceConfigured(),
      503,
      'Python verification is required. Start npm run dev or configure AI_SERVICE_URL and AI_SERVICE_TOKEN.',
    );
    const url = new URL(process.env.AI_SERVICE_URL!);
    const local = ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname);
    ensure(
      (url.protocol === 'https:' || (local && url.protocol === 'http:')) &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        url.pathname === '/',
      503,
      'Configure an HTTPS Python service origin, or loopback HTTP for local development.',
    );
    const response = await fetch(new URL(path, url), {
      method: 'POST',
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.AI_SERVICE_TOKEN}`,
      },
      body: JSON.stringify(body),
    });
    if (response.status === 400 || response.status === 422)
      throw new AppError(400, 'Python verification rejected the repository or evaluation input.');
    if (response.status === 403)
      throw new AppError(403, 'Repository access was not authorized for this project.');
    if (response.status === 409)
      throw new AppError(409, 'The pinned repository revision did not match.');
    ensure(response.ok, 503, 'Python verification service unavailable.');
    ensure(response.body, 502, 'Empty Python service response.');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        ensure(size <= 1500000, 502, 'Python service response exceeds limits.');
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      503,
      'Python verification failed or timed out. No passing result was recorded.',
    );
  }
}

export async function resolveWithPython(
  projectId: string,
  repositoryUrl: string,
  repositoryRef: string,
) {
  const value = pinnedSchema.parse(
    await callService(
      '/v1/repositories/resolve',
      { projectId, repositoryUrl, repositoryRef },
      25000,
    ),
  );
  ensure(
    value.repositoryUrl === repositoryUrl.replace(/\/$/, '').replace(/\.git$/, '') &&
      value.repositoryRef === repositoryRef,
    502,
    'Python service resolved a different repository or revision.',
  );
  return value;
}

export type PythonEvaluationInput = {
  requestId: string;
  projectId: string;
  submissionId: string;
  specificationVersion: number;
  submission: { repositoryUrl: string | null; commitSha: string | null; treeSha: string | null };
  requirements: CriterionInput[];
  checks: CheckResult[];
};

export async function evaluateWithPython(input: PythonEvaluationInput) {
  // Select contract fields explicitly: never send database records, file bytes, or secrets.
  const body = {
    ...input,
    checks: input.checks.map((c) => resultSchema.parse(c)),
    requirements: input.requirements.map((r) => ({
      id: r.id,
      description: r.description,
      method: r.method,
      expected: r.expected,
      evidenceRequired: r.evidenceRequired,
      weight: r.weight ?? 1,
      sourceChunkId: r.sourceChunkId ?? null,
      sourceQuote: r.sourceQuote ?? null,
    })),
  };
  const value = evaluationSchema.parse(await callService('/v1/evaluations', body, 150000));
  for (const key of ['requestId', 'projectId', 'submissionId', 'specificationVersion'] as const)
    ensure(value[key] === input[key], 502, 'Python evaluation identity mismatch.');
  for (const key of ['repositoryUrl', 'commitSha', 'treeSha'] as const)
    ensure(
      value.repository[key] === input.submission[key],
      502,
      'Python repository identity mismatch.',
    );
  ensure(
    value.repository.status !== 'INSPECTED' ||
      Boolean(
        input.submission.repositoryUrl && input.submission.commitSha && input.submission.treeSha,
      ),
    502,
    'Inspected repository must have an immutable identity.',
  );
  ensure(
    value.repository.status === 'INSPECTED' ||
      (!value.repository.paths.length && !value.repository.files.length),
    502,
    'Unavailable repository cannot supply inspected evidence.',
  );
  ensure(
    new Set(value.repository.paths).size === value.repository.paths.length,
    502,
    'Duplicate repository paths.',
  );
  for (const file of value.repository.files)
    ensure(
      value.repository.paths.includes(file.path) &&
        file.reference === `repo:${input.submission.commitSha}:${file.path}`,
      502,
      'Invalid repository evidence reference.',
    );
  ensure(
    value.tests.status === 'COMPLETED' ||
      (!value.tests.commands.length && !value.tests.suites.length),
    502,
    'Incomplete tests cannot supply passing evidence.',
  );
  if (value.tests.status === 'COMPLETED') {
    ensure(
      value.repository.status === 'INSPECTED' &&
        value.tests.commands.some((c) => c.kind === 'test') &&
        value.tests.commands.every((c) => c.exitCode !== null),
      502,
      'Completed tests need an inspected repository and recorded commands.',
    );
  }
  ensure(
    new Set(value.tests.suites.map((s) => s.id)).size === value.tests.suites.length &&
      value.tests.suites.every((s) =>
        input.requirements.some((r) => r.method === 'SANDBOX_TEST' && r.expected === s.id),
      ),
    502,
    'Unknown or duplicate test suite.',
  );
  // Defense in depth: independently recompute scores before persisting the Python report.
  const expected = recomputeExpectedScores(
    input.requirements,
    input.checks,
    value.repository,
    value.tests,
  );
  ensure(
    value.scoring.criteria.length === expected.criteria.length,
    502,
    'Incomplete Python criteria.',
  );
  for (let i = 0; i < expected.criteria.length; i++) {
    const a = value.scoring.criteria[i],
      b = expected.criteria[i];
    ensure(
      a.criterionId === b.criterionId &&
        a.description === b.description &&
        a.weight === b.weight &&
        a.status === b.status &&
        a.score === b.score &&
        JSON.stringify(a.evidence) === JSON.stringify(b.evidence) &&
        a.source.chunkId === b.source.chunkId &&
        a.source.quote === b.source.quote,
      502,
      'Python score or evidence does not match deterministic checks.',
    );
  }
  ensure(
    value.scoring.scoreOutOf10 === expected.scoreOutOf10 &&
      value.scoring.provisional === expected.provisional &&
      value.scoring.verifiedWeightPercent === expected.verifiedWeightPercent,
    502,
    'Python aggregate score mismatch.',
  );
  return value;
}

export type RepositoryAnalysis = z.infer<typeof repositorySchema>;
export type TestExecution = z.infer<typeof testsSchema>;

export async function inspectWithPython(
  projectId: string,
  submission: PythonEvaluationInput['submission'],
) {
  const value = repositorySchema.parse(
    await callService('/v1/repositories/inspect', { projectId, submission }, 45000),
  );
  for (const key of ['repositoryUrl', 'commitSha', 'treeSha'] as const)
    ensure(value[key] === submission[key], 502, 'Python inspection identity mismatch.');
  return value;
}

export async function pythonServiceStatus() {
  return z
    .object({
      service: z.literal('proofpay-verification'),
      contractVersion: z.literal(1),
      githubAuthenticated: z.boolean(),
      runnerConfigured: z.boolean(),
      trustedSuiteProjects: z.number().int().nonnegative(),
    })
    .strict()
    .parse(await callService('/v1/status', {}, 5000));
}
