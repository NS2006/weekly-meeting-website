import type {
  EditorDoc,
  IsoWeekday,
  MeetingMember,
  MeetingNeighbour,
  MeetingStatus,
  PeriodsPerYear,
  ScheduleMeeting,
  UserStatus,
} from '@weekly-meeting/shared';
import type { Db } from '../../database/pool.ts';
import { likePattern } from '../../utils/sql.ts';
import { SNIPPET_LENGTH } from '../notes/types.ts';

export interface SeriesRow {
  id: string;
  teamId: string;
  name: string;
  daysOfWeek: IsoWeekday[];
  active: boolean;
  createdAt: Date;
  nextMeetingDate: string | null;
}

export interface MeetingRow {
  id: string;
  seriesId: string;
  seriesName: string;
  teamId: string;
  teamName: string;
  date: string;
  scheduledDate: string;
  title: string | null;
  status: MeetingStatus;
  noteCount: number;
  coversFrom: string;
  memberCount: number;
  withoutNote: MeetingMember[];
}

export interface MeetingDetailRow extends MeetingRow {
  seriesActive: boolean;
  teamArchived: boolean;
  previous: MeetingNeighbour | null;
  next: MeetingNeighbour | null;
  /** The team's year split (to name the meeting's period). */
  periodsPerYear: PeriodsPerYear;
  yearStartMonth: number;
}

/** One meeting of a team, as the period list counts it. */
export interface MeetingDayRow {
  id: string;
  date: string;
  status: MeetingStatus;
  noteCount: number;
}

/** A meeting of a period, as the reader names it (no counts). */
export interface PeriodMeetingRow {
  id: string;
  date: string;
  title: string | null;
  seriesName: string;
  status: MeetingStatus;
}

/** A note with something in it, shared on a meeting of a period, without its text (to list and order the reader). */
export interface PeriodNoteRow {
  meetingId: string;
  id: string;
  userId: string;
  name: string;
  title: string;
  updatedAt: Date;
}

/** A note's full content, to read a whole period. */
export interface NoteContentRow {
  id: string;
  content: EditorDoc | Record<string, never>;
  projects: { id: string; name: string }[];
}

export interface LockedMeeting {
  id: string;
  seriesId: string;
  teamId: string;
  date: string;
  status: MeetingStatus;
}

/** A note linked to a meeting, as its board card needs it. */
export interface BoardNoteRow {
  id: string;
  title: string;
  snippet: string;
  userId: string;
  authorName: string;
  authorStatus: UserStatus;
  createdAt: Date;
  updatedAt: Date;
  projects: string[];
  /** The `src` of the note's first image, or null. */
  coverSrc: string | null;
  imageCount: number;
}

/** A note linked to a meeting, in full (to read it on the board). */
export interface BoardNoteDetailRow {
  id: string;
  title: string;
  content: EditorDoc | Record<string, never>;
  userId: string;
  authorName: string;
  createdAt: Date;
  updatedAt: Date;
  projects: { id: string; name: string }[];
}

export interface MyMeetingsPage {
  when: 'upcoming' | 'past';
  teamId?: string;
  status?: MeetingStatus;
  q?: string;
  from?: string;
  to?: string;
  offset: number;
  limit: number;
}

