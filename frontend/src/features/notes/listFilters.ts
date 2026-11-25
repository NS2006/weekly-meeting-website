import type { NoteSort, NotesQuery } from '@weekly-meeting/shared';

/** Notes per page on the Notes page (owner, 2026-11-25: ten, so a long list is split early). */
export const NOTES_PER_PAGE = 10;

/** The Notes page's filters, as kept in the address (an empty string: not filtered). */
export interface NoteListFilters {
  q: string;
  /** A project id, or 'none' for notes with no project part. */
  project: string;
  shared: '' | 'yes' | 'no';
  team: string;
  from: string;
  to: string;
  sort: NoteSort;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const SORTS: readonly NoteSort[] = ['newest', 'oldest', 'edited'];

/**
 * The filters in the address (?q=…&project=…). A value the server would refuse (an edited or old link) is ignored, so
 * the page still shows notes instead of an error.
 */
export function readNoteFilters(get: (key: string) => string): NoteListFilters {
  const project = get('project');
  const shared = get('shared');
  const sort = get('sort') as NoteSort;
  let from = DAY.test(get('from')) ? get('from') : '';
  let to = DAY.test(get('to')) ? get('to') : '';
  if (from && to && from > to) [from, to] = [to, from];
  return {
    q: get('q').trim().slice(0, 100),
    project: project === 'none' || UUID.test(project) ? project : '',
    shared: shared === 'yes' || shared === 'no' ? shared : '',
    team: UUID.test(get('team')) ? get('team') : '',
    from,
    to,
    sort: SORTS.includes(sort) ? sort : 'newest',
  };
}

export { readPage } from '../../utils/pageParam';

/** What the server is asked for one page. */
export function notesQuery(filters: NoteListFilters, page: number): NotesQuery {
  const query: NotesQuery = { sort: filters.sort, offset: (page - 1) * NOTES_PER_PAGE, limit: NOTES_PER_PAGE };
  for (const key of ['q', 'project', 'shared', 'team', 'from', 'to'] as const) if (filters[key]) Object.assign(query, { [key]: filters[key] });
  return query;
}

/** Whether anything narrows the list (the order alone does not). */
export function isFiltered(filters: NoteListFilters): boolean {
  return Boolean(filters.q || filters.project || filters.shared || filters.team || filters.from || filters.to);
}

/** Every filter cleared, and back to the first page (for "Clear filters"). */
export const CLEARED: Record<keyof NoteListFilters | 'page', ''> = {
  q: '',
  project: '',
  shared: '',
  team: '',
  from: '',
  to: '',
  sort: '',
  page: '',
};

/**
 * The "Shared" list is one choice for two address values: '' (any), 'no', 'yes' (on any meeting), or 'team:<id>' (on
 * that team's meetings).
 */
export function sharedChoice(filters: Pick<NoteListFilters, 'shared' | 'team'>): string {
  return filters.team ? `team:${filters.team}` : filters.shared;
}

export function fromSharedChoice(choice: string): { shared: string; team: string } {
  if (choice.startsWith('team:')) return { shared: '', team: choice.slice('team:'.length) };
  return { shared: choice, team: '' };
}

/** The day a row is placed by: when it was written, or when it was last saved when the list is in that order. */
export const listDateOf = (sort: NoteSort, note: { createdAt: string; updatedAt: string }) =>
  sort === 'edited' ? note.updatedAt : note.createdAt;
