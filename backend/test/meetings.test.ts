import { createApp } from '../src/app.ts';
import { createPool, withTransactions } from '../src/database/pool.ts';
import { createMeetingsService } from '../src/modules/meetings/service.ts';
import { addDays, isCalendarDate, todayInJakarta } from '../src/utils/dates.ts';
import { serve, sessionCookie, silentLogger, testAuth } from './helpers.ts';

describe('dates in Indonesia time', () => {
  it('turns an instant into the date in Jakarta (UTC+7)', () => {
    expect(todayInJakarta(new Date('2026-11-20T16:59:00Z'))).toBe('2026-11-20');
    expect(todayInJakarta(new Date('2026-11-20T17:00:00Z'))).toBe('2026-11-21');
  });
  it('adds days across months and checks calendar dates', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(isCalendarDate('2026-02-28')).toBe(true);
    expect(isCalendarDate('2026-02-30')).toBe(false);
    expect(isCalendarDate('26-2-3')).toBe(false);
  });
});

// Meeting series and meetings against the real database (npm test loads backend/.env); skipped without DATABASE_URL.
// Fictitious @meetings.example.test users only. "Now" is pinned: Monday 23 November 2026, 10:00 in Jakarta.
const url = process.env.DATABASE_URL;
const describeDb = url ? describe : describe.skip;

interface Person {
  id: string;
  cookie: string;
}
interface Meeting {
  id: string;
  date: string;
  scheduledDate: string;
  status: string;
  title: string | null;
  seriesName: string;
  teamName: string;
  coversFrom?: string;
  myRole?: string;
}
interface Series {
  id: string;
  name: string;
  daysOfWeek: number[];
  active: boolean;
  nextMeetingDate: string | null;
}

