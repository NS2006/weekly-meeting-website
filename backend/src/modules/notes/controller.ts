import type {
  CopyNoteRequest,
  CreateNoteRequest,
  NoteMeetingsResponse,
  NoteResponse,
  NoteSavedResponse,
  NotesQuery,
  NotesResponse,
  ProjectUpdatesResponse,
  UpdateNoteRequest,
} from '@weekly-meeting/shared';
import type { Response } from 'express';
import { authOf } from '../../middleware/authenticate.ts';
import { asyncHandler } from '../../utils/asyncHandler.ts';
import type { NotesService } from './service.ts';

const idOf = (res: Response) => (res.locals.validated.params as { id: string }).id;
const linkOf = (res: Response) => res.locals.validated.params as { id: string; meetingId: string };

export function createNotesController(service: NotesService) {
  return {
    list: asyncHandler(async (_req, res) => {
      const filters = res.locals.validated.query as NotesQuery;
      res.json((await service.list(authOf(res), filters)) satisfies NotesResponse);
    }),

    create: asyncHandler(async (_req, res) => {
      const body = res.locals.validated.body as CreateNoteRequest;
      res.status(201).json({ note: await service.create(authOf(res), body) } satisfies NoteResponse);
    }),

    get: asyncHandler(async (_req, res) => {
      res.json({ note: await service.get(authOf(res), idOf(res)) } satisfies NoteResponse);
    }),

    update: asyncHandler(async (_req, res) => {
      const body = res.locals.validated.body as UpdateNoteRequest;
      res.json({ note: await service.update(authOf(res), idOf(res), body) } satisfies NoteSavedResponse);
    }),

    copy: asyncHandler(async (_req, res) => {
      const body = res.locals.validated.body as CopyNoteRequest;
      res.status(201).json({ note: await service.copy(authOf(res), idOf(res), body) } satisfies NoteResponse);
    }),

    remove: asyncHandler(async (_req, res) => {
      await service.remove(authOf(res), idOf(res));
      res.status(204).end();
    }),

    linkMeeting: asyncHandler(async (_req, res) => {
      const { id, meetingId } = linkOf(res);
      res.json({ meetings: await service.linkMeeting(authOf(res), id, meetingId) } satisfies NoteMeetingsResponse);
    }),

    unlinkMeeting: asyncHandler(async (_req, res) => {
      const { id, meetingId } = linkOf(res);
      res.json({ meetings: await service.unlinkMeeting(authOf(res), id, meetingId) } satisfies NoteMeetingsResponse);
    }),

    projectUpdates: asyncHandler(async (_req, res) => {
      const { offset } = res.locals.validated.query as { offset: number };
      res.json((await service.updates(authOf(res), idOf(res), offset)) satisfies ProjectUpdatesResponse);
    }),
  };
}
