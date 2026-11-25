/**
 * The notes picked on the Notes page (owner, 2026-11-25: pick one or several, then act on them together, like
 * OneDrive). Only notes on the page shown can be picked; the list keeps the page's order. The picking itself is the
 * shared one (utils/selection.ts), under the Notes page's names.
 */
export {
  pickState as pageState,
  pickedIn as pickedOnPage,
  toggleAll as togglePage,
  toggleId as toggleNote,
} from '../../utils/selection';

/** The meetings each picked note is on (note id → meeting ids), as "Share…" keeps them while it is open. */
export type SharedOn = Readonly<Record<string, readonly string[]>>;

/** How many of the picked notes are on the meeting, and so its box: all (ticked), some (–) or none. */
export function meetingState(shared: SharedOn, noteIds: readonly string[], meetingId: string): { state: 'all' | 'some' | 'none'; on: number } {
  const on = noteIds.filter((id) => shared[id]?.includes(meetingId)).length;
  return { state: on === 0 ? 'none' : on === noteIds.length ? 'all' : 'some', on };
}

/**
 * The notes a click on the meeting's box changes: ticking it (from none or some) puts on the notes not on it yet;
 * unticking it (from all) takes every picked note off.
 */
export function notesToChange(shared: SharedOn, noteIds: readonly string[], meetingId: string): { share: boolean; noteIds: string[] } {
  const share = meetingState(shared, noteIds, meetingId).state !== 'all';
  return { share, noteIds: noteIds.filter((id) => (shared[id]?.includes(meetingId) ?? false) !== share) };
}
