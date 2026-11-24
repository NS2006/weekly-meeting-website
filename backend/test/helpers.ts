import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Express } from 'express';
import type { Database, Db } from '../src/database/pool.ts';
import type { AuthConfig } from '../src/modules/auth/types.ts';
import { createLogger } from '../src/utils/logger.ts';

export const silentLogger = createLogger('silent');

export function testAuth(overrides: Partial<AuthConfig> = {}): AuthConfig {
  return { adminEmails: [], sessionTtlMs: 60 * 60 * 1000, mockSignIn: true, secureCookies: false, ...overrides };
}

/** The `name=value` part of the session cookie a response set, to send back as a Cookie header. */
export function sessionCookie(res: Response): string {
  const header = res.headers.getSetCookie().find((c) => c.startsWith('wm_session='));
  if (!header) throw new Error('no wm_session cookie was set');
  return header.split(';')[0] ?? '';
}

/** A Db double whose query() resolves with no rows, or rejects with the given error. */
export function fakeDb(failWith?: Error): Database {
  const db: Database = {
    query: (async () => {
      if (failWith) throw failWith;
      return { rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] };
    }) as Db['query'],
    transaction: (work) => work(db),
  };
  return db;
}

/** Starts the app on a free port; call close() when done. */
export async function serve(app: Express): Promise<{ url: string; close: () => Promise<void> }> {
  const server: Server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}
