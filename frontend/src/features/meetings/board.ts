import type { MeetingBoardColumn, MeetingMember, MeetingNoteCard } from '@weekly-meeting/shared';
import { currentLanguage, type Language } from '../../i18n/language';
import { messages } from '../../i18n/messages';
import { moveItem } from '../../utils/dragSort';

export interface BoardEntry {
  card: MeetingNoteCard;
  column: MeetingBoardColumn;
}

/** Every card in reading order: group by group (as the board shows them, left to right), each group's cards in order. */
export function readingOrder(columns: readonly MeetingBoardColumn[]): BoardEntry[] {
  return columns.flatMap((column) => column.notes.map((card) => ({ card, column })));
}

/** Where a note sits in the reading order, and the notes before and after it (for "Previous" and "Next"). */
export function positionOf(order: readonly BoardEntry[], noteId: string | null) {
  const index = noteId === null ? -1 : order.findIndex((entry) => entry.card.id === noteId);
  return {
    index,
    total: order.length,
    current: index >= 0 ? order[index] : undefined,
    previous: index > 0 ? order[index - 1] : undefined,
    next: index >= 0 && index < order.length - 1 ? order[index + 1] : undefined,
  };
}

/**
 * The board shows a group only for people who added a note, in the board's order (the same for everyone); everyone
 * else who could (me, and the team's active members) is listed apart behind a "No note yet" button, me first, so
 * empty groups never push the notes out of view.
 */
export function splitBoard(columns: readonly MeetingBoardColumn[]): { writers: MeetingBoardColumn[]; waiting: MeetingBoardColumn[] } {
  const waiting = columns.filter((c) => c.notes.length === 0 && (c.isMe || (c.role !== null && c.active)));
  return {
    writers: columns.filter((c) => c.notes.length > 0),
    waiting: [...waiting.filter((c) => c.isMe), ...waiting.filter((c) => !c.isMe)],
  };
}

/**
 * The speaking order after a group is dragged from `from` to `to` among the groups shown (`writers`): exactly the
 * order on the screen, then everyone with no note yet (in their current order), so a hidden place never puts someone
 * above the people the leader arranged at a later meeting. Returns every person's id in order (what the server
 * stores) and the board as it will look.
 */
export function speakersAfterMove(
  columns: readonly MeetingBoardColumn[],
  writers: readonly MeetingBoardColumn[],
  from: number,
  to: number,
): { userIds: string[]; columns: MeetingBoardColumn[] } {
  const shown = new Set(writers.map((c) => c.userId));
  const ordered = [...moveItem(writers, from, to), ...columns.filter((c) => !shown.has(c.userId))];
  return { userIds: ordered.map((c) => c.userId), columns: ordered };
}

/**
 * The speaking order after a member drags their own group (owner, 2026-11-24: a member moves only themselves, which
 * the server checks): everyone else keeps their place, people with no note yet included, and the moved person goes
 * just before the group they were dropped in front of (or just after the one before them when they end last).
 */
export function selfAfterMove(
  columns: readonly MeetingBoardColumn[],
  writers: readonly MeetingBoardColumn[],
  from: number,
  to: number,
): { userIds: string[]; columns: MeetingBoardColumn[] } {
  const moved = writers[from];
  if (!moved) return { userIds: columns.map((c) => c.userId), columns: [...columns] };
  const shown = moveItem(writers, from, to);
  const place = shown.indexOf(moved);
  const rest = columns.filter((c) => c.userId !== moved.userId);
  const after = shown[place + 1];
  const before = shown[place - 1];
  const at = after
    ? rest.findIndex((c) => c.userId === after.userId)
    : before
      ? rest.findIndex((c) => c.userId === before.userId) + 1
      : rest.length;
  const index = at < 0 ? rest.length : at;
  const ordered = [...rest.slice(0, index), moved, ...rest.slice(index)];
  return { userIds: ordered.map((c) => c.userId), columns: ordered };
}

/** One person's notes after a card is dragged from `from` to `to` in their group: the ids in order, and the board. */
export function notesAfterMove(
  columns: readonly MeetingBoardColumn[],
  userId: string,
  from: number,
  to: number,
): { noteIds: string[]; columns: MeetingBoardColumn[] } {
  let noteIds: string[] = [];
  const next = columns.map((c) => {
    if (c.userId !== userId) return c;
    const notes = moveItem(c.notes, from, to);
    noteIds = notes.map((n) => n.id);
    return { ...c, notes };
  });
  return { noteIds, columns: next };
}

/**
 * A meeting card's "No note yet" names: you first (as "you", in Indonesian "Anda"), then the order given (leader, then
 * by name), at most `max` names and how many more.
 */
export function waitingNames(
  people: readonly MeetingMember[],
  myId: string | undefined,
  max = 3,
  language: Language = currentLanguage(),
): { names: string[]; more: number } {
  const you = messages(language).meetings.board.you;
  const mine = people.filter((p) => p.userId === myId);
  const ordered = [...mine, ...people.filter((p) => p.userId !== myId)];
  return {
    names: ordered.slice(0, max).map((p) => (p.userId === myId ? you : p.name)),
    more: Math.max(0, ordered.length - max),
  };
}

/** How many people (columns) have at least one note, and how many could. */
export function participation(columns: readonly MeetingBoardColumn[]): { wrote: number; members: number } {
  const members = columns.filter((c) => c.role !== null && c.active);
  return { wrote: members.filter((c) => c.notes.length > 0).length, members: members.length };
}

/** True when a moment (ISO) falls on a day in [from, to] (dates as YYYY-MM-DD in Indonesia time). */
export function writtenBetween(iso: string, from: string, to: string, dayOf: (iso: string) => string): boolean {
  const day = dayOf(iso);
  return day >= from && day <= to;
}
