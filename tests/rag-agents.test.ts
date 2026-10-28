import 'dotenv/config';
import { afterAll, afterEach, describe, it, expect, vi } from 'vitest';
import JSZip from 'jszip';
import { parseDocument, chunkSections } from '../src/lib/document-parser';
import { weightedScore, scoreCriteria } from '../src/lib/agents/scoring-agent';
import {
  parseGithubUrl,
  safeRepositoryPath,
  resolveRepository,
  inspectRepository,
  executeIsolatedTests,
  type RepositoryAnalysis,
} from '../src/lib/agents/repository-agent';
import {
  uploadRequirements,
  retrieveRequirements,
  validateSources,
  groundedCriteria,
} from '../src/lib/agents/requirements-agent';
import { createProject, createMilestone, agree } from '../src/lib/projects';
import { submitEvidence, verifySubmission, decide } from '../src/lib/submissions';
import { createOrder } from '../src/lib/payments';
import { db } from '../src/lib/db';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
afterAll(() => db.$disconnect());
const sha = 'a'.repeat(40),
  tree = 'b'.repeat(40),
  blob = 'c'.repeat(40);
const repo: RepositoryAnalysis = {
  status: 'INSPECTED',
  repositoryUrl: 'https://github.com/example/demo',
  commitSha: sha,
  treeSha: tree,
  paths: ['src/index.ts'],
  files: [],
  languages: ['TypeScript'],
  frameworks: [],
  scripts: {},
  testFiles: [],
  limitations: [],
};
const unavailable = {
  status: 'TEST_EXECUTION_UNAVAILABLE' as const,
  reason: 'No approved runner',
  commands: [],
  suites: [],
};
describe('document parsing and deterministic evidence boundaries', () => {
  it('parses and chunks real text/Markdown with source locations', async () => {
    const parts = await parseDocument(
      'scope.md',
      'text/markdown',
      Buffer.from('# Scope\nContact form must exist\n' + 'x'.repeat(3000)),
    );
    const chunks = chunkSections(parts);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks[0].location).toContain('line');
    expect(chunks.every((c) => c.text.length <= 1400)).toBe(true);
  });
  it('extracts real DOCX XML text without executing content', async () => {
    const zip = new JSZip();
    zip.file(
      '[Content_Types].xml',
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    );
    zip.file(
      '_rels/.rels',
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    );
    zip.file(
      'word/document.xml',
      '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Portfolio gallery requirement</w:t></w:r></w:p></w:body></w:document>',
    );
    const parts = await parseDocument(
      'scope.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      await zip.generateAsync({ type: 'uint8array' }),
    );
    expect(parts[0].text).toContain('Portfolio gallery requirement');
  });
  it('extracts a real PDF page and rejects unsupported or empty documents', async () => {
    const content = 'BT /F1 12 Tf 72 720 Td (Contact form requirement) Tj ET';
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    ];
    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((o, i) => {
      offsets.push(pdf.length);
      pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
    });
    const xref = pdf.length;
    pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
      .slice(1)
      .map((n) => String(n).padStart(10, '0') + ' 00000 n ')
      .join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    const parts = await parseDocument('scope.pdf', 'application/pdf', Buffer.from(pdf));
    expect(parts[0].text).toContain('Contact form requirement');
    expect(parts[0].location).toBe('page 1');
    await expect(parseDocument('bad.exe', '', Buffer.from('arbitrary'))).rejects.toThrow('Use PDF');
    await expect(parseDocument('empty.txt', 'text/plain', Buffer.from('     '))).rejects.toThrow(
      'No readable',
    );
  });
  it('computes 6.25 from weighted evidence and leaves all unknown work unscored', () => {
    expect(
      weightedScore([
        { weight: 1, status: 'PASS', score: 10 },
        { weight: 1, status: 'PARTIAL', score: 5 },
        { weight: 2, status: 'PARTIAL', score: 5 },
      ]).scoreOutOf10,
    ).toBe(6.25);
    expect(weightedScore([{ weight: 2, status: 'BLOCKED', score: null }]).scoreOutOf10).toBeNull();
    expect(
      weightedScore([
        { weight: 1, status: 'PASS', score: 10 },
        { weight: 1, status: 'UNVERIFIED', score: null },
      ]),
    ).toMatchObject({ scoreOutOf10: 5, provisional: true, verifiedWeightPercent: 50 });
  });
  it('never treats static file presence as runtime test success', () => {
    const result = scoreCriteria(
      [
        {
          id: 'r',
          description: 'Runtime contact works',
          method: 'SANDBOX_TEST',
          expected: 'contact',
          evidenceRequired: 'isolated tests',
          weight: 1,
        },
      ],
      [],
      repo,
      unavailable,
    );
    expect(result.criteria[0].status).toBe('BLOCKED');
    expect(result.scoreOutOf10).toBeNull();
  });
  it('awards partial executed-suite evidence and preserves skipped cases', () => {
    const result = scoreCriteria(
      [
        {
          id: 'r',
          description: 'Suite',
          method: 'SANDBOX_TEST',
          expected: 'contact',
          evidenceRequired: 'tests',
        },
      ],
      [],
      repo,
      {
        ...unavailable,
        status: 'COMPLETED',
        suites: [
          {
            id: 'contact',
            cases: [
              { name: 'a', status: 'pass' },
              { name: 'b', status: 'fail' },
              { name: 'c', status: 'skip' },
              { name: 'd', status: 'pass' },
            ],
          },
        ],
      },
    );
    expect(result.criteria[0]).toMatchObject({ status: 'PARTIAL', score: 5 });
  });
  it('rejects non-GitHub URLs and excludes secret files', () => {
    for (const url of [
      'http://github.com/x/y',
      'https://github.com.evil/x/y',
      'https://github.com/x/y?token=x',
      'https://user:secret@github.com/x/y',
    ])
      expect(() => parseGithubUrl(url)).toThrow();
    for (const path of [
      '.env.local',
      'src/.env.production',
      'secrets.json',
      'src/id_rsa',
      'key.pem',
      'node_modules/a.js',
      '../x',
    ])
      expect(safeRepositoryPath(path)).toBe(false);
    expect(safeRepositoryPath('src/index.ts')).toBe(true);
  });
  it('pins a GitHub ref, inspects only fixed API hosts, and never fetches secrets or runs scripts', async () => {
    const fetch = vi.fn(async (url: string | URL | Request) => {
      const path = String(url);
      if (path.endsWith('/repos/example/demo'))
        return Response.json({ full_name: 'example/demo', private: false });
      if (path.includes('/commits/'))
        return Response.json({ sha, commit: { tree: { sha: tree } } });
      if (path.includes('/git/trees/'))
        return Response.json({
          sha: tree,
          truncated: false,
          tree: [
            { path: 'package.json', type: 'blob', mode: '100644', sha: blob, size: 70 },
            { path: '.env.local', type: 'blob', mode: '100644', sha: 'd'.repeat(40), size: 30 },
          ],
        });
      return Response.json({
        sha: blob,
        encoding: 'base64',
        size: 70,
        content: Buffer.from(
          JSON.stringify({ dependencies: { react: '1' }, scripts: { test: 'untrusted-command' } }),
        ).toString('base64'),
      });
    });
    vi.stubGlobal('fetch', fetch);
    const pinned = await resolveRepository('p', repo.repositoryUrl!, 'main');
    expect(pinned.commitSha).toBe(sha);
    const result = await inspectRepository('p', pinned);
    expect(result.paths).toEqual(['package.json']);
    expect(result.frameworks).toContain('React');
    expect(result.scripts.test).toBe('untrusted-command');
    vi.stubEnv('RUNNER_SECURITY_APPROVED', 'false');
    expect((await executeIsolatedTests(result, ['test'])).status).toBe(
      'TEST_EXECUTION_UNAVAILABLE',
    );
    expect(fetch.mock.calls.every((c) => String(c[0]).startsWith('https://api.github.com/'))).toBe(
      true,
    );
    expect(fetch).toHaveBeenCalledTimes(5);
  });
  it('requires per-project private repository permission', async () => {
    vi.stubEnv('GITHUB_PRIVATE_PROJECT_REPOS_JSON', JSON.stringify({ allowed: ['example/demo'] }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ full_name: 'example/demo', private: true })),
    );
    await expect(resolveRepository('other', repo.repositoryUrl!, 'main')).rejects.toThrow(
      'specific project',
    );
  });
  it('rejects a runner report for a different commit and trusts no passing cases', async () => {
    vi.stubEnv('RUNNER_SECURITY_APPROVED', 'true');
    vi.stubEnv('REPOSITORY_RUNNER_URL', 'https://runner.example/run');
    vi.stubEnv('REPOSITORY_RUNNER_TOKEN', 'fixture');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          commitSha: 'e'.repeat(40),
          status: 'COMPLETED',
          isolation: {
            nonRoot: true,
            network: 'disabled',
            productionSecrets: false,
            privileged: false,
            hostSocket: false,
            sourceReadOnly: true,
            cpuLimit: 2,
            memoryMb: 2048,
            timeoutSeconds: 90,
            diskMb: 1024,
          },
          commands: [
            { command: 'test', kind: 'test', exitCode: 0, durationMs: 1, stdout: '', stderr: '' },
          ],
          suites: [{ id: 'test', cases: [{ name: 'a', status: 'pass' }] }],
        }),
      ),
    );
    expect(await executeIsolatedTests(repo, ['test'])).toMatchObject({
      status: 'SETUP_FAILED',
      suites: [],
    });
  });
});
describe.skipIf(!process.env.DATABASE_URL)('real PostgreSQL RAG workflow', () => {
  it('isolates documents, retrieves real stored vectors, persists reports and rejects without payment', async () => {
    vi.stubEnv('AI_API_KEY', '');
    vi.stubEnv('EMBEDDING_API_KEY', '');
    vi.stubEnv('EMBEDDING_MODEL', '');
    const stamp = crypto.randomUUID();
    const client = await db.user.create({
      data: {
        name: 'RAG client',
        email: `rag-c-${stamp}@example.test`,
        passwordHash: 'disabled',
        role: 'CLIENT',
      },
    });
    const freelancer = await db.user.create({
      data: {
        name: 'RAG worker',
        email: `rag-f-${stamp}@example.test`,
        passwordHash: 'disabled',
        role: 'FREELANCER',
      },
    });
    const outsider = await db.user.create({
      data: {
        name: 'RAG outsider',
        email: `rag-o-${stamp}@example.test`,
        passwordHash: 'disabled',
        role: 'CLIENT',
      },
    });
    const p = await createProject(client, {
      title: 'RAG integration',
      description: 'Project specific requirements',
      freelancerEmail: freelancer.email,
    });
    const form = new FormData();
    form.set(
      'document',
      new File(['Contact form requires an email field.'], 'scope.txt', { type: 'text/plain' }),
    );
    form.set('consent', 'true');
    const document = await uploadRequirements(client, p.id, form);
    expect(document.status).toBe('TEXT_READY_EMBEDDINGS_UNAVAILABLE');
    await expect(uploadRequirements(freelancer, p.id, form)).rejects.toThrow('client');
    await expect(retrieveRequirements(outsider, p.id, 'Contact')).rejects.toThrow('not found');
    const result = await retrieveRequirements(client, p.id, 'Contact');
    expect(result.mode).toBe('LEXICAL_FALLBACK');
    expect(result.chunks[0].text).toContain('email field');
    const chunk = result.chunks[0];
    await expect(
      validateSources('different-project', [
        { sourceChunkId: chunk.id, sourceQuote: 'email field' },
      ]),
    ).rejects.toThrow('this project');
    await db.documentChunk.update({
      where: { id: chunk.id },
      data: { embedding: [1, 0, 0], embeddingModel: 'fixture-embedding' },
    });
    vi.stubEnv('EMBEDDING_MODEL', 'fixture-embedding');
    vi.stubEnv('EMBEDDING_API_KEY', 'fixture-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ data: [{ index: 0, embedding: [1, 0, 0] }] })),
    );
    expect((await retrieveRequirements(client, p.id, 'Contact')).mode).toBe('SEMANTIC');
    const other = await createProject(client, {
      title: 'Other RAG project',
      description: 'Separate project must never leak sources',
      freelancerEmail: freelancer.email,
    });
    await uploadRequirements(client, other.id, form);
    const scoped = await retrieveRequirements(client, p.id, 'Contact');
    expect(scoped.chunks.every((c) => c.projectId === p.id)).toBe(true);
    vi.stubEnv('AI_API_KEY', 'fixture-ai');
    vi.stubEnv('AI_PRETRAINED_MODEL', 'fixture-pretrained');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request) =>
        String(url).endsWith('/embeddings')
          ? Response.json({ data: [{ index: 0, embedding: [1, 0, 0] }] })
          : Response.json({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      requirements: [
                        {
                          description: 'Unsupported invented behavior',
                          method: 'MANUAL',
                          expected: 'Human review',
                          evidenceRequired: 'Screenshot',
                          weight: 1,
                          sourceChunkId: chunk.id,
                          sourceQuote: 'This sentence was never in the source',
                        },
                      ],
                    }),
                  },
                },
              ],
            }),
      ),
    );
    await expect(groundedCriteria(client, p.id, 'Contact')).rejects.toThrow(
      'unsupported document citation',
    );
    vi.stubEnv('AI_API_KEY', '');
    vi.stubEnv('AI_PRETRAINED_MODEL', '');
    const m = await createMilestone(client, p.id, {
      title: 'Contact deliverable',
      description: 'Create the required contact form',
      amount: '20.00',
      currency: 'USD',
      dueDate: '2026-12-10',
      requirements: [
        {
          description: 'Agreed email field',
          method: 'MANUAL',
          expected: 'Inspect the contact form',
          evidenceRequired: 'Screenshot',
          weight: 2,
          sourceChunkId: chunk.id,
          sourceQuote: 'email field',
        },
      ],
    });
    await agree(client, m.id, 0);
    await agree(freelancer, m.id, 1);
    const evidence = new FormData();
    evidence.set('revision', '2');
    evidence.set('notes', 'Please review contact form');
    evidence.append(
      'files',
      new File(['Contact email field'], 'proof.txt', { type: 'text/plain' }),
    );
    evidence.append(
      'requirementIds',
      (await db.requirement.findFirstOrThrow({ where: { specification: { milestoneId: m.id } } }))
        .id,
    );
    await submitEvidence(freelancer, m.id, evidence);
    const run = await verifySubmission(client, m.id);
    const report = run.report as {
      overall: { scoreOutOf10: number | null };
      testing: { status: string };
    };
    expect(report.overall.scoreOutOf10).toBeNull();
    expect(report.testing.status).toBe('TEST_EXECUTION_UNAVAILABLE');
    const job = await db.evaluationJob.findFirstOrThrow({ where: { milestoneId: m.id } });
    expect(job.status).toBe('COMPLETED');
    expect(job.reportRunId).toBe(run.id);
    await decide(
      client,
      m.id,
      'REJECTED',
      'Evidence does not demonstrate the required behavior',
      4,
    );
    await expect(createOrder(client, m.id, { tip: '1.00' })).rejects.toThrow('acceptance');
    expect(await db.payment.count({ where: { milestoneId: m.id } })).toBe(0);
  }, 30000);
});
