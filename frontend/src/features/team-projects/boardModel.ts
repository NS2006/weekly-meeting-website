import type { MeetingStatus, PeriodProject } from '@weekly-meeting/shared';
import type { Selection } from '../periods/readerFilter';

/**
 * The period's Projects board (owner, 2026-11-24), as plain data: which cards show (search and people), in which
 * columns (one per person, or one per meeting) and in which order. All on the page: a period's projects come at once.
 */
export type BoardGroup = 'person' | 'meeting';
export type BoardSort = 'latest' | 'name' | 'updates';

export const BOARD_SORTS: readonly BoardSort[] = ['latest', 'name', 'updates'];

/** The meeting fields the board needs (a period's `MeetingView`s have them). */
export interface BoardMeeting {
  id: string;
  date: string;
  title: string | null;
  seriesName: string;
  status: MeetingStatus;
}

export interface BoardOwner {
  id: string;
  name: string;
  /** Their projects on the board. */
  count: number;
}

export interface BoardColumn {
  /** `person:<id>` or `meeting:<id>`. */
  key: string;
  person?: { id: string; name: string };
  meeting?: BoardMeeting;
  cards: PeriodProject[];
}

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });

/** The words typed, lower case; none for blank text. */
export function searchWords(text: string): string[] {
  return text.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
}

/** The people with a project on the board, A–Z, with how many each has. */
export function ownersOf(projects: readonly PeriodProject[]): BoardOwner[] {
  const owners = new Map<string, BoardOwner>();
  for (const p of projects) {
    const known = owners.get(p.owner.id);
    if (known) known.count += 1;
    else owners.set(p.owner.id, { id: p.owner.id, name: p.owner.name, count: 1 });
  }
  return [...owners.values()].sort((a, b) => byName(a.name, b.name) || a.id.localeCompare(b.id));
}

/** The projects whose name has every word typed (any case, any order), of the people picked (null: everyone). */
export function filterProjects(projects: readonly PeriodProject[], search: string, owners: Selection): PeriodProject[] {
  const words = searchWords(search);
  const people = owners === null ? null : new Set(owners);
  return projects.filter((p) => {
    if (people && !people.has(p.owner.id)) return false;
    const name = p.name.toLocaleLowerCase();
    return words.every((word) => name.includes(word));
  });
}

/** Cards in a column: latest meeting first (then A–Z), A–Z, or most updates first (then latest). */
export function sortCards(cards: readonly PeriodProject[], sort: BoardSort): PeriodProject[] {
  const name = (a: PeriodProject, b: PeriodProject) => byName(a.name, b.name) || a.id.localeCompare(b.id);
  const latest = (a: PeriodProject, b: PeriodProject) => b.lastSharedOn.localeCompare(a.lastSharedOn);
  const compare =
    sort === 'name'
      ? name
      : sort === 'updates'
        ? (a: PeriodProject, b: PeriodProject) => b.updateCount - a.updateCount || latest(a, b) || name(a, b)
        : (a: PeriodProject, b: PeriodProject) => latest(a, b) || name(a, b);
  return [...cards].sort(compare);
}

/**
 * The columns: one per person A–Z with their projects, or one per meeting (latest first) with the projects shared on
 * it. Only columns with a card show.
 */
export function boardColumns(
  projects: readonly PeriodProject[],
  meetings: readonly BoardMeeting[],
  group: BoardGroup,
  sort: BoardSort,
): BoardColumn[] {
  if (group === 'person') {
    return ownersOf(projects).map((owner) => ({
      key: `person:${owner.id}`,
      person: { id: owner.id, name: owner.name },
      cards: sortCards(
        projects.filter((p) => p.owner.id === owner.id),
        sort,
      ),
    }));
  }
  return [...meetings]
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
    .map((meeting) => ({
      key: `meeting:${meeting.id}`,
      meeting,
      cards: sortCards(
        projects.filter((p) => p.meetingIds.includes(meeting.id)),
        sort,
      ),
    }))
    .filter((column) => column.cards.length > 0);
}

/**
 * The meetings a card's dots stand for, oldest first: the period's meetings that took place (not cancelled, up to
 * today), and any other one something was shared on.
 */
export function timelineOf(meetings: readonly BoardMeeting[], projects: readonly PeriodProject[], today: string): BoardMeeting[] {
  const shared = new Set(projects.flatMap((p) => p.meetingIds));
  return meetings
    .filter((m) => shared.has(m.id) || (m.status !== 'cancelled' && m.date <= today))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

/** A name in pieces, the parts matching a word typed marked (to highlight them, as text, never HTML). */
export function highlightParts(name: string, search: string): { text: string; match: boolean }[] {
  const words = searchWords(search);
  if (words.length === 0) return [{ text: name, match: false }];
  const lower = name.toLocaleLowerCase();
  const marked = new Array<boolean>(name.length).fill(false);
  for (const word of words) {
    for (let at = lower.indexOf(word); at !== -1; at = lower.indexOf(word, at + word.length)) marked.fill(true, at, at + word.length);
  }
  const parts: { text: string; match: boolean }[] = [];
  for (let i = 0; i < name.length; i += 1) {
    const last = parts[parts.length - 1];
    if (last && last.match === marked[i]) last.text += name[i];
    else parts.push({ text: name[i] ?? '', match: marked[i] ?? false });
  }
  return parts;
}

/** The address's value for a board setting: empty for the default. */
export const groupParam = (group: BoardGroup) => (group === 'person' ? '' : group);
export const parseGroup = (value: string | null): BoardGroup => (value === 'meeting' ? 'meeting' : 'person');
export const parseSort = (value: string | null): BoardSort => (value === 'name' || value === 'updates' ? value : 'latest');
