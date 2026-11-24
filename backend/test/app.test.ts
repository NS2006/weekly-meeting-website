import { createApp } from '../src/app.ts';
import { fakeDb, serve, silentLogger, testAuth } from './helpers.ts';

describe('GET /api/health', () => {
  it('answers 200 when the database answers', async () => {
    const app = await serve(createApp({ db: fakeDb(), logger: silentLogger, auth: testAuth() }));
    try {
      const res = await fetch(`${app.url}/api/health`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: 'ok', database: 'up' });
    } finally {
      await app.close();
    }
  });

  it('answers 503 without database details when the database fails', async () => {
    const dbError = Object.assign(new Error('password authentication failed for user "weekly_meeting"'), {
      code: '28P01',
      detail: 'secret-detail',
    });
    const app = await serve(createApp({ db: fakeDb(dbError), logger: silentLogger, auth: testAuth() }));
    try {
      const res = await fetch(`${app.url}/api/health`);
      const text = await res.text();
      expect(res.status).toBe(503);
      expect(JSON.parse(text)).toEqual({ status: 'unavailable', database: 'down' });
      expect(text).not.toMatch(/weekly_meeting|secret-detail|28P01/);
    } finally {
      await app.close();
    }
  });
});

describe('every response', () => {
  it('carries security headers and a request id, and no X-Powered-By', async () => {
    const app = await serve(createApp({ db: fakeDb(), logger: silentLogger, auth: testAuth() }));
    try {
      const res = await fetch(`${app.url}/api/health`);
      expect(res.headers.get('x-powered-by')).toBeNull();
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('x-frame-options')).toBe('DENY');
      expect(res.headers.get('content-security-policy')).toBe("default-src 'none'; frame-ancestors 'none'");
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(res.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
    } finally {
      await app.close();
    }
  });
});

describe('rejected requests', () => {
  // Changed with sign-in: an unknown /api path now answers 401 to a visitor who is not signed in (it reveals
  // nothing); a signed-in, active user still gets 404 (see auth.test.ts). Non-API paths answer 404.
  it('answers 401 unauthenticated for an unknown /api route when not signed in', async () => {
    const app = await serve(createApp({ db: fakeDb(), logger: silentLogger, auth: testAuth() }));
    try {
      const res = await fetch(`${app.url}/api/nope`);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: { code: 'unauthenticated' } });
    } finally {
      await app.close();
    }
  });

  it('answers 404 not_found for an unknown non-API path', async () => {
    const app = await serve(createApp({ db: fakeDb(), logger: silentLogger, auth: testAuth() }));
    try {
      const res = await fetch(`${app.url}/nope`);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: { code: 'not_found' } });
    } finally {
      await app.close();
    }
  });

  it('answers 400 invalid_json for malformed JSON, without echoing it', async () => {
    const app = await serve(createApp({ db: fakeDb(), logger: silentLogger, auth: testAuth() }));
    try {
      const res = await fetch(`${app.url}/api/health`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"title": secret-typo',
      });
      const text = await res.text();
      expect(res.status).toBe(400);
      expect(JSON.parse(text)).toEqual({ error: { code: 'invalid_json' } });
      expect(text).not.toContain('secret-typo');
    } finally {
      await app.close();
    }
  });

  it('answers 413 too_large for a body over 1 MB', async () => {
    const app = await serve(createApp({ db: fakeDb(), logger: silentLogger, auth: testAuth() }));
    try {
      const res = await fetch(`${app.url}/api/health`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: 'x'.repeat(1024 * 1024 + 1) }),
      });
      expect(res.status).toBe(413);
      expect(await res.json()).toEqual({ error: { code: 'too_large' } });
    } finally {
      await app.close();
    }
  });
});
