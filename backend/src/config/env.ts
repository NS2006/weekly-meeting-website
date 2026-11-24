import { z } from 'zod';

/** `NAME=` in a .env file means "not set". */
const blankAsUndefined = z
  .string()
  .optional()
  .transform((value) => (value?.trim() ? value.trim() : undefined));

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /** 127.0.0.1 by default: reachable from this machine only. A container sets 0.0.0.0 behind the gateway. */
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'must be a postgresql:// connection string'),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Comma-separated emails that are active website admins on every sign-in (the first admin, and a way back in). */
  ADMIN_EMAILS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    )
    .pipe(z.array(z.email())),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24).default(8),
  /**
   * Where note images are kept: `local`, a folder on this machine (development), or `gcs`, a private Google Cloud
   * Storage bucket (staging and production: a container's own disk is lost on every deploy).
   */
  STORAGE_DRIVER: z.enum(['local', 'gcs']).default('local'),
  /** local: the folder, relative to the backend's working directory unless absolute. Gitignored. */
  LOCAL_STORAGE_DIR: blankAsUndefined.pipe(z.string().default('uploads')),
  /** gcs: the bucket name. Credentials come from Application Default Credentials, never from this file. */
  GCS_BUCKET: blankAsUndefined.pipe(
    z
      .string()
      .regex(/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/, 'must be a bucket name')
      .optional(),
  ),
}).refine((env) => env.STORAGE_DRIVER !== 'gcs' || env.GCS_BUCKET !== undefined, {
  message: 'is required when STORAGE_DRIVER=gcs',
  path: ['GCS_BUCKET'],
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Reads and validates configuration once at start-up. The error names the invalid variables
 * but never their values, so a connection string with a password cannot end up in a log.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `${issue.path.map(String).join('.')}: ${issue.message}`);
    throw new Error(`Invalid environment: ${problems.join('; ')}`);
  }
  return result.data;
}
