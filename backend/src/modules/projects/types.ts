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
    sort: z.enum(['updated', 'name', 'newest']).default('updated'),
  })
  .strict();

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
