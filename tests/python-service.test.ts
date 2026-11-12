import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  evaluateWithPython,
  resolveWithPython,
  type PythonEvaluationInput,
} from '../src/lib/python-service';
import { recomputeExpectedScores as scoreCriteria } from '../src/lib/verification-response-validator';
import type { RepositoryAnalysis, TestExecution } from '../src/lib/python-service';

const sha = 'a'.repeat(40),
  tree = 'b'.repeat(40);
const input: PythonEvaluationInput = {
  requestId: 'job',
  projectId: 'project',
  submissionId: 'submission',
  specificationVersion: 1,
  submission: { repositoryUrl: 'https://github.com/example/demo', commitSha: sha, treeSha: tree },
  requirements: [
    {
      id: 'r',
      description: 'Required file',
      method: 'REPO_FILE',
      expected: 'src/index.ts',
      evidenceRequired: 'File',
      weight: 1,
    },
  ],
  checks: [],
};
function report() {
  const repository: RepositoryAnalysis = {
    ...input.submission,
    status: 'INSPECTED',
    paths: ['src/index.ts'],
    files: [],
    languages: [],
    frameworks: [],
    scripts: {},
    testFiles: [],
    limitations: [],
  };
  const tests: TestExecution = {
    status: 'TEST_EXECUTION_UNAVAILABLE',
    reason: 'No runner',
    commands: [],
    suites: [],
  };
  return {
    schemaVersion: 1,
    requestId: input.requestId,
    projectId: input.projectId,
    submissionId: input.submissionId,
    specificationVersion: 1,
    generatedAt: new Date().toISOString(),
    repository,
    tests,
    scoring: scoreCriteria(input.requirements, input.checks, repository, tests),
    limitations: [],
  };
}
function configured() {
  vi.stubEnv('AI_SERVICE_URL', 'http://127.0.0.1:8109');
  vi.stubEnv('AI_SERVICE_TOKEN', 'fixture-'.repeat(8));
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('Python verification boundary', () => {
  it('requires the Python service before making any verification request', async () => {
    vi.stubEnv('AI_SERVICE_URL', '');
    vi.stubEnv('AI_SERVICE_TOKEN', '');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(evaluateWithPython(input)).rejects.toThrow('Python verification is required');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('sends only contract fields and verifies scores before accepting the report', async () => {
    configured();
    const fetch = vi.fn(async () => Response.json(report()));
    vi.stubGlobal('fetch', fetch);
    const requirements = [
      { ...input.requirements[0], secretDatabaseField: 'must not leave backend' },
    ];
    expect((await evaluateWithPython({ ...input, requirements })).scoring.scoreOutOf10).toBe(10);
    const options = (fetch.mock.calls as unknown as [URL, RequestInit][])[0][1];
    expect(options.cache).toBe('no-store');
    expect(options.redirect).toBe('error');
    expect(String(options.body)).not.toContain('secretDatabaseField');
  });
  it.each(['job', 'commit', 'score', 'evidence', 'criterion', 'version'])(
    'rejects mismatched %s',
    async (kind) => {
      configured();
      const value = report();
      if (kind === 'job') value.requestId = 'replayed';
      if (kind === 'commit') value.repository.commitSha = 'c'.repeat(40);
      if (kind === 'score') value.scoring.scoreOutOf10 = 1;
      if (kind === 'evidence') value.scoring.criteria[0].evidence = ['invented'];
      if (kind === 'criterion') value.scoring.criteria[0].criterionId = 'other';
      if (kind === 'version') value.specificationVersion = 2;
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => Response.json(value)),
      );
      await expect(evaluateWithPython(input)).rejects.toThrow();
    },
  );
  it('rejects insecure service origins without making requests', async () => {
    configured();
    vi.stubEnv('AI_SERVICE_URL', 'http://external.example');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(evaluateWithPython(input)).rejects.toThrow('HTTPS');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('does not fall back on an unavailable configured service', async () => {
    configured();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 503 })),
    );
    await expect(evaluateWithPython(input)).rejects.toThrow('unavailable');
  });
  it('rejects a resolution for another repository', async () => {
    configured();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          ...input.submission,
          repositoryUrl: 'https://github.com/other/repo',
          repositoryRef: 'main',
        }),
      ),
    );
    await expect(
      resolveWithPython('project', input.submission.repositoryUrl!, 'main'),
    ).rejects.toThrow('different repository');
  });
  it('never scores a manual check as passed or excluded files as absent', () => {
    const value = report();
    const criteria = [
      { ...input.requirements[0], method: 'MANUAL' },
      { ...input.requirements[0], id: 'secret', expected: '.env' },
    ];
    const checks = [
      {
        requirementId: 'r',
        method: 'MANUAL',
        status: 'pass' as const,
        explanation: 'Untrusted claim',
        evidenceIds: ['file'],
        limitations: '',
      },
    ];
    expect(
      scoreCriteria(criteria, checks, value.repository, value.tests).criteria.map((c) => c.status),
    ).toEqual(['UNVERIFIED', 'UNVERIFIED']);
  });
});