export interface MeetingsRepository {
  listSeries(teamId: string, today: string): Promise<SeriesRow[]>;
  findSeries(seriesId: string, today: string): Promise<SeriesRow | null>;
  countSeries(teamId: string): Promise<number>;
  createSeries(teamId: string, name: string, days: number[], createdBy: string): Promise<string>;
  updateSeries(seriesId: string, changes: { name?: string; daysOfWeek?: number[]; active?: boolean }): Promise<void>;
  deleteSeries(seriesId: string): Promise<void>;
  seriesHasNotes(seriesId: string): Promise<boolean>;
  /**
   * Deletes the series' meetings of `today` or later that have no notes. With `keepDays`, only meetings still on
   * their scheduled day whose weekday is not in `keepDays` (the leader removed that day); moved ones stay.
   */
  removeUpcoming(seriesId: string, today: string, keepDays: number[] | null): Promise<number>;
  /**
   * Inserts the meetings of active series (of teams not deleted) from `today` for HORIZON days; existing ones,
   * and days a moved meeting already took, are skipped. Narrowed to one series or one team when given.
   */
  generate(today: string, horizonDays: number, only?: { seriesId?: string; teamId?: string }): Promise<number>;
  /** Stores `done` on meetings before today that were not cancelled; of one team when given. */
  markPastDone(today: string, teamId?: string): Promise<number>;
  listForTeam(
    teamId: string,
    today: string,
    page: { when: 'upcoming' | 'past'; offset: number; limit: number },
  ): Promise<MeetingRow[]>;
  /**
   * Meetings of the user's teams (not deleted): upcoming (today on) soonest first, or past newest first. Narrowed by
   * team (another team's id simply matches nothing), status as shown (`done` once the day passed), text in the
   * title, schedule or team name, and a date range (`from` and `to` included).
   */
  /** My teams' meetings by day; on one day, the teams I starred first (owner, 2026-11-25), then by team and schedule. */
  listForUser(userId: string, today: string, page: MyMeetingsPage): Promise<MeetingRow[]>;
  /** How many meetings `listForUser` finds with these filters, on every page. */
  countForUser(userId: string, today: string, page: Omit<MyMeetingsPage, 'offset' | 'limit'>): Promise<number>;
  /** One meeting, with the meetings just before and after it in its schedule (by the day they happen). */
  find(meetingId: string, today: string): Promise<MeetingDetailRow | null>;
  /** The meetings of the meeting's series by day: up to `window` before it, itself, and up to `window` after it. */
  scheduleAround(meetingId: string, today: string, window: number): Promise<ScheduleMeeting[]>;
  /** Every meeting of the team (all its series) by day, with its shown status and notes count. */
  teamMeetingDays(teamId: string, today: string): Promise<MeetingDayRow[]>;
  /** The meetings of several teams, each between its own days (both included), by day, in one query (Home). */
  teamsMeetingDays(
    ranges: readonly { teamId: string; from: string; to: string }[],
    today: string,
  ): Promise<(MeetingDayRow & { teamId: string })[]>;
  /** The team's meetings from `from` to `to` (both included), by day. */
  listForTeamBetween(teamId: string, today: string, from: string, to: string): Promise<MeetingRow[]>;
  /** The team's meetings from `from` to `to` (both included), by day, without counts. */
  periodMeetings(teamId: string, today: string, from: string, to: string): Promise<PeriodMeetingRow[]>;
  /**
   * Every note with something in it (title, text or a picture) shared on the team's meetings from `from` to `to`, in
   * one query: by meeting, then in each person's order on it (arranged first, then newest).
   */
  periodNoteList(teamId: string, from: string, to: string): Promise<PeriodNoteRow[]>;
  /** For each of these meetings, its speaking order (its own, or the latest earlier one of its schedule), in one query. */
  speakingOrders(meetingIds: readonly string[]): Promise<Map<string, string[]>>;
  /** The content and projects of these notes (any order). */
  notesContent(noteIds: string[]): Promise<NoteContentRow[]>;
  /** The meeting and its team id; locks the meeting row until the transaction ends. */
  lockMeeting(meetingId: string): Promise<LockedMeeting | null>;
  /** Another meeting of the series already happens on `date`. */
  dateTaken(seriesId: string, date: string, exceptMeetingId: string): Promise<boolean>;
  updateMeeting(meetingId: string, changes: { title?: string | null; status?: MeetingStatus; date?: string }): Promise<void>;
  /**
   * The notes linked to the meeting with their authors, arranged ones first (by position), then newest first; blank
   * ones only when they are the viewer's.
   */
  notesOn(meetingId: string, viewerId: string): Promise<BoardNoteRow[]>;
  /** The speaking order (user ids): the meeting's own, or else the latest earlier meeting's of its schedule; or none. */
  speakingOrder(meetingId: string): Promise<string[]>;
  /** Replaces the meeting's speaking order. */
  setSpeakers(meetingId: string, userIds: string[]): Promise<void>;
  /** Gives these notes their positions on the meeting, in the order given. */
  arrangeNotes(meetingId: string, noteIds: string[]): Promise<void>;
  /** One note, only if it is linked to the meeting; null otherwise. */
  noteOn(meetingId: string, noteId: string): Promise<BoardNoteDetailRow | null>;
}

