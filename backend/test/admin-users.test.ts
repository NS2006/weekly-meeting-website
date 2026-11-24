import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app.ts';
import { createPool, withTransactions } from '../src/database/pool.ts';
import { serve, sessionCookie, silentLogger, testAuth } from './helpers.ts';

// Users page API against the real database (npm test loads backend/.env); skipped without DATABASE_URL.
// Fictitious @admin.example.test users only, deleted before and after. Database suites run one at a time
// (--runInBand) because they share one database.
const url = process.env.DATABASE_URL;
const describeDb = url ? describe : describe.skip;

interface Account {
  id: string;
  cookie: string;
}

describeDb('admin Users page API (integration)', () => {
  const pool = createPool({ connectionString: url ?? '', max: 4 }, silentLogger);
  const cleanup = () => pool.query("DELETE FROM users WHERE email LIKE '%@admin.example.test'");
  const ROOT = 'jest.root@admin.example.test'; // in ADMIN_EMAILS
  let app: Awaited<ReturnType<typeof serve>>;
  let root: Account;

  async function signIn(email: string, name = 'Jest Person'): Promise<Account> {
    const res = await fetch(`${app.url}/api/auth/mock-sign-in`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, name }),
    });
    const { user } = (await res.json()) as { user: { id: string } };
    return { id: user.id, cookie: sessionCookie(res) };
  }
  const call = (who: Account, method: string, path: string, body?: unknown) =>
    fetch(`${app.url}/api${path}`, {
      method,
      headers: { cookie: who.cookie, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const actAs = (who: Account, role: 'user' | 'admin') => call(who, 'PUT', '/me/active-role', { role });
  const activate = (who: Account) => call(root, 'PATCH', `/admin/users/${who.id}`, { status: 'active' });
  const list = async (query: string) =>
    ((await (await call(root, 'GET', `/admin/users?${query}`)).json()) as { users: { email: string }[] }).users.map(
      (u) => u.email,
    );

  beforeAll(async () => {
    await cleanup();
    app = await serve(
      createApp({ db: withTransactions(pool), logger: silentLogger, auth: testAuth({ adminEmails: [ROOT] }) }),
    );
    root = await signIn(ROOT, 'Jest Root');
    await actAs(root, 'admin');
  });
  afterAll(async () => {
    await app.close();
    await cleanup();
    await pool.end();
  });

  it('is for admins acting as admin only', async () => {
    const plain = await signIn('jest.plain@admin.example.test');
    await activate(plain);
    expect(await (await call(plain, 'GET', '/admin/users')).json()).toEqual({ error: { code: 'admin_only' } });

    const rootAsUser = await signIn(ROOT); // a new session starts in the user role
    expect((await call(rootAsUser, 'GET', '/admin/users')).status).toBe(403);
    await actAs(rootAsUser, 'admin');
    expect((await call(rootAsUser, 'GET', '/admin/users')).status).toBe(200);
  });

  it('lists users with sign-in times, and filters by text, status and admin', async () => {
    await signIn('jest.list.one@admin.example.test', 'Listy One');
    const res = await call(root, 'GET', '/admin/users?q=LISTY');
    const body = (await res.json()) as { users: Record<string, unknown>[]; truncated: boolean };
    expect(res.status).toBe(200);
    expect(body.truncated).toBe(false);
    expect(body.users).toEqual([
      {
        id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/), // a random UUID, not a counter
        name: 'Listy One',
        email: 'jest.list.one@admin.example.test',
        status: 'inactive',
        roles: ['user'],
        adminFromConfig: false,
        createdAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT/),
        lastLoginAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT/),
        waiting: true,
      },
    ]);

    expect(await list('q=admin.example.test&status=inactive')).toContain('jest.list.one@admin.example.test');
    expect(await list('q=admin.example.test&status=active')).not.toContain('jest.list.one@admin.example.test');
    expect(await list('q=admin.example.test&admin=true')).toEqual([ROOT]);
    expect(await list('q=admin.example.test&admin=false')).not.toContain(ROOT);
    expect(await list('q=%25')).toEqual([]); // "%" is matched literally, not as a wildcard
  });

  it('tells who is waiting for access: new sign-ins, and deactivated people only once they sign in again', async () => {
    const waitingNow = async () => (await list('q=jest.wait&status=waiting')).sort();
    const fresh = await signIn('jest.wait.fresh@admin.example.test', 'Wait Fresh');
    const leaver = await signIn('jest.wait.leaver@admin.example.test', 'Wait Leaver');
    expect(await waitingNow()).toEqual(['jest.wait.fresh@admin.example.test', 'jest.wait.leaver@admin.example.test']);

    // Activated: not waiting. Deactivated afterwards: inactive, but not waiting either.
    await activate(leaver);
    expect(await waitingNow()).toEqual(['jest.wait.fresh@admin.example.test']);
    const off = await call(root, 'PATCH', `/admin/users/${leaver.id}`, { status: 'inactive' });
    expect(((await off.json()) as { user: { status: string; waiting: boolean } }).user).toEqual(
      expect.objectContaining({ status: 'inactive', waiting: false }),
    );
    expect(await waitingNow()).toEqual(['jest.wait.fresh@admin.example.test']);
    expect(await list('q=jest.wait&status=inactive')).toContain('jest.wait.leaver@admin.example.test');

    // Signing in again asks for access again.
    await signIn('jest.wait.leaver@admin.example.test', 'Wait Leaver');
    expect(await waitingNow()).toEqual(['jest.wait.fresh@admin.example.test', 'jest.wait.leaver@admin.example.test']);
    expect((await call(root, 'GET', '/admin/users?status=nobody')).status).toBe(400);
  });

  it('activates and deactivates, taking effect on sessions that are already open', async () => {
    const someone = await signIn('jest.someone@admin.example.test');
    expect((await call(someone, 'GET', '/nope')).status).toBe(403);

    const res = await activate(someone);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { user: { status: string } }).user.status).toBe('active');
    expect((await call(someone, 'GET', '/nope')).status).toBe(404); // past the gate

    await call(root, 'PATCH', `/admin/users/${someone.id}`, { status: 'inactive' });
    expect((await call(someone, 'GET', '/nope')).status).toBe(403);
  });

  it('grants and removes admin; a removed admin drops back to the user role', async () => {
    const helper = await signIn('jest.helper@admin.example.test');
    await activate(helper);
    const granted = await call(root, 'PUT', `/admin/users/${helper.id}/roles/admin`);
    expect(((await granted.json()) as { user: { roles: string[] } }).user.roles).toEqual(['user', 'admin']);
    await actAs(helper, 'admin');
    expect((await call(helper, 'GET', '/admin/users')).status).toBe(200);

    const removed = await call(root, 'DELETE', `/admin/users/${helper.id}/roles/admin`);
    expect(((await removed.json()) as { user: { roles: string[] } }).user.roles).toEqual(['user']);
    expect((await call(helper, 'GET', '/admin/users')).status).toBe(403);
    expect(((await (await call(helper, 'GET', '/me')).json()) as { user: { activeRole: string } }).user.activeRole).toBe(
      'user',
    );
  });

  it('refuses changing your own account and ADMIN_EMAILS accounts', async () => {
    const self = await call(root, 'PATCH', `/admin/users/${root.id}`, { status: 'inactive' });
    expect(self.status).toBe(403);
    expect(await self.json()).toEqual({ error: { code: 'cannot_change_self' } });

    const other = await signIn('jest.other.admin@admin.example.test');
    await activate(other);
    await call(root, 'PUT', `/admin/users/${other.id}/roles/admin`);
    await actAs(other, 'admin');
    const res = await call(other, 'DELETE', `/admin/users/${root.id}/roles/admin`);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: { code: 'admin_from_config' } });
  });

  it('validates ids, bodies and query parameters', async () => {
    expect((await call(root, 'PATCH', `/admin/users/${randomUUID()}`, { status: 'active' })).status).toBe(404);
    for (const [method, path, body] of [
      ['PATCH', '/admin/users/abc', { status: 'active' }],
      ['PATCH', `/admin/users/${root.id}0`, { status: 'banned' }],
      ['GET', '/admin/users?sort=name', undefined],
      ['GET', `/admin/users?q=${'x'.repeat(101)}`, undefined],
    ] as const) {
      const res = await call(root, method, path, body);
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe('validation_failed');
    }
  });

  it('lets only one of two admins win when they remove each other at the same moment', async () => {
    const a = await signIn('jest.race.a@admin.example.test');
    const b = await signIn('jest.race.b@admin.example.test');
    for (const who of [a, b]) {
      await activate(who);
      await call(root, 'PUT', `/admin/users/${who.id}/roles/admin`);
      await actAs(who, 'admin');
    }
    const [ab, ba] = await Promise.all([
      call(a, 'DELETE', `/admin/users/${b.id}/roles/admin`),
      call(b, 'DELETE', `/admin/users/${a.id}/roles/admin`),
    ]);
    expect([ab.status, ba.status].sort()).toEqual([200, 403]);
    const { rows } = await pool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM user_roles WHERE role = 'admin' AND user_id = ANY($1::uuid[])",
      [[a.id, b.id]],
    );
    expect(rows[0]?.count).toBe(1);
  });
});
