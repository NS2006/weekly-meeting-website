import type { AttachmentView, CopyAttachmentsResponse } from '@weekly-meeting/shared';
import type { Readable } from 'node:stream';
import type { Database } from '../../database/pool.ts';
import { AppError, describeError } from '../../utils/errors.ts';
import type { Logger } from '../../utils/logger.ts';
import type { AuthContext } from '../auth/types.ts';
import { createAttachmentsRepository, type StoredAttachment } from './repository.ts';
import { newStorageKey, removeFiles, type ObjectStorage } from './storage.ts';
import { attachmentUrl, MAX_IMAGES_PER_NOTE, sniffImageType } from './types.ts';

export interface AttachmentsService {
  upload(actor: AuthContext, noteId: string, data: Buffer): Promise<AttachmentView>;
  /** Copies pictures of my other notes into my note `noteId`; answers which picture became which. */
  copyInto(actor: AuthContext, noteId: string, attachmentIds: string[]): Promise<CopyAttachmentsResponse['attachments']>;
  open(actor: AuthContext, attachmentId: string): Promise<StoredAttachment & { stream: Readable }>;
}

/** Note images (PRD 8.3): the owner uploads into their own note; reading checks the same rule as the note. */
export function createAttachmentsService(deps: { db: Database; logger: Logger; storage: ObjectStorage }): AttachmentsService {
  const { db, logger, storage } = deps;
  const attachments = createAttachmentsRepository(db);

  return {
    async upload(actor, noteId, data) {
      const mimeType = sniffImageType(data);
      if (!mimeType) throw new AppError(415, 'invalid_image');
      const image = { storageKey: newStorageKey(noteId), mimeType, sizeBytes: data.length };

      // The note is locked while the file is stored, so it cannot be deleted in between (and the count holds).
      const attachmentId = await db.transaction(async (tx) => {
        const repo = createAttachmentsRepository(tx);
        const note = await repo.lockNoteForUpload(noteId, actor.user.id);
        if (!note) throw new AppError(404, 'not_found');
        if (note.images >= MAX_IMAGES_PER_NOTE) throw new AppError(409, 'too_many_images');
        await storage.put(image.storageKey, data, mimeType);
        try {
          return await repo.create(noteId, image);
        } catch (err) {
          await storage.remove([image.storageKey]).catch(() => undefined);
          throw err;
        }
      });

      logger.info({ actorId: actor.user.id, noteId, attachmentId, mimeType, sizeBytes: data.length }, 'attachment: stored');
      return { id: attachmentId, url: attachmentUrl(attachmentId), mimeType, sizeBytes: data.length };
    },

    async copyInto(actor, noteId, attachmentIds) {
      const stored: string[] = [];
      try {
        const copies = await db.transaction(async (tx) => {
          const repo = createAttachmentsRepository(tx);
          // The note is locked while the files are copied, as for an upload (the count holds, it cannot be deleted).
          const note = await repo.lockNoteForUpload(noteId, actor.user.id);
          if (!note) throw new AppError(404, 'not_found');
          const owned = await repo.ownedBy(attachmentIds, actor.user.id);
          const here = owned.filter((a) => a.noteId === noteId);
          const elsewhere = owned.filter((a) => a.noteId !== noteId);
          if (note.images + elsewhere.length > MAX_IMAGES_PER_NOTE) throw new AppError(409, 'too_many_images');
          const out = here.map((a) => ({ from: a.id, id: a.id, url: attachmentUrl(a.id) }));
          for (const source of elsewhere) {
            const storageKey = newStorageKey(noteId);
            if (!(await storage.copy(source.storageKey, storageKey))) continue; // its file is gone: left out
            stored.push(storageKey);
            const id = await repo.create(noteId, { storageKey, mimeType: source.mimeType, sizeBytes: source.sizeBytes });
            out.push({ from: source.id, id, url: attachmentUrl(id) });
          }
          return out;
        });
        logger.info({ actorId: actor.user.id, noteId, copied: stored.length }, 'attachment: copied into note');
        return copies;
      } catch (err) {
        await removeFiles(storage, logger, stored);
        throw err;
      }
    },

    async open(actor, attachmentId) {
      const image = await attachments.findReadable(attachmentId, actor.user.id);
      if (!image) throw new AppError(404, 'not_found');
      let stream: Readable | null;
      try {
        stream = await storage.open(image.storageKey);
      } catch (err) {
        logger.error({ attachmentId, driver: storage.driver, err: describeError(err) }, 'attachment: storage read failed');
        throw err;
      }
      if (!stream) {
        logger.warn({ attachmentId, driver: storage.driver }, 'attachment: file missing in storage');
        throw new AppError(404, 'not_found');
      }
      return { ...image, stream };
    },
  };
}
