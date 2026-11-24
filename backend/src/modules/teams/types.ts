import { z } from 'zod';
import { idSchema } from '../../utils/ids.ts';

/** Days a deleted (archived) team can still be restored before the purge job deletes it for good. */
export const ARCHIVE_DAYS = 30;
/** How often the purge job runs (it also runs once at start-up). */
export const PURGE_INTERVAL_MS = 60 * 60 * 1000;
/** People shown in "Add people" before the leader types a search. */
export const MEMBER_SUGGESTIONS = 5;
/** Teams picked at random before any text is typed, and the most a search sends. */
export const RANDOM_CHOICES = 5;
export const FOUND_CHOICES = 10;

const id = idSchema;
const name = z.string().trim().min(1).max(100);
/** Empty text clears the description. */
const description = z
  .string()
  .trim()
  .max(500)
  .nullable()
  .transform((value) => (value ? value : null));

export const TeamIdParamsSchema = z.object({ id }).strict();

/** Empty text means no search. */
const searchText = z
  .string()
  .trim()
  .max(100)
  .optional()
  .transform((value) => (value ? value : undefined));

export const TeamsQuerySchema = z
  .object({
    q: searchText,
    role: z.enum(['leader', 'member']).optional(),
    sort: z.enum(['name', 'newest', 'members']).default('name'),
  })
  .strict();
export const TeamChoicesQuerySchema = z.object({ q: searchText }).strict();
export const TeamMemberParamsSchema = z.object({ id, userId: id }).strict();

export const CreateTeamSchema = z.object({ name, description: description.optional() }).strict();

/** Parts that split the year into whole months; the month the team's year starts. */
const periodsPerYear = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(6), z.literal(12)]);
const yearStartMonth = z.number().int().min(1).max(12);

export const UpdateTeamSchema = z
  .object({
    name: name.optional(),
    description: description.optional(),
    periodsPerYear: periodsPerYear.optional(),
    yearStartMonth: yearStartMonth.optional(),
  })
  .strict()
  .refine((body) => Object.values(body).some((value) => value !== undefined), { message: 'nothing to change' });

export const AddTeamMemberSchema = z.object({ userId: id }).strict();
export const SetTeamLeaderSchema = z.object({ userId: id }).strict();
export const DeleteTeamSchema = z.object({ confirmName: z.string().max(200) }).strict();
