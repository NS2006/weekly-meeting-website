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
  const cleanup = async () => {
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
    };

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
