import type { CookieOptions, RequestHandler } from 'express';
import type { MeResponse, MockSignInRequest, SetActiveRoleRequest } from '@weekly-meeting/shared';
import { SESSION_COOKIE, authOf } from '../../middleware/authenticate.ts';
import { asyncHandler } from '../../utils/asyncHandler.ts';
import { readCookie } from '../../utils/cookies.ts';
import type { AuthService } from './service.ts';
import type { AuthConfig } from './types.ts';

export function createAuthController(service: AuthService, config: AuthConfig) {
  // HttpOnly: no script can read it. SameSite=Strict: never sent on a request started by another site (CSRF).
  const cookie: CookieOptions = { httpOnly: true, sameSite: 'strict', secure: config.secureCookies, path: '/' };

  const mockSignIn = asyncHandler(async (_req, res) => {
    const body = res.locals.validated.body as MockSignInRequest;
    const { me, session } = await service.mockSignIn(body);
    res.cookie(SESSION_COOKIE, session.id, { ...cookie, maxAge: config.sessionTtlMs });
    res.json({ user: me } satisfies MeResponse);
  });

  const signOut: RequestHandler = (req, res) => {
    service.signOut(readCookie(req.headers.cookie, SESSION_COOKIE));
    res.clearCookie(SESSION_COOKIE, cookie);
    res.status(204).end();
  };

  const me: RequestHandler = (_req, res) => {
    res.json({ user: service.toMe(authOf(res)) } satisfies MeResponse);
  };

  const setActiveRole: RequestHandler = (_req, res) => {
    const { role } = res.locals.validated.body as SetActiveRoleRequest;
    res.json({ user: service.setActiveRole(authOf(res), role) } satisfies MeResponse);
  };

  return { mockSignIn, signOut, me, setActiveRole };
}
