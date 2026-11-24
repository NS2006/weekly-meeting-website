import type { AttachmentResponse, CopyAttachmentsRequest, CopyAttachmentsResponse } from '@weekly-meeting/shared';
import type { Response } from 'express';
import { pipeline } from 'node:stream/promises';
import { authOf } from '../../middleware/authenticate.ts';
import { asyncHandler } from '../../utils/asyncHandler.ts';
import type { AttachmentsService } from './service.ts';
import { IMAGE_CACHE_CONTROL, imageEtag } from './types.ts';

const idOf = (res: Response) => (res.locals.validated.params as { id: string }).id;

export function createAttachmentsController(service: AttachmentsService) {
  return {
    upload: asyncHandler(async (_req, res) => {
      const data = res.locals.validated.body as Buffer;
      res.status(201).json({ attachment: await service.upload(authOf(res), idOf(res), data) } satisfies AttachmentResponse);
    }),

    copy: asyncHandler(async (_req, res) => {
      const { attachmentIds } = res.locals.validated.body as CopyAttachmentsRequest;
      res.json({ attachments: await service.copyInto(authOf(res), idOf(res), attachmentIds) } satisfies CopyAttachmentsResponse);
    }),

    read: asyncHandler(async (req, res) => {
      const image = await service.open(authOf(res), idOf(res));
      const etag = imageEtag(idOf(res));
      res.setHeader('Cache-Control', IMAGE_CACHE_CONTROL);
      res.setHeader('ETag', etag);
      if (req.headers['if-none-match'] === etag) {
        // Still allowed (checked above) and unchanged: the browser's copy is good.
        image.stream.destroy();
        res.status(304).end();
        return;
      }
      // The type comes from our own signature check at upload (one of four image types), never from the uploader.
      res.setHeader('Content-Type', image.mimeType);
      res.setHeader('Content-Length', String(image.sizeBytes));
      res.setHeader('Content-Disposition', 'inline');
      // A read error mid-way ends the connection (pipeline destroys the response); the error handler logs it.
      await pipeline(image.stream, res);
    }),
  };
}
