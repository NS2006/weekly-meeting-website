import type { MeetingBoardColumn, MeetingNoteCard } from '@weekly-meeting/shared';
import { describe, expect, it } from 'vitest';
import {
  notesAfterMove,
  participation,
  positionOf,
  readingOrder,
  selfAfterMove,
  speakersAfterMove,
  splitBoard,
  waitingNames,
  writtenBetween,
} from './board';

const card = (id: string): MeetingNoteCard => ({
  id,
  title: id,
  snippet: '',
  projects: [],
  coverUrl: null,
  imageCount: 0,
  createdAt: '2026-11-23T02:00:00.000Z',
  updatedAt: '2026-11-23T02:00:00.000Z',
});
const column = (name: string, notes: string[], extra: Partial<MeetingBoardColumn> = {}): MeetingBoardColumn => ({
  userId: name,
  name,
  role: 'member',
  active: true,
  isMe: false,
  notes: notes.map(card),
  ...extra,
});

describe('reading the board', () => {
  const columns = [column('Me', [], { isMe: true }), column('Ana', ['a1', 'a2']), column('Bo', ['b1']), column('Left', ['l1'], { role: null })];

  it('goes column by column, top to bottom', () => {
    expect(readingOrder(columns).map((e) => e.card.id)).toEqual(['a1', 'a2', 'b1', 'l1']);
  });

  it('knows the previous and next note, and none past the ends', () => {
    const order = readingOrder(columns);
    expect(positionOf(order, 'a2')).toMatchObject({ index: 1, total: 4, previous: { card: { id: 'a1' } }, next: { card: { id: 'b1' } } });
    expect(positionOf(order, 'a1').previous).toBeUndefined();
    expect(positionOf(order, 'l1').next).toBeUndefined();
    expect(positionOf(order, 'gone')).toMatchObject({ index: -1, current: undefined, next: undefined });
  });

  it('gives columns only to people who added a note, and lists the rest apart (me first), not people who left', () => {
    const team = [
      column('Me', [], { isMe: true }),
      column('Lead', [], { role: 'leader' }),
      column('Ana', ['a1']),
      column('Cy', []),
      column('Gone', [], { active: false }),
      column('Left', ['l1'], { role: null }),
    ];
    const { writers, waiting } = splitBoard(team);
    expect(writers.map((c) => c.name)).toEqual(['Ana', 'Left']);
    expect(waiting.map((c) => c.name)).toEqual(['Me', 'Lead', 'Cy']);
    expect(splitBoard([column('Me', ['m1'], { isMe: true })])).toEqual({ writers: [expect.objectContaining({ name: 'Me' })], waiting: [] });
    // The board's order is the speaking order for everyone; in the "No note yet" list I still come first.
    const later = splitBoard([column('Lead', [], { role: 'leader' }), column('Ana', ['a1']), column('Me', [], { isMe: true })]);
    expect(later.waiting.map((c) => c.name)).toEqual(['Me', 'Lead']);
  });

  it('saves the speaking order as shown after dragging a group, people with no note yet after them', () => {
    // On the board: Ana, Bo, Cy (with notes); Lead and Dee (no note yet) sit before and between them in the order.
    const board = [column('Lead', [], { role: 'leader' }), column('Ana', ['a1']), column('Bo', ['b1']), column('Dee', []), column('Cy', ['c1'])];
    const { writers } = splitBoard(board);
    const moved = speakersAfterMove(board, writers, 2, 0); // Cy to the top
    expect(moved.userIds).toEqual(['Cy', 'Ana', 'Bo', 'Lead', 'Dee']);
    expect(moved.columns.map((c) => c.name)).toEqual(['Cy', 'Ana', 'Bo', 'Lead', 'Dee']);
    expect(splitBoard(moved.columns).writers.map((c) => c.name)).toEqual(['Cy', 'Ana', 'Bo']);
  });

  it('moves only my own group when I am a member, everyone else keeping their place', () => {
    // On the board: Ana, Me, Cy (with notes); Lead and Dee (no note yet) sit before and between them in the order.
    const board = [column('Lead', [], { role: 'leader' }), column('Ana', ['a1']), column('Me', ['m1'], { isMe: true }), column('Dee', []), column('Cy', ['c1'])];
    const { writers } = splitBoard(board);
    expect(writers.map((c) => c.name)).toEqual(['Ana', 'Me', 'Cy']);
    const others = (ids: string[]) => ids.filter((id) => id !== 'Me');
    // First: just before Ana.
    const first = selfAfterMove(board, writers, 1, 0);
    expect(first.userIds).toEqual(['Lead', 'Me', 'Ana', 'Dee', 'Cy']);
    expect(splitBoard(first.columns).writers.map((c) => c.name)).toEqual(['Me', 'Ana', 'Cy']);
    // Last: just after Cy.
    const last = selfAfterMove(board, writers, 1, 2);
    expect(last.userIds).toEqual(['Lead', 'Ana', 'Dee', 'Cy', 'Me']);
    expect(splitBoard(last.columns).writers.map((c) => c.name)).toEqual(['Ana', 'Cy', 'Me']);
    // Either way the others are in the same order, as the server requires of a member.
    for (const moved of [first, last]) expect(others(moved.userIds)).toEqual(others(board.map((c) => c.userId)));
    expect(selfAfterMove(board, writers, 5, 0).userIds).toEqual(board.map((c) => c.userId));
  });

  it("changes the order of one person's notes, and nobody else's", () => {
    const board = [column('Ana', ['a1', 'a2', 'a3']), column('Bo', ['b1', 'b2'])];
    const moved = notesAfterMove(board, 'Ana', 2, 0);
    expect(moved.noteIds).toEqual(['a3', 'a1', 'a2']);
    expect(moved.columns.map((c) => c.notes.map((n) => n.id))).toEqual([['a3', 'a1', 'a2'], ['b1', 'b2']]);
    expect(moved.columns[1]).toBe(board[1]);
  });

  it('names who has no note on a meeting card: you first as "you", three names, then how many more', () => {
    const member = (userId: string, name: string, role: 'leader' | 'member' = 'member') => ({ userId, name, role });
    const people = [member('l', 'Lead', 'leader'), member('a', 'Ana'), member('b', 'Bo'), member('me', 'Me Myself'), member('c', 'Cy')];
    expect(waitingNames(people, 'me')).toEqual({ names: ['you', 'Lead', 'Ana'], more: 2 });
    expect(waitingNames(people, 'someone else')).toEqual({ names: ['Lead', 'Ana', 'Bo'], more: 2 });
    expect(waitingNames(people.slice(0, 2), undefined)).toEqual({ names: ['Lead', 'Ana'], more: 0 });
    expect(waitingNames([], 'me')).toEqual({ names: [], more: 0 });
    // In Indonesian "you" is "Anda"; people's names stay as they are.
    expect(waitingNames(people, 'me', 3, 'id')).toEqual({ names: ['Anda', 'Lead', 'Ana'], more: 2 });
  });

  it('counts who wrote among the current, active members', () => {
    expect(participation(columns)).toEqual({ wrote: 2, members: 3 });
  });

  it("tells whether a note was written in a meeting's days", () => {
    const day = (iso: string) => iso.slice(0, 10);
    expect(writtenBetween('2026-11-21T09:00:00Z', '2026-11-21', '2026-11-25', day)).toBe(true);
    expect(writtenBetween('2026-11-20T09:00:00Z', '2026-11-21', '2026-11-25', day)).toBe(false);
  });
});
