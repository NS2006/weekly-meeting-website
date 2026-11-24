import pg from 'pg';
import { describeError } from '../utils/errors.ts';
import type { Logger } from '../utils/logger.ts';

// DATE columns (meetings.meeting_date) stay 'YYYY-MM-DD' strings. pg's default turns them into a JS Date at
// midnight in the server's time zone, which shifts the day when the server is not on Indonesia time.
const DATE_OID = 1082;
pg.types.setTypeParser(DATE_OID, (value: string) => value);
// BIGINT ids stay strings (pg's default) and are sent to the client as strings.

/** What repositories need from the database; a pg Pool or a test double. Always pass values as parameters. */
export interface Db {
  query<R extends pg.QueryResultRow = pg.QueryResultRow>(text: string, values?: unknown[]): Promise<pg.QueryResult<R>>;
}

/** A Db that can also run several statements in one transaction. */
export interface Database extends Db {
  /** BEGIN, run `work` on one connection, COMMIT; ROLLBACK if it throws. */
  transaction<T>(work: (tx: Db) => Promise<T>): Promise<T>;
}

export function withTransactions(pool: pg.Pool): Database {
  return {
    query: (text, values) => pool.query(text, values),
    async transaction(work) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await work(client);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },
  };
}

export interface PoolOptions {
  connectionString: string;
  max: number;
}

export function createPool(options: PoolOptions, logger: Logger): pg.Pool {
  const pool = new pg.Pool({
    connectionString: options.connectionString,
    max: options.max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 10_000,
    application_name: 'weekly-meeting-backend',
  });
  // Without a listener, an idle client losing its connection would crash the process.
  pool.on('error', (err) => logger.error({ err: describeError(err) }, 'idle database client failed'));
  return pool;
}
