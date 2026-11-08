'use client';
import { useState } from 'react';
import Link from 'next/link';
import GraphConnections from './graph-connections';
import {
  ArrowUpRight,
  Check,
  FileText,
  GitBranch,
  Layers3,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
const nodes = [
  {
    title: 'Requirements',
    subtitle: 'A shared definition of done',
    meta: 'SPECIFICATION V1.0',
    Icon: FileText,
    state: 'Agreed',
    detail:
      'Three versioned criteria define homepage content, project gallery data, and responsive layout. Both parties review the same specification.',
  },
  {
    title: 'Submitted evidence',
    subtitle: 'Every artifact, connected.',
    meta: 'GITHUB · FIGMA · FILES',
    Icon: GitBranch,
    state: 'Submitted',
    detail:
      'Sample homepage text and gallery JSON are linked to their criteria. A design link provides context; visual fidelity still needs human inspection.',
  },
  {
    title: 'AI verification',
    subtitle: 'Reasoning you can inspect.',
    meta: '02 / 03 CHECKS PASSED',
    Icon: Sparkles,
    state: 'Needs review',
    detail:
      'Homepage content: required sections found. Gallery data: expected entries present. Mobile layout: text and JSON cannot establish visual responsiveness; human inspection is required.',
  },
  {
    title: 'Approval & payment',
    subtitle: 'You make the final call.',
    meta: 'PAYPAL SANDBOX',
    Icon: ShieldCheck,
    state: 'Awaiting approval',
    detail:
      'The client reviews the evidence and records an acceptance decision. PayPal sandbox checkout is a separate step after acceptance; no funds are held by ProofPay.',
  },
];
export function StatusBadge({
  children,
  warning = false,
  neutral = false,
}: {
  children: React.ReactNode;
  warning?: boolean;
  neutral?: boolean;
}) {
  return (
    <span className={`graph-status ${warning ? 'warning' : neutral ? 'neutral' : ''}`}>
      <i />
      {children}
    </span>
  );
}
export default function EvidenceGraph() {
  const [selected, setSelected] = useState<number | null>(null);
  return (
    <div className="evidence-console">
      <header className="console-header">
        <div className="console-title">
          <Layers3 size={16} />
          <span>Acceptance evidence graph</span>
          <span className="console-slash">/</span>
          <span className="mono">PORTFOLIO WEBSITE</span>
        </div>
        <StatusBadge>Sample review</StatusBadge>
      </header>
      <div className="console-toolbar">
        <span>
          <i className="live-dot" /> MILESTONE 01 <b>Homepage & project gallery</b>
        </span>
        <span className="mono">SPEC v1.0 / $1,250.00 USD</span>
      </div>
      <div className="graph-stage">
        <div className="graph-grid" aria-hidden="true" />
        <div className="graph-nodes">
          <GraphConnections />
          {nodes.map(({ title, subtitle, meta, Icon, state }, i) => (
            <button
              key={title}
              onClick={() => setSelected(i)}
              className={`graph-node ${i === 2 ? 'flagged' : ''} ${selected === i ? 'selected' : ''}`}
              aria-expanded={selected === i}
              aria-controls={selected === i ? 'graph-inspector' : undefined}
            >
              <span className="node-top">
                <span className="node-icon">
                  <Icon size={20} />
                </span>
                <span className="mono">
                  0{i + 1} <ArrowUpRight size={12} />
                </span>
              </span>
              <small className="mono">{meta}</small>
              <h3>{title}</h3>
              <p>{subtitle}</p>
              <StatusBadge warning={i === 2} neutral={i === 3}>
                {state}
              </StatusBadge>
              <span className="node-port" />
            </button>
          ))}
        </div>
        <div className="graph-caption">
          <span>
            <Check size={12} /> TRACEABLE BY DESIGN
          </span>
          <span>
            Click a node to inspect its evidence <ArrowUpRight size={12} />
          </span>
        </div>
      </div>
      <div className="console-metrics">
        <div>
          <span className="mono">CHECKS PASSED</span>
          <strong>
            02<span> / 03</span>
          </strong>
        </div>
        <div>
          <span className="mono">EVIDENCE SOURCES</span>
          <strong>
            03<span> linked artifacts</span>
          </strong>
        </div>
        <div>
          <span className="mono">HUMAN REVIEW</span>
          <strong className="amber-text">
            01<span> inspection needed</span>
          </strong>
        </div>
        <div className="console-signature">
          <ShieldCheck size={23} />
          <span>
            Nothing paid
            <br />
            <b>without your approval.</b>
          </span>
        </div>
      </div>
      {selected !== null && (
        <aside
          id="graph-inspector"
          className="graph-inspector"
          aria-label={`${nodes[selected].title} inspection`}
        >
          <div>
            <span className="eyebrow">EVIDENCE INSPECTOR · SAMPLE</span>
            <button
              className="icon-button"
              aria-label="Close inspector"
              onClick={() => setSelected(null)}
            >
              <X size={18} />
            </button>
          </div>
          <h3>{nodes[selected].title}</h3>
          <StatusBadge warning={selected === 2} neutral={selected === 3}>
            {nodes[selected].state}
          </StatusBadge>
          <p>{nodes[selected].detail}</p>
          {selected === 2 && (
            <div className="inspection-checks">
              <span>
                <Check size={14} /> Homepage content · passed
              </span>
              <span>
                <Check size={14} /> Gallery schema · passed
              </span>
              <span className="amber-text">○ Responsive layout · manual review</span>
            </div>
          )}
          <Link className="btn primary" href="/sample">
            Review sample milestone <ArrowUpRight size={15} />
          </Link>
          <small>
            Inspect and approve in the review workspace. This preview cannot release a payment.
          </small>
        </aside>
      )}
    </div>
  );
}
