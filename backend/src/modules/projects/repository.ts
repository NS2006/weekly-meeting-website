import type { ProjectActivity, ProjectChoice, ProjectSort, ProjectStatus } from '@weekly-meeting/shared';
import type { Db } from '../../database/pool.ts';
import { likePattern } from '../../utils/sql.ts';

export interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  createdAt: Date;
  updatedAt: Date;
  updateCount: number;
  lastUpdateAt: Date | null;
}

/** What narrows the list, except the status. `since`: the cutoff for the "Last update" choice, worked out by the service. */
export interface ProjectFilters {
  q?: string | undefined;
  activity?: ProjectActivity | undefined;
  since?: Date | undefined;
  shared?: 'yes' | 'no' | undefined;
  team?: string | undefined;
}

export interface ProjectsRepository {
  /** One page of the owner's projects in one status, narrowed by the filters; `limit` + 1 rows tell if more follow. */
  list(
    ownerId: string,
    status: ProjectStatus,
    filters: ProjectFilters,
    sort: ProjectSort,
    page: { offset: number; limit: number },
  ): Promise<ProjectRow[]>;
  /** A few of the owner's projects (any status) at random. */
  randomChoices(ownerId: string, limit: number): Promise<ProjectChoice[]>;
  /** The owner's projects whose name holds the text, active first, then A–Z; `limit` rows at most. */
  findChoices(ownerId: string, q: string, limit: number): Promise<ProjectChoice[]>;
  /** How many of the owner's projects match the filters, per status. */
  counts(ownerId: string, filters: ProjectFilters): Promise<Record<ProjectStatus, number>>;
  /** The project if this user owns it; null otherwise (missing and not-yours look the same). */
  findOwned(projectId: string, ownerId: string): Promise<ProjectRow | null>;
  /** Same, and locks the row until the transaction ends. */
  lockOwned(projectId: string, ownerId: string): Promise<{ id: string; name: string; status: ProjectStatus } | null>;
  create(ownerId: string, name: string, description: string | null): Promise<string>;
  update(projectId: string, changes: { name?: string; description?: string | null; status?: ProjectStatus }): Promise<void>;
  /** Deletes the project. Notes stay: only its derived note_sections rows go (cascade). */
  remove(projectId: string): Promise<void>;
}

// When one of the notes with a section for the project was last saved.
const LAST_UPDATE = `(SELECT max(n.updated_at) FROM note_sections s JOIN notes n ON n.id = s.note_id WHERE s.project_id = p.id)`;

// Every query filters on p.user_id: there is no way to read or change someone else's project.
const PROJECT_SELECT = `
  SELECT p.id, p.name, p.description, p.status, p.created_at AS "createdAt", p.updated_at AS "updatedAt",
         (SELECT count(DISTINCT s.note_id)::int FROM note_sections s WHERE s.project_id = p.id) AS "updateCount",
         ${LAST_UPDATE} AS "lastUpdateAt"
    FROM projects p`;

// Sort orders come from this fixed list only (never from the request text).
const PROJECT_ORDER: Record<ProjectSort, string> = {
  // Recently touched first: the project itself or its latest note, whichever is later (GREATEST skips a NULL).
  updated: `GREATEST(p.updated_at, ${LAST_UPDATE}) DESC, p.id DESC`,
  // The ones left alone longest first: what may need a word at the next meeting.
  stale: `GREATEST(p.updated_at, ${LAST_UPDATE}) ASC, p.id`,
  updates: '"updateCount" DESC, lower(p.name), p.id',
  name: 'lower(p.name), p.id',
  newest: 'p.created_at DESC, p.id DESC',
  oldest: 'p.created_at ASC, p.id',
};

/** An update of the project shared on a meeting (of one team, when `team` is that team's parameter). */
const sharedUpdate = (team?: string) =>
  team
    ? `EXISTS (SELECT 1 FROM note_sections s
                 JOIN note_meetings nm ON nm.note_id = s.note_id
                 JOIN meetings m ON m.id = nm.meeting_id
                 JOIN meeting_series ms ON ms.id = m.series_id
                WHERE s.project_id = p.id AND ms.team_id = ${team})`
    : 'EXISTS (SELECT 1 FROM note_sections s JOIN note_meetings nm ON nm.note_id = s.note_id WHERE s.project_id = p.id)';

/**
 * The WHERE clause for the owner's projects and the filters (not the status), every value a parameter. `$1` is
 * always the owner.
 */
