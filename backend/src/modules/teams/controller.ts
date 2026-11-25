import type {
  PeopleSearchResponse,
  AddTeamMemberRequest,
  CreateTeamRequest,
  DeleteTeamRequest,
  SetTeamLeaderRequest,
  TeamChoicesQuery,
  TeamChoicesResponse,
  TeamResponse,
  TeamStarResponse,
  TeamsQuery,
  TeamsResponse,
  UpdateTeamRequest,
} from '@weekly-meeting/shared';
import type { Response } from 'express';
import { authOf } from '../../middleware/authenticate.ts';
import { asyncHandler } from '../../utils/asyncHandler.ts';
import type { TeamsService } from './service.ts';

const params = (res: Response) => res.locals.validated.params as { id: string; userId?: string };

export function createTeamsController(service: TeamsService) {
  return {
    list: asyncHandler(async (_req, res) => {
      const filters = res.locals.validated.query as TeamsQuery;
      res.json((await service.list(authOf(res), filters)) satisfies TeamsResponse);
    }),

    choices: asyncHandler(async (_req, res) => {
      const { q } = res.locals.validated.query as TeamChoicesQuery;
      res.json((await service.choices(authOf(res), q)) satisfies TeamChoicesResponse);
    }),

    create: asyncHandler(async (_req, res) => {
      const body = res.locals.validated.body as CreateTeamRequest;
      res.status(201).json({ team: await service.create(authOf(res), body) } satisfies TeamResponse);
    }),

    get: asyncHandler(async (_req, res) => {
      res.json({ team: await service.get(authOf(res), params(res).id) } satisfies TeamResponse);
    }),

    update: asyncHandler(async (_req, res) => {
      const body = res.locals.validated.body as UpdateTeamRequest;
      res.json({ team: await service.update(authOf(res), params(res).id, body) } satisfies TeamResponse);
    }),

    archive: asyncHandler(async (_req, res) => {
      const { confirmName } = res.locals.validated.body as DeleteTeamRequest;
      res.json({ team: await service.archive(authOf(res), params(res).id, confirmName) } satisfies TeamResponse);
    }),

    restore: asyncHandler(async (_req, res) => {
      res.json({ team: await service.restore(authOf(res), params(res).id) } satisfies TeamResponse);
    }),

    deleteForGood: asyncHandler(async (_req, res) => {
      await service.deleteForGood(authOf(res), params(res).id);
      res.status(204).end();
    }),

    star: asyncHandler(async (_req, res) => {
      res.json((await service.star(authOf(res), params(res).id, true)) satisfies TeamStarResponse);
    }),

    unstar: asyncHandler(async (_req, res) => {
      res.json((await service.star(authOf(res), params(res).id, false)) satisfies TeamStarResponse);
    }),

    memberSuggestions: asyncHandler(async (_req, res) => {
      res.json({ users: await service.suggestMembers(authOf(res), params(res).id) } satisfies PeopleSearchResponse);
    }),

    addMember: asyncHandler(async (_req, res) => {
      const { userId } = res.locals.validated.body as AddTeamMemberRequest;
      res.json({ team: await service.addMember(authOf(res), params(res).id, userId) } satisfies TeamResponse);
    }),

    removeMember: asyncHandler(async (_req, res) => {
      const { id, userId } = params(res);
      await service.removeMember(authOf(res), id, userId ?? '');
      res.status(204).end();
    }),

    handOver: asyncHandler(async (_req, res) => {
      const { userId } = res.locals.validated.body as SetTeamLeaderRequest;
      res.json({ team: await service.handOver(authOf(res), params(res).id, userId) } satisfies TeamResponse);
    }),
  };
}