// `todayParam` names the query parameter that holds today's date, e.g. '$2' (never a value).
// A scheduled meeting whose day has passed is `done`, even before the job stores it.
const STATUS = (todayParam: string) =>
  `CASE WHEN m.status = 'scheduled' AND m.meeting_date < ${todayParam}::date THEN 'done' ELSE m.status::text END`;

const MEETING_COLUMNS = (todayParam: string) => `
  m.id, m.series_id AS "seriesId", s.name AS "seriesName", s.team_id AS "teamId", t.name AS "teamName",
  m.meeting_date AS date, m.scheduled_date AS "scheduledDate", m.title,
  ${STATUS(todayParam)} AS status,
  ${NOTE_COUNT('m.id')} AS "noteCount",
  LEAST(COALESCE((SELECT max(p.meeting_date) + 1 FROM meetings p
                   WHERE p.series_id = m.series_id AND p.meeting_date < m.meeting_date AND p.status <> 'cancelled'),
                 (s.created_at AT TIME ZONE 'Asia/Jakarta')::date),
        m.meeting_date) AS "coversFrom",
  (SELECT count(*)::int FROM team_members tm JOIN users u ON u.id = tm.user_id
    WHERE tm.team_id = s.team_id AND u.status = 'active') AS "memberCount",
  CASE WHEN m.status = 'cancelled' THEN '[]'::json ELSE
    (SELECT COALESCE(json_agg(json_build_object('userId', u.id, 'name', u.name, 'role', tm.role)
                              ORDER BY tm.role = 'leader' DESC, lower(u.name), u.id), '[]'::json)
       FROM team_members tm JOIN users u ON u.id = tm.user_id
      WHERE tm.team_id = s.team_id AND u.status = 'active'
        AND NOT EXISTS (SELECT 1 FROM note_meetings nm JOIN notes n ON n.id = nm.note_id
                         WHERE nm.meeting_id = m.id AND n.user_id = u.id AND ${NOT_BLANK}))
  END AS "withoutNote"`;

// A note with no title, no text and no image (just started) is not counted, and shows on boards to its owner only.
const NOT_BLANK = `(n.title <> '' OR n.content_text <> '' OR jsonb_path_exists(n.content, 'strict $.** ? (@.type == "image")'))`;

/**
 * The opposite, for note `alias`: written exactly as the partial index `notes_blank_idx` states it (migration
 * `notes_blank_index`), so PostgreSQL can answer from that small index.
 */
const BLANK = (alias: string) =>
  `(${alias}.title = '' AND ${alias}.content_text = '' AND NOT jsonb_path_exists(${alias}.content, 'strict $.** ? (@.type == "image")'))`;

/**
 * How many notes with something in them are on `meeting`: every link, less the blank notes' (stress test,
 * 2026-11-25: checking each note read every note of a team's history, 17,000 for a 151-person team's periods).
 */
const NOTE_COUNT = (meeting: string) =>
  `((SELECT count(*) FROM note_meetings c WHERE c.meeting_id = ${meeting})
     - (SELECT count(*) FROM note_meetings c JOIN notes b ON b.id = c.note_id AND ${BLANK('b')} WHERE c.meeting_id = ${meeting}))::int`;

const MEETING_FROM = `
  FROM meetings m
  JOIN meeting_series s ON s.id = m.series_id
  JOIN teams t ON t.id = s.team_id`;

const MEETING_SELECT = (todayParam: string) => `SELECT ${MEETING_COLUMNS(todayParam)} ${MEETING_FROM}`;

