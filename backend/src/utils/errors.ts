/** An error the API reports to the client as `{ error: { code, details? } }` with the given HTTP status. */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, details?: unknown) {
    super(code);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * What may be logged about an unexpected error: its name, code and stack.
 * Never the whole object: a PostgreSQL error's `detail` repeats the values that failed (for example an email).
 */
export function describeError(err: unknown): { name: string; code?: string; stack?: string } {
  if (!(err instanceof Error)) return { name: typeof err };
  const code = (err as { code?: unknown }).code;
  return {
    name: err.name,
    ...(typeof code === 'string' ? { code } : {}),
    ...(err.stack ? { stack: err.stack } : {}),
  };
}
