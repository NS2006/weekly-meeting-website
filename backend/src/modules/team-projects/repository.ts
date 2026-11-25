import type { EditorDoc, PeriodProject, TeamProjectMeeting, UpdateOrder, YearSplit } from '@weekly-meeting/shared';
import type { Db } from '../../database/pool.ts';

export interface TeamProjectUpdateRow {
  noteId: string;
  noteTitle: string;
  position: number;
  content: EditorDoc;
  noteCreatedAt: Date;
  noteUpdatedAt: Date;
  meetings: TeamProjectMeeting[];
}

/** First and last day of a period, both included (YYYY-MM-DD). */
export interface DayRange {
  start: string;
  end: string;
}

export interface TeamProjectsRepository {
  /**
   * The team's year split, when the user may read the team: a member, and a deleted team only for its leader (as the
   * team and period pages); null otherwise.
   */
  splitFor(teamId: string, userId: string): Promise<YearSplit | null>;
  /** The projects shared on the team's meetings in the range, latest meeting first; `limit` rows at most. */
  list(teamId: string, range: DayRange, limit: number): Promise<PeriodProject[]>;
  /** Whether a part of the project is in a note shared on one of the team's meetings in the range. */
  isShared(teamId: string, projectId: string, range: DayRange): Promise<boolean>;
  /** The project's parts in notes shared on the team's meetings in the range, latest meeting first. */
  /** Its parts shared in the period, by their note's last meeting in it (latest or earliest first), then the note. */
  updates(
    teamId: string,
    projectId: string,
    range: DayRange,
    page: { offset: number; limit: number },
    today: string,
    order?: UpdateOrder,
  ): Promise<TeamProjectUpdateRow[]>;
}

// Only what reached the team in the period: each project part (note_sections: tagged parts with something in them) of
// a note shared on a meeting of team $1 dated $2–$3. Nothing else of anyone's projects or notes is read.
const SHARED = `
  period_meetings AS (
    SELECT m.id, m.meeting_date
      FROM meetings m
      JOIN meeting_series ms ON ms.id = m.series_id
     WHERE ms.team_id = $1 AND m.meeting_date BETWEEN $2::date AND $3::date
  ),
  shared AS (
    SELECT s.project_id, s.note_id, pm.id AS meeting_id, pm.meeting_date
      FROM note_sections s
      JOIN note_meetings nm ON nm.note_id = s.note_id
      JOIN period_meetings pm ON pm.id = nm.meeting_id
  )`;

// A part's place: its note's last meeting in the period (the month it is listed under), then the note's creation; a
// note's parts stay in their order either way.
const LAST_MEETING = '(SELECT max(tm.meeting_date) FROM team_meetings tm WHERE tm.note_id = s.note_id)';
const UPDATE_ORDER: Record<UpdateOrder, string> = {
  newest: `${LAST_MEETING} DESC, n.created_at DESC, n.id, s.position`,
  oldest: `${LAST_MEETING}, n.created_at, n.id, s.position`,
};

export function createTeamProjectsRepository(db: Db): TeamProjectsRepository {
  return {
    async splitFor(teamId, userId) {
      const { rows } = await db.query<YearSplit>(
        `SELECT t.periods_per_year AS "periodsPerYear", t.year_start_month AS "yearStartMonth"
           FROM teams t
           JOIN team_members tm ON tm.team_id = t.id AND tm.user_id = $2
          WHERE t.id = $1 AND (t.archived_at IS NULL OR tm.role = 'leader')`,
        [teamId, userId],
      );
      return rows[0] ?? null;
    },

    async list(teamId, range, limit) {
      const { rows } = await db.query<PeriodProject>(
        `WITH ${SHARED}
         SELECT p.id, p.name, p.status, json_build_object('id', u.id, 'name', u.name) AS owner,
                count(DISTINCT sh.note_id)::int AS "updateCount",
                to_char(max(sh.meeting_date), 'YYYY-MM-DD') AS "lastSharedOn",
                array_agg(DISTINCT sh.meeting_id::text) AS "meetingIds"
           FROM shared sh
           JOIN projects p ON p.id = sh.project_id
           JOIN users u ON u.id = p.user_id
          GROUP BY p.id, u.id
          ORDER BY max(sh.meeting_date) DESC, lower(p.name), p.id
          LIMIT $4`,
        [teamId, range.start, range.end, limit],
      );
      return rows;
    },

    async isShared(teamId, projectId, range) {
      const { rows } = await db.query(`WITH ${SHARED} SELECT 1 FROM shared WHERE project_id = $4 LIMIT 1`, [
        teamId,
        range.start,
        range.end,
        projectId,
      ]);
      return rows.length > 0;
    },

    async updates(teamId, projectId, range, page, today, order = 'newest') {
      const { rows } = await db.query<TeamProjectUpdateRow>(
        `WITH team_meetings AS (
           SELECT nm.note_id, m.id, m.meeting_date, m.title, ms.name AS series_name, m.status
             FROM note_meetings nm
             JOIN meetings m ON m.id = nm.meeting_id
             JOIN meeting_series ms ON ms.id = m.series_id
            WHERE ms.team_id = $1 AND m.meeting_date BETWEEN $2::date AND $3::date
         )
         SELECT s.note_id AS "noteId", n.title AS "noteTitle", s.position, s.content,
                n.created_at AS "noteCreatedAt", n.updated_at AS "noteUpdatedAt",
                (SELECT json_agg(json_build_object(
                          'id', tm.id, 'date', to_char(tm.meeting_date, 'YYYY-MM-DD'), 'title', tm.title,
                          'seriesName', tm.series_name,
                          'status', CASE WHEN tm.status = 'scheduled' AND tm.meeting_date < $7::date
                                         THEN 'done' ELSE tm.status::text END)
                        ORDER BY tm.meeting_date, tm.id)
                   FROM team_meetings tm WHERE tm.note_id = s.note_id) AS meetings
           FROM note_sections s
           JOIN notes n ON n.id = s.note_id
          WHERE s.project_id = $4 AND EXISTS (SELECT 1 FROM team_meetings tm WHERE tm.note_id = s.note_id)
          ORDER BY ${UPDATE_ORDER[order]}
          LIMIT $5 OFFSET $6`,
        [teamId, range.start, range.end, projectId, page.limit + 1, page.offset, today],
      );
      return rows;
    },
  };
}
