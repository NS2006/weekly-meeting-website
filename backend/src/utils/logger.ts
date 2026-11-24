import { pino, type LevelWithSilent, type Logger } from 'pino';

export type { Logger };

/**
 * The one logger of the backend. Log ids, codes and counts only: never note content, names, emails or secrets.
 * The redact list is a safety net, not permission to log objects that hold those fields.
 */
export function createLogger(level: LevelWithSilent): Logger {
  return pino({
    level,
    base: { service: 'weekly-meeting-backend' },
    redact: {
      paths: [
        'password',
        '*.password',
        'authorization',
        '*.authorization',
        'cookie',
        '*.cookie',
        'connectionString',
        '*.connectionString',
      ],
      censor: '[redacted]',
    },
  });
}
