import type { UserStatus, WebsiteRole } from '@weekly-meeting/shared';
import type { Db } from '../../database/pool.ts';
import { likePattern } from '../../utils/sql.ts';

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  status: UserStatus;
  roles: WebsiteRole[];
}

export interface UserListRow extends UserRecord {
  createdAt: Date;
  lastLoginAt: Date | null;
  waiting: boolean;
}

export interface UserListFilters {
  id?: string;
  /** Matches anywhere in the name or email, case-insensitive. */
  q?: string;
  /** `waiting`: inactive, and signed in after their last deactivation (or never deactivated). */
  status?: UserStatus | 'waiting';
  /** true: admins only; false: everyone without the admin role. */
  admin?: boolean;
  limit: number;
}

export interface UsersRepository {
  /** Creates the user (inactive, role `user`) on first sign-in, or updates the name; records the sign-in time. */
  upsertOnSignIn(email: string, name: string): Promise<{ id: string; created: boolean }>;
  /** Makes the user an active admin (users listed in ADMIN_EMAILS). */
  ensureActiveAdmin(id: string): Promise<void>;
  findById(id: string): Promise<UserRecord | null>;
  countActiveAdmins(): Promise<number>;
  list(filters: UserListFilters): Promise<UserListRow[]>;
  /** Locks the users' rows until the transaction ends, always in id order so two changes cannot deadlock. */
  lockForUpdate(ids: string[]): Promise<void>;
  /** Deactivating records when, so a later sign-in shows them as waiting again. */
  setStatus(id: string, status: UserStatus): Promise<void>;
  grantAdmin(id: string): Promise<void>;
  removeAdmin(id: string): Promise<void>;
  /** Active users whose name or email contains `q`, by name: the people picker. */
  searchActive(q: string, limit: number): Promise<{ id: string; name: string; email: string }[]>;
}

/** Inactive and signed in, without a deactivation after that sign-in (AdminUser.waiting). */
const WAITING =
  "(u.status = 'inactive' AND u.last_login_at IS NOT NULL AND (u.deactivated_at IS NULL OR u.last_login_at > u.deactivated_at))";

// role::text so pg returns a JS array (it cannot parse arrays of a custom enum type).
const ROLES = "COALESCE(array_agg(r.role::text ORDER BY r.role) FILTER (WHERE r.role IS NOT NULL), '{}')";

export function createUsersRepository(db: Db): UsersRepository {
  return {
    async upsertOnSignIn(email, name) {
      // xmax = 0 only for a freshly inserted row: tells a first sign-in from a returning one.
      const { rows } = await db.query<{ id: string; created: boolean }>(
        `WITH upserted AS (
           INSERT INTO users (name, email, last_login_at) VALUES ($1, $2, now())
           ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, last_login_at = now()
           RETURNING id, (xmax = 0) AS created
         ), base_role AS (
           INSERT INTO user_roles (user_id, role) SELECT id, 'user' FROM upserted
           ON CONFLICT DO NOTHING
         )
         SELECT id, created FROM upserted`,
        [name, email],
      );
      const row = rows[0];
      if (!row) throw new Error('upsertOnSignIn returned no row');
      return row;
    },

    async ensureActiveAdmin(id) {
      await db.query(
        `WITH activated AS (
           UPDATE users SET status = 'active' WHERE id = $1 RETURNING id
         )
         INSERT INTO user_roles (user_id, role) SELECT id, 'admin' FROM activated
         ON CONFLICT DO NOTHING`,
        [id],
      );
    },

    async findById(id) {
      const { rows } = await db.query<UserRecord>(
        `SELECT u.id, u.name, u.email, u.status, ${ROLES} AS roles
           FROM users u
           LEFT JOIN user_roles r ON r.user_id = u.id
          WHERE u.id = $1
          GROUP BY u.id`,
        [id],
      );
      return rows[0] ?? null;
    },

    async countActiveAdmins() {
      const { rows } = await db.query<{ count: number }>(
        `SELECT count(*)::int AS count
           FROM users u JOIN user_roles r ON r.user_id = u.id AND r.role = 'admin'
          WHERE u.status = 'active'`,
      );
      return rows[0]?.count ?? 0;
    },

    async list({ id, q, status, admin, limit }) {
      const { rows } = await db.query<UserListRow>(
        `SELECT u.id, u.name, u.email, u.status, ${ROLES} AS roles,
                u.created_at AS "createdAt", u.last_login_at AS "lastLoginAt", ${WAITING} AS waiting
           FROM users u
           LEFT JOIN user_roles r ON r.user_id = u.id
          WHERE ($1::uuid IS NULL OR u.id = $1)
            AND ($2::text IS NULL OR u.name ILIKE $2 OR u.email ILIKE $2)
            AND ($3::user_status IS NULL OR u.status = $3)
            AND (NOT $6::boolean OR ${WAITING})
          GROUP BY u.id
         HAVING ($4::boolean IS NULL OR COALESCE(bool_or(r.role = 'admin'), false) = $4)
          ORDER BY u.last_login_at DESC NULLS LAST, u.id DESC
          LIMIT $5`,
        [id ?? null, q ? likePattern(q) : null, status && status !== 'waiting' ? status : null, admin ?? null, limit, status === 'waiting'],
      );
      return rows;
    },

    async lockForUpdate(ids) {
      await db.query('SELECT id FROM users WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE', [ids]);
    },

    async setStatus(id, status) {
      await db.query(
        `UPDATE users SET status = $2::user_status,
                deactivated_at = CASE WHEN $2::user_status = 'inactive' THEN now() ELSE deactivated_at END
          WHERE id = $1`,
        [id, status],
      );
    },

    async grantAdmin(id) {
      await db.query("INSERT INTO user_roles (user_id, role) VALUES ($1, 'admin') ON CONFLICT DO NOTHING", [id]);
    },

    async removeAdmin(id) {
      await db.query("DELETE FROM user_roles WHERE user_id = $1 AND role = 'admin'", [id]);
    },

    async searchActive(q, limit) {
      const { rows } = await db.query<{ id: string; name: string; email: string }>(
        `SELECT id, name, email FROM users
          WHERE status = 'active' AND (name ILIKE $1 OR email ILIKE $1)
          ORDER BY lower(name), id
          LIMIT $2`,
        [likePattern(q), limit],
      );
      return rows;
    },
  };
}
