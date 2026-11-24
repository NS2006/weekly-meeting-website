import type { RequestHandler, Response } from 'express';
import type { SessionStore } from '../modules/auth/sessions.ts';
import type { AuthContext } from '../modules/auth/types.ts';
import type { UsersRepository } from '../modules/users/repository.ts';
import { asyncHandler } from '../utils/asyncHandler.ts';
import { readCookie } from '../utils/cookies.ts';
import { AppError } from '../utils/errors.ts';

export const SESSION_COOKIE = 'wm_session';

/**
 * Finds the session from the cookie and reads the user from the database on every request, so a deactivation
 * or a removed role takes effect at once, even for a session that is already open. 401 `unauthenticated` otherwise.
 */
export function authenticate(deps: { sessions: SessionStore; users: UsersRepository }): RequestHandler {
  return asyncHandler(async (req, res, next) => {
    const session = deps.sessions.get(readCookie(req.headers.cookie, SESSION_COOKIE));
    if (!session) throw new AppError(401, 'unauthenticated');
    const user = await deps.users.findById(session.userId);
    if (!user) {
      deps.sessions.destroy(session.id);
      throw new AppError(401, 'unauthenticated');
    }
    // The admin role was taken away while signed in as admin: fall back to the plain user role.
    if (!user.roles.includes(session.activeRole)) deps.sessions.setActiveRole(session.id, 'user');
    const auth: AuthContext = { session, user };
    res.locals.auth = auth;
    next();
  });
}

/** After authenticate(): refuses inactive users with 403 `account_inactive`. */
export const requireActive: RequestHandler = (_req, res, next) => {
  next(authOf(res).user.status === 'active' ? undefined : new AppError(403, 'account_inactive'));
};

/**
 * After requireActive(): the user holds the admin role and is currently acting as admin (the role picked in
 * "Change Role"). 403 `admin_only` otherwise.
 */
export const requireAdminRole: RequestHandler = (_req, res, next) => {
  const { user, session } = authOf(res);
  next(user.roles.includes('admin') && session.activeRole === 'admin' ? undefined : new AppError(403, 'admin_only'));
};

/**
 * After requireActive(): the user is acting in the User role. Acting as Admin is for managing people only, so
 * team (and later project and note) routes refuse it with 403 `user_role_only`.
 */
export const requireUserRole: RequestHandler = (_req, res, next) => {
  next(authOf(res).session.activeRole === 'user' ? undefined : new AppError(403, 'user_role_only'));
};

export function authOf(res: Response): AuthContext {
  const auth = res.locals.auth as AuthContext | undefined;
  if (!auth) throw new Error('authenticate() must run before this handler');
  return auth;
}
