import Link from 'next/link';
export default function Legal() {
  return (
    <main className="legal-page">
      <Link className="back" href="/">
        ← Back to ProofPay
      </Link>
      <span className="eyebrow">PROTOTYPE DISCLOSURES · OCTOBER 28, 2026</span>
      <h1>Clarity includes the fine print.</h1>
      <p>
        These prototype terms and notices describe the current software. They are not a substitute
        for legal review. Operator identity, support contact, applicable jurisdiction, and a
        production retention schedule have not been established and remain placeholders.
      </p>
      <h2>What ProofPay does</h2>
      <p>
        ProofPay organizes project criteria, evidence, automated checks, AI observations, and human
        acceptance decisions. AI outputs and automated checks may be incomplete or incorrect and are
        not legal, financial, or contractual determinations. Clients remain responsible for
        reviewing evidence and deciding whether to accept work.
      </p>
      <h2>Acceptance and payment are separate</h2>
      <p>
        ProofPay does not provide escrow, guarantee deliverable quality or payment, or resolve legal
        disputes. The prototype uses PayPal sandbox. A sandbox buyer pays the explicitly configured
        merchant. A completed merchant payment does not establish that a freelancer received a
        payout. PayPal transactions remain subject to PayPal’s terms, availability, eligibility, and
        confirmed state. ProofPay is not endorsed by PayPal.
      </p>
      <h2>Your project agreement</h2>
      <p>
        Both parties review the milestone’s deliverables, amount, currency, due date, criteria and
        evidence requirements. Agreement is tied to a recorded specification version. Clients may
        request revisions after reviewing submissions. Earlier evidence and decisions remain in the
        project history. Changes to an agreed scope require a new milestone. The application does
        not determine whether generated terms form a legally binding contract.
      </p>
      <h2>Accounts and access</h2>
      <p>
        Use an account you are authorized to operate and protect your password. Clients may access
        their own projects; freelancers may access projects assigned to them. Do not upload secrets,
        harmful content, unauthorized personal information, or materials you do not have permission
        to share. Access to a prototype can end when the operator discontinues it; no uptime
        commitment or refund guarantee is made.
      </p>
      <h2>What data is stored</h2>
      <p>
        The database stores your display name, email, password hash, role, preferences, projects,
        criteria, private evidence files, file hashes, reports, decisions, PayPal references and
        audit events. Session cookies support authentication. Hashed rate-limit identifiers are
        retained for abuse prevention. Evidence files can be downloaded only by authenticated
        project members. No external analytics or advertising tracker is included.
      </p>
      <h2>AI processing</h2>
      <p>
        When you explicitly request AI criteria, milestone deliverables are sent to the configured
        provider. When a submitted milestone is checked and AI is configured, submission notes and
        deterministic check summaries, criterion IDs and evidence IDs are sent for an advisory
        report. Client-authorized requirements text is sent for embeddings and grounded criteria.
        Retrieved passages and authorized bounded repository excerpts may be sent for advisory
        review. Raw evidence file bytes are not sent to the model. Provider identity, model, region
        and provider retention depend on the operator’s configuration. Review the provider’s terms
        before enabling it; ProofPay does not authorize training on private evidence.
      </p>
      <h2>PayPal and optional integrations</h2>
      <p>
        PayPal receives the agreed amount, currency, description, merchant identity and payment
        references. Elastic, when configured and both members opt in, receives milestone titles,
        criterion descriptions and project IDs. Zapier, when the client opts in and manually
        dispatches pending events, receives only acceptance event IDs, project IDs, milestone IDs
        and event type. Optional integrations cannot authorize payment. Hosting and database
        providers process stored application data; the chosen deployment may transfer data across
        borders.
      </p>
      <h2>Retention, deletion and security</h2>
      <p>
        Local data remains until the database is removed by its operator. The prototype has no
        automated account deletion or production retention policy. For a hosted deployment, the
        operator must supply a contact and process for access, deletion and privacy requests before
        collecting real personal information. Revoking Elastic consent excludes search results
        immediately; previously indexed documents require operator deletion. Database backups and
        external provider retention must also be considered. Security controls reduce risk but
        cannot guarantee protection.
      </p>
      <h2>Disputes and production use</h2>
      <p>
        Clients and freelancers must resolve scope, quality, intellectual property and payment
        disputes through their own agreed process and applicable services. No legal compliance
        certification, warranty, governing-law selection, or limitation of rights is asserted.
        Obtain appropriate legal, security and privacy review before production use.
      </p>
      <Link className="btn primary" href="/dashboard">
        Return to workspace
      </Link>
    </main>
  );
}
