import type { Prisma } from '@prisma/client';
import { db } from '../db';
import { ensure } from '../errors';
import { getMilestone, audit, type Actor } from '../projects';
import { runChecks } from '../verification';
import { aiConfigured, reviewChecksDetailed } from '../ai';
import { retrieveRequirements } from './requirements-agent';
import { buildEvaluationReport } from './report-agent';
import { evaluateWithPython } from '../python-service';
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
    const checks = runChecks(m.specifications[0].requirements, submission.evidence);
    await progress(
      'PYTHON_EVALUATION_RUNNING',
      'Python is inspecting the pinned repository and requesting approved isolated tests.',
    );
    const evaluation = await evaluateWithPython({
      requestId: job.id,
      projectId: m.projectId,
      submissionId: submission.id,
      specificationVersion: m.currentVersion,
      submission: {
        repositoryUrl: submission.repositoryUrl,
        commitSha: submission.commitSha,
        treeSha: submission.treeSha,
      },
      requirements: m.specifications[0].requirements,
      checks,
    });
    const repository = evaluation.repository;
    const tests = evaluation.tests;
    const scoring = evaluation.scoring;
    repository.limitations.push(...evaluation.limitations);
    await progress(
      'EVIDENCE_BEING_EVALUATED',
      `Artifact checks executed. Isolated test status: ${tests.status}.`,
    );
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
          evaluationEngine: 'python',
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
