import express from 'express';
import { z } from 'zod';
import { errorHandler } from '../src/middleware/errorHandler.ts';
import { validate } from '../src/middleware/validate.ts';
import { asyncHandler } from '../src/utils/asyncHandler.ts';
import { serve, silentLogger } from './helpers.ts';

function testApp() {
  const app = express();
  app.use(express.json());
  app.post(
    '/notes',
    validate('body', z.object({ title: z.string().max(200), version: z.number().int().positive() }).strict()),
    (_req, res) => {
      res.json({ received: res.locals.validated.body });
    },
  );
  app.get('/boom', () => {
    throw new Error('secret internal message');
  });
  app.get(
    '/boom-async',
    asyncHandler(async () => {
      throw Object.assign(new Error('duplicate key'), { code: '23505', detail: 'Key (email)=(a@b.c) already exists.' });
    }),
  );
  app.use(errorHandler(silentLogger));
  return app;
}

describe('validate()', () => {
  it('passes the parsed body on', async () => {
    const app = await serve(testApp());
    try {
      const res = await fetch(`${app.url}/notes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Week 47', version: 1 }),
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: { title: 'Week 47', version: 1 } });
    } finally {
      await app.close();
    }
  });

  it('rejects with failing paths and codes only, never the values sent', async () => {
    const app = await serve(testApp());
    try {
      const res = await fetch(`${app.url}/notes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'x'.repeat(201), version: 'one', extra: 'secret-extra' }),
      });
      const text = await res.text();
      const body = JSON.parse(text) as { error: { code: string; details: { path: string; code: string }[] } };
      expect(res.status).toBe(400);
      expect(body.error.code).toBe('validation_failed');
      expect(body.error.details.map((d) => d.path).sort()).toEqual(['', 'title', 'version']);
      expect(text).not.toContain('secret-extra');
      expect(text).not.toContain('xxxxx');
    } finally {
      await app.close();
    }
  });
});

describe('errorHandler()', () => {
  it.each(['/boom', '/boom-async'])('answers 500 internal_error with no message or detail (%s)', async (path) => {
    const app = await serve(testApp());
    try {
      const res = await fetch(`${app.url}${path}`);
      const text = await res.text();
      expect(res.status).toBe(500);
      expect(JSON.parse(text)).toEqual({ error: { code: 'internal_error' } });
      expect(text).not.toMatch(/secret|duplicate|a@b\.c|23505|stack/);
    } finally {
      await app.close();
    }
  });
});
