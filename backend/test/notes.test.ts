import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.ts';
import { createPool, withTransactions } from '../src/database/pool.ts';
import { createLocalStorage } from '../src/modules/attachments/storage.ts';
import { serve, sessionCookie, silentLogger, testAuth } from './helpers.ts';

// Notes, their project sections and images against the real database (npm test loads backend/.env); skipped
// without DATABASE_URL. Fictitious @notes.example.test users only; images go to a temporary folder deleted afterwards.
const url = process.env.DATABASE_URL;
const describeDb = url ? describe : describe.skip;

interface Person {
  id: string;
  cookie: string;
}
interface NoteProject {
  id: string;
  name: string;
  status: string;
}
interface Note {
  id: string;
  title: string;
  content: { type: string; content?: { type: string; attrs?: Record<string, unknown>; content?: unknown[] }[] };
  version: number;
  projects: NoteProject[];
}
interface Update {
  noteId: string;
  noteTitle: string;
  position: number;
  content: { type: string; content?: unknown[] };
}

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('fake png body')]);
const doc = (...content: unknown[]) => ({ type: 'doc', content });
const para = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const section = (projectId: string | null, ...content: unknown[]) =>
  projectId === null ? { type: 'projectSection', content } : { type: 'projectSection', attrs: { projectId }, content };

