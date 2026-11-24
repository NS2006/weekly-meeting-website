import type { PeriodRef, PeriodStatus } from './periods.ts';
import type { EditorDoc } from './notes.ts';
import type { TeamRole } from './teams.ts';

/** ISO day of the week: Monday = 1 … Sunday = 7. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * `done` is any meeting whose date has passed (unless it was cancelled). Only the leader cancels or reopens
 * a meeting of today or later.
 */
export type MeetingStatus = 'scheduled' | 'cancelled' | 'done';

/** A team's recurring schedule ("Weekly sync, every Wednesday and Friday"). Dates are `YYYY-MM-DD` in Indonesia time. */
export interface MeetingSeriesView {
  id: string;
  teamId: string;
  name: string;
  /** Sorted, no repeats. */
  daysOfWeek: IsoWeekday[];
  /** A stopped series makes no new meetings; its past meetings stay. */
  active: boolean;
  createdAt: string;
  /** The next meeting of this series that is not cancelled, today or later; null when there is none. */
  nextMeetingDate: string | null;
}

export interface MeetingView {
  id: string;
  seriesId: string;
  seriesName: string;
  teamId: string;
  teamName: string;
  /** The day it happens. */
  date: string;
  /** The day the schedule put it on; differs from `date` when the leader moved it. */
  scheduledDate: string;
  /** Optional, set by the leader ("Sprint 12 review"). */
  title: string | null;
  status: MeetingStatus;
  noteCount: number;
  /**
   * The meeting gathers notes written from this day up to and including `date`: the day after the previous meeting
   * of its series that was not cancelled, or the day the series was created.
   */
  coversFrom: string;
  /** The team's current, active members. */
  memberCount: number;
  /** Those of them with no note on the meeting yet: the leader first, then by name. Empty when it is cancelled. */
  withoutNote: MeetingMember[];
}

/** A current, active member of the meeting's team. */
export interface MeetingMember {
  userId: string;
  name: string;
  role: TeamRole;
}

export interface MeetingDetail extends MeetingView {
  myRole: TeamRole;
  /** The team period (quarter by default) it falls in, by its day. */
  period: PeriodRef & { status: PeriodStatus };
  seriesActive: boolean;
  teamArchived: boolean;
  /** The meeting of the same schedule just before this one (by the day it happens), cancelled ones included; or null. */
  previous: MeetingNeighbour | null;
  /** The meeting of the same schedule just after this one; or null. */
  next: MeetingNeighbour | null;
}

/** Enough of a neighbouring meeting to link to it ("← Thu 24 Sept"). */
export interface MeetingNeighbour {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  status: MeetingStatus;
}

/** A meeting in the "jump to" list of its schedule. */
export interface ScheduleMeeting extends MeetingNeighbour {
  /** Notes on it (not counting blank ones). */
  noteCount: number;
}

/**
 * GET /api/meetings/:id/schedule (team members; others 404): the meetings of this meeting's schedule around it, by
 * day: up to 120 before it, the meeting itself, and up to 120 after it (cancelled ones included).
 */
export interface ScheduleMeetingsResponse {
  meetings: ScheduleMeeting[];
}

/** GET /api/teams/:id/series */
export interface SeriesListResponse {
  series: MeetingSeriesView[];
}

export interface SeriesResponse {
  series: MeetingSeriesView;
}

/** POST /api/teams/:id/series (team leader). Meetings start from today. */
export interface CreateSeriesRequest {
  name: string;
  daysOfWeek: IsoWeekday[];
}

/** PATCH /api/series/:id (team leader). `active: false` stops it, `true` restarts it. */
export interface UpdateSeriesRequest {
  name?: string;
  daysOfWeek?: IsoWeekday[];
  active?: boolean;
}

/**
 * GET /api/teams/:id/meetings?when=upcoming|past&offset=N, GET /api/meetings?when=upcoming|past&teamId=&offset=N
 * (my teams) and GET /api/meetings/upcoming (Home: my next two weeks).
 */
export interface MeetingsResponse {
  meetings: MeetingView[];
  /** More past meetings exist: ask again with `offset` = the number already shown. */
  hasMore: boolean;
}

/** GET /api/meetings filters (the Meetings page); all optional. */
export interface MyMeetingsQuery {
  when?: 'upcoming' | 'past';
  teamId?: string;
  status?: MeetingStatus;
  /** Text in the meeting's title, its schedule's name or its team's name. */
  q?: string;
  /** Calendar dates 'YYYY-MM-DD', both included; `from` must not be after `to`. */
  from?: string;
  to?: string;
  offset?: number;
}

export interface MeetingResponse {
  meeting: MeetingDetail;
}

/**
 * PATCH /api/meetings/:id (team leader). `status` cancels or reopens, `date` moves it; both only for today or
 * later. An empty title clears it.
 */
export interface UpdateMeetingRequest {
  title?: string | null;
  status?: 'scheduled' | 'cancelled';
  date?: string;
}

/** A note on a meeting's board, as a card. */
export interface MeetingNoteCard {
  id: string;
  title: string;
  /** The first characters of the note's text, on one line. */
  snippet: string;
  /** Names of the projects it has sections for, in order. */
  projects: string[];
  /** The note's first image (the card's cover), or null. */
  coverUrl: string | null;
  imageCount: number;
  createdAt: string;
  updatedAt: string;
}

/** One person's column on a meeting's board. */
export interface MeetingBoardColumn {
  userId: string;
  name: string;
  /** Their role in the team; null when they are no longer in it (their notes on this meeting stay). */
  role: TeamRole | null;
  /** False for a deactivated account. */
  active: boolean;
  isMe: boolean;
  /** In the order their writer (or the leader) arranged them; notes not arranged yet come after, newest first. */
  notes: MeetingNoteCard[];
}

/**
 * GET /api/meetings/:id/notes (team members; others 404): the notes linked to the meeting, one column (a group on
 * the board) per person, the same order for everyone: the meeting's speaking order (its own, or else the latest
 * earlier meeting's of the same schedule), then the leader, then active members by name, then people who left or were
 * deactivated (shown only when they have notes here).
 */
export interface MeetingBoardResponse {
  columns: MeetingBoardColumn[];
  /** I may add my notes here (the meeting is not cancelled and the team is not deleted); I may also arrange mine. */
  canAdd: boolean;
  /** I lead the team and the meeting takes changes: I may set the speaking order and arrange anyone's notes. */
  canArrange: boolean;
}

/**
 * PUT /api/meetings/:id/speakers (the team's leader): the meeting's speaking order, every person on the board (all
 * columns, with or without notes) exactly once. Answers the board; 409 `board_changed` when the board's people changed.
 */
export interface ArrangeSpeakersRequest {
  userIds: string[];
}

/**
 * PUT /api/meetings/:id/note-order (the notes' writer, or the team's leader): the order of one person's notes on the
 * meeting, all of them exactly once. Answers the board; 409 `board_changed` when their notes here changed.
 */
export interface ArrangeNotesRequest {
  userId: string;
  noteIds: string[];
}

/** GET /api/meetings/:id/notes/:noteId: a note on the board, read-only for teammates. */
export interface MeetingNoteDetail {
  id: string;
  title: string;
  content: EditorDoc;
  /** To name its project sections. */
  projects: { id: string; name: string }[];
  author: { id: string; name: string };
  isMine: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MeetingNoteResponse {
  note: MeetingNoteDetail;
}
