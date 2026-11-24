import { isDeepStrictEqual } from 'node:util';
import { join, relative } from 'node:path';
import { HORIZON_DAYS } from '../src/modules/meetings/types.ts';
import { MAX_IMAGE_BYTES } from '../src/modules/attachments/types.ts';
import { addDays, todayInJakarta } from '../src/utils/dates.ts';
import { buildRealScenario, DATA_FILE, personEmails, type RealData } from '../src/database/seed/realData.ts';
import { isoDow } from '../src/database/seed/scenario.ts';
import { prepare } from '../src/database/seed/write.ts';

// A small, fictitious stand-in for the real data folder (the real one is gitignored and never used in tests).
const DIR = join('fixtures', 'real-seed');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('picture')]);
const GIF = Buffer.from('GIF89a-animation');
const NOW = new Date('2026-10-09T03:00:00Z'); // Friday 9 October, 10:00 in Jakarta

const section = (project: string, content: unknown[]) => ({ type: 'projectSection', attrs: { project }, content });
const text = (value: string, marks?: unknown[]) => (marks ? { type: 'text', text: value, marks } : { type: 'text', text: value });
const para = (...content: unknown[]) => ({ type: 'paragraph', content });
const picture = (file: string, width?: number) => ({ type: 'image', attrs: { file, alt: '', ...(width ? { width } : {}) } });

function sample(): RealData {
  return {
    team: { name: 'Team Sample', description: 'Weekly Update Sample – Q4', createdAt: '2026-09-24T10:00:00+07:00' },
    people: [
      { key: 'leader', name: 'Sample Leader', email: 'Sample.Leader@Company.example' },
      { key: 'pir1', name: 'Writer One', email: 'writer.one@company.example' },
      { key: 'pir2', name: 'Writer Two', email: 'writer.two@example.com' },
    ],
    leader: 'leader',
    members: ['pir1', 'pir2'],
    series: { name: 'Weekly Update', daysOfWeek: [4], createdAt: '2026-09-25T09:00:00+07:00' },
    projects: [
      { owner: 'pir1', key: 'door', name: 'Door Alarm' },
      { owner: 'pir2', key: 'door', name: 'Door Alarm' },
      { owner: 'pir2', key: 'idle', name: 'Not written about yet' },
    ],
    notes: [
      {
        writer: 'pir1',
        writtenAt: '2026-09-30T16:40:00+07:00',
        title: '25 sept – 1 Oct 2026',
        content: {
          type: 'doc',
          content: [
            para(text('Automation RnD', [{ type: 'bold' }])),
            section('door', [
              {
                type: 'orderedList',
                attrs: { start: 1, type: 'a' },
                content: [
                  { type: 'listItem', content: [para(text('Finished  trial @ WH Example ')), picture('img/door.png', 197)] },
                  { type: 'listItem', content: [para(text('Trial 2: with limit switch'), { type: 'hardBreak' }, text('next line'))] },
                ],
              },
            ]),
          ],
        },
      },
      {
        writer: 'pir2',
        writtenAt: '2026-10-01T08:30:00+07:00',
        title: '25 sept – 1 Oct 2026',
        content: {
          type: 'doc',
          content: [
            section('door', [
              para(text('Testing '), text('Link', [{ type: 'link', attrs: { href: 'https://example.com/video' } }])),
              {
                type: 'table',
                content: [
                  {
                    type: 'tableRow',
                    content: [
                      { type: 'tableCell', attrs: { colspan: 1, rowspan: 1 }, content: [picture('img/clip.gif')] },
                      { type: 'tableCell', attrs: { colspan: 1, rowspan: 1 }, content: [para(text('red', [{ type: 'textStyle', attrs: { color: '#ff0000' } }]))] },
                    ],
                  },
                ],
              },
            ]),
          ],
        },
      },
      { writer: 'pir2', writtenAt: '2026-10-02T10:00:00+07:00', title: '2 Oct – 8 Oct 2026', content: { type: 'doc', content: [para(text('Same picture again')), picture('img/door.png')] } },
      { writer: 'pir1', writtenAt: '2026-10-14T16:00:00+07:00', title: 'Not written yet', content: { type: 'doc', content: [para(text('later'))] } },
    ],
  };
}

function reader(data: unknown, extra: Record<string, Buffer> = {}) {
  const files: Record<string, Buffer> = { [DATA_FILE]: Buffer.from(JSON.stringify(data)), 'img/door.png': PNG, 'img/clip.gif': GIF, ...extra };
  return (path: string) => {
    const file = files[relative(DIR, path).replaceAll('\\', '/')];
    if (!file) throw new Error(`no file ${path}`);
    return file;
  };
}

