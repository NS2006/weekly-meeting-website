import type { PeriodsPerYear, TeamChoice, TeamRole, TeamSort, UserStatus } from '@weekly-meeting/shared';
import type { Db } from '../../database/pool.ts';
import { likePattern } from '../../utils/sql.ts';
import { ARCHIVE_DAYS } from './types.ts';

export interface TeamRow {
  id: string;
  name: string;
  description: string | null;
  myRole: TeamRole;
  leaderId: string | null;
  leaderName: string | null;
  memberCount: number;
  createdAt: Date;
  archivedAt: Date | null;
  purgeAt: Date | null;
  periodsPerYear: PeriodsPerYear;
  yearStartMonth: number;
  starred: boolean;
}

export interface TeamMemberRow {
  userId: string;
  name: string;
  email: string;
  status: UserStatus;
  role: TeamRole;
  addedAt: Date;
}

export interface LockedTeam {
  id: string;
  name: string;
  archivedAt: Date | null;
  /** Archived longer ago than ARCHIVE_DAYS (the purge job just has not run yet). */
  expired: boolean;
}

export interface TeamsRepository {
  /** Teams the user is in, plus archived teams they lead, narrowed by the filters. Archived ones last. */
  listForUser(userId: string, filters?: { q?: string; role?: TeamRole; sort?: TeamSort }): Promise<TeamRow[]>;
  /** A few of the teams the user is in (not deleted ones) at random. */
  randomChoices(userId: string, limit: number): Promise<TeamChoice[]>;
  /** The teams the user is in (not deleted ones) whose name holds the text, A–Z; `limit` rows at most. */
  findChoices(userId: string, q: string, limit: number): Promise<TeamChoice[]>;
  /** The team as this user may see it, or null (not a member, or archived and not its leader). */
  findForUser(teamId: string, userId: string): Promise<TeamRow | null>;
  members(teamId: string): Promise<TeamMemberRow[]>;
  /** Creates the team and adds its creator as leader; run inside a transaction. */
  create(name: string, description: string | null, creatorId: string): Promise<string>;
  /** Locks the team row until the transaction ends. */
  lock(teamId: string): Promise<LockedTeam | null>;
  roleOf(teamId: string, userId: string): Promise<TeamRole | null>;
  update(
    teamId: string,
    changes: { name?: string; description?: string | null; periodsPerYear?: PeriodsPerYear; yearStartMonth?: number },
  ): Promise<void>;
  /** false when the user was already a member. */
  addMember(teamId: string, userId: string, addedBy: string): Promise<boolean>;
  removeMember(teamId: string, userId: string): Promise<void>;
  /** A few active people who are not in the team, in random order (a different pick each time). */
  suggestNonMembers(teamId: string, limit: number): Promise<{ id: string; name: string; email: string }[]>;
  setRole(teamId: string, userId: string, role: TeamRole): Promise<void>;
  setArchived(teamId: string, archived: boolean): Promise<void>;
  /** Stars the team for this member, or takes the star off (keeps the first star's time). */
  setStarred(teamId: string, userId: string, starred: boolean): Promise<void>;
  /**
   * For every team this user leads: lock the team, then make its longest-standing active member (earliest
   * added_at) the leader and this user a member. Teams with no other active member keep their leader.
   * Used when an admin deactivates the user; run inside that transaction.
   */
  passLeadershipFrom(userId: string): Promise<{ teamId: string; newLeaderId: string }[]>;
  /** Deletes teams archived more than ARCHIVE_DAYS ago (members, series and meetings cascade). */
  purgeExpired(): Promise<number>;
  /** Deletes the team for good, with what hangs on it (members, schedules, meetings, their links to notes). */
  remove(teamId: string): Promise<void>;
}

