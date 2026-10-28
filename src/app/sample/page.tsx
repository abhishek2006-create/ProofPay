import Link from 'next/link';
import { Check, Layers3, Sparkles } from 'lucide-react';
export default function Sample() {
  return (
    <main className="sample-page">
      <nav>
        <Link href="/" className="brand">
          <Layers3 />
          Proof<span className="blue">Pay</span>
        </Link>
        <Link className="btn primary small" href="/signup">
          Create an account
        </Link>
      </nav>
      <span className="eyebrow">FICTIONAL EXAMPLE · NO LIVE CHECKS OR PAYMENTS</span>
      <h1>A review you can follow.</h1>
      <p className="muted">Portfolio website · Homepage & project gallery · Specification v1</p>
      <div className="alert info">
        This is an illustrative sample. These rows do not represent executed checks. The workspace
        runs actual artifact checks after evidence submission.
      </div>
      <section className="panel">
        <h2>Acceptance evidence</h2>
        {[
          ['Homepage content', 'Text artifact contains agreed heading', 'Passed (illustrative)'],
          ['Project gallery', 'JSON artifact declares galleryCount=4', 'Passed (illustrative)'],
          ['Mobile layout', 'Client inspects screenshot at agreed viewport', 'Needs human review'],
        ].map(([title, description, result]) => (
          <div className="sample-row" key={title}>
            <span className="round-icon green">
              <Check size={16} />
            </span>
            <div>
              <strong>{title}</strong>
              <small>{description}</small>
            </div>
            <span className="badge">{result}</span>
          </div>
        ))}
      </section>
      <section className="panel ai-panel">
        <h2>
          <Sparkles size={19} /> An explanation, with boundaries.
        </h2>
        <p>
          A text match confirms that a string exists in an uploaded artifact. A JSON comparison
          confirms an agreed field value. Neither proves that a deployed website renders correctly
          or its backend works. Those behaviors remain subject to human review.
        </p>
        <div className="disclosure">
          AI-assisted review is advisory. Only the client can accept a milestone. Sandbox checkout
          follows acceptance and pays the configured merchant; ProofPay provides no escrow.
        </div>
      </section>
      <Link className="btn" href="/">
        Back to the overview
      </Link>
    </main>
  );
}
