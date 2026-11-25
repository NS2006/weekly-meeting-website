import { Router } from 'express';
import { requireUserRole } from '../../middleware/authenticate.ts';
import { validate } from '../../middleware/validate.ts';
import { createMeetingsController } from './controller.ts';
import type { MeetingsService } from './service.ts';
import {
  ArrangeNotesSchema,
  ArrangeSpeakersSchema,
  BoardNoteParamsSchema,
  CreateSeriesSchema,
  IdParamsSchema,
  MyMeetingsQuerySchema,
  PeriodNotesQuerySchema,
  PeriodParamsSchema,
  TeamMeetingsQuerySchema,
  UpcomingMeetingsQuerySchema,
  UpdateMeetingSchema,
  UpdateSeriesSchema,
} from './types.ts';

/**
 * Meeting series and meetings (FR-8), and each meeting's board of linked notes (FR-10). Mounted after authenticate +
 * requireActive; needs the User role in use. Team membership (read) and leadership (change) are checked in the service.
 */
export function createMeetingsRoutes(service: MeetingsService): Router {
  const c = createMeetingsController(service);
  const byId = validate('params', IdParamsSchema);
  const router = Router();

  router.use(['/teams', '/series', '/meetings', '/periods'], requireUserRole);
  router.get('/teams/:id/series', byId, c.listSeries);
  router.post('/teams/:id/series', byId, validate('body', CreateSeriesSchema), c.createSeries);
  router.patch('/series/:id', byId, validate('body', UpdateSeriesSchema), c.updateSeries);
  router.delete('/series/:id', byId, c.deleteSeries);
  router.get('/teams/:id/meetings', byId, validate('query', TeamMeetingsQuerySchema), c.listForTeam);
  router.get('/teams/:id/periods', byId, c.periods);
  router.get('/teams/:id/periods/:key', validate('params', PeriodParamsSchema), c.period);
  router.get('/teams/:id/periods/:key/notes', validate('params', PeriodParamsSchema), validate('query', PeriodNotesQuerySchema), c.periodNotes);
  router.get('/periods/current', c.currentPeriods);
  router.get('/meetings', validate('query', MyMeetingsQuerySchema), c.listForMe);
  router.get('/meetings/upcoming', validate('query', UpcomingMeetingsQuerySchema), c.upcomingForMe);
  router.get('/meetings/:id', byId, c.get);
  router.get('/meetings/:id/schedule', byId, c.schedule);
  router.patch('/meetings/:id', byId, validate('body', UpdateMeetingSchema), c.update);
  router.get('/meetings/:id/notes', byId, c.board);
  router.put('/meetings/:id/speakers', byId, validate('body', ArrangeSpeakersSchema), c.arrangeSpeakers);
  router.put('/meetings/:id/note-order', byId, validate('body', ArrangeNotesSchema), c.arrangeNotes);
  router.get('/meetings/:id/notes/:noteId', validate('params', BoardNoteParamsSchema), c.boardNote);
  return router;
}
