import { describe, it, expect } from 'vitest';
import { createServer } from 'node:net';
import { mkdir, mkdtemp, rm, access } from 'node:fs/promises';
import path from 'node:path';
import { Client } from 'pg';
import { launchLocalDatabase, startupErrorMessage } from '../scripts/local-db.mjs';

describe('local database launcher', () => {
  it('explains native startup failures even when the library rejects undefined', () => {
    const message = startupErrorMessage(
      undefined,
      'FATAL: lock file postmaster.pid already exists',
    );
    expect(message).toContain('exited before it became ready');
    expect(message).toContain('FATAL: lock file');
    expect(message).toContain('files were preserved');
    expect(startupErrorMessage(new Error('Permission denied'))).toContain('Permission denied');
  });

  it('does not take over a port occupied by a different service', async () => {
    const server = createServer((socket) => socket.destroy());
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const port = (server.address() as { port: number }).port;
      await expect(launchLocalDatabase({ port, log: () => {} })).rejects.toThrow('already in use');
      expect(server.listening).toBe(true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('starts a fresh cluster, preserves data on repeated launch and leaves ownership with the first launcher', async () => {
    const root = path.resolve('.data');
    await mkdir(root, { recursive: true });
    const directory = await mkdtemp(path.join(root, 'db-launcher-test-'));
    const reservation = createServer();
    await new Promise<void>((resolve) => reservation.listen(0, '127.0.0.1', resolve));
    const port = (reservation.address() as { port: number }).port;
    await new Promise<void>((resolve) => reservation.close(() => resolve()));
    let owner: Awaited<ReturnType<typeof launchLocalDatabase>> | undefined;
    const client = new Client({
      host: '127.0.0.1',
      port,
      user: 'proofpay',
      password: 'proofpay_local_only',
      database: 'proofpay',
      connectionTimeoutMillis: 3000,
    });
    try {
      owner = await launchLocalDatabase({ databaseDir: directory, port, log: () => {} });
      expect(owner.started).toBe(true);
      await client.connect();
      await client.query('CREATE TABLE launcher_preservation (value text)');
      await client.query("INSERT INTO launcher_preservation VALUES ('keep this data')");
      const reused = await launchLocalDatabase({ databaseDir: directory, port, log: () => {} });
      expect(reused.started).toBe(false);
      await reused.stop();
      expect((await client.query('SELECT value FROM launcher_preservation')).rows[0].value).toBe(
        'keep this data',
      );
      await expect(
        launchLocalDatabase({
          databaseDir: path.join(root, 'different-cluster'),
          port,
          log: () => {},
        }),
      ).rejects.toThrow('different PostgreSQL data directory');
    } finally {
      await client.end().catch(() => {});
      await owner?.stop();
      await access(path.join(directory, 'PG_VERSION'));
      // Delete only this test's freshly-created, verified workspace directory.
      const relative = path.relative(root, directory);
      if (
        relative.startsWith('db-launcher-test-') &&
        !relative.includes(path.sep) &&
        !path.isAbsolute(relative)
      )
        await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  }, 60000);
});
