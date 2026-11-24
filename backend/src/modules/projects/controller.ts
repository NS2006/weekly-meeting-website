import type {
  CreateProjectRequest,
  ProjectChoicesQuery,
  ProjectChoicesResponse,
  DeleteProjectRequest,
  ProjectResponse,
  ProjectsQuery,
  ProjectsResponse,
  UpdateProjectRequest,
} from '@weekly-meeting/shared';
import type { Response } from 'express';
import { authOf } from '../../middleware/authenticate.ts';
import { asyncHandler } from '../../utils/asyncHandler.ts';
import type { ProjectsService } from './service.ts';

const idOf = (res: Response) => (res.locals.validated.params as { id: string }).id;

export function createProjectsController(service: ProjectsService) {
  return {
    list: asyncHandler(async (_req, res) => {
      const filters = res.locals.validated.query as ProjectsQuery;
      res.json((await service.list(authOf(res), filters)) satisfies ProjectsResponse);
    }),

    choices: asyncHandler(async (_req, res) => {
      const { q } = res.locals.validated.query as ProjectChoicesQuery;
      res.json((await service.choices(authOf(res), q)) satisfies ProjectChoicesResponse);
    }),

    create: asyncHandler(async (_req, res) => {
      const body = res.locals.validated.body as CreateProjectRequest;
      res.status(201).json({ project: await service.create(authOf(res), body) } satisfies ProjectResponse);
    }),

    get: asyncHandler(async (_req, res) => {
      res.json({ project: await service.get(authOf(res), idOf(res)) } satisfies ProjectResponse);
    }),

    update: asyncHandler(async (_req, res) => {
      const body = res.locals.validated.body as UpdateProjectRequest;
      res.json({ project: await service.update(authOf(res), idOf(res), body) } satisfies ProjectResponse);
    }),

    remove: asyncHandler(async (_req, res) => {
      const { confirmName } = res.locals.validated.body as DeleteProjectRequest;
      await service.remove(authOf(res), idOf(res), confirmName);
      res.status(204).end();
    }),
  };
}
