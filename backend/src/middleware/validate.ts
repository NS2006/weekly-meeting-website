import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { AppError } from '../utils/errors.ts';

type Source = 'body' | 'query' | 'params';

/**
 * The single input-validation routine: every route validates body, query and params with a Zod schema here.
 * The parsed value is put on res.locals.validated[source]; handlers read it from there, never from req.
 * A failure answers 400 `validation_failed` with the failing paths and Zod codes only, never the values sent.
 */
export function validate(source: Source, schema: z.ZodType): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), code: issue.code }));
      next(new AppError(400, 'validation_failed', details));
      return;
    }
    res.locals.validated = { ...res.locals.validated, [source]: result.data };
    next();
  };
}
