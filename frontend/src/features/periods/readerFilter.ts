import type { PeriodMeetingIndex, PeriodMeetingNotes, PeriodNotesQuery } from '@weekly-meeting/shared';
import { currentLanguage, type Language } from '../../i18n/language';
import { fill, messages } from '../../i18n/messages';
import { formatDay } from '../../utils/dates';

/**
 * Which meetings and whose notes to read (and to print or save) in a period (owner, 2026-11-24). A selection is a
 * list of ids, or null for "all"; in the address it is a comma-separated list (`?meetings=…&people=…`), absent for
 * all, and `none` when everything was unticked.
 */
export type Selection = string[] | null;

export interface PersonOption {
  userId: string;
  name: string;
  /** In how many of the period's meetings they have notes. */
  meetings: number;
}

/** Everyone with notes in the period, by name. */
export function peopleOf(meetings: readonly PeriodMeetingIndex[]): PersonOption[] {
  const people = new Map<string, PersonOption>();
  for (const meeting of meetings) {
    for (const person of meeting.people) {
      const known = people.get(person.userId);
      if (known) known.meetings += 1;
      else people.set(person.userId, { userId: person.userId, name: person.name, meetings: 1 });
    }
  }
  return [...people.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** The address's list, kept to ids that exist here; null (all) when it names none of them, or all of them. */
export function parseSelection(param: string, available: readonly string[]): Selection {
  if (!param) return null;
  if (param === 'none') return [];
  const wanted = new Set(param.split(','));
  const kept = available.filter((id) => wanted.has(id));
  return kept.length === 0 || kept.length === available.length ? null : kept;
}

/** The address's value for a selection: empty for all. */
export function selectionParam(selected: Selection, available: readonly string[]): string {
  if (selected === null) return '';
  if (selected.length === 0) return 'none';
  const chosen = new Set(selected);
  const kept = available.filter((id) => chosen.has(id));
  return kept.length === available.length ? '' : kept.join(',');
}

/**
 * The reader starts with the latest meetings only (owner, 2026-11-25: a quarter can hold hundreds of notes, and
 * loading them all every time is slow once deployed); "All" loads every one when asked for.
 */
export const READER_LATEST = 3;
const ID_LIST = /^[0-9a-f-]{36}(,[0-9a-f-]{36})*$/i;
/** An address value that lists meetings (not "all", "none" or something unreadable). */
const isList = (param: string) => ID_LIST.test(param);

/** What to ask the server for, from the address's `meetings`: the latest 3 when it names none, all, or the ones listed. */
export function notesRequest(param: string): PeriodNotesQuery {
  if (param === 'all') return { meetings: 'all' };
  if (isList(param)) return { meetings: param };
  return { latest: READER_LATEST };
}

/**
 * The meetings picked, from the address's `meetings`: the latest 3 (of those with notes) when it names none or none of
 * this period's, null (all) for `all`, nothing for `none`, else the ones listed.
 */
export function pickedMeetingsOf(param: string, index: readonly PeriodMeetingIndex[]): Selection {
  const ids = index.map((m) => m.id);
  if (param === 'all') return null;
  if (param === 'none') return [];
  if (isList(param) && param.split(',').some((id) => ids.includes(id))) return parseSelection(param, ids);
  return ids.length <= READER_LATEST ? null : ids.slice(-READER_LATEST);
}

/** The address's `meetings` for a pick: absent for the latest 3 (the start), `all` for every meeting. */
export function meetingsParam(selected: Selection, index: readonly PeriodMeetingIndex[]): string {
  const ids = index.map((m) => m.id);
  const latest = ids.length <= READER_LATEST ? '' : ids.slice(-READER_LATEST).join(',');
  const value = selectionParam(selected, ids);
  if (value === '') return latest === '' ? '' : 'all';
  return value === latest ? '' : value;
}

/** Whether the reader shows its start: the latest meetings only, while there are more. */
export const showsLatest = (param: string, index: readonly PeriodMeetingIndex[]) =>
  index.length > READER_LATEST && !(param === 'all' || param === 'none' || (isList(param) && param.split(',').some((id) => index.some((m) => m.id === id))));

/** An address `meetings` that names none of this period's meetings (an old link, or unreadable): start over instead. */
export const isStale = (param: string, index: readonly PeriodMeetingIndex[]) =>
  param !== '' && param !== 'all' && param !== 'none' && !(isList(param) && param.split(',').some((id) => index.some((m) => m.id === id)));

/** The chosen meetings, each with only the chosen people; meetings left with nobody are dropped. */
export function filterNotes(meetings: readonly PeriodMeetingNotes[], meetingIds: Selection, userIds: Selection): PeriodMeetingNotes[] {
  const keepMeeting = meetingIds === null ? null : new Set(meetingIds);
  const keepPerson = userIds === null ? null : new Set(userIds);
  return meetings
    .filter((m) => keepMeeting === null || keepMeeting.has(m.id))
    .map((m) => (keepPerson === null ? m : { ...m, people: m.people.filter((p) => keepPerson.has(p.userId)) }))
    .filter((m) => m.people.length > 0);
}

/**
 * "All 8 meetings · all 11 people", or "3 of 8 meetings: Thu 1 Oct, … · 2 of 11 people: Ana Putri, Budi Santoso". In
 * the interface language on screen; the downloads pass 'en'.
 */
export function describeSelection(
  meetings: readonly PeriodMeetingIndex[],
  meetingIds: Selection,
  userIds: Selection,
  language: Language = currentLanguage(),
): string {
  const words = messages(language).periods.selection;
  const list = (names: string[], max: number) =>
    names.length <= max ? names.join(', ') : fill(words.more, { names: names.slice(0, max).join(', '), count: names.length - max });
  const people = peopleOf(meetings);
  const meetingPart =
    meetingIds === null
      ? fill(meetings.length === 1 ? words.allMeetings_one : words.allMeetings_other, { count: meetings.length })
      : meetingIds.length === 0
        ? words.noMeetings
        : fill(words.someMeetings, {
          picked: meetingIds.length,
          count: meetings.length,
          list: list(meetings.filter((m) => meetingIds.includes(m.id)).map((m) => formatDay(m.date, language)), 4),
        });
  const peoplePart =
    userIds === null
      ? fill(people.length === 1 ? words.allPeople_one : words.allPeople_other, { count: people.length })
      : userIds.length === 0
        ? words.noPeople
        : fill(words.somePeople, {
          picked: userIds.length,
          count: people.length,
          list: list(people.filter((p) => userIds.includes(p.userId)).map((p) => p.name), 4),
        });
  return `${meetingPart} · ${peoplePart}`;
}

// The downloaded file's name is always in English (owner, 2026-11-24), whatever language the screen is in.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "8 Oct" from "2026-10-08". */
const shortDay = (date: string) => `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1] ?? ''}`.trim();

/**
 * A file name that says what is in it (owner, 2026-11-24), without characters Windows refuses: the team and period,
 * then the meetings picked (up to three days, else "5 meetings, 8 Oct to 19 Nov") and the people picked (up to two
 * names, else "4 people"). "Team PIR - Q4 2026.docx", "Team PIR - Q4 2026 - 19 Nov - Ana Putri.docx".
 */
export function exportFileName(
  teamName: string,
  periodLabel: string,
  meetings: readonly PeriodMeetingIndex[],
  meetingIds: Selection,
  userIds: Selection,
  extension: string,
): string {
  const parts = [teamName, periodLabel];
  if (meetingIds !== null) {
    const days = meetings.filter((m) => meetingIds.includes(m.id)).map((m) => m.date).sort();
    const first = days[0];
    const last = days[days.length - 1];
    if (days.length > 0 && days.length <= 3) parts.push(days.map(shortDay).join(', '));
    else if (first && last) parts.push(`${days.length} meetings, ${shortDay(first)} to ${shortDay(last)}`);
  }
  if (userIds !== null) {
    const names = peopleOf(meetings).filter((p) => userIds.includes(p.userId)).map((p) => p.name);
    if (names.length > 0) parts.push(names.length <= 2 ? names.join(', ') : `${names.length} people`);
  }
  const base = parts
    .join(' - ')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return `${base || 'Notes'}.${extension}`;
}

/** A pick list longer than this (meetings, people) gets a box to find names in it. */
export const SEARCH_ABOVE = 8;

/** The options whose name has the words typed in it, ignoring case and extra spaces; all of them when nothing is typed. */
export function matchingOptions<T extends { label: string }>(options: readonly T[], find: string): readonly T[] {
  const words = find.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return options;
  return options.filter((o) => {
    const name = o.label.toLocaleLowerCase();
    return words.every((word) => name.includes(word));
  });
}
