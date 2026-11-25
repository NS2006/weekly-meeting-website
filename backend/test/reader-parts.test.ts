import { readerPart } from '../src/modules/meetings/readerParts.ts';

describe('readerPart() (a period read a part at a time, stress test 2026-11-25)', () => {
  const notes = (m: { notes: number }) => m.notes;
  const meetings = (...counts: number[]) => counts.map((n, i) => ({ id: `m${i + 1}`, notes: n }));
  const ids = (list: { id: string }[]) => list.map((m) => m.id);

  it('takes whole meetings, in order, while they fit in the budget', () => {
    const { part, rest } = readerPart(meetings(40, 50, 20, 5), notes, 100);
    expect(ids(part)).toEqual(['m1', 'm2']);
    expect(ids(rest)).toEqual(['m3', 'm4']);
  });

  it('fills the budget exactly', () => {
    expect(ids(readerPart(meetings(60, 40, 1), notes, 100).part)).toEqual(['m1', 'm2']);
  });

  it('always takes the first meeting, however many notes it holds', () => {
    const { part, rest } = readerPart(meetings(151, 3), notes, 100);
    expect(ids(part)).toEqual(['m1']);
    expect(ids(rest)).toEqual(['m2']);
  });

  it('sends everything at once when it is small, and nothing when nothing was asked for', () => {
    expect(readerPart(meetings(3, 4, 5), notes, 100)).toMatchObject({ rest: [] });
    expect(readerPart([], notes, 100)).toEqual({ part: [], rest: [] });
  });
});
