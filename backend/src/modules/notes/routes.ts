import { Router } from 'express';
import { requireUserRole } from '../../middleware/authenticate.ts';
import { validate } from '../../middleware/validate.ts';
import { createNotesController } from './controller.ts';
import type { NotesService } from './service.ts';
import {
  CopyNoteSchema,
  CreateNoteSchema,
  NoteIdParamsSchema,
  NoteMeetingParamsSchema,
  NotesQuerySchema,
  ProjectIdParamsSchema,
  ProjectUpdatesQuerySchema,
  UpdateNoteSchema,
} from './types.ts';

/**
 * Notes (FR-7, FR-9, FR-12, PRD 8.2). Mounted after authenticate + requireActive; needs the User role in use. Only the
 * owner reads or writes a note here (someone else's answers 404); teammates read linked notes on the meeting's board
 * (meetings module). Note bodies are at most 1 MB (the app's JSON limit).
 */
export function createNotesRoutes(service: NotesService): Router {
  const c = createNotesController(service);
  const byId = validate('params', NoteIdParamsSchema);
  const router = Router();

  router.get('/notes', requireUserRole, validate('query', NotesQuerySchema), c.list);
  router.post('/notes', requireUserRole, validate('body', CreateNoteSchema), c.create);
  router.get('/notes/:id', requireUserRole, byId, c.get);
  router.patch('/notes/:id', requireUserRole, byId, validate('body', UpdateNoteSchema), c.update);
  router.delete('/notes/:id', requireUserRole, byId, c.remove);
  router.post('/notes/:id/copy', requireUserRole, byId, validate('body', CopyNoteSchema), c.copy);
  const byLink = validate('params', NoteMeetingParamsSchema);
  router.put('/notes/:id/meetings/:meetingId', requireUserRole, byLink, c.linkMeeting);
  router.delete('/notes/:id/meetings/:meetingId', requireUserRole, byLink, c.unlinkMeeting);
  router.get(
    '/projects/:id/updates',
    requireUserRole,
    validate('params', ProjectIdParamsSchema),
    validate('query', ProjectUpdatesQuerySchema),
    c.projectUpdates,
  );
  return router;
}
