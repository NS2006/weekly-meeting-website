import { z } from 'zod';
import { idSchema } from '../../utils/ids.ts';

/** Most rows the Users page gets at once; more matches set `truncated` so the admin narrows the search. */
export const USER_LIST_LIMIT = 500;

export const UserIdParamsSchema = z.object({ id: idSchema }).strict();

export const UserListQuerySchema = z
  .object({
    q: z.string().trim().max(100).optional(),
    status: z.enum(['active', 'inactive', 'waiting']).optional(),
    admin: z.enum(['true', 'false']).optional(),
  })
  .strict();

/** People picker: at least 2 characters so one keystroke does not list everyone. */
export const PeopleSearchQuerySchema = z.object({ q: z.string().trim().min(2).max(100) }).strict();
export const PEOPLE_SEARCH_LIMIT = 20;

export const UpdateUserStatusSchema = z.object({ status: z.enum(['active', 'inactive']) }).strict();
