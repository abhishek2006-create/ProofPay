'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client-api';
export type EvaluationReportView = {
  schemaVersion: number;
  project: { title: string; client: string; freelancer: string };
  milestone: { name: string; specificationVersion: number };
  generatedAt: string;
  overall: {
    scoreOutOf10: number | null;
    verifiedWeightPercent: number;
    provisional: boolean;
    scorePolicy: string;
    summary: string;
  };
  submission: { repositoryUrl: string | null; commitSha: string | null };
  criteria: {
    criterionId: string;
    description: string;
    weight: number;
    score: number | null;
    status: string;
    source: { chunkId: string | null; quote: string | null; baseline: string };
    evidence: string[];
    testResult: string;
    explanation: string;
    missingFunctionality: string | null;
    recommendedImprovement: string;
  }[];
  testing: {
    status: string;
    reason: string;
    passed: number;
    failed: number;
    skipped: number;
    countsKnown: boolean;
    commands: {
      command: string;
      kind: string;
      exitCode: number | null;
      durationMs: number;
      stdout: string;
      stderr: string;
    }[];
  };
  retrieval: {
    mode: string;
    chunks: { id: string; filename: string; sourceLocation: string; text: string }[];
  };
  repository: {
    status: string;
    frameworks: string[];
    languages: string[];
    testFiles: string[];
    limitations: string[];
  };
  conclusion: string;
  limitations: string[];
};
export function EvaluationReport({ report }: { report: EvaluationReportView }) {
  return (
    <section className="panel evaluation-report">
      <div className="panel-heading">
        <h2>Milestone evaluation report</h2>
        <span className="badge">ADVISORY</span>
      </div>
      <div className="report-score">
        <strong>
          {report.overall.scoreOutOf10 === null
            ? 'Not scored'
            : `${report.overall.scoreOutOf10.toFixed(2)} / 10`}
        </strong>
        <div>
          <span>{report.overall.verifiedWeightPercent}% of agreed weight verified</span>
          <small>
            {report.overall.provisional
              ? 'Provisional — verification is incomplete'
              : 'Agreed checks evaluated; human review still required'}
          </small>
        </div>
      </div>
      <p>{report.overall.summary}</p>
      <details className="score-policy">
        <summary>How this score is calculated</summary>
        <p>{report.overall.scorePolicy}</p>
      </details>
      <details className="report-metadata">
        <summary>Project details &amp; verification sources</summary>
        <dl>
          <dt>Project and milestone</dt>
          <dd>
            {report.project.title} · {report.milestone.name} · specification v
            {report.milestone.specificationVersion}
          </dd>
          <dt>Participants</dt>
          <dd>
            {report.project.client} → {report.project.freelancer}
          </dd>
          <dt>Generated</dt>
          <dd>{new Date(report.generatedAt).toLocaleString()}</dd>
          <dt>Repository</dt>
          <dd>{report.submission.repositoryUrl ?? 'No repository submitted'}</dd>
          <dt>Pinned commit</dt>
          <dd>{report.submission.commitSha ?? 'Not applicable'}</dd>
          <dt>Requirements retrieval</dt>
          <dd>{report.retrieval.mode}</dd>
          <dt>Repository analysis</dt>
          <dd>
            {report.repository.status} ·{' '}
            {report.repository.frameworks.join(', ') ||
              report.repository.languages.join(', ') ||
              'No framework detected'}
          </dd>
        </dl>
      </details>
      <h3>Weighted acceptance checklist</h3>
      {report.criteria.map((c) => (
        <details className="criterion-evaluation" key={c.criterionId}>
          <summary>
            <span
              className={`badge ${c.status === 'PASS' ? 'green' : c.status === 'FAIL' ? 'red' : 'amber'}`}
            >
              {c.status}
            </span>{' '}
            <span className="criterion-title">{c.description}</span>
            <strong className="criterion-score">
              {c.score === null ? 'Unscored' : `${c.score.toFixed(2)}/10`}
            </strong>
          </summary>
          <p>{c.explanation}</p>
          <p>Agreed relative weight: {c.weight}</p>
          <p>
            <strong>Source:</strong> {c.source.baseline} {c.source.chunkId ?? ''}
          </p>
          {c.source.quote && <blockquote>{c.source.quote}</blockquote>}
          <small>Evidence: {c.evidence.join(', ') || 'No supporting evidence'}</small>
          <p>{c.testResult}</p>
          <p>{c.missingFunctionality ?? c.recommendedImprovement}</p>
        </details>
      ))}
      <h3>Automated testing</h3>
      <span className="badge">{report.testing.status}</span>
      <p>{report.testing.reason}</p>
      <p>
        {report.testing.countsKnown
          ? `${report.testing.passed} passed · ${report.testing.failed} failed · ${report.testing.skipped} skipped`
          : 'Test counts unavailable — unexecuted tests are not reported as passed.'}
      </p>
      {report.testing.commands.map((c, i) => (
        <details key={i}>
          <summary>
            {c.kind} · exit {c.exitCode ?? 'unknown'} · {c.durationMs}ms
          </summary>
          <code>{c.command}</code>
          <pre>
            {c.stdout || '(no standard output)'}
            {'\n'}
            {c.stderr}
          </pre>
        </details>
      ))}
      {report.retrieval.chunks.length > 0 && (
        <details>
          <summary>Retrieved requirement sources ({report.retrieval.chunks.length})</summary>
          {report.retrieval.chunks.map((c) => (
            <article className="source-chunk" key={c.id}>
              <strong>
                {c.filename} · {c.sourceLocation}
              </strong>
              <small>{c.id}</small>
              <p>{c.text}</p>
            </article>
          ))}
        </details>
      )}
      <details>
        <summary>Inspection limits and outstanding issues</summary>
        <ul>
          {report.limitations.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      </details>
      <p className="disclosure">{report.conclusion}</p>
    </section>
  );
}
type Job = {
  id: string;
  stage: string;
  status: string;
  error: string | null;
  events: { stage: string; at: string; message: string }[];
};
export function EvaluationProgress({
  milestoneId,
  busy,
  initialJob,
}: {
  milestoneId: string;
  busy: boolean;
  initialJob?: Job;
}) {
  const [job, setJob] = useState<Job | null>(initialJob ?? null);
  useEffect(() => {
    if (!busy && initialJob?.status !== 'RUNNING') return;
    let active = true;
    const refresh = () =>
      api(`milestones/${milestoneId}/evaluation`)
        .then((result) => {
          if (active) setJob(result.job);
        })
        .catch(() => {});
    refresh();
    const interval = setInterval(refresh, 1500);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [milestoneId, busy, initialJob?.id, initialJob?.status]);
  const visible = job?.id === initialJob?.id && initialJob?.status !== 'RUNNING' ? initialJob : job;
  return visible ? (
    <details
      className="evaluation-progress"
      aria-live="polite"
      open={visible.status !== 'COMPLETED'}
    >
      <summary>
        <strong>
          {visible.status === 'COMPLETED'
            ? 'Evaluation complete'
            : visible.stage.replaceAll('_', ' ').toLowerCase()}
        </strong>
        <span className="badge">
          {visible.status === 'RUNNING' ? 'In progress' : 'View activity'}
        </span>
      </summary>
      <div className="evaluation-events">
        {visible.events.map((event, i) => (
          <div className="evaluation-event" key={i}>
            <small>{new Date(event.at).toLocaleTimeString()}</small>
            <span>{event.message}</span>
          </div>
        ))}
      </div>
      {visible.error && <p>{visible.error}</p>}
    </details>
  ) : busy ? (
    <div className="evaluation-progress">Submitting evaluation request…</div>
  ) : null;
}
