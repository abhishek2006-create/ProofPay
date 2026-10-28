import type { CheckResult } from '../validation';
import type { RepositoryAnalysis, TestExecution } from './repository-agent';
export type CriterionInput = {
  id: string;
  description: string;
  method: string;
  expected: string;
  evidenceRequired: string;
  weight?: number;
  sourceChunkId?: string | null;
  sourceQuote?: string | null;
};
export type CriterionEvaluation = {
  criterionId: string;
  description: string;
  weight: number;
  status: 'PASS' | 'PARTIAL' | 'FAIL' | 'UNVERIFIED' | 'BLOCKED';
  score: number | null;
  source: { chunkId: string | null; quote: string | null; baseline: string };
  evidence: string[];
  testResult: string;
  explanation: string;
  missingFunctionality: string | null;
  recommendedImprovement: string;
};
export function scoreCriteria(
  requirements: CriterionInput[],
  checks: CheckResult[],
  repo: RepositoryAnalysis,
  tests: TestExecution,
) {
  const criteria: CriterionEvaluation[] = requirements.map((r) => {
    const check = checks.find((c) => c.requirementId === r.id);
    let status: CriterionEvaluation['status'] =
      check?.status === 'pass' ? 'PASS' : check?.status === 'fail' ? 'FAIL' : 'UNVERIFIED';
    let score: number | null = status === 'PASS' ? 10 : status === 'FAIL' ? 0 : null;
    let evidence = check?.evidenceIds ?? [],
      explanation = check?.explanation ?? 'No executed verification supports this criterion.',
      testResult = 'No runtime test supports this judgment.';
    if (r.method === 'REPO_FILE') {
      if (repo.status !== 'INSPECTED') {
        status = repo.status === 'UNAVAILABLE' ? 'BLOCKED' : 'UNVERIFIED';
        score = null;
        explanation =
          'A pinned accessible repository is required for this file-presence criterion.';
      } else if (repo.paths.includes(r.expected)) {
        status = 'PASS';
        score = 10;
        evidence = [`repo:${repo.commitSha}:${r.expected}`];
        explanation =
          'The agreed file path exists in the pinned repository tree. This does not verify runtime functionality.';
      } else if (repo.limitations.some((x) => /truncated|incomplete/.test(x))) {
        status = 'UNVERIFIED';
        score = null;
        explanation =
          'File was not found in the bounded/truncated inspection; absence is not proven.';
      } else {
        status = 'FAIL';
        score = 0;
        explanation = 'The agreed file path is absent from the inspected pinned tree.';
      }
    }
    if (r.method === 'SANDBOX_TEST') {
      const suite = tests.suites.find((s) => s.id === r.expected);
      if (tests.status !== 'COMPLETED') {
        status = 'BLOCKED';
        score = null;
        explanation = tests.reason;
        testResult = tests.status;
      } else if (!suite?.cases.length) {
        status = 'UNVERIFIED';
        score = null;
        explanation = 'The agreed test suite did not return any executed cases.';
      } else {
        const passed = suite.cases.filter((c) => c.status === 'pass').length,
          failed = suite.cases.filter((c) => c.status === 'fail').length,
          skipped = suite.cases.filter((c) => c.status === 'skip').length;
        testResult = `${passed} passed, ${failed} failed, ${skipped} skipped in agreed suite ${suite.id}.`;
        evidence = [`test:${repo.commitSha}:${suite.id}`];
        score =
          passed + failed === 0 ? null : Math.round((1000 * passed) / suite.cases.length) / 100;
        status =
          score === null
            ? 'UNVERIFIED'
            : passed === suite.cases.length
              ? 'PASS'
              : passed === 0 && failed > 0
                ? 'FAIL'
                : 'PARTIAL';
        explanation = `Executed isolated test evidence for the client-agreed suite. ${testResult} These tests do not guarantee all application behavior.`;
      }
    }
    return {
      criterionId: r.id,
      description: r.description,
      weight: r.weight ?? 1,
      status,
      score,
      source: {
        chunkId: r.sourceChunkId ?? null,
        quote: r.sourceQuote ?? null,
        baseline: r.sourceChunkId
          ? 'Client-reviewed document citation and agreed specification'
          : 'Client/freelancer agreed specification',
      },
      evidence,
      testResult,
      explanation,
      missingFunctionality:
        status === 'FAIL'
          ? 'The agreed check failed; inspect the cited artifact or test output to identify the change needed.'
          : null,
      recommendedImprovement:
        status === 'PASS'
          ? 'Review the evidence scope and remaining human checks.'
          : status === 'BLOCKED'
            ? 'Provide the required authorized repository or configure an approved isolated runner.'
            : status === 'FAIL' || status === 'PARTIAL'
              ? 'Correct the observed failures and submit a new version for evaluation.'
              : 'Supply sufficient evidence and perform the missing human or automated review.',
    };
  });
  return { criteria, ...weightedScore(criteria) };
}
export function weightedScore(
  criteria: Pick<CriterionEvaluation, 'weight' | 'status' | 'score'>[],
) {
  if (
    !criteria.length ||
    criteria.some(
      (c) =>
        !Number.isInteger(c.weight) ||
        c.weight <= 0 ||
        (c.score !== null && (!Number.isFinite(c.score) || c.score < 0 || c.score > 10)),
    )
  )
    throw new Error('Invalid scoring inputs.');
  const total = criteria.reduce((n, c) => n + c.weight, 0);
  const verified = criteria.filter(
    (c) => ['PASS', 'PARTIAL', 'FAIL'].includes(c.status) && c.score !== null,
  );
  const verifiedWeight = verified.reduce((n, c) => n + c.weight, 0);
  return {
    scoreOutOf10: verified.length
      ? Math.round((100 * criteria.reduce((n, c) => n + (c.score ?? 0) * c.weight, 0)) / total) /
        100
      : null,
    verifiedWeightPercent: Math.round((10000 * verifiedWeight) / total) / 100,
    provisional: verifiedWeight < total,
    scorePolicy:
      'Deterministic weighted score. Unverified/blocked weight contributes no earned points; score is a provisional lower bound when coverage is incomplete. All-unverified reports have no numeric score.',
  };
}
