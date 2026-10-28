import Link from 'next/link';
import {
  ArrowRight,
  Check,
  FileCheck2,
  Layers3,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
export default function Landing() {
  return (
    <div className="landing">
      <nav className="public-nav">
        <Link className="brand" href="/">
          <Layers3 size={27} />
          <span>
            Proof<span className="blue">Pay</span>
          </span>
        </Link>
        <div>
          <Link href="#how-it-works">How it works</Link>
          <Link href="/legal">Trust & privacy</Link>
          <Link href="/signin">Sign in</Link>
          <Link className="btn primary small" href="/signup">
            Get started <ArrowRight size={16} />
          </Link>
        </div>
      </nav>
      <main>
        <section className="hero">
          <div className="eyebrow">
            <span className="live-dot" /> FROM AGREEMENT TO ACCEPTANCE
          </div>
          <h1>
            Great work deserves
            <br />
            <span className="blue">a clear finish line.</span>
          </h1>
          <p>
            Agree on what matters. Review the evidence.
            <br />
            Accept with confidence, then pay through PayPal sandbox.
          </p>
          <div className="hero-actions">
            <Link className="btn primary" href="/signup">
              Create your workspace <ArrowRight size={18} />
            </Link>
            <Link className="btn" href="/sample">
              Explore a sample review
            </Link>
          </div>
          <div className="hero-note">
            <ShieldCheck size={15} /> Human decisions. Traceable evidence. No escrow.
          </div>
          <div className="hero-preview">
            <div className="preview-top">
              <div className="traffic">
                <i />
                <i />
                <i />
              </div>
              <span>Portfolio website / Milestone 01</span>
              <span className="badge">SAMPLE REVIEW</span>
            </div>
            <div className="preview-body">
              <div className="preview-sidebar">
                <Layers3 size={24} />
                <span className="preview-nav active">Projects</span>
                <span className="preview-nav">Reviews</span>
                <span className="preview-nav">Payments</span>
              </div>
              <div className="preview-main">
                <div className="eyebrow">ACCEPTANCE EVIDENCE</div>
                <h2>Every conclusion has a source.</h2>
                <p className="muted">Homepage & project gallery · Specification v1</p>
                {[
                  ['Homepage content', 'Text artifact check', 'Passed'],
                  ['Project gallery', 'JSON artifact check', 'Passed'],
                  ['Mobile layout', 'Human review required', 'Needs review'],
                ].map(([title, method, status]) => (
                  <div className="sample-row" key={title}>
                    <span className={`round-icon ${status === 'Passed' ? 'green' : 'amber'}`}>
                      <Check size={16} />
                    </span>
                    <div>
                      <strong>{title}</strong>
                      <small>{method}</small>
                    </div>
                    <span className={`badge ${status === 'Passed' ? 'green' : 'amber'}`}>
                      {status}
                    </span>
                  </div>
                ))}
                <div className="ai-note">
                  <Sparkles size={19} />
                  <span>
                    AI helps explain the evidence.
                    <br />
                    <strong>You make the acceptance decision.</strong>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>
        <section className="how" id="how-it-works">
          <div className="eyebrow">LESS AMBIGUITY. MORE MOMENTUM.</div>
          <h2>A shared definition of done.</h2>
          <div className="feature-grid">
            {[
              [
                FileCheck2,
                '01',
                'Agree on the outcome',
                'Turn scope into explicit, editable criteria. Both parties confirm the same version.',
              ],
              [
                Sparkles,
                '02',
                'Follow the evidence',
                'Upload artifacts, run supported checks, and trace observations back to their sources.',
              ],
              [
                LockKeyhole,
                '03',
                'Accept, then pay',
                'The client reviews and accepts. PayPal confirms a separate sandbox merchant payment.',
              ],
            ].map(([Icon, num, title, copy]) => {
              const Component = Icon as typeof FileCheck2;
              return (
                <article key={String(num)}>
                  <Component size={25} />
                  <small>{String(num)}</small>
                  <h3>{String(title)}</h3>
                  <p>{String(copy)}</p>
                </article>
              );
            })}
          </div>
        </section>
        <section className="closing">
          <h2>Clarity is good for both sides.</h2>
          <p>One workspace for clients and freelancers. One auditable path to acceptance.</p>
          <Link className="btn primary" href="/signup">
            Start a project <ArrowRight size={17} />
          </Link>
        </section>
      </main>
      <footer>
        <Link className="brand" href="/">
          Proof<span className="blue">Pay</span>
        </Link>
        <span>Prototype · PayPal sandbox · No escrow · No PayPal endorsement</span>
        <Link href="/legal">Terms & privacy</Link>
      </footer>
    </div>
  );
}
