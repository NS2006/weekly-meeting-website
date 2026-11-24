/**
 * The development data set, built in memory: accounts, teams, meeting schedules and their meetings, projects, notes
 * with project sections and images, and the links between notes and meetings. It is a short, dense simulation: the
 * last three weeks around today's date (Indonesia time), where every member writes a note for every meeting of their
 * teams (including the next one), so each meeting board is full. Nothing here touches the database; seed-dev.ts
 * writes the result.
 *
 * The story:
 * - Squad A (led by PIR Leader; PIR 1–5 and a former member) meets on Wednesday and Friday ("Weekly sync").
 *   Former Member left (deactivated) after the first week; PIR 5 joined in the second.
 * - Squad B (led by PIR 6; PIR 7–10) has a Monday stand-up and a Thursday demo. Its Friday retro was stopped last week.
 * - Platform Guild (led by PIR 3; PIR 1, 7, 9) meets on Tuesday about design tokens and observability.
 * - Hackathon team (led by PIR Leader; PIR 2, 8) ran check-ins for two weeks and was deleted (archived) four days
 *   ago, so its leader can still restore it.
 * - Design review (led by PIR 10; PIR 4) is new and has no schedule yet.
 * - Every member writes one note for each meeting of their teams that is not cancelled, from the day after the
 *   previous meeting up to the meeting's morning (the next meeting: up to now). Sync and stand-up notes are progress
 *   updates (a sentence for one project, or sections with lists, tables, code, quotes, links and screenshots); demo,
 *   guild, hackathon and retro notes are shorter and about that meeting. Each note is linked to the meeting it was
 *   written for (PRD 8.4: the first meeting of the series, not cancelled, on or after the note's day).
 * - Admin Test is the website admin; New Joiner signed in two days ago and waits for activation.
 *
 * All names, emails and texts are fictitious (example.com is reserved for documentation).
 */
import { randomUUID } from 'node:crypto';
import type { EditorDoc } from '@weekly-meeting/shared';
import { HORIZON_DAYS } from '../../modules/meetings/types.ts';
import { addDays, todayInJakarta } from '../../utils/dates.ts';
import {
  aligned,
  bold,
  bulletList,
  code,
  codeBlock,
  colored,
  divider,
  heading,
  image,
  italic,
  link,
  orderedList,
  paragraph,
  quote,
  section,
  strike,
  table,
  TEXT_COLOR,
  type Block,
  type Inline,
} from './docs.ts';
import type { ImageSpec } from './png.ts';
import { Deck, Random } from './random.ts';
import { AGENDA_ITEMS, GENERAL_LINES, THEMES, type Theme } from './themes.ts';

export const SEED_DOMAIN = '@example.com';
/** Weeks of history before the current week. */
export const HISTORY_WEEKS = 3;
/** Images are kept to about this many, so the seed stays quick and the uploads folder small. */
const IMAGE_BUDGET = 32;

// --- the result ---------------------------------------------------------------------------------------------------

export interface SeedUser {
  id: string;
  key: string;
  name: string;
  email: string;
  status: 'active' | 'inactive';
  admin: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
  /** When an admin deactivated them (the former member); null otherwise. */
  deactivatedAt: Date | null;
}

export interface SeedTeam {
  id: string;
  key: string;
  name: string;
  description: string | null;
  createdBy: string;
  createdAt: Date;
  archivedAt: Date | null;
}

export interface SeedMember {
  teamId: string;
  userId: string;
  role: 'leader' | 'member';
  addedAt: Date;
  addedBy: string | null;
}

export interface SeedSeries {
  id: string;
  key: string;
  teamId: string;
  name: string;
  daysOfWeek: number[];
  active: boolean;
  createdBy: string;
  createdAt: Date;
  /** When a stopped series was stopped (not stored; its meetings end the day before). */
  stoppedAt: Date | null;
}

export interface SeedMeeting {
  id: string;
  seriesId: string;
  scheduledDate: string;
  meetingDate: string;
  title: string | null;
  status: 'scheduled' | 'cancelled' | 'done';
  createdAt: Date;
}

export interface SeedProject {
  id: string;
  userId: string;
  themeKey: string;
  name: string;
  description: string | null;
  status: 'active' | 'archived';
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}

/** A picture: drawn from `spec` (the simulated data) or given as a file's bytes (realData.ts). */
export type SeedAttachment = { id: string; createdAt: Date } & ({ spec: ImageSpec } | { data: Buffer });

export interface SeedNote {
  id: string;
  userId: string;
  title: string;
  content: EditorDoc;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  meetingIds: string[];
  attachments: SeedAttachment[];
}

export interface Scenario {
  now: Date;
  today: string;
  users: SeedUser[];
  teams: SeedTeam[];
  members: SeedMember[];
  series: SeedSeries[];
  meetings: SeedMeeting[];
  projects: SeedProject[];
  notes: SeedNote[];
}

// --- accounts -----------------------------------------------------------------------------------------------------

interface AccountDef {
  key: string;
  name: string;
  email: string;
  admin?: boolean;
  inactive?: boolean;
}

/** The dummy accounts (frontend/src/utils/testAccounts.ts lists the same ones for the quick sign-in). */
export const ACCOUNTS: readonly AccountDef[] = [
  { key: 'admin', name: 'Admin Test', email: `admin.test${SEED_DOMAIN}`, admin: true },
  { key: 'leader', name: 'PIR Leader', email: `pir.leader${SEED_DOMAIN}` },
  ...Array.from({ length: 10 }, (_, i) => ({ key: `pir${i + 1}`, name: `PIR ${i + 1}`, email: `pir.${i + 1}${SEED_DOMAIN}` })),
  { key: 'former', name: 'Former Member', email: `former.member${SEED_DOMAIN}`, inactive: true },
  { key: 'joiner', name: 'New Joiner', email: `new.joiner${SEED_DOMAIN}`, inactive: true },
];

