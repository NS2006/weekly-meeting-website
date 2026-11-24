import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError, describeError } from '../utils/errors.ts';
import type { Logger } from '../utils/logger.ts';

/** Errors thrown by express.json() carry a `type`; map the ones a client can cause to stable codes. */
const BODY_PARSER_ERRORS: Record<string, { status: number; code: string }> = {
  'entity.parse.failed': { status: 400, code: 'invalid_json' },
  'entity.too.large': { status: 413, code: 'too_large' },
  'charset.unsupported': { status: 415, code: 'unsupported_charset' },
  'encoding.unsupported': { status: 415, code: 'unsupported_encoding' },
  'request.aborted': { status: 400, code: 'request_aborted' },
};

export const notFound: RequestHandler = (_req, _res, next) => {
  next(new AppError(404, 'not_found'));
};

/**
 * The last middleware. Clients get `{ error: { code } }` only: no message, stack or database detail.
 * Unexpected errors are logged with name, code and stack (describeError), never the error object itself.
 */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err, _req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    const requestId: unknown = res.locals.requestId;

    if (err instanceof AppError) {
      logger.warn({ requestId, status: err.status, code: err.code }, 'request rejected');
      res.status(err.status).json({ error: { code: err.code, ...(err.details === undefined ? {} : { details: err.details }) } });
      return;
    }

    const parserType = (err as { type?: unknown }).type;
    const mapped = typeof parserType === 'string' ? BODY_PARSER_ERRORS[parserType] : undefined;
    if (mapped) {
      logger.warn({ requestId, status: mapped.status, code: mapped.code }, 'request rejected');
      res.status(mapped.status).json({ error: { code: mapped.code } });
      return;
    }

    logger.error({ requestId, err: describeError(err) }, 'request failed');
    res.status(500).json({ error: { code: 'internal_error' } });
  };
}
