import type { Me, MockSignInRequest, WebsiteRole } from '@weekly-meeting/shared';
import { AppError } from '../../utils/errors.ts';
import type { Logger } from '../../utils/logger.ts';
import type { UsersRepository } from '../users/repository.ts';
import type { Session, SessionStore } from './sessions.ts';
import type { AuthConfig, AuthContext } from './types.ts';

export interface AuthService {
  mockSignIn(input: MockSignInRequest): Promise<{ me: Me; session: Session }>;
  toMe(ctx: AuthContext): Me;
  setActiveRole(ctx: AuthContext, role: WebsiteRole): Me;
  signOut(sessionId: string | undefined): void;
}

export function createAuthService(deps: {
  users: UsersRepository;
  sessions: SessionStore;
  config: AuthConfig;
  logger: Logger;
}): AuthService {
  const { users, sessions, config, logger } = deps;

  function toMe({ user, session }: AuthContext): Me {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      status: user.status,
      roles: user.roles,
      activeRole: session.activeRole,
      adminFromConfig: config.adminEmails.includes(user.email),
    };
  }

  return {
    async mockSignIn(input) {
      const email = input.email.trim().toLowerCase();
      const { id, created } = await users.upsertOnSignIn(email, input.name.trim());
      const adminFromConfig = config.adminEmails.includes(email);
      if (adminFromConfig) await users.ensureActiveAdmin(id);
      const user = await users.findById(id);
      if (!user) throw new Error('user vanished right after sign-in');
      const session = sessions.create(user.id, 'user');
      logger.info({ userId: user.id, created, adminFromConfig, status: user.status }, 'access: signed in');
      return { me: toMe({ user, session }), session };
    },

    toMe,

    setActiveRole(ctx, role) {
      if (ctx.user.status !== 'active') throw new AppError(403, 'account_inactive');
      if (!ctx.user.roles.includes(role)) throw new AppError(403, 'role_not_held');
      sessions.setActiveRole(ctx.session.id, role);
      logger.info({ userId: ctx.user.id, role }, 'access: active role changed');
      return toMe({ user: ctx.user, session: { ...ctx.session, activeRole: role } });
    },

    signOut(sessionId) {
      sessions.destroy(sessionId);
    },
  };
}
