import { z } from 'zod';
import type { UserRecord } from '../users/repository.ts';
import type { Session } from './sessions.ts';

export interface AuthConfig {
  /** Lowercase emails that are active admins on every sign-in. */
  adminEmails: string[];
  sessionTtlMs: number;
  /** The no-password stand-in for Apps Gateway. Never on in production. */
  mockSignIn: boolean;
  /** Secure cookies (HTTPS only). On in production. */
  secureCookies: boolean;
}

/** Put on res.locals.auth by authenticate(). */
export interface AuthContext {
  session: Session;
  user: UserRecord;
}

export const MockSignInSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email().max(255)),
    name: z.string().trim().min(1).max(255),
  })
  .strict();

export const SetActiveRoleSchema = z.object({ role: z.enum(['user', 'admin']) }).strict();