describeDb('notes, project sections and images (integration)', () => {
  const pool = createPool({ connectionString: url ?? '', max: 4 }, silentLogger);
  const db = withTransactions(pool);
  const DOMAIN = '@notes.example.test';
  const cleanup = async () => {
    const users = 'SELECT id FROM users WHERE email LIKE $1';
    await pool.query(`DELETE FROM notes WHERE user_id IN (${users})`, [`%${DOMAIN}`]);
    await pool.query(`DELETE FROM projects WHERE user_id IN (${users})`, [`%${DOMAIN}`]);
    await pool.query('DELETE FROM users WHERE email LIKE $1', [`%${DOMAIN}`]);
  };
  let dir = '';
  let app: Awaited<ReturnType<typeof serve>>;

  beforeAll(async () => {
    await cleanup();
    dir = await mkdtemp(path.join(os.tmpdir(), 'wm-notes-'));
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
  const upload = (who: Person, noteId: string, data: Buffer, type = 'image/png') =>
    fetch(`${app.url}/api/notes/${noteId}/attachments`, {
      method: 'POST',
      headers: { cookie: who.cookie, 'content-type': type },
      body: data,
    });
  const code = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
  const project = async (who: Person, name: string) => {
    const res = await call(who, 'POST', '/projects', { name });
    return ((await res.json()) as { project: { id: string } }).project.id;
  };
  const newNote = async (who: Person, body: { title?: string; projectId?: string } = {}) => {
    const res = await call(who, 'POST', '/notes', body);
    expect(res.status).toBe(201);
    return ((await res.json()) as { note: Note }).note;
  };
  const getNote = async (who: Person, id: string) => ((await (await call(who, 'GET', `/notes/${id}`)).json()) as { note: Note }).note;
  const save = (who: Person, id: string, body: Record<string, unknown>) => call(who, 'PATCH', `/notes/${id}`, body);
  const updates = async (who: Person, projectId: string) =>
    (await (await call(who, 'GET', `/projects/${projectId}/updates`)).json()) as { updates: Update[]; hasMore: boolean };
  const files = async () => (await readdir(dir, { recursive: true, withFileTypes: true })).filter((e) => e.isFile()).length;

  it('creates my own note, saves it with optimistic locking and lists it newest first', async () => {
    const owner = await person('Ana Writer');
    const first = await newNote(owner);
    expect(first).toMatchObject({ title: '', version: 1, projects: [], content: { type: 'doc', content: [{ type: 'paragraph' }] } });

    const saved = await save(owner, first.id, { title: '  Week 48  ', content: doc(para('Shipped   the retry\tqueue.'), para('On leave Friday')), version: 1 });
    expect(saved.status).toBe(200);
    expect(((await saved.json()) as { note: { version: number } }).note.version).toBe(2);

    // A second tab still on version 1 cannot overwrite it.
    const stale = await save(owner, first.id, { content: doc(para('old tab')), version: 1 });
    expect(stale.status).toBe(409);
    expect(await code(stale)).toBe('version_conflict');
    expect(await getNote(owner, first.id)).toMatchObject({ title: 'Week 48', version: 2 });

    await save(owner, first.id, { title: 'Week 48 (final)', version: 2 }); // title only keeps the content
    await newNote(owner, { title: 'Week 49' });
    const list = (await (await call(owner, 'GET', '/notes')).json()) as { notes: { title: string; snippet: string }[]; hasMore: boolean };
    expect(list.notes.map((n) => n.title)).toEqual(['Week 49', 'Week 48 (final)']);
    expect(list.notes[1]?.snippet).toBe('Shipped the retry queue. · On leave Friday'); // " · " between paragraphs
    expect(list.hasMore).toBe(false);
    const found = (await (await call(owner, 'GET', '/notes?q=RETRY')).json()) as { notes: { title: string }[] };
    expect(found.notes.map((n) => n.title)).toEqual(['Week 48 (final)']);
  });

  it('tags sections with my projects: each project page shows its sections, newest note first', async () => {
    const owner = await person('Budi Sections');
    const checkout = await project(owner, 'Checkout');
    const payments = await project(owner, 'Payments');
    const week48 = await newNote(owner, { title: 'Week 48' });
    const res = await save(owner, week48.id, {
      version: 1,
      content: doc(
        para('General: on leave Friday.'),
        section(checkout, para('Shipped saved cards.')),
        section(payments, para('Fixed the retry bug.'), para('Next: refunds.')),
        section(checkout, para('Started the audit.')),
      ),
    });
    expect(res.status).toBe(200);
    const reopened = await getNote(owner, week48.id);
    expect(reopened.projects.map((p) => p.name)).toEqual(['Checkout', 'Payments']);

    // From a project page: "Write an update" starts a note with that project's section.
    const week49 = await newNote(owner, { title: 'Week 49', projectId: payments });
    expect(week49.content).toEqual(doc(section(payments, { type: 'paragraph' })));
    // Nothing written in it yet: not an update (and not counted) until it has some text.
    expect((await updates(owner, payments)).updates.map((u) => u.noteTitle)).toEqual(['Week 48']);
    await save(owner, week49.id, { version: 1, content: doc(section(payments, para('Refunds live.'))) });

    const forPayments = await updates(owner, payments);
    expect(forPayments.updates.map((u) => [u.noteTitle, u.position])).toEqual([['Week 49', 0], ['Week 48', 1]]);
    expect(forPayments.updates[1]?.content).toEqual(doc(para('Fixed the retry bug.'), para('Next: refunds.')));
    const forCheckout = await updates(owner, checkout);
    expect(forCheckout.updates.map((u) => [u.noteTitle, u.position])).toEqual([['Week 48', 0], ['Week 48', 2]]);

    const listed = (await (await call(owner, 'GET', '/projects?sort=name')).json()) as {
      projects: { name: string; updateCount: number; lastUpdateAt: string | null }[];
    };
    expect(listed.projects.map((p) => [p.name, p.updateCount])).toEqual([['Checkout', 1], ['Payments', 2]]);

    // Untagging a section on the next save takes it off the project page; the text stays in the note.
    await save(owner, week48.id, {
      version: 2,
      content: doc(para('General: on leave Friday.'), section(null, para('Shipped saved cards.')), section(payments, para('Fixed it.'))),
    });
    expect((await updates(owner, checkout)).updates).toEqual([]);
    expect(JSON.stringify((await getNote(owner, week48.id)).content)).toContain('Shipped saved cards.');
  });

  it("never tags someone else's project, and an archived project gets no new sections", async () => {
    const owner = await person('Cici Owner');
    const other = await person('Dodi Other');
    const mine = await project(owner, 'Mine');
    const old = await project(owner, 'Old work');
    const theirs = await project(other, 'Theirs');
    const note = await newNote(owner);
    await save(owner, note.id, { version: 1, content: doc(section(old, para('Kept.'))) });
    await call(owner, 'PATCH', `/projects/${old}`, { status: 'archived' });

    await save(owner, note.id, {
      version: 2,
      content: doc(section(theirs, para('Sneaky.')), section(old, para('Kept.')), section(mine, para('Fine.'))),
    });
    const after = await getNote(owner, note.id);
    expect(after.content.content?.[0]).toEqual({ type: 'projectSection', content: [para('Sneaky.')] }); // tag removed
    expect(after.projects.map((p) => p.name)).toEqual(['Old work', 'Mine']); // archived keeps its section
    expect((await updates(other, theirs)).updates).toEqual([]);

    // Its part is frozen (owner, 2026-11-25): it may move, but not change, lose its tag or go.
    const frozen = section(old, para('Kept.'));
    for (const content of [
      doc(section(mine, para('Fine.')), section(old, para('Kept, edited.'))), // its text changed
      doc(section(mine, para('Fine.')), section(mine, para('Kept.'))), // moved to another project
      doc(section(mine, para('Fine.')), { type: 'projectSection', content: [para('Kept.')] }), // untagged
      doc(section(mine, para('Fine.'))), // removed
    ]) {
      expect(await code(await save(owner, note.id, { version: 3, content }))).toBe('project_archived');
    }
    expect((await save(owner, note.id, { version: 3, content: doc(section(mine, para('Fine, more.')), frozen) })).status).toBe(200);
    expect((await updates(owner, old)).updates.map((u) => u.content)).toEqual([doc(para('Kept.'))]);

    // A new section for the archived project in another note is not tagged.
    const second = await newNote(owner);
    await save(owner, second.id, { version: 1, content: doc(section(old, para('New for old.'))) });
    expect((await getNote(owner, second.id)).projects).toEqual([]);
    expect(await code(await call(owner, 'POST', '/notes', { projectId: old }))).toBe('project_archived');
    expect((await call(owner, 'POST', '/notes', { projectId: theirs })).status).toBe(404);
    expect((await call(other, 'GET', `/projects/${mine}/updates`)).status).toBe(404);
  });

  it('keeps notes when a project is deleted: its sections become untagged text', async () => {
    const owner = await person('Eka Delete');
    const doomed = await project(owner, 'Doomed');
    const note = await newNote(owner, { projectId: doomed });
    await save(owner, note.id, { version: 1, content: doc(section(doomed, para('Still here.'))) });
    expect((await call(owner, 'DELETE', `/projects/${doomed}`, { confirmName: 'Doomed' })).status).toBe(204);

    const kept = await getNote(owner, note.id);
    expect(kept.projects).toEqual([]);
    expect(JSON.stringify(kept.content)).toContain('Still here.');
    // The stale tag is dropped on the next save.
    expect((await save(owner, note.id, { version: kept.version, content: kept.content })).status).toBe(200);
    expect((await getNote(owner, note.id)).content.content?.[0]).toEqual({ type: 'projectSection', content: [para('Still here.')] });
  });

  it('refuses content outside the editor schema without saving anything', async () => {
    const owner = await person('Fani Schema');
    const projectId = await project(owner, 'Schema');
    const note = await newNote(owner);
    const res = await save(owner, note.id, {
      content: doc({ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'script' }] }] }),
      version: 1,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; details: { path: string }[] } };
    expect(body.error).toEqual({ code: 'validation_failed', details: [{ path: 'content.content.0.content.0.marks.0', code: 'custom' }] });
    expect(JSON.stringify(body)).not.toContain('script');

    // Sections sit at the top only: never inside each other or inside a list.
    const nested = doc(section(projectId, section(projectId, para('x'))));
    expect(await code(await save(owner, note.id, { content: nested, version: 1 }))).toBe('validation_failed');
    for (const bad of [{ version: 1 }, { title: 'x' }, { title: 'x', version: 0 }, { title: 'x', version: 1, extra: true }]) {
      expect(await code(await save(owner, note.id, bad))).toBe('validation_failed');
    }
    expect((await getNote(owner, note.id)).version).toBe(1);
    expect(await code(await call(owner, 'GET', '/notes?offset=-1'))).toBe('validation_failed');
  });

  it('shows notes to their owner only', async () => {
    const owner = await person('Gita Owner');
    const other = await person('Hadi Other');
    const note = await newNote(owner);
    for (const [method, route, body] of [
      ['GET', `/notes/${note.id}`],
      ['PATCH', `/notes/${note.id}`, { title: 'Mine', version: 1 }],
      ['DELETE', `/notes/${note.id}`],
    ] as [string, string, unknown?][]) {
      expect((await call(other, method, route, body)).status).toBe(404);
    }
    expect((await upload(other, note.id, PNG)).status).toBe(404);
    expect(((await (await call(other, 'GET', '/notes')).json()) as { notes: unknown[] }).notes).toEqual([]);
  });

  it('stores images checked by signature and serves them to the owner only', async () => {
    const owner = await person('Indah Images');
    const other = await person('Joko Peek');
    const note = await newNote(owner);

    // The browser-sent type does not matter: the bytes decide.
    const res = await upload(owner, note.id, PNG, 'application/octet-stream');
    expect(res.status).toBe(201);
    const { attachment } = (await res.json()) as { attachment: { id: string; url: string; mimeType: string; sizeBytes: number } };
    expect(attachment).toEqual({ id: attachment.id, url: `/api/attachments/${attachment.id}`, mimeType: 'image/png', sizeBytes: PNG.length });

    const image = await fetch(`${app.url}${attachment.url}`, { headers: { cookie: owner.cookie } });
    expect(image.status).toBe(200);
    expect(image.headers.get('content-type')).toBe('image/png');
    expect(image.headers.get('x-content-type-options')).toBe('nosniff');
    // Kept by the browser but checked again before each use (access can end); unchanged answers 304 without the bytes.
    expect(image.headers.get('cache-control')).toBe('private, no-cache');
    expect(image.headers.get('etag')).toBe(`"${attachment.id}"`);
    expect(Buffer.from(await image.arrayBuffer()).equals(PNG)).toBe(true);
    const again = await fetch(`${app.url}${attachment.url}`, { headers: { cookie: owner.cookie, 'if-none-match': `"${attachment.id}"` } });
    expect(again.status).toBe(304);
    const stranger = await fetch(`${app.url}${attachment.url}`, { headers: { cookie: other.cookie, 'if-none-match': `"${attachment.id}"` } });
    expect(stranger.status).toBe(404); // the check comes first
    expect((await fetch(`${app.url}${attachment.url}`, { headers: { cookie: other.cookie } })).status).toBe(404);
    expect((await fetch(`${app.url}${attachment.url}`)).status).toBe(401);

    const withImage = doc({ type: 'image', attrs: { src: attachment.url, alt: 'Chart' } });
    expect((await save(owner, note.id, { content: withImage, version: 1 })).status).toBe(200);

    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect(await code(await upload(owner, note.id, svg, 'image/png'))).toBe('invalid_image');
    expect(await code(await upload(owner, note.id, Buffer.alloc(0)))).toBe('invalid_image'); // an empty file is no image
    const tooBig = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]);
    expect(await code(await upload(owner, note.id, tooBig))).toBe('too_large');
    expect(await files()).toBe(1);
  });

  it('deletes the image files with their note, and keeps them when a project is deleted', async () => {
    const owner = await person('Kiki Cleanup');
    const projectId = await project(owner, 'Cleanup');
    const kept = await newNote(owner, { projectId });
    const dropped = await newNote(owner);
    const before = await files();
    await upload(owner, kept.id, PNG);
    await upload(owner, dropped.id, PNG);
    await upload(owner, dropped.id, PNG);
    expect(await files()).toBe(before + 3);

    expect((await call(owner, 'DELETE', `/notes/${dropped.id}`)).status).toBe(204);
    expect((await call(owner, 'GET', `/notes/${dropped.id}`)).status).toBe(404);
    expect(await files()).toBe(before + 1);

    expect((await call(owner, 'DELETE', `/projects/${projectId}`, { confirmName: 'Cleanup' })).status).toBe(204);
    expect(await files()).toBe(before + 1); // the note and its image stay
    expect((await call(owner, 'GET', `/notes/${kept.id}`)).status).toBe(200);
  });

  it('filters, sorts and counts my notes on the server, page by page', async () => {
    const owner = await person('Lina Filters');
    const alpha = await project(owner, 'Alpha');
    const beta = await project(owner, 'Beta');
    const a = await newNote(owner, { title: 'Week 1' });
    expect((await save(owner, a.id, { content: doc(section(alpha, para('Alpha work'))), version: 1 })).status).toBe(200);
    const b = await newNote(owner, { title: 'Week 2' });
    expect((await save(owner, b.id, { content: doc(section(beta, para('Beta work')), para('loose text')), version: 1 })).status).toBe(200);
    const c = await newNote(owner, { title: 'Week 3' });
    expect((await save(owner, c.id, { content: doc(para('Nothing tagged')), version: 1 })).status).toBe(200);
    // Written on different days, Indonesia time: Week 3 at 23:30 on 1 November there (16:30 UTC).
    const written = 'UPDATE notes SET created_at = $2 WHERE id = $1';
    await pool.query(written, [a.id, '2026-10-01T03:00:00Z']);
    await pool.query(written, [b.id, '2026-10-15T03:00:00Z']);
    await pool.query(written, [c.id, '2026-11-01T16:30:00Z']);
    expect((await save(owner, a.id, { title: 'Week 1 (edited)', version: 2 })).status).toBe(200); // saved last

    type Page = { notes: { title: string }[]; hasMore: boolean; total: number };
    const list = async (query = '') => (await (await call(owner, 'GET', `/notes${query}`)).json()) as Page;
    const titles = async (query = '') => (await list(query)).notes.map((n) => n.title);

    expect(await titles()).toEqual(['Week 3', 'Week 2', 'Week 1 (edited)']);
    expect(await titles('?sort=oldest')).toEqual(['Week 1 (edited)', 'Week 2', 'Week 3']);
    expect(await titles('?sort=edited')).toEqual(['Week 1 (edited)', 'Week 3', 'Week 2']);
    expect(await titles(`?project=${alpha}`)).toEqual(['Week 1 (edited)']);
    expect(await titles('?project=none')).toEqual(['Week 3']);
    expect(await titles(`?q=work&project=${beta}`)).toEqual(['Week 2']);
    expect(await titles('?from=2026-10-15&to=2026-11-01')).toEqual(['Week 3', 'Week 2']); // `to` takes its whole day
    expect(await titles('?to=2026-10-31')).toEqual(['Week 2', 'Week 1 (edited)']);
    expect(await titles('?from=2026-11-02')).toEqual([]);
    expect(await titles('?shared=no')).toHaveLength(3);
    expect(await titles('?shared=yes')).toEqual([]);

    // Pages: the total is the same on each; one row more than the page tells whether more follow.
    const first = await list('?limit=2');
    expect(first).toMatchObject({ total: 3, hasMore: true });
    expect(first.notes.map((n) => n.title)).toEqual(['Week 3', 'Week 2']);
    const second = await list('?limit=2&offset=2');
    expect(second).toMatchObject({ total: 3, hasMore: false });
    expect(second.notes.map((n) => n.title)).toEqual(['Week 1 (edited)']);
    expect(await list('?offset=30')).toEqual({ notes: [], hasMore: false, total: 3 });

    for (const bad of ['?sort=title', '?from=2026-11-02&to=2026-11-01', '?from=2026-02-30', '?project=abc', '?team=abc', '?shared=maybe', '?limit=0', '?limit=51']) {
      const res = await call(owner, 'GET', `/notes${bad}`);
      expect([bad, res.status]).toEqual([bad, 400]);
      expect(await code(res)).toBe('validation_failed');
    }
  });

  it('copies a note: its text, project parts and its own images; the copy outlives the original', async () => {
    const owner = await person('Mira Copy');
    const other = await person('Nino Nosy');
    const kept = await project(owner, 'Kept');
    const old = await project(owner, 'Old');
    const note = await newNote(owner, { title: 'Week 47' });
    const { attachment } = (await (await upload(owner, note.id, PNG)).json()) as { attachment: { url: string } };
    expect((await upload(owner, note.id, PNG)).status).toBe(201); // stored, but no longer in the text: not copied
    const image = { type: 'image', attrs: { src: attachment.url, alt: 'Chart' } };
    const content = doc(section(kept, para('Kept work')), section(old, para('Old work')), image);
    expect((await save(owner, note.id, { content, version: 1 })).status).toBe(200);
    expect((await call(owner, 'PATCH', `/projects/${old}`, { status: 'archived' })).status).toBe(200);
    const before = await files();

    const res = await call(owner, 'POST', `/notes/${note.id}/copy`, { title: 'Copy of Week 47' });
    expect(res.status).toBe(201);
    const copy = ((await res.json()) as { note: Note & { meetings: unknown[] } }).note;
    expect(copy.id).not.toBe(note.id);
    expect(copy).toMatchObject({ title: 'Copy of Week 47', version: 1, meetings: [], projects: [{ id: kept, name: 'Kept', status: 'active' }] });
    // The archived project's part is left out of the copy (owner, 2026-11-25; it used to come across untagged).
    expect(copy.content.content?.map((n) => n.attrs?.projectId ?? null)).toEqual([kept, null]);
    expect(JSON.stringify(copy.content)).not.toContain('Old work');
    const src = copy.content.content?.[1]?.attrs?.src as string;
    expect(src).toMatch(/^\/api\/attachments\/[0-9a-f-]{36}$/);
    expect(src).not.toBe(attachment.url);
    expect(await files()).toBe(before + 1);
    expect((await updates(owner, kept)).updates.map((u) => u.noteId).sort()).toEqual([note.id, copy.id].sort());

    // Without a title, the copy keeps the note's.
    const same = await call(owner, 'POST', `/notes/${note.id}/copy`, {});
    expect(((await same.json()) as { note: Note }).note.title).toBe('Week 47');

    // Deleting the original keeps the copy's picture.
    expect((await call(owner, 'DELETE', `/notes/${note.id}`)).status).toBe(204);
    const picture = await fetch(`${app.url}${src}`, { headers: { cookie: owner.cookie } });
    expect(picture.status).toBe(200);
    expect(Buffer.from(await picture.arrayBuffer()).equals(PNG)).toBe(true);
    expect((await fetch(`${app.url}${src}`, { headers: { cookie: other.cookie } })).status).toBe(404);

    expect(await code(await call(other, 'POST', `/notes/${copy.id}/copy`, {}))).toBe('not_found');
    expect(await code(await call(owner, 'POST', `/notes/${note.id}/copy`, {}))).toBe('not_found');
    expect(await code(await call(owner, 'POST', `/notes/${copy.id}/copy`, { title: 'x'.repeat(201) }))).toBe('validation_failed');
    expect(await code(await call(owner, 'POST', `/notes/${copy.id}/copy`, { content: doc() }))).toBe('validation_failed');
  });

  it("copies pictures of my other notes into a note (a pasted section), never someone else's", async () => {
    const owner = await person('Rina Paste');
    const other = await person('Sigit Other');
    const from = await newNote(owner, { title: 'Last week' });
    const into = await newNote(owner, { title: 'This week' });
    const theirs = await newNote(other);
    type Uploaded = { attachment: { id: string; url: string } };
    const picture = async (who: Person, noteId: string) => ((await (await upload(who, noteId, PNG)).json()) as Uploaded).attachment;
    const a = await picture(owner, from.id);
    const b = await picture(owner, from.id);
    const own = await picture(owner, into.id);
    const foreign = await picture(other, theirs.id);
    const before = await files();

    const copy = (who: Person, noteId: string, attachmentIds: string[]) =>
      call(who, 'POST', `/notes/${noteId}/attachments/copy`, { attachmentIds });
    const res = await copy(owner, into.id, [a.id, b.id, a.id, own.id, foreign.id]);
    expect(res.status).toBe(200);
    const { attachments } = (await res.json()) as { attachments: { from: string; id: string; url: string }[] };
    // Each of mine once; one already in this note answers itself; someone else's is left out.
    expect(attachments.map((x) => x.from).sort()).toEqual([a.id, b.id, own.id].sort());
    expect(attachments.find((x) => x.from === own.id)?.id).toBe(own.id);
    const copied = attachments.filter((x) => x.from !== own.id);
    expect(copied.every((x) => x.id !== x.from && x.url === `/api/attachments/${x.id}`)).toBe(true);
    expect(await files()).toBe(before + 2);

    // The copies belong to the new note: they stay when the old note is deleted.
    expect((await call(owner, 'DELETE', `/notes/${from.id}`)).status).toBe(204);
    for (const x of copied) {
      const image = await fetch(`${app.url}${x.url}`, { headers: { cookie: owner.cookie } });
      expect(image.status).toBe(200);
      expect(Buffer.from(await image.arrayBuffer()).equals(PNG)).toBe(true);
    }

    expect(await code(await copy(other, into.id, [own.id]))).toBe('not_found'); // not their note
    expect(await code(await copy(owner, into.id, []))).toBe('validation_failed');
    expect(await code(await copy(owner, into.id, ['not-an-id']))).toBe('validation_failed');
    // At most 100 pictures in a note.
    await pool.query(
      `INSERT INTO attachments (note_id, storage_key, mime_type, size_bytes)
       SELECT $1::uuid, 'notes/' || $1::text || '/' || gen_random_uuid(), 'image/png', 1 FROM generate_series(1, 97)`,
      [into.id],
    );
    const spare = await newNote(owner);
    const c = await picture(owner, spare.id);
    const d = await picture(owner, spare.id);
    expect(await code(await copy(owner, into.id, [c.id, d.id]))).toBe('too_many_images');
  });
});