const build = (data: unknown = sample(), extra?: Record<string, Buffer>) => buildRealScenario({ now: NOW, dir: DIR, read: reader(data, extra) });

/** The stored document with ids turned back into what the data file said, to compare with it. */
function asWritten(node: unknown, projectKey: (id: string) => string, fileOf: (id: string) => string): unknown {
  if (Array.isArray(node)) return node.map((n) => asWritten(n, projectKey, fileOf));
  if (typeof node !== 'object' || node === null) return node;
  const out: Record<string, unknown> = { ...(node as Record<string, unknown>) };
  const attrs = out.attrs as Record<string, unknown> | undefined;
  if (out.type === 'projectSection' && attrs) out.attrs = { project: projectKey(String(attrs.projectId)) };
  if (out.type === 'image' && attrs) {
    const { src, ...rest } = attrs;
    out.attrs = { file: fileOf(String(src).slice('/api/attachments/'.length)), ...rest };
  }
  if (out.content) out.content = asWritten(out.content, projectKey, fileOf);
  return out;
}

describe('the development seed from the real data folder', () => {
  it('creates exactly the people of the data file (addresses lower-cased); the leader leads, the writers are members', () => {
    const s = build();
    expect(s.users.map((u) => [u.name, u.email, u.status, u.admin])).toEqual([
      ['Sample Leader', 'sample.leader@company.example', 'active', false],
      ['Writer One', 'writer.one@company.example', 'active', false],
      ['Writer Two', 'writer.two@example.com', 'active', false],
    ]);
    expect(s.teams).toHaveLength(1);
    const [team] = s.teams;
    expect(team?.name).toBe('Team Sample');
    const roleOf = (key: string) => s.members.find((m) => m.userId === s.users.find((u) => u.key === key)?.id)?.role;
    expect(roleOf('leader')).toBe('leader');
    expect(['pir1', 'pir2'].map(roleOf)).toEqual(['member', 'member']);
    // The seed removes these accounts before it writes, in either mode.
    expect(personEmails({ dir: DIR, read: reader(sample()) })).toEqual([
      'sample.leader@company.example',
      'writer.one@company.example',
      'writer.two@example.com',
    ]);
    for (const u of s.users) {
      expect(u.createdAt.getTime()).toBeLessThanOrEqual(NOW.getTime());
      if (u.lastLoginAt) expect(u.lastLoginAt.getTime()).toBeLessThanOrEqual(NOW.getTime());
    }
  });

  it('lays the meetings out as the app would: schedule days from its start through the horizon', () => {
    const s = build();
    const today = todayInJakarta(NOW);
    expect(s.meetings[0]?.meetingDate).toBe('2026-10-01');
    for (const m of s.meetings) {
      expect(isoDow(m.meetingDate)).toBe(4);
      expect(m.status).toBe(m.meetingDate < today ? 'done' : 'scheduled');
    }
    const last = s.meetings.at(-1)?.meetingDate ?? '';
    expect(last <= addDays(today, HORIZON_DAYS - 1)).toBe(true);
    expect(last > addDays(today, HORIZON_DAYS - 8)).toBe(true);
  });

  it('stores every note exactly as written, with project keys and picture files turned into ids', () => {
    const data = sample();
    const s = build(data);
    const prepared = prepare(s); // the app's own schema check, sections and image rules
    expect(s.notes.map((n) => n.title)).toEqual(['25 sept – 1 Oct 2026', '25 sept – 1 Oct 2026', '2 Oct – 8 Oct 2026']);
    const fileOf = new Map<string, string>();
    data.notes.slice(0, 3).forEach((raw, i) => {
      const note = s.notes[i];
      const files: string[] = [];
      const walk = (n: { type?: string; attrs?: { file?: string }; content?: unknown[] }) => {
        if (n.type === 'image' && n.attrs?.file) files.push(n.attrs.file);
        (n.content ?? []).forEach((c) => walk(c as typeof n));
      };
      walk(raw.content as Parameters<typeof walk>[0]);
      note?.attachments.forEach((a, j) => fileOf.set(a.id, files[j] as string));
      const projectKey = (id: string) => s.projects.find((p) => p.id === id)?.themeKey ?? '?';
      expect(asWritten(note?.content, projectKey, (id) => fileOf.get(id) ?? '?')).toEqual(raw.content);
    });
    // Each picture is its own attachment with the file's bytes and its real type (the same file twice: two uploads).
    expect(prepared.files.map((f) => [fileOf.get(f.attachmentId), f.mimeType])).toEqual([
      ['img/door.png', 'image/png'],
      ['img/clip.gif', 'image/gif'],
      ['img/door.png', 'image/png'],
    ]);
    expect(prepared.files.every((f) => isDeepStrictEqual(f.data, f.mimeType === 'image/gif' ? GIF : PNG))).toBe(true);
    // The search copy of the text, as the app makes it (line ends trimmed there only; the note keeps them).
    expect(prepared.notes[0]?.text).toBe('Automation RnD\nFinished  trial @ WH Example\nTrial 2: with limit switch\nnext line');
  });

  it("tags each writer's own project, made before the first note that tags it", () => {
    const s = build();
    const prepared = prepare(s);
    for (const { note, sections } of prepared.notes) {
      for (const section of sections) {
        const project = s.projects.find((p) => p.id === section.projectId);
        expect(project?.userId).toBe(note.userId);
        expect(project?.createdAt.getTime()).toBeLessThanOrEqual(note.createdAt.getTime());
      }
    }
    const idle = s.projects.find((p) => p.themeKey === 'idle');
    expect(idle?.createdAt).toEqual(s.teams[0]?.createdAt);
  });

  it('links each note to the first meeting on or after its day, and leaves out notes not written yet', () => {
    const s = build();
    const dateOf = (id: string | undefined) => s.meetings.find((m) => m.id === id)?.meetingDate;
    expect(s.notes.map((n) => dateOf(n.meetingIds[0]))).toEqual(['2026-10-01', '2026-10-01', '2026-10-08']);
    for (const note of s.notes) {
      expect(note.createdAt.getTime()).toBeLessThanOrEqual(note.updatedAt.getTime());
      expect(note.updatedAt.getTime()).toBeLessThanOrEqual(NOW.getTime());
    }
  });

  it('refuses data it cannot store as written', () => {
    const withNote = (content: unknown[], writer = 'pir1') => {
      const data = sample();
      data.notes = [{ writer, writtenAt: '2026-10-05T09:00:00+07:00', title: 'x', content: { type: 'doc', content } }];
      return data;
    };
    expect(() => build(withNote([section('nope', [para(text('a'))])]))).toThrow(/unknown project/);
    expect(() => build(withNote([section('idle', [para(text('a'))])], 'pir1'))).toThrow(/unknown project/); // pir2's project
    expect(() => build(withNote([picture('../secret.png')]))).toThrow(/outside the data folder/);
    expect(() => build(withNote([picture('img/notes.txt')]), { 'img/notes.txt': Buffer.from('plain text') })).toThrow(/not a PNG/);
    const huge = Buffer.concat([PNG, Buffer.alloc(MAX_IMAGE_BYTES)]);
    expect(() => build(withNote([picture('img/huge.png')]), { 'img/huge.png': huge })).toThrow(/upload limit/);
    expect(() => build(withNote([para(text('a'))], 'stranger'))).toThrow(/not in the team/);
    const people = (change: (data: RealData) => void) => {
      const data = sample();
      change(data);
      return () => build(data);
    };
    expect(people((d) => d.people.push({ key: 'pir3', name: 'Copy', email: 'WRITER.ONE@company.example' }))).toThrow(/listed twice/);
    expect(people((d) => d.people.push({ key: 'pir1', name: 'Same key', email: 'other@company.example' }))).toThrow(/listed twice/);
    expect(people((d) => (d.people[1] as { email: string }).email = 'not an address')).toThrow();
    expect(people((d) => (d.leader = 'nobody'))).toThrow(/not one of the people/);
    expect(people((d) => d.members.push('leader'))).toThrow(/not also a member/);
    expect(people((d) => d.projects.push({ owner: 'ghost', key: 'x', name: 'X' }))).toThrow(/not one of the people/);
    const early = withNote([para(text('a'))]);
    (early.notes[0] as { writtenAt: string }).writtenAt = '2026-09-01T09:00:00+07:00';
    expect(() => build(early)).toThrow(/before the team was created/);
    // Text the editor would refuse (an empty text node) is caught by prepare, like any seed note.
    expect(() => prepare(build(withNote([para(text(''))])))).toThrow(/editor schema/);
  });
});
