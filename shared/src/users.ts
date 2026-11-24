import type { UserStatus, WebsiteRole } from './auth.ts';

/** One row of the admin Users page. Timestamps are ISO 8601 strings. */
export interface AdminUser {
  id: string;
  name: string;
  email: string;
  status: UserStatus;
  roles: WebsiteRole[];
  /** In ADMIN_EMAILS: always an active admin; the Users page cannot change this account. */
  adminFromConfig: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  /**
   * Waiting for access (owner, 2026-11-24): inactive, and signed in without having been deactivated since (a new
   * person, or someone deactivated who signed in again). Someone who was deactivated and has not come back is not.
   */
  waiting: boolean;
}

/** GET /api/admin/users?q=&status=&admin= — newest sign-in first, at most `limit` rows. */
export interface AdminUsersResponse {
  users: AdminUser[];
  /** More users match than were returned; narrow the search. */
  truncated: boolean;
}

export interface AdminUsersQuery {
  q?: string;
  /** `waiting`: the inactive people who are waiting for access (see AdminUser.waiting). */
  status?: UserStatus | 'waiting';
  admin?: 'true' | 'false';
}

/** PATCH /api/admin/users/:id */
export interface UpdateUserStatusRequest {
  status: UserStatus;
}

/** Answer of PATCH /api/admin/users/:id and PUT/DELETE /api/admin/users/:id/roles/admin */
export interface AdminUserResponse {
  user: AdminUser;
}
