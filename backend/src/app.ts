import express, { type Express } from 'express';
import type { Database } from './database/pool.ts';
import { authenticate, requireActive } from './middleware/authenticate.ts';
import { errorHandler, notFound } from './middleware/errorHandler.ts';
import { requestLogger } from './middleware/requestLogger.ts';
import { securityHeaders } from './middleware/securityHeaders.ts';
import { createAttachmentsRoutes } from './modules/attachments/routes.ts';
import { createAttachmentsService } from './modules/attachments/service.ts';
import { createLocalStorage, type ObjectStorage } from './modules/attachments/storage.ts';
import { createAuthRoutes } from './modules/auth/routes.ts';
import { createAuthService } from './modules/auth/service.ts';
import { createSessionStore, type SessionStore } from './modules/auth/sessions.ts';
import type { AuthConfig } from './modules/auth/types.ts';
import { createHealthRoutes } from './modules/health/routes.ts';
import { createMeetingsRoutes } from './modules/meetings/routes.ts';
import { createMeetingsService } from './modules/meetings/service.ts';
import { createNotesRoutes } from './modules/notes/routes.ts';
import { createNotesService } from './modules/notes/service.ts';
import { createProjectsRoutes } from './modules/projects/routes.ts';
import { createProjectsService } from './modules/projects/service.ts';
import { createTeamProjectsRoutes } from './modules/team-projects/routes.ts';
import { createTeamProjectsService } from './modules/team-projects/service.ts';
import { createTeamsRoutes } from './modules/teams/routes.ts';
import { createTeamsService } from './modules/teams/service.ts';
import { createUsersRepository } from './modules/users/repository.ts';
import { createUsersRoutes } from './modules/users/routes.ts';
import type { Logger } from './utils/logger.ts';

export interface AppDeps {
  db: Database;
  logger: Logger;
  auth: AuthConfig;
  sessions?: SessionStore;
  /** Pins "now" for the meeting dates (tests). */
  now?: () => Date;
  /** Where note images are kept (index.ts picks it from STORAGE_DRIVER). Default: the local `uploads` folder. */
  storage?: ObjectStorage;
}

/** Builds the Express app without listening, so tests can start it on a free port with test doubles. */
export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');

  app.use(requestLogger(deps.logger));
  app.use(securityHeaders);
  // 1 MB: the largest note content allowed (PRD section 4). Images are uploaded separately.
  app.use(express.json({ limit: '1mb', strict: true }));

  const sessions = deps.sessions ?? createSessionStore(deps.auth.sessionTtlMs);
  const users = createUsersRepository(deps.db);
  const storage = deps.storage ?? createLocalStorage('uploads');
  const { db, logger } = deps;
  const authService = createAuthService({ users, sessions, config: deps.auth, logger: deps.logger });

  const api = express.Router();
  api.use(createHealthRoutes(deps));
  api.use(createAuthRoutes({ service: authService, config: deps.auth, sessions, users }));

  // Everything mounted after this line needs a signed-in, active user (FR-2). Unknown /api paths answer 401/403
  // before 404, so they reveal nothing to someone who is not signed in.
  api.use(authenticate({ sessions, users }), requireActive);
  api.use(createUsersRoutes({ db: deps.db, config: deps.auth, logger: deps.logger }));
  api.use(createTeamsRoutes(createTeamsService({ db: deps.db, logger: deps.logger })));
  api.use(createProjectsRoutes(createProjectsService({ db, logger })));
  api.use(createNotesRoutes(createNotesService({ db, logger, storage })));
  api.use(createAttachmentsRoutes(createAttachmentsService({ db, logger, storage })));
  api.use(createMeetingsRoutes(createMeetingsService({ db: deps.db, logger: deps.logger, now: deps.now })));
  api.use(createTeamProjectsRoutes(createTeamProjectsService({ db: deps.db, now: deps.now })));

  app.use('/api', api);
  app.use(notFound);
  app.use(errorHandler(deps.logger));
  return app;
}
