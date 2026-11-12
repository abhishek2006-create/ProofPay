'use client';
import { useState } from 'react';
import { ArrowUpRight, FileText, GitBranch, ShieldCheck, Sparkles, X } from 'lucide-react';
import type { MilestoneView } from '@/lib/ui-types';
import { StatusBadge } from './evidence-graph';
import GraphConnections from './graph-connections';
export default function MilestoneGraph({
  milestone: m,
  onApprove,
  canApprove,
  busy,
}: {
  milestone: MilestoneView;
  onApprove: () => void;
  canApprove: boolean;
  busy: boolean;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const spec = m.specifications[0],
    submission = m.submissions[0],
    run = m.runs[0];
  const passed = run?.results.filter((r) => r.status === 'pass').length ?? 0;
  const total = spec.requirements.length;
  const stages = [
    {
      title: 'Requirements',
      Icon: FileText,
      meta: `SPECIFICATION V${m.currentVersion}`,
      state: spec.clientAgreedAt && spec.freelancerAgreedAt ? 'Agreed' : 'Pending agreement',
      copy: `${total} acceptance criteria`,
      warning: false,
    },
    {
      title: 'Submitted evidence',
      Icon: GitBranch,
      meta: submission?.commitSha?.slice(0, 12) ?? 'EVIDENCE VAULT',
      state: submission ? 'Submitted' : 'Awaiting evidence',
      copy: `${submission?.evidence.length ?? 0} linked artifacts`,
      warning: false,
    },
    {
      title: 'AI verification',
      Icon: Sparkles,
      meta: run?.modelProvider ?? 'VERIFICATION',
      state: run ? (passed === total ? 'Checks passed' : 'Needs review') : 'Not run',
      copy: `${passed} / ${total} checks passed`,
      warning: !!run && passed < total,
    },
    {
      title: 'Approval & payment',
      Icon: ShieldCheck,
      meta: 'PAYPAL SANDBOX',
      state:
        m.payment?.status === 'PAID'
          ? 'Payment confirmed'
          : m.status === 'ACCEPTED'
            ? 'Accepted'
            : 'Awaiting approval',
      copy: 'Human decision required',
      warning: false,
    },
  ];
  return (
    <section
      className="evidence-console live-milestone-graph"
      aria-label="Milestone evidence graph"
    >
      <header className="console-header">
        <span className="console-title">
          <GitBranch size={16} /> Acceptance evidence graph
        </span>
        <span className="mono">LIVE MILESTONE DATA</span>
      </header>
      <div className="graph-stage">
        <div className="graph-grid" aria-hidden="true" />
        <div className="graph-nodes">
          <GraphConnections />
          {stages.map(({ title, Icon, meta, state, copy, warning }, i) => (
            <button
              className={`graph-node ${warning ? 'flagged' : ''} ${selected === i ? 'selected' : ''}`}
              key={title}
              onClick={() => setSelected(i)}
              aria-expanded={selected === i}
            >
              <span className="node-top">
                <span className="node-icon">
                  <Icon size={20} />
                </span>
                <ArrowUpRight size={12} />
              </span>
              <small className="mono">{meta}</small>
              <h3>{title}</h3>
              <p>{copy}</p>
              <StatusBadge
                warning={warning}
                neutral={
                  state.startsWith('Awaiting') || state.startsWith('Pending') || state === 'Not run'
                }
              >
                {state}
              </StatusBadge>
              <span className="node-port" />
            </button>
          ))}
        </div>
        <div className="graph-caption">
          <span>VERSIONED · TRACEABLE · HUMAN-APPROVED</span>
          <span>Select a node to inspect</span>
        </div>
      </div>
      {selected !== null && (
        <aside className="graph-inspector" aria-label={`${stages[selected].title} details`}>
          <div>
            <span className="eyebrow">MILESTONE INSPECTOR</span>
            <button
              className="icon-button"
              aria-label="Close milestone inspector"
              onClick={() => setSelected(null)}
            >
              <X size={18} />
            </button>
          </div>
          <h3>{stages[selected].title}</h3>
          <StatusBadge warning={stages[selected].warning}>{stages[selected].state}</StatusBadge>
          {selected === 0 &&
            spec.requirements.map((r) => (
              <p key={r.id}>
                {r.description}
                <small className="inspection-source">
                  {r.method.replaceAll('_', ' ')} · {r.evidenceRequired}
                </small>
              </p>
            ))}
          {selected === 1 &&
            (submission ? (
              <>
                <p>{submission.notes || 'No submission notes.'}</p>
                {submission.evidence.map((e) => (
                  <a key={e.id} className="inspection-artifact" href={`/api/v1/evidence/${e.id}`}>
                    {e.filename}
                    <small className="mono">SHA-256 {e.sha256.slice(0, 16)}…</small>
                  </a>
                ))}
              </>
            ) : (
              <p>No evidence has been submitted.</p>
            ))}
          {selected === 2 &&
            (run ? (
              <>
                <p>
                  {passed} of {total} criteria passed (
                  {total ? Math.round((passed / total) * 100) : 0}%).
                </p>
                {run.results.map((r) => (
                  <div className="inspection-result" key={r.requirementId}>
                    <StatusBadge warning={r.status !== 'pass'}>{r.status}</StatusBadge>
                    <p>{r.explanation}</p>
                    <small>{r.limitations}</small>
                  </div>
                ))}
              </>
            ) : (
              <p>Verification results will appear after checks have run.</p>
            ))}
          {selected === 3 && (
            <>
              <p>
                {m.decisions[0]?.comment ||
                  'Review the evidence before recording an acceptance decision. Acceptance and PayPal sandbox checkout are separate steps.'}
              </p>
              {canApprove && (
                <button className="btn primary" onClick={onApprove} disabled={busy}>
                  Approve milestone <ArrowUpRight size={15} />
                </button>
              )}
              <small>
                PayPal checkout is available in the payment panel after acceptance. ProofPay does
                not hold funds.
              </small>
            </>
          )}
        </aside>
      )}
    </section>
  );
}
