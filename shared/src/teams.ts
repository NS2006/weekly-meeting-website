import type { UserStatus } from './auth.ts';
import type { PeriodsPerYear } from './periods.ts';

/** Exactly one leader per team; everyone else is a member. */
export type TeamRole = 'leader' | 'member';

export interface TeamSummary {
  id: string;
  name: string;
  description: string | null;
  myRole: TeamRole;
  leader: { id: string; name: string } | null;
  memberCount: number;
  createdAt: string;
  /** Set when the leader deleted the team; it can be restored until `purgeAt`. */
  archivedAt: string | null;
  /** When an archived team is deleted for good (archivedAt + 30 days). */
  purgeAt: string | null;
  /** How the team splits its year (4 quarters from January by default). */
  periodsPerYear: PeriodsPerYear;
  yearStartMonth: number;
}

export interface TeamMemberView {
  userId: string;
  name: string;
  email: string;
  status: UserStatus;
  role: TeamRole;
  addedAt: string;
}

export interface TeamDetail extends TeamSummary {
  members: TeamMemberView[];
}

export type TeamSort = 'name' | 'newest' | 'members';

/** GET /api/teams filters, all optional; they apply to both lists. */
export interface TeamsQuery {
  /** Text in the team's name or description. */
  q?: string;
  /** Only teams where I have this role. */
  role?: TeamRole;
  /** Name A–Z (default), newest first, or most members first. */
  sort?: TeamSort;
}

/** GET /api/teams — my teams, and the deleted (archived) teams I still lead and can restore. */
export interface TeamsResponse {
  teams: TeamSummary[];
  archived: TeamSummary[];
}

export interface TeamResponse {
  team: TeamDetail;
}

/** A team to pick (a filter): just what names it. */
export interface TeamChoice {
  id: string;
  name: string;
}

/**
 * GET /api/teams/choices: the teams I am in (not deleted ones). Without `q`, a few at random (each call another
 * pick); with `q`, the ones whose name holds it, A–Z.
 */
export interface TeamChoicesQuery {
  q?: string;
}

export interface TeamChoicesResponse {
  teams: TeamChoice[];
  /** More teams match than were sent (type more to narrow them). */
  hasMore: boolean;
}

/** POST /api/teams */
export interface CreateTeamRequest {
  name: string;
  description?: string | null;
}

/** PATCH /api/teams/:id (the leader). */
export interface UpdateTeamRequest {
  name?: string;
  description?: string | null;
  /** How the year is split into periods, and the month it starts. */
  periodsPerYear?: PeriodsPerYear;
  yearStartMonth?: number;
}

/** POST /api/teams/:id/members */
export interface AddTeamMemberRequest {
  userId: string;
}

/** PUT /api/teams/:id/leader — hand leadership to this member; the current leader becomes a member. */
export interface SetTeamLeaderRequest {
  userId: string;
}

/** DELETE /api/teams/:id — the team's exact name, typed by the leader. */
export interface DeleteTeamRequest {
  confirmName: string;
}

/** GET /api/users/search?q= and GET /api/teams/:id/member-suggestions — active people to add to a team. */
export interface PersonResult {
  id: string;
  name: string;
  email: string;
}

export interface PeopleSearchResponse {
  users: PersonResult[];
}
