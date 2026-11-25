/** `archived`: hidden from the main list and read-only until restored. */
export type ProjectStatus = 'active' | 'archived';

/**
 * Recently updated first (default), least recently updated first, most updates first, name A–Z, newest or oldest
 * first.
 */
export type ProjectSort = 'updated' | 'stale' | 'updates' | 'name' | 'newest' | 'oldest';

/**
 * When the project's updates were last written (owner, 2026-11-25): in the past 7, 30 or 90 days, more than 90 days
 * ago (`quiet`), or never (`none`).
 */
export type ProjectActivity = 'week' | 'month' | 'quarter' | 'quiet' | 'none';

/** A project as its owner sees it. Only the owner ever does (others get 404). */
export interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  createdAt: string;
  /** When the name, description or status last changed. */
  updatedAt: string;
  /** How many of my notes have a section for this project. */
  updateCount: number;
  /** When one of those notes was last saved; null without any. */
  lastUpdateAt: string | null;
}

export type ProjectDetail = ProjectSummary;

/** GET /api/projects: my projects, filtered, sorted and paged on the server. Every field is optional. */
export interface ProjectsQuery {
  /** Text in the name or description. */
  q?: string;
  /** Active (default) or archived projects. */
  status?: ProjectStatus;
  /** When its updates were last written. */
  activity?: ProjectActivity;
  /** `yes`: an update of it is shared on at least one meeting; `no`: none is. */
  shared?: 'yes' | 'no';
  /** Only projects with an update shared on a meeting of this team. */
  team?: string;
  sort?: ProjectSort;
  offset?: number;
  /** Projects per page, 1–500 (12 when not given; the editor's Project menu asks for all its active ones). */
  limit?: number;
}

export interface ProjectsResponse {
  projects: ProjectSummary[];
  /** How many projects match every filter but the status, in each status (for the tab labels). */
  counts: Record<ProjectStatus, number>;
  /** How many match in the status asked for, on every page. */
  total: number;
  /** More projects after this page. */
  hasMore: boolean;
}

export interface ProjectResponse {
  project: ProjectDetail;
}

/** A project to pick (a filter, a picker): just what names it. */
export type ProjectChoice = Pick<ProjectSummary, 'id' | 'name' | 'status'>;

/**
 * GET /api/projects/choices: without `q`, a few of my projects at random (each call another pick); with `q`, my
 * projects whose name holds it, active ones first, then A–Z.
 */
export interface ProjectChoicesQuery {
  q?: string;
}

export interface ProjectChoicesResponse {
  projects: ProjectChoice[];
  /** More projects match than were sent (type more to narrow them). */
  hasMore: boolean;
}

/** POST /api/projects. The name must be new among my projects, ignoring case (409 `project_name_taken`). */
export interface CreateProjectRequest {
  name: string;
  description?: string | null;
}

/**
 * PATCH /api/projects/:id. `status` archives or restores. An archived project only accepts being restored
 * (409 `project_archived`); empty description text clears it.
 */
export interface UpdateProjectRequest {
  name?: string;
  description?: string | null;
  status?: ProjectStatus;
}

/** DELETE /api/projects/:id: deletes the project for good (notes stay; their sections for it become untagged). */
export interface DeleteProjectRequest {
  confirmName: string;
}
