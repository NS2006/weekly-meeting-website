import type { PeriodProjectsResponse, TeamProjectUpdatesResponse } from '@weekly-meeting/shared';
import type { Response } from 'express';
import { authOf } from '../../middleware/authenticate.ts';
import { asyncHandler } from '../../utils/asyncHandler.ts';
import type { TeamProjectsService } from './service.ts';

const params = (res: Response) => res.locals.validated.params as { id: string; key: string; projectId: string };

export function createTeamProjectsController(service: TeamProjectsService) {
  return {
    list: asyncHandler(async (_req, res) => {
      const { id, key } = params(res);
      res.json((await service.list(authOf(res), id, key)) satisfies PeriodProjectsResponse);
    }),

    updates: asyncHandler(async (_req, res) => {
      const { id, key, projectId } = params(res);
      const { offset } = res.locals.validated.query as { offset: number };
      res.json((await service.updates(authOf(res), id, key, projectId, offset)) satisfies TeamProjectUpdatesResponse);
    }),
  };
}
