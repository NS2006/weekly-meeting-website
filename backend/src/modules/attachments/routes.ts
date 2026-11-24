import express, { Router } from 'express';
import { requireUserRole } from '../../middleware/authenticate.ts';
import { validate } from '../../middleware/validate.ts';
import { createAttachmentsController } from './controller.ts';
import type { AttachmentsService } from './service.ts';
import { AttachmentIdParamsSchema, CopyAttachmentsSchema, ImageBodySchema, MAX_IMAGE_BYTES, NoteIdParamsSchema } from './types.ts';

/**
 * Note images (FR-7, PRD 8.3). Mounted after authenticate + requireActive; needs the User role in use.
 * Upload: POST /notes/:id/attachments with the image bytes as the body (any Content-Type; the type is taken from the
 * file signature). The body is read only after sign-in and the id are checked, and only up to 5 MB (413 beyond).
 */
export function createAttachmentsRoutes(service: AttachmentsService): Router {
  const c = createAttachmentsController(service);
  const router = Router();

  router.post(
    '/notes/:id/attachments',
    requireUserRole,
    validate('params', NoteIdParamsSchema),
    express.raw({ type: () => true, limit: MAX_IMAGE_BYTES }),
    validate('body', ImageBodySchema),
    c.upload,
  );
  router.post(
    '/notes/:id/attachments/copy',
    requireUserRole,
    validate('params', NoteIdParamsSchema),
    validate('body', CopyAttachmentsSchema),
    c.copy,
  );
  router.get('/attachments/:id', requireUserRole, validate('params', AttachmentIdParamsSchema), c.read);
  return router;
}
