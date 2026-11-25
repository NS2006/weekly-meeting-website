import type {
  CreateTeamRequest,
  PersonResult,
  TeamChoicesResponse,
  TeamDetail,
  TeamRole,
  TeamStarResponse,
  TeamSummary,
  TeamsQuery,
  TeamsResponse,
  UpdateTeamRequest,
} from '@weekly-meeting/shared';
import type { Database, Db } from '../../database/pool.ts';
import { AppError } from '../../utils/errors.ts';
import type { Logger } from '../../utils/logger.ts';
import type { AuthContext } from '../auth/types.ts';
import { todayInJakarta } from '../../utils/dates.ts';
import { createMeetingsRepository } from '../meetings/repository.ts';
import { HORIZON_DAYS } from '../meetings/types.ts';
import { createUsersRepository } from '../users/repository.ts';
import { createTeamsRepository, type LockedTeam, type TeamRow, type TeamsRepository } from './repository.ts';
import { FOUND_CHOICES, MEMBER_SUGGESTIONS, RANDOM_CHOICES } from './types.ts';

export interface TeamsService {
  list(actor: AuthContext, filters?: TeamsQuery): Promise<TeamsResponse>;
  get(actor: AuthContext, teamId: string): Promise<TeamDetail>;
  /** Teams I am in, to pick from: a few at random, or the ones whose name holds `q`. */
  choices(actor: AuthContext, q: string | undefined): Promise<TeamChoicesResponse>;
  create(actor: AuthContext, input: CreateTeamRequest): Promise<TeamDetail>;
  update(actor: AuthContext, teamId: string, input: UpdateTeamRequest): Promise<TeamDetail>;
  addMember(actor: AuthContext, teamId: string, userId: string): Promise<TeamDetail>;
  /** The leader's "Add people" before typing: a few random active people not in the team yet. */
  suggestMembers(actor: AuthContext, teamId: string): Promise<PersonResult[]>;
  /** The leader removes a member, or a member removes themselves (leaves). */
  removeMember(actor: AuthContext, teamId: string, userId: string): Promise<void>;
  /** Hands leadership to a member: they become leader, the actor a member. */
  handOver(actor: AuthContext, teamId: string, userId: string): Promise<TeamDetail>;
  archive(actor: AuthContext, teamId: string, confirmName: string): Promise<TeamDetail>;
  restore(actor: AuthContext, teamId: string): Promise<TeamDetail>;
  /**
   * Deletes a deleted team for good before its 30 days are over (owner, 2026-11-25: from the Deleted teams list).
   * Its leader only, and only once it is deleted (409 `team_not_deleted`): a live team is deleted with its typed
   * name first.
   */
  deleteForGood(actor: AuthContext, teamId: string): Promise<void>;
  /** Stars a team I can see, or takes the star off: only for me; 404 for a team I may not see. */
  star(actor: AuthContext, teamId: string, starred: boolean): Promise<TeamStarResponse>;
  purgeExpired(): Promise<number>;
}

function toSummary(row: TeamRow): TeamSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    myRole: row.myRole,
    leader: row.leaderId ? { id: row.leaderId, name: row.leaderName ?? '' } : null,
    memberCount: row.memberCount,
    createdAt: row.createdAt.toISOString(),
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    purgeAt: row.purgeAt ? row.purgeAt.toISOString() : null,
    periodsPerYear: row.periodsPerYear,
    yearStartMonth: row.yearStartMonth,
    starred: row.starred,
  };
}

