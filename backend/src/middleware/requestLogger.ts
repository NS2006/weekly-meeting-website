import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { Logger } from '../utils/logger.ts';

/**
 * Gives every request an id (response header X-Request-Id, res.locals.requestId) and logs one line when it ends.
 * The query string is left out: it can hold search terms typed by the user.
 */
export function requestLogger(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const requestId = randomUUID();
    const started = process.hrtime.bigint();
    res.locals.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    res.on('finish', () => {
      logger.info(
        {
          requestId,
          method: req.method,
          path: req.originalUrl.split('?')[0],
          status: res.statusCode,
          ms: Math.round(Number(process.hrtime.bigint() - started) / 1e6),
        },
        'request',
      );
    });
    next();
  };
}
