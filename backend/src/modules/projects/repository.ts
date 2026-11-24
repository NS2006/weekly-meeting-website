import type { ProjectChoice, ProjectSort, ProjectStatus } from '@weekly-meeting/shared';
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

export interface ProjectsRepository {
  /** The owner's projects in one status, narrowed by text in the name or description. */
  list(ownerId: string, filters: { status: ProjectStatus; q?: string; sort: ProjectSort }): Promise<ProjectRow[]>;
  /** A few of the owner's projects (any status) at random. */
  randomChoices(ownerId: string, limit: number): Promise<ProjectChoice[]>;
  /** The owner's projects whose name holds the text, active first, then A–Z; `limit` rows at most. */
  findChoices(ownerId: string, q: string, limit: number): Promise<ProjectChoice[]>;
  /** How many of the owner's projects match the text, per status. */
  counts(ownerId: string, q?: string): Promise<Record<ProjectStatus, number>>;
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
  // Recently touched first: the project itself or its latest note, whichever is later.
  updated: `GREATEST(p.updated_at, ${LAST_UPDATE}) DESC, p.id DESC`,
  name: 'lower(p.name), p.id',
  newest: 'p.created_at DESC, p.id DESC',
};

export function createProjectsRepository(db: Db): ProjectsRepository {
  return {
    async list(ownerId, filters) {
      const { rows } = await db.query<ProjectRow>(
        `${PROJECT_SELECT}
          WHERE p.user_id = $1 AND p.status = $2::project_status
            AND ($3::text IS NULL OR p.name ILIKE $3 OR p.description ILIKE $3)
          ORDER BY ${PROJECT_ORDER[filters.sort]}`,
        [ownerId, filters.status, filters.q ? likePattern(filters.q) : null],
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

    async counts(ownerId, q) {
      const { rows } = await db.query<{ status: ProjectStatus; n: number }>(
        `SELECT p.status, count(*)::int AS n FROM projects p
          WHERE p.user_id = $1 AND ($2::text IS NULL OR p.name ILIKE $2 OR p.description ILIKE $2)
          GROUP BY p.status`,
        [ownerId, q ? likePattern(q) : null],
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
