import { loadEnv } from '../src/config/env.ts';

describe('loadEnv()', () => {
  it('applies defaults', () => {
    expect(loadEnv({ DATABASE_URL: 'postgresql://app:pw@localhost:5432/app' })).toEqual({
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: 3000,
      DATABASE_URL: 'postgresql://app:pw@localhost:5432/app',
      DB_POOL_MAX: 10,
      LOG_LEVEL: 'info',
      ADMIN_EMAILS: [],
      SESSION_TTL_HOURS: 8,
      STORAGE_DRIVER: 'local',
      LOCAL_STORAGE_DIR: 'uploads',
    });
  });

  it('needs a bucket for the gcs storage driver, and treats empty values as not set', () => {
    const base = { DATABASE_URL: 'postgresql://x', LOCAL_STORAGE_DIR: '', GCS_BUCKET: ' ' };
    expect(loadEnv(base)).toMatchObject({ STORAGE_DRIVER: 'local', LOCAL_STORAGE_DIR: 'uploads' });
    expect(loadEnv(base).GCS_BUCKET).toBeUndefined();
    expect(() => loadEnv({ ...base, STORAGE_DRIVER: 'gcs' })).toThrow(/GCS_BUCKET/);
    expect(loadEnv({ ...base, STORAGE_DRIVER: 'gcs', GCS_BUCKET: 'wm-notes-staging' }).GCS_BUCKET).toBe('wm-notes-staging');
    expect(() => loadEnv({ ...base, STORAGE_DRIVER: 's3' })).toThrow(/STORAGE_DRIVER/);
  });

  it('reads ADMIN_EMAILS as a trimmed, lowercase list', () => {
    const env = loadEnv({ DATABASE_URL: 'postgresql://x', ADMIN_EMAILS: ' Admin.Test@Example.com , b@example.com,' });
    expect(env.ADMIN_EMAILS).toEqual(['admin.test@example.com', 'b@example.com']);
  });

  it('names a missing variable', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });

  it('never repeats the value it rejects', () => {
    let message = '';
    try {
      loadEnv({ DATABASE_URL: 'mysql://app:hunter2@localhost/app', PORT: 'hunter3', ADMIN_EMAILS: 'hunter4' });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/DATABASE_URL/);
    expect(message).toMatch(/PORT/);
    expect(message).toMatch(/ADMIN_EMAILS/);
    expect(message).not.toMatch(/hunter2|hunter3|hunter4/);
  });
});
