import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app.ts';
import { createPool, withTransactions } from '../src/database/pool.ts';
import { serve, sessionCookie, silentLogger, testAuth } from './helpers.ts';

// Projects against the real database (npm test loads backend/.env); skipped without DATABASE_URL.
// Fictitious @projects.example.test users only; their projects and accounts are deleted before and after.
const url = process.env.DATABASE_URL;
const describeDb = url ? describe : describe.skip;

interface Person {
  id: string;
  cookie: string;
}
interface Project {
  id: string;
  name: string;
  description: string | null;
  status: string;
  updateCount: number;
  updatedAt: string;
}

describeDb('projects (integration)', () => {
  const pool = createPool({ connectionString: url ?? '', max: 4 }, silentLogger);
  const db = withTransactions(pool);
  const DOMAIN = '@projects.example.test';
  const TEAM = 'Projects Filter Test Team';
  const cleanup = async () => {
    await pool.query('DELETE FROM teams WHERE name = $1', [TEAM]);
    await pool.query('DELETE FROM notes WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)', [`%${DOMAIN}`]);
    await pool.query('DELETE FROM projects WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)', [`%${DOMAIN}`]);
    await pool.query('DELETE FROM users WHERE email LIKE $1', [`%${DOMAIN}`]);
  };
  let app: Awaited<ReturnType<typeof serve>>;

  beforeAll(async () => {
    await cleanup();
    app = await serve(createApp({ db, logger: silentLogger, auth: testAuth() }));
  });
  afterAll(async () => {
    await app.close();
    await cleanup();
    await pool.end();
  });

  async function person(name: string): Promise<Person> {
    const email = `${name.toLowerCase().replace(/\s+/g, '.')}${DOMAIN}`;
    const res = await fetch(`${app.url}/api/auth/mock-sign-in`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, name }),
    });
    const { user } = (await res.json()) as { user: { id: string } };
    await pool.query("UPDATE users SET status = 'active' WHERE id = $1", [user.id]);
    return { id: user.id, cookie: sessionCookie(res) };
  }
  const call = (who: Person, method: string, path: string, body?: unknown) =>
    fetch(`${app.url}/api${path}`, {
      method,
      headers: { cookie: who.cookie, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const code = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
  async function create(who: Person, name: string, description?: string): Promise<Project> {
    const res = await call(who, 'POST', '/projects', { name, description });
    expect(res.status).toBe(201);
    return ((await res.json()) as { project: Project }).project;
  }
  const list = async (who: Person, query = '') =>
    (await (await call(who, 'GET', `/projects${query}`)).json()) as {
      projects: Project[];
      counts: { active: number; archived: number };
      total: number;
      hasMore: boolean;
    };
  /** A note of the owner with one written section for the project; returns the note's id. */
  async function writeUpdate(who: Person, projectId: string): Promise<string> {
    const created = await call(who, 'POST', '/notes', { projectId });
    const { note } = (await created.json()) as { note: { id: string } };
    const content = {
      type: 'doc',
      content: [{ type: 'projectSection', attrs: { projectId }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Progress.' }] }] }],
    };
    expect((await call(who, 'PATCH', `/notes/${note.id}`, { content, version: 1 })).status).toBe(200);
    return note.id;
  }

  it('creates a project for its owner only, with a name unique per person (ignoring case)', async () => {
    const ana = await person('Ana Owner');
    const budi = await person('Budi Other');
    const project = await create(ana, '  Checkout revamp  ', '');
    expect(project).toMatchObject({ name: 'Checkout revamp', description: null, status: 'active', updateCount: 0 });

    expect(await code(await call(ana, 'POST', '/projects', { name: 'CHECKOUT REVAMP' }))).toBe('project_name_taken');
    // Another person may use the same name.
    await create(budi, 'Checkout revamp');

    // Nobody else sees it or can change it: 404, as if it did not exist.
    expect((await call(budi, 'GET', `/projects/${project.id}`)).status).toBe(404);
    expect((await call(budi, 'PATCH', `/projects/${project.id}`, { name: 'Mine now' })).status).toBe(404);
    expect((await call(budi, 'DELETE', `/projects/${project.id}`, { confirmName: 'Checkout revamp' })).status).toBe(404);
    expect((await list(budi)).projects.map((p) => p.id)).not.toContain(project.id);
  });

  it('edits name and description, refusing a name already in use', async () => {
    const owner = await person('Cici Edit');
    const first = await create(owner, 'Alpha');
    await create(owner, 'Beta');
    const res = await call(owner, 'PATCH', `/projects/${first.id}`, { name: 'Alpha v2', description: 'Rewrite' });
    expect(((await res.json()) as { project: Project }).project).toMatchObject({ name: 'Alpha v2', description: 'Rewrite' });
    expect(await code(await call(owner, 'PATCH', `/projects/${first.id}`, { name: 'beta' }))).toBe('project_name_taken');
    const cleared = await call(owner, 'PATCH', `/projects/${first.id}`, { description: '   ' });
    expect(((await cleared.json()) as { project: Project }).project.description).toBeNull();
  });

  it('archives (read-only, own tab) and restores', async () => {
    const owner = await person('Dodi Archive');
    const project = await create(owner, 'Old work');
    await call(owner, 'PATCH', `/projects/${project.id}`, { status: 'archived' });

    expect(await code(await call(owner, 'PATCH', `/projects/${project.id}`, { name: 'New name' }))).toBe('project_archived');
    expect((await list(owner)).projects).toEqual([]);
    const archived = await list(owner, '?status=archived');
    expect(archived.projects.map((p) => p.name)).toEqual(['Old work']);
    expect(archived.counts).toEqual({ active: 0, archived: 1 });

    const restored = await call(owner, 'PATCH', `/projects/${project.id}`, { status: 'active', name: 'Old work again' });
    expect(((await restored.json()) as { project: Project }).project).toMatchObject({ status: 'active', name: 'Old work again' });
  });

  it('filters and sorts on the server', async () => {
    const owner = await person('Eka Filter');
    await create(owner, 'Payments 100% uptime', 'Refunds and retries');
    await create(owner, 'Analytics');
    const zeta = await create(owner, 'Zeta');
    await call(owner, 'PATCH', `/projects/${zeta.id}`, { description: 'touched last' });
    const names = async (query: string) => (await list(owner, query)).projects.map((p) => p.name);

    expect(await names('')).toEqual(['Zeta', 'Analytics', 'Payments 100% uptime']); // recently updated first
    expect(await names('?sort=name')).toEqual(['Analytics', 'Payments 100% uptime', 'Zeta']);
    expect(await names('?sort=newest')).toEqual(['Zeta', 'Analytics', 'Payments 100% uptime']);
    expect(await names('?q=refund')).toEqual(['Payments 100% uptime']); // the description
    expect(await names('?q=100%25')).toEqual(['Payments 100% uptime']); // "%" is a character
    expect((await list(owner, '?q=analytics')).counts).toEqual({ active: 1, archived: 0 });

    for (const bad of ['?status=deleted', '?sort=size', '?extra=1']) {
      expect(await code(await call(owner, 'GET', `/projects${bad}`))).toBe('validation_failed');
    }
  });

  it('pages, and filters by last update and where the updates are shared (owner, 2026-11-25)', async () => {
    const owner = await person('Hana Pages');
    const fresh = await create(owner, 'Fresh');
    const month = await create(owner, 'Last month');
    const quiet = await create(owner, 'Quiet');
    const none = await create(owner, 'Never written');
    const freshNote = await writeUpdate(owner, fresh.id);
    await writeUpdate(owner, fresh.id);
    const monthNote = await writeUpdate(owner, month.id);
    const quietNote = await writeUpdate(owner, quiet.id);
    // Days back from now: the projects themselves were last changed 200 days ago, their notes 3, 40 and 100.
    const ago = (days: number) => new Date(Date.now() - days * 86_400_000);
    await pool.query('UPDATE projects SET updated_at = $2 WHERE user_id = $1', [owner.id, ago(200)]);
    await pool.query('UPDATE notes SET updated_at = $2 WHERE user_id = $1 AND id <> ALL($3::uuid[])', [owner.id, ago(3), [monthNote, quietNote]]);
    await pool.query('UPDATE notes SET updated_at = $2 WHERE id = $1', [monthNote, ago(40)]);
    await pool.query('UPDATE notes SET updated_at = $2 WHERE id = $1', [quietNote, ago(100)]);
    // The fresh project's first note is shared on a meeting of a team.
    const team = (await pool.query<{ id: string }>('INSERT INTO teams (name) VALUES ($1) RETURNING id', [TEAM])).rows[0]!.id;
    const series = (
      await pool.query<{ id: string }>("INSERT INTO meeting_series (team_id, name, days_of_week) VALUES ($1, 'Weekly', ARRAY[4]::smallint[]) RETURNING id", [team])
    ).rows[0]!.id;
    const meeting = (
      await pool.query<{ id: string }>("INSERT INTO meetings (series_id, scheduled_date, meeting_date) VALUES ($1, '2026-11-26', '2026-11-26') RETURNING id", [series])
    ).rows[0]!.id;
    await pool.query('INSERT INTO note_meetings (note_id, meeting_id) VALUES ($1, $2)', [freshNote, meeting]);
    const names = async (query: string) => (await list(owner, query)).projects.map((p) => p.name);

    // Pages: `limit` a page, the total on each, and whether more follow.
    const first = await list(owner, '?limit=3');
    expect(first).toMatchObject({ total: 4, hasMore: true, counts: { active: 4, archived: 0 } });
    expect(first.projects.map((p) => p.name)).toEqual(['Fresh', 'Last month', 'Quiet']);
    const second = await list(owner, '?limit=3&offset=3');
    expect(second).toMatchObject({ total: 4, hasMore: false });
    expect(second.projects.map((p) => p.name)).toEqual(['Never written']);

    // Last update: in the past 7, 30 or 90 days, longer ago, or never; the tab counts follow the filters.
    expect(await names('?activity=week')).toEqual(['Fresh']);
    expect(await names('?activity=month')).toEqual(['Fresh']);
    expect(await names('?activity=quarter')).toEqual(['Fresh', 'Last month']);
    expect(await names('?activity=quiet')).toEqual(['Quiet']);
    expect(await names('?activity=none')).toEqual(['Never written']);
    expect((await list(owner, '?activity=none')).counts).toEqual({ active: 1, archived: 0 });

    // Shared: on any meeting, on none, or on that team's meetings.
    expect(await names('?shared=yes')).toEqual(['Fresh']);
    expect(await names('?shared=no')).toEqual(['Last month', 'Quiet', 'Never written']);
    expect(await names(`?team=${team}`)).toEqual(['Fresh']);
    expect(await names(`?team=${randomUUID()}`)).toEqual([]);
    expect(await names(`?team=${team}&activity=quiet`)).toEqual([]);

    // Orders: left alone longest, most updates, oldest.
    expect(await names('?sort=stale')).toEqual(['Never written', 'Quiet', 'Last month', 'Fresh']);
    expect((await list(owner, '?sort=updates')).projects.map((p) => [p.name, p.updateCount])).toEqual([
      ['Fresh', 2],
      ['Last month', 1],
      ['Quiet', 1],
      ['Never written', 0],
    ]);
    expect(await names('?sort=oldest')).toEqual(['Fresh', 'Last month', 'Quiet', 'Never written']);
    expect(none.status).toBe('active');

    expect((await list(owner, '?limit=500')).projects).toHaveLength(4); // the editor's Project menu: every active project
    for (const bad of ['?limit=0', '?limit=501', '?offset=-1', '?activity=year', '?shared=maybe', '?team=12']) {
      expect(await code(await call(owner, 'GET', `/projects${bad}`))).toBe('validation_failed');
    }
  });

  it('offers my projects to pick: a few at random before typing, then the names that hold the text', async () => {
    const owner = await person('Gita Picker');
    const other = await person('Hadi Elsewhere');
    await create(other, 'Warehouse of someone else');
    const made = [];
    for (const name of ['Warehouse RFID', 'Warehouse Maintenance', 'ESL Middleware', 'TMS Use Case', 'WhatsApp OTP', 'Ranch LoRa', 'MobilePranta']) {
      made.push(await create(owner, name));
    }
    const old = await create(owner, 'Warehouse Inbound Check');
    await call(owner, 'PATCH', `/projects/${old.id}`, { status: 'archived' });
    type Choices = { projects: { id: string; name: string; status: string }[]; hasMore: boolean };
    const choices = async (query = '') => (await (await call(owner, 'GET', `/projects/choices${query}`)).json()) as Choices;

    // Before typing: five of mine, any status, a new pick each time (never someone else's).
    const mine = new Set([...made, old].map((p) => p.id));
    const picks = await Promise.all([0, 1, 2, 3, 4, 5].map(() => choices()));
    for (const pick of picks) {
      expect(pick.projects).toHaveLength(5);
      expect(pick.hasMore).toBe(false);
      expect(pick.projects.every((p) => mine.has(p.id))).toBe(true);
      expect(Object.keys(pick.projects[0] ?? {}).sort()).toEqual(['id', 'name', 'status']);
    }
    expect(new Set(picks.map((pick) => pick.projects.map((p) => p.id).join())).size).toBeGreaterThan(1);

    // Typing: names that hold the text, active first, then A–Z.
    expect((await choices('?q=WAREhouse')).projects.map((p) => [p.name, p.status])).toEqual([
      ['Warehouse Maintenance', 'active'],
      ['Warehouse RFID', 'active'],
      ['Warehouse Inbound Check', 'archived'],
    ]);
    expect(await choices('?q=nothing%20like%20it')).toEqual({ projects: [], hasMore: false });
    expect((await choices('?q=%25')).projects).toEqual([]); // "%" is a character, not "anything"

    // At most ten are sent; more say so.
    for (let i = 1; i <= 11; i++) await create(owner, `Report ${i}`);
    const many = await choices('?q=report');
    expect(many.projects).toHaveLength(10);
    expect(many.hasMore).toBe(true);

    for (const bad of ['?q=' + 'x'.repeat(101), '?status=active']) {
      expect(await code(await call(owner, 'GET', `/projects/choices${bad}`))).toBe('validation_failed');
    }
  });

  it('deletes for good only with the exact name typed; notes stay, without its sections', async () => {
    const owner = await person('Fani Delete');
    const project = await create(owner, 'Short lived');
    const created = await call(owner, 'POST', '/notes', { projectId: project.id });
    const { note } = (await created.json()) as { note: { id: string } };
    // The new note's section counts as an update once something is written in it.
    expect((await list(owner)).projects[0]?.updateCount).toBe(0);
    const written = {
      type: 'doc',
      content: [{ type: 'projectSection', attrs: { projectId: project.id }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Done.' }] }] }],
    };
    expect((await call(owner, 'PATCH', `/notes/${note.id}`, { content: written, version: 1 })).status).toBe(200);
    expect((await list(owner)).projects[0]?.updateCount).toBe(1);

    expect(await code(await call(owner, 'DELETE', `/projects/${project.id}`, { confirmName: 'short lived' }))).toBe(
      'confirmation_mismatch',
    );
    expect((await call(owner, 'DELETE', `/projects/${project.id}`, { confirmName: 'Short lived' })).status).toBe(204);
    expect((await call(owner, 'GET', `/projects/${project.id}`)).status).toBe(404);
    expect((await pool.query('SELECT 1 FROM notes WHERE id = $1', [note.id])).rowCount).toBe(1);
    expect((await pool.query('SELECT 1 FROM note_sections WHERE project_id = $1', [project.id])).rowCount).toBe(0);
  });

  it('checks input, and is for the User role only', async () => {
    const owner = await person('Gita Input');
    for (const body of [{ name: '' }, { name: 'x'.repeat(101) }, { name: 'A', description: 'x'.repeat(501) }, { name: 'A', extra: 1 }]) {
      expect(await code(await call(owner, 'POST', '/projects', body))).toBe('validation_failed');
    }
    expect((await call(owner, 'GET', '/projects/abc')).status).toBe(400);
    expect((await call(owner, 'GET', '/projects/75')).status).toBe(400); // ids are UUIDs, not counters
    expect(await code(await call(owner, 'PATCH', `/projects/${randomUUID()}`, {}))).toBe('validation_failed');

    // An admin acting as Admin has no access to projects.
    await pool.query("INSERT INTO user_roles (user_id, role) VALUES ($1, 'admin') ON CONFLICT DO NOTHING", [owner.id]);
    await call(owner, 'PUT', '/me/active-role', { role: 'admin' });
    expect(await code(await call(owner, 'GET', '/projects'))).toBe('user_role_only');
  });
});
