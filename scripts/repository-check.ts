import 'dotenv/config';
import { resolveRepository, inspectRepository } from '../src/lib/agents/repository-agent';
async function main() {
  const [url, ref = 'HEAD', projectId = 'public-read-only-check'] = process.argv.slice(2);
  if (!url)
    throw new Error(
      'Usage: npx tsx scripts/repository-check.ts https://github.com/owner/repo [ref] [authorized-project-id]',
    );
  const pinned = await resolveRepository(projectId, url, ref);
  const result = await inspectRepository(projectId, pinned);
  console.log(
    JSON.stringify(
      {
        repository: pinned.repositoryUrl,
        requestedRef: ref,
        commitSha: pinned.commitSha,
        treeSha: pinned.treeSha,
        status: result.status,
        pathsListed: result.paths.length,
        filesRead: result.files.map((f) => f.path),
        languages: result.languages,
        frameworks: result.frameworks,
        testFiles: result.testFiles.length,
        limitations: result.limitations,
        codeExecuted: false,
      },
      null,
      2,
    ),
  );
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Inspection failed');
  process.exitCode = 1;
});
