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

/** How many pictures are copied in storage at the same time. */
const COPY_AT_ONCE = 4;

/**
 * `work` on each item, at most `limit` at a time, results in the items' order. After a failure no new item starts,
 * and the ones running finish before it is thrown, so the caller can clean up everything they made.
 */
async function eachLimited<T, R>(items: readonly T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  let failure: { error: unknown } | null = null;
  const worker = async () => {
    while (failure === null && next < items.length) {
      const at = next;
      next += 1;
      try {
        results[at] = await work(items[at] as T);
      } catch (error) {
        failure ??= { error };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  if (failure) throw (failure as { error: unknown }).error;
  return results;
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

      // A quick check first, so a picture for a note that is not mine, or full, is never stored.
      const before = await attachments.imagesOf(noteId, actor.user.id);
      if (!before) throw new AppError(404, 'not_found');
      if (before.images >= MAX_IMAGES_PER_NOTE) throw new AppError(409, 'too_many_images');
      // The file is stored outside any transaction (stress-test review, 2026-11-25: with Cloud Storage a slow upload
      // held a database connection and the note's lock, which also held up that note's autosave). Then a short
      // transaction checks again with the note locked (it may have been deleted, or filled, meanwhile) and adds the
      // row; the file goes if that fails.
      await storage.put(image.storageKey, data, mimeType);
      let attachmentId: string;
      try {
        attachmentId = await db.transaction(async (tx) => {
          const repo = createAttachmentsRepository(tx);
          const note = await repo.lockNoteForUpload(noteId, actor.user.id);
          if (!note) throw new AppError(404, 'not_found');
          if (note.images >= MAX_IMAGES_PER_NOTE) throw new AppError(409, 'too_many_images');
          return repo.create(noteId, image);
        });
      } catch (err) {
        await storage.remove([image.storageKey]).catch(() => undefined);
        throw err;
      }

      logger.info({ actorId: actor.user.id, noteId, attachmentId, mimeType, sizeBytes: data.length }, 'attachment: stored');
      return { id: attachmentId, url: attachmentUrl(attachmentId), mimeType, sizeBytes: data.length };
    },

    async copyInto(actor, noteId, attachmentIds) {
      // The checks first, without locks.
      const before = await attachments.imagesOf(noteId, actor.user.id);
      if (!before) throw new AppError(404, 'not_found');
      const owned = await attachments.ownedBy(attachmentIds, actor.user.id);
      const here = owned.filter((a) => a.noteId === noteId);
      const elsewhere = owned.filter((a) => a.noteId !== noteId);
      if (before.images + elsewhere.length > MAX_IMAGES_PER_NOTE) throw new AppError(409, 'too_many_images');
      const stored: string[] = [];
      try {
        // The files are copied outside any transaction, a few at a time (stress-test review, 2026-11-25: up to 100
        // copies one by one inside the transaction held a connection and the note's lock for many seconds).
        const copied = await eachLimited(elsewhere, COPY_AT_ONCE, async (source) => {
          const storageKey = newStorageKey(noteId);
          if (!(await storage.copy(source.storageKey, storageKey))) return null; // its file is gone: left out
          stored.push(storageKey);
          return { source, storageKey };
        });
        // Then a short transaction: the note locked and counted again (it may have changed meanwhile), and the rows.
        const copies = await db.transaction(async (tx) => {
          const repo = createAttachmentsRepository(tx);
          const note = await repo.lockNoteForUpload(noteId, actor.user.id);
          if (!note) throw new AppError(404, 'not_found');
          const made = copied.filter((c) => c !== null);
          if (note.images + made.length > MAX_IMAGES_PER_NOTE) throw new AppError(409, 'too_many_images');
          const out = here.map((a) => ({ from: a.id, id: a.id, url: attachmentUrl(a.id) }));
          for (const { source, storageKey } of made) {
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
