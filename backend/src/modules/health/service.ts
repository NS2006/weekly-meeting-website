import { describeError } from '../../utils/errors.ts';
import type { Logger } from '../../utils/logger.ts';
import type { HealthRepository } from './repository.ts';
import type { HealthStatus } from './types.ts';

export interface HealthService {
  check(): Promise<HealthStatus>;
}

export function createHealthService(repository: HealthRepository, logger: Logger): HealthService {
  return {
    async check() {
      try {
        await repository.ping();
        return { status: 'ok', database: 'up' };
      } catch (err) {
        logger.warn({ err: describeError(err) }, 'database ping failed');
        return { status: 'unavailable', database: 'down' };
      }
    },
  };
}
