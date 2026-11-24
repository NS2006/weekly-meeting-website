import { inflateSync } from 'node:zlib';
import { HORIZON_DAYS } from '../src/modules/meetings/types.ts';
import { ARCHIVE_DAYS } from '../src/modules/teams/types.ts';
import { addDays, todayInJakarta } from '../src/utils/dates.ts';
import { IMAGE_HEIGHT, IMAGE_WIDTH, renderImage } from '../src/database/seed/png.ts';
import { ACCOUNTS, buildScenario, isoDow, SEED_DOMAIN, type Scenario } from '../src/database/seed/scenario.ts';
import { prepare } from '../src/database/seed/write.ts';

// A Monday morning, a Wednesday afternoon, a Saturday night and New Year's Day (Indonesia time).
const MOMENTS = ['2026-11-23T02:00:00Z', '2026-11-25T08:30:00Z', '2026-11-28T15:30:00Z', '2027-01-01T01:00:00Z'];

describe.each(MOMENTS)('the development seed built at %s', (moment) => {
  const now = new Date(moment);
  let s: Scenario;
  beforeAll(() => {
    s = buildScenario({ now });
  });

  const userOf = (id: string) => s.users.find((u) => u.id === id);
  const seriesOf = (id: string) => s.series.find((x) => x.id === id);
  const memberOf = (teamId: string, userId: string) => s.members.find((m) => m.teamId === teamId && m.userId === userId);

  it('creates only the fictitious accounts: one admin, an inactive former member and a new joiner', () => {
    expect(s.users.map((u) => u.email)).toEqual(ACCOUNTS.map((a) => a.email));
    expect(s.users.every((u) => u.email.endsWith(SEED_DOMAIN))).toBe(true);
    expect(s.users.filter((u) => u.admin).map((u) => u.name)).toEqual(['Admin Test']);
    expect(s.users.filter((u) => u.status === 'inactive').map((u) => u.name)).toEqual(['Former Member', 'New Joiner']);
    for (const u of s.users) {
      expect(u.createdAt.getTime()).toBeLessThanOrEqual(now.getTime());
      if (u.lastLoginAt) expect(u.lastLoginAt.getTime()).toBeLessThanOrEqual(now.getTime());
    }
  });

  it('gives every team exactly one leader; the deleted team can still be restored', () => {
    for (const team of s.teams) {
      expect(s.members.filter((m) => m.teamId === team.id && m.role === 'leader')).toHaveLength(1);
      expect(memberOf(team.id, team.createdBy)?.role).toBe('leader');
    }
    const archived = s.teams.filter((t) => t.archivedAt !== null);
    expect(archived.map((t) => t.name)).toEqual(['Hackathon team']);
    const age = (now.getTime() - (archived[0]?.archivedAt?.getTime() ?? 0)) / 86_400_000;
    expect(age).toBeGreaterThanOrEqual(0);
    expect(age).toBeLessThan(ARCHIVE_DAYS);
  });

  it('lays meetings out as the app would: on schedule days, through the horizon, nothing after a stop', () => {
    const today = todayInJakarta(now);
    for (const series of s.series) {
      const own = s.meetings.filter((m) => m.seriesId === series.id);
      expect(new Set(own.map((m) => m.scheduledDate)).size).toBe(own.length);
      expect(new Set(own.map((m) => m.meetingDate)).size).toBe(own.length);
      for (const m of own) {
        expect(series.daysOfWeek).toContain(isoDow(m.scheduledDate));
        if (m.status !== 'cancelled') expect(m.status).toBe(m.meetingDate < today ? 'done' : 'scheduled');
      }
      const lastDay = own.map((m) => m.scheduledDate).sort().at(-1) ?? '';
      if (series.active) {
        // The hourly job would find nothing to add.
        expect(daysAhead(today, lastDay)).toBeGreaterThan(HORIZON_DAYS - 8);
        expect(lastDay <= addDays(today, HORIZON_DAYS - 1)).toBe(true);
      } else {
        expect(series.stoppedAt).not.toBeNull();
        expect(lastDay < todayInJakarta(series.stoppedAt as Date)).toBe(true);
      }
    }
    expect(s.meetings.some((m) => m.status === 'cancelled' && m.title)).toBe(true);
    expect(s.meetings.some((m) => m.meetingDate !== m.scheduledDate)).toBe(true);
  });

  it('writes notes in the past only, with images that belong to the note', () => {
    expect(s.notes.length).toBeGreaterThan(80);
    expect(s.notes.length).toBeLessThan(250);
    for (const note of s.notes) {
      const owner = userOf(note.userId);
      expect(owner).toBeDefined();
      expect(note.createdAt.getTime()).toBeLessThanOrEqual(note.updatedAt.getTime());
      expect(note.updatedAt.getTime()).toBeLessThanOrEqual(now.getTime());
      expect(note.createdAt.getTime()).toBeGreaterThan(owner?.createdAt.getTime() ?? Infinity);
      expect(note.version).toBeGreaterThanOrEqual(1);
      for (const a of note.attachments) {
        expect(a.createdAt.getTime()).toBeGreaterThanOrEqual(note.createdAt.getTime());
        expect(a.createdAt.getTime()).toBeLessThanOrEqual(note.updatedAt.getTime());
      }
    }
    const images = s.notes.reduce((sum, n) => sum + n.attachments.length, 0);
    expect(images).toBeGreaterThan(5);
    expect(images).toBeLessThanOrEqual(32);
  });

  it('passes the editor schema, and tags only projects the writer could tag at the time', () => {
    const prepared = prepare(s); // throws on a refused document, a foreign project or a stray image
    for (const { note, sections } of prepared.notes) {
      for (const section of sections) {
        const project = s.projects.find((p) => p.id === section.projectId);
        expect(project?.userId).toBe(note.userId);
        expect(project?.createdAt.getTime()).toBeLessThanOrEqual(note.createdAt.getTime());
        if (project?.archivedAt) expect(note.createdAt.getTime()).toBeLessThan(project.archivedAt.getTime());
      }
    }
    // Most projects have updates; the newest backlog has none yet.
    const updated = new Set(prepared.notes.flatMap((n) => n.sections.map((x) => x.projectId)));
    expect(updated.size).toBeGreaterThan(s.projects.length * 0.7);
    expect(s.projects.filter((p) => p.name === 'Q1 experiments backlog' && updated.has(p.id))).toEqual([]);
    expect(prepared.files).toHaveLength(s.notes.reduce((sum, n) => sum + n.attachments.length, 0));
  });

  it('fills every meeting so far: each active member of the team wrote exactly one note for it', () => {
    const past = s.meetings.filter((m) => m.status === 'done');
    expect(past.length).toBeGreaterThan(10);
    for (const meeting of past) {
      const teamId = seriesOf(meeting.seriesId)?.teamId;
      const authors = s.notes.filter((n) => n.meetingIds.includes(meeting.id)).map((n) => n.userId);
      expect(new Set(authors).size).toBe(authors.length);
      const expected = s.members
        .filter((m) => m.teamId === teamId && userOf(m.userId)?.status === 'active' && todayInJakarta(m.addedAt) <= meeting.meetingDate)
        .map((m) => m.userId);
      expect(expected.length).toBeGreaterThan(0);
      for (const userId of expected) expect(authors).toContain(userId);
    }
  });

  it('links each note to the first meeting, not cancelled, on or after its day, of a team its writer is in', () => {
    let links = 0;
    for (const note of s.notes) {
      const day = todayInJakarta(note.createdAt);
      for (const meetingId of note.meetingIds) {
        links += 1;
        const meeting = s.meetings.find((m) => m.id === meetingId);
        const series = meeting && seriesOf(meeting.seriesId);
        expect(meeting?.status).not.toBe('cancelled');
        expect((meeting?.meetingDate ?? '') >= day).toBe(true);
        const membership = series && memberOf(series.teamId, note.userId);
        expect(membership?.addedAt.getTime()).toBeLessThanOrEqual(note.createdAt.getTime());
        const first = s.meetings.find((m) => m.seriesId === series?.id && m.status !== 'cancelled' && m.meetingDate >= day);
        expect(first?.id).toBe(meetingId);
      }
    }
    expect(links).toBeGreaterThan(s.notes.length * 0.8);
  });
});

it('builds the same notes for the same moment', () => {
  const now = new Date(MOMENTS[0] as string);
  const shape = (s: Scenario) => s.notes.map((n) => [n.title, n.createdAt.toISOString(), n.version, n.attachments.length, n.meetingIds.length]);
  expect(shape(buildScenario({ now }))).toEqual(shape(buildScenario({ now })));
});

it('draws the images as real PNG files', () => {
  const png = renderImage({ kind: 'bars', title: 'TEST', labels: ['W1', 'W2'], values: [3, 5], unit: '%' });
  expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  expect(png.readUInt32BE(16)).toBe(IMAGE_WIDTH);
  expect(png.readUInt32BE(20)).toBe(IMAGE_HEIGHT);
  // IHDR is 25 bytes from offset 8; the IDAT chunk follows.
  const idatLength = png.readUInt32BE(33);
  expect(png.subarray(37, 41).toString('ascii')).toBe('IDAT');
  const raw = inflateSync(png.subarray(41, 41 + idatLength));
  expect(raw.length).toBe((IMAGE_WIDTH * 3 + 1) * IMAGE_HEIGHT);
});

function daysAhead(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}
