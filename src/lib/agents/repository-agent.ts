import { z } from 'zod';
import { ensure, AppError } from '../errors';
export function safeRepositoryPath(path: string) {
  return (
    !path.startsWith('/') &&
    !path.includes('\\') &&
    !path.includes('..') &&
    !/\.(pem|key)$/i.test(path) &&
    !path
      .split('/')
      .some((part) =>
        /^(\.env(?:\.|$)|node_modules$|vendor$|\.git$|dist$|build$|coverage$|id_rsa(?:\.|$)|credentials(?:\.|$)|secrets?(?:\.|$))/i.test(
          part,
        ),
      )
  );
}
export function parseGithubUrl(value: string) {
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    throw new AppError(400, 'Use a GitHub HTTPS repository URL.');
  }
  ensure(
    u.origin === 'https://github.com' && !u.username && !u.password && !u.search && !u.hash,
    400,
    'Only https://github.com/owner/repository URLs are allowed.',
  );
  const parts = u.pathname.replace(/\/$/, '').split('/').filter(Boolean);
  ensure(
    parts.length === 2 &&
      parts.every((x) => /^[A-Za-z0-9_.-]{1,100}$/.test(x)) &&
      !parts.includes('..'),
    400,
    'Invalid repository path.',
  );
  const owner = parts[0],
    repo = parts[1].replace(/\.git$/, '');
  ensure(repo && repo !== '.' && repo !== '..', 400, 'Invalid repository name.');
  return {
    owner,
    repo,
    url: `https://github.com/${owner}/${repo}`,
    key: `${owner}/${repo}`.toLowerCase(),
  };
}
async function github(path: string) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2026-03-10',
      ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
    },
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  });
  ensure(
    response.ok,
    response.status === 404 ? 404 : 503,
    response.status === 404
      ? 'Repository or revision is not accessible.'
      : 'GitHub inspection is unavailable or rate-limited.',
  );
  const text = await response.text();
  ensure(
    Buffer.byteLength(text) < 6 * 1024 * 1024,
    502,
    'GitHub response exceeds inspection limits.',
  );
  return JSON.parse(text);
}
export async function authorizeRepository(projectId: string, url: string) {
  const repo = parseGithubUrl(url);
  const metadata = await github(`/repos/${repo.owner}/${repo.repo}`);
  ensure(
    metadata.full_name?.toLowerCase() === repo.key,
    502,
    'GitHub repository identity mismatch.',
  );
  if (metadata.private) {
    let allowed: Record<string, string[]> = {};
    try {
      allowed = JSON.parse(process.env.GITHUB_PRIVATE_PROJECT_REPOS_JSON ?? '{}');
    } catch {
      throw new AppError(503, 'Private repository mapping is invalid.');
    }
    ensure(
      Array.isArray(allowed[projectId]) &&
        allowed[projectId].map((x) => x.toLowerCase()).includes(repo.key),
      403,
      'Private repository access must be authorized for this specific project by the operator.',
    );
  }
  return repo;
}
export async function resolveRepository(projectId: string, url: string, ref: string) {
  const repo = await authorizeRepository(projectId, url);
  ensure(
    ref.length >= 1 && ref.length <= 200 && !/[\x00-\x20?#\\]/.test(ref) && !ref.includes('..'),
    400,
    'Provide a valid branch, tag or commit SHA.',
  );
  const commit = await github(
    `/repos/${repo.owner}/${repo.repo}/commits/${encodeURIComponent(ref)}`,
  );
  ensure(
    /^[a-f0-9]{40}$/.test(commit.sha) && /^[a-f0-9]{40}$/.test(commit.commit?.tree?.sha),
    502,
    'GitHub did not resolve a reproducible commit and tree.',
  );
  return {
    repositoryUrl: repo.url,
    repositoryRef: ref,
    commitSha: commit.sha as string,
    treeSha: commit.commit.tree.sha as string,
  };
}
export type RepositoryAnalysis = {
  status: 'INSPECTED' | 'UNAVAILABLE' | 'NOT_SUBMITTED';
  repositoryUrl: string | null;
  commitSha: string | null;
  treeSha: string | null;
  paths: string[];
  files: { path: string; sha: string; text: string; reference: string }[];
  languages: string[];
  frameworks: string[];
  testFiles: string[];
  scripts: Record<string, string>;
  limitations: string[];
};
export function analyzeStructure(paths: string[], files: RepositoryAnalysis['files']) {
  const languages = [
    ...new Set(
      paths
        .map((p) =>
          p.endsWith('.py')
            ? 'Python'
            : /\.tsx?$/.test(p)
              ? 'TypeScript'
              : /\.jsx?$/.test(p)
                ? 'JavaScript'
                : p.endsWith('.go')
                  ? 'Go'
                  : p.endsWith('.rs')
                    ? 'Rust'
                    : null,
        )
        .filter((x) => x !== null),
    ),
  ];
  let scripts: Record<string, string> = {};
  const frameworks: string[] = [];
  const packageFile = files.find((f) => f.path === 'package.json');
  if (packageFile) {
    try {
      const pkg = JSON.parse(packageFile.text);
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      for (const [name, label] of Object.entries({
        next: 'Next.js',
        react: 'React',
        express: 'Express',
        vue: 'Vue',
      }))
        if (name in deps) frameworks.push(label);
      scripts = z.record(z.string(), z.string()).parse(pkg.scripts ?? {});
    } catch {
      /* Invalid configuration is evidence, never executable instructions. */
    }
  }
  const python = files
    .filter((f) => /requirements.*\.txt$|pyproject.toml$|manage.py$/.test(f.path))
    .map((f) => f.text.toLowerCase())
    .join('\n');
  if (python.includes('fastapi')) frameworks.push('FastAPI');
  if (python.includes('django')) frameworks.push('Django');
  const testFiles = paths.filter((p) =>
    /(^|\/)(tests?|__tests__)(\/|\.)|[._](test|spec)\.[^/]+$|(^|\/)test_[^/]+\.py$/.test(p),
  );
  return { languages, frameworks, testFiles, scripts };
}
export async function inspectRepository(
  projectId: string,
  submission: { repositoryUrl: string | null; commitSha: string | null; treeSha: string | null },
): Promise<RepositoryAnalysis> {
  const empty: RepositoryAnalysis = {
    status: 'NOT_SUBMITTED',
    repositoryUrl: submission.repositoryUrl,
    commitSha: submission.commitSha,
    treeSha: submission.treeSha,
    paths: [],
    files: [],
    languages: [],
    frameworks: [],
    testFiles: [],
    scripts: {},
    limitations: ['Static code inspection does not prove runtime behavior.'],
  };
  if (!submission.repositoryUrl) return empty;
  const repo = await authorizeRepository(projectId, submission.repositoryUrl);
  ensure(
    /^[a-f0-9]{40}$/.test(submission.commitSha ?? '') &&
      /^[a-f0-9]{40}$/.test(submission.treeSha ?? ''),
    409,
    'Submission is missing its pinned commit.',
  );
  const tree = await github(
    `/repos/${repo.owner}/${repo.repo}/git/trees/${submission.treeSha}?recursive=1`,
  );
  ensure(tree.sha === submission.treeSha && Array.isArray(tree.tree), 502, 'GitHub tree mismatch.');
  const blobs = z
    .array(
      z.object({
        path: z.string(),
        type: z.string(),
        mode: z.string(),
        sha: z.string().regex(/^[a-f0-9]{40}$/),
        size: z.number().optional(),
      }),
    )
    .parse(tree.tree)
    .filter(
      (x) =>
        x.type === 'blob' &&
        safeRepositoryPath(x.path) &&
        x.mode !== '120000' &&
        !/(^|\/)(\.env(?:\.|$)|node_modules|vendor|\.git|dist|build|coverage|id_rsa|credentials|secrets)(\/|\.|$)/i.test(
          x.path,
        ) &&
        !x.path.includes('..') &&
        !x.path.startsWith('/'),
    )
    .slice(0, 3000);
  const selected = blobs
    .filter(
      (x) =>
        /README|package.json$|pyproject.toml$|requirements.*\.txt$|next.config|vite.config|(^|\/)src\/|(^|\/)app\/|(^|\/)tests?\/|(^|\/)test_/.test(
          x.path,
        ) &&
        (!x.size || x.size < 100000),
    )
    .sort((a, b) => {
      const rank = (p: string) =>
        /README|package.json$|pyproject.toml|requirements.*txt$/.test(p) ? 0 : 1;
      return rank(a.path) - rank(b.path);
    })
    .slice(0, 9);
  const files: RepositoryAnalysis['files'] = [];
  for (let i = 0; i < selected.length; i += 3) {
    const batch = await Promise.all(
      selected.slice(i, i + 3).map(async (item) => {
        const blob = await github(`/repos/${repo.owner}/${repo.repo}/git/blobs/${item.sha}`);
        ensure(
          blob.sha === item.sha && blob.encoding === 'base64' && blob.size <= 100000,
          502,
          'Invalid repository blob.',
        );
        return {
          path: item.path,
          sha: item.sha,
          text: Buffer.from(blob.content, 'base64').toString('utf8').slice(0, 16000),
          reference: `repo:${submission.commitSha}:${item.path}`,
        };
      }),
    );
    files.push(...batch);
  }
  const paths = blobs.map((b) => b.path);
  return {
    ...empty,
    status: 'INSPECTED',
    paths,
    files,
    ...analyzeStructure(paths, files),
    limitations: [
      ...empty.limitations,
      `Bounded inspection: ${files.length} text files read; ${paths.length} safe paths listed.`,
      ...(tree.truncated || tree.tree.length > 3000
        ? ['GitHub reported a truncated tree; repository coverage is incomplete.']
        : []),
    ],
  };
}
export const runnerResultSchema = z
  .object({
    commitSha: z.string().regex(/^[a-f0-9]{40}$/),
    status: z.enum(['COMPLETED', 'SETUP_FAILED', 'TIMEOUT']),
    isolation: z
      .object({
        nonRoot: z.literal(true),
        network: z.literal('disabled'),
        productionSecrets: z.literal(false),
        privileged: z.literal(false),
        hostSocket: z.literal(false),
        sourceReadOnly: z.literal(true),
        cpuLimit: z.number().positive().max(4),
        memoryMb: z.number().positive().max(4096),
        timeoutSeconds: z.number().positive().max(120),
        diskMb: z.number().positive().max(2048),
      })
      .strict(),
    commands: z
      .array(
        z
          .object({
            command: z.string().max(500),
            kind: z.enum(['test', 'build', 'lint', 'typecheck']),
            exitCode: z.number().int().nullable(),
            durationMs: z.number().nonnegative(),
            stdout: z.string().max(10000),
            stderr: z.string().max(10000),
          })
          .strict(),
      )
      .max(12),
    suites: z
      .array(
        z
          .object({
            id: z.string().max(100),
            cases: z
              .array(
                z
                  .object({ name: z.string().max(300), status: z.enum(['pass', 'fail', 'skip']) })
                  .strict(),
              )
              .max(500),
          })
          .strict(),
      )
      .max(30),
  })
  .strict();
export type TestExecution = {
  status: 'TEST_EXECUTION_UNAVAILABLE' | 'COMPLETED' | 'SETUP_FAILED' | 'TIMEOUT';
  reason: string;
  commands: z.infer<typeof runnerResultSchema>['commands'];
  suites: z.infer<typeof runnerResultSchema>['suites'];
};
export function runnerConfigured() {
  return (
    process.env.RUNNER_SECURITY_APPROVED === 'true' &&
    Boolean(process.env.REPOSITORY_RUNNER_URL && process.env.REPOSITORY_RUNNER_TOKEN)
  );
}
export async function executeIsolatedTests(
  repo: RepositoryAnalysis,
  suites: string[],
): Promise<TestExecution> {
  const unavailable = (reason: string): TestExecution => ({
    status: 'TEST_EXECUTION_UNAVAILABLE',
    reason,
    commands: [],
    suites: [],
  });
  if (!runnerConfigured() || repo.status !== 'INSPECTED')
    return unavailable(
      'No approved isolated execution service is configured, or repository inspection is unavailable. No repository code was executed.',
    );
  const u = new URL(process.env.REPOSITORY_RUNNER_URL!);
  ensure(
    u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash,
    503,
    'The isolated runner must use an operator-configured HTTPS endpoint.',
  );
  try {
    const response = await fetch(u, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.REPOSITORY_RUNNER_TOKEN}`,
      },
      body: JSON.stringify({
        repositoryUrl: repo.repositoryUrl,
        commitSha: repo.commitSha,
        suites: [...new Set(suites)],
        limits: {
          network: 'disabled',
          timeoutSeconds: 90,
          memoryMb: 2048,
          cpuLimit: 2,
          diskMb: 1024,
        },
        contractVersion: 1,
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(100000),
    });
    ensure(response.ok, 503, 'Runner unavailable.');
    const text = await response.text();
    ensure(text.length < 300000, 502, 'Runner report exceeds limits.');
    const report = runnerResultSchema.parse(JSON.parse(text));
    ensure(report.commitSha === repo.commitSha, 502, 'Runner evaluated a different commit.');
    ensure(
      new Set(report.suites.map((s) => s.id)).size === report.suites.length,
      502,
      'Duplicate runner suites.',
    );
    if (report.status === 'COMPLETED')
      ensure(
        report.commands.some((c) => c.kind === 'test'),
        502,
        'Runner claims completion without a recorded test command.',
      );
    ensure(
      !(
        report.status === 'COMPLETED' &&
        report.commands.some((c) => c.kind === 'test' && c.exitCode !== 0) &&
        !report.suites.some((s) => s.cases.some((c) => c.status === 'fail'))
      ),
      502,
      'Runner test exit code contradicts reported results.',
    );
    const secrets = Object.entries(process.env)
      .filter(([k, v]) => /SECRET|TOKEN|API_KEY|DATABASE_URL/.test(k) && v && v.length > 5)
      .map(([, v]) => v!);
    const redact = (value: string) =>
      secrets
        .reduce((text, secret) => text.replaceAll(secret, '[REDACTED]'), value)
        .replace(/(?:Bearer\s+)[\w.\-]+/g, 'Bearer [REDACTED]');
    return {
      status: report.status,
      reason:
        'Results returned by the configured isolated runner; scope is limited to the recorded commands and suites.',
      commands: report.commands.map((c) => ({
        ...c,
        command: redact(c.command),
        stdout: redact(c.stdout),
        stderr: redact(c.stderr),
      })),
      suites: report.suites.filter((s) => suites.includes(s.id)),
    };
  } catch {
    return {
      status: 'SETUP_FAILED',
      reason:
        'Runner failed, timed out, or returned an invalid/incorrect-commit report. No passing test results are trusted.',
      commands: [],
      suites: [],
    };
  }
}
