import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.ts';
import { createPool, withTransactions } from '../src/database/pool.ts';
import { createLocalStorage } from '../src/modules/attachments/storage.ts';
import { serve, sessionCookie, silentLogger, testAuth } from './helpers.ts';

// Linking notes to meetings (FR-9) and each meeting's board of notes (FR-10) against the real database (npm test
// loads backend/.env); skipped without DATABASE_URL. Fictitious @board.example.test users only.
const url = process.env.DATABASE_URL;
const describeDb = url ? describe : describe.skip;

interface Person {
  id: string;
  cookie: string;
}
interface NoteMeeting {
  id: string;
  date: string;
  title: string | null;
  seriesName: string;
  teamName: string;
  status: string;
}
interface Column {
  userId: string;
  name: string;
  role: string | null;
  active: boolean;
  isMe: boolean;
  notes: { id: string; title: string; snippet: string; projects: string[]; coverUrl: string | null; imageCount: number }[];
}

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('fake png body')]);
const doc = (...content: unknown[]) => ({ type: 'doc', content });
const para = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });

describeDb('notes on meetings: linking and the board (integration)', () => {
  const pool = createPool({ connectionString: url ?? '', max: 4 }, silentLogger);
  const db = withTransactions(pool);
  const DOMAIN = '@board.example.test';
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
    dir = await mkdtemp(path.join(os.tmpdir(), 'wm-board-'));
    app = await serve(createApp({ db, logger: silentLogger, auth: testAuth(), storage: createLocalStorage(dir) }));
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

  /** A team led by `leader` with `members`, and a daily schedule: its meetings from today on. */
  async function teamWithMeetings(leader: Person, name: string, members: Person[]) {
    const team = (await json<{ team: { id: string } }>(await call(leader, 'POST', '/teams', { name }))).team.id;
    for (const m of members) expect((await call(leader, 'POST', `/teams/${team}/members`, { userId: m.id })).status).toBe(200);
    expect((await call(leader, 'POST', `/teams/${team}/series`, { name: 'Daily sync', daysOfWeek: [1, 2, 3, 4, 5, 6, 7] })).status).toBe(201);
    const { meetings } = await json<{ meetings: { id: string; date: string }[] }>(await call(leader, 'GET', `/teams/${team}/meetings`));
    return { team, meetings: meetings.map((m) => m.id) };
  }
  const newNote = async (who: Person, body: Record<string, unknown> = {}) => {
    const res = await call(who, 'POST', '/notes', body);
    expect(res.status).toBe(201);
    return (await json<{ note: { id: string; version: number; meetings: NoteMeeting[] } }>(res)).note;
  };
  const link = (who: Person, noteId: string, meetingId: string) => call(who, 'PUT', `/notes/${noteId}/meetings/${meetingId}`);
  const unlink = (who: Person, noteId: string, meetingId: string) => call(who, 'DELETE', `/notes/${noteId}/meetings/${meetingId}`);
  const board = async (who: Person, meetingId: string) => {
    const res = await call(who, 'GET', `/meetings/${meetingId}/notes`);
    return { status: res.status, body: res.status === 200 ? await json<{ columns: Column[]; canAdd: boolean; canArrange: boolean }>(res) : null };
  };

  it('puts my note on a meeting board my teammates can read, images included; outsiders see nothing', async () => {
    const lia = await person('Lia Leader');
    const mo = await person('Mo Member');
    const ola = await person('Ola Outsider');
    const { meetings } = await teamWithMeetings(lia, 'Board team', [mo]);
    const [m1, m2] = meetings as [string, string];

    // Mo writes a note with a project section and an image.
    const projectId = (await json<{ project: { id: string } }>(await call(mo, 'POST', '/projects', { name: 'Checkout' }))).project.id;
    const note = await newNote(mo, { title: 'Week 48' });
    const uploaded = await fetch(`${app.url}/api/notes/${note.id}/attachments`, {
      method: 'POST',
      headers: { cookie: mo.cookie, 'content-type': 'image/png' },
      body: PNG,
    });
    const { attachment } = await json<{ attachment: { url: string } }>(uploaded);
    const content = doc(
      para('On leave Friday.'),
      { type: 'projectSection', attrs: { projectId }, content: [para('Shipped saved cards.'), { type: 'image', attrs: { src: attachment.url } }] },
    );
    expect((await call(mo, 'PATCH', `/notes/${note.id}`, { content, version: note.version })).status).toBe(200);

    // Linking answers the note's meetings; linking twice changes nothing.
    const linked = await link(mo, note.id, m1);
    expect(linked.status).toBe(200);
    const { meetings: after } = await json<{ meetings: NoteMeeting[] }>(linked);
    expect(after).toEqual([expect.objectContaining({ id: m1, seriesName: 'Daily sync', teamName: 'Board team', status: 'scheduled' })]);
    expect((await json<{ meetings: NoteMeeting[] }>(await link(mo, note.id, m1))).meetings).toHaveLength(1);
    const reopened = await json<{ note: { meetings: NoteMeeting[] } }>(await call(mo, 'GET', `/notes/${note.id}`));
    expect(reopened.note.meetings.map((m) => m.id)).toEqual([m1]);
    const list = await json<{ notes: { id: string; meetings: NoteMeeting[] }[] }>(await call(mo, 'GET', '/notes'));
    expect(list.notes.find((n) => n.id === note.id)?.meetings.map((m) => m.id)).toEqual([m1]);
    expect((await json<{ meeting: { noteCount: number } }>(await call(lia, 'GET', `/meetings/${m1}`))).meeting.noteCount).toBe(1);

    // The board: the leader first, then Mo with the card.
    const forLia = await board(lia, m1);
    expect(forLia.status).toBe(200);
    expect(forLia.body?.canAdd).toBe(true);
    expect(forLia.body?.columns.map((c) => [c.name, c.role, c.isMe, c.notes.length])).toEqual([
      ['Lia Leader', 'leader', true, 0],
      ['Mo Member', 'member', false, 1],
    ]);
    expect(forLia.body?.columns[1]?.notes[0]).toEqual(
      expect.objectContaining({ id: note.id, title: 'Week 48', projects: ['Checkout'], coverUrl: attachment.url, imageCount: 1 }),
    );
    expect(forLia.body?.columns[1]?.notes[0]?.snippet).toBe('On leave Friday. · Shipped saved cards.');
    // The same order for everyone (owner, 2026-11-23: it used to put each viewer first; the board is now shared in the
    // meeting in one speaking order).
    expect((await board(mo, m1)).body?.columns.map((c) => c.name)).toEqual(['Lia Leader', 'Mo Member']);

    // Teammates read the note and its image; never through another meeting, never as outsiders.
    const read = await call(lia, 'GET', `/meetings/${m1}/notes/${note.id}`);
    expect(read.status).toBe(200);
    const { note: shown } = await json<{ note: { content: unknown; author: { name: string }; isMine: boolean; projects: unknown } }>(read);
    expect(shown).toEqual(expect.objectContaining({ content, author: { id: mo.id, name: 'Mo Member' }, isMine: false, projects: [{ id: projectId, name: 'Checkout' }] }));
    expect((await call(lia, 'GET', attachment.url.replace('/api', ''))).status).toBe(200);
    expect((await call(lia, 'GET', `/meetings/${m2}/notes/${note.id}`)).status).toBe(404);
    expect((await board(ola, m1)).status).toBe(404);
    expect((await call(ola, 'GET', `/meetings/${m1}/notes/${note.id}`)).status).toBe(404);
    expect((await call(ola, 'GET', attachment.url.replace('/api', ''))).status).toBe(404);
    // The editor route stays the owner's.
    expect((await call(lia, 'GET', `/notes/${note.id}`)).status).toBe(404);

    // Unlinking takes it off the board, and the teammates' access with it.
    const off = await unlink(mo, note.id, m1);
    expect(off.status).toBe(200);
    expect((await json<{ meetings: NoteMeeting[] }>(off)).meetings).toEqual([]);
    expect((await call(lia, 'GET', `/meetings/${m1}/notes/${note.id}`)).status).toBe(404);
    expect((await call(lia, 'GET', attachment.url.replace('/api', ''))).status).toBe(404);
    expect((await board(lia, m1)).body?.columns[1]?.notes).toEqual([]);
  });

  it("links only to meetings I can use, and only my own notes; a new note can start on a meeting's board", async () => {
    const lia = await person('Lia Two');
    const mo = await person('Mo Two');
    const ola = await person('Ola Two');
    const { team, meetings } = await teamWithMeetings(lia, 'Rules team', [mo]);
    const [m1, m2] = meetings as [string, string];
    const theirs = (await teamWithMeetings(ola, 'Other team', [])).meetings[0] as string;
    const note = await newNote(mo);

    expect((await link(mo, note.id, theirs)).status).toBe(404); // not my team
    expect((await link(lia, note.id, m1)).status).toBe(404); // not my note
    expect(await code(await link(mo, note.id, 'abc'))).toBe('validation_failed');

    expect((await call(lia, 'PATCH', `/meetings/${m2}`, { status: 'cancelled' })).status).toBe(200);
    expect(await code(await link(mo, note.id, m2))).toBe('meeting_cancelled');
    expect((await board(lia, m2)).body?.canAdd).toBe(false);

    // A meeting whose day has passed still takes late notes.
    const series = (await pool.query<{ id: string }>('SELECT series_id AS id FROM meetings WHERE id = $1', [m1])).rows[0]?.id;
    const past = (
      await pool.query<{ id: string }>(
        `INSERT INTO meetings (series_id, scheduled_date, meeting_date, status)
         VALUES ($1, current_date - 30, current_date - 30, 'done') RETURNING id`,
        [series],
      )
    ).rows[0]?.id as string;
    const late = await json<{ meetings: NoteMeeting[] }>(await link(mo, note.id, past));
    expect(late.meetings.map((m) => [m.id, m.status])).toEqual([[past, 'done']]);

    // Started from a meeting's board: created and linked in one go; refused (and not created) for someone else's.
    const fromBoard = await newNote(mo, { meetingId: m1 });
    expect(fromBoard.meetings.map((m) => m.id)).toEqual([m1]);
    const before = (await pool.query('SELECT 1 FROM notes WHERE user_id = $1', [mo.id])).rowCount;
    expect((await call(mo, 'POST', '/notes', { meetingId: theirs })).status).toBe(404);
    expect((await pool.query('SELECT 1 FROM notes WHERE user_id = $1', [mo.id])).rowCount).toBe(before);

    // A deleted team: members lose the board; its leader still sees it but adds nothing; unlinking still works.
    expect((await call(lia, 'DELETE', `/teams/${team}`, { confirmName: 'Rules team' })).status).toBe(200);
    expect((await board(mo, m1)).status).toBe(404);
    expect((await link(mo, note.id, m1)).status).toBe(404);
    const leaderNote = await newNote(lia);
    expect(await code(await link(lia, leaderNote.id, m1))).toBe('team_archived');
    expect((await board(lia, m1)).body?.canAdd).toBe(false);
    expect((await unlink(mo, fromBoard.id, m1)).status).toBe(200);
  });

  it('keeps the notes of people who left in their own column, and hides deactivated members without notes', async () => {
    const lia = await person('Lia Three');
    const pia = await person('Pia Leaving');
    const dee = await person('Dee Deactivated');
    const { team, meetings } = await teamWithMeetings(lia, 'Changing team', [pia, dee]);
    const m1 = meetings[0] as string;
    const note = await newNote(pia, { title: 'Handover' });
    expect((await link(pia, note.id, m1)).status).toBe(200);

    expect((await call(lia, 'DELETE', `/teams/${team}/members/${pia.id}`)).status).toBe(204);
    await pool.query("UPDATE users SET status = 'inactive' WHERE id = $1", [dee.id]);

    const { body } = await board(lia, m1);
    expect(body?.columns.map((c) => [c.name, c.role, c.notes.map((n) => n.title)])).toEqual([
      ['Lia Three', 'leader', []],
      ['Pia Leaving', null, ['Handover']],
    ]);
    expect((await board(pia, m1)).status).toBe(404); // no longer in the team
  });

  it('tells each meeting who has no note on it yet (leader first, then by name), not people deactivated or gone', async () => {
    const lia = await person('Lia Lead');
    const bo = await person('Bo Writer');
    const al = await person('Al Waiting');
    const zed = await person('Zed Away');
    const { team, meetings } = await teamWithMeetings(lia, 'Waiting team', [bo, al, zed]);
    const [m1, m2] = meetings as [string, string];
    type Waiting = { memberCount: number; withoutNote: { userId: string; name: string; role: string }[] };
    const waiting = async (who: Person, id: string) => (await json<{ meeting: Waiting }>(await call(who, 'GET', `/meetings/${id}`))).meeting;

    // Nobody has a note yet: everyone, the leader first.
    expect(await waiting(bo, m1)).toEqual({
      ...(await waiting(bo, m1)),
      memberCount: 4,
      withoutNote: [
        { userId: lia.id, name: 'Lia Lead', role: 'leader' },
        { userId: al.id, name: 'Al Waiting', role: 'member' },
        { userId: bo.id, name: 'Bo Writer', role: 'member' },
        { userId: zed.id, name: 'Zed Away', role: 'member' },
      ],
    });

    // Bo shares a note; a blank note (nothing written) does not count; Zed is deactivated.
    const written = await newNote(bo, { title: 'Week 48' }); // a title is enough to count
    expect((await link(bo, written.id, m1)).status).toBe(200);
    const blank = await newNote(al);
    expect((await link(al, blank.id, m1)).status).toBe(200);
    await pool.query("UPDATE users SET status = 'inactive' WHERE id = $1", [zed.id]);
    const after = await waiting(lia, m1);
    expect(after.memberCount).toBe(3);
    expect(after.withoutNote.map((p) => p.name)).toEqual(['Lia Lead', 'Al Waiting']);

    // The same in the lists (the team's and mine); a cancelled meeting lists nobody.
    const teamList = await json<{ meetings: ({ id: string } & Waiting)[] }>(await call(lia, 'GET', `/teams/${team}/meetings`));
    expect(teamList.meetings.find((m) => m.id === m1)?.withoutNote.map((p) => p.name)).toEqual(['Lia Lead', 'Al Waiting']);
    expect((await call(lia, 'PATCH', `/meetings/${m2}`, { status: 'cancelled' })).status).toBe(200);
    const mine = await json<{ meetings: ({ id: string } & Waiting)[] }>(await call(al, 'GET', '/meetings?when=upcoming'));
    expect(mine.meetings.find((m) => m.id === m1)?.withoutNote.map((p) => p.name)).toEqual(['Lia Lead', 'Al Waiting']);
    expect(mine.meetings.find((m) => m.id === m2)?.withoutNote).toEqual([]);
  });

  it('shows a blank note to its owner only, and drops a deleted note from the board', async () => {
    const lia = await person('Lia Four');
    const mo = await person('Mo Four');
    const { meetings } = await teamWithMeetings(lia, 'Blank team', [mo]);
    const m1 = meetings[0] as string;
    const blank = await newNote(mo, { meetingId: m1 }); // "Write a note" from the board, then nothing written yet
    const titled = await newNote(mo, { title: 'Real update', meetingId: m1 });

    const forMo = (await board(mo, m1)).body?.columns.find((c) => c.isMe)?.notes.map((n) => n.id);
    expect(forMo).toEqual([titled.id, blank.id]);
    const forLia = (await board(lia, m1)).body?.columns.find((c) => c.name === 'Mo Four')?.notes.map((n) => n.id);
    expect(forLia).toEqual([titled.id]);
    expect((await json<{ meeting: { noteCount: number } }>(await call(lia, 'GET', `/meetings/${m1}`))).meeting.noteCount).toBe(1);

    // Once it has text, everyone sees it.
    await call(mo, 'PATCH', `/notes/${blank.id}`, { content: doc(para('Now with words.')), version: blank.version });
    expect((await board(lia, m1)).body?.columns.find((c) => c.name === 'Mo Four')?.notes).toHaveLength(2);

    expect((await call(mo, 'DELETE', `/notes/${titled.id}`)).status).toBe(204);
    expect((await board(lia, m1)).body?.columns.find((c) => c.name === 'Mo Four')?.notes.map((n) => n.id)).toEqual([blank.id]);
    expect((await call(lia, 'GET', `/meetings/${m1}/notes/${titled.id}`)).status).toBe(404);
  });

  it("orders the board by the leader's speaking order, carried to later meetings, lets members move themselves and writers arrange their notes", async () => {
    const lia = await person('Lia Six');
    const ana = await person('Ana Six');
    const bo = await person('Bo Six');
    const cy = await person('Cy Six');
    const ola = await person('Ola Six');
    const { team, meetings } = await teamWithMeetings(lia, 'Order team', [ana, bo]);
    const [m1, m2, m3] = meetings as [string, string, string];
    const a1 = await newNote(ana, { title: 'A one', meetingId: m1 });
    const a2 = await newNote(ana, { title: 'A two', meetingId: m1 });
    await newNote(bo, { title: 'B one', meetingId: m1 });
    const names = async (who: Person, meetingId: string) => (await board(who, meetingId)).body?.columns.map((c) => c.name);
    const speakers = (who: Person, meetingId: string, userIds: unknown) => call(who, 'PUT', `/meetings/${meetingId}/speakers`, { userIds });
    const arrange = (who: Person, meetingId: string, userId: string, noteIds: unknown) =>
      call(who, 'PUT', `/meetings/${meetingId}/note-order`, { userId, noteIds });
    const anaNotes = async (who: Person, meetingId: string) =>
      (await board(who, meetingId)).body?.columns.find((c) => c.name === 'Ana Six')?.notes.map((n) => n.title);

    // Before any order: the leader, then by name, for everyone; only the leader may arrange everyone.
    expect(await names(bo, m1)).toEqual(['Lia Six', 'Ana Six', 'Bo Six']);
    expect((await board(bo, m1)).body).toEqual(expect.objectContaining({ canAdd: true, canArrange: false }));
    expect((await board(lia, m1)).body?.canArrange).toBe(true);
    expect(await anaNotes(bo, m1)).toEqual(['A two', 'A one']); // newest first

    // The speaking order: every person on the board exactly once; a member may move only themselves.
    expect(await code(await speakers(bo, m1, [ana.id, lia.id, bo.id]))).toBe('not_team_leader'); // moves Ana
    expect(await code(await speakers(bo, m1, [bo.id, ana.id, lia.id]))).toBe('not_team_leader'); // moves Ana too
    expect((await speakers(ola, m1, [bo.id, lia.id, ana.id])).status).toBe(404);
    expect(await code(await speakers(lia, m1, [bo.id, ana.id]))).toBe('board_changed');
    expect(await code(await speakers(lia, m1, [bo.id, lia.id, ola.id]))).toBe('board_changed');
    expect(await code(await speakers(lia, m1, [bo.id, lia.id, ana.id, ola.id]))).toBe('board_changed');
    expect(await code(await speakers(lia, m1, [bo.id, bo.id, ana.id]))).toBe('validation_failed');
    expect(await code(await speakers(lia, m1, []))).toBe('validation_failed');
    expect(await code(await speakers(lia, m1, ['not-an-id']))).toBe('validation_failed');
    const set = await speakers(lia, m1, [bo.id, lia.id, ana.id]);
    expect(set.status).toBe(200);
    expect((await json<{ columns: Column[] }>(set)).columns.map((c) => c.name)).toEqual(['Bo Six', 'Lia Six', 'Ana Six']);
    expect(await names(ana, m1)).toEqual(['Bo Six', 'Lia Six', 'Ana Six']);

    // Later meetings without their own order follow the latest earlier one; an earlier meeting keeps its own.
    expect(await names(ana, m2)).toEqual(['Bo Six', 'Lia Six', 'Ana Six']);
    expect((await speakers(lia, m2, [ana.id, bo.id, lia.id])).status).toBe(200);
    expect(await names(ana, m2)).toEqual(['Ana Six', 'Bo Six', 'Lia Six']);
    expect(await names(ana, m3)).toEqual(['Ana Six', 'Bo Six', 'Lia Six']);
    expect(await names(ana, m1)).toEqual(['Bo Six', 'Lia Six', 'Ana Six']);

    // A member moves their own group (owner, 2026-11-24): everyone else keeps their order, and everyone sees it.
    expect(await code(await speakers(ana, m1, [ana.id, lia.id, bo.id]))).toBe('not_team_leader'); // Bo and Lia swapped too
    expect(await code(await speakers(ana, m1, [ana.id, bo.id]))).toBe('board_changed');
    const self = await speakers(ana, m1, [ana.id, bo.id, lia.id]);
    expect(self.status).toBe(200);
    expect((await json<{ columns: Column[] }>(self)).columns.map((c) => c.name)).toEqual(['Ana Six', 'Bo Six', 'Lia Six']);
    expect(await names(bo, m1)).toEqual(['Ana Six', 'Bo Six', 'Lia Six']);
    expect((await board(ana, m1)).body?.canArrange).toBe(false);
    expect(await names(ana, m2)).toEqual(['Ana Six', 'Bo Six', 'Lia Six']); // m2 keeps its own order

    // Someone new comes after the ordered people, and an order that leaves them out is refused.
    expect((await call(lia, 'POST', `/teams/${team}/members`, { userId: cy.id })).status).toBe(200);
    expect(await names(ana, m1)).toEqual(['Ana Six', 'Bo Six', 'Lia Six', 'Cy Six']);
    expect(await code(await speakers(lia, m1, [bo.id, lia.id, ana.id]))).toBe('board_changed');

    // Notes: their writer arranges them, or the leader; teammates may not; it must be exactly that person's notes.
    expect(await code(await arrange(bo, m1, ana.id, [a1.id, a2.id]))).toBe('not_team_leader');
    expect((await arrange(ola, m1, ana.id, [a1.id, a2.id])).status).toBe(404);
    expect(await code(await arrange(ana, m1, ana.id, [a1.id]))).toBe('board_changed');
    const boNote = (await board(bo, m1)).body?.columns.find((c) => c.isMe)?.notes[0]?.id as string;
    expect(await code(await arrange(ana, m1, ana.id, [a1.id, a2.id, boNote]))).toBe('board_changed');
    expect(await code(await arrange(ana, m1, ana.id, [a1.id, a1.id]))).toBe('validation_failed');
    const mine = await arrange(ana, m1, ana.id, [a1.id, a2.id]);
    expect(mine.status).toBe(200);
    expect((await json<{ columns: Column[] }>(mine)).columns.find((c) => c.isMe)?.notes.map((n) => n.title)).toEqual(['A one', 'A two']);
    expect(await anaNotes(bo, m1)).toEqual(['A one', 'A two']);

    // A note added later comes after the arranged ones. Ana's blank note shows to her only, so she must include it
    // and the leader (who does not see it) must not.
    const a3 = await newNote(ana, { title: 'A three', meetingId: m1 });
    const blank = await newNote(ana, { meetingId: m1 });
    expect(await anaNotes(bo, m1)).toEqual(['A one', 'A two', 'A three']);
    expect(await code(await arrange(ana, m1, ana.id, [a3.id, a1.id, a2.id]))).toBe('board_changed');
    expect((await arrange(lia, m1, ana.id, [a3.id, a1.id, a2.id])).status).toBe(200);
    expect(await anaNotes(bo, m1)).toEqual(['A three', 'A one', 'A two']);
    expect((await arrange(ana, m1, ana.id, [a2.id, blank.id, a3.id, a1.id])).status).toBe(200);
    expect(await anaNotes(bo, m1)).toEqual(['A two', 'A three', 'A one']);
    // The order belongs to this meeting: the same note elsewhere is not affected.
    expect((await link(ana, a1.id, m2)).status).toBe(200);
    expect((await link(ana, a2.id, m2)).status).toBe(200);
    expect(await anaNotes(bo, m2)).toEqual(['A two', 'A one']);

    // A cancelled meeting takes no new order.
    expect((await call(lia, 'PATCH', `/meetings/${m3}`, { status: 'cancelled' })).status).toBe(200);
    expect((await board(lia, m3)).body?.canArrange).toBe(false);
    expect(await code(await speakers(lia, m3, [ana.id, bo.id, lia.id, cy.id]))).toBe('meeting_cancelled');
    expect(await code(await arrange(ana, m3, ana.id, [a1.id]))).toBe('meeting_cancelled');
  });

  it('follows the deleted-team rule for images too, and lets the owner unlink from a cancelled meeting', async () => {
    const lia = await person('Lia Five');
    const mo = await person('Mo Five');
    const kim = await person('Kim Five');
    const { team, meetings } = await teamWithMeetings(lia, 'Image team', [mo, kim]);
    const [m1, m2] = meetings as [string, string];
    const note = await newNote(mo, { title: 'With a chart' });
    const uploaded = await fetch(`${app.url}/api/notes/${note.id}/attachments`, {
      method: 'POST',
      headers: { cookie: mo.cookie, 'content-type': 'image/png' },
      body: PNG,
    });
    const { attachment } = await json<{ attachment: { url: string } }>(uploaded);
    await call(mo, 'PATCH', `/notes/${note.id}`, { content: doc({ type: 'image', attrs: { src: attachment.url } }), version: note.version });
    expect((await link(mo, note.id, m1)).status).toBe(200);
    expect((await link(mo, note.id, m2)).status).toBe(200);
    const image = (who: Person) => call(who, 'GET', attachment.url.replace('/api', ''));
    expect((await image(kim)).status).toBe(200);

    // Cancelled after the note was added: the note stays there until its owner takes it off.
    expect((await call(lia, 'PATCH', `/meetings/${m2}`, { status: 'cancelled' })).status).toBe(200);
    expect((await board(kim, m2)).body?.columns.find((c) => c.name === 'Mo Five')?.notes).toHaveLength(1);
    expect((await unlink(mo, note.id, m2)).status).toBe(200);

    // A deactivated member who has notes keeps their column.
    await pool.query("UPDATE users SET status = 'inactive' WHERE id = $1", [mo.id]);
    expect((await board(kim, m1)).body?.columns.find((c) => c.name === 'Mo Five')).toEqual(
      expect.objectContaining({ active: false, role: 'member', notes: [expect.objectContaining({ id: note.id })] }),
    );

    // A deleted team: its leader still reads the note and its image; members do not.
    expect((await call(lia, 'DELETE', `/teams/${team}`, { confirmName: 'Image team' })).status).toBe(200);
    expect((await image(kim)).status).toBe(404);
    expect((await call(kim, 'GET', `/meetings/${m1}/notes/${note.id}`)).status).toBe(404);
    expect((await image(lia)).status).toBe(200);
    expect((await call(lia, 'GET', `/meetings/${m1}/notes/${note.id}`)).status).toBe(200);
    // ...but cannot rearrange its board.
    expect((await board(lia, m1)).body?.canArrange).toBe(false);
    expect(await code(await call(lia, 'PUT', `/meetings/${m1}/speakers`, { userIds: [lia.id, mo.id, kim.id] }))).toBe('team_archived');
    expect(await code(await call(lia, 'PUT', `/meetings/${m1}/note-order`, { userId: mo.id, noteIds: [note.id] }))).toBe('team_archived');
  });

  it('filters my notes by the team they are shared with; a copy starts shared on nothing', async () => {
    const zoe = await person('Zoe Filter');
    const { team, meetings } = await teamWithMeetings(zoe, 'Filter team', []);
    const { team: otherTeam } = await teamWithMeetings(zoe, 'Other team', []);
    const shared = await newNote(zoe, { title: 'Shared one' });
    await newNote(zoe, { title: 'Kept to myself' });
    expect((await link(zoe, shared.id, meetings[0] as string)).status).toBe(200);

    const titles = async (query: string) =>
      (await json<{ notes: { title: string }[]; total: number }>(await call(zoe, 'GET', `/notes${query}`))).notes.map((n) => n.title);
    expect(await titles(`?team=${team}`)).toEqual(['Shared one']);
    expect(await titles(`?team=${otherTeam}`)).toEqual([]);
    expect(await titles('?shared=yes')).toEqual(['Shared one']);
    expect(await titles('?shared=no')).toEqual(['Kept to myself']);

    const res = await call(zoe, 'POST', `/notes/${shared.id}/copy`, { title: 'Copy of Shared one' });
    expect(res.status).toBe(201);
    expect((await json<{ note: { meetings: unknown[] } }>(res)).note.meetings).toEqual([]);
    expect(await titles('?shared=no')).toEqual(['Copy of Shared one', 'Kept to myself']);
  });
});
