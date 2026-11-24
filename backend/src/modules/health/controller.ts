import { asyncHandler } from '../../utils/asyncHandler.ts';
import type { HealthService } from './service.ts';

export function createHealthController(service: HealthService) {
  return {
    /** GET /api/health — for load balancers and uptime checks; reveals nothing but up or down. */
    getHealth: asyncHandler(async (_req, res) => {
      const result = await service.check();
      res.status(result.status === 'ok' ? 200 : 503).json(result);
    }),
  };
}
