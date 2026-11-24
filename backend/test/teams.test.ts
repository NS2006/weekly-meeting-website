import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app.ts';
import { createPool, withTransactions } from '../src/database/pool.ts';
import { createTeamsService } from '../src/modules/teams/service.ts';
import { serve, sessionCookie, silentLogger, testAuth } from './helpers.ts';

// Team management against the real database (npm test loads backend/.env); skipped without DATABASE_URL.
// Fictitious @teams.example.test users only; their teams and accounts are deleted before and after.
const url = process.env.DATABASE_URL;
const describeDb = url ? describe : describe.skip;

interface Person {
  id: string;
  cookie: string;
  email: string;
}
interface TeamBody {
  team: {
    id: string;
    name: string;
    description: string | null;
    myRole: string;
    leader: { id: string; name: string } | null;
    memberCount: number;
    archivedAt: string | null;
    purgeAt: string | null;
    members: { userId: string; role: string }[];
  };
}

describeDb('team management (integration)', () => {
  const pool = createPool({ connectionString: url ?? '', max: 4 }, silentLogger);
  const db = withTransactions(pool);
  const DOMAIN = '@teams.example.test';
  const cleanup = async () => {
    await pool.query(
      `DELETE FROM teams WHERE created_by IN (SELECT id FROM users WHERE email LIKE $1)
          OR id IN (SELECT tm.team_id FROM team_members tm JOIN users u ON u.id = tm.user_id WHERE u.email LIKE $1)`,
      [`%${DOMAIN}`],
    );
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

  async function person(name: string, active = true): Promise<Person> {
    const email = `${name.toLowerCase().replace(/\s+/g, '.')}${DOMAIN}`;
    const res = await fetch(`${app.url}/api/auth/mock-sign-in`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, name }),
    });
    const { user } = (await res.json()) as { user: { id: string } };
    if (active) await pool.query("UPDATE users SET status = 'active' WHERE id = $1", [user.id]);
    return { id: user.id, cookie: sessionCookie(res), email };
  }
  const call = (who: Person, method: string, path: string, body?: unknown) =>
    fetch(`${app.url}/api${path}`, {
      method,
      headers: { cookie: who.cookie, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const code = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
  async function newTeam(leader: Person, name = 'Squad'): Promise<string> {
    const res = await call(leader, 'POST', '/teams', { name });
    return ((await res.json()) as TeamBody).team.id;
  }
  const leadersOf = async (teamId: string) =>
    (await pool.query<{ user_id: string }>("SELECT user_id FROM team_members WHERE team_id = $1 AND role = 'leader'", [teamId]))
      .rows.map((r) => r.user_id);

  it('lets any active user create a team and makes them its only leader', async () => {
    const ana = await person('Ana Lead');
    const res = await call(ana, 'POST', '/teams', { name: '  Platform  ', description: '' });
    expect(res.status).toBe(201);
    const { team } = (await res.json()) as TeamBody;
    expect(team).toMatchObject({
      name: 'Platform',
      description: null,
      myRole: 'leader',
      leader: { id: ana.id, name: 'Ana Lead' },
      memberCount: 1,
      archivedAt: null,
      members: [{ userId: ana.id, role: 'leader' }],
    });
    // Names may repeat.
    expect((await call(ana, 'POST', '/teams', { name: 'Platform' })).status).toBe(201);
    const list = (await (await call(ana, 'GET', '/teams')).json()) as { teams: { name: string }[]; archived: unknown[] };
    expect(list.teams.filter((t) => t.name === 'Platform')).toHaveLength(2);
    expect(list.archived).toEqual([]);
  });

  it('is for the User role: acting as Admin, teams and people search are refused', async () => {
    const both = await person('Both Roles');
    await pool.query("INSERT INTO user_roles (user_id, role) VALUES ($1, 'admin')", [both.id]);
    expect((await call(both, 'GET', '/teams')).status).toBe(200);
    await call(both, 'PUT', '/me/active-role', { role: 'admin' });
    for (const [method, path, body] of [
      ['GET', '/teams', undefined],
      ['POST', '/teams', { name: 'As admin' }],
      ['GET', '/users/search?q=both', undefined],
    ] as const) {
      const res = await call(both, method, path, body);
      expect(res.status).toBe(403);
      expect(await code(res)).toBe('user_role_only');
    }
    await call(both, 'PUT', '/me/active-role', { role: 'user' });
    expect((await call(both, 'GET', '/users/search?q=both')).status).toBe(200);
  });

  it('refuses inactive users and invalid input', async () => {
    const waiting = await person('Wait Ing', false);
    expect(await code(await call(waiting, 'POST', '/teams', { name: 'X' }))).toBe('account_inactive');
    const ok = await person('Val Idator');
    for (const body of [{ name: '   ' }, { name: 'x'.repeat(101) }, { name: 'X', owner: ok.id }, {}]) {
      const res = await call(ok, 'POST', '/teams', body);
      expect(res.status).toBe(400);
    }
  });

  it('hides a team from outsiders (404) and lets only the leader manage it', async () => {
    const lead = await person('Lia Lead');
    const member = await person('Max Member');
    const outsider = await person('Otto Outsider');
    const teamId = await newTeam(lead);

    for (const [method, path, body] of [
      ['GET', `/teams/${teamId}`, undefined],
      ['PATCH', `/teams/${teamId}`, { name: 'Mine now' }],
      ['POST', `/teams/${teamId}/members`, { userId: outsider.id }],
    ] as const) {
      const res = await call(outsider, method, path, body);
      expect(res.status).toBe(404);
    }

    const added = await call(lead, 'POST', `/teams/${teamId}/members`, { userId: member.id });
    expect(added.status).toBe(200);
    expect(((await added.json()) as TeamBody).team.memberCount).toBe(2);

    const seen = (await (await call(member, 'GET', `/teams/${teamId}`)).json()) as TeamBody;
    expect(seen.team.myRole).toBe('member');
    expect(await code(await call(member, 'PATCH', `/teams/${teamId}`, { name: 'Nope' }))).toBe('not_team_leader');
    expect(await code(await call(member, 'POST', `/teams/${teamId}/members`, { userId: outsider.id }))).toBe('not_team_leader');

    const renamed = await call(lead, 'PATCH', `/teams/${teamId}`, { name: 'Renamed', description: 'Weekly sync' });
    expect(((await renamed.json()) as TeamBody).team).toMatchObject({ name: 'Renamed', description: 'Weekly sync' });
    const cleared = await call(lead, 'PATCH', `/teams/${teamId}`, { description: '' });
    expect(((await cleared.json()) as TeamBody).team.description).toBeNull();
  });

  it('offers the teams I am in to pick: a few at random before typing, then the names that hold the text', async () => {
    const me = await person('Choice Picker');
    const other = await person('Choice Outsider');
    await newTeam(other, 'Ops outside'); // not mine
    const mine: string[] = [];
    for (const name of ['Ops Alpha', 'Ops Beta', 'Team PIR', 'Design', 'Data', 'Infra']) mine.push(await newTeam(me, name));
    const joined = await newTeam(other, 'Ops Joined');
    expect((await call(other, 'POST', `/teams/${joined}/members`, { userId: me.id })).status).toBe(200);
    mine.push(joined);
    const gone = await newTeam(me, 'Ops Deleted');
    expect((await call(me, 'DELETE', `/teams/${gone}`, { confirmName: 'Ops Deleted' })).status).toBe(200);
    type Choices = { teams: { id: string; name: string }[]; hasMore: boolean };
    const choices = async (query = '') => (await (await call(me, 'GET', `/teams/choices${query}`)).json()) as Choices;

    const picks = await Promise.all([0, 1, 2, 3, 4, 5].map(() => choices()));
    for (const pick of picks) {
      expect(pick.teams).toHaveLength(5);
      expect(pick.teams.every((t) => mine.includes(t.id))).toBe(true); // never a deleted team or someone else's
      expect(Object.keys(pick.teams[0] ?? {}).sort()).toEqual(['id', 'name']);
    }
    expect(new Set(picks.map((pick) => pick.teams.map((t) => t.id).join())).size).toBeGreaterThan(1);

    expect((await choices('?q=OPS')).teams.map((t) => t.name)).toEqual(['Ops Alpha', 'Ops Beta', 'Ops Joined']);
    expect(await choices('?q=nothing')).toEqual({ teams: [], hasMore: false });
    for (let i = 1; i <= 11; i++) await newTeam(me, `Guild ${i}`);
    const many = await choices('?q=guild');
    expect(many.teams).toHaveLength(10);
    expect(many.hasMore).toBe(true);
    expect(await code(await call(me, 'GET', '/teams/choices?role=leader'))).toBe('validation_failed');
  });

  it('adds only active users, once', async () => {
    const lead = await person('Adi Lead');
    const pending = await person('Pen Ding', false);
    const teamId = await newTeam(lead);
    expect(await code(await call(lead, 'POST', `/teams/${teamId}/members`, { userId: pending.id }))).toBe('user_not_active');
    expect(await code(await call(lead, 'POST', `/teams/${teamId}/members`, { userId: randomUUID() }))).toBe('user_not_active');
    expect(await code(await call(lead, 'POST', `/teams/${teamId}/members`, { userId: lead.id }))).toBe('already_member');
  });

  it('hands leadership over: the member leads, the old leader becomes a member', async () => {
    const old = await person('Old Lead');
    const next = await person('Next Lead');
    const stranger = await person('Stran Ger');
    const teamId = await newTeam(old);
    await call(old, 'POST', `/teams/${teamId}/members`, { userId: next.id });

    expect(await code(await call(old, 'PUT', `/teams/${teamId}/leader`, { userId: stranger.id }))).toBe('not_a_member');

    const res = await call(old, 'PUT', `/teams/${teamId}/leader`, { userId: next.id });
    expect(res.status).toBe(200);
    expect(((await res.json()) as TeamBody).team).toMatchObject({ myRole: 'member', leader: { id: next.id } });
    expect(await leadersOf(teamId)).toEqual([next.id]);
    expect(await code(await call(old, 'PATCH', `/teams/${teamId}`, { name: 'X' }))).toBe('not_team_leader');
    expect((await call(next, 'PATCH', `/teams/${teamId}`, { name: 'New era' })).status).toBe(200);
  });

  it('never hands over to an inactive member', async () => {
    const lead = await person('Ina Lead');
    const gone = await person('Gone Member');
    const teamId = await newTeam(lead);
    await call(lead, 'POST', `/teams/${teamId}/members`, { userId: gone.id });
    await pool.query("UPDATE users SET status = 'inactive' WHERE id = $1", [gone.id]);
    expect(await code(await call(lead, 'PUT', `/teams/${teamId}/leader`, { userId: gone.id }))).toBe('user_not_active');
    expect(await leadersOf(teamId)).toEqual([lead.id]);
  });

  it('keeps exactly one leader when two hand-overs race', async () => {
    const lead = await person('Race Lead');
    const b = await person('Race Bee');
    const c = await person('Race Cee');
    const teamId = await newTeam(lead);
    for (const p of [b, c]) await call(lead, 'POST', `/teams/${teamId}/members`, { userId: p.id });

    const [toB, toC] = await Promise.all([
      call(lead, 'PUT', `/teams/${teamId}/leader`, { userId: b.id }),
      call(lead, 'PUT', `/teams/${teamId}/leader`, { userId: c.id }),
    ]);
    expect([toB.status, toC.status].sort()).toEqual([200, 403]);
    expect(await leadersOf(teamId)).toHaveLength(1);
  });

  it('allows at most one leader even for a direct database write', async () => {
    const lead = await person('Db Lead');
    const other = await person('Db Other');
    const teamId = await newTeam(lead);
    await expect(
      pool.query("INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'leader')", [teamId, other.id]),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('lets members leave, but not the leader; only the leader removes others', async () => {
    const lead = await person('Ld Leave');
    const m1 = await person('Mem One');
    const m2 = await person('Mem Two');
    const teamId = await newTeam(lead);
    for (const p of [m1, m2]) await call(lead, 'POST', `/teams/${teamId}/members`, { userId: p.id });

    expect(await code(await call(lead, 'DELETE', `/teams/${teamId}/members/${lead.id}`))).toBe('leader_cannot_leave');
    expect(await code(await call(m1, 'DELETE', `/teams/${teamId}/members/${m2.id}`))).toBe('not_team_leader');

    expect((await call(m1, 'DELETE', `/teams/${teamId}/members/${m1.id}`)).status).toBe(204);
    expect((await call(m1, 'GET', `/teams/${teamId}`)).status).toBe(404);

    expect((await call(lead, 'DELETE', `/teams/${teamId}/members/${m2.id}`)).status).toBe(204);
    expect(await code(await call(lead, 'DELETE', `/teams/${teamId}/members/${m2.id}`))).toBe('not_a_member');
  });

  it('archives on delete (typed name), hides it from members, and lets the leader restore it', async () => {
    const lead = await person('Del Lead');
    const member = await person('Del Member');
    const teamId = await newTeam(lead, 'Payments Squad');
    await call(lead, 'POST', `/teams/${teamId}/members`, { userId: member.id });

    expect(await code(await call(member, 'DELETE', `/teams/${teamId}`, { confirmName: 'Payments Squad' }))).toBe(
      'not_team_leader',
    );
    expect(await code(await call(lead, 'DELETE', `/teams/${teamId}`, { confirmName: 'payments squad' }))).toBe(
      'confirmation_mismatch',
    );

    const res = await call(lead, 'DELETE', `/teams/${teamId}`, { confirmName: ' Payments Squad ' });
    expect(res.status).toBe(200);
    const { team } = (await res.json()) as TeamBody;
    expect(team.archivedAt).not.toBeNull();
    const days = (Date.parse(team.purgeAt ?? '') - Date.parse(team.archivedAt ?? '')) / 86_400_000;
    expect(days).toBe(30);

    expect((await call(member, 'GET', `/teams/${teamId}`)).status).toBe(404);
    const memberList = (await (await call(member, 'GET', '/teams')).json()) as { teams: { id: string }[] };
    expect(memberList.teams.map((t) => t.id)).not.toContain(teamId);
    const leadList = (await (await call(lead, 'GET', '/teams')).json()) as { archived: { id: string }[] };
    expect(leadList.archived.map((t) => t.id)).toContain(teamId);

    expect(await code(await call(lead, 'PATCH', `/teams/${teamId}`, { name: 'X' }))).toBe('team_archived');
    expect(await code(await call(lead, 'POST', `/teams/${teamId}/members`, { userId: member.id }))).toBe('team_archived');

    const restored = await call(lead, 'POST', `/teams/${teamId}/restore`);
    expect(((await restored.json()) as TeamBody).team.archivedAt).toBeNull();
    expect((await call(member, 'GET', `/teams/${teamId}`)).status).toBe(200);
  });

  it('purges teams archived more than 30 days ago, with their meeting series', async () => {
    const lead = await person('Old Team Lead');
    const fresh = await newTeam(lead, 'Fresh');
    const stale = await newTeam(lead, 'Stale');
    await call(lead, 'DELETE', `/teams/${fresh}`, { confirmName: 'Fresh' });
    await call(lead, 'DELETE', `/teams/${stale}`, { confirmName: 'Stale' });
    await pool.query("UPDATE teams SET archived_at = now() - interval '31 days' WHERE id = $1", [stale]);
    await pool.query("INSERT INTO meeting_series (team_id, name, days_of_week) VALUES ($1, 'Sync', '{3,5}')", [stale]);

    expect(await code(await call(lead, 'POST', `/teams/${stale}/restore`))).toBe('team_expired');

    await createTeamsService({ db, logger: silentLogger }).purgeExpired();
    const { rows } = await pool.query<{ id: string }>('SELECT id FROM teams WHERE id = ANY($1::uuid[])', [[fresh, stale]]);
    expect(rows.map((r) => r.id)).toEqual([fresh]);
    const series = await pool.query('SELECT 1 FROM meeting_series WHERE team_id = $1', [stale]);
    expect(series.rows).toHaveLength(0);
  });

  it('passes leadership to the longest-standing active member when an admin deactivates the leader', async () => {
    const admin = await person('Root Admin');
    await pool.query("INSERT INTO user_roles (user_id, role) VALUES ($1, 'admin')", [admin.id]);
    await call(admin, 'PUT', '/me/active-role', { role: 'admin' });

    const lead = await person('Leaving Lead');
    const earliestButInactive = await person('Early Inactive');
    const heir = await person('Heir Apparent');
    const later = await person('Later Member');
    const teamId = await newTeam(lead, 'Handover');
    for (const p of [earliestButInactive, heir, later]) await call(lead, 'POST', `/teams/${teamId}/members`, { userId: p.id });
    await pool.query("UPDATE users SET status = 'inactive' WHERE id = $1", [earliestButInactive.id]);

    const lonely = await person('Lonely Lead');
    const soloTeam = await newTeam(lonely, 'Solo');
    const alsoLed = await newTeam(lead, 'Second Team'); // the leader alone here: stays leader

    expect((await call(admin, 'PATCH', `/admin/users/${lead.id}`, { status: 'inactive' })).status).toBe(200);
    expect(await leadersOf(teamId)).toEqual([heir.id]);
    const { rows } = await pool.query<{ role: string }>(
      'SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2',
      [teamId, lead.id],
    );
    expect(rows[0]?.role).toBe('member');
    expect(await leadersOf(alsoLed)).toEqual([lead.id]);

    expect((await call(admin, 'PATCH', `/admin/users/${lonely.id}`, { status: 'inactive' })).status).toBe(200);
    expect(await leadersOf(soloTeam)).toEqual([lonely.id]);

    // Activating someone hands nothing back.
    await call(admin, 'PATCH', `/admin/users/${lead.id}`, { status: 'active' });
    expect(await leadersOf(teamId)).toEqual([heir.id]);
  });

  it('filters my teams on the server: text, my role, and sort order', async () => {
    const me = await person('Rina Filter');
    const other = await person('Sari Other');
    const big = await person('Tono Big');
    const alpha = await newTeam(me, 'Alpha 50% Squad');
    await call(me, 'PATCH', `/teams/${alpha}`, { description: 'Payments and refunds' });
    const beta = await newTeam(other, 'Beta Guild');
    await call(other, 'POST', `/teams/${beta}/members`, { userId: me.id });
    await call(other, 'POST', `/teams/${beta}/members`, { userId: big.id });
    await newTeam(other, 'Gamma Not Mine');

    const names = async (query: string) =>
      ((await (await call(me, 'GET', `/teams${query}`)).json()) as { teams: { name: string }[] }).teams.map((t) => t.name);

    expect(await names('')).toEqual(['Alpha 50% Squad', 'Beta Guild']);
    expect(await names('?q=refund')).toEqual(['Alpha 50% Squad']); // matches the description
    expect(await names('?q=GUILD')).toEqual(['Beta Guild']); // case does not matter
    expect(await names('?q=50%25')).toEqual(['Alpha 50% Squad']); // "%" is a character, not a wildcard
    expect(await names('?q=5_%25')).toEqual([]);
    expect(await names('?q=Gamma')).toEqual([]); // never someone else's team
    expect(await names('?role=leader')).toEqual(['Alpha 50% Squad']);
    expect(await names('?role=member')).toEqual(['Beta Guild']);
    expect(await names('?sort=members')).toEqual(['Beta Guild', 'Alpha 50% Squad']);
    expect(await names('?sort=newest')).toEqual(['Beta Guild', 'Alpha 50% Squad']);
    expect(await names('?q=%20%20')).toEqual(['Alpha 50% Squad', 'Beta Guild']); // blank text = no search

    for (const bad of ['?role=admin', '?sort=size', '?extra=1', `?q=${'x'.repeat(101)}`]) {
      expect(await code(await call(me, 'GET', `/teams${bad}`))).toBe('validation_failed');
    }
  });

  it('suggests a few random active people who are not in the team yet, to its leader only', async () => {
    const leader = await person('Suggest Leader');
    const member = await person('Suggest Member');
    const outsider = await person('Suggest Outsider');
    const waiting = await person('Suggest Waiting', false);
    const teamId = await newTeam(leader, 'Suggestions');
    await call(leader, 'POST', `/teams/${teamId}/members`, { userId: member.id });

    const { rows } = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM users u WHERE u.status = 'active'
          AND NOT EXISTS (SELECT 1 FROM team_members m WHERE m.team_id = $1 AND m.user_id = u.id)`,
      [teamId],
    );
    for (let i = 0; i < 5; i += 1) {
      const res = await call(leader, 'GET', `/teams/${teamId}/member-suggestions`);
      expect(res.status).toBe(200);
      const { users } = (await res.json()) as { users: { id: string; name: string; email: string }[] };
      expect(users).toHaveLength(Math.min(5, rows[0]?.n ?? 0));
      const ids = users.map((u) => u.id);
      expect(ids).not.toContain(leader.id); // already in the team
      expect(ids).not.toContain(member.id);
      expect(ids).not.toContain(waiting.id); // not active
      expect(new Set(ids).size).toBe(ids.length);
      expect(Object.keys(users[0] ?? { id: 1, name: 1, email: 1 }).sort()).toEqual(['email', 'id', 'name']);
    }

    expect(await code(await call(member, 'GET', `/teams/${teamId}/member-suggestions`))).toBe('not_team_leader');
    expect((await call(outsider, 'GET', `/teams/${teamId}/member-suggestions`)).status).toBe(404);
    await call(leader, 'DELETE', `/teams/${teamId}`, { confirmName: 'Suggestions' });
    expect(await code(await call(leader, 'GET', `/teams/${teamId}/member-suggestions`))).toBe('team_archived');
  });

  it('finds active people by name or email for the picker, nothing more', async () => {
    const searcher = await person('Seeker One');
    await person('Findable Person');
    await person('Findable Waiting', false);
    expect((await call(searcher, 'GET', '/users/search?q=f')).status).toBe(400);
    const res = await call(searcher, 'GET', `/users/search?q=FINDABLE`);
    const { users } = (await res.json()) as { users: Record<string, unknown>[] };
    expect(users).toEqual([{ id: expect.any(String), name: 'Findable Person', email: `findable.person${DOMAIN}` }]);
  });
});
