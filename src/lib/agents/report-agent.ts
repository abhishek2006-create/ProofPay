import type { CriterionEvaluation } from './scoring-agent';
import type { RepositoryAnalysis, TestExecution } from './repository-agent';
import type { RetrievedChunk } from './requirements-agent';
export function buildEvaluationReport(input: {
  project: { id: string; title: string };
  milestone: { id: string; title: string; currentVersion: number };
  submission: { id: string; createdAt: Date };
  client: string;
  freelancer: string;
  repository: RepositoryAnalysis;
  tests: TestExecution;
  retrieval: { mode: string; chunks: RetrievedChunk[] };
  scoring: {
    criteria: CriterionEvaluation[];
    scoreOutOf10: number | null;
    verifiedWeightPercent: number;
    provisional: boolean;
    scorePolicy: string;
  };
  ai: unknown;
  summary: string;
}) {
  const cases = input.tests.suites.flatMap((s) => s.cases);
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    project: { ...input.project, client: input.client, freelancer: input.freelancer },
    milestone: {
      id: input.milestone.id,
      name: input.milestone.title,
      specificationVersion: input.milestone.currentVersion,
    },
    submission: {
      id: input.submission.id,
      submittedAt: input.submission.createdAt.toISOString(),
      repositoryUrl: input.repository.repositoryUrl,
      commitSha: input.repository.commitSha,
      treeSha: input.repository.treeSha,
    },
    overall: {
      ...input.scoring,
      criteria: undefined,
      summary: input.summary,
      evidenceQuality: input.scoring.provisional
        ? 'Incomplete verification; inspect uncertainty and blocked criteria.'
        : 'Checks cover the agreed verification methods; human review remains required.',
    },
    criteria: input.scoring.criteria,
    retrieval: input.retrieval,
    repository: input.repository,
    testing: {
      ...input.tests,
      passed: cases.filter((c) => c.status === 'pass').length,
      failed: cases.filter((c) => c.status === 'fail').length,
      skipped: cases.filter((c) => c.status === 'skip').length,
      countsKnown: input.tests.status === 'COMPLETED',
      buildResults: input.tests.commands.filter((c) => c.kind === 'build'),
    },
    ai: input.ai,
    missingOrIncomplete: input.scoring.criteria
      .filter((c) => c.status !== 'PASS')
      .map((c) => ({
        criterionId: c.criterionId,
        status: c.status,
        observedFailure: c.missingFunctionality,
        recommendation: c.recommendedImprovement,
      })),
    conclusion:
      'Advisory report only. The client must inspect the evidence and decide whether to approve, request revisions or reject. Scores never initiate payments. Merchant checkout capture is separate from freelancer payout.',
    limitations: [
      'No model was trained or fine-tuned.',
      'Static repository inspection is not proof of runtime behavior.',
      'A high score does not guarantee absence of bugs, security issues or incomplete functionality.',
      ...input.repository.limitations,
      ...(input.tests.status === 'TEST_EXECUTION_UNAVAILABLE' ? [input.tests.reason] : []),
    ],
  };
}
