import { Router } from 'express';
import { requireUserRole } from '../../middleware/authenticate.ts';
import { validate } from '../../middleware/validate.ts';
import { createTeamsController } from './controller.ts';
import type { TeamsService } from './service.ts';
import {
  AddTeamMemberSchema,
  CreateTeamSchema,
  DeleteTeamSchema,
  SetTeamLeaderSchema,
  TeamChoicesQuerySchema,
  TeamIdParamsSchema,
  TeamMemberParamsSchema,
  TeamsQuerySchema,
  UpdateTeamSchema,
} from './types.ts';

/** Team management (FR-5, FR-5a). Mounted after authenticate + requireActive; needs the User role in use; team roles are checked in the service. */
export function createTeamsRoutes(service: TeamsService): Router {
  const c = createTeamsController(service);
  const team = validate('params', TeamIdParamsSchema);
  const router = Router();

  router.use('/teams', requireUserRole);
  router.get('/teams', validate('query', TeamsQuerySchema), c.list);
  router.post('/teams', validate('body', CreateTeamSchema), c.create);
  // Before /teams/:id, which would refuse "choices" as an id.
  router.get('/teams/choices', validate('query', TeamChoicesQuerySchema), c.choices);
  router.get('/teams/:id', team, c.get);
  router.patch('/teams/:id', team, validate('body', UpdateTeamSchema), c.update);
  router.delete('/teams/:id', team, validate('body', DeleteTeamSchema), c.archive);
  router.post('/teams/:id/restore', team, c.restore);
  // A deleted team, for good, before its 30 days are over (owner, 2026-11-25).
  router.delete('/teams/:id/forever', team, c.deleteForGood);
  // Starred teams come first in my lists (owner, 2026-11-25); a star is mine only.
  router.put('/teams/:id/star', team, c.star);
  router.delete('/teams/:id/star', team, c.unstar);
  router.get('/teams/:id/member-suggestions', team, c.memberSuggestions);
  router.post('/teams/:id/members', team, validate('body', AddTeamMemberSchema), c.addMember);
  router.delete('/teams/:id/members/:userId', validate('params', TeamMemberParamsSchema), c.removeMember);
  router.put('/teams/:id/leader', team, validate('body', SetTeamLeaderSchema), c.handOver);
  return router;
}
