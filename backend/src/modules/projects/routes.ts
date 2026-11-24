import { Router } from 'express';
import { requireUserRole } from '../../middleware/authenticate.ts';
import { validate } from '../../middleware/validate.ts';
import { createProjectsController } from './controller.ts';
import type { ProjectsService } from './service.ts';
import {
  CreateProjectSchema,
  DeleteProjectSchema,
  ProjectChoicesQuerySchema,
  ProjectIdParamsSchema,
  ProjectsQuerySchema,
  UpdateProjectSchema,
} from './types.ts';

/**
 * Projects (FR-6): each person's own projects. Mounted after authenticate + requireActive; needs the User role in
 * use. Ownership is checked in every query (someone else's project answers 404).
 */
export function createProjectsRoutes(service: ProjectsService): Router {
  const c = createProjectsController(service);
  const byId = validate('params', ProjectIdParamsSchema);
  const router = Router();

  router.use('/projects', requireUserRole);
  router.get('/projects', validate('query', ProjectsQuerySchema), c.list);
  router.post('/projects', validate('body', CreateProjectSchema), c.create);
  // Before /projects/:id, which would refuse "choices" as an id.
  router.get('/projects/choices', validate('query', ProjectChoicesQuerySchema), c.choices);
  router.get('/projects/:id', byId, c.get);
  router.patch('/projects/:id', byId, validate('body', UpdateProjectSchema), c.update);
  router.delete('/projects/:id', byId, validate('body', DeleteProjectSchema), c.remove);
  return router;
}
