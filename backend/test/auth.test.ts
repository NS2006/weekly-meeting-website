import { createApp } from '../src/app.ts';
import { createPool, withTransactions } from '../src/database/pool.ts';
import { serve, sessionCookie, silentLogger, testAuth } from './helpers.ts';

// Sign-in flow against the real database (npm test loads backend/.env); skipped without DATABASE_URL.
// Uses fictitious addresses under the reserved example.test domain and deletes them before and after.
const url = process.env.DATABASE_URL;
const describeDb = url ? describe : describe.skip;

describeDb('mock sign-in (integration)', () => {
  const pool = createPool({ connectionString: url ?? '', max: 2 }, silentLogger);
  const cleanup = () => pool.query("DELETE FROM users WHERE email LIKE '%@example.test'");
  const ADMIN = 'jest.admin@example.test';
  let app: Awaited<ReturnType<typeof serve>>;

  beforeAll(async () => {
    await cleanup();
    app = await serve(createApp({ db: withTransactions(pool), logger: silentLogger, auth: testAuth({ adminEmails: [ADMIN] }) }));
  });
  afterAll(async () => {
    await app.close();
    await cleanup();
    await pool.end();
  });

  const signIn = (email: string, name = 'Jest Person') =>
    fetch(`${app.url}/api/auth/mock-sign-in`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, name }),
    });
  const get = (path: string, cookie?: string) => fetch(`${app.url}/api${path}`, { headers: cookie ? { cookie } : {} });

  it('creates a first-time user as inactive with the user role, and sets a strict HttpOnly cookie', async () => {
    const res = await signIn('Jest.New@Example.TEST', '  Jest New  ');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      user: {
        id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/), // a random UUID, not a counter
        name: 'Jest New',
        email: 'jest.new@example.test',
        status: 'inactive',
        roles: ['user'],
        activeRole: 'user',
        adminFromConfig: false,
      },
    });
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith('wm_session=')) ?? '';
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Path=\//);
  });

  it('lets an inactive user read /me but nothing else', async () => {
    const cookie = sessionCookie(await signIn('jest.inactive@example.test'));
    expect((await get('/me', cookie)).status).toBe(200);
    const res = await get('/projects', cookie);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: { code: 'account_inactive' } });
  });

  it('applies a deactivation to a session that is already open', async () => {
    const res = await signIn('jest.toggle@example.test');
    const cookie = sessionCookie(res);
    const { user } = (await res.json()) as { user: { id: string } };
    await pool.query("UPDATE users SET status = 'active' WHERE id = $1", [user.id]);
    expect((await get('/nope', cookie)).status).toBe(404); // active: past the gate, unknown route
    await pool.query("UPDATE users SET status = 'inactive' WHERE id = $1", [user.id]);
    expect((await get('/nope', cookie)).status).toBe(403);
  });

  it('keeps the account on a later sign-in: same id, name updated, status unchanged', async () => {
    const first = (await (await signIn('jest.again@example.test', 'Old Name')).json()) as { user: { id: string } };
    await pool.query("UPDATE users SET status = 'active' WHERE id = $1", [first.user.id]);
    const again = (await (await signIn('JEST.AGAIN@example.test', 'New Name')).json()) as {
      user: { id: string; name: string; status: string };
    };
    expect(again.user).toMatchObject({ id: first.user.id, name: 'New Name', status: 'active' });
  });

  it('makes an ADMIN_EMAILS user an active admin who can switch roles', async () => {
    const res = await signIn(ADMIN);
    const cookie = sessionCookie(res);
    expect(((await res.json()) as { user: unknown }).user).toMatchObject({
      status: 'active',
      roles: ['user', 'admin'],
      activeRole: 'user',
      adminFromConfig: true,
    });
    const switched = await fetch(`${app.url}/api/me/active-role`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ role: 'admin' }),
    });
    expect(switched.status).toBe(200);
    expect(((await (await get('/me', cookie)).json()) as { user: { activeRole: string } }).user.activeRole).toBe('admin');
  });

  it('refuses a role the user does not hold, and any role switch while inactive', async () => {
    const res = await signIn('jest.plain@example.test');
    const cookie = sessionCookie(res);
    const { user } = (await res.json()) as { user: { id: string } };
    const put = () =>
      fetch(`${app.url}/api/me/active-role`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ role: 'admin' }),
      });
    expect(await (await put()).json()).toEqual({ error: { code: 'account_inactive' } });
    await pool.query("UPDATE users SET status = 'active' WHERE id = $1", [user.id]);
    const res2 = await put();
    expect(res2.status).toBe(403);
    expect(await res2.json()).toEqual({ error: { code: 'role_not_held' } });
  });

  it('signs out: the old cookie stops working', async () => {
    const cookie = sessionCookie(await signIn('jest.out@example.test'));
    const out = await fetch(`${app.url}/api/auth/sign-out`, { method: 'POST', headers: { cookie } });
    expect(out.status).toBe(204);
    expect(out.headers.getSetCookie().join()).toMatch(/wm_session=;/);
    expect((await get('/me', cookie)).status).toBe(401);
  });

  it('rejects a bad email, a missing name and extra fields without echoing them', async () => {
    for (const body of [
      { email: 'not-an-email', name: 'X' },
      { email: 'jest.x@example.test', name: '   ' },
      { email: 'jest.x@example.test', name: 'X', role: 'admin' },
    ]) {
      const res = await fetch(`${app.url}/api/auth/mock-sign-in`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      expect(res.status).toBe(400);
      expect(JSON.parse(text).error.code).toBe('validation_failed');
      expect(text).not.toContain('not-an-email');
    }
  });

  it('has no mock sign-in at all when it is switched off (production)', async () => {
    const prod = await serve(createApp({ db: withTransactions(pool), logger: silentLogger, auth: testAuth({ mockSignIn: false }) }));
    try {
      const res = await fetch(`${prod.url}/api/auth/mock-sign-in`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'jest.prod@example.test', name: 'X' }),
      });
      expect(res.status).toBe(401);
      expect(res.headers.getSetCookie()).toEqual([]);
      const { rows } = await pool.query("SELECT 1 FROM users WHERE email = 'jest.prod@example.test'");
      expect(rows).toHaveLength(0);
    } finally {
      await prod.close();
    }
  });
});
