'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  CircleCheck,
  Clock3,
  CreditCard,
  FileCheck2,
  FileText,
  FolderKanban,
  Layers3,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import EvidenceGrid from './evidence-grid';
import { api } from '@/lib/client-api';
import {
  RequirementsDocuments,
  GroundedCriteriaTools,
  type DraftCriterion,
} from './requirements-documents';
import { EvaluationReport, EvaluationProgress } from './evaluation-report';
import './workspace.css';
import type { MilestoneView, ProjectView, SettingsView, UserView } from '@/lib/ui-types';
type View = 'Projects' | 'Reviews' | 'Payments' | 'Activity' | 'Settings';
type Modal =
  | { type: 'project' }
  | { type: 'milestone'; project: ProjectView }
  | { type: 'specification'; project: ProjectView; milestone: MilestoneView }
  | { type: 'evidence'; project: ProjectView; milestone: MilestoneView }
  | {
      type: 'decision';
      project: ProjectView;
      milestone: MilestoneView;
      decision: 'ACCEPTED' | 'REVISION_REQUESTED' | 'REJECTED';
    }
  | { type: 'agree'; project: ProjectView; milestone: MilestoneView }
  | null;
export function money(minor: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minor / 100);
}
function date(value: string) {
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
function statusLabel(status: string) {
  return status
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/^./, (c) => c.toUpperCase());
}
export default function Workspace({ user }: { user: UserView }) {
  const [projects, setProjects] = useState<ProjectView[]>([]),
    [view, setView] = useState<View>('Projects'),
    [projectId, setProjectId] = useState<string | null>(null),
    [milestoneId, setMilestoneId] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [query, setQuery] = useState(''),
    [filter, setFilter] = useState('all'),
    [sort, setSort] = useState('newest'),
    [modal, setModal] = useState<Modal>(null),
    [selectedCriterion, setSelectedCriterion] = useState<string | null>(null),
    [settings, setSettings] = useState<SettingsView | null>(null);
  const reload = useCallback(async () => {
    const [data, config] = await Promise.all([api('projects'), api('settings')]);
    setProjects(data.projects);
    setSettings(config);
  }, []);
  useEffect(() => {
    let active = true;
    Promise.all([api('projects'), api('settings')])
      .then(([data, config]) => {
        if (active) {
          setProjects(data.projects);
          setSettings(config);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function action(
    path: string,
    method = 'POST',
    data?: unknown,
    success = 'Saved successfully.',
  ) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api(path, method, data);
      await reload();
      setNotice(success);
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed.');
      return null;
    } finally {
      setBusy(false);
    }
  }
  const project = projects.find((p) => p.id === projectId),
    milestone = project?.milestones.find((m) => m.id === milestoneId);
  const all = projects.flatMap((p) => p.milestones.map((m) => ({ p, m })));
  const reviewCount = all.filter(({ m }) =>
    ['SUBMITTED', 'UNDER_REVIEW'].includes(m.status),
  ).length;
  const paymentReturn =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const returnedPayment = paymentReturn?.get('payment') ?? paymentReturn?.get('cancel');
  const returnMilestone = all.find(({ m }) => m.payment?.id === returnedPayment);
  function navigate(next: View) {
    setView(next);
    setProjectId(null);
    setMilestoneId(null);
    setQuery('');
    setSelectedCriterion(null);
  }
  function openMilestone(p: ProjectView, m: MilestoneView) {
    setProjectId(p.id);
    setMilestoneId(m.id);
    setSelectedCriterion(null);
  }
  const filtered = projects
    .filter(
      (p) =>
        `${p.title} ${p.description} ${p.client.name} ${p.freelancer.name}`
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        (filter === 'all' ||
          p.milestones.some((m) =>
            filter === 'review'
              ? ['SUBMITTED', 'UNDER_REVIEW'].includes(m.status)
              : filter === 'accepted'
                ? m.status === 'ACCEPTED' && m.payment?.status !== 'PAID'
                : m.payment?.status === 'PAID',
          )),
    )
    .sort((a, b) =>
      sort === 'title'
        ? a.title.localeCompare(b.title)
        : sort === 'oldest'
          ? a.createdAt.localeCompare(b.createdAt)
          : b.createdAt.localeCompare(a.createdAt),
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <Layers3 size={27} />
          Proof<span className="blue">Pay</span>
        </Link>
        <div className="workspace-name">
          <span className="workspace-avatar">{user.name.slice(0, 1)}</span>
          <div>
            <strong>My workspace</strong>
            <small>{statusLabel(user.role)} account</small>
          </div>
        </div>
        <span className="nav-caption">WORKSPACE</span>
        <nav>
          {(
            [
              [FolderKanban, 'Projects'],
              [FileCheck2, 'Reviews'],
              [CreditCard, 'Payments'],
              [Activity, 'Activity'],
              [Settings2, 'Settings'],
            ] as const
          ).map(([Icon, label]) => (
            <button
              aria-label={label}
              className={`nav-item ${view === label ? 'active' : ''}`}
              key={label}
              onClick={() => navigate(label)}
            >
              <Icon size={19} />
              <span className="nav-label">{label}</span>
              {label === 'Reviews' && reviewCount > 0 && (
                <span className="count">{reviewCount}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sandbox-card">
            <ShieldCheck size={20} />
            <strong>A space to test safely.</strong>
            <p>
              PayPal sandbox only.
              <br />
              ProofPay does not provide escrow.
            </p>
          </div>
          <div className="profile">
            <span className="avatar">
              {user.name
                .split(' ')
                .map((n) => n[0])
                .join('')
                .slice(0, 2)}
            </span>
            <div>
              <strong>{user.name}</strong>
              <small>{statusLabel(user.role)}</small>
            </div>
          </div>
          <button className="nav-item" onClick={() => signOut({ callbackUrl: '/' })}>
            <LogOut size={18} />
            Sign out
          </button>
        </div>
      </aside>
      <div className="workspace-content">
        <header className="app-header">
          <div className="breadcrumbs">
            <span className="muted">Workspace</span>
            <ChevronRight size={15} />
            <span>{project?.title ?? view}</span>
            {milestone && (
              <>
                <ChevronRight size={15} />
                <span>Milestone review</span>
              </>
            )}
          </div>
          <div className="header-actions">
            <span className="badge blue-badge">
              <span className="environment-dot" />
              SANDBOX
            </span>
            <div className="header-account">
              <span className="avatar">
                {user.name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .slice(0, 2)}
              </span>
              <span>
                {user.name}
                <small>{statusLabel(user.role)} workspace</small>
              </span>
            </div>
            <button
              className="mobile-signout icon-button"
              aria-label="Sign out"
              onClick={() => signOut({ callbackUrl: '/' })}
            >
              <LogOut size={19} />
            </button>
          </div>
        </header>
        <main className="workspace-main">
          {error && (
            <div className="alert error" role="alert">
              {error}
              <button onClick={() => setError('')} aria-label="Dismiss error">
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="alert success" role="status">
              {notice}
              <button onClick={() => setNotice('')} aria-label="Dismiss notification">
                <X size={16} />
              </button>
            </div>
          )}
          {returnMilestone && (
            <div className="alert info">
              <div>
                <strong>
                  {paymentReturn?.get('cancel')
                    ? 'Checkout was cancelled.'
                    : 'Returned from PayPal.'}
                </strong>
                <p>
                  A return URL does not confirm payment. Check the order, then explicitly confirm
                  capture if approved.
                </p>
              </div>
              <button
                className="btn small"
                disabled={busy}
                onClick={() => {
                  openMilestone(returnMilestone.p, returnMilestone.m);
                  window.history.replaceState({}, '', '/dashboard');
                }}
              >
                Review payment
              </button>
            </div>
          )}
          {loading ? (
            <div className="skeleton-layout" aria-label="Loading workspace">
              <div />
              <div />
              <div />
            </div>
          ) : view === 'Settings' ? (
            <SettingsPanel
              settings={settings}
              busy={busy}
              onSave={(data) => action('settings', 'PATCH', data, 'Preferences saved.')}
            />
          ) : milestone && project ? (
            <>
              <button className="back" onClick={() => setMilestoneId(null)}>
                <ArrowLeft size={16} /> Back to project
              </button>
              <MilestonePanel
                key={milestone.id}
                user={user}
                project={project}
                milestone={milestone}
                busy={busy}
                settings={settings}
                selectedCriterion={selectedCriterion}
                selectCriterion={setSelectedCriterion}
                openModal={setModal}
                action={action}
              />
            </>
          ) : project ? (
            <>
              <button className="back" onClick={() => setProjectId(null)}>
                <ArrowLeft size={16} /> All projects
              </button>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">PROJECT WORKSPACE</span>
                  <h1>{project.title}</h1>
                  <p>{project.description}</p>
                </div>
                {user.role === 'CLIENT' && (
                  <button
                    className="btn primary"
                    onClick={() => setModal({ type: 'milestone', project })}
                  >
                    <Plus size={17} />
                    New milestone
                  </button>
                )}
              </div>
              <div className="project-people">
                <span>
                  Client <strong>{project.client.name}</strong>
                </span>
                <ArrowRight size={17} />
                <span>
                  Freelancer <strong>{project.freelancer.name}</strong>
                </span>
                <span className="badge">{project.milestones.length} milestones</span>
              </div>
              <RequirementsDocuments
                projectId={project.id}
                client={user.id === project.clientId}
                documents={project.documents ?? []}
                onSaved={() =>
                  action('projects', 'GET', undefined, 'Requirements document stored.')
                }
              />
              <div className="section-heading">
                <h2>The path to done</h2>
                <span className="muted">Agree · Deliver · Review · Pay</span>
              </div>
              {!project.milestones.length ? (
                <Empty
                  icon={FileText}
                  title="Your first milestone starts here."
                  copy="Define the outcome, amount, due date, and acceptance criteria."
                />
              ) : (
                <div className="milestone-list">
                  {project.milestones.map((m, i) => (
                    <button
                      key={m.id}
                      className="milestone-row"
                      onClick={() => openMilestone(project, m)}
                    >
                      <span className="milestone-number">{String(i + 1).padStart(2, '0')}</span>
                      <div>
                        <strong>{m.title}</strong>
                        <small>
                          Due {date(m.dueDate)} · Specification v{m.currentVersion}
                        </small>
                      </div>
                      <span className="badge">{statusLabel(m.status)}</span>
                      <strong>{money(m.amountMinor, m.currency)}</strong>
                      <ChevronRight size={18} />
                    </button>
                  ))}
                </div>
              )}
              <div className="section-heading">
                <h2>Project activity</h2>
              </div>
              <AuditList projects={[project]} />
              <div className="integration-actions">
                <button
                  className="btn small"
                  disabled={busy || !settings?.services.elastic}
                  onClick={() =>
                    action(
                      `projects/${project.id}/index`,
                      'POST',
                      undefined,
                      'Criteria indexed in Elastic.',
                    )
                  }
                >
                  Index criteria in Elastic
                </button>
                <button
                  className="btn small"
                  disabled={busy || !settings?.services.zapier}
                  onClick={() =>
                    action(
                      `projects/${project.id}/notify`,
                      'POST',
                      undefined,
                      'Notification delivery attempted. Review delivery records for results.',
                    )
                  }
                >
                  Send pending Zapier events
                </button>
                <small>
                  Optional integrations require Settings consent and server credentials.
                </small>
              </div>
            </>
          ) : view === 'Projects' ? (
            <>
              <div className="page-heading overview-heading">
                <div>
                  <span className="eyebrow">WELCOME BACK, {user.name.split(' ')[0]}</span>
                  <h1>
                    Your projects<span className="blue">.</span>
                  </h1>
                  <p>
                    A little clarity. A lot of progress.
                    <br />
                    Keep your people, proof, and payments in sync.
                  </p>
                </div>
                {user.role === 'CLIENT' && (
                  <button className="btn primary" onClick={() => setModal({ type: 'project' })}>
                    <Plus size={18} />
                    New project
                  </button>
                )}
              </div>
              <div className="stats-grid">
                <Stat
                  icon={FolderKanban}
                  label="Active projects"
                  value={projects.length}
                  note="Your shared workspaces"
                />
                <Stat
                  icon={Clock3}
                  label="Awaiting review"
                  value={reviewCount}
                  note="Evidence ready to inspect"
                />
                <Stat
                  icon={CircleCheck}
                  label="Accepted, unpaid"
                  value={
                    all.filter(({ m }) => m.status === 'ACCEPTED' && m.payment?.status !== 'PAID')
                      .length
                  }
                  note="Acceptance precedes checkout"
                />
                <Stat
                  icon={CreditCard}
                  label="Confirmed payments"
                  value={all.filter(({ m }) => m.payment?.status === 'PAID').length}
                  note="Verified by the backend"
                />
              </div>
              <div className="section-heading project-library-heading">
                <div>
                  <h2>Your shared work</h2>
                  <p>From the first agreement to the final approval.</p>
                </div>
                <span className="badge">
                  {projects.length} project{projects.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="list-toolbar">
                <div className="search-field">
                  <Search size={17} />
                  <input
                    aria-label="Search projects"
                    placeholder="Search projects or people…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <select
                  aria-label="Filter projects"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">All projects</option>
                  <option value="review">Awaiting review</option>
                  <option value="accepted">Accepted, unpaid</option>
                  <option value="paid">Paid milestones</option>
                </select>
                <select
                  aria-label="Sort projects"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="title">Title A–Z</option>
                </select>
              </div>
              {!filtered.length ? (
                <Empty
                  icon={FolderKanban}
                  title={
                    projects.length ? 'No projects match your search.' : 'Make room for great work.'
                  }
                  copy={
                    projects.length
                      ? 'Try another search or filter.'
                      : user.role === 'CLIENT'
                        ? 'Create a project and invite a registered freelancer by email.'
                        : 'Your assigned projects will appear here when a client invites your account email.'
                  }
                />
              ) : (
                <div className="project-grid">
                  {filtered.map((p) => (
                    <button className="project-card" key={p.id} onClick={() => setProjectId(p.id)}>
                      <div className="project-card-top">
                        <span className="folder-icon">
                          <FolderKanban size={23} />
                        </span>
                        <span
                          className={`badge ${p.milestones.some((m) => ['SUBMITTED', 'UNDER_REVIEW'].includes(m.status)) ? 'amber' : p.milestones.length && p.milestones.every((m) => m.status === 'ACCEPTED') ? 'green' : 'blue-badge'}`}
                        >
                          {p.milestones.some((m) =>
                            ['SUBMITTED', 'UNDER_REVIEW'].includes(m.status),
                          )
                            ? 'Ready for review'
                            : p.milestones.length &&
                                p.milestones.every((m) => m.status === 'ACCEPTED')
                              ? 'Milestones accepted'
                              : 'In progress'}
                        </span>
                      </div>
                      <h3>{p.title}</h3>
                      <p>{p.description}</p>
                      <div className="project-progress-label">
                        <span>Milestone progress</span>
                        <strong>
                          {p.milestones.filter((m) => m.status === 'ACCEPTED').length} /{' '}
                          {p.milestones.length} accepted
                        </strong>
                      </div>
                      <div className="project-progress">
                        <span
                          style={{
                            width: `${p.milestones.length ? (p.milestones.filter((m) => m.status === 'ACCEPTED').length / p.milestones.length) * 100 : 0}%`,
                          }}
                        />
                      </div>
                      <div className="project-card-bottom">
                        <span className="project-collaborator">
                          <span className="collaborator-avatar">
                            {(user.role === 'CLIENT' ? p.freelancer.name : p.client.name)
                              .split(' ')
                              .map((n) => n[0])
                              .join('')
                              .slice(0, 2)}
                          </span>
                          {user.role === 'CLIENT' ? p.freelancer.name : p.client.name}
                        </span>
                        <span>
                          Open workspace <ArrowRight size={15} />
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <div className="workspace-tip">
                <ShieldCheck size={21} />
                <div>
                  <strong>The evidence informs. You decide.</strong>
                  <p>
                    AI and automated checks support review. Acceptance stays with the client;
                    payment is a separate step.
                  </p>
                </div>
              </div>
            </>
          ) : view === 'Activity' ? (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">A TRACEABLE RECORD</span>
                  <h1>Workspace activity.</h1>
                  <p>Agreements, submissions, decisions, and payment events.</p>
                </div>
              </div>
              <AuditList projects={projects} />
            </>
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">
                    {view === 'Reviews'
                      ? 'EVIDENCE BEFORE ACCEPTANCE'
                      : 'ACCEPTANCE BEFORE PAYMENT'}
                  </span>
                  <h1>{view === 'Reviews' ? 'Ready for a closer look.' : 'Payment history.'}</h1>
                  <p>
                    {view === 'Reviews'
                      ? 'Open a milestone to follow each conclusion to its evidence.'
                      : 'Only backend-verified PayPal states appear as paid.'}
                  </p>
                </div>
              </div>
              {all.filter(({ m }) =>
                view === 'Reviews'
                  ? ['SUBMITTED', 'UNDER_REVIEW', 'REVISION_REQUESTED'].includes(m.status)
                  : m.status === 'ACCEPTED',
              ).length === 0 ? (
                <Empty
                  icon={view === 'Reviews' ? FileCheck2 : CreditCard}
                  title={
                    view === 'Reviews'
                      ? 'Nothing is waiting for review.'
                      : 'No accepted milestones yet.'
                  }
                  copy="Your next steps will appear here as projects move forward."
                />
              ) : (
                <div className="milestone-list">
                  {all
                    .filter(({ m }) =>
                      view === 'Reviews'
                        ? ['SUBMITTED', 'UNDER_REVIEW', 'REVISION_REQUESTED'].includes(m.status)
                        : m.status === 'ACCEPTED',
                    )
                    .map(({ p, m }) => (
                      <button
                        className="milestone-row"
                        key={m.id}
                        onClick={() => openMilestone(p, m)}
                      >
                        <span className="folder-icon">
                          {view === 'Reviews' ? <FileCheck2 size={20} /> : <CreditCard size={20} />}
                        </span>
                        <div>
                          <strong>{m.title}</strong>
                          <small>{p.title}</small>
                        </div>
                        <span className="badge">
                          {view === 'Payments'
                            ? statusLabel(m.payment?.status ?? 'NOT_STARTED')
                            : statusLabel(m.status)}
                        </span>
                        <strong>{money(m.amountMinor, m.currency)}</strong>
                        <ChevronRight size={18} />
                      </button>
                    ))}
                </div>
              )}
            </>
          )}
        </main>
        <footer className="app-footer">
          <span>Clear requirements. Verifiable progress. Confident payments.</span>
          <Link href="/legal">Prototype terms & privacy</Link>
        </footer>
      </div>
      {modal && (
        <ModalForm
          modal={modal}
          busy={busy}
          settings={settings}
          close={() => setModal(null)}
          action={action}
        />
      )}
    </div>
  );
}
function Stat({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: typeof FolderKanban;
  label: string;
  value: number;
  note: string;
}) {
  return (
    <div className="stat">
      <div>
        <span>{label}</span>
        <Icon size={19} />
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}
function Empty({
  icon: Icon,
  title,
  copy,
}: {
  icon: typeof FolderKanban;
  title: string;
  copy: string;
}) {
  return (
    <div className="empty">
      <span>
        <Icon size={29} />
      </span>
      <h3>{title}</h3>
      <p>{copy}</p>
    </div>
  );
}
function AuditList({ projects }: { projects: ProjectView[] }) {
  const events = projects
    .flatMap((p) => p.auditEvents.map((e) => ({ ...e, project: p.title })))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return events.length ? (
    <div className="audit-list">
      {events.map((e) => (
        <div key={e.id}>
          <span className="audit-dot" />
          <div>
            <strong>{statusLabel(e.type)}</strong>
            <small>
              {e.project} · {e.actorId === 'paypal-webhook' ? 'PayPal webhook' : 'Workspace member'}
            </small>
            {typeof e.metadata.comment === 'string' && <p>{e.metadata.comment}</p>}
          </div>
          <time>
            {date(e.createdAt)} ·{' '}
            {new Date(e.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </time>
        </div>
      ))}
    </div>
  ) : (
    <Empty
      icon={Activity}
      title="A clean slate."
      copy="Your project history will appear here as work progresses."
    />
  );
}
type Action = (path: string, method?: string, data?: unknown, success?: string) => Promise<unknown>;
function MilestonePanel({
  user,
  project: p,
  milestone: m,
  busy,
  settings,
  selectedCriterion,
  selectCriterion,
  openModal,
  action,
}: {
  user: UserView;
  project: ProjectView;
  milestone: MilestoneView;
  busy: boolean;
  settings: SettingsView | null;
  selectedCriterion: string | null;
  selectCriterion: (id: string) => void;
  openModal: (m: Modal) => void;
  action: Action;
}) {
  const [tip, setTip] = useState(m.payment ? (m.payment.tipMinor / 100).toFixed(2) : '0.00');
  const spec = m.specifications[0],
    run = m.runs[0],
    submission = m.submissions[0];
  const results = run?.results ?? [];
  const requirement = spec.requirements.find((r) => r.id === selectedCriterion);
  const result = results.find((r) => r.requirementId === selectedCriterion);
  const client = user.id === p.clientId;
  const steps = ['Agreement', 'Submission', 'Checks', 'Review', 'Payment'];
  const step =
    m.status === 'DRAFT'
      ? 0
      : m.status === 'AGREED' || m.status === 'REVISION_REQUESTED'
        ? 1
        : m.status === 'SUBMITTED'
          ? 2
          : m.status === 'UNDER_REVIEW' || m.status === 'REJECTED'
            ? 3
            : 4;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">MILESTONE · SPECIFICATION V{m.currentVersion}</span>
          <h1>{m.title}</h1>
          <p>{m.description}</p>
        </div>
        <span className={`badge ${m.status === 'ACCEPTED' ? 'green' : 'blue-badge'}`}>
          {statusLabel(m.status)}
        </span>
      </div>
      <ol className="stepper">
        {steps.map((s, i) => (
          <li key={s} className={i <= step ? 'reached' : ''}>
            <span>{i < step ? <Check size={15} /> : i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
      <div className="review-layout">
        <div className="review-main">
          <EvaluationProgress milestoneId={m.id} busy={busy} initialJob={m.evaluations?.[0]} />
          {run?.report && <EvaluationReport report={run.report} />}
          {m.runs.length > 1 && (
            <section className="panel">
              <details>
                <summary>Evaluation report history ({m.runs.length - 1} earlier runs)</summary>
                {m.runs.slice(1).map((previous) => (
                  <details key={previous.id}>
                    <summary>
                      {date(previous.createdAt)} · submission {previous.submissionId} ·{' '}
                      {previous.modelProvider}
                    </summary>
                    {previous.report ? (
                      <EvaluationReport report={previous.report} />
                    ) : (
                      <p>{previous.summary}</p>
                    )}
                  </details>
                ))}
              </details>
            </section>
          )}
          <section className="panel">
            <div className="panel-heading">
              <h2>Acceptance criteria</h2>
              <span className="muted">
                {results.filter((r) => r.status === 'pass').length} / {spec.requirements.length}{' '}
                passed
              </span>
            </div>
            <p className="panel-caption">
              Select a row to inspect the evidence and limitations. Column headers support sorting
              and filtering.
            </p>
            <EvidenceGrid
              requirements={spec.requirements}
              results={results}
              onSelect={selectCriterion}
            />
            <div className="criterion-weights">
              {spec.requirements.map((r) => (
                <small key={r.id}>
                  {r.description} · weight {r.weight ?? 1}
                  {r.sourceChunkId
                    ? ` · cited source ${r.sourceChunkId}`
                    : ' · agreed specification'}
                </small>
              ))}
            </div>
            {requirement && (
              <div className="criterion-detail">
                <h3>{requirement.description}</h3>
                <dl>
                  <dt>Verification method</dt>
                  <dd>{statusLabel(requirement.method)}</dd>
                  <dt>Expected value</dt>
                  <dd>
                    {requirement.expected || 'Human assessment against the agreed description'}
                  </dd>
                  <dt>Evidence required</dt>
                  <dd>{requirement.evidenceRequired}</dd>
                </dl>
                <p>{result?.explanation ?? 'No check has run for this criterion.'}</p>
                <div className="alert info">
                  {result?.limitations ??
                    'Submitted evidence must be reviewed; file presence does not prove correctness.'}
                </div>
                {result?.evidenceIds.map((id) => {
                  const e = submission?.evidence.find((e) => e.id === id);
                  return (
                    e && (
                      <a className="evidence-link" key={id} href={`/api/v1/evidence/${id}`}>
                        <FileText size={16} />
                        {e.filename}
                        <small>SHA-256 {e.sha256.slice(0, 12)}…</small>
                      </a>
                    )
                  );
                })}
              </div>
            )}
            {m.status === 'DRAFT' && client && (
              <button
                className="btn small"
                onClick={() => openModal({ type: 'specification', project: p, milestone: m })}
              >
                Edit criteria · create next version
              </button>
            )}
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>
                <FileText size={18} />
                Evidence submissions
              </h2>
              <span className="muted">
                {m.submissions.length} version{m.submissions.length === 1 ? '' : 's'}
              </span>
            </div>
            {submission ? (
              <>
                <p className="muted">Latest submission · {date(submission.createdAt)}</p>
                <p className="preserve-lines">{submission.notes || 'No submission notes.'}</p>
                {submission.repositoryUrl && (
                  <div className="repository-submission">
                    <strong>GitHub submission</strong>
                    <p>{submission.repositoryUrl}</p>
                    <small>
                      Requested ref: {submission.repositoryRef} · Pinned commit:{' '}
                      {submission.commitSha}
                    </small>
                    <p>
                      Setup notes (untrusted; never executed on the host):{' '}
                      {submission.setupInstructions || 'None'}
                    </p>
                  </div>
                )}
                <div className="evidence-files">
                  {submission.evidence.map((e) => (
                    <a className="evidence-file" key={e.id} href={`/api/v1/evidence/${e.id}`}>
                      <FileText size={22} />
                      <strong>{e.filename}</strong>
                      <small>{e.mimeType} · Download privately</small>
                    </a>
                  ))}
                </div>
                <details>
                  <summary>Submission history</summary>
                  {m.submissions.map((s, i) => (
                    <div className="history-row" key={s.id}>
                      <strong>
                        {i === 0 ? 'Latest' : `Earlier submission ${m.submissions.length - i}`}
                      </strong>
                      <small>
                        {date(s.createdAt)} · {s.evidence.length} file(s)
                      </small>
                      <p>{s.notes}</p>
                    </div>
                  ))}
                </details>
              </>
            ) : (
              <p className="muted">
                No evidence submitted yet. Both parties must agree before delivery.
              </p>
            )}
          </section>
          <section className="panel ai-panel">
            <div className="panel-heading">
              <h2>
                <Sparkles size={19} />
                AI-assisted review
              </h2>
              <span className="badge">ADVISORY</span>
            </div>
            <p>{run?.summary ?? 'Run checks after a submission to produce a review report.'}</p>
            {run?.aiResults?.results.map((r) => (
              <div className="ai-result" key={r.requirementId}>
                <strong>
                  {spec.requirements.find((c) => c.id === r.requirementId)?.description}
                </strong>
                <p>{r.explanation}</p>
                <small>
                  {r.evidenceIds.join(', ') || 'No supporting evidence'} · {r.limitations}
                </small>
              </div>
            ))}
            <small>
              {run?.aiResults
                ? `Model: ${run.modelVersion} · ${run.aiResults.metadata?.mode ?? run.modelProvider} · ${run.aiResults.metadata?.promptVersion ?? 'legacy prompt'} · ${date(run.createdAt)}`
                : 'AI unavailable: no configured provider or no validated response. Deterministic checks remain available.'}
            </small>
            <div className="disclosure">
              AI outputs and checks may be incomplete or incorrect. They do not make acceptance or
              payment decisions.
            </div>
          </section>
          {m.decisions.length > 0 && (
            <section className="panel">
              <h2>Client decisions</h2>
              {m.decisions.map((d) => (
                <div className="history-row" key={d.id}>
                  <span className="badge">{statusLabel(d.decision)}</span>
                  <p>{d.comment}</p>
                  <small>{date(d.createdAt)}</small>
                </div>
              ))}
            </section>
          )}
        </div>
        <aside className="review-summary panel">
          <span className="eyebrow">MILESTONE SUMMARY</span>
          <h2>{m.title}</h2>
          <div className="price">
            {money(m.amountMinor, m.currency)}
            <small>{m.currency}</small>
          </div>
          <span className="badge amber">{statusLabel(m.status)}</span>
          <dl>
            <dt>Client</dt>
            <dd>{p.client.name}</dd>
            <dt>Freelancer</dt>
            <dd>{p.freelancer.name}</dd>
            <dt>Due date</dt>
            <dd>{date(m.dueDate)}</dd>
            <dt>Criteria version</dt>
            <dd>v{m.currentVersion}</dd>
          </dl>
          <div className="agreement-state">
            <strong>Shared agreement</strong>
            <span>{spec.clientAgreedAt ? '✓' : '○'} Client confirmed</span>
            <span>{spec.freelancerAgreedAt ? '✓' : '○'} Freelancer confirmed</span>
          </div>
          <div className="action-stack">
            {m.status === 'DRAFT' && (
              <button
                className="btn primary"
                disabled={busy || Boolean(client ? spec.clientAgreedAt : spec.freelancerAgreedAt)}
                onClick={() => openModal({ type: 'agree', project: p, milestone: m })}
              >
                Review & agree
              </button>
            )}
            {!client && ['AGREED', 'REVISION_REQUESTED'].includes(m.status) && (
              <button
                className="btn primary"
                onClick={() => openModal({ type: 'evidence', project: p, milestone: m })}
              >
                <Upload size={17} />
                Submit evidence
              </button>
            )}
            {['SUBMITTED', 'UNDER_REVIEW'].includes(m.status) && (
              <button
                className="btn"
                disabled={busy}
                onClick={() =>
                  action(
                    `milestones/${m.id}/verify`,
                    'POST',
                    undefined,
                    'Checks completed; review each criterion and its limitations.',
                  )
                }
              >
                <Sparkles size={17} />
                {busy ? 'Running checks…' : 'Run evidence checks'}
              </button>
            )}
            {client && m.status === 'UNDER_REVIEW' && (
              <>
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() =>
                    openModal({
                      type: 'decision',
                      project: p,
                      milestone: m,
                      decision: 'REVISION_REQUESTED',
                    })
                  }
                >
                  Request revisions
                </button>
                <button
                  className="btn primary"
                  disabled={busy}
                  onClick={() =>
                    openModal({ type: 'decision', project: p, milestone: m, decision: 'ACCEPTED' })
                  }
                >
                  Accept milestone
                </button>
                <button
                  className="btn danger"
                  disabled={busy}
                  onClick={() =>
                    openModal({ type: 'decision', project: p, milestone: m, decision: 'REJECTED' })
                  }
                >
                  Reject milestone
                </button>
              </>
            )}
            {m.status === 'ACCEPTED' && (
              <>
                {client && (
                  <div className="tip-fields">
                    <label>
                      Optional tip ({m.currency})
                      <input
                        name="tip"
                        inputMode="decimal"
                        pattern="[0-9]+\.[0-9]{2}"
                        value={tip}
                        disabled={Boolean(m.payment) || busy}
                        onChange={(e) => setTip(e.target.value)}
                      />
                    </label>
                    <p>Agreed milestone: {money(m.amountMinor, m.currency)}</p>
                    <strong>
                      Total:{' '}
                      {m.payment
                        ? money(m.payment.amountMinor, m.currency)
                        : /^\d+\.\d{2}$/.test(tip)
                          ? money(m.amountMinor + Math.round(Number(tip) * 100), m.currency)
                          : 'Enter a valid tip'}
                    </strong>
                    <small>
                      The backend validates and freezes base amount + tip when checkout starts.
                    </small>
                  </div>
                )}
                <div className="payment-state">
                  <CreditCard size={18} />
                  <strong>{statusLabel(m.payment?.status ?? 'Payment not started')}</strong>
                </div>
                {client && m.payment?.status !== 'PAID' && m.payment?.status !== 'REFUNDED' && (
                  <button
                    className="btn paypal"
                    disabled={busy || !settings?.services.paypal}
                    onClick={async () => {
                      const res = (await action(`milestones/${m.id}/order`, 'POST', { tip })) as {
                        approvalUrl?: string;
                      } | null;
                      if (res?.approvalUrl) window.location.assign(res.approvalUrl);
                    }}
                  >
                    Continue to PayPal sandbox <ArrowRight size={15} />
                  </button>
                )}
                {!settings?.services.paypal && (
                  <small>Sandbox credentials are missing. Checkout is unavailable.</small>
                )}
                {m.payment && (
                  <>
                    <button
                      className="btn"
                      disabled={busy}
                      onClick={() =>
                        action(
                          `milestones/${m.id}/reconcile`,
                          'POST',
                          undefined,
                          'Payment status reconciled with PayPal.',
                        )
                      }
                    >
                      Check payment status
                    </button>
                    {client && m.payment.status !== 'PAID' && m.payment.status !== 'REFUNDED' && (
                      <>
                        <button
                          className="btn primary"
                          disabled={busy}
                          onClick={() => {
                            if (
                              window.confirm(
                                'Capture this approved sandbox order for the agreed amount? This pays the configured merchant.',
                              )
                            )
                              void action(
                                `milestones/${m.id}/capture`,
                                'POST',
                                undefined,
                                'Capture checked with PayPal. Review the confirmed payment status.',
                              );
                          }}
                        >
                          Confirm sandbox capture
                        </button>
                        <button
                          className="btn small"
                          disabled={busy}
                          onClick={() =>
                            action(
                              `milestones/${m.id}/cancel`,
                              'POST',
                              undefined,
                              'Checkout marked cancelled after checking PayPal.',
                            )
                          }
                        >
                          Record checkout cancellation
                        </button>
                      </>
                    )}
                    {m.payment.paypalOrderId && (
                      <small className="reference">Order {m.payment.paypalOrderId}</small>
                    )}
                    {m.payment.paypalCaptureId && (
                      <small className="reference">Capture {m.payment.paypalCaptureId}</small>
                    )}
                  </>
                )}
              </>
            )}
          </div>
          <div className="payment-disclosure">
            <LockKeyhole size={18} />
            <strong>Payment follows acceptance</strong>
            <p>
              The sandbox buyer pays the configured merchant
              {settings?.merchantId ? ` (${settings.merchantId})` : ''}. This is not escrow or a
              freelancer payout.
            </p>
          </div>
        </aside>
      </div>
      <section className="panel">
        <h2>Specification history</h2>
        {m.specifications.map((s) => (
          <details key={s.id}>
            <summary>
              Version {s.version} · Client {s.clientAgreedAt ? 'agreed' : 'pending'} · Freelancer{' '}
              {s.freelancerAgreedAt ? 'agreed' : 'pending'}
            </summary>
            <ul>
              {s.requirements.map((r) => (
                <li key={r.id}>
                  {r.description} — {r.method}: {r.expected || 'manual review'}
                </li>
              ))}
            </ul>
          </details>
        ))}
      </section>
    </>
  );
}
function SettingsPanel({
  settings,
  busy,
  onSave,
}: {
  settings: SettingsView | null;
  busy: boolean;
  onSave: (data: { zapierConsent: boolean; elasticConsent: boolean }) => Promise<unknown>;
}) {
  const [elastic, setElastic] = useState(settings?.user.elasticConsent ?? false),
    [zapier, setZapier] = useState(settings?.user.zapierConsent ?? false);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR WORKSPACE, YOUR CHOICES</span>
          <h1>Settings & integrations.</h1>
          <p>Optional tools stay optional. Credentials are stored only on the server.</p>
        </div>
      </div>
      <section className="panel">
        <h2>Account</h2>
        <dl>
          <dt>Name</dt>
          <dd>{settings?.user.name}</dd>
          <dt>Email</dt>
          <dd>{settings?.user.email}</dd>
          <dt>Role</dt>
          <dd>{statusLabel(settings?.user.role ?? '')}</dd>
        </dl>
      </section>
      <section className="panel">
        <h2>Service availability</h2>
        <div className="service-grid">
          {Object.entries(settings?.services ?? {}).map(([name, configured]) => (
            <div key={name}>
              <strong>
                {name === 'paypal'
                  ? 'PayPal sandbox'
                  : name === 'ai'
                    ? 'AI review'
                    : name === 'elastic'
                      ? 'Elastic search'
                      : 'Zapier notifications'}
              </strong>
              <span className={`badge ${configured ? 'green' : ''}`}>
                {configured ? 'Configured · live verification required' : 'Not configured'}
              </span>
            </div>
          ))}
        </div>
      </section>
      <section className="panel">
        <h2>Optional data sharing</h2>
        <p className="muted">
          These settings default to off. Both members must consent before project criteria are
          indexed in Elastic.
        </p>
        <label className="checkbox-label">
          <input type="checkbox" checked={elastic} onChange={(e) => setElastic(e.target.checked)} />
          <span>
            Allow Elastic to store milestone titles, criterion descriptions, and project IDs for
            search. Uploaded files and account emails are excluded. Turning this off excludes
            results immediately; operator deletion is needed for previously indexed data.
          </span>
        </label>
        <label className="checkbox-label">
          <input type="checkbox" checked={zapier} onChange={(e) => setZapier(e.target.checked)} />
          <span>
            Allow sending acceptance event IDs, project IDs, and milestone IDs to the configured
            Zapier Catch Hook. This cannot approve or capture payments.
          </span>
        </label>
        <button
          className="btn primary"
          disabled={busy}
          onClick={() => onSave({ elasticConsent: elastic, zapierConsent: zapier })}
        >
          Save preferences
        </button>
      </section>
      <AiModelPanel settings={settings} />
      <ElasticSearch enabled={Boolean(settings?.services.elastic)} />
      <section className="panel">
        <h2>Prototype disclosures</h2>
        <p>
          ProofPay assists evidence review. It does not guarantee deliverable quality or payment and
          does not resolve legal disputes.
        </p>
        <Link href="/legal">
          Read terms, privacy & payment disclosures <ArrowRight size={15} />
        </Link>
      </section>
    </>
  );
}
function AiModelPanel({ settings }: { settings: SettingsView | null }) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const model = settings?.aiModel;
  return (
    <section className="panel">
      <h2>Verification model</h2>
      <p className="muted">
        A pretrained model assists project-scoped RAG and evidence review. No training or
        fine-tuned-model selection is used. Deterministic scoring and human approval stay separate
        from payment.
      </p>
      <dl>
        <dt>Review mode</dt>
        <dd>{model?.mode ?? 'pretrained'}</dd>
        <dt>Active review model</dt>
        <dd>{model?.activeModel ?? 'Not configured'}</dd>
        <dt>Criteria model</dt>
        <dd>{model?.pretrainedModel ?? 'Not configured'}</dd>
        <dt>Workflow</dt>
        <dd>Requirements RAG → repository inspection → scoring → report</dd>
        <dt>Prompt version</dt>
        <dd>{model?.promptVersion ?? 'Unknown'}</dd>
      </dl>
      {model?.reason && <div className="alert info">{model.reason}</div>}
      <button
        className="btn"
        disabled={busy || !model?.configured}
        onClick={async () => {
          setBusy(true);
          setMessage('');
          try {
            const result = await api('ai/diagnostic', 'POST', { confirm: true });
            setMessage(`Connection verified with ${result.model}. ${result.scope}`);
          } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Model check failed.');
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Checking model…' : 'Test model with fictional evidence'}
      </button>
      <small className="muted" style={{ display: 'block', marginTop: 12 }}>
        Uses one inference request. No private evidence is sent. Training is run separately by the
        operator; there is no automatic training on project data.
      </small>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
function ElasticSearch({ enabled }: { enabled: boolean }) {
  const [q, setQ] = useState(''),
    [results, setResults] = useState<{ title: string; criteria: string; id: string }[]>([]),
    [message, setMessage] = useState('');
  return (
    <section className="panel">
      <h2>Search indexed criteria</h2>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const data = await api(`search?q=${encodeURIComponent(q)}`);
            setResults(data.hits);
            setMessage(data.hits.length ? '' : 'No indexed criteria matched.');
          } catch (err) {
            setMessage(err instanceof Error ? err.message : 'Search unavailable.');
          }
        }}
      >
        <div className="inline-form">
          <input
            aria-label="Search Elastic criteria"
            placeholder="Search agreed requirements…"
            minLength={2}
            maxLength={200}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button className="btn" disabled={!enabled}>
            Search Elastic
          </button>
        </div>
      </form>
      <p className="muted">
        {message ||
          (!enabled
            ? 'Configure Elastic on the server to enable optional search.'
            : 'Only projects you can access with both members’ consent are searched.')}
      </p>
      {results.map((r) => (
        <div className="history-row" key={r.id}>
          <h3>{r.title}</h3>
          <p>{r.criteria}</p>
        </div>
      ))}
    </section>
  );
}
type DraftRequirement = DraftCriterion;
const blankRequirement: DraftRequirement = {
  weight: 1,
  description: '',
  method: 'MANUAL',
  expected: '',
  evidenceRequired: 'Screenshot, artifact, or test report for review',
};
function ModalForm({
  modal,
  busy,
  settings,
  close,
  action,
}: {
  modal: Exclude<Modal, null>;
  busy: boolean;
  settings: SettingsView | null;
  close: () => void;
  action: Action;
}) {
  const m = 'milestone' in modal ? modal.milestone : null;
  const [requirements, setRequirements] = useState<DraftRequirement[]>(
    modal.type === 'specification'
      ? modal.milestone.specifications[0].requirements.map((r) => ({
          description: r.description,
          method: r.method as DraftRequirement['method'],
          expected: r.expected,
          evidenceRequired: r.evidenceRequired,
          weight: r.weight,
          sourceChunkId: r.sourceChunkId,
          sourceQuote: r.sourceQuote,
        }))
      : [{ ...blankRequirement }],
  );
  const [aiBusy, setAiBusy] = useState(false),
    [localError, setLocalError] = useState(''),
    [consent, setConsent] = useState(false),
    [description, setDescription] = useState('');
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) close();
      if (e.key === 'Tab') {
        const root = document.querySelector('[role="dialog"]');
        const els = Array.from(
          root?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input, select, textarea, a[href]',
          ) ?? [],
        );
        const first = els[0],
          last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', handler);
    document
      .querySelector<HTMLElement>(
        '[role="dialog"] input, [role="dialog"] textarea, [role="dialog"] button',
      )
      ?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [busy, close]);
  const titles = {
    project: 'Start a new project',
    milestone: 'Define a milestone',
    specification: 'Refine acceptance criteria',
    evidence: 'Submit your evidence',
    decision:
      modal.type === 'decision' && modal.decision === 'ACCEPTED'
        ? 'Accept this milestone'
        : modal.type === 'decision' && modal.decision === 'REJECTED'
          ? 'Reject this milestone'
          : 'Request a revision',
    agree: 'Review & confirm agreement',
  };
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLocalError('');
    const data = new FormData(e.currentTarget);
    let res: unknown;
    if (modal.type === 'project')
      res = await action(
        'projects',
        'POST',
        {
          title: data.get('title'),
          description: data.get('description'),
          freelancerEmail: data.get('freelancerEmail'),
        },
        'Project created. Define your first milestone.',
      );
    else if (modal.type === 'milestone')
      res = await action(
        `projects/${modal.project.id}/milestones`,
        'POST',
        {
          title: data.get('title'),
          description: data.get('description'),
          amount: data.get('amount'),
          currency: data.get('currency'),
          dueDate: data.get('dueDate'),
          requirements,
        },
        'Milestone created. Both parties can now review and agree.',
      );
    else if (modal.type === 'specification')
      res = await action(
        `milestones/${modal.milestone.id}/specification`,
        'PATCH',
        { requirements, revision: modal.milestone.revision },
        'New specification version saved. Both parties must confirm it.',
      );
    else if (modal.type === 'agree')
      res = await action(
        `milestones/${modal.milestone.id}/agree`,
        'POST',
        { revision: modal.milestone.revision, confirm: true },
        'Your agreement has been recorded.',
      );
    else if (modal.type === 'decision')
      res = await action(
        `milestones/${modal.milestone.id}/decision`,
        'POST',
        {
          revision: modal.milestone.revision,
          decision: modal.decision,
          comment: data.get('comment'),
          confirm: true,
        },
        modal.decision === 'ACCEPTED'
          ? 'Milestone accepted. Sandbox payment is a separate step.'
          : modal.decision === 'REJECTED'
            ? 'Milestone rejected. Payment is unavailable.'
            : 'Revision requested. The freelancer can submit corrected evidence.',
      );
    else if (modal.type === 'evidence') {
      const form = new FormData();
      form.set('revision', String(modal.milestone.revision));
      form.set('notes', String(data.get('notes') ?? ''));
      for (const key of [
        'repositoryUrl',
        'repositoryRef',
        'setupInstructions',
        'repositoryConsent',
      ])
        form.set(key, String(data.get(key) ?? ''));
      for (const r of modal.milestone.specifications[0].requirements) {
        for (const file of data.getAll(`file-${r.id}`)) {
          if (file instanceof File && file.size) {
            form.append('files', file);
            form.append('requirementIds', r.id);
          }
        }
      }
      if (!form.getAll('files').length && !String(data.get('repositoryUrl') ?? '').trim()) {
        setLocalError('Select evidence files or provide an authorized GitHub repository.');
        return;
      }
      res = await action(
        `milestones/${modal.milestone.id}/submit`,
        'POST',
        form,
        'Evidence submitted. Run checks to prepare the review.',
      );
    }
    if (res !== null) close();
    else setLocalError('Unable to save. The workspace error message contains the details.');
  }
  const update = (i: number, patch: Partial<DraftRequirement>) =>
    setRequirements((rows) => rows.map((r, j) => (i === j ? { ...r, ...patch } : r)));
  return (
    <div className="modal-backdrop">
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <header>
          <div>
            <span className="eyebrow">PROOFPAY WORKSPACE</span>
            <h2 id="modal-title">{titles[modal.type]}</h2>
          </div>
          <button className="icon-button" onClick={close} disabled={busy} aria-label="Close dialog">
            <X size={21} />
          </button>
        </header>
        <form onSubmit={submit}>
          {modal.type === 'project' && (
            <>
              <label>
                Project title
                <input
                  name="title"
                  placeholder="e.g. Portfolio website"
                  required
                  minLength={3}
                  maxLength={120}
                />
              </label>
              <label>
                Project scope
                <textarea
                  name="description"
                  placeholder="What are you building together?"
                  required
                  minLength={5}
                  maxLength={3000}
                />
              </label>
              <label>
                Freelancer email
                <input
                  name="freelancerEmail"
                  type="email"
                  placeholder="freelancer@example.com"
                  required
                />
              </label>
              <p className="muted">
                Your freelancer must register a freelancer account before you can add them.
              </p>
            </>
          )}
          {modal.type === 'milestone' && (
            <>
              <label>
                Milestone title
                <input
                  name="title"
                  placeholder="Homepage & project gallery"
                  required
                  minLength={3}
                  maxLength={120}
                />
              </label>
              <label>
                Deliverables
                <textarea
                  name="description"
                  required
                  minLength={5}
                  maxLength={3000}
                  placeholder="Describe the outcome and boundaries…"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              <div className="form-grid">
                <label>
                  Amount
                  <input name="amount" placeholder="450.00" pattern="[0-9]+\.[0-9]{2}" required />
                </label>
                <label>
                  Currency
                  <select name="currency">
                    <option>USD</option>
                    <option>EUR</option>
                    <option>GBP</option>
                  </select>
                </label>
                <label>
                  Due date
                  <input name="dueDate" type="date" required />
                </label>
              </div>
              <div className="ai-compose">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  <span>
                    Allow sending these deliverables to the configured AI provider to propose
                    criteria.
                  </span>
                </label>
                <button
                  className="btn small"
                  type="button"
                  disabled={
                    !consent ||
                    !(settings?.aiModel?.criteriaConfigured ?? settings?.services.ai) ||
                    aiBusy ||
                    description.length < 10
                  }
                  onClick={async () => {
                    setAiBusy(true);
                    try {
                      const data = await api('ai/criteria', 'POST', { description, consent: true });
                      setRequirements(data.requirements);
                    } catch (err) {
                      setLocalError(err instanceof Error ? err.message : 'AI unavailable.');
                    } finally {
                      setAiBusy(false);
                    }
                  }}
                >
                  <Sparkles size={16} />
                  {aiBusy ? 'Preparing…' : 'Suggest criteria with AI'}
                </button>
                {!(settings?.aiModel?.criteriaConfigured ?? settings?.services.ai) && (
                  <small>AI not configured. Define criteria manually below.</small>
                )}
              </div>
            </>
          )}
          {(modal.type === 'milestone' || modal.type === 'specification') && (
            <div className="criteria-editor">
              <GroundedCriteriaTools
                projectId={modal.project.id}
                milestoneId={modal.type === 'specification' ? modal.milestone.id : undefined}
                query={description || modal.project.description}
                onUse={(items, replace) =>
                  setRequirements((rows) =>
                    replace ? items : [...rows.filter((r) => r.description.trim()), ...items],
                  )
                }
              />
              <h3>Acceptance criteria</h3>
              <p className="muted">
                Artifact checks verify supplied text or JSON. Use human review for UI or backend
                behavior.
              </p>
              {requirements.map((r, i) => (
                <fieldset key={i}>
                  <legend>Criterion {i + 1}</legend>
                  <label>
                    Description
                    <input
                      required
                      minLength={3}
                      maxLength={500}
                      value={r.description}
                      onChange={(e) => update(i, { description: e.target.value })}
                      placeholder="What exactly must be delivered?"
                    />
                  </label>
                  <div className="form-grid two">
                    <label>
                      Verification
                      <select
                        value={r.method}
                        onChange={(e) =>
                          update(i, { method: e.target.value as DraftRequirement['method'] })
                        }
                      >
                        <option value="MANUAL">Human review</option>
                        <option value="TEXT_CONTAINS">Text contains agreed string</option>
                        <option value="JSON_VALUE">JSON top-level key=value</option>
                        <option value="REPO_FILE">Pinned repository file exists</option>
                        <option value="SANDBOX_TEST">Agreed isolated test suite ID</option>
                      </select>
                    </label>
                    <label>
                      Expected value
                      <input
                        value={r.expected}
                        onChange={(e) => update(i, { expected: e.target.value })}
                        placeholder={
                          r.method === 'JSON_VALUE'
                            ? 'galleryCount=4'
                            : 'Agreed text or manual rubric'
                        }
                        maxLength={500}
                        required={r.method !== 'MANUAL'}
                      />
                    </label>
                  </div>
                  <label>
                    Required evidence
                    <input
                      required
                      minLength={3}
                      maxLength={300}
                      value={r.evidenceRequired}
                      onChange={(e) => update(i, { evidenceRequired: e.target.value })}
                    />
                  </label>
                  <label>
                    Relative weight
                    <input
                      type="number"
                      min="1"
                      max="10000"
                      required
                      value={r.weight}
                      onChange={(e) => update(i, { weight: Number(e.target.value) })}
                    />
                  </label>
                  {r.sourceChunkId && (
                    <p className="source-chunk">
                      Source {r.sourceChunkId}: “{r.sourceQuote}”
                    </p>
                  )}
                  {requirements.length > 1 && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setRequirements((rows) => rows.filter((_, j) => j !== i))}
                    >
                      Remove criterion
                    </button>
                  )}
                </fieldset>
              ))}
              <button
                type="button"
                className="btn small"
                disabled={requirements.length >= 30}
                onClick={() => setRequirements((rows) => [...rows, { ...blankRequirement }])}
              >
                <Plus size={15} />
                Add criterion
              </button>
            </div>
          )}
          {modal.type === 'evidence' && (
            <>
              <label>
                GitHub repository URL
                <input
                  name="repositoryUrl"
                  type="url"
                  placeholder="https://github.com/owner/repository"
                />
              </label>
              <label>
                Branch, tag or commit
                <input name="repositoryRef" defaultValue="main" maxLength={200} />
              </label>
              <label>
                Setup instructions
                <textarea
                  name="setupInstructions"
                  maxLength={3000}
                  placeholder="Context only; never executed on the application host."
                />
              </label>
              <label className="checkbox-label">
                <input name="repositoryConsent" type="checkbox" value="true" />
                <span>
                  I authorize this project to inspect the repository and send bounded code excerpts
                  to the configured AI provider. Private repositories also require operator
                  authorization.
                </span>
              </label>
              <div className="alert info">
                Upload text, JSON or PNG files, up to 1 MB per file and 10 files total. Evidence is
                private to this project. Uploaded files are treated as untrusted artifacts.
              </div>
              {modal.milestone.specifications[0].requirements.map((r) => (
                <label className="upload-field" key={r.id}>
                  <strong>{r.description}</strong>
                  <small>{r.evidenceRequired}</small>
                  <input
                    name={`file-${r.id}`}
                    type="file"
                    accept=".txt,.json,.png,text/plain,application/json,image/png"
                    multiple
                  />
                </label>
              ))}
              <label>
                Submission notes
                <textarea
                  name="notes"
                  maxLength={5000}
                  placeholder="What changed? What should the client inspect?"
                />
              </label>
              <label className="checkbox-label">
                <input type="checkbox" required />
                <span>
                  I have permission to upload this evidence. Submission notes and check results may
                  be sent to the configured AI provider; bounded repository excerpts may also be
                  used for review.
                </span>
              </label>
            </>
          )}
          {modal.type === 'agree' && m && (
            <>
              <p>
                Confirm specification v{m.currentVersion} for <strong>{m.title}</strong>.
              </p>
              <div className="agreement-preview">
                <strong>
                  {money(m.amountMinor, m.currency)} · Due {date(m.dueDate)}
                </strong>
                {m.specifications[0].requirements.map((r) => (
                  <div key={r.id}>
                    <h3>{r.description}</h3>
                    <p>
                      {statusLabel(r.method)} · {r.expected || 'Human review'}
                    </p>
                    <small>Required evidence: {r.evidenceRequired}</small>
                    <p>
                      Weight: {r.weight}
                      {r.sourceChunkId ? ` · Source: ${r.sourceChunkId}` : ''}
                    </p>
                    {r.sourceQuote && <blockquote>{r.sourceQuote}</blockquote>}
                  </div>
                ))}
              </div>
              <p className="muted">
                Revisions are requested by the client after review. Scope changes require a new
                milestone. ProofPay does not determine contractual rights or resolve disputes.
              </p>
              <label className="checkbox-label">
                <input required type="checkbox" />
                <span>
                  I reviewed the deliverables, criteria, evidence requirements, amount and due date,
                  and agree to this specification version.
                </span>
              </label>
            </>
          )}
          {modal.type === 'decision' && (
            <>
              <div className={`alert ${modal.decision === 'ACCEPTED' ? 'info' : 'warning'}`}>
                {modal.decision === 'ACCEPTED'
                  ? 'Acceptance records your human decision. It does not charge a payment. You can proceed to PayPal sandbox separately.'
                  : modal.decision === 'REJECTED'
                    ? 'Explain the rejection. This milestone cannot be paid. Previous submissions and reports remain available.'
                    : 'Describe the changes needed. Previous submissions and reports remain in the audit trail.'}
              </div>
              <label>
                {modal.decision === 'ACCEPTED'
                  ? 'Acceptance rationale'
                  : modal.decision === 'REJECTED'
                    ? 'Rejection reason'
                    : 'Revision instructions'}
                <textarea
                  name="comment"
                  required
                  minLength={5}
                  maxLength={3000}
                  placeholder="Explain your review decision…"
                />
              </label>
              <label className="checkbox-label">
                <input required type="checkbox" />
                <span>
                  I reviewed the current evidence, check limitations, and AI uncertainty, and
                  confirm this decision.
                </span>
              </label>
            </>
          )}
          {localError && (
            <div className="alert error" role="alert">
              {localError}
            </div>
          )}
          <div className="modal-actions">
            <button className="btn" type="button" disabled={busy} onClick={close}>
              Cancel
            </button>
            <button className="btn primary" disabled={busy || aiBusy}>
              {busy ? (
                <>
                  <LoaderCircle size={16} className="spin" />
                  Saving…
                </>
              ) : modal.type === 'agree' ? (
                'Confirm agreement'
              ) : modal.type === 'decision' ? (
                modal.decision === 'ACCEPTED' ? (
                  'Confirm acceptance'
                ) : modal.decision === 'REJECTED' ? (
                  'Confirm rejection'
                ) : (
                  'Send revision request'
                )
              ) : modal.type === 'evidence' ? (
                'Submit evidence'
              ) : (
                'Save & continue'
              )}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
