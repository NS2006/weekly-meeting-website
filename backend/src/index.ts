import { createApp } from './app.ts';
import { loadEnv, type Env } from './config/env.ts';
import { createPool, withTransactions } from './database/pool.ts';
import { createObjectStorage } from './modules/attachments/storage.ts';
import type { AuthConfig } from './modules/auth/types.ts';
import { createMeetingsService } from './modules/meetings/service.ts';
import { REFRESH_INTERVAL_MS } from './modules/meetings/types.ts';
import { createTeamsService } from './modules/teams/service.ts';
import { PURGE_INTERVAL_MS } from './modules/teams/types.ts';
import { createUsersRepository } from './modules/users/repository.ts';
import { describeError } from './utils/errors.ts';
import { createLogger } from './utils/logger.ts';

function readEnv(): Env {
  try {
    return loadEnv();
  } catch (err) {
    // Names the invalid variables only; see loadEnv.
    console.error((err as Error).message);
    process.exit(1);
  }
}

const env = readEnv();
const logger = createLogger(env.LOG_LEVEL);
const pool = createPool({ connectionString: env.DATABASE_URL, max: env.DB_POOL_MAX }, logger);
const auth: AuthConfig = {
  adminEmails: env.ADMIN_EMAILS,
  sessionTtlMs: env.SESSION_TTL_HOURS * 60 * 60 * 1000,
  mockSignIn: env.NODE_ENV !== 'production',
  secureCookies: env.NODE_ENV === 'production',
};
const db = withTransactions(pool);
const storage = await createObjectStorage(env);
if (env.NODE_ENV === 'production' && storage.driver === 'local') {
  logger.warn('note images are stored on this machine (STORAGE_DRIVER=local): set STORAGE_DRIVER=gcs and GCS_BUCKET');
}
const app = createApp({ db, logger, auth, storage });

// Deleted teams are kept 30 days for the leader to restore, then deleted for good. Runs at start and every hour;
// idempotent, so several backend instances can run it at once.
const teams = createTeamsService({ db, logger });
function purgeTeams(): void {
  teams
    .purgeExpired()
    .then((count) => count > 0 && logger.info({ count }, 'teams: purged after 30 days'))
    .catch((err: unknown) => logger.warn({ err: describeError(err) }, 'teams: purge failed'));
}
purgeTeams();
setInterval(purgeTeams, PURGE_INTERVAL_MS).unref();

// Meetings: past ones are stored as done, and every active series gets its next 4 weeks. Runs at start and every
// hour (so a new day is picked up within the hour); idempotent like the purge.
const meetings = createMeetingsService({ db, logger });
function refreshMeetings(): void {
  meetings
    .refresh()
    .then(({ done, created }) => (done > 0 || created > 0) && logger.info({ done, created }, 'meetings: refreshed'))
    .catch((err: unknown) => logger.warn({ err: describeError(err) }, 'meetings: refresh failed'));
}
refreshMeetings();
setInterval(refreshMeetings, REFRESH_INTERVAL_MS).unref();

const server = app.listen(env.PORT, env.HOST, () => {
  logger.info({ host: env.HOST, port: env.PORT, env: env.NODE_ENV, storage: storage.driver }, 'backend listening');
  if (auth.mockSignIn) logger.warn('mock sign-in is on (no password): development only, replaced by Apps Gateway');
  createUsersRepository(pool)
    .countActiveAdmins()
    .then((count) => {
      if (count === 0 && auth.adminEmails.length === 0) {
        logger.warn('no active admin and ADMIN_EMAILS is empty: nobody can activate users');
      }
    })
    .catch((err: unknown) => logger.warn({ err: describeError(err) }, 'could not count admins at start'));
});

let stopping = false;
function shutdown(signal: string): void {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, 'shutting down');
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  server.close(() => {
    pool.end().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: describeError(reason) }, 'unhandled rejection');
  shutdown('unhandledRejection');
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err: describeError(err) }, 'uncaught exception');
  process.exit(1);
});