function whereOf(ownerId: string, f: ProjectFilters): { sql: string; values: unknown[] } {
  const values: unknown[] = [ownerId];
  const param = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  const parts = ['p.user_id = $1'];
  if (f.q) {
    const q = param(likePattern(f.q));
    parts.push(`(p.name ILIKE ${q} OR p.description ILIKE ${q})`);
  }
  if (f.activity === 'none') parts.push('NOT EXISTS (SELECT 1 FROM note_sections s WHERE s.project_id = p.id)');
  else if (f.activity === 'quiet' && f.since) parts.push(`${LAST_UPDATE} < ${param(f.since)}`);
  else if (f.activity && f.since) parts.push(`${LAST_UPDATE} >= ${param(f.since)}`);
  if (f.shared === 'yes') parts.push(sharedUpdate());
  if (f.shared === 'no') parts.push(`NOT ${sharedUpdate()}`);
  if (f.team) parts.push(sharedUpdate(param(f.team)));
  return { sql: parts.join(' AND '), values };
}

export function createProjectsRepository(db: Db): ProjectsRepository {
  return {
    async list(ownerId, status, filters, sort, page) {
      const where = whereOf(ownerId, filters);
      const at = (i: number) => `$${where.values.length + i}`;
      const { rows } = await db.query<ProjectRow>(
        `${PROJECT_SELECT}
          WHERE ${where.sql} AND p.status = ${at(1)}::project_status
          ORDER BY ${PROJECT_ORDER[sort]}
          LIMIT ${at(2)} OFFSET ${at(3)}`,
        [...where.values, status, page.limit + 1, page.offset],
      );
      return rows;
    },

    // ORDER BY random() reads all of one person's projects: tens, a few hundred at most.
    async randomChoices(ownerId, limit) {
      const { rows } = await db.query<ProjectChoice>(
        'SELECT p.id, p.name, p.status FROM projects p WHERE p.user_id = $1 ORDER BY random() LIMIT $2',
        [ownerId, limit],
      );
      return rows;
    },

    async findChoices(ownerId, q, limit) {
      const { rows } = await db.query<ProjectChoice>(
        `SELECT p.id, p.name, p.status FROM projects p
          WHERE p.user_id = $1 AND p.name ILIKE $2
          ORDER BY p.status = 'archived', lower(p.name), p.id
          LIMIT $3`,
        [ownerId, likePattern(q), limit],
      );
      return rows;
    },

    async counts(ownerId, filters) {
      const where = whereOf(ownerId, filters);
      const { rows } = await db.query<{ status: ProjectStatus; n: number }>(
        `SELECT p.status, count(*)::int AS n FROM projects p WHERE ${where.sql} GROUP BY p.status`,
        where.values,
      );
      const counts: Record<ProjectStatus, number> = { active: 0, archived: 0 };
      for (const row of rows) counts[row.status] = row.n;
      return counts;
    },

    async findOwned(projectId, ownerId) {
      const { rows } = await db.query<ProjectRow>(`${PROJECT_SELECT} WHERE p.id = $1 AND p.user_id = $2`, [
        projectId,
        ownerId,
      ]);
      return rows[0] ?? null;
    },

    async lockOwned(projectId, ownerId) {
      const { rows } = await db.query<{ id: string; name: string; status: ProjectStatus }>(
        'SELECT id, name, status FROM projects WHERE id = $1 AND user_id = $2 FOR UPDATE',
        [projectId, ownerId],
      );
      return rows[0] ?? null;
    },

    async create(ownerId, name, description) {
      const { rows } = await db.query<{ id: string }>(
        'INSERT INTO projects (user_id, name, description) VALUES ($1, $2, $3) RETURNING id',
        [ownerId, name, description],
      );
      const projectId = rows[0]?.id;
      if (!projectId) throw new Error('project insert returned no id');
      return projectId;
    },

    async update(projectId, changes) {
      await db.query(
        `UPDATE projects
            SET name = COALESCE($2, name),
                description = CASE WHEN $3::boolean THEN $4 ELSE description END,
                status = COALESCE($5::project_status, status),
                updated_at = now()
          WHERE id = $1`,
        [projectId, changes.name ?? null, changes.description !== undefined, changes.description ?? null, changes.status ?? null],
      );
    },

    async remove(projectId) {
      await db.query('DELETE FROM projects WHERE id = $1', [projectId]);
    },
  };
}
