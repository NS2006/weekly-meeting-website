import { z } from 'zod';
import { idSchema } from '../../utils/ids.ts';

const id = idSchema;
const name = z.string().trim().min(1).max(100);
/** Empty text clears the description. */
const description = z
  .string()
  .trim()
  .max(500)
  .nullable()
  .transform((value) => (value ? value : null));
const status = z.enum(['active', 'archived']);

export const ProjectIdParamsSchema = z.object({ id }).strict();

export const ProjectsQuerySchema = z
  .object({
    q: z
      .string()
      .trim()
      .max(100)
      .optional()
      .transform((value) => (value ? value : undefined)),
    status: status.default('active'),
    activity: z.enum(['week', 'month', 'quarter', 'quiet', 'none']).optional(),
    shared: z.enum(['yes', 'no']).optional(),
    team: id.optional(),
    sort: z.enum(['updated', 'stale', 'updates', 'name', 'newest', 'oldest']).default('updated'),
    offset: z.coerce.number().int().min(0).max(100_000).default(0),
    // Up to 500: the editor's Project menu asks for every active project at once (a person has tens, a few hundred at most).
    limit: z.coerce.number().int().min(1).max(500).default(12),
  })
  .strict();

/** Projects a page when the request does not say (owner, 2026-11-25: four rows of three cards). */
export const PROJECTS_PAGE = 12;

/** "Last update" filter: how many days back each choice reaches; `quiet` is older than the longest. */
export const ACTIVITY_DAYS = { week: 7, month: 30, quarter: 90 } as const;

export const ProjectChoicesQuerySchema = z
  .object({
    q: z
      .string()
      .trim()
      .max(100)
      .optional()
      .transform((value) => (value ? value : undefined)),
  })
  .strict();

/** Projects picked at random before any text is typed, and the most a search sends. */
export const RANDOM_CHOICES = 5;
export const FOUND_CHOICES = 10;

export const CreateProjectSchema = z.object({ name, description: description.optional() }).strict();

export const UpdateProjectSchema = z
  .object({ name: name.optional(), description: description.optional(), status: status.optional() })
  .strict()
  .refine((b) => b.name !== undefined || b.description !== undefined || b.status !== undefined, {
    message: 'nothing to change',
  });

export const DeleteProjectSchema = z.object({ confirmName: z.string().max(200) }).strict();

/** The unique index on (user_id, lower(name)); a violation of it means the name is taken. */
export const NAME_INDEX = 'projects_user_id_name_key';
