import type { EditorDoc } from '@weekly-meeting/shared';
import { z } from 'zod';
import { isCalendarDate } from '../../utils/dates.ts';
import { idSchema } from '../../utils/ids.ts';
import { sanitizeDoc } from './content.ts';

const id = idSchema;
/** An empty title is allowed: the page then shows "Untitled note". */
const title = z.string().trim().max(200);
const offset = z.coerce.number().int().min(0).max(100_000).default(0);

/**
 * The editor document, checked against the editor schema (content.ts) and replaced by the clean copy. A refusal is a
 * 400 `validation_failed` naming the path inside `content`, never the content itself.
 */
const content = z.unknown().transform((value, ctx): EditorDoc => {
  const result = sanitizeDoc(value);
  if (result.ok) return result.doc;
  ctx.addIssue({ code: 'custom', message: result.reason, path: result.path });
  return z.NEVER;
});

export const NoteIdParamsSchema = z.object({ id }).strict();
export const NoteMeetingParamsSchema = z.object({ id, meetingId: id }).strict();
export const ProjectIdParamsSchema = z.object({ id }).strict();

const calendarDate = z.string().refine(isCalendarDate, { message: 'not a date' });

export const NotesQuerySchema = z
  .object({
    q: z
      .string()
      .trim()
      .max(100)
      .optional()
      .transform((value) => (value ? value : undefined)),
    project: z.union([z.literal('none'), id]).optional(),
    team: id.optional(),
    shared: z.enum(['yes', 'no']).optional(),
    from: calendarDate.optional(),
    to: calendarDate.optional(),
    sort: z.enum(['newest', 'oldest', 'edited']).default('newest'),
    offset,
    limit: z.coerce.number().int().min(1).max(50).optional(),
  })
  .strict()
  .refine((query) => !query.from || !query.to || query.from <= query.to, { message: 'from is after to', path: ['from'] });

export const ProjectUpdatesQuerySchema = z.object({ offset, order: z.enum(['newest', 'oldest']).default('newest') }).strict();

/** The copy's title (the note's own when not given). */
export const CopyNoteSchema = z.object({ title: title.optional() }).strict();

export const CreateNoteSchema = z.object({ title: title.optional(), projectId: id.optional(), meetingId: id.optional() }).strict();

export const UpdateNoteSchema = z
  .object({
    title: title.optional(),
    content: content.optional(),
    /** The version the editor last loaded or saved (optimistic locking). */
    version: z.number().int().min(1).max(2_147_483_647),
  })
  .strict()
  .refine((b) => b.title !== undefined || b.content !== undefined, { message: 'nothing to change' });

/** List snippets: the first characters of the note's text, on one line. */
export const SNIPPET_LENGTH = 180;
/** My notes and a project's updates come in pages of this size ("Show more"). */
export const PAGE_SIZE = 30;