/** The meeting of the same series just before (`<`, latest first) or after (`>`, soonest first) m, as JSON. */
const NEIGHBOUR = (todayParam: string, side: '<' | '>') => `
  (SELECT json_build_object('id', o.id, 'date', o.meeting_date,
                            'status', CASE WHEN o.status = 'scheduled' AND o.meeting_date < ${todayParam}::date
                                           THEN 'done' ELSE o.status::text END)
     FROM meetings o
    WHERE o.series_id = m.series_id AND o.meeting_date ${side} m.meeting_date
    ORDER BY o.meeting_date ${side === '<' ? 'DESC' : 'ASC'}
    LIMIT 1)`;

const SERIES_SELECT = `
  SELECT s.id, s.team_id AS "teamId", s.name, s.days_of_week AS "daysOfWeek", s.active, s.created_at AS "createdAt",
         (SELECT min(m.meeting_date) FROM meetings m
           WHERE m.series_id = s.id AND m.meeting_date >= $2::date AND m.status <> 'cancelled') AS "nextMeetingDate"
    FROM meeting_series s`;

/**
 * A user's meetings ($1 the user, $2 today, then $3–$7: from, to, team, status, words). Starts from the user's
 * memberships, then their teams' series and the (series_id, meeting_date) index, so every filter here works on that
 * person's meetings only. Comes after MEETING_FROM (it needs `m`, `s` and `t`).
 */
const USER_MEETINGS = (upcoming: boolean) => `
           JOIN team_members me ON me.team_id = t.id AND me.user_id = $1
          WHERE t.archived_at IS NULL
            AND ${upcoming ? 'm.meeting_date >= $2::date' : 'm.meeting_date < $2::date'}
            AND ($3::date IS NULL OR m.meeting_date >= $3::date)
            AND ($4::date IS NULL OR m.meeting_date <= $4::date)
            AND ($5::uuid IS NULL OR t.id = $5::uuid)
            AND ($6::text IS NULL OR ${STATUS('$2')} = $6::text)
            AND ($7::text IS NULL OR m.title ILIKE $7 OR s.name ILIKE $7 OR t.name ILIKE $7)`;

const userMeetingValues = (userId: string, today: string, page: Omit<MyMeetingsPage, 'offset' | 'limit'>) => [
  userId,
  today,
  page.from ?? null,
  page.to ?? null,
  page.teamId ?? null,
  page.status ?? null,
  page.q ? likePattern(page.q) : null,
];

/**
 * Each meeting's speaking order (user ids in order): its own, or else the latest earlier meeting's of its schedule that
 * has one. Meetings with neither are left out.
 */
async function speakingOrdersOf(db: Db, meetingIds: readonly string[]): Promise<Map<string, string[]>> {
  const orders = new Map<string, string[]>();
  if (meetingIds.length === 0) return orders;
  const { rows } = await db.query<{ meetingId: string; userId: string }>(
    `SELECT m.id AS "meetingId", sp.user_id AS "userId"
       FROM meetings m
      CROSS JOIN LATERAL (
            SELECT o.id FROM meetings o
             WHERE o.series_id = m.series_id AND (o.id = m.id OR o.meeting_date < m.meeting_date)
               AND EXISTS (SELECT 1 FROM meeting_speakers x WHERE x.meeting_id = o.id)
             ORDER BY o.id = m.id DESC, o.meeting_date DESC
             LIMIT 1) source
       JOIN meeting_speakers sp ON sp.meeting_id = source.id
      WHERE m.id = ANY($1::uuid[])
      ORDER BY m.id, sp.position, sp.user_id`,
    [meetingIds],
  );
  for (const row of rows) {
    const order = orders.get(row.meetingId);
    if (order) order.push(row.userId);
    else orders.set(row.meetingId, [row.userId]);
  }
  return orders;
}