export function createTeamsService(deps: { db: Database; logger: Logger }): TeamsService {
  const { db, logger } = deps;
  const teams = createTeamsRepository(db);

  async function detail(repo: TeamsRepository, teamId: string, userId: string): Promise<TeamDetail> {
    const row = await repo.findForUser(teamId, userId);
    if (!row) throw new AppError(404, 'not_found');
    const members = await repo.members(teamId);
    return {
      ...toSummary(row),
      members: members.map((m) => ({ ...m, addedAt: m.addedAt.toISOString() })),
    };
  }

  /**
   * Runs a change on one team: locks the team row (so two changes to the same team never interleave), then
   * re-checks the actor's role inside the transaction. Outsiders get 404 so the team's existence stays hidden.
   */
  async function inTeam<T>(
    actor: AuthContext,
    teamId: string,
    rules: { leader: boolean; archived?: 'refuse' | 'only' },
    work: (ctx: { tx: Db; repo: TeamsRepository; team: LockedTeam; role: TeamRole }) => Promise<T>,
  ): Promise<T> {
    return db.transaction(async (tx) => {
      const repo = createTeamsRepository(tx);
      const team = await repo.lock(teamId);
      const role = team ? await repo.roleOf(teamId, actor.user.id) : null;
      if (!team || !role) throw new AppError(404, 'not_found');
      if (team.archivedAt && role !== 'leader') throw new AppError(404, 'not_found');
      if (rules.leader && role !== 'leader') throw new AppError(403, 'not_team_leader');
      if ((rules.archived ?? 'refuse') === 'refuse' && team.archivedAt) throw new AppError(409, 'team_archived');
      return work({ tx, repo, team, role });
    });
  }

  return {
    async list(actor, filters = {}) {
      const rows = (await teams.listForUser(actor.user.id, filters)).map(toSummary);
      return { teams: rows.filter((t) => !t.archivedAt), archived: rows.filter((t) => t.archivedAt) };
    },

    get: (actor, teamId) => detail(teams, teamId, actor.user.id),

    async choices(actor, q) {
      if (!q) return { teams: await teams.randomChoices(actor.user.id, RANDOM_CHOICES), hasMore: false };
      const rows = await teams.findChoices(actor.user.id, q, FOUND_CHOICES + 1);
      return { teams: rows.slice(0, FOUND_CHOICES), hasMore: rows.length > FOUND_CHOICES };
    },

    async create(actor, input) {
      const team = await db.transaction(async (tx) => {
        const repo = createTeamsRepository(tx);
        const id = await repo.create(input.name, input.description ?? null, actor.user.id);
        return detail(repo, id, actor.user.id);
      });
      logger.info({ actorId: actor.user.id, teamId: team.id }, 'team: created');
      return team;
    },

    update: (actor, teamId, input) =>
      inTeam(actor, teamId, { leader: true }, async ({ repo }) => {
        await repo.update(teamId, input);
        return detail(repo, teamId, actor.user.id);
      }),

    async addMember(actor, teamId, userId) {
      const team = await inTeam(actor, teamId, { leader: true }, async ({ tx, repo }) => {
        const person = await createUsersRepository(tx).findById(userId);
        // Missing and inactive look the same: no hint about which ids exist.
        if (!person || person.status !== 'active') throw new AppError(409, 'user_not_active');
        if (!(await repo.addMember(teamId, userId, actor.user.id))) throw new AppError(409, 'already_member');
        return detail(repo, teamId, actor.user.id);
      });
      logger.info({ actorId: actor.user.id, teamId, userId }, 'team: member added');
      return team;
    },

    // A read: no row lock, but the same rules as adding (outsiders 404, members 403, deleted team 409).
    async suggestMembers(actor, teamId) {
      const team = await teams.findForUser(teamId, actor.user.id);
      if (!team) throw new AppError(404, 'not_found');
      if (team.myRole !== 'leader') throw new AppError(403, 'not_team_leader');
      if (team.archivedAt) throw new AppError(409, 'team_archived');
      return teams.suggestNonMembers(teamId, MEMBER_SUGGESTIONS);
    },

    async removeMember(actor, teamId, userId) {
      const leaving = userId === actor.user.id;
      await inTeam(actor, teamId, { leader: !leaving }, async ({ repo, role }) => {
        if (leaving) {
          if (role === 'leader') throw new AppError(409, 'leader_cannot_leave');
        } else if (!(await repo.roleOf(teamId, userId))) {
          throw new AppError(409, 'not_a_member');
        }
        await repo.removeMember(teamId, userId);
      });
      logger.info({ actorId: actor.user.id, teamId, userId, leaving }, 'team: member removed');
    },

    async handOver(actor, teamId, userId) {
      const team = await inTeam(actor, teamId, { leader: true }, async ({ tx, repo }) => {
        if (userId !== actor.user.id) {
          if (!(await repo.roleOf(teamId, userId))) throw new AppError(409, 'not_a_member');
          const person = await createUsersRepository(tx).findById(userId);
          if (!person || person.status !== 'active') throw new AppError(409, 'user_not_active');
          // Demote first: the partial unique index allows at most one leader at any moment.
          await repo.setRole(teamId, actor.user.id, 'member');
          await repo.setRole(teamId, userId, 'leader');
        }
        // The actor is now a member: read the team as they see it.
        return detail(repo, teamId, actor.user.id);
      });
      logger.info({ actorId: actor.user.id, teamId, newLeaderId: userId }, 'team: leader handed over');
      return team;
    },

    async archive(actor, teamId, confirmName) {
      const team = await inTeam(actor, teamId, { leader: true }, async ({ repo, team: locked }) => {
        if (confirmName.trim() !== locked.name) throw new AppError(400, 'confirmation_mismatch');
        await repo.setArchived(teamId, true);
        return detail(repo, teamId, actor.user.id);
      });
      logger.info({ actorId: actor.user.id, teamId }, 'team: archived');
      return team;
    },

    async star(actor, teamId, starred) {
      // Seen as on the team page: a member, and a deleted team only for its leader.
      if (!(await teams.findForUser(teamId, actor.user.id))) throw new AppError(404, 'not_found');
      await teams.setStarred(teamId, actor.user.id, starred);
      return { starred };
    },

    async restore(actor, teamId) {
      const team = await inTeam(actor, teamId, { leader: true, archived: 'only' }, async ({ tx, repo, team: locked }) => {
        if (locked.archivedAt) {
          if (locked.expired) throw new AppError(409, 'team_expired');
          await repo.setArchived(teamId, false);
          // Its schedules were paused while deleted: bring their next weeks back now.
          await createMeetingsRepository(tx).generate(todayInJakarta(), HORIZON_DAYS, { teamId });
        }
        return detail(repo, teamId, actor.user.id);
      });
      logger.info({ actorId: actor.user.id, teamId }, 'team: restored');
      return team;
    },

    async deleteForGood(actor, teamId) {
      await inTeam(actor, teamId, { leader: true, archived: 'only' }, async ({ repo, team: locked }) => {
        if (!locked.archivedAt) throw new AppError(409, 'team_not_deleted');
        await repo.remove(teamId);
      });
      logger.info({ actorId: actor.user.id, teamId }, 'team: deleted for good');
    },

    purgeExpired: () => teams.purgeExpired(),
  };
}
