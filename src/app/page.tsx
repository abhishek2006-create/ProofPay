import Link from 'next/link';
import { ArrowUpRight, Layers3, ShieldCheck, GitBranch, Fingerprint, ScanLine } from 'lucide-react';
import EvidenceGraph from '@/components/evidence-graph';
import ImmersiveScene from '@/components/immersive-scene';
export default function Landing() {
  return (
    <ImmersiveScene>
      <nav className="cinema-nav" aria-label="Main navigation">
        <Link className="brand" href="/">
          <Layers3 size={28} />
          <span>
            Proof<span className="blue">Pay</span>
          </span>
        </Link>
        <div className="cinema-links">
          <a href="#use-cases">Use cases</a>
          <a href="#evidence-graph">Evidence graph</a>
          <a href="#access">Pricing</a>
        </div>
        <div className="nav-end">
          <span className="system-status">
            <i /> Sandbox mode
          </span>
          <Link className="btn small" href="/signin">
            Open workspace <ArrowUpRight size={15} />
          </Link>
        </div>
      </nav>
      <main>
        <section className="cinema-hero" id="proofpay-hero">
          <div className="announcement">
            <span className="live-dot" /> Now with AI Milestone Verification{' '}
            <ArrowUpRight size={13} />
          </div>
          <h1>
            Every payment
            <br />
            should have <span>proof.</span>
          </h1>
          <p>
            Great work. Clear evidence. Confident payments.
            <br />
            Connect your deliverables to a shared definition of done —
            <br className="desktop-break" /> and move from “looks good” to verified.
          </p>
          <div className="hero-actions">
            <Link className="btn primary" href="/signup">
              Start Verifying <ArrowUpRight size={17} />
            </Link>
            <a className="btn" href="#evidence-graph">
              <GitBranch size={16} /> Explore Interactive Graph
            </a>
          </div>
          <div className="cinema-trust">
            <ShieldCheck size={13} /> Human-approved. Evidence-backed. Always traceable.
          </div>
        </section>
        <section className="graph-showcase" id="evidence-graph" data-reveal>
          <div className="graph-section-intro">
            <span className="eyebrow">A CONNECTED CHAIN OF CONFIDENCE</span>
            <h2>Follow the proof.</h2>
            <p>From the first requirement to the final approval. Every connection tells a story.</p>
          </div>
          <EvidenceGraph />
        </section>
        <div className="signal-strip" data-reveal>
          <span>BUILT FOR THE WAY YOU DELIVER</span>
          <strong>GitHub</strong>
          <strong>Figma</strong>
          <strong>
            PayPal <small>Sandbox</small>
          </strong>
          <span className="mono">ONE CONNECTED WORKFLOW ↗</span>
        </div>
        <section className="cinema-section" id="use-cases">
          <div className="section-intro" data-reveal>
            <span className="eyebrow">THE END OF “TRUST ME”</span>
            <h2>
              From deliverable
              <br />
              to undeniable.
            </h2>
            <p>
              A shared source of truth for independent teams.
              <br />
              Less back-and-forth. More moving forward.
            </p>
          </div>
          <div className="cinema-features">
            {[
              {
                Icon: Fingerprint,
                n: '01',
                title: 'Agree on what done means.',
                copy: 'Define versioned acceptance criteria before work begins. One agreement. No moving targets.',
              },
              {
                Icon: ScanLine,
                n: '02',
                title: 'Let the evidence speak.',
                copy: 'Connect artifacts, inspect supported checks, and follow every observation back to its source.',
              },
              {
                Icon: ShieldCheck,
                n: '03',
                title: 'Your approval. Your control.',
                copy: 'AI informs the review. A human makes the decision. Accepted milestones move to PayPal sandbox checkout.',
              },
            ].map(({ Icon, n, title, copy }) => (
              <article
                key={n}
                data-reveal
                style={{ '--reveal-delay': `${Number(n) * 90}ms` } as React.CSSProperties}
              >
                <div className="feature-art">
                  <Icon size={35} />
                  <span className="art-orbit" />
                </div>
                <small className="mono">/{n}</small>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="trust-section cinema-section" data-reveal>
          <div className="section-intro">
            <span className="eyebrow">TRUST IS A PROCESS. NOT A PROMISE.</span>
            <h2>
              Designed to be
              <br />
              held accountable.
            </h2>
            <p>
              Clear boundaries at every step.
              <br />
              Your work deserves more than a black box.
            </p>
          </div>
          <div className="trust-metrics">
            <article>
              <span className="mono">EVIDENCE INTEGRITY</span>
              <strong>SHA-256</strong>
              <p>A content hash for every uploaded artifact.</p>
              <span className="trust-meter" />
            </article>
            <article>
              <span className="mono">ACCEPTANCE AUTHORITY</span>
              <strong>Human</strong>
              <p>AI supports the review. You own the decision.</p>
              <span className="trust-meter" />
            </article>
            <article className="warm-card">
              <span className="mono">PAYMENT ENVIRONMENT</span>
              <strong>Sandbox</strong>
              <p>PayPal checkout follows explicit acceptance.</p>
              <span className="trust-meter" />
            </article>
          </div>
        </section>
        <section className="pricing-section cinema-section" id="access" data-reveal>
          <div className="section-intro">
            <span className="eyebrow">START WITH CLARITY</span>
            <h2>
              Your next milestone.
              <br />A better way forward.
            </h2>
            <p>
              Explore the working prototype.
              <br />
              No subscription billing is enabled.
            </p>
          </div>
          <div className="pricing-grid">
            <article className="price-card">
              <span className="mono">EXPLORE</span>
              <h3>See the proof.</h3>
              <div className="price-amount">
                $0 <span>/ sample access</span>
              </div>
              <p>Follow an illustrative review before creating your workspace.</p>
              <ul>
                <li>Interactive evidence graph</li>
                <li>Transparent verification reasoning</li>
                <li>No account required</li>
              </ul>
              <Link className="btn" href="/sample">
                Explore sample review <ArrowUpRight size={17} />
              </Link>
            </article>
            <article className="price-card featured-price">
              <span className="price-tag">PROTOTYPE ACCESS</span>
              <span className="mono">BUILD TOGETHER</span>
              <h3>Make it your workflow.</h3>
              <div className="price-amount">
                $0 <span>/ prototype access</span>
              </div>
              <p>One shared workspace for agreements, evidence, and acceptance.</p>
              <ul>
                <li>Versioned milestone criteria</li>
                <li>Private evidence & supported checks</li>
                <li>Human approval & PayPal sandbox</li>
              </ul>
              <Link className="btn primary" href="/signup">
                Create your workspace <ArrowUpRight size={17} />
              </Link>
              <small>Prototype access; future pricing has not been announced.</small>
            </article>
          </div>
        </section>
        <section className="cinema-access" data-reveal>
          <span className="eyebrow">YOUR NEXT MILESTONE STARTS HERE</span>
          <h2>
            Make confidence
            <br />
            part of the workflow.
          </h2>
          <p>
            Explore the prototype. No subscription checkout.
            <br />
            Payments run in PayPal sandbox; ProofPay does not hold funds.
          </p>
          <Link className="btn primary" href="/signup">
            Create your workspace <ArrowUpRight size={17} />
          </Link>
          <Link className="text-button" href="/sample">
            Or explore a sample review →
          </Link>
        </section>
      </main>
      <footer>
        <Link className="brand" href="/">
          Proof<span className="blue">Pay</span>
        </Link>
        <span>Evidence first. Confidence follows.</span>
        <Link href="/legal">Trust, terms & privacy ↗</Link>
      </footer>
    </ImmersiveScene>
  );
}