export function createMeetingsRepository(db: Db): MeetingsRepository {
  return {
    async listSeries(teamId, today) {
      const { rows } = await db.query<SeriesRow>(
        `${SERIES_SELECT} WHERE s.team_id = $1 ORDER BY s.active DESC, s.created_at, s.id`,
        [teamId, today],
      );
      return rows;
    },

    async findSeries(seriesId, today) {
      const { rows } = await db.query<SeriesRow>(`${SERIES_SELECT} WHERE s.id = $1`, [seriesId, today]);
      return rows[0] ?? null;
    },

    async countSeries(teamId) {
      const { rows } = await db.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM meeting_series WHERE team_id = $1',
        [teamId],
      );
      return rows[0]?.n ?? 0;
    },

    async createSeries(teamId, name, days, createdBy) {
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO meeting_series (team_id, name, days_of_week, created_by)
         VALUES ($1, $2, $3::smallint[], $4) RETURNING id`,
        [teamId, name, days, createdBy],
      );
      const seriesId = rows[0]?.id;
      if (!seriesId) throw new Error('series insert returned no id');
      return seriesId;
    },

    async updateSeries(seriesId, changes) {
      await db.query(
        `UPDATE meeting_series
            SET name = COALESCE($2, name),
                days_of_week = COALESCE($3::smallint[], days_of_week),
                active = COALESCE($4, active)
          WHERE id = $1`,
        [seriesId, changes.name ?? null, changes.daysOfWeek ?? null, changes.active ?? null],
      );
    },

    async deleteSeries(seriesId) {
      await db.query('DELETE FROM meeting_series WHERE id = $1', [seriesId]);
    },

    async seriesHasNotes(seriesId) {
      const { rows } = await db.query<{ has: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM note_meetings nm JOIN meetings m ON m.id = nm.meeting_id
                         WHERE m.series_id = $1) AS has`,
        [seriesId],
      );
      return rows[0]?.has ?? false;
    },

    async removeUpcoming(seriesId, today, keepDays) {
      const { rowCount } = await db.query(
        `DELETE FROM meetings m
          WHERE m.series_id = $1 AND m.meeting_date >= $2::date
            AND NOT EXISTS (SELECT 1 FROM note_meetings nm WHERE nm.meeting_id = m.id)
            AND ($3::smallint[] IS NULL
                 OR (m.meeting_date = m.scheduled_date
                     AND NOT (EXTRACT(ISODOW FROM m.scheduled_date)::smallint = ANY ($3::smallint[]))))`,
        [seriesId, today, keepDays],
      );
      return rowCount ?? 0;
    },

    async generate(today, horizonDays, only = {}) {
      // ON CONFLICT without a target skips both a day already generated (series_id, scheduled_date) and a day
      // a moved meeting already takes (series_id, meeting_date). Running it twice changes nothing.
      const { rowCount } = await db.query(
        `INSERT INTO meetings (series_id, scheduled_date, meeting_date)
         SELECT s.id, d.day, d.day
           FROM meeting_series s
           JOIN teams t ON t.id = s.team_id AND t.archived_at IS NULL
          CROSS JOIN LATERAL (SELECT $1::date + i AS day FROM generate_series(0, $2::int - 1) AS i) d
          WHERE s.active
            AND EXTRACT(ISODOW FROM d.day)::smallint = ANY (s.days_of_week)
            AND ($3::uuid IS NULL OR s.id = $3::uuid)
            AND ($4::uuid IS NULL OR s.team_id = $4::uuid)
         ON CONFLICT DO NOTHING`,
        [today, horizonDays, only.seriesId ?? null, only.teamId ?? null],
      );
      return rowCount ?? 0;
    },

    async markPastDone(today, teamId) {
      const { rowCount } = await db.query(
        `UPDATE meetings m SET status = 'done'
          WHERE m.status = 'scheduled' AND m.meeting_date < $1::date
            AND ($2::uuid IS NULL OR m.series_id IN (SELECT id FROM meeting_series WHERE team_id = $2::uuid))`,
        [today, teamId ?? null],
      );
      return rowCount ?? 0;
    },

    async listForTeam(teamId, today, page) {
      const upcoming = page.when === 'upcoming';
      const { rows } = await db.query<MeetingRow>(
        `${MEETING_SELECT('$2')}
          WHERE s.team_id = $1 AND ${upcoming ? 'm.meeting_date >= $2::date' : 'm.meeting_date < $2::date'}
          ORDER BY m.meeting_date ${upcoming ? 'ASC' : 'DESC'}, lower(s.name), m.id
          LIMIT $3 OFFSET $4`,
        [teamId, today, page.limit, page.offset],
      );
      return rows;
    },

    async listForUser(userId, today, page) {
      const upcoming = page.when === 'upcoming';
      const { rows } = await db.query<MeetingRow>(
        `${MEETING_SELECT('$2')}
           ${USER_MEETINGS(upcoming)}
          ORDER BY m.meeting_date ${upcoming ? 'ASC' : 'DESC'}, me.starred_at IS NULL, lower(t.name), lower(s.name), m.id
          LIMIT $8 OFFSET $9`,
        [...userMeetingValues(userId, today, page), page.limit, page.offset],
      );
      return rows;
    },

    async countForUser(userId, today, page) {
      const { rows } = await db.query<{ n: number }>(
        `SELECT count(*)::int AS n ${MEETING_FROM} ${USER_MEETINGS(page.when === 'upcoming')}`,
        userMeetingValues(userId, today, page),
      );
      return rows[0]?.n ?? 0;
    },

    async find(meetingId, today) {
      const { rows } = await db.query<MeetingDetailRow>(
        `SELECT ${MEETING_COLUMNS('$2')},
                s.active AS "seriesActive", t.archived_at IS NOT NULL AS "teamArchived",
                ${NEIGHBOUR('$2', '<')} AS previous, ${NEIGHBOUR('$2', '>')} AS next,
                t.periods_per_year AS "periodsPerYear", t.year_start_month AS "yearStartMonth"
           ${MEETING_FROM}
          WHERE m.id = $1`,
        [meetingId, today],
      );
      return rows[0] ?? null;
    },

    async scheduleAround(meetingId, today, window) {
      const pick = (side: '<=' | '>', order: 'ASC' | 'DESC', limit: string) => `
        (SELECT o.id, o.meeting_date AS date,
                CASE WHEN o.status = 'scheduled' AND o.meeting_date < $2::date THEN 'done' ELSE o.status::text END AS status,
                ${NOTE_COUNT('o.id')} AS "noteCount"
           FROM meetings m JOIN meetings o ON o.series_id = m.series_id
          WHERE m.id = $1 AND o.meeting_date ${side} m.meeting_date
          ORDER BY o.meeting_date ${order}
          LIMIT ${limit})`;
      const { rows } = await db.query<ScheduleMeeting>(
        `${pick('<=', 'DESC', '$3::int + 1')} UNION ALL ${pick('>', 'ASC', '$3::int')} ORDER BY date`,
        [meetingId, today, window],
      );
      return rows;
    },

    async teamMeetingDays(teamId, today) {
      const { rows } = await db.query<MeetingDayRow>(
        `SELECT m.id, m.meeting_date AS date, ${STATUS('$2')} AS status, ${NOTE_COUNT('m.id')} AS "noteCount"
           FROM meetings m JOIN meeting_series s ON s.id = m.series_id
          WHERE s.team_id = $1
          ORDER BY m.meeting_date, m.id`,
        [teamId, today],
      );
      return rows;
    },

    async teamsMeetingDays(ranges, today) {
      if (ranges.length === 0) return [];
      const { rows } = await db.query<MeetingDayRow & { teamId: string }>(
        `SELECT s.team_id AS "teamId", m.id, m.meeting_date AS date, ${STATUS('$4')} AS status, ${NOTE_COUNT('m.id')} AS "noteCount"
           FROM unnest($1::uuid[], $2::date[], $3::date[]) AS r(team_id, first_day, last_day)
           JOIN meeting_series s ON s.team_id = r.team_id
           JOIN meetings m ON m.series_id = s.id AND m.meeting_date BETWEEN r.first_day AND r.last_day
          ORDER BY m.meeting_date, m.id`,
        [ranges.map((r) => r.teamId), ranges.map((r) => r.from), ranges.map((r) => r.to), today],
      );
      return rows;
    },

    async listForTeamBetween(teamId, today, from, to) {
      const { rows } = await db.query<MeetingRow>(
        `${MEETING_SELECT('$2')}
          WHERE s.team_id = $1 AND m.meeting_date BETWEEN $3::date AND $4::date
          ORDER BY m.meeting_date, lower(s.name), m.id`,
        [teamId, today, from, to],
      );
      return rows;
    },

    async periodMeetings(teamId, today, from, to) {
      const { rows } = await db.query<PeriodMeetingRow>(
        `SELECT m.id, m.meeting_date AS date, m.title, s.name AS "seriesName", ${STATUS('$2')} AS status
           FROM meetings m JOIN meeting_series s ON s.id = m.series_id
          WHERE s.team_id = $1 AND m.meeting_date BETWEEN $3::date AND $4::date
          ORDER BY m.meeting_date, lower(s.name), m.id`,
        [teamId, today, from, to],
      );
      return rows;
    },

    async periodNoteList(teamId, from, to) {
      const { rows } = await db.query<PeriodNoteRow>(
        `SELECT nm.meeting_id AS "meetingId", n.id, n.user_id AS "userId", u.name, n.title, n.updated_at AS "updatedAt"
           FROM meetings m
           JOIN meeting_series s ON s.id = m.series_id
           JOIN note_meetings nm ON nm.meeting_id = m.id
           JOIN notes n ON n.id = nm.note_id
           JOIN users u ON u.id = n.user_id
          WHERE s.team_id = $1 AND m.meeting_date BETWEEN $2::date AND $3::date AND ${NOT_BLANK}
          ORDER BY nm.meeting_id, nm.position ASC NULLS LAST, n.created_at DESC, n.id DESC`,
        [teamId, from, to],
      );
      return rows;
    },

    speakingOrders: (meetingIds) => speakingOrdersOf(db, meetingIds),

    async notesContent(noteIds) {
      if (noteIds.length === 0) return [];
      const { rows } = await db.query<NoteContentRow>(
        `SELECT n.id, n.content,
                COALESCE((SELECT json_agg(json_build_object('id', p.id, 'name', p.name) ORDER BY x.first)
                            FROM (SELECT s.project_id, min(s.position) AS first FROM note_sections s
                                   WHERE s.note_id = n.id GROUP BY s.project_id) x
                            JOIN projects p ON p.id = x.project_id), '[]'::json) AS projects
           FROM notes n
          WHERE n.id = ANY($1::uuid[])`,
        [noteIds],
      );
      return rows;
    },

    async lockMeeting(meetingId) {
      const { rows } = await db.query<LockedMeeting>(
        `SELECT m.id, m.series_id AS "seriesId", s.team_id AS "teamId", m.meeting_date AS date, m.status
           FROM meetings m JOIN meeting_series s ON s.id = m.series_id
          WHERE m.id = $1 FOR UPDATE OF m`,
        [meetingId],
      );
      return rows[0] ?? null;
    },

    async dateTaken(seriesId, date, exceptMeetingId) {
      const { rows } = await db.query<{ taken: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM meetings WHERE series_id = $1 AND meeting_date = $2::date AND id <> $3) AS taken`,
        [seriesId, date, exceptMeetingId],
      );
      return rows[0]?.taken ?? false;
    },

    async updateMeeting(meetingId, changes) {
      await db.query(
        `UPDATE meetings
            SET title = CASE WHEN $2::boolean THEN $3 ELSE title END,
                status = COALESCE($4::meeting_status, status),
                meeting_date = COALESCE($5::date, meeting_date)
          WHERE id = $1`,
        [meetingId, changes.title !== undefined, changes.title ?? null, changes.status ?? null, changes.date ?? null],
      );
    },
    async notesOn(meetingId, viewerId) {
      // The cover is the first image (document order: jsonpath `.**` in strict mode visits every node once, depth
      // first) that is one of this note's own attachments; an image pasted from another note is not shown to
      // teammates, so it would make a broken cover.
      const { rows } = await db.query<BoardNoteRow>(
        `SELECT n.id, n.title, n.user_id AS "userId", u.name AS "authorName", u.status AS "authorStatus",
                n.created_at AS "createdAt", n.updated_at AS "updatedAt",
                left(btrim(regexp_replace(regexp_replace(left(n.content_text, ${SNIPPET_LENGTH * 4}), '\\s*\\n\\s*', ' · ', 'g'), '\\s+', ' ', 'g')), ${SNIPPET_LENGTH}) AS snippet,
                COALESCE((SELECT json_agg(p.name ORDER BY x.first)
                            FROM (SELECT s.project_id, min(s.position) AS first FROM note_sections s
                                   WHERE s.note_id = n.id GROUP BY s.project_id) x
                            JOIN projects p ON p.id = x.project_id), '[]'::json) AS projects,
                (SELECT i.src #>> '{}'
                   FROM jsonb_path_query(n.content, 'strict $.** ? (@.type == "image").attrs.src') WITH ORDINALITY AS i(src, ord)
                  WHERE EXISTS (SELECT 1 FROM attachments a
                                 WHERE a.note_id = n.id AND '/api/attachments/' || a.id::text = i.src #>> '{}')
                  ORDER BY i.ord LIMIT 1) AS "coverSrc",
                (SELECT count(*)::int FROM jsonb_path_query(n.content, 'strict $.** ? (@.type == "image")')) AS "imageCount"
           FROM note_meetings nm
           JOIN notes n ON n.id = nm.note_id
           JOIN users u ON u.id = n.user_id
          WHERE nm.meeting_id = $1 AND (n.user_id = $2 OR ${NOT_BLANK})
          ORDER BY nm.position ASC NULLS LAST, n.created_at DESC, n.id DESC`,
        [meetingId, viewerId],
      );
      return rows;
    },

    async speakingOrder(meetingId) {
      return (await speakingOrdersOf(db, [meetingId])).get(meetingId) ?? [];
    },

    async setSpeakers(meetingId, userIds) {
      await db.query('DELETE FROM meeting_speakers WHERE meeting_id = $1', [meetingId]);
      await db.query(
        `INSERT INTO meeting_speakers (meeting_id, user_id, position)
         SELECT $1, x.id, x.ord - 1 FROM unnest($2::uuid[]) WITH ORDINALITY AS x(id, ord)`,
        [meetingId, userIds],
      );
    },

    async arrangeNotes(meetingId, noteIds) {
      await db.query(
        `UPDATE note_meetings nm SET position = x.ord - 1
           FROM unnest($2::uuid[]) WITH ORDINALITY AS x(id, ord)
          WHERE nm.meeting_id = $1 AND nm.note_id = x.id`,
        [meetingId, noteIds],
      );
    },

    async noteOn(meetingId, noteId) {
      const { rows } = await db.query<BoardNoteDetailRow>(
        `SELECT n.id, n.title, n.content, n.user_id AS "userId", u.name AS "authorName",
                n.created_at AS "createdAt", n.updated_at AS "updatedAt",
                COALESCE((SELECT json_agg(json_build_object('id', p.id, 'name', p.name) ORDER BY x.first)
                            FROM (SELECT s.project_id, min(s.position) AS first FROM note_sections s
                                   WHERE s.note_id = n.id GROUP BY s.project_id) x
                            JOIN projects p ON p.id = x.project_id), '[]'::json) AS projects
           FROM note_meetings nm
           JOIN notes n ON n.id = nm.note_id
           JOIN users u ON u.id = n.user_id
          WHERE nm.meeting_id = $1 AND nm.note_id = $2`,
        [meetingId, noteId],
      );
      return rows[0] ?? null;
    },
  };
}
