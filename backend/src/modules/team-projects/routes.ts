import { Router } from 'express';
import { requireUserRole } from '../../middleware/authenticate.ts';
import { validate } from '../../middleware/validate.ts';
import { createTeamProjectsController } from './controller.ts';
import type { TeamProjectsService } from './service.ts';
import { PeriodParamsSchema, PeriodProjectParamsSchema, TeamProjectUpdatesQuerySchema } from './types.ts';

/**
 * A period's Projects board (read-only). Mounted after authenticate + requireActive; needs the User role in use; team
 * membership is checked in the service (404 otherwise).
 */
export function createTeamProjectsRoutes(service: TeamProjectsService): Router {
  const c = createTeamProjectsController(service);
  const router = Router();

  router.get('/teams/:id/periods/:key/projects', requireUserRole, validate('params', PeriodParamsSchema), c.list);
  router.get(
    '/teams/:id/periods/:key/projects/:projectId/updates',
    requireUserRole,
    validate('params', PeriodProjectParamsSchema),
    validate('query', TeamProjectUpdatesQuerySchema),
    c.updates,
  );
  return router;
}
