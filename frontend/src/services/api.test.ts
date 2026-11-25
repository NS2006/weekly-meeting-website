import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiFailure, queryString, request } from './api';

describe('queryString()', () => {
  it('keeps non-empty strings only, URL-encoded', () => {
    expect(queryString({ q: 'a b&c', status: undefined, admin: '' })).toBe('?q=a+b%26c');
    expect(queryString({})).toBe('');
  });

  it('keeps finite numbers, zero included, so a page reaches the server', () => {
    expect(queryString({ status: 'active', offset: 0, limit: 12 })).toBe('?status=active&offset=0&limit=12');
    expect(queryString({ offset: Number.NaN, limit: Number.POSITIVE_INFINITY })).toBe('');
  });
});

function respond(status: number, body?: unknown) {
  return vi.fn().mockResolvedValue(
    new Response(body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body), { status }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('request()', () => {
  it('returns the JSON body on success', async () => {
    vi.stubGlobal('fetch', respond(200, { user: { id: '1' } }));
    await expect(request('GET', '/me')).resolves.toEqual({ user: { id: '1' } });
  });

  it('sends JSON with a content type only when there is a body', async () => {
    const fetchMock = respond(200, {});
    vi.stubGlobal('fetch', fetchMock);
    await request('PUT', '/me/active-role', { role: 'admin' });
    expect(fetchMock).toHaveBeenCalledWith('/api/me/active-role', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: '{"role":"admin"}',
    });
  });

  it('returns undefined for 204', async () => {
    vi.stubGlobal('fetch', respond(204));
    await expect(request('POST', '/auth/sign-out')).resolves.toBeUndefined();
  });

  it('turns an API error into ApiFailure with its code', async () => {
    vi.stubGlobal('fetch', respond(403, { error: { code: 'account_inactive' } }));
    await expect(request('GET', '/projects')).rejects.toMatchObject({ status: 403, code: 'account_inactive' });
  });

  it('falls back to internal_error for a 5xx without a JSON body', async () => {
    vi.stubGlobal('fetch', respond(502, '<html>Bad gateway</html>'));
    await expect(request('GET', '/me')).rejects.toMatchObject({ status: 502, code: 'internal_error' });
  });

  it('reports network_error when the server cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    const failure = await request('GET', '/me').catch((err: unknown) => err);
    expect(failure).toBeInstanceOf(ApiFailure);
    expect(failure).toMatchObject({ status: 0, code: 'network_error' });
  });
});
