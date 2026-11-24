import { createSessionStore } from '../src/modules/auth/sessions.ts';
import { readCookie } from '../src/utils/cookies.ts';

describe('session store', () => {
  it('creates unguessable ids and finds the session again', () => {
    const store = createSessionStore(1000);
    const a = store.create('1', 'user');
    const b = store.create('1', 'user');
    expect(a.id).not.toBe(b.id);
    expect(a.id).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 random bytes, base64url
    expect(store.get(a.id)?.userId).toBe('1');
  });

  it('forgets a session once it expires', () => {
    let t = 0;
    const store = createSessionStore(1000, () => t);
    const s = store.create('1', 'user');
    t = 999;
    expect(store.get(s.id)).not.toBeNull();
    t = 1000;
    expect(store.get(s.id)).toBeNull();
  });

  it('changes the active role and destroys sessions', () => {
    const store = createSessionStore(1000);
    const s = store.create('1', 'user');
    store.setActiveRole(s.id, 'admin');
    expect(store.get(s.id)?.activeRole).toBe('admin');
    store.destroy(s.id);
    expect(store.get(s.id)).toBeNull();
    expect(store.get(undefined)).toBeNull();
  });
});

describe('readCookie()', () => {
  it('finds one cookie among several', () => {
    expect(readCookie('a=1; wm_session=abc_-; b=2', 'wm_session')).toBe('abc_-');
  });
  it('returns undefined when missing or malformed', () => {
    expect(readCookie(undefined, 'wm_session')).toBeUndefined();
    expect(readCookie('wm_sessionx=1', 'wm_session')).toBeUndefined();
    expect(readCookie('wm_session=%E0%A4%A', 'wm_session')).toBeUndefined();
  });
});
