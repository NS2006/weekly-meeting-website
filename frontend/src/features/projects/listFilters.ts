import type { ProjectActivity, ProjectSort, ProjectStatus, ProjectsQuery } from '@weekly-meeting/shared';

/** Projects per page (owner, 2026-11-25): four rows of three cards, or six of two. */
export const PROJECTS_PER_PAGE = 12;

/** The Projects page's filters, as kept in the address (an empty string: not filtered). */
export interface ProjectListFilters {
  q: string;
  activity: '' | ProjectActivity;
  shared: '' | 'yes' | 'no';
  team: string;
  sort: ProjectSort;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const PROJECT_SORTS: readonly ProjectSort[] = ['updated', 'stale', 'updates', 'name', 'newest', 'oldest'];
export const PROJECT_ACTIVITIES: readonly ProjectActivity[] = ['week', 'month', 'quarter', 'quiet', 'none'];

/** Active (the default) or Archived, from ?status=. */
export const readProjectStatus = (get: (key: string) => string): ProjectStatus => (get('status') === 'archived' ? 'archived' : 'active');

/**
 * The filters in the address (?q=…&activity=…). A value the server would refuse (an edited or old link) is ignored, so
 * the page still shows projects instead of an error.
 */
export function readProjectFilters(get: (key: string) => string): ProjectListFilters {
  const activity = get('activity') as ProjectActivity;
  const shared = get('shared');
  const sort = get('sort') as ProjectSort;
  return {
    q: get('q').trim().slice(0, 100),
    activity: PROJECT_ACTIVITIES.includes(activity) ? activity : '',
    shared: shared === 'yes' || shared === 'no' ? shared : '',
    team: UUID.test(get('team')) ? get('team') : '',
    sort: PROJECT_SORTS.includes(sort) ? sort : 'updated',
  };
}

/** What the server is asked for one page. */
export function projectsQuery(status: ProjectStatus, filters: ProjectListFilters, page: number): ProjectsQuery {
  const query: ProjectsQuery = { status, sort: filters.sort, offset: (page - 1) * PROJECTS_PER_PAGE, limit: PROJECTS_PER_PAGE };
  if (filters.q) query.q = filters.q;
  if (filters.activity) query.activity = filters.activity;
  if (filters.shared) query.shared = filters.shared;
  if (filters.team) query.team = filters.team;
  return query;
}

/** Whether anything narrows the list (the order alone does not). */
export function isFiltered(filters: ProjectListFilters): boolean {
  return Boolean(filters.q || filters.activity || filters.shared || filters.team);
}

/** Every filter cleared, and back to the first page (for "Clear filters"); the tab and the order stay. */
export const CLEARED: Record<'q' | 'activity' | 'shared' | 'team' | 'page', ''> = { q: '', activity: '', shared: '', team: '', page: '' };
