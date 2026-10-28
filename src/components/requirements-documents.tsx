'use client';
import { useState } from 'react';
import { api } from '@/lib/client-api';
import { FileText, Upload } from 'lucide-react';
type Chunk = {
  id: string;
  documentId: string;
  text: string;
  sourceLocation: string;
  filename?: string;
};
export type DraftCriterion = {
  description: string;
  method: 'TEXT_CONTAINS' | 'JSON_VALUE' | 'MANUAL' | 'REPO_FILE' | 'SANDBOX_TEST';
  expected: string;
  evidenceRequired: string;
  weight: number;
  sourceChunkId?: string | null;
  sourceQuote?: string | null;
};
export function RequirementsDocuments({
  projectId,
  client,
  documents,
  onSaved,
}: {
  projectId: string;
  client: boolean;
  documents: { id: string; filename: string; status: string; _count: { chunks: number } }[];
  onSaved: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [chunks, setChunks] = useState<Chunk[]>([]),
    [search, setSearch] = useState('');
  return (
    <section className="panel document-library">
      <div className="panel-heading">
        <h2>
          <FileText size={20} />
          Requirements documents
        </h2>
        <span className="badge blue-badge">SOURCE LIBRARY</span>
      </div>
      <p className="muted">
        A shared source of truth. Keep the project scope close to every milestone and review.
      </p>
      {client && (
        <details className="document-upload" open={!documents.length}>
          <summary>
            <Upload size={17} /> Add a requirements document{' '}
            <span>PDF, DOCX, Markdown or TXT · up to 5 MB</span>
          </summary>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setMessage('');
              try {
                const form = new FormData(e.currentTarget);
                form.set('consent', 'true');
                const result = await api(`projects/${projectId}/documents`, 'POST', form);
                await onSaved();
                setMessage(
                  `${result.filename} parsed. ${result.status === 'INDEXED' ? 'Semantic vectors stored.' : 'Embeddings unavailable; text retrieval is available.'}`,
                );
              } catch (error) {
                setMessage(error instanceof Error ? error.message : 'Upload failed.');
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Requirements document
              <input name="document" type="file" accept=".pdf,.docx,.md,.txt,.markdown" required />
            </label>
            <label className="checkbox-label">
              <input type="checkbox" required />
              <span>
                I authorize parsing this document and sending its text to the configured
                embedding/AI providers for project-specific retrieval and criteria proposals. No
                training use is authorized.
              </span>
            </label>
            <button className="btn" disabled={busy}>
              {busy ? 'Processing document…' : 'Upload requirements document'}
            </button>
          </form>
        </details>
      )}
      <div className="document-list">
        {documents.map((d) => (
          <button
            className="document-item"
            key={d.id}
            onClick={async () => {
              try {
                const result = await api(`documents/${d.id}`);
                setChunks(result.chunks.map((c: Chunk) => ({ ...c, filename: result.filename })));
              } catch (error) {
                setMessage(error instanceof Error ? error.message : 'Document unavailable.');
              }
            }}
          >
            <strong>{d.filename}</strong>
            <span>
              {d._count.chunks} chunks · {d.status.replaceAll('_', ' ').toLowerCase()}
            </span>
          </button>
        ))}
      </div>
      <form
        className="inline-form"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const result = await api(
              `projects/${projectId}/requirements?q=${encodeURIComponent(search)}`,
            );
            setChunks(result.chunks);
            setMessage(
              `Retrieval: ${result.mode}. ${result.chunks.length} relevant source chunks.`,
            );
          } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Retrieval failed.');
          }
        }}
      >
        <input
          aria-label="Search requirements documents"
          placeholder="Search project requirements…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          minLength={2}
          maxLength={4000}
          required
        />
        <button className="btn">Retrieve requirements</button>
      </form>
      {message && <p role="status">{message}</p>}
      {chunks.map((c) => (
        <article className="source-chunk" key={c.id}>
          <strong>
            {c.filename ?? 'Document'} · {c.sourceLocation}
          </strong>
          <small>Source {c.id}</small>
          <p>{c.text}</p>
        </article>
      ))}
    </section>
  );
}
export function GroundedCriteriaTools({
  projectId,
  milestoneId,
  query,
  onUse,
}: {
  projectId: string;
  milestoneId?: string;
  query: string;
  onUse: (items: DraftCriterion[], replace: boolean) => void;
}) {
  const [chunks, setChunks] = useState<Chunk[]>([]),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [consent, setConsent] = useState(false);
  return (
    <div className="rag-criteria-tools">
      <h3>Ground criteria in uploaded requirements</h3>
      <p className="muted">
        Retrieve sources first. AI proposals need exact citations and remain editable before both
        parties agree.
      </p>
      <label className="checkbox-label">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>
          Allow the configured pretrained model to propose criteria from this project retrieved
          document text.
        </span>
      </label>
      <div className="integration-actions">
        <button
          className="btn small"
          type="button"
          disabled={busy || query.trim().length < 2}
          onClick={async () => {
            setBusy(true);
            try {
              const result = await api(
                `projects/${projectId}/requirements?q=${encodeURIComponent(query.slice(0, 4000))}${milestoneId ? `&milestoneId=${milestoneId}` : ''}`,
              );
              setChunks(result.chunks);
              setMessage(`${result.mode}: ${result.chunks.length} relevant sources.`);
            } catch (error) {
              setMessage(error instanceof Error ? error.message : 'Retrieval failed.');
            } finally {
              setBusy(false);
            }
          }}
        >
          Retrieve source passages
        </button>
        <button
          className="btn small"
          type="button"
          disabled={busy || !consent || query.trim().length < 2}
          onClick={async () => {
            setBusy(true);
            try {
              const result = await api(`projects/${projectId}/extract-criteria`, 'POST', {
                query: query.slice(0, 4000),
                ...(milestoneId ? { milestoneId } : {}),
                consent: true,
              });
              onUse(result.requirements, true);
              setChunks(result.sources);
              setMessage(
                'Source-linked draft criteria loaded. Review every requirement and weight before saving.',
              );
            } catch (error) {
              setMessage(error instanceof Error ? error.message : 'AI extraction failed.');
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Retrieving / extracting…' : 'Propose cited criteria with AI'}
        </button>
      </div>
      {message && <p role="status">{message}</p>}
      {chunks.map((c) => (
        <article className="source-chunk" key={c.id}>
          <strong>
            {c.filename} · {c.sourceLocation}
          </strong>
          <p>{c.text}</p>
          <button
            className="btn small"
            type="button"
            onClick={() =>
              onUse(
                [
                  {
                    description: c.text.slice(0, 450),
                    method: 'MANUAL',
                    expected: 'Human review against the cited requirement',
                    evidenceRequired:
                      'Relevant repository, screenshots or an executed agreed test suite',
                    weight: 1,
                    sourceChunkId: c.id,
                    sourceQuote: c.text.slice(0, 450),
                  },
                ],
                false,
              )
            }
          >
            Use source as a manual draft criterion
          </button>
        </article>
      ))}
    </div>
  );
}
