import type { AdminUser, AdminUsersQuery, AdminUsersResponse, PeopleSearchResponse, UserStatus } from '@weekly-meeting/shared';
import type { Database } from '../../database/pool.ts';
import { AppError } from '../../utils/errors.ts';
import type { Logger } from '../../utils/logger.ts';
import type { AuthConfig, AuthContext } from '../auth/types.ts';
import { createTeamsRepository } from '../teams/repository.ts';
import { createUsersRepository, type UserListRow, type UsersRepository } from './repository.ts';
import type { Db } from '../../database/pool.ts';
import { PEOPLE_SEARCH_LIMIT, USER_LIST_LIMIT } from './types.ts';

export interface UsersService {
  list(query: AdminUsersQuery): Promise<AdminUsersResponse>;
  setStatus(actor: AuthContext, targetId: string, status: UserStatus): Promise<AdminUser>;
  setAdmin(actor: AuthContext, targetId: string, admin: boolean): Promise<AdminUser>;
  /** Any active user: find active people by name or email (name and email only). */
  searchPeople(q: string): Promise<PeopleSearchResponse>;
}

export function createUsersService(deps: { db: Database; config: AuthConfig; logger: Logger }): UsersService {
  const { db, config, logger } = deps;
  const users = createUsersRepository(db);

  function toAdminUser(row: UserListRow): AdminUser {
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      status: row.status,
      roles: row.roles,
      adminFromConfig: config.adminEmails.includes(row.email),
      createdAt: row.createdAt.toISOString(),
      lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
      waiting: row.waiting,
    };
  }

  /**
   * Every change follows the same rules (PRD section 9):
   * - nobody changes their own account (403 cannot_change_self), so nobody locks themselves out;
   * - ADMIN_EMAILS accounts are fixed (409 admin_from_config);
   * - both rows are locked first (in id order) and the actor is checked again inside the transaction, so two
   *   admins removing each other at the same moment cannot both succeed: the second one is no longer an admin.
   */
  async function change(
    actor: AuthContext,
    targetId: string,
    apply: (tx: UsersRepository, q: Db) => Promise<void>,
  ): Promise<AdminUser> {
    if (actor.user.id === targetId) throw new AppError(403, 'cannot_change_self');
    return db.transaction(async (q) => {
      const tx = createUsersRepository(q);
      await tx.lockForUpdate([actor.user.id, targetId]);
      const target = await tx.findById(targetId);
      if (!target) throw new AppError(404, 'not_found');
      if (config.adminEmails.includes(target.email)) throw new AppError(409, 'admin_from_config');
      const current = await tx.findById(actor.user.id);
      if (!current || current.status !== 'active' || !current.roles.includes('admin')) {
        throw new AppError(403, 'admin_only');
      }
      await apply(tx, q);
      const [updated] = await tx.list({ id: targetId, limit: 1 });
      if (!updated) throw new Error('changed user vanished');
      return toAdminUser(updated);
    });
  }

  return {
    async list(query) {
      const rows = await users.list({
        q: query.q || undefined,
        status: query.status,
        admin: query.admin === undefined ? undefined : query.admin === 'true',
        limit: USER_LIST_LIMIT + 1,
      });
      return { users: rows.slice(0, USER_LIST_LIMIT).map(toAdminUser), truncated: rows.length > USER_LIST_LIMIT };
    },

    async setStatus(actor, targetId, status) {
      let passed: { teamId: string; newLeaderId: string }[] = [];
      const user = await change(actor, targetId, async (tx, q) => {
        await tx.setStatus(targetId, status);
        // A deactivated leader cannot manage their teams: hand each one to its longest-standing active member.
        if (status === 'inactive') passed = await createTeamsRepository(q).passLeadershipFrom(targetId);
      });
      logger.info({ actorId: actor.user.id, targetId, status }, 'access: user status changed');
      for (const { teamId, newLeaderId } of passed) {
        logger.info({ teamId, fromUserId: targetId, newLeaderId }, 'team: leader handed over on deactivation');
      }
      return user;
    },

    async setAdmin(actor, targetId, admin) {
      const user = await change(actor, targetId, (tx) => (admin ? tx.grantAdmin(targetId) : tx.removeAdmin(targetId)));
      logger.info({ actorId: actor.user.id, targetId, admin }, 'access: admin role changed');
      return user;
    },

    async searchPeople(q) {
      return { users: await users.searchActive(q, PEOPLE_SEARCH_LIMIT) };
    },
  };
}
