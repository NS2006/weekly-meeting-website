import type { AttachmentView } from '@weekly-meeting/shared';
import { z } from 'zod';
import { idSchema } from '../../utils/ids.ts';

const id = idSchema;

export const AttachmentIdParamsSchema = z.object({ id }).strict();
export const NoteIdParamsSchema = z.object({ id }).strict();
export const CopyAttachmentsSchema = z
  .object({ attachmentIds: z.array(id).min(1).max(100) })
  .strict()
  .transform((body) => ({ attachmentIds: [...new Set(body.attachmentIds)] }));

/** The request body is read as raw bytes (express.raw); anything else (JSON, nothing) is refused. */
export const ImageBodySchema = z.instanceof(Buffer);

/** PRD section 4: images at most 5 MB each (larger answers 413). */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** Keeps one note from filling the storage (409 `too_many_images`). */
export const MAX_IMAGES_PER_NOTE = 100;
/**
 * Browsers keep a copy but ask again before each use: who may see an image changes (a note taken off a meeting ends
 * the teammates' access at once). Images never change (a new upload gets a new id), so the id is the ETag and an
 * unchanged image answers 304 after the access check, without sending the bytes again.
 */
export const IMAGE_CACHE_CONTROL = 'private, no-cache';
export const imageEtag = (attachmentId: string) => `"${attachmentId}"`;

export type ImageType = AttachmentView['mimeType'];

const startsWith = (data: Buffer, bytes: number[], offset = 0) =>
  data.length >= offset + bytes.length && bytes.every((byte, i) => data[offset + i] === byte);
const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

/**
 * The image type from the file's first bytes (its signature), never from its name or the type the browser sent.
 * PNG, JPEG, GIF and WebP only; SVG (which can carry scripts) and everything else answer null.
 */
export function sniffImageType(data: Buffer): ImageType | null {
  if (startsWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(data, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(data, ascii('GIF87a')) || startsWith(data, ascii('GIF89a'))) return 'image/gif';
  if (startsWith(data, ascii('RIFF')) && startsWith(data, ascii('WEBP'), 8)) return 'image/webp';
  return null;
}

export const attachmentUrl = (attachmentId: string) => `/api/attachments/${attachmentId}`;
