import { z } from 'zod';
import { idSchema } from '../../utils/ids.ts';
import { isCalendarDate } from '../../utils/dates.ts';

/** Meetings exist this many days ahead (today included); the job tops them up every hour. */
export const HORIZON_DAYS = 28;
/** How often the meetings job runs (it also runs once at start-up). */
export const REFRESH_INTERVAL_MS = 60 * 60 * 1000;
/** A cap so a mistake or a script cannot fill a team with schedules. */
export const MAX_SERIES_PER_TEAM = 10;
/** Past meetings come in pages of this size ("Show more"). */
export const PAST_PAGE_SIZE = 20;
/**
 * Home lists the meetings of the next four weeks (as far as meetings are made), a page at a time (owner, 2026-11-25:
 * the first 5, then all of them in pages). A page holds at most HOME_PAGE_MAX.
 */
export const HOME_DAYS = HORIZON_DAYS;
export const HOME_PAGE_MAX = 20;
/** The list of my upcoming meetings (a note's "Another meeting" picker) holds at most this many (4 weeks is far fewer). */
export const MY_UPCOMING_LIMIT = 200;
/** A meeting can be moved at most this far ahead. */
export const MOVE_MAX_DAYS = 365;
/** The "jump to" list holds this many meetings on each side of the one shown (more than two years of a weekly one). */
export const SCHEDULE_WINDOW = 120;
/** Caps for arranging a board: more people than a team holds, more notes than anyone links to one meeting. */
export const MAX_SPEAKERS = 500;
export const MAX_ARRANGED_NOTES = 200;

const id = idSchema;
const seriesName = z.string().trim().min(1).max(60);
/** ISO weekdays (Mon = 1 … Sun = 7), at least one, no repeats; stored sorted. */
const daysOfWeek = z
  .array(z.number().int().min(1).max(7))
  .min(1)
  .max(7)
  .refine((days) => new Set(days).size === days.length, { message: 'repeated day' })
  .transform((days) => [...days].sort((a, b) => a - b));
const calendarDate = z.string().refine(isCalendarDate, { message: 'not a date' });
/** Empty text clears the title. */
const title = z
  .string()
  .trim()
  .max(120)
  .nullable()
  .transform((value) => (value ? value : null));

export const IdParamsSchema = z.object({ id }).strict();
/** A team period: `${year}-${index}` (checked against the team's split in the service). */
/** A period's key: its first month and length in months (`2026-10-3m`); whether it fits the team's split is checked later. */
export const PeriodParamsSchema = z.object({ id, key: z.string().regex(/^\d{4}-\d{2}-\d{1,2}m$/) }).strict();

/**
 * A period's notes come a part at a time: whole meetings until about this many notes (always at least one meeting).
 * Stress test, 2026-11-25: a 151-person team's quarter is 3,000 notes and 16 MB in one response, which took the
 * server's memory from 217 to 705 MB and slowed everyone else's pages twentyfold.
 */
export const READER_NOTES_PER_PART = 100;

/** Ids separated by commas (UUIDs are 36 characters, plus the comma). */
const idList = (max: number) =>
  z
    .string()
    .max(max * 37)
    .transform((value) => value.split(','))
    .pipe(z.array(id).min(1).max(max));

/**
 * Which meetings of a period to send in full (owner, 2026-11-25: a quarter can hold hundreds of notes; the reader
 * starts with the last three meetings): `all`, ids separated by commas (at most 200), or the `latest` N; `people`, whose
 * notes (at most 500); `more=1`, a later part of the same reading (no index).
 */
export const PeriodNotesQuerySchema = z
  .object({
    meetings: z.union([z.literal('all'), idList(200)]).optional(),
    latest: z.coerce.number().int().min(1).max(50).optional(),
    people: idList(500).optional(),
    more: z.literal('1').optional(),
  })
  .strict();
export type PeriodNotesPick = z.infer<typeof PeriodNotesQuerySchema>;

const distinctIds = (max: number) =>
  z
    .array(id)
    .min(1)
    .max(max)
    .refine((ids) => new Set(ids).size === ids.length, { message: 'repeated id' });

export const ArrangeSpeakersSchema = z.object({ userIds: distinctIds(MAX_SPEAKERS) }).strict();
export const ArrangeNotesSchema = z.object({ userId: id, noteIds: distinctIds(MAX_ARRANGED_NOTES) }).strict();
export const BoardNoteParamsSchema = z.object({ id, noteId: id }).strict();

export const CreateSeriesSchema = z.object({ name: seriesName, daysOfWeek }).strict();

export const UpdateSeriesSchema = z
  .object({ name: seriesName.optional(), daysOfWeek: daysOfWeek.optional(), active: z.boolean().optional() })
  .strict()
  .refine((b) => b.name !== undefined || b.daysOfWeek !== undefined || b.active !== undefined, {
    message: 'nothing to change',
  });

export const TeamMeetingsQuerySchema = z
  .object({
    when: z.enum(['upcoming', 'past']).default('upcoming'),
    offset: z.coerce.number().int().min(0).max(10_000).default(0),
    // Only the first few (the team page's next 3 meetings, owner 2026-11-25); without it, the whole list.
    limit: z.coerce.number().int().min(1).max(20).optional(),
  })
  .strict();

/** Home's next meetings: a page of the next four weeks (5 when no limit is given; owner, 2026-11-25). */
export const UpcomingMeetingsQuerySchema = z
  .object({
    offset: z.coerce.number().int().min(0).max(10_000).default(0),
    limit: z.coerce.number().int().min(1).max(HOME_PAGE_MAX).default(5),
  })
  .strict();

export const MyMeetingsQuerySchema = z
  .object({
    when: z.enum(['upcoming', 'past']).default('upcoming'),
    teamId: id.optional(),
    status: z.enum(['scheduled', 'cancelled', 'done']).optional(),
    q: z
      .string()
      .trim()
      .max(100)
      .optional()
      .transform((value) => (value ? value : undefined)),
    from: calendarDate.optional(),
    to: calendarDate.optional(),
    offset: z.coerce.number().int().min(0).max(10_000).default(0),
  })
  .strict()
  .refine((query) => !query.from || !query.to || query.from <= query.to, { message: 'from is after to', path: ['from'] });

export const UpdateMeetingSchema = z
  .object({
    title: title.optional(),
    status: z.enum(['scheduled', 'cancelled']).optional(),
    date: calendarDate.optional(),
  })
  .strict()
  .refine((b) => b.title !== undefined || b.status !== undefined || b.date !== undefined, {
    message: 'nothing to change',
  });
