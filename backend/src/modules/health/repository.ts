import type { Db } from '../../database/pool.ts';

export interface HealthRepository {
  ping(): Promise<void>;
}

export function createHealthRepository(db: Db): HealthRepository {
  return {
    async ping() {
      await db.query('SELECT 1');
    },
  };
}
