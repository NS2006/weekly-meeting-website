/**
 * The team's real weekly updates as the development data set, in place of the simulated one (scenario.ts).
 *
 * The data is not in the repository: a gitignored folder (dummy_data/pir-weekly-2026-q4/) holds seed.json and the
 * pictures it names. seed.json is made by that folder's own tools from the team's Word and PDF weekly updates, with
 * the text copied exactly as written. Its shape:
 *
 *   { team: { name, description, createdAt },
 *     people: [{ key: "leader", name, email }, { key: "pir1", name, email }, …],
 *     leader: "leader", members: ["pir1", …],
 *     series: { name, daysOfWeek: [4], createdAt },
 *     projects: [{ owner: "pir1", key: "esl", name: "ESL Middleware" }, …],
 *     notes: [{ writer: "pir1", writtenAt: "2026-10-08T08:30:00+07:00", title, content }] }
 *
 * `content` is an editor document as the app stores it, except that a project section names its project by key
 * (attrs.project) and a picture names its file (attrs.file, relative to the folder). Everything else is checked by
 * write.ts `prepare`, exactly like the simulated data.
 *
 * The accounts are the team's people from the data file, and only them (no fictitious accounts in this mode), with
 * their real names and work addresses where known. The seed replaces the accounts with these addresses each time
 * (`personEmails`, seed-dev.ts), so never list an address someone uses on this machine for real work.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, normalize, isAbsolute } from 'node:path';
import { z } from 'zod';
import type { EditorDoc } from '@weekly-meeting/shared';
import { MAX_IMAGE_BYTES, MAX_IMAGES_PER_NOTE, sniffImageType } from '../../modules/attachments/types.ts';
import { HORIZON_DAYS } from '../../modules/meetings/types.ts';
import { addDays, todayInJakarta } from '../../utils/dates.ts';
import {
  at,
  isoDow,
  type Scenario,
  type SeedAttachment,
  type SeedMeeting,
  type SeedMember,
  type SeedNote,
  type SeedProject,
  type SeedSeries,
  type SeedTeam,
  type SeedUser,
} from './scenario.ts';

const moment = z.string().datetime({ offset: true }).transform((value) => new Date(value));
const key = z.string().regex(/^\w{1,40}$/);
const email = z.string().trim().toLowerCase().pipe(z.email().max(255));
const person = z.object({ key, name: z.string().trim().min(1).max(255), email, admin: z.boolean().optional() });
const people = z.array(person).min(1).max(200);

const dataSchema = z
  .object({
    team: z.object({ name: z.string().min(1).max(100), description: z.string().max(500).nullable(), createdAt: moment }),
    people,
    leader: key,
    members: z.array(key).min(1),
    series: z.object({ name: z.string().min(1).max(100), daysOfWeek: z.array(z.number().int().min(1).max(7)).min(1), createdAt: moment }),
    projects: z.array(z.object({ owner: key, key, name: z.string().min(1).max(100) })),
    notes: z.array(
      z.object({
        writer: key,
        writtenAt: moment,
        title: z.string().max(200),
        content: z.object({ type: z.literal('doc'), content: z.array(z.unknown()).min(1) }).passthrough(),
      }),
    ),
  })
  .superRefine((data, ctx) => {
    const problem = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });
    const keys = new Set<string>();
    const emails = new Set<string>();
    data.people.forEach((p, i) => {
      if (keys.has(p.key)) problem(['people', i, 'key'], 'listed twice');
      if (emails.has(p.email)) problem(['people', i, 'email'], 'listed twice');
      keys.add(p.key);
      emails.add(p.email);
    });
    // The leader and members are people, and every writer is in the team (so each note can be on its meetings).
    if (!keys.has(data.leader)) problem(['leader'], 'not one of the people');
    data.members.forEach((m, i) => {
      if (!keys.has(m)) problem(['members', i], 'not one of the people');
      if (m === data.leader) problem(['members', i], 'the leader is not also a member');
    });
    const team = new Set([data.leader, ...data.members]);
    data.projects.forEach((p, i) => keys.has(p.owner) || problem(['projects', i, 'owner'], 'not one of the people'));
    data.notes.forEach((n, i) => team.has(n.writer) || problem(['notes', i, 'writer'], 'not in the team'));
  });
export type RealData = z.input<typeof dataSchema>;

/** The folder's data file. */
export const DATA_FILE = 'seed.json';