// --- calendar helpers (dates are 'YYYY-MM-DD' in Indonesia time) ----------------------------------------------------

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** ISO weekday: Monday = 1 … Sunday = 7. */
export const isoDow = (date: string): number => ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

/** ISO week number. */
export function isoWeek(date: string): number {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
}

/** The moment `minutes` after midnight of `date` in Indonesia (UTC+7). */
export const at = (date: string, minutes: number): Date => new Date(Date.parse(`${date}T00:00:00+07:00`) + minutes * 60_000);

const dayOf = (moment: Date): string => todayInJakarta(moment);
const daysBetween = (from: string, to: string): number => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
const shortDate = (date: string): string => `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;
const weekdayName = (date: string): string => WEEKDAYS[isoDow(date) - 1] as string;
/** The working day before `date` (Friday for a Monday). */
const previousWorkday = (date: string): string => addDays(date, isoDow(date) === 1 ? -3 : isoDow(date) === 7 ? -2 : -1);
const hm = (hours: number, minutes = 0) => hours * 60 + minutes;
const later = (a: Date, b: Date): Date => (a > b ? a : b);
const minutesAfter = (moment: Date, minutes: number): Date => new Date(moment.getTime() + minutes * 60_000);

// --- what each person works on --------------------------------------------------------------------------------------

interface WorkDef {
  theme: string;
  /** How often it comes up in their notes (0: never). */
  weight: number;
  /** Created on this day (default: when the person started). */
  from?: string;
  /** No new sections after this day (the project stays active unless archived). */
  until?: string;
  archivedAt?: Date;
}

/** Title formats a person uses for their sync or stand-up notes. */
type TitleFormat = (meeting: string) => string;

/** The kind of note each schedule gets. */
type SlotKind = 'regular' | 'demo' | 'guild' | 'checkin' | 'retro';
const KIND_OF: Record<string, SlotKind> = { sync: 'regular', standup: 'regular', demo: 'demo', guild: 'guild', checkin: 'checkin', retro: 'retro' };

/** The team leaders who put an agenda at the top of their sync or stand-up notes. */
const AGENDA_WRITERS = new Set(['leader', 'pir6']);

const RETRO_WENT_WELL = [
  'Demo day went smoothly.',
  'Code reviews were quicker this week.',
  'Good pairing on the tricky bugs.',
  'The release went out without a rollback.',
  'Fewer meetings, more focus time.',
];
const RETRO_TO_IMPROVE = [
  'Tickets were too big; split them before the sprint starts.',
  'Flaky tests slowed the pipeline down.',
  'Write the release notes earlier.',
  'Agree on the review owner for each pull request.',
];

// --- building -----------------------------------------------------------------------------------------------------

export function buildScenario({ now }: { now: Date }): Scenario {
  const today = dayOf(now);
  const monday = addDays(today, 1 - isoDow(today));
  const start = addDays(monday, -7 * HISTORY_WEEKS);
  const week = (offset: number, dow: number) => addDays(monday, offset * 7 + dow - 1);
  const random = (label: string) => new Random(`weekly-meeting-seed:${label}`);
  const notAfterNow = (moment: Date): Date => (moment.getTime() <= now.getTime() ? moment : new Date(now.getTime() - 60_000));

  // Key days of the story.
  // Every schedule starts on the first Monday of the period (`start`), so each meeting has its whole team writing.
  const scheduleStart = at(start, hm(8));
  const joinDay = week(-2, 1); // PIR 5 joins Squad A
  const formerLastDay = week(-3, 5); // Former Member's last day
  const hackathonEnd = week(-2, 5);
  const designReviewStart = addDays(today, -6);

  // Users ---------------------------------------------------------------------------------------------------------
  const users: SeedUser[] = ACCOUNTS.map((account) => {
    const r = random(`user:${account.key}`);
    const createdAt = at(addDays(start, account.key === 'admin' ? -14 : -10), hm(r.int(8, 16), r.int(0, 59)));
    return {
      id: randomUUID(),
      key: account.key,
      name: account.name,
      email: account.email,
      status: account.inactive ? 'inactive' : 'active',
      admin: account.admin ?? false,
      createdAt,
      lastLoginAt: notAfterNow(at(addDays(today, -r.int(0, 2)), hm(r.int(8, 17), r.int(0, 59)))),
      deactivatedAt: null,
    };
  });
  const user = (key: string): SeedUser => {
    const found = users.find((u) => u.key === key);
    if (!found) throw new Error(`unknown account ${key}`);
    return found;
  };
  user('former').lastLoginAt = at(formerLastDay, hm(17, 40));
  // Deactivated after their last day, and not back since: not waiting for access (the new joiner is).
  user('former').deactivatedAt = at(formerLastDay, hm(18, 5));
  const joiner = user('joiner');
  joiner.createdAt = notAfterNow(at(addDays(today, -2), hm(10, 12)));
  joiner.lastLoginAt = joiner.createdAt;

  // Teams and members ---------------------------------------------------------------------------------------------
  const teams: SeedTeam[] = [];
  const members: SeedMember[] = [];
  const team = (key: string): SeedTeam => {
    const found = teams.find((t) => t.key === key);
    if (!found) throw new Error(`unknown team ${key}`);
    return found;
  };
  const addTeam = (def: {
    key: string;
    name: string;
    description: string | null;
    leader: string;
    createdAt: Date;
    archivedAt?: Date;
    members: { key: string; addedAt?: Date }[];
  }) => {
    const leader = user(def.leader);
    const created: SeedTeam = {
      id: randomUUID(),
      key: def.key,
      name: def.name,
      description: def.description,
      createdBy: leader.id,
      createdAt: def.createdAt,
      archivedAt: def.archivedAt ?? null,
    };
    teams.push(created);
    members.push({ teamId: created.id, userId: leader.id, role: 'leader', addedAt: def.createdAt, addedBy: null });
    def.members.forEach((m, i) =>
      members.push({
        teamId: created.id,
        userId: user(m.key).id,
        role: 'member',
        addedAt: m.addedAt ?? minutesAfter(def.createdAt, 2 + i),
        addedBy: leader.id,
      }),
    );
  };
  addTeam({
    key: 'squadA',
    name: 'Squad A',
    description: 'Checkout, payments and seller tools.',
    leader: 'leader',
    createdAt: at(addDays(start, -3), hm(10)),
    members: [{ key: 'pir1' }, { key: 'pir2' }, { key: 'pir3' }, { key: 'pir4' }, { key: 'former' }, { key: 'pir5', addedAt: at(joinDay, hm(9, 30)) }],
  });
  addTeam({
    key: 'squadB',
    name: 'Squad B',
    description: 'Search, the support chatbot and warehouse tools.',
    leader: 'pir6',
    createdAt: at(addDays(start, -3), hm(14)),
    members: [{ key: 'pir7' }, { key: 'pir8' }, { key: 'pir9' }, { key: 'pir10' }],
  });
  addTeam({
    key: 'guild',
    name: 'Platform Guild',
    description: 'Design tokens and observability, shared across squads.',
    leader: 'pir3',
    createdAt: at(addDays(start, -3), hm(13)),
    members: [{ key: 'pir1' }, { key: 'pir7' }, { key: 'pir9' }],
  });
  addTeam({
    key: 'hackathon',
    name: 'Hackathon team',
    description: 'Two-week hackathon: a smart reorder reminder.',
    leader: 'leader',
    createdAt: at(addDays(start, -3), hm(9, 30)),
    archivedAt: notAfterNow(at(addDays(today, -4), hm(16, 20))),
    members: [{ key: 'pir2' }, { key: 'pir8' }],
  });
  addTeam({
    key: 'design',
    name: 'Design review',
    description: 'Review UI changes before they are released.',
    leader: 'pir10',
    createdAt: notAfterNow(at(designReviewStart, hm(11))),
    members: [{ key: 'pir4' }],
  });

  // Meeting schedules and meetings ----------------------------------------------------------------------------------
  const series: SeedSeries[] = [];
  const meetings: SeedMeeting[] = [];
  const addSeries = (def: { key: string; team: string; name: string; days: number[]; createdAt: Date; stoppedAt?: Date }) => {
    const owner = team(def.team);
    const created: SeedSeries = {
      id: randomUUID(),
      key: def.key,
      teamId: owner.id,
      name: def.name,
      daysOfWeek: def.days,
      active: !def.stoppedAt,
      createdBy: owner.createdBy,
      createdAt: def.createdAt,
      stoppedAt: def.stoppedAt ?? null,
    };
    series.push(created);
    // What the app holds after creating the schedule and running its job every hour since: every meeting day from
    // the creation day to HORIZON_DAYS ahead, or, for a stopped schedule, until the day before it was stopped.
    const lastDay = def.stoppedAt ? addDays(dayOf(def.stoppedAt), -1) : addDays(today, HORIZON_DAYS - 1);
    for (let day = dayOf(def.createdAt); day <= lastDay; day = addDays(day, 1)) {
      if (!def.days.includes(isoDow(day))) continue;
      meetings.push({
        id: randomUUID(),
        seriesId: created.id,
        scheduledDate: day,
        meetingDate: day,
        title: null,
        status: 'scheduled',
        createdAt: notAfterNow(later(def.createdAt, at(addDays(day, 1 - HORIZON_DAYS), hm(0, 5)))),
      });
    }
  };
  addSeries({ key: 'sync', team: 'squadA', name: 'Weekly sync', days: [3, 5], createdAt: scheduleStart });
  addSeries({ key: 'standup', team: 'squadB', name: 'Monday stand-up', days: [1], createdAt: minutesAfter(scheduleStart, 5) });
  addSeries({
    key: 'retro',
    team: 'squadB',
    name: 'Friday retro',
    days: [5],
    createdAt: minutesAfter(scheduleStart, 10),
    stoppedAt: at(week(-1, 4), hm(10)),
  });
  addSeries({ key: 'demo', team: 'squadB', name: 'Thursday demo', days: [4], createdAt: minutesAfter(scheduleStart, 15) });
  addSeries({ key: 'guild', team: 'guild', name: 'Guild meeting', days: [2], createdAt: minutesAfter(scheduleStart, 20) });
  addSeries({
    key: 'checkin',
    team: 'hackathon',
    name: 'Hackathon check-in',
    days: [2, 4],
    createdAt: minutesAfter(scheduleStart, 25),
    stoppedAt: at(hackathonEnd, hm(17)),
  });
  const seriesOf = (key: string): SeedSeries => {
    const found = series.find((s) => s.key === key);
    if (!found) throw new Error(`unknown series ${key}`);
    return found;
  };

  // Things leaders did to single meetings: titles, cancellations (the reason is the title) and moves.
  const adjust = (seriesKey: string, scheduledDate: string, change: { title?: string; cancel?: boolean; moveTo?: string }) => {
    const s = seriesOf(seriesKey);
    const meeting = meetings.find((m) => m.seriesId === s.id && m.scheduledDate === scheduledDate);
    if (!meeting) return;
    if (change.moveTo && !meetings.some((m) => m.seriesId === s.id && m.meetingDate === change.moveTo)) meeting.meetingDate = change.moveTo;
    if (change.title) meeting.title = change.title;
    if (change.cancel) meeting.status = 'cancelled';
  };
  adjust('sync', week(-2, 5), { cancel: true, title: 'Team offsite' });
  adjust('sync', week(-1, 5), { title: 'Sprint 23 review' });
  adjust('sync', week(1, 3), { title: 'Q1 planning' });
  adjust('sync', week(1, 5), { cancel: true, title: 'Company town hall' });
  adjust('standup', week(-2, 1), { moveTo: week(-2, 2) });
  adjust('demo', week(1, 4), { moveTo: week(1, 3), title: 'Demo day: search v2' });
  adjust('guild', week(-1, 2), { cancel: true, title: 'Most of the guild is at the vendor workshop' });
  for (const meeting of meetings) {
    if (meeting.status !== 'cancelled') meeting.status = meeting.meetingDate < today ? 'done' : 'scheduled';
  }
  meetings.sort((a, b) => a.meetingDate.localeCompare(b.meetingDate) || a.seriesId.localeCompare(b.seriesId));

  /** PRD 8.4: a note gathers on the first meeting of the series, not cancelled, on or after the note's day. */
  const meetingFor = (seriesKey: string, noteDay: string): SeedMeeting | undefined => {
    const s = seriesOf(seriesKey);
    return meetings.find((m) => m.seriesId === s.id && m.status !== 'cancelled' && m.meetingDate >= noteDay);
  };

  // Projects --------------------------------------------------------------------------------------------------------
  const hackathonArchived = notAfterNow(at(addDays(today, -4), hm(17)));
  const couponsArchived = at(week(-1, 1), hm(11));
  const WORK: Record<string, WorkDef[]> = {
    leader: [
      { theme: 'roadmapA', weight: 3 },
      { theme: 'checkout', weight: 2 },
      { theme: 'hackathon', weight: 1.5, from: start, until: hackathonEnd, archivedAt: hackathonArchived },
    ],
    pir1: [
      { theme: 'checkout', weight: 3 },
      { theme: 'payments', weight: 2 },
      { theme: 'tokens', weight: 1.5 },
    ],
    pir2: [
      { theme: 'seller', weight: 3 },
      { theme: 'admin', weight: 2 },
      { theme: 'coupons', weight: 1.5, until: dayOf(couponsArchived), archivedAt: couponsArchived },
      { theme: 'hackathon', weight: 1.5, from: start, until: hackathonEnd, archivedAt: hackathonArchived },
    ],
    pir3: [
      { theme: 'observability', weight: 3 },
      { theme: 'pipeline', weight: 2 },
      { theme: 'payments', weight: 1.5 },
    ],
    pir4: [
      { theme: 'mobile', weight: 3 },
      { theme: 'checkout', weight: 1.5 },
      { theme: 'a11y', weight: 1.5, from: designReviewStart },
    ],
    pir5: [
      { theme: 'promo', weight: 3 },
      { theme: 'loyalty', weight: 2 },
    ],
    former: [
      { theme: 'shipping', weight: 3 },
      { theme: 'promo', weight: 2 },
    ],
    pir6: [
      { theme: 'roadmapB', weight: 3 },
      { theme: 'search', weight: 2 },
      { theme: 'experiments', weight: 0, from: addDays(today, -1) },
    ],
    pir7: [
      { theme: 'search', weight: 3 },
      { theme: 'chatbot', weight: 2 },
      { theme: 'observability', weight: 1.5 },
    ],
    pir8: [
      { theme: 'warehouse', weight: 3 },
      { theme: 'hackathon', weight: 2, from: start, until: hackathonEnd, archivedAt: hackathonArchived },
    ],
    pir9: [
      { theme: 'pipeline', weight: 3 },
      { theme: 'tokens', weight: 2 },
    ],
    pir10: [
      { theme: 'chatbot', weight: 3 },
      { theme: 'shipping', weight: 1.5 },
      { theme: 'a11y', weight: 1.5, from: designReviewStart },
    ],
  };
  /** The day each person starts writing. */
  const startOf = (key: string): string => (key === 'pir5' ? joinDay : addDays(start, -2));

  const projects: SeedProject[] = [];
  const work = new Map<string, { project: SeedProject; def: WorkDef; theme: Theme }[]>();
  for (const [key, defs] of Object.entries(WORK)) {
    const owner = user(key);
    const r = random(`projects:${key}`);
    const list = defs.map((def) => {
      const theme = THEMES[def.theme];
      if (!theme) throw new Error(`unknown theme ${def.theme}`);
      const createdAt = notAfterNow(at(def.from ?? startOf(key), hm(r.int(9, 15), r.int(0, 59))));
      const project: SeedProject = {
        id: randomUUID(),
        userId: owner.id,
        themeKey: theme.key,
        name: theme.name,
        description: theme.description,
        status: def.archivedAt ? 'archived' : 'active',
        createdAt,
        updatedAt: def.archivedAt ?? createdAt,
        archivedAt: def.archivedAt ?? null,
      };
      projects.push(project);
      return { project, def, theme };
    });
    work.set(key, list);
  }
  /** The person's projects they can write about at that moment, with their weights. */
  const writableProjects = (key: string, moment: Date) =>
    (work.get(key) ?? []).filter(
      ({ project, def }) =>
        def.weight > 0 &&
        project.createdAt <= moment &&
        (def.until === undefined || dayOf(moment) <= def.until) &&
        (project.archivedAt === null || moment < project.archivedAt),
    );

  // Metrics move from start to end over the weeks, with a little noise; everyone sees the same numbers.
  const metricSeries = (theme: Theme, upTo: string): { labels: string[]; values: number[] } => {
    const metric = theme.metric;
    if (!metric) return { labels: [], values: [] };
    const labels: string[] = [];
    const values: number[] = [];
    const weeks = HISTORY_WEEKS + 1;
    for (let w = 0; w < weeks; w += 1) {
      const day = addDays(start, w * 7);
      if (day > upTo) break;
      const progress = (w / (weeks - 1)) ** 0.85;
      const noise = (random(`metric:${theme.key}:${w}`).next() - 0.5) * 0.06 * Math.abs(metric.end - metric.start);
      const value = metric.start + (metric.end - metric.start) * progress + (w === 0 ? 0 : noise);
      labels.push(`W${isoWeek(day)}`);
      values.push(Math.round(value * 10) / 10);
    }
    return { labels, values };
  };
  const formatMetric = (theme: Theme, value: number): string => {
    const unit = theme.metric?.unit ?? '';
    const precise = unit === '%' || unit === ' s';
    return `${precise ? value.toFixed(1) : Math.round(value)}${unit}`;
  };

  // Who writes, and when: every member, one note per meeting ----------------------------------------------------
  const squadATitles: TitleFormat[] = [
    (m: string) => `Update for ${weekdayName(m)} ${shortDate(m)}`,
    (m: string) => `Weekly sync – ${shortDate(m)}`,
    (m: string) => `Week ${isoWeek(m)}, ${weekdayName(m)}`,
    (m: string) => `${shortDate(m)} notes`,
  ];
  const squadBTitles: TitleFormat[] = [
    (m: string) => `Stand-up ${shortDate(m)}`,
    (m: string) => `Week ${isoWeek(m)} update`,
    (m: string) => `Monday update – ${shortDate(m)}`,
  ];
  const TITLES: Record<string, TitleFormat[]> = {
    leader: squadATitles.slice(1, 2),
    pir1: squadATitles.slice(0, 2),
    pir2: squadATitles.slice(2, 4),
    pir3: squadATitles.slice(1, 3),
    pir4: [...squadATitles.slice(0, 1), ...squadATitles.slice(3, 4)],
    pir5: squadATitles.slice(0, 1),
    former: squadATitles.slice(3, 4),
    pir6: squadBTitles.slice(1, 2),
    pir7: squadBTitles.slice(0, 2),
    pir8: squadBTitles.slice(2, 3),
    pir9: squadBTitles.slice(0, 1),
    pir10: squadBTitles.slice(1, 3),
  };
  /** The last day a person writes (the leaver), or null. */
  const lastDayOf = (key: string): string | null => (key === 'former' ? formerLastDay : null);
  /** May this member write for a meeting on `day`: added by then, and active (the leaver until their last day). */
  const writesOn = (member: SeedMember, day: string): boolean => {
    const person = users.find((u) => u.id === member.userId);
    if (!person || dayOf(member.addedAt) > day) return false;
    const last = lastDayOf(person.key);
    return last !== null ? day <= last : person.status === 'active';
  };

  interface Slot {
    key: string;
    kind: SlotKind;
    at: Date;
    /** The meeting it was written for (its title uses that meeting's date). */
    meeting: SeedMeeting;
    seriesKey: string;
  }
  const slots: Slot[] = [];
  for (const s of series) {
    const own = meetings.filter((m) => m.seriesId === s.id && m.status !== 'cancelled').sort((a, b) => a.meetingDate.localeCompare(b.meetingDate));
    const next = own.find((m) => m.meetingDate >= today);
    own.forEach((meeting, i) => {
      if (meeting.meetingDate > today && meeting !== next) return; // meetings so far, and the next one
      const previousDay = own[i - 1]?.meetingDate ?? addDays(dayOf(s.createdAt), -1);
      for (const member of members.filter((m) => m.teamId === s.teamId && writesOn(m, meeting.meetingDate))) {
        const person = users.find((u) => u.id === member.userId) as SeedUser;
        const r = random(`slot:${person.key}:${s.key}:${meeting.scheduledDate}`);
        // Written after the previous meeting (and after the schedule and the membership began)…
        const earliest = later(later(at(addDays(previousDay, 1), hm(8)), minutesAfter(s.createdAt, 5)), minutesAfter(member.addedAt, 5));
        // …usually the afternoon before, or the meeting's morning.
        const dayBefore = previousWorkday(meeting.meetingDate);
        let moment =
          r.chance(0.5) && dayBefore > previousDay
            ? at(dayBefore, hm(r.int(15, 18), r.int(0, 59)))
            : at(meeting.meetingDate, hm(r.int(7, 9), r.int(0, 59)));
        if (moment < earliest) moment = minutesAfter(earliest, r.int(5, 60));
        if (moment > now) {
          // The next meeting: written some time between the last meeting and now.
          const latest = now.getTime() - 10 * 60_000;
          if (meeting !== next || earliest.getTime() >= latest) continue;
          moment = new Date(earliest.getTime() + Math.floor(r.next() * (latest - earliest.getTime())));
        }
        const last = lastDayOf(person.key);
        if (dayOf(moment) > meeting.meetingDate || (last !== null && dayOf(moment) > last)) continue;
        slots.push({ key: person.key, kind: KIND_OF[s.key] ?? 'regular', at: moment, meeting, seriesKey: s.key });
      }
    });
  }
  slots.sort((a, b) => a.at.getTime() - b.at.getTime());

  // Notes ------------------------------------------------------------------------------------------------------------
  const notes: SeedNote[] = [];
  let imagesLeft = IMAGE_BUDGET;
  const decks = new Map<string, Deck<string>>();
  const deck = (owner: string, theme: Theme, part: 'done' | 'next' | 'blockers' | 'oneLiners'): Deck<string> | null => {
    const items = theme[part];
    if (items.length === 0) return null;
    const id = `${owner}:${theme.key}:${part}`;
    let found = decks.get(id);
    if (!found) {
      found = new Deck(items, random(`deck:${id}`));
      decks.set(id, found);
    }
    return found;
  };
  const generalDecks = new Map<string, Deck<string>>();
  const generalLine = (owner: string): string => {
    let found = generalDecks.get(owner);
    if (!found) {
      found = new Deck(GENERAL_LINES, random(`general:${owner}`));
      generalDecks.set(owner, found);
    }
    return found.draw();
  };

  /** Active teammates in the person's squad on that day (for "{mate}"). */
  const teammates = (key: string, moment: Date): string[] => {
    const squad = members.filter((m) => m.userId === user(key).id).map((m) => m.teamId)[0];
    return members
      .filter((m) => m.teamId === squad && m.userId !== user(key).id && m.addedAt <= moment)
      .map((m) => users.find((u) => u.id === m.userId))
      .filter((u): u is SeedUser => u !== undefined && (u.status === 'active' || moment < at(formerLastDay, hm(23))))
      .map((u) => u.name);
  };

  for (const slot of slots) {
    const key = slot.key;
    const owner = user(key);
    const r = random(`note:${key}:${slot.at.toISOString()}`);
    const noteDay = dayOf(slot.at);
    const noteId = randomUUID();
    const attachments: SeedAttachment[] = [];
    const mates = teammates(key, slot.at);
    const fill = (template: string, theme?: Theme): string =>
      template.replace(/\{(mate|n|nn|pct|day|ticket|metric|topic)\}/g, (_, name: string) => {
        switch (name) {
          case 'mate':
            return mates.length > 0 ? r.pick(mates) : 'the team';
          case 'n':
            return String(r.int(2, 9));
          case 'nn':
            return String(r.int(10, 60));
          case 'pct':
            return String(r.int(3, 25));
          case 'day':
            return r.pick(WEEKDAYS.slice(0, 5));
          case 'ticket':
            return `${theme?.ticket ?? 'OPS'}-${r.int(100, 480)}`;
          case 'metric': {
            if (!theme?.metric) return '';
            const { values } = metricSeries(theme, noteDay);
            return formatMetric(theme, values[values.length - 1] ?? theme.metric.start);
          }
          case 'topic':
            return r.pick(writableProjects(key, slot.at).map((w) => w.theme.name.toLowerCase()).concat(['the roadmap']));
          default:
            return '';
        }
      });
    /** A sentence as inlines: `backticks` become inline code. */
    const rich = (template: string, theme?: Theme): Inline[] =>
      fill(template, theme)
        .split('`')
        .map((part, i) => (i % 2 === 1 ? code(part) : { type: 'text', text: part }))
        .filter((part) => part.text !== '');
    const draw = (theme: Theme, part: 'done' | 'next' | 'blockers' | 'oneLiners'): string | null => deck(key, theme, part)?.draw() ?? null;
    const drawMany = (theme: Theme, part: 'done' | 'next', count: number): string[] => {
      const picked = new Set<string>();
      for (let i = 0; i < count * 2 && picked.size < count; i += 1) {
        const next = draw(theme, part);
        if (next) picked.add(next);
      }
      return [...picked];
    };
    const addImage = (theme: Theme): Block | null => {
      if (!theme.images || theme.images.length === 0 || imagesLeft <= 0) return null;
      const recipe = r.pick(theme.images);
      const { labels, values } = metricSeries(theme, noteDay);
      const attachment: SeedAttachment = {
        id: randomUUID(),
        spec: recipe.spec({ labels, values, random: r }),
        createdAt: minutesAfter(slot.at, r.int(1, 6)),
      };
      attachments.push(attachment);
      imagesLeft -= 1;
      return image(attachment.id, recipe.alt, r.chance(0.35) ? r.pick([480, 560]) : undefined);
    };
    const metricTable = (theme: Theme): Block | null => {
      if (!theme.metric) return null;
      const { labels, values } = metricSeries(theme, noteDay);
      const rows = labels.slice(-3).map((label, i, all) => {
        const value = formatMetric(theme, values.slice(-3)[i] ?? 0);
        return [label, i === all.length - 1 ? [bold(value)] : value];
      });
      return rows.length < 2 ? null : table(['Week', theme.metric.name], rows);
    };
    const milestoneTable = (theme: Theme): Block | null => {
      if (!theme.milestones) return null;
      const progress = Math.max(0, daysBetween(start, noteDay)) / (HISTORY_WEEKS * 7);
      const statusOf = (i: number) => {
        const done = progress > 0.35 + i * 0.18;
        if (done) return colored('Done', TEXT_COLOR.green, true);
        if (i === 2 && progress > 0.55) return colored('At risk', TEXT_COLOR.amber, true);
        if (progress > 0.2 + i * 0.2) return colored('On track', TEXT_COLOR.blue, true);
        return colored('Not started', TEXT_COLOR.gray);
      };
      return table(
        ['Milestone', 'Owner', 'Status'],
        theme.milestones.map((name, i) => [name, mates[i % Math.max(1, mates.length)] ?? owner.name, [statusOf(i)]]),
      );
    };

    /** The blocks of one project section, in one of a few writing styles, sometimes with something extra. */
    const sectionBody = (theme: Theme, richness: 'short' | 'normal' | 'rich'): Block[] => {
      if (richness === 'short') {
        const line = (r.chance(0.6) ? draw(theme, 'oneLiners') : null) ?? draw(theme, 'done') ?? 'Nothing new this week.';
        return [paragraph(...rich(line, theme))];
      }
      const done = drawMany(theme, 'done', r.int(1, 3));
      const next = drawMany(theme, 'next', r.int(1, 2));
      const blocks: Block[] = [];
      const style = r.weighted<'list' | 'headings' | 'prose' | 'mixed'>([
        ['list', 4],
        ['headings', 2],
        ['prose', 3],
        ['mixed', 2],
      ]);
      const doneLabel = r.chance(0.25) ? colored('Done', TEXT_COLOR.green, true) : bold('Done');
      if (style === 'list' && done.length > 0) {
        blocks.push(paragraph(doneLabel), bulletList(...done.map((s) => rich(s, theme))));
        if (next.length > 0) blocks.push(paragraph(bold('Next')), bulletList(...next.map((s) => rich(s, theme))));
      } else if (style === 'headings' && done.length > 0) {
        blocks.push(heading(3, 'Done'), bulletList(...done.map((s) => rich(s, theme))));
        if (next.length > 0) blocks.push(heading(3, 'Next'), bulletList(...next.map((s) => rich(s, theme))));
      } else if (style === 'mixed' && done.length > 1) {
        blocks.push(paragraph(...rich(done[0] as string, theme)), bulletList(...done.slice(1).map((s) => rich(s, theme))));
        if (next.length > 0) blocks.push(paragraph(italic(`Next: ${fill(next[0] as string, theme)}`)));
      } else {
        const sentences = done.length > 0 ? done : [draw(theme, 'oneLiners') ?? 'Nothing new this week.'];
        blocks.push(paragraph(...sentences.flatMap((s, i) => [...(i > 0 ? [' '] : []), ...rich(s, theme)])));
        if (next.length > 0) blocks.push(paragraph(bold('Next: '), ...rich(next[0] as string, theme)));
      }
      if (richness === 'rich') {
        const extras: [string, number][] = [
          ['blocker', theme.blockers.length > 0 ? 2 : 0],
          ['table', theme.metric || theme.milestones ? 3 : 0],
          ['image', theme.images && imagesLeft > 0 ? 5 : 0],
          ['code', theme.code ? 1.5 : 0],
          ['quote', theme.quotes ? 1 : 0],
          ['link', theme.links ? 1.5 : 0],
          ['plan', theme.next.length >= 3 ? 1 : 0],
          ['dropped', theme.next.length >= 2 ? 0.7 : 0],
        ];
        // One extra, sometimes two different ones.
        const available = extras.filter(([, weight]) => weight > 0);
        const picks: string[] = [];
        if (available.length > 0) picks.push(r.weighted(available));
        const rest = available.filter(([name]) => !picks.includes(name));
        if (rest.length > 0 && r.chance(0.35)) picks.push(r.weighted(rest));
        for (const extra of picks) switch (extra) {
          case 'blocker': {
            const blocker = draw(theme, 'blockers');
            if (blocker) {
              const amber = r.chance(0.3);
              blocks.push(
                paragraph(colored(amber ? 'At risk: ' : 'Blocked: ', amber ? TEXT_COLOR.amber : TEXT_COLOR.red, true), ...rich(blocker, theme)),
              );
            }
            break;
          }
          case 'table': {
            const t = theme.milestones ? milestoneTable(theme) : metricTable(theme);
            if (t) blocks.push(t);
            break;
          }
          case 'image': {
            const picture = addImage(theme);
            if (picture) blocks.push(picture, paragraph(italic('Screenshot from this week.')));
            break;
          }
          case 'code': {
            const snippet = r.pick(theme.code ?? []);
            blocks.push(paragraph('For reference:'), codeBlock(snippet.language, snippet.text));
            break;
          }
          case 'quote':
            blocks.push(quote(paragraph(r.pick(theme.quotes ?? []))));
            break;
          case 'link': {
            const target = r.pick(theme.links ?? []);
            blocks.push(paragraph('Details in the ', link(target.text, target.href), '.'));
            break;
          }
          case 'plan':
            blocks.push(paragraph(bold('Plan for the next two weeks')), orderedList(...r.sample(theme.next, 3).map((s) => rich(s, theme))));
            break;
          case 'dropped': {
            const [kept, dropped] = r.sample(theme.next, 2);
            if (kept && dropped) blocks.push(bulletList(rich(kept, theme), [strike(fill(dropped, theme)), ' (dropped for now)']));
            break;
          }
        }
      }
      return blocks;
    };

    const content: Block[] = [];
    let title = '';
    const options = writableProjects(key, slot.at);
    const projectFor = (theme: Theme) => options.find((w) => w.theme.key === theme.key)?.project.id ?? null;

    const date = shortDate(slot.meeting.meetingDate);
    const sectionFor = (theme: Theme, richness: 'short' | 'normal' | 'rich') => section(projectFor(theme), sectionBody(theme, richness));
    if (slot.kind === 'demo') {
      title = `Demo notes – ${date}`;
      const main = options.filter((w) => w.theme.images).sort((a, b) => b.def.weight - a.def.weight)[0] ?? options[0];
      if (!main) continue;
      const picture = addImage(main.theme) ?? metricTable(main.theme);
      content.push(
        section(main.project.id, [
          paragraph(bold('Demo: '), ...rich(draw(main.theme, 'done') ?? main.theme.name, main.theme)),
          ...(picture ? [picture] : []),
          paragraph(italic('Questions welcome after the demo.')),
        ]),
      );
    } else if (slot.kind === 'guild' || slot.kind === 'checkin') {
      // About the guild's topic or the hackathon project only.
      const topic = options.find((w) => (slot.kind === 'guild' ? w.theme.guild : w.theme.key === 'hackathon'));
      if (!topic) continue;
      title = slot.kind === 'guild' ? `Guild update – ${date}` : `Hackathon check-in – ${date}`;
      content.push(sectionFor(topic.theme, r.chance(0.4) ? 'rich' : 'normal'));
    } else if (slot.kind === 'retro') {
      title = `Retro – ${date}`;
      content.push(
        heading(3, 'Went well'),
        bulletList(...r.sample(RETRO_WENT_WELL, r.int(1, 2))),
        heading(3, 'To improve'),
        bulletList(...r.sample(RETRO_TO_IMPROVE, r.int(1, 2))),
      );
    } else {
      title = r.chance(0.06) ? '' : r.pick(TITLES[key] ?? squadATitles)(slot.meeting.meetingDate);
      // A leaver's last note says goodbye.
      const next = slots.find((other) => other.key === key && other.at > slot.at && other.kind === 'regular');
      const general: string[] = [];
      if (!next && lastDayOf(key)) general.push('My last week on this team. Handing over to the squad; thanks, everyone!');
      if (r.chance(0.3)) general.push(fill(generalLine(key)));
      const leads = AGENDA_WRITERS.has(key);
      if (leads) {
        content.push(
          heading(2, 'Agenda'),
          orderedList(...r.sample(AGENDA_ITEMS, 3).map((item) => fill(item))),
          ...(general.length > 0 ? [paragraph(general.join(' '))] : []),
        );
      } else if (general.length > 0) {
        content.push(general.length > 1 && r.chance(0.5) ? bulletList(...general) : paragraph(general.join(' ')));
      }
      const pattern = r.weighted<'short' | 'normal' | 'rich'>([
        ['short', leads ? 1 : 2],
        ['normal', 4.5],
        ['rich', 3],
      ]);
      const count = pattern === 'short' ? 1 : r.weighted([
        [1, 3],
        [2, 4.5],
        [3, 2],
      ] as const);
      const chosen: typeof options = [];
      while (chosen.length < Math.min(count, options.length)) {
        const remaining = options.filter((w) => !chosen.includes(w));
        chosen.push(r.weighted(remaining.map((w) => [w, w.def.weight] as const)));
      }
      chosen.forEach((w, i) => {
        content.push(sectionFor(w.theme, pattern === 'short' ? 'short' : pattern === 'rich' && i === 0 ? 'rich' : 'normal'));
        if (i < chosen.length - 1 && r.chance(0.05)) content.push(divider());
      });
      if (content.length === 0) content.push(paragraph('Nothing to report this time.'));
    }

    // Saved a few times while typing; some notes are edited again a day or two later.
    const blockCount = JSON.stringify(content).length;
    let version = 1 + r.int(1, 4) + Math.min(20, Math.floor(blockCount / 400));
    let updatedAt = notAfterNow(minutesAfter(slot.at, r.int(3, 45)));
    if (r.chance(0.12)) {
      const edited = at(addDays(noteDay, r.int(1, 2)), hm(r.int(9, 16), r.int(0, 59)));
      const last = lastDayOf(key);
      if (edited <= now && (last === null || dayOf(edited) <= last)) {
        updatedAt = edited;
        version += r.int(1, 6);
      }
    }
    for (const attachment of attachments) if (attachment.createdAt > updatedAt) attachment.createdAt = updatedAt;

    // The meeting it was written for: the first of its schedule, not cancelled, on or after the note's day.
    const meetingIds = [meetingFor(slot.seriesKey, noteDay)?.id ?? slot.meeting.id];

    notes.push({
      id: noteId,
      userId: owner.id,
      title,
      content: { type: 'doc', content },
      version,
      createdAt: slot.at,
      updatedAt,
      meetingIds,
      attachments,
    });
  }

  // A few notes written for no meeting: drafts, ideas and reading lists.
  const extra = (key: string, day: string, minutes: number, title: string, build: (projectId: (theme: string) => string | null) => Block[]) => {
    const moment = at(day, minutes);
    if (moment > now) return;
    const projectId = (theme: string) => writableProjects(key, moment).find((w) => w.theme.key === theme)?.project.id ?? null;
    notes.push({
      id: randomUUID(),
      userId: user(key).id,
      title,
      content: { type: 'doc', content: build(projectId) },
      version: 6,
      createdAt: moment,
      updatedAt: minutesAfter(moment, 25),
      meetingIds: [],
      attachments: [],
    });
  };
  extra('pir4', week(-2, 4), hm(13, 20), 'Ideas for next quarter', () => [
    paragraph('Collecting ideas before Q1 planning.'),
    bulletList('Skeleton screens on the product page', 'Prefetch the next page of search results', 'One image cache for the feed and the product page'),
    // A section whose project was never picked: it shows "Choose a project" and stays in the note only.
    section(null, [paragraph(bold('Notes from the design crit')), bulletList('Bigger tap targets in the filter bar', 'Fewer colors in the price block')]),
  ]);
  extra('pir2', week(-3, 3), hm(15), 'Onboarding FAQ draft', () => [
    heading(1, 'Seller onboarding FAQ (draft)'),
    heading(3, 'How long does approval take?'),
    paragraph('Usually two working days. Ops works through the queue oldest first.'),
    heading(3, 'Which documents are needed?'),
    paragraph('A business registration document and a bank account letter. The exact list is in the ', link('ops handbook', 'https://docs.example.com/ops/onboarding'), '.'),
    quote(paragraph(italic('Check the wording with legal before publishing.'))),
  ]);
  extra('pir7', week(-2, 3), hm(16), 'Reading list', (projectId) => [
    paragraph('Articles for the ranking work:'),
    bulletList(
      [link('Learning to rank, an introduction', 'https://example.com/articles/learning-to-rank')],
      [link('Evaluating search offline', 'https://example.com/articles/offline-evaluation')],
      ['Internal: ', link('search metrics glossary', 'https://docs.example.com/search/metrics')],
    ),
    section(projectId('search'), [paragraph('Shared the list with the squad; NDCG@10 stays our offline metric.')]),
  ]);
  extra('pir9', week(-1, 2), hm(11), '', (projectId) => [
    section(projectId('tokens'), [paragraph('Spacing tokens draft: 4, 8, 12, 16, 24, 32.')]),
  ]);
  extra('leader', week(-1, 4), hm(14, 10), 'Q1 planning prep', (projectId) => [
    heading(1, 'Q1 planning prep', 'center'),
    aligned('center', italic('Inputs to collect before the session')),
    orderedList('Results of the checkout test', 'Capacity per person', 'Dependencies on the platform team'),
    section(projectId('roadmapA'), [
      paragraph('Draft order for Q1:'),
      table(
        ['Milestone', 'Why first'],
        [
          ['One-page checkout at 100%', 'Biggest effect on completion'],
          ['Refunds API live', 'Support asks for it every week'],
          ['Seller wizard pilot', 'Needs legal sign-off first'],
        ],
      ),
    ]),
  ]);

  notes.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return { now, today, users, teams, members, series, meetings, projects, notes };
}
