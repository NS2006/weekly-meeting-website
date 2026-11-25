import type {
  CreateProjectRequest,
  ProjectChoicesResponse,
  ProjectDetail,
  ProjectsQuery,
  ProjectsResponse,
  ProjectSummary,
  UpdateProjectRequest,
} from '@weekly-meeting/shared';
import type { Database } from '../../database/pool.ts';
import { AppError } from '../../utils/errors.ts';
import type { Logger } from '../../utils/logger.ts';
import type { AuthContext } from '../auth/types.ts';
import { createProjectsRepository, type ProjectRow } from './repository.ts';
import { ACTIVITY_DAYS, FOUND_CHOICES, NAME_INDEX, PROJECTS_PAGE, RANDOM_CHOICES } from './types.ts';

export interface ProjectsService {
  list(actor: AuthContext, filters: ProjectsQuery): Promise<ProjectsResponse>;
  get(actor: AuthContext, projectId: string): Promise<ProjectDetail>;
  /** Projects to pick from: a few at random, or the ones whose name holds `q`. */
  choices(actor: AuthContext, q: string | undefined): Promise<ProjectChoicesResponse>;
  create(actor: AuthContext, input: CreateProjectRequest): Promise<ProjectDetail>;
  update(actor: AuthContext, projectId: string, input: UpdateProjectRequest): Promise<ProjectDetail>;
  remove(actor: AuthContext, projectId: string, confirmName: string): Promise<void>;
}

const toSummary = (row: ProjectRow): ProjectSummary => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  lastUpdateAt: row.lastUpdateAt ? row.lastUpdateAt.toISOString() : null,
});

/** A unique-index violation on the owner's project names: that name is already used. */
function nameTaken(err: unknown): boolean {
  const pgError = err as { code?: string; constraint?: string };
  return pgError.code === '23505' && pgError.constraint === NAME_INDEX;
}

/** Projects belong to one person: every read and change checks ownership; anyone else gets 404. */
export function createProjectsService(deps: { db: Database; logger: Logger; now?: () => Date }): ProjectsService {
  const { db, logger } = deps;
  const now = () => deps.now?.() ?? new Date();
  const projects = createProjectsRepository(db);

  async function detail(projectId: string, ownerId: string): Promise<ProjectDetail> {
    const row = await projects.findOwned(projectId, ownerId);
    if (!row) throw new AppError(404, 'not_found');
    return toSummary(row);
  }

  return {
    async list(actor, query) {
      const status = query.status ?? 'active';
      const page = { offset: query.offset ?? 0, limit: query.limit ?? PROJECTS_PAGE };
      // "Last update": the past 7, 30 or 90 days; "quiet" is before the 90 days, "none" needs no date.
      const days = query.activity === 'quiet' ? ACTIVITY_DAYS.quarter : query.activity && query.activity !== 'none' ? ACTIVITY_DAYS[query.activity] : 0;
      const filters = {
        q: query.q,
        activity: query.activity,
        since: days ? new Date(now().getTime() - days * 86_400_000) : undefined,
        shared: query.shared,
        team: query.team,
      };
      const [rows, counts] = await Promise.all([
        projects.list(actor.user.id, status, filters, query.sort ?? 'updated', page),
        projects.counts(actor.user.id, filters),
      ]);
      return {
        projects: rows.slice(0, page.limit).map(toSummary),
        counts,
        total: counts[status],
        hasMore: rows.length > page.limit,
      };
    },

    get: (actor, projectId) => detail(projectId, actor.user.id),

    async choices(actor, q) {
      if (!q) return { projects: await projects.randomChoices(actor.user.id, RANDOM_CHOICES), hasMore: false };
      const rows = await projects.findChoices(actor.user.id, q, FOUND_CHOICES + 1);
      return { projects: rows.slice(0, FOUND_CHOICES), hasMore: rows.length > FOUND_CHOICES };
    },

    async create(actor, input) {
      let projectId: string;
      try {
        projectId = await projects.create(actor.user.id, input.name, input.description ?? null);
      } catch (err) {
        if (nameTaken(err)) throw new AppError(409, 'project_name_taken');
        throw err;
      }
      logger.info({ actorId: actor.user.id, projectId }, 'project: created');
      return detail(projectId, actor.user.id);
    },

    async update(actor, projectId, input) {
      await db.transaction(async (tx) => {
        const repo = createProjectsRepository(tx);
        const project = await repo.lockOwned(projectId, actor.user.id);
        if (!project) throw new AppError(404, 'not_found');
        // Archived is read-only: the only change it accepts is being restored (with or without other edits).
        if (project.status === 'archived' && input.status !== 'active') throw new AppError(409, 'project_archived');
        try {
          await repo.update(projectId, input);
        } catch (err) {
          if (nameTaken(err)) throw new AppError(409, 'project_name_taken');
          throw err;
        }
      });
      logger.info({ actorId: actor.user.id, projectId, status: input.status }, 'project: changed');
      return detail(projectId, actor.user.id);
    },

    async remove(actor, projectId, confirmName) {
      await db.transaction(async (tx) => {
        const repo = createProjectsRepository(tx);
        const project = await repo.lockOwned(projectId, actor.user.id);
        if (!project) throw new AppError(404, 'not_found');
        if (confirmName.trim() !== project.name) throw new AppError(400, 'confirmation_mismatch');
        // Notes stay: their sections for this project lose the tag (the rows in note_sections cascade).
        await repo.remove(projectId);
      });
      logger.info({ actorId: actor.user.id, projectId }, 'project: deleted');
    },
  };
}
