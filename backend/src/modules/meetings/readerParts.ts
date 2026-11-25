/**
 * A period's notes are sent a part at a time (stress test, 2026-11-25): whole meetings, in order, until the next one
 * would go over `budget` notes. The first meeting always goes in, however many notes it holds, so every request moves
 * the reader forward.
 */
export function readerPart<T>(meetings: readonly T[], notesIn: (meeting: T) => number, budget: number): { part: T[]; rest: T[] } {
  let used = 0;
  let taken = 0;
  for (const meeting of meetings) {
    const count = notesIn(meeting);
    if (taken > 0 && used + count > budget) break;
    used += count;
    taken += 1;
  }
  return { part: meetings.slice(0, taken), rest: meetings.slice(taken) };
}
