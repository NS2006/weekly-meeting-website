import { describe, expect, it } from 'vitest';
import { meetingState, notesToChange, pageState, pickedOnPage, toggleNote, togglePage } from './selection';

describe('picking notes', () => {
  const page = ['a', 'b', 'c'];

  it('picks a note and puts it back', () => {
    expect(toggleNote([], 'b')).toEqual(['b']);
    expect(toggleNote(['b', 'a'], 'b')).toEqual(['a']);
  });

  it('tells whether all, some or none of the page is picked', () => {
    expect(pageState([], page)).toBe('none');
    expect(pageState(['b'], page)).toBe('some');
    expect(pageState(['c', 'a', 'b'], page)).toBe('all');
    expect(pageState(['x'], page)).toBe('none'); // a note no longer on the page does not count
  });

  it('"Select all" picks the whole page, or nothing once all are picked', () => {
    expect(togglePage([], page)).toEqual(['a', 'b', 'c']);
    expect(togglePage(['b'], page)).toEqual(['a', 'b', 'c']);
    expect(togglePage(['a', 'b', 'c'], page)).toEqual([]);
  });

  it('keeps only the picked notes still on the page, in its order', () => {
    const notes = page.map((id) => ({ id }));
    expect(pickedOnPage(['c', 'x', 'a'], notes)).toEqual([{ id: 'a' }, { id: 'c' }]);
  });
});

describe('sharing picked notes on a meeting', () => {
  const notes = ['a', 'b', 'c'];
  const shared = { a: ['m1', 'm2'], b: ['m1'], c: ['m1'] };

  it('counts how many of the picked notes are on each meeting', () => {
    expect(meetingState(shared, notes, 'm1')).toEqual({ state: 'all', on: 3 });
    expect(meetingState(shared, notes, 'm2')).toEqual({ state: 'some', on: 1 });
    expect(meetingState(shared, notes, 'm3')).toEqual({ state: 'none', on: 0 });
    expect(meetingState({}, notes, 'm1')).toEqual({ state: 'none', on: 0 }); // a note not known yet is on nothing
  });

  it('ticking a box puts on only the notes not on it yet', () => {
    expect(notesToChange(shared, notes, 'm2')).toEqual({ share: true, noteIds: ['b', 'c'] });
    expect(notesToChange(shared, notes, 'm3')).toEqual({ share: true, noteIds: ['a', 'b', 'c'] });
  });

  it('unticking a full box takes every picked note off', () => {
    expect(notesToChange(shared, notes, 'm1')).toEqual({ share: false, noteIds: ['a', 'b', 'c'] });
  });

  it('works the same for a single note', () => {
    expect(notesToChange({ a: ['m1'] }, ['a'], 'm1')).toEqual({ share: false, noteIds: ['a'] });
    expect(notesToChange({ a: [] }, ['a'], 'm1')).toEqual({ share: true, noteIds: ['a'] });
  });
});
