import { z } from 'zod';
import { idSchema } from '../../utils/ids.ts';
import { PeriodParamsSchema } from '../meetings/types.ts';

export { PeriodParamsSchema };
export const PeriodProjectParamsSchema = PeriodParamsSchema.extend({ projectId: idSchema }).strict();

export const TeamProjectUpdatesQuerySchema = z.object({ offset: z.coerce.number().int().min(0).max(100_000).default(0) }).strict();

/** The most projects a period's board gets at once (a team's few months: far fewer in practice). */
export const BOARD_LIMIT = 1000;

/** A project's updates come in pages of this size ("Show older updates"). */
export const UPDATES_PAGE = 30;
