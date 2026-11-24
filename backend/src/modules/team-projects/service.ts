import type { PeriodProjectsResponse, TeamProjectUpdatesResponse } from '@weekly-meeting/shared';
import type { Database } from '../../database/pool.ts';
import { todayInJakarta } from '../../utils/dates.ts';
import { AppError } from '../../utils/errors.ts';
import type { AuthContext } from '../auth/types.ts';
import { parsePeriodKey } from '../meetings/periods.ts';
import { createTeamProjectsRepository, type DayRange } from './repository.ts';
import { BOARD_LIMIT, UPDATES_PAGE } from './types.ts';

export interface TeamProjectsService {
  list(actor: AuthContext, teamId: string, key: string): Promise<PeriodProjectsResponse>;
  updates(actor: AuthContext, teamId: string, key: string, projectId: string, offset: number): Promise<TeamProjectUpdatesResponse>;
}

/**
 * A period's Projects board (owner, 2026-11-24, on the quarter page instead of the team page): the team members'
 * projects through what was shared on the team's meetings in that period only — a project shows once a part of it is
 * in a note on one of them, with only those parts. A team the user may not see, a key that does not fit the team's
 * split, and a project with nothing shared in the period answer 404. Read-only: nothing here changes anything.
 */
export function createTeamProjectsService(deps: { db: Database; now?: () => Date }): TeamProjectsService {
  const repo = createTeamProjectsRepository(deps.db);
  const today = () => todayInJakarta(deps.now?.() ?? new Date());

  async function periodOf(actor: AuthContext, teamId: string, key: string): Promise<DayRange> {
    const split = await repo.splitFor(teamId, actor.user.id);
    const period = split ? parsePeriodKey(key, split) : null;
    if (!period) throw new AppError(404, 'not_found');
    return { start: period.start, end: period.end };
  }

  return {
    async list(actor, teamId, key) {
      const range = await periodOf(actor, teamId, key);
      const rows = await repo.list(teamId, range, BOARD_LIMIT + 1);
      return { projects: rows.slice(0, BOARD_LIMIT), truncated: rows.length > BOARD_LIMIT };
    },

    async updates(actor, teamId, key, projectId, offset) {
      const range = await periodOf(actor, teamId, key);
      if (!(await repo.isShared(teamId, projectId, range))) throw new AppError(404, 'not_found');
      const rows = await repo.updates(teamId, projectId, range, { offset, limit: UPDATES_PAGE }, today());
      return {
        updates: rows.slice(0, UPDATES_PAGE).map((row) => ({
          ...row,
          noteCreatedAt: row.noteCreatedAt.toISOString(),
          noteUpdatedAt: row.noteUpdatedAt.toISOString(),
        })),
        hasMore: rows.length > UPDATES_PAGE,
      };
    },
  };
}
