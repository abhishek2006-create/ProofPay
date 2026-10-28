import type { Prisma } from '@prisma/client';
import { db } from '../db';
import { ensure } from '../errors';
import { getMilestone, audit, type Actor } from '../projects';
import { runChecks } from '../verification';
import { aiConfigured, reviewChecksDetailed } from '../ai';
import { retrieveRequirements } from './requirements-agent';
import {
  inspectRepository,
  executeIsolatedTests,
  runnerConfigured,
  type RepositoryAnalysis,
} from './repository-agent';
import { scoreCriteria } from './scoring-agent';
import { buildEvaluationReport } from './report-agent';
export async function evaluateMilestone(user: Actor, id: string) {
  const m = await getMilestone(user, id);
  ensure(
    ['SUBMITTED', 'UNDER_REVIEW'].includes(m.status),
    409,
    'Submit evidence before running checks.',
  );
  const submission = m.submissions[0];
  ensure(submission, 409, 'No submission found.');
  await db.evaluationJob.updateMany({
    where: { milestoneId: id, status: 'RUNNING', leaseUntil: { lt: new Date() } },
    data: {
      status: 'FAILED',
      stage: 'EVALUATION_INTERRUPTED',
      error: 'Evaluation lease expired; request a new run.',
    },
  });
  ensure(
    !(await db.evaluationJob.findFirst({ where: { milestoneId: id, status: 'RUNNING' } })),
    409,
    'An evaluation is already running for this milestone.',
  );
  const events: { stage: string; at: string; message: string }[] = [];
  const job = await db.evaluationJob.create({
    data: {
      milestoneId: id,
      submissionId: submission.id,
      actorId: user.id,
      stage: 'SUBMISSION_RECEIVED',
      events: [],
      leaseUntil: new Date(Date.now() + 180000),
    },
  });
  async function progress(stage: string, message: string) {
    events.push({ stage, at: new Date().toISOString(), message });
    await db.evaluationJob.update({
      where: { id: job.id },
      data: { stage, events, leaseUntil: new Date(Date.now() + 180000) },
    });
  }
  try {
    await progress(
      'SUBMISSION_RECEIVED',
      'Evaluating the exact current submission and agreed specification.',
    );
    const retrieval = await retrieveRequirements(
      user,
      m.projectId,
      `${m.title}\n${m.description}\n${m.specifications[0].requirements.map((r) => r.description).join('\n')}`.slice(
        0,
        4000,
      ),
      id,
    );
    await progress(
      'REQUIREMENTS_RETRIEVED',
      `${retrieval.chunks.length} source chunks retrieved using ${retrieval.mode}. Agreed criteria remain the baseline.`,
    );
    const citedIds = m.specifications[0].requirements
      .map((r) => r.sourceChunkId)
      .filter((x): x is string => Boolean(x));
    const cited = await db.documentChunk.findMany({
      where: { id: { in: citedIds }, projectId: m.projectId, document: { projectId: m.projectId } },
      include: { document: { select: { filename: true } } },
    });
    for (const c of cited)
      if (!retrieval.chunks.some((x) => x.id === c.id))
        retrieval.chunks.push({
          id: c.id,
          documentId: c.documentId,
          projectId: c.projectId,
          milestoneId: c.milestoneId,
          text: c.text,
          sourceLocation: c.sourceLocation,
          filename: c.document.filename,
          similarity: null,
        });
    await progress(
      'REPOSITORY_INSPECTION_STARTED',
      submission.commitSha
        ? `Inspecting pinned commit ${submission.commitSha}.`
        : 'No repository was submitted; using uploaded artifacts only.',
    );
    let repository: RepositoryAnalysis;
    try {
      repository = await inspectRepository(m.projectId, submission);
    } catch {
      repository = {
        status: 'UNAVAILABLE',
        repositoryUrl: submission.repositoryUrl,
        commitSha: submission.commitSha,
        treeSha: submission.treeSha,
        paths: [],
        files: [],
        languages: [],
        frameworks: [],
        testFiles: [],
        scripts: {},
        limitations: [
          'GitHub inspection failed or access could not be authorized. No repository tests were inferred as passed.',
        ],
      };
    }
    await progress(
      runnerConfigured() && repository.status === 'INSPECTED'
        ? 'TESTS_RUNNING'
        : 'TEST_EXECUTION_UNAVAILABLE',
      runnerConfigured()
        ? 'Requesting the configured isolated test service.'
        : 'No approved isolated runner is configured; no submitted code is executed on this host.',
    );
    const tests = await executeIsolatedTests(
      repository,
      m.specifications[0].requirements
        .filter((r) => r.method === 'SANDBOX_TEST')
        .map((r) => r.expected),
    );
    await progress(
      'EVIDENCE_BEING_EVALUATED',
      `Artifact checks executed. Isolated test status: ${tests.status}.`,
    );
    const checks = runChecks(m.specifications[0].requirements, submission.evidence);
    const scoring = scoreCriteria(m.specifications[0].requirements, checks, repository, tests);
    const normalized = scoring.criteria.map((c) => ({
      requirementId: c.criterionId,
      status:
        c.status === 'PASS'
          ? ('pass' as const)
          : c.status === 'FAIL' || c.status === 'PARTIAL'
            ? ('fail' as const)
            : c.evidence.length
              ? ('needs_review' as const)
              : ('not_verified' as const),
      explanation: c.explanation.slice(0, 1500),
      evidenceIds: c.evidence,
      method: m.specifications[0].requirements.find((r) => r.id === c.criterionId)!.method,
      limitations:
        'Limited to the cited artifact or executed test. Static code does not establish runtime behavior.',
    }));
    let ai: Prisma.InputJsonValue | undefined,
      modelVersion: string | null = null,
      modelProvider = 'unavailable';
    let summary =
      'Evidence-based checks completed. Pretrained AI is unavailable; review the deterministic report and limitations.';
    if (aiConfigured()) {
      try {
        const response = await reviewChecksDetailed(
          normalized,
          submission.notes,
          m.specifications[0].requirements,
          {
            retrievedSources: retrieval.chunks,
            repository: repository.files,
            testExecution: tests,
          },
        );
        ai = { ...response.report, metadata: response.metadata };
        modelVersion = response.metadata.model;
        modelProvider = 'rag-pretrained';
        summary = response.report.summary;
      } catch {
        summary =
          'Evidence-based checks completed. AI failed or returned unsupported evidence; deterministic judgments are preserved.';
      }
    }
    await progress(
      'REPORT_GENERATING',
      'Calculating the agreed weighted score and recording evidence, test scope and uncertainty.',
    );
    const project = await db.project.findUniqueOrThrow({
      where: { id: m.projectId },
      include: { client: true, freelancer: true },
    });
    const report = JSON.parse(
      JSON.stringify(
        buildEvaluationReport({
          project: { id: project.id, title: project.title },
          milestone: m,
          submission,
          client: project.client.name,
          freelancer: project.freelancer.name,
          repository,
          tests,
          retrieval,
          scoring,
          ai: ai ?? null,
          summary,
        }),
      ),
    ) as Prisma.InputJsonValue;
    const run = await db.$transaction(async (tx) => {
      const update = await tx.milestone.updateMany({
        where: { id, revision: m.revision, status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } },
        data: { status: 'UNDER_REVIEW', revision: { increment: 1 } },
      });
      ensure(
        update.count === 1,
        409,
        'Milestone changed during evaluation. This result cannot replace the latest state.',
      );
      const run = await tx.verificationRun.create({
        data: {
          milestoneId: id,
          submissionId: submission.id,
          version: m.currentVersion,
          modelProvider,
          modelVersion,
          summary,
          results: normalized,
          aiResults: ai,
          report,
        },
      });
      await audit(tx, user.id, m.projectId, 'VERIFICATION_COMPLETED', id, {
        runId: run.id,
        jobId: job.id,
        commitSha: submission.commitSha,
      });
      return run;
    });
    await progress(
      'EVALUATION_COMPLETED',
      'Report stored. Human review and a separate payment confirmation are required.',
    );
    await db.evaluationJob.update({
      where: { id: job.id },
      data: { status: 'COMPLETED', reportRunId: run.id },
    });
    return run;
  } catch (error) {
    await db.evaluationJob.update({
      where: { id: job.id },
      data: {
        status: 'FAILED',
        stage: 'EVALUATION_BLOCKED',
        error:
          'Evaluation failed or the milestone changed. No unverified passing result was recorded.',
      },
    });
    throw error;
  }
}
