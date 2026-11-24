import { Router } from 'express';
import type { Database } from '../../database/pool.ts';
import { requireAdminRole, requireUserRole } from '../../middleware/authenticate.ts';
import { validate } from '../../middleware/validate.ts';
import type { Logger } from '../../utils/logger.ts';
import type { AuthConfig } from '../auth/types.ts';
import { createUsersController } from './controller.ts';
import { createUsersService } from './service.ts';
import { PeopleSearchQuerySchema, UpdateUserStatusSchema, UserIdParamsSchema, UserListQuerySchema } from './types.ts';

/** Website admin Users page (FR-3), and the people picker any active user needs for teams. Mounted after authenticate + requireActive. */
export function createUsersRoutes(deps: { db: Database; config: AuthConfig; logger: Logger }): Router {
  const controller = createUsersController(createUsersService(deps));
  const router = Router();
  const id = validate('params', UserIdParamsSchema);

  router.get('/users/search', requireUserRole, validate('query', PeopleSearchQuerySchema), controller.searchPeople);

  router.use('/admin', requireAdminRole);
  router.get('/admin/users', validate('query', UserListQuerySchema), controller.list);
  router.patch('/admin/users/:id', id, validate('body', UpdateUserStatusSchema), controller.setStatus);
  router.put('/admin/users/:id/roles/admin', id, controller.grantAdmin);
  router.delete('/admin/users/:id/roles/admin', id, controller.removeAdmin);
  return router;
}
