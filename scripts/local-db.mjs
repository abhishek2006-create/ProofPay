import EmbeddedPostgres from 'embedded-postgres';
import { Client } from 'pg';
import { existsSync, realpathSync } from 'node:fs';
import { createConnection } from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultDirectory = fileURLToPath(new URL('../.data/postgres', import.meta.url));
function canonicalDirectory(directory) {
  const resolved = existsSync(directory) ? realpathSync(directory) : path.resolve(directory);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}
async function portIsOpen(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    const finish = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(800, () => finish(false));
  });
}
async function verifyAndPrepare(directory, port) {
  const options = {
    host: '127.0.0.1',
    port,
    user: 'proofpay',
    password: 'proofpay_local_only',
    connectionTimeoutMillis: 2000,
    statement_timeout: 3000,
  };
  const admin = new Client({ ...options, database: 'postgres' });
  try {
    await admin.connect();
    const identity = await admin.query("SELECT current_setting('data_directory') AS directory");
    if (canonicalDirectory(identity.rows[0].directory) !== canonicalDirectory(directory))
      throw new Error(
        `Port ${port} belongs to a different PostgreSQL data directory. Use only one local database setup on that port.`,
      );
    const existing = await admin.query("SELECT 1 FROM pg_database WHERE datname='proofpay'");
    if (!existing.rowCount) {
      try {
        await admin.query('CREATE DATABASE proofpay');
      } catch (error) {
        if (error?.code !== '42P04') throw error;
      }
    }
  } finally {
    await admin.end().catch(() => {});
  }
  const application = new Client({ ...options, database: 'proofpay' });
  try {
    await application.connect();
    await application.query('SELECT 1');
  } finally {
    await application.end().catch(() => {});
  }
}
export function startupErrorMessage(error, diagnostics = '') {
  const reason =
    error instanceof Error
      ? error.message
      : typeof error === 'string' && error.trim()
        ? error
        : 'The embedded PostgreSQL process exited before it became ready.';
  return `Could not start the local database: ${reason}${diagnostics.trim() ? `\nPostgreSQL details:\n${diagnostics.trim()}` : ''}\nExisting database files were preserved. Do not delete .data/postgres to resolve a startup error.`;
}
export async function launchLocalDatabase({
  databaseDir = defaultDirectory,
  port = 5438,
  log = console.log,
} = {}) {
  const directory = path.resolve(databaseDir);
  if (await portIsOpen(port)) {
    try {
      await verifyAndPrepare(directory, port);
    } catch (error) {
      throw new Error(
        `Port ${port} is already in use, but this project's database could not be verified. ${error instanceof Error ? error.message : 'Check the original database terminal.'}`,
      );
    }
    log(
      `ProofPay PostgreSQL is already running and ready on 127.0.0.1:${port}. Keep its original database terminal running. No second instance was started.`,
    );
    return { started: false, stop: async () => {} };
  }
  let diagnostics = '',
    started = false;
  const record = (message) => {
    diagnostics = (diagnostics + String(message)).slice(-6000);
  };
  const pg = new EmbeddedPostgres({
    databaseDir: directory,
    user: 'proofpay',
    password: 'proofpay_local_only',
    port,
    persistent: true,
    authMethod: 'scram-sha-256',
    postgresFlags: ['-h', '127.0.0.1'],
    onLog: record,
    onError: record,
  });
  try {
    if (!existsSync(path.join(directory, 'PG_VERSION'))) await pg.initialise();
    await pg.start();
    started = true;
    await verifyAndPrepare(directory, port);
    log(
      `PostgreSQL ready on 127.0.0.1:${port} (local development only). Keep this terminal running.`,
    );
    let stopping;
    return {
      started: true,
      stop: () => {
        stopping ??= pg.stop();
        return stopping;
      },
    };
  } catch (error) {
    if (started) await pg.stop().catch(() => {});
    // Another launcher may have won the startup race. Reuse only this exact cluster.
    if (await portIsOpen(port)) {
      try {
        await verifyAndPrepare(directory, port);
        log(
          `ProofPay PostgreSQL is already running and ready on 127.0.0.1:${port}. No second instance was started.`,
        );
        return { started: false, stop: async () => {} };
      } catch {
        /* Report the native startup diagnostics below. */
      }
    }
    throw new Error(startupErrorMessage(error, diagnostics));
  }
}
async function main() {
  try {
    const database = await launchLocalDatabase();
    if (!database.started) return;
    const keepAlive = setInterval(() => {}, 60000);
    let stopping = false;
    const stop = async () => {
      if (stopping) return;
      stopping = true;
      try {
        await database.stop();
      } catch (error) {
        console.error(startupErrorMessage(error));
        process.exitCode = 1;
      } finally {
        clearInterval(keepAlive);
      }
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  } catch (error) {
    console.error(error instanceof Error ? error.message : startupErrorMessage(error));
    process.exitCode = 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  await main();
