// Start only ProofPay's trusted application and service. No submission is executed here.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';

const root = fileURLToPath(new URL('../', import.meta.url));
const inheritedEnv = { ...process.env };
dotenv.config({ path: path.join(root, '.env'), quiet: true });
const serviceDir = path.join(root, 'ai-service');
const serviceFile = path.join(serviceDir, '.env');
const serviceSettings = existsSync(serviceFile) ? dotenv.parse(readFileSync(serviceFile)) : {};
const windows = process.platform === 'win32';
const candidates = [
  path.join(serviceDir, '.venv', windows ? 'Scripts/python.exe' : 'bin/python'),
  path.join(root, '.venv', windows ? 'Scripts/python.exe' : 'bin/python'),
];
const python =
  process.env.PROOFPAY_PYTHON_EXECUTABLE ||
  candidates.find(existsSync) ||
  (windows ? 'python' : 'python3');
const token = randomBytes(32).toString('hex');
const port = Number(process.env.PROOFPAY_PYTHON_PORT || 8001);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('Invalid Python service port.');
const serviceEnv = {};
for (const [key, value] of Object.entries(process.env))
  if (/^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|HOME|USERPROFILE|LANG)$/i.test(key))
    serviceEnv[key] = value;
const serviceKeys = [
  'GITHUB_TOKEN',
  'GITHUB_PRIVATE_PROJECT_REPOS_JSON',
  'REPOSITORY_RUNNER_URL',
  'REPOSITORY_RUNNER_TOKEN',
  'RUNNER_SECURITY_APPROVED',
  'RUNNER_TRUSTED_SUITES_JSON',
];
for (const key of serviceKeys) {
  const value = inheritedEnv[key] ?? serviceSettings[key] ?? process.env[key];
  if (value !== undefined) serviceEnv[key] = value;
}
serviceEnv.AI_SERVICE_TOKEN = token;
// Pass the service credential to the Next.js server process.
const applicationEnv = {
  ...process.env,
  AI_SERVICE_URL: `http://127.0.0.1:${port}`,
  AI_SERVICE_TOKEN: token,
};
for (const key of serviceKeys) delete applicationEnv[key];
const service = spawn(
  python,
  ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(port)],
  { cwd: serviceDir, env: serviceEnv, stdio: 'inherit', windowsHide: true },
);
let next;
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  service.kill();
  next?.kill();
  process.exitCode = code;
}
service.on('error', () => {
  console.error(
    'Python could not start. Install ai-service/requirements.txt and set PROOFPAY_PYTHON_EXECUTABLE if needed.',
  );
  stop(1);
});
service.on('exit', (code) => {
  if (!stopping) {
    console.error('Python service stopped.');
    stop(code || 1);
  }
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop());
try {
  let ready = false;
  for (let attempt = 0; attempt < 50 && !stopping; attempt++) {
    try {
      // Authenticated probe ensures this is our service, not another process on the port.
      const response = await fetch(`http://127.0.0.1:${port}/v1/repositories/inspect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ projectId: 'local-readiness', submission: {} }),
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok && (await response.json()).status === 'NOT_SUBMITTED') {
        ready = true;
        break;
      }
    } catch {
      /* Wait briefly for the local service to bind. */
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (!ready)
    throw new Error(
      'Python service did not become ready. Check dependencies and port availability.',
    );
  console.log(`ProofPay is connected to the Python verification service on loopback port ${port}.`);
  next = spawn(
    process.execPath,
    [
      path.join(root, 'node_modules/next/dist/bin/next'),
      'dev',
      '--webpack',
      '--hostname',
      '127.0.0.1',
    ],
    {
      cwd: root,
      env: applicationEnv,
      stdio: 'inherit',
      windowsHide: true,
    },
  );
  next.on('error', () => stop(1));
  next.on('exit', (code) => stop(code || 0));
} catch (error) {
  console.error(error.message);
  stop(1);
}
