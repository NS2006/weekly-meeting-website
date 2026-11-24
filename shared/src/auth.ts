export type UserStatus = 'active' | 'inactive';

/** Website roles (not team roles). A person can hold both; the one in use lives in the session. */
export type WebsiteRole = 'user' | 'admin';

/** The signed-in user, as GET /api/me returns it. Ids are strings (BIGINT in the database). */
export interface Me {
  id: string;
  name: string;
  email: string;
  status: UserStatus;
  roles: WebsiteRole[];
  activeRole: WebsiteRole;
  /** Listed in ADMIN_EMAILS: always an active admin, cannot be changed from the Users page. */
  adminFromConfig: boolean;
}

export interface MeResponse {
  user: Me;
}

/** POST /api/auth/mock-sign-in — development stand-in for Apps Gateway. No password, on purpose. */
export interface MockSignInRequest {
  email: string;
  name: string;
}

/** PUT /api/me/active-role */
export interface SetActiveRoleRequest {
  role: WebsiteRole;
}
