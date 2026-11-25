import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.ts';
import { createPool, withTransactions } from '../src/database/pool.ts';
import { createLocalStorage } from '../src/modules/attachments/storage.ts';
import { serve, sessionCookie, silentLogger, testAuth } from './helpers.ts';

// A period's Projects board against the real database (npm test loads backend/.env); skipped without DATABASE_URL.
// Fictitious @teamprojects.example.test users only.
const url = process.env.DATABASE_URL;
const describeDb = url ? describe : describe.skip;

interface Person {
  id: string;
  cookie: string;
}
interface Board {
  projects: {
    id: string;
    name: string;
    status: string;
    owner: { id: string; name: string };
    updateCount: number;
    lastSharedOn: string;
    meetingIds: string[];
  }[];
  truncated: boolean;
}
interface Update {
  noteId: string;
  noteTitle: string;
  content: { type: string; content?: { type: string; content?: { text?: string }[] }[] };
  meetings: { id: string; date: string; seriesName: string; status: string }[];
}

const doc = (...content: unknown[]) => ({ type: 'doc', content });
const para = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const section = (projectId: string, ...content: unknown[]) => ({ type: 'projectSection', attrs: { projectId }, content });

describeDb("a period's projects: only what was shared on the team's meetings in it (integration)", () => {
  const pool = createPool({ connectionString: url ?? '', max: 4 }, silentLogger);
  const db = withTransactions(pool);
  const DOMAIN = '@teamprojects.example.test';
  const cleanup = async () => {
    const users = 'SELECT id FROM users WHERE email LIKE $1';
    await pool.query(`DELETE FROM notes WHERE user_id IN (${users})`, [`%${DOMAIN}`]);
    await pool.query(`DELETE FROM projects WHERE user_id IN (${users})`, [`%${DOMAIN}`]);
    await pool.query(
      `DELETE FROM teams WHERE created_by IN (${users}) OR id IN (SELECT team_id FROM team_members WHERE user_id IN (${users}))`,
      [`%${DOMAIN}`],
    );
    await pool.query('DELETE FROM users WHERE email LIKE $1', [`%${DOMAIN}`]);
  };
  let dir = '';
  let app: Awaited<ReturnType<typeof serve>>;

  beforeAll(async () => {
    await cleanup();
    dir = await mkdtemp(path.join(os.tmpdir(), 'wm-teamprojects-'));
    // Wednesday 25 March 2026: the daily meetings run to 21 April, across the end of Q1 into Q2.
    const now = () => new Date('2026-03-25T03:00:00Z');
    app = await serve(createApp({ db, logger: silentLogger, auth: testAuth(), storage: createLocalStorage(dir), now }));
  });
  afterAll(async () => {
    await app.close();
    await cleanup();
    await pool.end();
    await rm(dir, { recursive: true, force: true });
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
  const json = async <T>(res: Response) => (await res.json()) as T;
  const code = async (res: Response) => (await json<{ error: { code: string } }>(res)).error.code;

  async function teamWithMeetings(leader: Person, name: string, members: Person[]) {
    const team = (await json<{ team: { id: string } }>(await call(leader, 'POST', '/teams', { name }))).team.id;
    for (const m of members) expect((await call(leader, 'POST', `/teams/${team}/members`, { userId: m.id })).status).toBe(200);
    const created = await call(leader, 'POST', `/teams/${team}/series`, { name: 'Daily sync', daysOfWeek: [1, 2, 3, 4, 5, 6, 7] });
    expect(created.status).toBe(201);
    const series = (await json<{ series: { id: string } }>(created)).series.id;
    const { meetings } = await json<{ meetings: { id: string; date: string }[] }>(await call(leader, 'GET', `/teams/${team}/meetings`));
    const on = (date: string) => meetings.find((m) => m.date === date)?.id ?? '';
    return { team, series, on, meetings };
  }
  const project = async (who: Person, name: string) =>
    (await json<{ project: { id: string } }>(await call(who, 'POST', '/projects', { name }))).project.id;
  /** A note of `who` with this content, shared on these meetings. */
  async function note(who: Person, title: string, content: unknown, meetingIds: string[]) {
    const created = (await json<{ note: { id: string } }>(await call(who, 'POST', '/notes', { title }))).note;
    expect((await call(who, 'PATCH', `/notes/${created.id}`, { content, version: 1 })).status).toBe(200);
    for (const m of meetingIds) expect((await call(who, 'PUT', `/notes/${created.id}/meetings/${m}`)).status).toBe(200);
    return created.id;
  }
  const board = async (who: Person, team: string, key: string) => json<Board>(await call(who, 'GET', `/teams/${team}/periods/${key}/projects`));
  const updatesOf = async (who: Person, team: string, key: string, projectId: string) =>
    json<{ updates: Update[]; hasMore: boolean }>(await call(who, 'GET', `/teams/${team}/periods/${key}/projects/${projectId}/updates`));
  const Q1 = '2026-01-3m';
  const Q2 = '2026-04-3m';

  it("shows each period the members' projects with only the parts shared on its meetings", async () => {
    const lia = await person('Lia Lead');
    const mo = await person('Mo Member');
    const oz = await person('Oz Outside');
    const { team, series, on } = await teamWithMeetings(lia, 'Review team', [mo]);
    const march = on('2026-03-26');
    const april2 = on('2026-04-02');
    const april9 = on('2026-04-09');
    // One meeting back in February (Q1).
    const added = await pool.query<{ id: string }>(
      "INSERT INTO meetings (series_id, scheduled_date, meeting_date) VALUES ($1, '2026-02-10', '2026-02-10') RETURNING id",
      [series],
    );
    const feb = added.rows[0]?.id ?? '';
    const elsewhere = await teamWithMeetings(mo, 'Mo elsewhere', []);

    const checkout = await project(mo, 'Checkout');
    const payments = await project(mo, 'Payments');
    const secret = await project(mo, 'Private plan');
    const boardProject = await project(lia, 'Board');
    const first = await note(mo, 'Week 1', doc(section(checkout, para('Checkout week 1')), section(payments, para('Payments week 1')), para('Loose text')), [april2]);
    const second = await note(mo, 'Week 2', doc(section(checkout, para('Checkout week 2'))), [april9]);
    const inMarch = await note(mo, 'March', doc(section(checkout, para('Checkout in March'))), [march]);
    const inFeb = await note(mo, 'February', doc(section(payments, para('Payments in February'))), [feb]);
    const both = await note(mo, 'Both quarters', doc(section(payments, para('Payments in both'))), [march, april9]);
    await note(mo, 'Private', doc(section(secret, para('Not for the team'))), []); // shared nowhere
    await note(mo, 'Elsewhere', doc(section(payments, para('Other team only'))), [elsewhere.on('2026-04-02')]); // another team
    await note(lia, 'Lead week', doc(section(boardProject, para('Board work'))), [april2]);

    // Q2: latest meeting first, then A–Z; each with the period's meetings it was shared on.
    const q2 = await board(lia, team, Q2);
    expect(q2.truncated).toBe(false);
    expect(q2.projects.map((p) => p.name)).toEqual(['Checkout', 'Payments', 'Board']);
    const checkoutQ2 = q2.projects.find((p) => p.name === 'Checkout');
    expect({ ...checkoutQ2, meetingIds: [...(checkoutQ2?.meetingIds ?? [])].sort() }).toEqual({
      id: checkout,
      name: 'Checkout',
      status: 'active',
      owner: { id: mo.id, name: 'Mo Member' },
      updateCount: 2,
      lastSharedOn: '2026-04-09',
      meetingIds: [april2, april9].sort(),
    });
    // Not the other team's note, nor the February one.
    expect(q2.projects.find((p) => p.name === 'Payments')).toMatchObject({ updateCount: 2, lastSharedOn: '2026-04-09' });
    expect(q2.projects.find((p) => p.name === 'Board')).toMatchObject({ updateCount: 1, owner: { id: lia.id, name: 'Lia Lead' }, meetingIds: [april2] });

    // Q1 has its own: the March and February notes, and the one shared on both quarters' meetings.
    const q1 = await board(mo, team, Q1);
    expect(q1.projects.map((p) => [p.name, p.updateCount, p.lastSharedOn])).toEqual([
      ['Checkout', 1, '2026-03-26'],
      ['Payments', 2, '2026-03-26'],
    ]);
    expect([...(q1.projects[1]?.meetingIds ?? [])].sort()).toEqual([feb, march].sort());
    expect((await board(mo, team, '2026-07-3m')).projects).toEqual([]);

    // One project: its parts in the period only, latest meeting first, naming the period's meetings only.
    const q2Updates = await updatesOf(lia, team, Q2, payments);
    expect(q2Updates.hasMore).toBe(false);
    expect(q2Updates.updates.map((u) => [u.noteId, u.noteTitle, u.meetings.map((m) => m.id)])).toEqual([
      [both, 'Both quarters', [april9]],
      [first, 'Week 1', [april2]],
    ]);
    const text = JSON.stringify(q2Updates.updates);
    expect(text).toContain('Payments week 1');
    expect(text).not.toContain('Checkout week 1'); // another project's part of the same note
    expect(text).not.toContain('Loose text'); // untagged text stays in the note
    expect(text).not.toContain('Other team only');
    // Earliest meeting first, to review from the start of the period.
    const fromStart = await json<{ updates: Update[] }>(
      await call(lia, 'GET', `/teams/${team}/periods/${Q2}/projects/${payments}/updates?order=oldest`),
    );
    expect(fromStart.updates.map((u) => u.noteId)).toEqual([first, both]);
    expect((await updatesOf(lia, team, Q1, payments)).updates.map((u) => [u.noteId, u.meetings.map((m) => m.id)])).toEqual([
      [both, [march]],
      [inFeb, [feb]],
    ]);
    expect((await updatesOf(mo, team, Q1, checkout)).updates.map((u) => u.noteId)).toEqual([inMarch]);

    // Never shared in the period, a key that does not fit the split, an outsider: nothing.
    const get = (who: Person, path: string) => call(who, 'GET', `/teams/${team}${path}`);
    expect(await code(await get(lia, `/periods/${Q2}/projects/${secret}/updates`))).toBe('not_found');
    expect(await code(await get(lia, `/periods/2026-07-3m/projects/${checkout}/updates`))).toBe('not_found');
    expect(await code(await get(lia, '/periods/2026-02-3m/projects'))).toBe('not_found'); // quarters start in Jan, Apr, Jul, Oct
    expect(await code(await get(oz, `/periods/${Q2}/projects`))).toBe('not_found');
    expect(await code(await get(oz, `/periods/${Q2}/projects/${checkout}/updates`))).toBe('not_found');
    for (const bad of [
      '/periods/Q2/projects',
      `/periods/${Q2}/projects/abc/updates`,
      `/periods/${Q2}/projects/${checkout}/updates?offset=-1`,
      `/periods/${Q2}/projects/${checkout}/updates?extra=1`,
      `/periods/${Q2}/projects/${checkout}/updates?order=sideways`,
    ]) {
      expect(await code(await get(lia, bad))).toBe('validation_failed');
    }
    // The team-wide list is gone: the board is per period.
    expect((await get(lia, '/projects')).status).toBe(404);

    // Taking the note off the meeting takes its part off the period's project.
    expect((await call(mo, 'DELETE', `/notes/${second}/meetings/${april9}`)).status).toBe(200);
    expect((await board(lia, team, Q2)).projects.find((p) => p.name === 'Checkout')).toMatchObject({
      updateCount: 1,
      lastSharedOn: '2026-04-02',
      meetingIds: [april2],
    });

    // A deleted team: its leader still sees it, members no longer.
    expect((await call(lia, 'DELETE', `/teams/${team}`, { confirmName: 'Review team' })).status).toBe(200);
    expect((await get(lia, `/periods/${Q2}/projects`)).status).toBe(200);
    expect(await code(await get(mo, `/periods/${Q2}/projects`))).toBe('not_found');
  });
});
