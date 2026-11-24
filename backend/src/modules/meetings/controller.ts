import type {
  ArrangeNotesRequest,
  ArrangeSpeakersRequest,
  CreateSeriesRequest,
  MeetingBoardResponse,
  MeetingNoteResponse,
  MeetingResponse,
  MeetingsResponse,
  MyMeetingsQuery,
  CurrentPeriodsResponse,
  PeriodNotesResponse,
  PeriodResponse,
  ScheduleMeetingsResponse,
  TeamPeriodsResponse,
  SeriesListResponse,
  SeriesResponse,
  UpdateMeetingRequest,
  UpdateSeriesRequest,
} from '@weekly-meeting/shared';
import type { Response } from 'express';
import { authOf } from '../../middleware/authenticate.ts';
import { asyncHandler } from '../../utils/asyncHandler.ts';
import type { MeetingsService } from './service.ts';

const idOf = (res: Response) => (res.locals.validated.params as { id: string }).id;

export function createMeetingsController(service: MeetingsService) {
  return {
    listSeries: asyncHandler(async (_req, res) => {
      res.json({ series: await service.listSeries(authOf(res), idOf(res)) } satisfies SeriesListResponse);
    }),

    createSeries: asyncHandler(async (_req, res) => {
      const body = res.locals.validated.body as CreateSeriesRequest;
      res.status(201).json({ series: await service.createSeries(authOf(res), idOf(res), body) } satisfies SeriesResponse);
    }),

    updateSeries: asyncHandler(async (_req, res) => {
      const body = res.locals.validated.body as UpdateSeriesRequest;
      res.json({ series: await service.updateSeries(authOf(res), idOf(res), body) } satisfies SeriesResponse);
    }),

    deleteSeries: asyncHandler(async (_req, res) => {
      await service.deleteSeries(authOf(res), idOf(res));
      res.status(204).end();
    }),

    listForTeam: asyncHandler(async (_req, res) => {
      const page = res.locals.validated.query as { when: 'upcoming' | 'past'; offset: number };
      res.json((await service.listForTeam(authOf(res), idOf(res), page)) satisfies MeetingsResponse);
    }),

    upcomingForMe: asyncHandler(async (_req, res) => {
      res.json((await service.upcomingForMe(authOf(res))) satisfies MeetingsResponse);
    }),

    listForMe: asyncHandler(async (_req, res) => {
      const query = res.locals.validated.query as MyMeetingsQuery;
      res.json((await service.listForMe(authOf(res), query)) satisfies MeetingsResponse);
    }),

    get: asyncHandler(async (_req, res) => {
      res.json({ meeting: await service.get(authOf(res), idOf(res)) } satisfies MeetingResponse);
    }),

    periods: asyncHandler(async (_req, res) => {
      res.json((await service.periods(authOf(res), idOf(res))) satisfies TeamPeriodsResponse);
    }),

    period: asyncHandler(async (_req, res) => {
      const { id, key } = res.locals.validated.params as { id: string; key: string };
      res.json({ period: await service.period(authOf(res), id, key) } satisfies PeriodResponse);
    }),

    periodNotes: asyncHandler(async (_req, res) => {
      const { id, key } = res.locals.validated.params as { id: string; key: string };
      res.json((await service.periodNotes(authOf(res), id, key)) satisfies PeriodNotesResponse);
    }),

    currentPeriods: asyncHandler(async (_req, res) => {
      res.json((await service.currentPeriods(authOf(res))) satisfies CurrentPeriodsResponse);
    }),

    schedule: asyncHandler(async (_req, res) => {
      res.json((await service.schedule(authOf(res), idOf(res))) satisfies ScheduleMeetingsResponse);
    }),

    update: asyncHandler(async (_req, res) => {
      const body = res.locals.validated.body as UpdateMeetingRequest;
      res.json({ meeting: await service.update(authOf(res), idOf(res), body) } satisfies MeetingResponse);
    }),

    board: asyncHandler(async (_req, res) => {
      res.json((await service.board(authOf(res), idOf(res))) satisfies MeetingBoardResponse);
    }),

    arrangeSpeakers: asyncHandler(async (_req, res) => {
      const body = res.locals.validated.body as ArrangeSpeakersRequest;
      res.json((await service.arrangeSpeakers(authOf(res), idOf(res), body)) satisfies MeetingBoardResponse);
    }),

    arrangeNotes: asyncHandler(async (_req, res) => {
      const body = res.locals.validated.body as ArrangeNotesRequest;
      res.json((await service.arrangeNotes(authOf(res), idOf(res), body)) satisfies MeetingBoardResponse);
    }),

    boardNote: asyncHandler(async (_req, res) => {
      const { id, noteId } = res.locals.validated.params as { id: string; noteId: string };
      res.json({ note: await service.boardNote(authOf(res), id, noteId) } satisfies MeetingNoteResponse);
    }),
  };
}
