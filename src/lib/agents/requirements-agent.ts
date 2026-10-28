import { createHash } from 'node:crypto';
import { z } from 'zod';
import { db } from '../db';
import { ensure } from '../errors';
import { getProject, assertClient, audit, type Actor } from '../projects';
import { parseDocument, chunkSections } from '../document-parser';
import { aiModelConfig } from '../ai-config';
import { completion } from '../ai';
import { SYSTEM_BOUNDARY } from '../ai-contract';
import { requirementSchema } from '../validation';
export function embeddingsConfigured() {
  return Boolean(
    process.env.EMBEDDING_MODEL && (process.env.EMBEDDING_API_KEY || process.env.AI_API_KEY),
  );
}
export async function embedTexts(texts: string[]) {
  ensure(
    embeddingsConfigured(),
    503,
    'Embeddings are not configured. Text retrieval remains available.',
  );
  const model = process.env.EMBEDDING_MODEL!;
  const base =
    process.env.EMBEDDING_BASE_URL || process.env.AI_BASE_URL || 'https://api.openai.com/v1';
  const url = new URL(base);
  ensure(
    !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (url.protocol === 'https:' ||
        (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))),
    500,
    'Invalid embedding provider URL.',
  );
  const response = await fetch(`${base.replace(/\/$/, '')}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.EMBEDDING_API_KEY || process.env.AI_API_KEY}`,
    },
    body: JSON.stringify({ model, input: texts, encoding_format: 'float' }),
    signal: AbortSignal.timeout(20000),
  });
  ensure(response.ok, 503, 'Embedding provider is unavailable.');
  const raw = await response.json();
  const rows = z
    .array(
      z.object({
        index: z.number().int().nonnegative(),
        embedding: z.array(z.number().finite()).min(1).max(4096),
      }),
    )
    .length(texts.length)
    .parse(raw.data)
    .sort((a, b) => a.index - b.index);
  ensure(
    rows.every(
      (r, i) =>
        r.index === i &&
        r.embedding.length === rows[0].embedding.length &&
        r.embedding.some((x) => x !== 0),
    ),
    502,
    'Embedding provider returned invalid vectors.',
  );
  return { model, vectors: rows.map((r) => r.embedding) };
}
export async function uploadRequirements(user: Actor, projectId: string, form: FormData) {
  const p = await getProject(user, projectId);
  assertClient(user, p);
  const file = form.get('document');
  ensure(file instanceof File, 400, 'Select one requirements document.');
  ensure(form.get('consent') === 'true', 400, 'Confirm document processing before upload.');
  const milestoneId = String(form.get('milestoneId') ?? '') || null;
  ensure(
    !milestoneId || p.milestones.some((m) => m.id === milestoneId),
    400,
    'Milestone does not belong to this project.',
  );
  ensure(
    (await db.projectDocument.count({ where: { projectId } })) < 25,
    400,
    'Project document limit reached.',
  );
  const bytes = new Uint8Array(await file.arrayBuffer());
  const chunks = chunkSections(await parseDocument(file.name, file.type, bytes));
  ensure(chunks.length <= 120, 400, 'Document produces too many chunks.');
  let vectors: number[][] = [],
    model: string | null = null,
    status = 'TEXT_READY_EMBEDDINGS_UNAVAILABLE';
  if (embeddingsConfigured()) {
    try {
      for (let i = 0; i < chunks.length; i += 20) {
        const batch = await embedTexts(chunks.slice(i, i + 20).map((c) => c.text));
        model = batch.model;
        vectors.push(...batch.vectors);
      }
      status = 'INDEXED';
    } catch {
      vectors = [];
      model = null;
      status = 'TEXT_READY_EMBEDDINGS_UNAVAILABLE';
    }
  }
  return db.$transaction(async (tx) => {
    const document = await tx.projectDocument.create({
      data: {
        projectId,
        milestoneId,
        uploadedBy: user.id,
        filename: file.name,
        mimeType: file.type,
        content: bytes,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        status,
        embeddingModel: model,
        chunks: {
          create: chunks.map((c, i) => ({
            projectId,
            milestoneId,
            ordinal: i,
            text: c.text,
            sourceLocation: c.location,
            embedding: vectors[i] ?? [],
            embeddingModel: model,
          })),
        },
      },
      select: { id: true, filename: true, status: true, createdAt: true },
    });
    await audit(
      tx,
      user.id,
      projectId,
      'REQUIREMENTS_DOCUMENT_UPLOADED',
      milestoneId ?? undefined,
      { documentId: document.id, chunks: chunks.length, status },
    );
    return document;
  });
}
export type RetrievedChunk = {
  id: string;
  documentId: string;
  projectId: string;
  milestoneId: string | null;
  text: string;
  sourceLocation: string;
  filename: string;
  similarity: number | null;
};
export async function retrieveRequirements(
  user: Actor,
  projectId: string,
  query: string,
  milestoneId?: string,
) {
  const p = await getProject(user, projectId);
  ensure(
    !milestoneId || p.milestones.some((m) => m.id === milestoneId),
    404,
    'Milestone not found.',
  );
  ensure(query.trim().length >= 2 && query.length <= 4000, 400, 'Search needs 2–4000 characters.');
  if (embeddingsConfigured()) {
    try {
      const embedding = await embedTexts([query]);
      const vector = JSON.stringify(embedding.vectors[0]);
      const rows = await db.$queryRaw<
        RetrievedChunk[]
      >`SELECT c."id",c."documentId",c."projectId",c."milestoneId",c."text",c."sourceLocation",d."filename",proofpay_cosine(c."embedding",ARRAY(SELECT jsonb_array_elements_text(${vector}::jsonb)::double precision)) AS similarity FROM "DocumentChunk" c JOIN "ProjectDocument" d ON d."id"=c."documentId" WHERE c."projectId"=${projectId} AND d."projectId"=${projectId} AND (${milestoneId ?? null}::text IS NULL OR c."milestoneId" IS NULL OR c."milestoneId"=${milestoneId ?? null}) AND c."embeddingModel"=${embedding.model} AND cardinality(c."embedding")=${embedding.vectors[0].length} ORDER BY similarity DESC NULLS LAST,c."id" LIMIT 6`;
      if (rows.length) return { mode: 'SEMANTIC' as const, chunks: rows };
    } catch {
      /* An explicit lexical fallback never pretends that embeddings ran. */
    }
  }
  const terms = query.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [];
  const chunks = await db.documentChunk.findMany({
    where: { projectId, ...(milestoneId ? { OR: [{ milestoneId: null }, { milestoneId }] } : {}) },
    include: { document: { select: { filename: true } } },
    take: 1500,
    orderBy: [{ documentId: 'asc' }, { ordinal: 'asc' }],
  });
  const ranked = chunks
    .map((c) => ({
      id: c.id,
      documentId: c.documentId,
      projectId: c.projectId,
      milestoneId: c.milestoneId,
      text: c.text,
      sourceLocation: c.sourceLocation,
      filename: c.document.filename,
      similarity: null,
      rank: terms.reduce((n, t) => n + (c.text.toLowerCase().includes(t) ? 1 : 0), 0),
    }))
    .sort((a, b) => b.rank - a.rank);
  return {
    mode: 'LEXICAL_FALLBACK' as const,
    chunks: ranked
      .filter((c) => c.rank > 0)
      .slice(0, 6)
      .map(({ rank, ...c }) => {
        void rank;
        return c;
      }),
  };
}
export async function groundedCriteria(
  user: Actor,
  projectId: string,
  query: string,
  milestoneId?: string,
) {
  const p = await getProject(user, projectId);
  assertClient(user, p);
  const context = await retrieveRequirements(user, projectId, query, milestoneId);
  ensure(
    context.chunks.length,
    409,
    'Upload a requirements document with relevant text before extracting criteria.',
  );
  ensure(
    aiModelConfig('criteria').configured,
    503,
    'Pretrained AI is not configured. Review retrieved sources and define criteria manually.',
  );
  const schema = {
    type: 'object',
    properties: {
      requirements: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            description: { type: 'string' },
            method: {
              type: 'string',
              enum: ['TEXT_CONTAINS', 'JSON_VALUE', 'MANUAL', 'REPO_FILE', 'SANDBOX_TEST'],
            },
            expected: { type: 'string' },
            evidenceRequired: { type: 'string' },
            weight: { type: 'integer' },
            sourceChunkId: { type: 'string' },
            sourceQuote: { type: 'string' },
          },
          required: [
            'description',
            'method',
            'expected',
            'evidenceRequired',
            'weight',
            'sourceChunkId',
            'sourceQuote',
          ],
          additionalProperties: false,
        },
      },
    },
    required: ['requirements'],
    additionalProperties: false,
  };
  const result = await completion(
    'criteria',
    [
      {
        role: 'system',
        content: `${SYSTEM_BOUNDARY} Extract acceptance criteria ONLY from provided project document chunks. Include sourceChunkId and an exact nonempty sourceQuote. Do not invent scope. Weight is a proposed relative integer 1–100 reviewed by the client. Runtime/UI behavior must be MANUAL or an explicitly agreed SANDBOX_TEST; REPO_FILE only proves a file exists. Return {requirements:[{description,method,expected,evidenceRequired,weight,sourceChunkId,sourceQuote}]}.`,
      },
      { role: 'user', content: JSON.stringify({ milestone: query, chunks: context.chunks }) },
    ],
    schema,
  );
  const parsed = z
    .object({ requirements: z.array(requirementSchema).min(1).max(20) })
    .strict()
    .parse(result.value);
  for (const r of parsed.requirements) {
    const source = context.chunks.find((c) => c.id === r.sourceChunkId);
    ensure(
      source &&
        r.sourceQuote &&
        r.sourceQuote.trim().length >= 3 &&
        source.text.includes(r.sourceQuote),
      502,
      'AI returned an unsupported document citation.',
    );
  }
  return { ...parsed, retrievalMode: context.mode, sources: context.chunks };
}
export async function validateSources(
  projectId: string,
  requirements: { sourceChunkId?: string | null; sourceQuote?: string | null }[],
  milestoneId?: string,
) {
  for (const r of requirements) {
    if (!r.sourceChunkId) {
      ensure(!r.sourceQuote, 400, 'A source quote requires a document chunk.');
      continue;
    }
    const chunk = await db.documentChunk.findFirst({
      where: {
        id: r.sourceChunkId,
        projectId,
        document: { projectId },
        OR: [{ milestoneId: null }, ...(milestoneId ? [{ milestoneId }] : [])],
      },
    });
    ensure(
      chunk &&
        r.sourceQuote &&
        r.sourceQuote.trim().length >= 3 &&
        chunk.text.includes(r.sourceQuote),
      400,
      'Criterion source must be an exact quote from this project.',
    );
  }
}
