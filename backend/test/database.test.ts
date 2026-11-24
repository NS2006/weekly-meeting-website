import { createPool } from '../src/database/pool.ts';
import { silentLogger } from './helpers.ts';

// Runs against the real database when DATABASE_URL is set (npm test loads backend/.env); skipped otherwise.
const url = process.env.DATABASE_URL;
const describeDb = url ? describe : describe.skip;

describeDb('database (integration)', () => {
  const pool = createPool({ connectionString: url ?? '', max: 2 }, silentLogger);
  afterAll(() => pool.end());

  it('connects as a role without superuser or create-database rights', async () => {
    const { rows } = await pool.query<{ rolsuper: boolean; rolcreatedb: boolean }>(
      'SELECT rolsuper, rolcreatedb FROM pg_roles WHERE rolname = current_user',
    );
    expect(rows[0]).toEqual({ rolsuper: false, rolcreatedb: false });
  });

  it('returns DATE as a YYYY-MM-DD string, whatever the server time zone', async () => {
    const { rows } = await pool.query<{ d: unknown }>("SELECT '2026-11-20'::date AS d");
    expect(rows[0]?.d).toBe('2026-11-20');
  });

  it('has every table of the migrations', async () => {
    const { rows } = await pool.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name <> '_prisma_migrations' ORDER BY table_name",
    );
    expect(rows.map((r) => r.table_name)).toEqual([
      'attachments',
      'meeting_series',
      'meeting_speakers',
      'meetings',
      'note_meetings',
      'note_sections',
      'notes',
      'projects',
      'team_members',
      'teams',
      'user_roles',
      'users',
    ]);
  });
});
