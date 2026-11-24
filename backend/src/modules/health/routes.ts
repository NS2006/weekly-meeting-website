import { Router } from 'express';
import type { Db } from '../../database/pool.ts';
import type { Logger } from '../../utils/logger.ts';
import { createHealthController } from './controller.ts';
import { createHealthRepository } from './repository.ts';
import { createHealthService } from './service.ts';

export function createHealthRoutes(deps: { db: Db; logger: Logger }): Router {
  const controller = createHealthController(createHealthService(createHealthRepository(deps.db), deps.logger));
  const router = Router();
  router.get('/health', controller.getHealth);
  return router;
}