describeDb('meeting series and meetings (integration)', () => {
  const pool = createPool({ connectionString: url ?? '', max: 4 }, silentLogger);
  const db = withTransactions(pool);
  const DOMAIN = '@meetings.example.test';
  // job.refresh() always gets a team: this database is shared with development data.
  let now = new Date('2026-11-23T03:00:00Z');
  const clock = () => now;
  let pinned = 0;
  const job = createMeetingsService({ db, logger: silentLogger, now: clock });
  const cleanup = async () => {
    const users = `SELECT id FROM users WHERE email LIKE $1`;
    await pool.query(`DELETE FROM notes WHERE user_id IN (${users})`, [`%${DOMAIN}`]);
    await pool.query(`DELETE FROM projects WHERE user_id IN (${users})`, [`%${DOMAIN}`]);
    await pool.query(
      `DELETE FROM teams WHERE created_by IN (${users})
          OR id IN (SELECT tm.team_id FROM team_members tm WHERE tm.user_id IN (${users}))`,
      [`%${DOMAIN}`],
    );
    await pool.query('DELETE FROM users WHERE email LIKE $1', [`%${DOMAIN}`]);
  };
  let app: Awaited<ReturnType<typeof serve>>;

  beforeAll(async () => {
    await cleanup();
    app = await serve(createApp({ db, logger: silentLogger, auth: testAuth(), now: clock }));
  });
  beforeEach(() => {
    now = new Date('2026-11-23T03:00:00Z');
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
  const json = async <T>(res: Response) => (await res.json()) as T;

  /** A team led by `leader`, with `members` added. */
  async function team(leader: Person, members: Person[] = [], name = 'Squad'): Promise<string> {
    const { team: created } = await json<{ team: { id: string } }>(await call(leader, 'POST', '/teams', { name }));
    for (const m of members) await call(leader, 'POST', `/teams/${created.id}/members`, { userId: m.id });
    return created.id;
  }
  async function series(leader: Person, teamId: string, daysOfWeek: number[], name = 'Weekly sync'): Promise<Series> {
    const res = await call(leader, 'POST', `/teams/${teamId}/series`, { name, daysOfWeek });
    expect(res.status).toBe(201);
    const created = (await json<{ series: Series }>(res)).series;
    // Pin when it was created, so "covers from" does not depend on the real date; one second apart, in creation order
    // (ids are random UUIDs, so equal times would list in any order).
    pinned += 1;
    await pool.query("UPDATE meeting_series SET created_at = '2026-11-20T01:00:00Z'::timestamptz + make_interval(secs => $2) WHERE id = $1", [
      created.id,
      pinned,
    ]);
    return created;
  }
  const upcoming = async (who: Person, teamId: string) =>
    (await json<{ meetings: Meeting[] }>(await call(who, 'GET', `/teams/${teamId}/meetings?when=upcoming`))).meetings;
  const datesOf = (meetings: Meeting[]) => meetings.map((m) => m.date);

  it('lets the leader set a schedule: the next 4 weeks of meetings appear at once, from today', async () => {
    const lead = await person('Ana Lead');
    const member = await person('Budi Member');
    const teamId = await team(lead, [member]);

    const created = await series(lead, teamId, [5, 3], '  Weekly sync  ');
    expect(created).toMatchObject({ name: 'Weekly sync', daysOfWeek: [3, 5], active: true, nextMeetingDate: '2026-11-25' });

    // Monday 23 Nov + 27 days = Sunday 20 Dec: four Wednesdays and four Fridays.
    expect(datesOf(await upcoming(member, teamId))).toEqual([
      '2026-11-25', '2026-11-27', '2026-12-02', '2026-12-04', '2026-12-09', '2026-12-11', '2026-12-16', '2026-12-18',
    ]);
    // Today counts when it is a meeting day.
    const monday = await series(lead, teamId, [1], 'Planning');
    expect(monday.nextMeetingDate).toBe('2026-11-23');

    // Running the job again creates nothing new.
    expect((await job.refresh({ teamId })).created).toBe(0);

    const list = await json<{ series: Series[] }>(await call(member, 'GET', `/teams/${teamId}/series`));
    expect(list.series.map((s) => s.name)).toEqual(['Weekly sync', 'Planning']);
  });

  it('lets only the leader change schedules, hides them from outsiders, and checks the input', async () => {
    const lead = await person('Cici Lead');
    const member = await person('Dodi Member');
    const outsider = await person('Eka Outsider');
    const teamId = await team(lead, [member]);
    const s = await series(lead, teamId, [3]);

    expect(await code(await call(member, 'POST', `/teams/${teamId}/series`, { name: 'X', daysOfWeek: [1] }))).toBe(
      'not_team_leader',
    );
    expect(await code(await call(member, 'PATCH', `/series/${s.id}`, { active: false }))).toBe('not_team_leader');
    expect((await call(outsider, 'GET', `/teams/${teamId}/series`)).status).toBe(404);
    expect((await call(outsider, 'GET', `/teams/${teamId}/meetings`)).status).toBe(404);
    expect((await call(outsider, 'PATCH', `/series/${s.id}`, { active: false })).status).toBe(404);

    for (const body of [
      { name: 'X', daysOfWeek: [] },
      { name: 'X', daysOfWeek: [8] },
      { name: 'X', daysOfWeek: [3, 3] },
      { name: '   ', daysOfWeek: [3] },
      { name: 'X', daysOfWeek: [3], extra: true },
    ]) {
      expect(await code(await call(lead, 'POST', `/teams/${teamId}/series`, body))).toBe('validation_failed');
    }
    expect((await call(lead, 'GET', `/teams/${teamId}/meetings?when=soon`)).status).toBe(400);
  });

  it('moves a meeting: it keeps its scheduled day, so the job never makes the old day again', async () => {
    const lead = await person('Fani Lead');
    const member = await person('Gita Member');
    const teamId = await team(lead, [member]);
    await series(lead, teamId, [3, 5]);
    const wednesday = (await upcoming(lead, teamId))[0] as Meeting;

    expect(await code(await call(member, 'PATCH', `/meetings/${wednesday.id}`, { date: '2026-11-26' }))).toBe(
      'not_team_leader',
    );
    expect(await code(await call(lead, 'PATCH', `/meetings/${wednesday.id}`, { date: '2026-11-27' }))).toBe(
      'meeting_date_taken',
    );
    expect((await call(lead, 'PATCH', `/meetings/${wednesday.id}`, { date: '2026-11-22' })).status).toBe(400);
    expect((await call(lead, 'PATCH', `/meetings/${wednesday.id}`, { date: '2026-02-30' })).status).toBe(400);

    const moved = await json<{ meeting: Meeting }>(
      await call(lead, 'PATCH', `/meetings/${wednesday.id}`, { date: '2026-11-26' }),
    );
    expect(moved.meeting).toMatchObject({ date: '2026-11-26', scheduledDate: '2026-11-25', status: 'scheduled' });
    await job.refresh({ teamId });
    expect(datesOf(await upcoming(member, teamId)).slice(0, 3)).toEqual(['2026-11-26', '2026-11-27', '2026-12-02']);

    // Moving it back to its own day is fine.
    const back = await json<{ meeting: Meeting }>(await call(lead, 'PATCH', `/meetings/${wednesday.id}`, { date: '2026-11-25' }));
    expect(back.meeting.date).toBe('2026-11-25');
  });

  it('links each meeting to the one before and after it in its schedule, cancelled and moved ones included', async () => {
    const lead = await person('Hana Lead');
    const teamId = await team(lead, [], 'Neighbours');
    await series(lead, teamId, [3, 5]);
    await series(lead, teamId, [4], 'Other sync');
    const weekly = (await upcoming(lead, teamId)).filter((m) => m.seriesName === 'Weekly sync');
    const [wed, fri, wed2] = weekly as [Meeting, Meeting, Meeting];
    const last = weekly[weekly.length - 1] as Meeting;
    type Neighbour = { id: string; date: string; status: string } | null;
    const detail = async (id: string) =>
      (await json<{ meeting: { previous: Neighbour; next: Neighbour } }>(await call(lead, 'GET', `/meetings/${id}`))).meeting;

    // The other schedule's Thursday meetings are not neighbours.
    expect(await detail(wed.id)).toMatchObject({ previous: null, next: { id: fri.id, date: fri.date, status: 'scheduled' } });
    expect(await detail(fri.id)).toMatchObject({ previous: { id: wed.id, date: wed.date }, next: { id: wed2.id } });
    expect((await detail(last.id)).next).toBeNull();

    // A cancelled meeting stays in the chain, with its status.
    expect((await call(lead, 'PATCH', `/meetings/${fri.id}`, { status: 'cancelled' })).status).toBe(200);
    expect((await detail(wed.id)).next).toEqual({ id: fri.id, date: fri.date, status: 'cancelled' });

    // A moved meeting sits where its new day puts it (Wednesday moved to the Saturday after Friday).
    expect((await call(lead, 'PATCH', `/meetings/${wed.id}`, { date: '2026-11-28' })).status).toBe(200);
    expect(await detail(fri.id)).toMatchObject({ previous: null, next: { id: wed.id, date: '2026-11-28' } });
    expect(await detail(wed2.id)).toMatchObject({ previous: { id: wed.id } });

    // The "jump to" list: the schedule's meetings by day, cancelled and moved ones in their place, not the other
    // schedule's; members only.
    const schedule = await call(lead, 'GET', `/meetings/${wed2.id}/schedule`);
    expect(schedule.status).toBe(200);
    const { meetings: list } = await json<{ meetings: { id: string; date: string; status: string; noteCount: number }[] }>(schedule);
    expect(list.map((m) => m.id)).toEqual([fri.id, wed.id, ...weekly.slice(2).map((m) => m.id)]);
    expect(list.slice(0, 2)).toEqual([
      { id: fri.id, date: fri.date, status: 'cancelled', noteCount: 0 },
      { id: wed.id, date: '2026-11-28', status: 'scheduled', noteCount: 0 },
    ]);
    const outsider = await person('Ian Outsider');
    expect((await call(outsider, 'GET', `/meetings/${wed2.id}/schedule`)).status).toBe(404);
  });

  it('cancels and reopens; a cancelled meeting is skipped and the next one covers its days', async () => {
    const lead = await person('Hana Lead');
    const teamId = await team(lead);
    const s = await series(lead, teamId, [3, 5]);
    const [wednesday, friday] = (await upcoming(lead, teamId)) as [Meeting, Meeting];

    const fridayBefore = await json<{ meeting: Meeting }>(await call(lead, 'GET', `/meetings/${friday.id}`));
    expect(fridayBefore.meeting).toMatchObject({ coversFrom: '2026-11-26', myRole: 'leader' });

    const cancelled = await json<{ meeting: Meeting }>(
      await call(lead, 'PATCH', `/meetings/${wednesday.id}`, { status: 'cancelled', title: 'Public holiday' }),
    );
    expect(cancelled.meeting).toMatchObject({ status: 'cancelled', title: 'Public holiday' });
    const list = await json<{ series: Series[] }>(await call(lead, 'GET', `/teams/${teamId}/series`));
    expect(list.series.find((x) => x.id === s.id)?.nextMeetingDate).toBe('2026-11-27');
    // The first meeting covers from the day the schedule was created (20 Nov).
    const fridayAfter = await json<{ meeting: Meeting }>(await call(lead, 'GET', `/meetings/${friday.id}`));
    expect(fridayAfter.meeting.coversFrom).toBe('2026-11-20');

    const reopened = await json<{ meeting: Meeting }>(
      await call(lead, 'PATCH', `/meetings/${wednesday.id}`, { status: 'scheduled', title: '' }),
    );
    expect(reopened.meeting).toMatchObject({ status: 'scheduled', title: null });
  });

  it('shows past meetings as done, stores that, and only lets the title change afterwards', async () => {
    const lead = await person('Indra Lead');
    const teamId = await team(lead);
    await series(lead, teamId, [3, 5]);
    const [wednesday, friday] = (await upcoming(lead, teamId)) as [Meeting, Meeting];
    await call(lead, 'PATCH', `/meetings/${friday.id}`, { status: 'cancelled' });

    now = new Date('2026-11-28T03:00:00Z'); // Saturday
    const past = await json<{ meetings: Meeting[]; hasMore: boolean }>(
      await call(lead, 'GET', `/teams/${teamId}/meetings?when=past`),
    );
    expect(past.meetings.map((m) => [m.date, m.status])).toEqual([
      ['2026-11-27', 'cancelled'],
      ['2026-11-25', 'done'],
    ]);
    expect(past.hasMore).toBe(false);
    expect(await code(await call(lead, 'PATCH', `/meetings/${wednesday.id}`, { status: 'cancelled' }))).toBe(
      'meeting_in_past',
    );
    expect(await code(await call(lead, 'PATCH', `/meetings/${wednesday.id}`, { date: '2026-12-01' }))).toBe(
      'meeting_in_past',
    );
    expect((await call(lead, 'PATCH', `/meetings/${wednesday.id}`, { title: 'Kick-off' })).status).toBe(200);

    await job.refresh({ teamId });
    const stored = await pool.query<{ status: string }>('SELECT status FROM meetings WHERE id = $1', [wednesday.id]);
    expect(stored.rows[0]?.status).toBe('done');
    // The horizon moved on with the day: Wednesday 23 Dec now exists.
    expect(datesOf(await upcoming(lead, teamId))).toContain('2026-12-23');
  });

  it('changes days: removed days go (moved meetings stay), new days come, and stop/restart works', async () => {
    const lead = await person('Joko Lead');
    const teamId = await team(lead);
    const s = await series(lead, teamId, [3, 5]);
    const friday = (await upcoming(lead, teamId))[1] as Meeting;
    await call(lead, 'PATCH', `/meetings/${friday.id}`, { date: '2026-11-28' }); // moved to Saturday

    const changed = await json<{ series: Series }>(await call(lead, 'PATCH', `/series/${s.id}`, { daysOfWeek: [1, 3] }));
    expect(changed.series.daysOfWeek).toEqual([1, 3]);
    const dates = datesOf(await upcoming(lead, teamId));
    expect(dates.slice(0, 4)).toEqual(['2026-11-23', '2026-11-25', '2026-11-28', '2026-11-30']);
    expect(dates).not.toContain('2026-12-04');

    const stopped = await json<{ series: Series }>(await call(lead, 'PATCH', `/series/${s.id}`, { active: false }));
    expect(stopped.series).toMatchObject({ active: false, nextMeetingDate: null });
    expect(await upcoming(lead, teamId)).toEqual([]);
    expect((await job.refresh({ teamId })).created).toBe(0);

    const restarted = await json<{ series: Series }>(await call(lead, 'PATCH', `/series/${s.id}`, { active: true }));
    expect(restarted.series.nextMeetingDate).toBe('2026-11-23');
  });

  it('deletes a schedule with its meetings, unless a meeting already holds notes', async () => {
    const lead = await person('Kiki Lead');
    const teamId = await team(lead);
    const empty = await series(lead, teamId, [2]);
    expect((await call(lead, 'DELETE', `/series/${empty.id}`)).status).toBe(204);
    expect(await pool.query('SELECT 1 FROM meetings WHERE series_id = $1', [empty.id])).toMatchObject({ rowCount: 0 });

    const used = await series(lead, teamId, [4]);
    const meeting = (await upcoming(lead, teamId))[0] as Meeting;
    const note = await pool.query<{ id: string }>('INSERT INTO notes (user_id) VALUES ($1) RETURNING id', [lead.id]);
    await pool.query('INSERT INTO note_meetings (note_id, meeting_id) VALUES ($1, $2)', [note.rows[0]?.id, meeting.id]);
    expect(await code(await call(lead, 'DELETE', `/series/${used.id}`))).toBe('series_has_notes');

    // Stopping keeps the meeting that holds a note.
    await call(lead, 'PATCH', `/series/${used.id}`, { active: false });
    expect(datesOf(await upcoming(lead, teamId))).toEqual([meeting.date]);
  });

  it("lists my next two weeks of meetings across my teams, not other teams' or deleted teams'", async () => {
    const me = await person('Lina Me');
    const other = await person('Mira Other');
    const first = await team(me, [], 'Alpha');
    const second = await team(other, [me], 'Beta');
    const notMine = await team(other, [], 'Gamma');
    await series(me, first, [3]);
    await series(other, second, [2]);
    await series(other, notMine, [1]);

    const mine = await json<{ meetings: Meeting[] }>(await call(me, 'GET', '/meetings/upcoming'));
    expect(mine.meetings.map((m) => [m.date, m.teamName])).toEqual([
      ['2026-11-24', 'Beta'],
      ['2026-11-25', 'Alpha'],
      ['2026-12-01', 'Beta'],
      ['2026-12-02', 'Alpha'],
    ]);

    await call(other, 'DELETE', `/teams/${second}`, { confirmName: 'Beta' });
    const after = await json<{ meetings: Meeting[] }>(await call(me, 'GET', '/meetings/upcoming'));
    expect(after.meetings.map((m) => m.teamName)).toEqual(['Alpha', 'Alpha']);
  });

  it('lists at most five meetings on Home, soonest first, and says there are more', async () => {
    const me = await person('Hana Me');
    const mine = await team(me, [], 'Daily');
    await series(me, mine, [1, 2, 3, 4, 5]);
    const home = await json<{ meetings: Meeting[]; hasMore: boolean }>(await call(me, 'GET', '/meetings/upcoming'));
    expect(home.meetings.map((m) => m.date)).toEqual(['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27']); // the tests' today is Monday 23 Nov
    expect(home.hasMore).toBe(true);
  });

  it('lists all my meetings for the Meetings page: across my teams, by team, upcoming or past, with their days', async () => {
    const me = await person('Oki Me');
    const other = await person('Putri Other');
    const first = await team(me, [], 'Omega');
    const second = await team(other, [me], 'Sigma');
    const notMine = await team(other, [], 'Tau');
    await series(me, first, [3]);
    await series(other, second, [5]);
    await series(other, notMine, [4]);

    const all = await json<{ meetings: Meeting[]; hasMore: boolean }>(await call(me, 'GET', '/meetings?when=upcoming'));
    expect(all.meetings.map((m) => m.teamName)).not.toContain('Tau');
    expect(all.meetings.map((m) => [m.date, m.teamName]).slice(0, 3)).toEqual([
      ['2026-11-25', 'Omega'],
      ['2026-11-27', 'Sigma'],
      ['2026-12-02', 'Omega'],
    ]);
    // The first meeting covers from the day its series was created (pinned to 20 Nov); the next from the day after.
    expect(all.meetings.slice(0, 3).map((m) => m.coversFrom)).toEqual(['2026-11-20', '2026-11-20', '2026-11-26']);
    expect(all.meetings).toHaveLength(8);
    expect(all.hasMore).toBe(false);

    const onlySigma = await json<{ meetings: Meeting[] }>(await call(me, 'GET', `/meetings?teamId=${second}`));
    expect(new Set(onlySigma.meetings.map((m) => m.teamName))).toEqual(new Set(['Sigma']));
    // Someone else's team id matches nothing (no hint that it exists).
    const notAllowed = await json<{ meetings: Meeting[] }>(await call(me, 'GET', `/meetings?teamId=${notMine}`));
    expect(notAllowed.meetings).toEqual([]);

    now = new Date('2026-12-05T03:00:00Z');
    const past = await json<{ meetings: Meeting[] }>(await call(me, 'GET', '/meetings?when=past'));
    expect(past.meetings.map((m) => [m.date, m.status])).toEqual([
      ['2026-12-04', 'done'],
      ['2026-12-02', 'done'],
      ['2026-11-27', 'done'],
      ['2026-11-25', 'done'],
    ]);
    expect((await call(me, 'GET', '/meetings?when=later')).status).toBe(400);
    expect((await call(me, 'GET', '/meetings?teamId=abc')).status).toBe(400);
  });

  it('filters the Meetings page on the server: status, text, and a date range', async () => {
    const me = await person('Umar Filter');
    const teamId = await team(me, [], 'Upsilon');
    await series(me, teamId, [3, 5], 'Sprint sync');
    const [wednesday, friday] = (await upcoming(me, teamId)) as [Meeting, Meeting];
    await call(me, 'PATCH', `/meetings/${friday.id}`, { status: 'cancelled', title: 'Public holiday' });
    const list = async (query: string) =>
      (await json<{ meetings: Meeting[] }>(await call(me, 'GET', `/meetings?teamId=${teamId}&${query}`))).meetings;

    expect((await list('status=cancelled')).map((m) => m.date)).toEqual(['2026-11-27']);
    expect((await list('status=scheduled')).map((m) => m.date)).not.toContain('2026-11-27');
    expect((await list('q=holiday')).map((m) => m.id)).toEqual([friday.id]); // the title
    expect(await list('q=sprint')).toHaveLength(8); // the schedule name
    expect(await list('q=upsilon')).toHaveLength(8); // the team name
    expect(await list('q=nothing-like-this')).toEqual([]);
    expect((await list('from=2026-12-01&to=2026-12-04')).map((m) => m.date)).toEqual(['2026-12-02', '2026-12-04']);

    now = new Date('2026-11-28T03:00:00Z');
    expect((await list('when=past&status=done')).map((m) => m.id)).toEqual([wednesday.id]);
    expect((await list('when=past&status=cancelled')).map((m) => m.id)).toEqual([friday.id]);
    expect(await list('when=past&from=2026-11-26')).toHaveLength(1);

    expect((await call(me, 'GET', '/meetings?from=2026-12-04&to=2026-12-01')).status).toBe(400);
    expect((await call(me, 'GET', '/meetings?from=2026-02-30')).status).toBe(400);
    expect((await call(me, 'GET', '/meetings?status=moved')).status).toBe(400);
  });

  it("splits the team's year into periods (quarters by default) that the leader can change, each with its meetings and notes", async () => {
    const lead = await person('Quinn Lead');
    const mo = await person('Mo Quarter');
    const out = await person('Oli Outside');
    const teamId = await team(lead, [mo], 'Quarterly');
    const weekly = await series(lead, teamId, [4]); // Thursdays: 26 Nov, 3, 10 and 17 Dec
    // One past meeting, back in Q3.
    await pool.query("INSERT INTO meetings (series_id, scheduled_date, meeting_date) VALUES ($1, '2026-09-10', '2026-09-10')", [weekly.id]);
    type Summary = { key: string; label: string; start: string; end: string; status: string; meetingCount: number; cancelledCount: number; noteCount: number; daysPassed: number; days: number };
    const periods = async (who: Person) => json<{ split: { periodsPerYear: number; yearStartMonth: number }; periods: Summary[] }>(await call(who, 'GET', `/teams/${teamId}/periods`));

    // Quarters from January by default: from the first meeting's quarter to the one after today's.
    const teamView = await json<{ team: { periodsPerYear: number; yearStartMonth: number } }>(await call(mo, 'GET', `/teams/${teamId}`));
    expect(teamView.team).toMatchObject({ periodsPerYear: 4, yearStartMonth: 1 });
    const quarters = await periods(mo);
    expect(quarters.split).toEqual({ periodsPerYear: 4, yearStartMonth: 1 });
    expect(quarters.periods.map((p) => [p.key, p.label, p.status, p.meetingCount])).toEqual([
      ['2026-07-3m', 'Q3 2026', 'ended', 1],
      ['2026-10-3m', 'Q4 2026', 'current', 4],
      ['2027-01-3m', 'Q1 2027', 'upcoming', 0],
    ]);
    expect(quarters.periods[1]).toMatchObject({ start: '2026-10-01', end: '2026-12-31', daysPassed: 54, days: 92, noteCount: 0 });
    expect((await call(out, 'GET', `/teams/${teamId}/periods`)).status).toBe(404);

    // The leader changes the split; members cannot; only whole-month splits and real months.
    expect(await code(await call(mo, 'PATCH', `/teams/${teamId}`, { periodsPerYear: 12 }))).toBe('not_team_leader');
    expect(await code(await call(lead, 'PATCH', `/teams/${teamId}`, { periodsPerYear: 5 }))).toBe('validation_failed');
    expect(await code(await call(lead, 'PATCH', `/teams/${teamId}`, { yearStartMonth: 13 }))).toBe('validation_failed');
    const months = await call(lead, 'PATCH', `/teams/${teamId}`, { periodsPerYear: 12 });
    expect(months.status).toBe(200);
    expect((await periods(mo)).periods.map((p) => p.label)).toEqual(['Sep 2026', 'Oct 2026', 'Nov 2026', 'Dec 2026']);
    expect((await call(lead, 'PATCH', `/teams/${teamId}`, { periodsPerYear: 4, yearStartMonth: 4 })).status).toBe(200);
    expect((await periods(mo)).periods.map((p) => p.label)).toEqual(['Q2 2026/27', 'Q3 2026/27', 'Q4 2026/27']);
    expect((await call(lead, 'PATCH', `/teams/${teamId}`, { yearStartMonth: 1 })).status).toBe(200);

    // One period: its meetings and the periods around it; a key that does not fit the split is not found.
    const q4 = await call(mo, 'GET', `/teams/${teamId}/periods/2026-10-3m`);
    expect(q4.status).toBe(200);
    const { period } = await json<{ period: Summary & { previous: unknown; next: unknown; teamName: string; meetings: { id: string; date: string }[] } }>(q4);
    expect(period).toMatchObject({ label: 'Q4 2026', teamName: 'Quarterly', previous: { key: '2026-07-3m', label: 'Q3 2026' }, next: { key: '2027-01-3m', label: 'Q1 2027' } });
    expect(period.meetings.map((m) => m.date)).toEqual(['2026-11-26', '2026-12-03', '2026-12-10', '2026-12-17']);
    expect((await call(mo, 'GET', `/teams/${teamId}/periods/2026-11-3m`)).status).toBe(404); // not a quarter
    expect((await call(mo, 'GET', `/teams/${teamId}/periods/2026-10-1m`)).status).toBe(404); // a month: another split
    expect((await call(mo, 'GET', `/teams/${teamId}/periods/2026-4`)).status).toBe(400);
    expect((await call(mo, 'GET', `/teams/${teamId}/periods/nonsense`)).status).toBe(400);
    expect((await call(out, 'GET', `/teams/${teamId}/periods/2026-10-3m`)).status).toBe(404);

    // A meeting knows its period.
    const first = period.meetings[0] as { id: string };
    expect((await json<{ meeting: { period: unknown } }>(await call(mo, 'GET', `/meetings/${first.id}`))).meeting.period).toEqual({
      key: '2026-10-3m',
      label: 'Q4 2026',
      status: 'current',
    });

    // The whole quarter to read: meetings with notes, people in board order, notes in full; blank notes left out.
    const written = await json<{ note: { id: string; version: number } }>(await call(mo, 'POST', '/notes', { title: 'Week 48', meetingId: first.id }));
    await call(mo, 'PATCH', `/notes/${written.note.id}`, { content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Shipped it.' }] }] }, version: written.note.version });
    await call(lead, 'POST', '/notes', { meetingId: first.id }); // blank
    const whole = await json<{ meetings: { id: string; date: string; people: { name: string; notes: { title: string; content: unknown }[] }[] }[] }>(
      await call(lead, 'GET', `/teams/${teamId}/periods/2026-10-3m/notes`),
    );
    expect(whole.meetings).toHaveLength(1);
    expect(whole.meetings[0]).toMatchObject({ id: first.id, date: '2026-11-26' });
    expect(whole.meetings[0]?.people.map((p) => [p.name, p.notes.map((n) => n.title)])).toEqual([['Mo Quarter', ['Week 48']]]);
    expect(JSON.stringify(whole.meetings[0]?.people[0]?.notes[0]?.content)).toContain('Shipped it.');
    expect((await periods(mo)).periods[1]?.noteCount).toBe(1);
    expect((await call(out, 'GET', `/teams/${teamId}/periods/2026-10-3m/notes`)).status).toBe(404);

    // Home: the current period of each of my teams.
    const current = await json<{ teams: { teamId: string; period: Summary }[] }>(await call(mo, 'GET', '/periods/current'));
    expect(current.teams.find((t) => t.teamId === teamId)?.period).toMatchObject({ label: 'Q4 2026', meetingCount: 4, noteCount: 1 });
  });

  it('freezes a deleted team: no changes, no new meetings; restoring brings them back', async () => {
    const lead = await person('Nina Lead');
    const teamId = await team(lead, [], 'Delta');
    const s = await series(lead, teamId, [3]);
    await call(lead, 'DELETE', `/teams/${teamId}`, { confirmName: 'Delta' });
    expect(await code(await call(lead, 'PATCH', `/series/${s.id}`, { name: 'New' }))).toBe('team_archived');

    await pool.query('DELETE FROM meetings WHERE series_id = $1', [s.id]);
    expect((await job.refresh({ teamId })).created).toBe(0);
    await call(lead, 'POST', `/teams/${teamId}/restore`);
    // Restore uses the real date, so only check that meetings came back.
    expect((await pool.query('SELECT 1 FROM meetings WHERE series_id = $1', [s.id])).rowCount).toBeGreaterThan(0);
  });
});
