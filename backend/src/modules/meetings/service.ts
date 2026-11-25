import type {
  ArrangeNotesRequest,
  ArrangeSpeakersRequest,
  CreateSeriesRequest,
  EditorDoc,
  MeetingBoardColumn,
  MeetingBoardResponse,
  MeetingDetail,
  MeetingNoteCard,
  MeetingNoteDetail,
  MyMeetingsQuery,
  MeetingSeriesView,
  MeetingsResponse,
  UpcomingMeetingsResponse,
  MeetingView,
  PeriodDetail,
  PeriodNotesResponse,
  PeriodSummary,
  ScheduleMeetingsResponse,
  TeamPeriodsResponse,
  CurrentPeriodsResponse,
  YearSplit,
  TeamRole,
  UpdateMeetingRequest,
  UpdateSeriesRequest,
} from '@weekly-meeting/shared';
import type { Database, Db } from '../../database/pool.ts';
import { addDays, todayInJakarta } from '../../utils/dates.ts';
import { AppError } from '../../utils/errors.ts';
import type { Logger } from '../../utils/logger.ts';
import type { AuthContext } from '../auth/types.ts';
import { ATTACHMENT_SRC, EMPTY_DOC } from '../notes/content.ts';
import { createTeamsRepository } from '../teams/repository.ts';
import {
  createMeetingsRepository,
  type BoardNoteRow,
  type MeetingDayRow,
  type MeetingRow,
  type MeetingsRepository,
  type SeriesRow,
} from './repository.ts';
import {
  nextPeriod,
  parsePeriodKey,
  periodOf,
  periodProgress,
  periodsFrom,
  periodStatus,
  previousPeriod,
  type Period,
} from './periods.ts';
import {
  HOME_DAYS,
  HORIZON_DAYS,
  MAX_SERIES_PER_TEAM,
  MOVE_MAX_DAYS,
  MY_UPCOMING_LIMIT,
  PAST_PAGE_SIZE,
  SCHEDULE_WINDOW,
  type PeriodNotesPick,
} from './types.ts';

export interface MeetingsService {
  listSeries(actor: AuthContext, teamId: string): Promise<MeetingSeriesView[]>;
  createSeries(actor: AuthContext, teamId: string, input: CreateSeriesRequest): Promise<MeetingSeriesView>;
  updateSeries(actor: AuthContext, seriesId: string, input: UpdateSeriesRequest): Promise<MeetingSeriesView>;
  deleteSeries(actor: AuthContext, seriesId: string): Promise<void>;
  listForTeam(actor: AuthContext, teamId: string, page: { when: 'upcoming' | 'past'; offset: number; limit?: number }): Promise<MeetingsResponse>;
  /** Home: a page of my teams' meetings of the next four weeks, soonest first, with how many there are. */
  upcomingForMe(actor: AuthContext, page: { offset: number; limit: number }): Promise<UpcomingMeetingsResponse>;
  /** The Meetings page: my teams' meetings, upcoming or past, with its filters. */
  listForMe(actor: AuthContext, query: MyMeetingsQuery): Promise<MeetingsResponse>;
  get(actor: AuthContext, meetingId: string): Promise<MeetingDetail>;
  /** The "jump to" list: the meetings of this meeting's schedule around it (team members only). */
  schedule(actor: AuthContext, meetingId: string): Promise<ScheduleMeetingsResponse>;
  /** The team's periods (quarters by default) with their counts (team members only). */
  periods(actor: AuthContext, teamId: string): Promise<TeamPeriodsResponse>;
  /** One period of the team and its meetings; 404 when the key does not fit the team's split. */
  period(actor: AuthContext, teamId: string, key: string): Promise<PeriodDetail>;
  /** The whole period to read: its meetings with notes, people in board order, notes in full. */
  periodNotes(actor: AuthContext, teamId: string, key: string, pick?: PeriodNotesPick): Promise<PeriodNotesResponse>;
  /** The current period of each of my teams (Home). */
  currentPeriods(actor: AuthContext): Promise<CurrentPeriodsResponse>;
  update(actor: AuthContext, meetingId: string, input: UpdateMeetingRequest): Promise<MeetingDetail>;
  /** FR-10: the meeting's board, one column per person with the notes linked to the meeting (team members only). */
  board(actor: AuthContext, meetingId: string): Promise<MeetingBoardResponse>;
  /** The meeting's speaking order (the team's leader): every person on the board, once. Answers the board. */
  arrangeSpeakers(actor: AuthContext, meetingId: string, input: ArrangeSpeakersRequest): Promise<MeetingBoardResponse>;
  /** The order of one person's notes on the meeting (that person, or the team's leader). Answers the board. */
  arrangeNotes(actor: AuthContext, meetingId: string, input: ArrangeNotesRequest): Promise<MeetingBoardResponse>;
  /** One note on the board, read-only for teammates (team members only, and only if it is linked here). */
  boardNote(actor: AuthContext, meetingId: string, noteId: string): Promise<MeetingNoteDetail>;
  /**
   * The job: stores `done` on past meetings and tops up the next HORIZON_DAYS of every active series. `only`
   * narrows it to one team (tests share the development database and must not touch other teams).
   */
  refresh(only?: { teamId: string }): Promise<{ done: number; created: number }>;
}

