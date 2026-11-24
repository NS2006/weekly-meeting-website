import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.ts';
import { validate } from '../../middleware/validate.ts';
import type { UsersRepository } from '../users/repository.ts';
import { createAuthController } from './controller.ts';
import type { AuthService } from './service.ts';
import type { SessionStore } from './sessions.ts';
import { MockSignInSchema, SetActiveRoleSchema, type AuthConfig } from './types.ts';

export function createAuthRoutes(deps: {
  service: AuthService;
  config: AuthConfig;
  sessions: SessionStore;
  users: UsersRepository;
}): Router {
  const controller = createAuthController(deps.service, deps.config);
  const signedIn = authenticate(deps);
  const router = Router();

  // Not registered at all in production: the route does not exist there.
  if (deps.config.mockSignIn) router.post('/auth/mock-sign-in', validate('body', MockSignInSchema), controller.mockSignIn);
  router.post('/auth/sign-out', controller.signOut);
  // Inactive users may read who they are (the waiting page needs it); nothing else.
  router.get('/me', signedIn, controller.me);
  router.put('/me/active-role', signedIn, validate('body', SetActiveRoleSchema), controller.setActiveRole);
  return router;
}
