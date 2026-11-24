import { randomBytes } from 'node:crypto';
import type { WebsiteRole } from '@weekly-meeting/shared';

export interface Session {
  id: string;
  userId: string;
  activeRole: WebsiteRole;
  expiresAt: number;
}

export interface SessionStore {
  create(userId: string, activeRole: WebsiteRole): Session;
  /** The live session for this id, or null when unknown or expired. */
  get(id: string | undefined): Session | null;
  setActiveRole(id: string, role: WebsiteRole): void;
  destroy(id: string | undefined): void;
}

/**
 * Sessions held in backend memory: a restart signs everyone out, and one backend process only.
 * Enough for the mock sign-in; behind Apps Gateway the gateway's identity replaces this.
 */
export function createSessionStore(ttlMs: number, now: () => number = Date.now): SessionStore {
  const sessions = new Map<string, Session>();

  function sweep(): void {
    const t = now();
    for (const [id, session] of sessions) if (session.expiresAt <= t) sessions.delete(id);
  }

  return {
    create(userId, activeRole) {
      if (sessions.size > 0 && sessions.size % 100 === 0) sweep();
      const session: Session = { id: randomBytes(32).toString('base64url'), userId, activeRole, expiresAt: now() + ttlMs };
      sessions.set(session.id, session);
      return session;
    },
    get(id) {
      if (!id) return null;
      const session = sessions.get(id);
      if (!session) return null;
      if (session.expiresAt <= now()) {
        sessions.delete(id);
        return null;
      }
      return session;
    },
    setActiveRole(id, role) {
      const session = sessions.get(id);
      if (session) session.activeRole = role;
    },
    destroy(id) {
      if (id) sessions.delete(id);
    },
  };
}