const toSeries = (row: SeriesRow): MeetingSeriesView => ({ ...row, createdAt: row.createdAt.toISOString() });
const toMeeting = (row: MeetingRow): MeetingView => row;

const toCard = (row: BoardNoteRow): MeetingNoteCard => ({
  id: row.id,
  title: row.title,
  snippet: row.snippet,
  projects: row.projects,
  // Only our own attachment URLs (the editor schema allows nothing else; checked again before it reaches an <img>).
  coverUrl: row.coverSrc && ATTACHMENT_SRC.test(row.coverSrc) ? row.coverSrc : null,
  imageCount: row.imageCount,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

/**
 * Board columns without a place in the speaking order: the leader, then active members, then people who left or were
 * deactivated (by name within each). The same for everyone, so the screen shared in the meeting matches each laptop.
 */
function columnRank(column: MeetingBoardColumn): number {
  if (column.role === 'leader') return 0;
  return column.role && column.active ? 1 : 2;
}

const splitOf = (row: { periodsPerYear: YearSplit['periodsPerYear']; yearStartMonth: number }): YearSplit => ({
  periodsPerYear: row.periodsPerYear,
  yearStartMonth: row.yearStartMonth,
});

/** A period with its counts: the meetings (by day) that fall in it. */
function summarize(period: Period, days: readonly MeetingDayRow[], today: string): PeriodSummary {
  const inside = days.filter((d) => d.date >= period.start && d.date <= period.end);
  return {
    key: period.key,
    label: period.label,
    start: period.start,
    end: period.end,
    status: periodStatus(period, today),
    meetingCount: inside.filter((d) => d.status !== 'cancelled').length,
    cancelledCount: inside.filter((d) => d.status === 'cancelled').length,
    noteCount: inside.reduce((sum, d) => sum + d.noteCount, 0),
    ...periodProgress(period, today),
  };
}

/**
 * The periods a team page lists: from the one of its first meeting (or the current one, if earlier or there are none)
 * to the one after the current one, or further when meetings already exist there.
 */
function periodRange(days: readonly MeetingDayRow[], split: YearSplit, today: string): Period[] {
  const current = periodOf(today, split);
  const firstDay = days[0]?.date;
  const lastDay = days[days.length - 1]?.date;
  const first = firstDay && firstDay < current.start ? periodOf(firstDay, split) : current;
  const afterCurrent = nextPeriod(current, split);
  const last = lastDay && lastDay > afterCurrent.end ? periodOf(lastDay, split) : afterCurrent;
  return periodsFrom(first, last, split);
}

/** A note that nothing was written in yet (no title, text or image): left out of the whole-period view. */
const isBlank = (card: { title: string; snippet: string; imageCount: number }) => !card.title && !card.snippet && card.imageCount === 0;

/** The same ids, each once, in any order. */
function sameIds(a: readonly string[], b: readonly string[]): boolean {
  const set = new Set(a);
  return set.size === a.length && a.length === b.length && b.every((id) => set.has(id));
}

/** `after` is `before` with only `who` moved: everyone else in the same order. */
function movedOnly(before: readonly string[], after: readonly string[], who: string): boolean {
  const a = before.filter((id) => id !== who);
  const b = after.filter((id) => id !== who);
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/** `now` is injectable so tests can pin "today" in Indonesia time. */
export function createMeetingsService(deps: { db: Database; logger: Logger; now?: () => Date }): MeetingsService {
  const { db, logger } = deps;
  const today = () => todayInJakarta(deps.now?.() ?? new Date());
  const meetings = createMeetingsRepository(db);
  const teams = createTeamsRepository(db);

  /** The actor's role in a team they may see (404 otherwise, the same as the team pages). */
  async function roleIn(teamId: string, userId: string): Promise<TeamRole> {
    const team = await teams.findForUser(teamId, userId);
    if (!team) throw new AppError(404, 'not_found');
    return team.myRole;
  }

  /**
   * A change by the team's leader: locks the team row (every schedule and meeting change of a team runs one at a
   * time, in the same order as team changes), then re-checks the actor inside the transaction. Outsiders get 404.
   */
  async function asLeader<T>(
    actor: AuthContext,
    teamId: string,
    work: (ctx: { tx: Db; repo: MeetingsRepository; day: string }) => Promise<T>,
  ): Promise<T> {
    return db.transaction(async (tx) => {
      const teamRepo = createTeamsRepository(tx);
      const team = await teamRepo.lock(teamId);
      const role = team ? await teamRepo.roleOf(teamId, actor.user.id) : null;
      if (!team || !role || (team.archivedAt && role !== 'leader')) throw new AppError(404, 'not_found');
      if (role !== 'leader') throw new AppError(403, 'not_team_leader');
      if (team.archivedAt) throw new AppError(409, 'team_archived');
      return work({ tx, repo: createMeetingsRepository(tx), day: today() });
    });
  }

  /** The series' team, read before locking it; the lock re-checks everything. */
  async function teamOfSeries(seriesId: string): Promise<string> {
    const series = await meetings.findSeries(seriesId, today());
    if (!series) throw new AppError(404, 'not_found');
    return series.teamId;
  }

  async function seriesView(repo: MeetingsRepository, seriesId: string, day: string): Promise<MeetingSeriesView> {
    const row = await repo.findSeries(seriesId, day);
    if (!row) throw new AppError(404, 'not_found');
    return toSeries(row);
  }

  /** The meeting and my role in its team, if I may see the team (as the meeting page); 404 otherwise. */
  async function visible(meetingId: string, userId: string) {
    const row = await meetings.find(meetingId, today());
    if (!row) throw new AppError(404, 'not_found');
    return { row, role: await roleIn(row.teamId, userId) };
  }

  /**
   * The board's columns as `viewerId` sees them: every active member (with or without notes), the viewer, and anyone
   * else with notes here (people who left), in the speaking order, then by columnRank and name.
   */
  async function columnsOf(dbOrTx: Db, teamId: string, meetingId: string, viewerId: string): Promise<MeetingBoardColumn[]> {
    const repo = createMeetingsRepository(dbOrTx);
    const [members, notes, order] = await Promise.all([
      createTeamsRepository(dbOrTx).members(teamId),
      repo.notesOn(meetingId, viewerId),
      repo.speakingOrder(meetingId),
    ]);
    const columns = new Map<string, MeetingBoardColumn>();
    for (const member of members) {
      columns.set(member.userId, {
        userId: member.userId,
        name: member.name,
        role: member.role,
        active: member.status === 'active',
        isMe: member.userId === viewerId,
        notes: [],
      });
    }
    for (const note of notes) {
      let column = columns.get(note.userId);
      if (!column) {
        // Someone who has left the team: their notes on this meeting stay, in a column of their own.
        column = { userId: note.userId, name: note.authorName, role: null, active: note.authorStatus === 'active', isMe: false, notes: [] };
        columns.set(note.userId, column);
      }
      column.notes.push(toCard(note));
    }
    const place = new Map(order.map((userId, index) => [userId, index]));
    const placeOf = (column: MeetingBoardColumn) => place.get(column.userId) ?? Number.MAX_SAFE_INTEGER;
    return (
      [...columns.values()]
        // A deactivated member without notes here has nothing to show.
        .filter((c) => c.isMe || c.notes.length > 0 || (c.active && c.role !== null))
        .sort(
          (a, b) =>
            placeOf(a) - placeOf(b) || columnRank(a) - columnRank(b) || a.name.localeCompare(b.name) || a.userId.localeCompare(b.userId),
        )
    );
  }

  async function boardFor(actor: AuthContext, meetingId: string): Promise<MeetingBoardResponse> {
    const { row: meeting, role } = await visible(meetingId, actor.user.id);
    const open = meeting.status !== 'cancelled' && !meeting.teamArchived;
    return {
      columns: await columnsOf(db, meeting.teamId, meetingId, actor.user.id),
      canAdd: open,
      canArrange: open && role === 'leader',
    };
  }

  async function detail(meetingId: string, userId: string): Promise<MeetingDetail> {
    const day = today();
    const found = await meetings.find(meetingId, day);
    if (!found) throw new AppError(404, 'not_found');
    const myRole = await roleIn(found.teamId, userId);
    const { periodsPerYear, yearStartMonth, ...row } = found;
    const period = periodOf(row.date, { periodsPerYear, yearStartMonth });
    return { ...row, myRole, period: { key: period.key, label: period.label, status: periodStatus(period, day) } };
  }

  /** The team (as the team page shows it to this user; 404 otherwise) and its year split. */
  async function teamOf(teamId: string, userId: string) {
    const team = await teams.findForUser(teamId, userId);
    if (!team) throw new AppError(404, 'not_found');
    return { team, split: splitOf(team) };
  }

  /** A period of the team from its key, with the team's list around it; 404 when the key does not fit. */
  async function findPeriod(teamId: string, userId: string, key: string) {
    const { team, split } = await teamOf(teamId, userId);
    const period = parsePeriodKey(key, split);
    if (!period) throw new AppError(404, 'not_found');
    const day = today();
    const days = await meetings.teamMeetingDays(teamId, day);
    return { team, split, period, day, days, list: periodRange(days, split, day) };
  }

  return {
    async listSeries(actor, teamId) {
      await roleIn(teamId, actor.user.id);
      return (await meetings.listSeries(teamId, today())).map(toSeries);
    },

    async createSeries(actor, teamId, input) {
      const series = await asLeader(actor, teamId, async ({ repo, day }) => {
        if ((await repo.countSeries(teamId)) >= MAX_SERIES_PER_TEAM) throw new AppError(409, 'too_many_series');
        const seriesId = await repo.createSeries(teamId, input.name, input.daysOfWeek, actor.user.id);
        await repo.generate(day, HORIZON_DAYS, { seriesId });
        return seriesView(repo, seriesId, day);
      });
      logger.info({ actorId: actor.user.id, teamId, seriesId: series.id }, 'meetings: series created');
      return series;
    },

    async updateSeries(actor, seriesId, input) {
      const teamId = await teamOfSeries(seriesId);
      const series = await asLeader(actor, teamId, async ({ repo, day }) => {
        const before = await repo.findSeries(seriesId, day);
        if (!before || before.teamId !== teamId) throw new AppError(404, 'not_found');
        await repo.updateSeries(seriesId, input);
        const active = input.active ?? before.active;
        if (!active) {
          // Stopped: upcoming meetings without notes go; past meetings stay.
          if (before.active) await repo.removeUpcoming(seriesId, day, null);
        } else {
          // Days changed: meetings on removed days go (unless moved or with notes), new days are generated.
          if (input.daysOfWeek) await repo.removeUpcoming(seriesId, day, input.daysOfWeek);
          await repo.generate(day, HORIZON_DAYS, { seriesId });
        }
        return seriesView(repo, seriesId, day);
      });
      logger.info({ actorId: actor.user.id, teamId, seriesId, active: series.active }, 'meetings: series changed');
      return series;
    },

    async deleteSeries(actor, seriesId) {
      const teamId = await teamOfSeries(seriesId);
      await asLeader(actor, teamId, async ({ repo, day }) => {
        const series = await repo.findSeries(seriesId, day);
        if (!series || series.teamId !== teamId) throw new AppError(404, 'not_found');
        // A series whose meetings gathered notes is history: stop it instead.
        if (await repo.seriesHasNotes(seriesId)) throw new AppError(409, 'series_has_notes');
        await repo.deleteSeries(seriesId);
      });
      logger.info({ actorId: actor.user.id, teamId, seriesId }, 'meetings: series deleted');
    },

    async listForTeam(actor, teamId, page) {
      await roleIn(teamId, actor.user.id);
      // Upcoming is at most HORIZON_DAYS of meetings; past comes in pages ("Show more"); `limit` asks for fewer.
      const limit = page.limit ?? (page.when === 'upcoming' ? MAX_SERIES_PER_TEAM * HORIZON_DAYS : PAST_PAGE_SIZE);
      const rows = await meetings.listForTeam(teamId, today(), { when: page.when, offset: page.offset, limit: limit + 1 });
      return { meetings: rows.slice(0, limit).map(toMeeting), hasMore: rows.length > limit };
    },

    async upcomingForMe(actor, page) {
      const day = today();
      const range = { when: 'upcoming' as const, to: addDays(day, HOME_DAYS - 1) };
      const [rows, total] = await Promise.all([
        meetings.listForUser(actor.user.id, day, { ...range, offset: page.offset, limit: page.limit + 1 }),
        meetings.countForUser(actor.user.id, day, range),
      ]);
      return { meetings: rows.slice(0, page.limit).map(toMeeting), hasMore: rows.length > page.limit, total };
    },

    async listForMe(actor, query) {
      // Upcoming covers the next HORIZON_DAYS of every team in one go (capped); past comes in pages.
      const when = query.when ?? 'upcoming';
      const limit = when === 'upcoming' ? MY_UPCOMING_LIMIT : PAST_PAGE_SIZE;
      const rows = await meetings.listForUser(actor.user.id, today(), {
        ...query,
        when,
        offset: query.offset ?? 0,
        limit: limit + 1,
      });
      return { meetings: rows.slice(0, limit).map(toMeeting), hasMore: rows.length > limit };
    },

    get: (actor, meetingId) => detail(meetingId, actor.user.id),

    async periods(actor, teamId) {
      const { split } = await teamOf(teamId, actor.user.id);
      const day = today();
      const days = await meetings.teamMeetingDays(teamId, day);
      return { split, periods: periodRange(days, split, day).map((p) => summarize(p, days, day)) };
    },

    async period(actor, teamId, key) {
      const { team, split, period, day, days, list } = await findPeriod(teamId, actor.user.id, key);
      // Neighbours within the team's list; a period outside it (an old link) still links back into the list.
      const at = list.findIndex((p) => p.key === period.key);
      const before = at > 0 ? list[at - 1] : at === -1 && list[0] && period.start > list[0].start ? previousPeriod(period, split) : null;
      const after = at >= 0 && at < list.length - 1 ? list[at + 1] : at === -1 && list[0] && period.start < list[0].start ? nextPeriod(period, split) : null;
      return {
        ...summarize(period, days, day),
        teamId: team.id,
        teamName: team.name,
        myRole: team.myRole,
        teamArchived: team.archivedAt !== null,
        split,
        previous: before ? { key: before.key, label: before.label } : null,
        next: after ? { key: after.key, label: after.label } : null,
        meetings: (await meetings.listForTeamBetween(teamId, day, period.start, period.end)).map(toMeeting),
      };
    },

    async periodNotes(actor, teamId, key, pick = {}) {
      const { team, period, day } = await findPeriod(teamId, actor.user.id, key);
      const rows = (await meetings.listForTeamBetween(teamId, day, period.start, period.end)).filter((m) => m.noteCount > 0);
      // Each meeting in its board order (speaking order, then the leader, then by name); blank notes left out.
      const boards = await Promise.all(
        rows.map(async (m) => ({
          meeting: m,
          people: (await columnsOf(db, team.id, m.id, actor.user.id))
            .map((c) => ({ userId: c.userId, name: c.name, notes: c.notes.filter((n) => !isBlank(n)) }))
            .filter((c) => c.notes.length > 0),
        })),
      );
      const withNotes = boards.filter((b) => b.people.length > 0);
      // Only the meetings asked for come with their notes in full (owner, 2026-11-25): the note text is what is heavy.
      const wanted = Array.isArray(pick.meetings) ? new Set(pick.meetings) : null;
      const chosen =
        wanted !== null
          ? withNotes.filter((b) => wanted.has(b.meeting.id))
          : pick.meetings === undefined && pick.latest !== undefined
            ? withNotes.slice(-pick.latest)
            : withNotes;
      const contents = new Map(
        (await meetings.notesContent([...new Set(chosen.flatMap((b) => b.people.flatMap((p) => p.notes.map((n) => n.id))))])).map((row) => [row.id, row]),
      );
      return {
        index: withNotes.map(({ meeting, people }) => ({
          id: meeting.id,
          date: meeting.date,
          title: meeting.title,
          seriesName: meeting.seriesName,
          status: meeting.status,
          people: people.map((person) => ({ userId: person.userId, name: person.name })),
        })),
        meetings: chosen
          .map(({ meeting, people }) => ({
            id: meeting.id,
            date: meeting.date,
            title: meeting.title,
            seriesName: meeting.seriesName,
            status: meeting.status,
            people: people.map((person) => ({
              userId: person.userId,
              name: person.name,
              notes: person.notes.map((card) => {
                const row = contents.get(card.id);
                const content = row && (row.content as EditorDoc).type === 'doc' ? (row.content as EditorDoc) : EMPTY_DOC;
                return { id: card.id, title: card.title, content, projects: row?.projects ?? [], updatedAt: card.updatedAt };
              }),
            })),
          })),
      };
    },

    async currentPeriods(actor) {
      const day = today();
      // The next four weeks: as far ahead as meetings are made.
      const horizonEnd = addDays(day, HORIZON_DAYS - 1);
      const mine = (await teams.listForUser(actor.user.id)).filter((t) => t.archivedAt === null);
      const perTeam = await Promise.all(
        mine.map(async (team) => {
          const split = splitOf(team);
          const days = await meetings.teamMeetingDays(team.id, day);
          // The current period, then each one that starts before the four weeks are over.
          const current = periodOf(day, split);
          const periods = [current];
          for (let next = nextPeriod(current, split); next.start <= horizonEnd; next = nextPeriod(next, split)) periods.push(next);
          return periods.map((period) => ({ teamId: team.id, teamName: team.name, split, period: summarize(period, days, day) }));
        }),
      );
      return { teams: perTeam.flat() };
    },

    async schedule(actor, meetingId) {
      await visible(meetingId, actor.user.id);
      return { meetings: await meetings.scheduleAround(meetingId, today(), SCHEDULE_WINDOW) };
    },

    async update(actor, meetingId, input) {
      const found = await meetings.find(meetingId, today());
      if (!found) throw new AppError(404, 'not_found');
      await asLeader(actor, found.teamId, async ({ repo, day }) => {
        const meeting = await repo.lockMeeting(meetingId);
        if (!meeting || meeting.teamId !== found.teamId) throw new AppError(404, 'not_found');
        // The title can be set any time; cancelling, reopening and moving only before the day has passed.
        if ((input.status !== undefined || input.date !== undefined) && meeting.date < day) {
          throw new AppError(409, 'meeting_in_past');
        }
        if (input.date !== undefined && input.date !== meeting.date) {
          if (input.date < day || input.date > addDays(day, MOVE_MAX_DAYS)) throw new AppError(400, 'validation_failed');
          if (await repo.dateTaken(meeting.seriesId, input.date, meetingId)) throw new AppError(409, 'meeting_date_taken');
        }
        try {
          await repo.updateMeeting(meetingId, input);
        } catch (err) {
          // The job generated a meeting on that day between the check and the update.
          if ((err as { code?: string }).code === '23505') throw new AppError(409, 'meeting_date_taken');
          throw err;
        }
      });
      logger.info(
        { actorId: actor.user.id, meetingId, status: input.status, moved: input.date !== undefined },
        'meetings: meeting changed',
      );
      return detail(meetingId, actor.user.id);
    },

    async refresh(only) {
      const day = today();
      const done = await meetings.markPastDone(day, only?.teamId);
      const created = await meetings.generate(day, HORIZON_DAYS, { teamId: only?.teamId });
      return { done, created };
    },
    board: boardFor,

    async arrangeSpeakers(actor, meetingId, input) {
      const found = await meetings.find(meetingId, today());
      if (!found) throw new AppError(404, 'not_found');
      const role = await db.transaction(async (tx) => {
        const teamRepo = createTeamsRepository(tx);
        const team = await teamRepo.lock(found.teamId);
        const role = team ? await teamRepo.roleOf(found.teamId, actor.user.id) : null;
        if (!team || !role || (team.archivedAt && role !== 'leader')) throw new AppError(404, 'not_found');
        if (team.archivedAt) throw new AppError(409, 'team_archived');
        const repo = createMeetingsRepository(tx);
        const meeting = await repo.lockMeeting(meetingId);
        if (!meeting || meeting.teamId !== found.teamId) throw new AppError(404, 'not_found');
        if (meeting.status === 'cancelled') throw new AppError(409, 'meeting_cancelled');
        // Exactly the people the board shows: a screen opened before someone joined or added a note is refused, so it
        // cannot leave them out of the order by accident.
        const shown = (await columnsOf(tx, meeting.teamId, meetingId, actor.user.id)).map((c) => c.userId);
        if (!sameIds(shown, input.userIds)) throw new AppError(409, 'board_changed');
        // The leader arranges everyone; a member moves only their own group, everyone else keeping their order
        // (owner, 2026-11-24).
        if (role !== 'leader' && !movedOnly(shown, input.userIds, actor.user.id)) throw new AppError(403, 'not_team_leader');
        await repo.setSpeakers(meetingId, input.userIds);
        return role;
      });
      logger.info(
        { actorId: actor.user.id, meetingId, people: input.userIds.length, byLeader: role === 'leader' },
        'meetings: speaking order set',
      );
      return boardFor(actor, meetingId);
    },

    async arrangeNotes(actor, meetingId, input) {
      const found = await meetings.find(meetingId, today());
      if (!found) throw new AppError(404, 'not_found');
      await db.transaction(async (tx) => {
        const role = await createTeamsRepository(tx).roleOf(found.teamId, actor.user.id);
        if (!role) throw new AppError(404, 'not_found');
        if (input.userId !== actor.user.id && role !== 'leader') throw new AppError(403, 'not_team_leader');
        if (found.teamArchived) throw new AppError(409, 'team_archived');
        const repo = createMeetingsRepository(tx);
        const meeting = await repo.lockMeeting(meetingId);
        if (!meeting || meeting.teamId !== found.teamId) throw new AppError(404, 'not_found');
        if (meeting.status === 'cancelled') throw new AppError(409, 'meeting_cancelled');
        // Exactly that person's notes as I see them here (a teammate's blank notes are not shown to me, so they keep
        // their place after the arranged ones).
        const theirs = (await repo.notesOn(meetingId, actor.user.id)).filter((n) => n.userId === input.userId).map((n) => n.id);
        if (!sameIds(theirs, input.noteIds)) throw new AppError(409, 'board_changed');
        await repo.arrangeNotes(meetingId, input.noteIds);
      });
      logger.info(
        { actorId: actor.user.id, meetingId, ownNotes: input.userId === actor.user.id, notes: input.noteIds.length },
        'meetings: notes arranged',
      );
      return boardFor(actor, meetingId);
    },

    async boardNote(actor, meetingId, noteId) {
      await visible(meetingId, actor.user.id);
      const row = await meetings.noteOn(meetingId, noteId);
      if (!row) throw new AppError(404, 'not_found');
      const content = (row.content as EditorDoc).type === 'doc' ? (row.content as EditorDoc) : EMPTY_DOC;
      return {
        id: row.id,
        title: row.title,
        content,
        projects: row.projects,
        author: { id: row.userId, name: row.authorName },
        isMine: row.userId === actor.user.id,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };
    },
  };
}