/**
 * The addresses of the people in a data folder: the seed removes these accounts (and what they own) before it writes,
 * in either mode, like the @example.com ones, so seeding again never leaves them behind.
 */
export function personEmails({ dir, read = (path: string) => readFileSync(path) }: { dir: string; read?: (path: string) => Buffer }): string[] {
  const parsed = z.object({ people }).parse(JSON.parse(read(join(dir, DATA_FILE)).toString('utf8')));
  return parsed.people.map((p) => p.email);
}

type RawNode = { type?: unknown; attrs?: Record<string, unknown>; content?: unknown[] };
const isNode = (value: unknown): value is RawNode => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Builds the data set from a folder holding seed.json and its pictures. `read` loads a file of the folder (tests pass
 * their own). Throws on anything malformed: an unknown account or project, a picture outside the folder, missing,
 * not an image, or over the upload limit.
 */
export function buildRealScenario({
  now,
  dir,
  read = (path: string) => readFileSync(path),
}: {
  now: Date;
  dir: string;
  read?: (path: string) => Buffer;
}): Scenario {
  const data = dataSchema.parse(JSON.parse(read(join(dir, DATA_FILE)).toString('utf8')));
  const today = todayInJakarta(now);
  const notAfterNow = (m: Date): Date => (m.getTime() <= now.getTime() ? m : new Date(now.getTime() - 60_000));
  const minutesAfter = (m: Date, minutes: number) => new Date(m.getTime() + minutes * 60_000);
  const teamStart = data.team.createdAt;

  // Accounts: the team's people; each last signed in when they last wrote (else yesterday morning).
  const lastWrote = new Map<string, Date>();
  for (const note of data.notes) {
    const last = lastWrote.get(note.writer);
    if (note.writtenAt <= now && (!last || note.writtenAt > last)) lastWrote.set(note.writer, note.writtenAt);
  }
  const users: SeedUser[] = data.people.map((p, i) => ({
    id: randomUUID(),
    key: p.key,
    name: p.name,
    email: p.email,
    status: 'active',
    admin: p.admin ?? false,
    createdAt: minutesAfter(teamStart, -10 * 24 * 60 + i * 7),
    lastLoginAt: notAfterNow(lastWrote.get(p.key) ?? minutesAfter(at(addDays(today, -1), 9 * 60), i * 11)),
    deactivatedAt: null,
  }));
  const user = (personKey: string): SeedUser => users.find((u) => u.key === personKey) as SeedUser;

  // The team, its members and its schedule.
  const leader = user(data.leader);
  const team: SeedTeam = {
    id: randomUUID(),
    key: 'pir',
    name: data.team.name,
    description: data.team.description,
    createdBy: leader.id,
    createdAt: teamStart,
    archivedAt: null,
  };
  const members: SeedMember[] = [
    { teamId: team.id, userId: leader.id, role: 'leader', addedAt: teamStart, addedBy: null },
    ...data.members.map(
      (m, i): SeedMember => ({ teamId: team.id, userId: user(m).id, role: 'member', addedAt: minutesAfter(teamStart, 2 + i), addedBy: leader.id }),
    ),
  ];
  const series: SeedSeries = {
    id: randomUUID(),
    key: 'weekly',
    teamId: team.id,
    name: data.series.name,
    daysOfWeek: data.series.daysOfWeek,
    active: true,
    createdBy: leader.id,
    createdAt: data.series.createdAt,
    stoppedAt: null,
  };
  // What the app holds after the schedule was created and its job ran every hour since (as scenario.ts).
  const meetings: SeedMeeting[] = [];
  for (let day = todayInJakarta(series.createdAt); day <= addDays(today, HORIZON_DAYS - 1); day = addDays(day, 1)) {
    if (!series.daysOfWeek.includes(isoDow(day))) continue;
    const generated = at(addDays(day, 1 - HORIZON_DAYS), 5);
    meetings.push({
      id: randomUUID(),
      seriesId: series.id,
      scheduledDate: day,
      meetingDate: day,
      title: null,
      status: day < today ? 'done' : 'scheduled',
      createdAt: notAfterNow(generated > series.createdAt ? generated : series.createdAt),
    });
  }

  // Projects: each writer's own (created shortly before the first note that tags it, set below).
  const projectIds = new Map<string, string>(); // "owner/key" -> id
  const projects: SeedProject[] = data.projects.map((p) => {
    const id = randomUUID();
    if (projectIds.has(`${p.owner}/${p.key}`)) throw new Error(`project ${p.owner}/${p.key} is listed twice`);
    projectIds.set(`${p.owner}/${p.key}`, id);
    return { id, userId: user(p.owner).id, themeKey: p.key, name: p.name, description: null, status: 'active', createdAt: teamStart, updatedAt: teamStart, archivedAt: null };
  });

  // Notes: the content as written, with project keys and picture files turned into ids.
  const firstTagged = new Map<string, Date>(); // project id -> the first note that tags it
  // Notes written after `now` do not exist yet; a note from before the team existed is a mistake in the data.
  const written = data.notes.filter((raw) => raw.writtenAt <= now);
  for (const raw of written) {
    if (raw.writtenAt < teamStart) throw new Error(`a note of ${raw.writer} is dated before the team was created`);
  }
  const notes: SeedNote[] = written.map((raw) => {
    const noteId = randomUUID();
    const attachments: SeedAttachment[] = [];
    const updatedAt = notAfterNow(minutesAfter(raw.writtenAt, 20));
    const convert = (value: unknown): unknown => {
      if (!isNode(value)) return value;
      const out: RawNode & Record<string, unknown> = { ...value };
      if (value.type === 'projectSection' && value.attrs) {
        const projectId = projectIds.get(`${raw.writer}/${String(value.attrs.project)}`);
        if (!projectId) throw new Error(`a note of ${raw.writer} tags an unknown project ${String(value.attrs.project)}`);
        const first = firstTagged.get(projectId);
        if (!first || raw.writtenAt < first) firstTagged.set(projectId, raw.writtenAt);
        out.attrs = { projectId };
      } else if (value.type === 'image' && value.attrs) {
        const { file, ...rest } = value.attrs;
        const id = randomUUID();
        attachments.push({ id, data: picture(dir, String(file), read), createdAt: raw.writtenAt });
        out.attrs = { src: `/api/attachments/${id}`, ...rest };
      }
      if (Array.isArray(value.content)) out.content = value.content.map(convert);
      return out;
    };
    const content = convert(raw.content) as EditorDoc;
    if (attachments.length > MAX_IMAGES_PER_NOTE) throw new Error(`a note of ${raw.writer} has more than ${MAX_IMAGES_PER_NOTE} pictures`);
    const noteDay = todayInJakarta(raw.writtenAt);
    const meeting = meetings.find((m) => m.status !== 'cancelled' && m.meetingDate >= noteDay);
    return {
      id: noteId,
      userId: user(raw.writer).id,
      title: raw.title,
      content,
      // Saved every few minutes while it was written: longer notes have more versions.
      version: 2 + Math.min(30, Math.floor(JSON.stringify(raw.content).length / 1500)),
      createdAt: raw.writtenAt,
      updatedAt,
      meetingIds: meeting ? [meeting.id] : [],
      attachments,
    };
  });
  for (const p of projects) {
    const first = firstTagged.get(p.id);
    const created = first ? minutesAfter(first, -30) : teamStart;
    p.createdAt = p.updatedAt = created > teamStart ? created : teamStart;
  }
  notes.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return { now, today, users, teams: [team], members, series: [series], meetings, projects, notes };
}

/** A picture of the folder: a relative path inside it, a supported image type, within the upload limit. */
function picture(dir: string, file: string, read: (path: string) => Buffer): Buffer {
  const relative = normalize(file);
  if (isAbsolute(relative) || relative.startsWith('..')) throw new Error(`picture outside the data folder: ${file}`);
  const data = read(join(dir, relative));
  if (!sniffImageType(data)) throw new Error(`not a PNG, JPEG, GIF or WebP picture: ${file}`);
  if (data.length > MAX_IMAGE_BYTES) throw new Error(`picture over the upload limit: ${file}`);
  return data;
}