const TEAM_SELECT = `
  SELECT t.id, t.name, t.description,
         t.created_at AS "createdAt", t.archived_at AS "archivedAt",
         t.archived_at + make_interval(days => ${ARCHIVE_DAYS}) AS "purgeAt",
         t.periods_per_year AS "periodsPerYear", t.year_start_month AS "yearStartMonth",
         me.role AS "myRole", me.starred_at IS NOT NULL AS starred,
         l.user_id AS "leaderId", lu.name AS "leaderName",
         (SELECT count(*)::int FROM team_members c WHERE c.team_id = t.id) AS "memberCount"
    FROM teams t
    JOIN team_members me ON me.team_id = t.id AND me.user_id = $1
    LEFT JOIN team_members l ON l.team_id = t.id AND l.role = 'leader'
    LEFT JOIN users lu ON lu.id = l.user_id
   WHERE (t.archived_at IS NULL OR me.role = 'leader')`;

// Sort orders come from this fixed list only (never from the request text).
const TEAM_ORDER: Record<TeamSort, string> = {
  name: 'lower(t.name), t.id',
  newest: 't.created_at DESC, t.id DESC',
  members: '(SELECT count(*) FROM team_members c WHERE c.team_id = t.id) DESC, lower(t.name), t.id',
};

export function createTeamsRepository(db: Db): TeamsRepository {
  return {
    async randomChoices(userId, limit) {
      const { rows } = await db.query<TeamChoice>(
        `SELECT t.id, t.name FROM teams t
           JOIN team_members me ON me.team_id = t.id AND me.user_id = $1
          WHERE t.archived_at IS NULL
          ORDER BY random()
          LIMIT $2`,
        [userId, limit],
      );
      return rows;
    },

    async findChoices(userId, q, limit) {
      const { rows } = await db.query<TeamChoice>(
        `SELECT t.id, t.name FROM teams t
           JOIN team_members me ON me.team_id = t.id AND me.user_id = $1
          WHERE t.archived_at IS NULL AND t.name ILIKE $2
          ORDER BY lower(t.name), t.id
          LIMIT $3`,
        [userId, likePattern(q), limit],
      );
      return rows;
    },

    async listForUser(userId, filters = {}) {
      // The query starts from the user's own memberships (team_members_user_id_idx), so the filters only ever
      // look at that person's few teams.
      const { rows } = await db.query<TeamRow>(
        `${TEAM_SELECT}
            AND ($2::text IS NULL OR t.name ILIKE $2 OR t.description ILIKE $2)
            AND ($3::team_role IS NULL OR me.role = $3::team_role)
          ORDER BY t.archived_at IS NOT NULL, me.starred_at IS NULL, ${TEAM_ORDER[filters.sort ?? 'name']}`,
        [userId, filters.q ? likePattern(filters.q) : null, filters.role ?? null],
      );
      return rows;
    },

    // ORDER BY random() reads every active user: fine for one company's staff (thousands of rows at most).
    async suggestNonMembers(teamId, limit) {
      const { rows } = await db.query<{ id: string; name: string; email: string }>(
        `SELECT u.id, u.name, u.email FROM users u
          WHERE u.status = 'active'
            AND NOT EXISTS (SELECT 1 FROM team_members m WHERE m.team_id = $1 AND m.user_id = u.id)
          ORDER BY random()
          LIMIT $2`,
        [teamId, limit],
      );
      return rows;
    },

    async findForUser(teamId, userId) {
      const { rows } = await db.query<TeamRow>(`${TEAM_SELECT} AND t.id = $2`, [userId, teamId]);
      return rows[0] ?? null;
    },

    async members(teamId) {
      const { rows } = await db.query<TeamMemberRow>(
        `SELECT tm.user_id AS "userId", u.name, u.email, u.status, tm.role, tm.added_at AS "addedAt"
           FROM team_members tm JOIN users u ON u.id = tm.user_id
          WHERE tm.team_id = $1
          ORDER BY tm.role = 'leader' DESC, lower(u.name), tm.user_id`,
        [teamId],
      );
      return rows;
    },

    async create(name, description, creatorId) {
      const { rows } = await db.query<{ id: string }>(
        'INSERT INTO teams (name, description, created_by) VALUES ($1, $2, $3) RETURNING id',
        [name, description, creatorId],
      );
      const teamId = rows[0]?.id;
      if (!teamId) throw new Error('team insert returned no id');
      await db.query(
        "INSERT INTO team_members (team_id, user_id, role, added_by) VALUES ($1, $2, 'leader', $2)",
        [teamId, creatorId],
      );
      return teamId;
    },

    async lock(teamId) {
      const { rows } = await db.query<LockedTeam>(
        `SELECT id, name, archived_at AS "archivedAt",
                COALESCE(archived_at <= now() - make_interval(days => ${ARCHIVE_DAYS}), false) AS expired
           FROM teams WHERE id = $1 FOR UPDATE`,
        [teamId],
      );
      return rows[0] ?? null;
    },

    async roleOf(teamId, userId) {
      const { rows } = await db.query<{ role: TeamRole }>(
        'SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2',
        [teamId, userId],
      );
      return rows[0]?.role ?? null;
    },

    async update(teamId, changes) {
      await db.query(
        `UPDATE teams
            SET name = COALESCE($2, name),
                description = CASE WHEN $3::boolean THEN $4 ELSE description END,
                periods_per_year = COALESCE($5::smallint, periods_per_year),
                year_start_month = COALESCE($6::smallint, year_start_month)
          WHERE id = $1`,
        [
          teamId,
          changes.name ?? null,
          changes.description !== undefined,
          changes.description ?? null,
          changes.periodsPerYear ?? null,
          changes.yearStartMonth ?? null,
        ],
      );
    },

    async addMember(teamId, userId, addedBy) {
      const { rowCount } = await db.query(
        `INSERT INTO team_members (team_id, user_id, role, added_by) VALUES ($1, $2, 'member', $3)
         ON CONFLICT (team_id, user_id) DO NOTHING`,
        [teamId, userId, addedBy],
      );
      return rowCount === 1;
    },

    async removeMember(teamId, userId) {
      await db.query('DELETE FROM team_members WHERE team_id = $1 AND user_id = $2', [teamId, userId]);
    },

    async setRole(teamId, userId, role) {
      await db.query('UPDATE team_members SET role = $3 WHERE team_id = $1 AND user_id = $2', [teamId, userId, role]);
    },

    async setArchived(teamId, archived) {
      await db.query(`UPDATE teams SET archived_at = ${archived ? 'now()' : 'NULL'} WHERE id = $1`, [teamId]);
    },

    async setStarred(teamId, userId, starred) {
      await db.query(
        `UPDATE team_members SET starred_at = CASE WHEN $3::boolean THEN coalesce(starred_at, now()) END
          WHERE team_id = $1 AND user_id = $2`,
        [teamId, userId, starred],
      );
    },

    async passLeadershipFrom(userId) {
      // Lock the teams first (id order), so a hand-over the leader started at the same moment waits for this.
      const { rows: led } = await db.query<{ team_id: string }>(
        `SELECT t.id AS team_id FROM teams t
           JOIN team_members tm ON tm.team_id = t.id AND tm.user_id = $1 AND tm.role = 'leader'
          ORDER BY t.id FOR UPDATE OF t`,
        [userId],
      );
      const passed: { teamId: string; newLeaderId: string }[] = [];
      for (const { team_id: teamId } of led) {
        const { rows } = await db.query<{ user_id: string }>(
          `SELECT tm.user_id FROM team_members tm JOIN users u ON u.id = tm.user_id
            WHERE tm.team_id = $1 AND tm.user_id <> $2 AND u.status = 'active'
            ORDER BY tm.added_at, tm.user_id
            LIMIT 1`,
          [teamId, userId],
        );
        const heir = rows[0]?.user_id;
        if (!heir) continue;
        // Demote first: the partial unique index allows at most one leader at any moment.
        await db.query("UPDATE team_members SET role = 'member' WHERE team_id = $1 AND user_id = $2", [teamId, userId]);
        await db.query("UPDATE team_members SET role = 'leader' WHERE team_id = $1 AND user_id = $2", [teamId, heir]);
        passed.push({ teamId, newLeaderId: heir });
      }
      return passed;
    },

    async purgeExpired() {
      const { rowCount } = await db.query(
        `DELETE FROM teams WHERE archived_at <= now() - make_interval(days => ${ARCHIVE_DAYS})`,
      );
      return rowCount ?? 0;
    },

    async remove(teamId) {
      await db.query('DELETE FROM teams WHERE id = $1', [teamId]);
    },
  };
}
