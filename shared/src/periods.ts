import type { MeetingStatus, MeetingView } from './meetings.ts';
import type { EditorDoc } from './notes.ts';
import type { TeamRole } from './teams.ts';

/**
 * How a team splits its year (owner, 2026-11-23), set by its leader: 4 quarters by default, or 1 (the whole year), 2
 * halves, 3 or 6 parts, or 12 months, from the month the year starts (January by default).
 */
export type PeriodsPerYear = 1 | 2 | 3 | 4 | 6 | 12;

export interface YearSplit {
  periodsPerYear: PeriodsPerYear;
  /** 1–12 */
  yearStartMonth: number;
}

/** A period that ended stays open (late notes still go in); it is only shown as ended. */
export type PeriodStatus = 'ended' | 'current' | 'upcoming';

export interface PeriodRef {
  /**
   * The months it covers: first month and length, e.g. `2026-10-3m` (Q4 2026). After the leader changes the split, an
   * old key finds the same months or nothing (404), never another period.
   */
  key: string;
  /** Q4 2026, H2 2026, Nov 2026, 2026, Q1 2026/27 (a year from April), … */
  label: string;
}

export interface PeriodSummary extends PeriodRef {
  /** First and last day (YYYY-MM-DD, both included). */
  start: string;
  end: string;
  status: PeriodStatus;
  /** Meetings in it that were not cancelled, and the cancelled ones. */
  meetingCount: number;
  cancelledCount: number;
  /** Notes on its meetings (blank ones not counted). */
  noteCount: number;
  /** How many of its days have begun (for the current one's progress), and how many it has. */
  daysPassed: number;
  days: number;
}

/**
 * GET /api/teams/:id/periods (team members): the team's periods from the one of its first meeting (or the current one)
 * to the one after the current one, oldest first.
 */
export interface TeamPeriodsResponse {
  split: YearSplit;
  periods: PeriodSummary[];
}

export interface PeriodDetail extends PeriodSummary {
  teamId: string;
  teamName: string;
  myRole: TeamRole;
  teamArchived: boolean;
  split: YearSplit;
  /** The periods around it in the team's list (null at either end). */
  previous: PeriodRef | null;
  next: PeriodRef | null;
  /** Its meetings, every schedule of the team, by day. */
  meetings: MeetingView[];
}

/** GET /api/teams/:id/periods/:key (team members). 404 when the key does not fit the team's split. */
export interface PeriodResponse {
  period: PeriodDetail;
}

export interface PeriodNote {
  id: string;
  title: string;
  content: EditorDoc;
  /** To name its project sections. */
  projects: { id: string; name: string }[];
  updatedAt: string;
}

export interface PeriodPersonNotes {
  userId: string;
  name: string;
  notes: PeriodNote[];
}

/** A meeting of the period, as the reader names it. */
export interface PeriodMeetingHead {
  id: string;
  date: string;
  title: string | null;
  seriesName: string;
  status: MeetingStatus;
}

/**
 * A meeting of the period that has notes, without them (owner, 2026-11-25: the reader's pickers need every meeting and
 * person, but only the meetings picked are loaded in full). The counts let the reader split its loading into the same
 * parts the server sends, so one part can load on its own (stress test, 2026-11-25).
 */
export interface PeriodMeetingIndex extends PeriodMeetingHead {
  /** In the meeting's board order (its speaking order); only people with notes, with how many. */
  people: { userId: string; name: string; noteCount: number }[];
}

export interface PeriodMeetingNotes extends PeriodMeetingHead {
  people: PeriodPersonNotes[];
}

/**
 * GET /api/teams/:id/periods/:key/notes query: which meetings to send in full. `meetings`: `all`, or ids separated by
 * commas; `latest`: the last N meetings with notes (the reader's default is 3). Neither: all of them. `people`: only
 * these people's notes (user ids separated by commas). They come a part at a time (stress test, 2026-11-25): a
 * response holds whole meetings up to about 100 notes (always at least one meeting) and names the rest in `rest`,
 * asked for next with `meetings=<rest>&more=1` (a later part: no index).
 */
export interface PeriodNotesQuery {
  meetings?: string;
  latest?: number;
  people?: string;
  more?: 1;
}

/**
 * GET /api/teams/:id/periods/:key/notes (team members): the whole period to read, like the quarter's Word file —
 * every meeting that has notes, by day, and on each its people and their notes in full.
 */
export interface PeriodNotesResponse {
  /** Every meeting of the period that has notes, by day, with who wrote (no note text). Left out of a later part. */
  index?: PeriodMeetingIndex[];
  /** The first of the meetings asked for, by day, with their notes in full (about 100 notes, at least one meeting). */
  meetings: PeriodMeetingNotes[];
  /** The meetings asked for that come in a later part, by day (empty when this part is the last). */
  rest: string[];
}

/**
 * GET /api/periods/current, for Home: the current period of each of my teams (not deleted), and the ones that start
 * within the next four weeks, as far as meetings are made (owner, 2026-11-25: a team split into months shows next
 * month too, near the end of this one). Team by team, in each team's order; a team can appear more than once.
 */
export interface CurrentPeriodsResponse {
  teams: { teamId: string; teamName: string; split: YearSplit; period: PeriodSummary }[];
}
