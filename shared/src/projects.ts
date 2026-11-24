/** `archived`: hidden from the main list and read-only until restored. */
export type ProjectStatus = 'active' | 'archived';

export type ProjectSort = 'updated' | 'name' | 'newest';

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

/** GET /api/projects filters, all optional. */
export interface ProjectsQuery {
  /** Text in the name or description. */
  q?: string;
  /** Active (default) or archived projects. */
  status?: ProjectStatus;
  /** Recently updated first (default), name A–Z, or newest first. */
  sort?: ProjectSort;
}

export interface ProjectsResponse {
  projects: ProjectSummary[];
  /** How many projects match the text search in each status (for the tab labels). */
  counts: Record<ProjectStatus, number>;
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
