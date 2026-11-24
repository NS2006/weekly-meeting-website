import type {
  AdminUserResponse,
  AdminUsersQuery,
  AdminUsersResponse,
  PeopleSearchResponse,
  UpdateUserStatusRequest,
} from '@weekly-meeting/shared';
import { authOf } from '../../middleware/authenticate.ts';
import { asyncHandler } from '../../utils/asyncHandler.ts';
import type { UsersService } from './service.ts';

export function createUsersController(service: UsersService) {
  return {
    list: asyncHandler(async (_req, res) => {
      const query = res.locals.validated.query as AdminUsersQuery;
      res.json((await service.list(query)) satisfies AdminUsersResponse);
    }),

    setStatus: asyncHandler(async (_req, res) => {
      const { id } = res.locals.validated.params as { id: string };
      const { status } = res.locals.validated.body as UpdateUserStatusRequest;
      res.json({ user: await service.setStatus(authOf(res), id, status) } satisfies AdminUserResponse);
    }),

    grantAdmin: asyncHandler(async (_req, res) => {
      const { id } = res.locals.validated.params as { id: string };
      res.json({ user: await service.setAdmin(authOf(res), id, true) } satisfies AdminUserResponse);
    }),

    searchPeople: asyncHandler(async (_req, res) => {
      const { q } = res.locals.validated.query as { q: string };
      res.json((await service.searchPeople(q)) satisfies PeopleSearchResponse);
    }),

    removeAdmin: asyncHandler(async (_req, res) => {
      const { id } = res.locals.validated.params as { id: string };
      res.json({ user: await service.setAdmin(authOf(res), id, false) } satisfies AdminUserResponse);
    }),
  };
}
