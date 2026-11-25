import { describe, expect, it } from 'vitest';
import type { PeriodMeetingNotes } from '@weekly-meeting/shared';
import {
  describeSelection,
  exportFileName,
  filterNotes,
  isStale,
  matchingOptions,
  meetingsParam,
  nextPart,
  notesRequest,
  parseSelection,
  peopleOf,
  pickedMeetingsOf,
  readingPlan,
  selectionParam,
  showsLatest,
  splitParts,
} from './readerFilter';

const doc = { type: 'doc' as const, content: [{ type: 'paragraph' }] };
const note = (id: string) => ({ id, title: '', content: doc, projects: [], updatedAt: '2026-11-20T00:00:00Z' });
const meeting = (id: string, date: string, people: [string, string][]): PeriodMeetingNotes => ({
  id,
  date,
  title: null,
  seriesName: 'Weekly Update',
  status: 'done',
  people: people.map(([userId, name]) => ({ userId, name, notes: [note(`${id}-${userId}`)] })),
});

const meetings = [
  meeting('m1', '2026-10-01', [['u2', 'Uma Lane'], ['u1', 'Ari Cole']]),
  meeting('m2', '2026-10-08', [['u1', 'Ari Cole']]),
  meeting('m3', '2026-10-15', [['u3', 'Bo Park'], ['u1', 'Ari Cole']]),
];

describe('reading a selection of a period', () => {
  it('lists everyone with notes by name, with how many meetings they wrote for', () => {
    expect(peopleOf(meetings)).toEqual([
      { userId: 'u1', name: 'Ari Cole', meetings: 3 },
      { userId: 'u3', name: 'Bo Park', meetings: 1 },
      { userId: 'u2', name: 'Uma Lane', meetings: 1 },
    ]);
  });

  it('reads the address, keeping only ids that exist, and all when none or every one is named', () => {
    const ids = ['m1', 'm2', 'm3'];
    expect(parseSelection('', ids)).toBeNull();
    expect(parseSelection('m3,m1,gone', ids)).toEqual(['m1', 'm3']);
    expect(parseSelection('gone', ids)).toBeNull();
    expect(parseSelection('m1,m2,m3', ids)).toBeNull();
    expect(selectionParam(['m3', 'm1'], ids)).toBe('m1,m3');
    expect(selectionParam(['m1', 'm2', 'm3'], ids)).toBe('');
    expect(selectionParam(null, ids)).toBe('');
    // Everything unticked stays nothing (the reader says so), not all.
    expect(selectionParam([], ids)).toBe('none');
    expect(parseSelection('none', ids)).toEqual([]);
  });

  it('splits a reading into the parts the server sends: whole meetings up to 100 notes, at least one each', () => {
    const m = (id: string, notes: number) => ({ id, notes });
    expect(splitParts([m('a', 40), m('b', 50), m('c', 20), m('d', 5)])).toEqual([['a', 'b'], ['c', 'd']]);
    expect(splitParts([m('a', 60), m('b', 40), m('c', 1)])).toEqual([['a', 'b'], ['c']]);
    expect(splitParts([m('a', 151), m('b', 3)])).toEqual([['a'], ['b']]);
    expect(splitParts([])).toEqual([]);
  });

  it('plans the whole reading from the index: the meetings chosen with the people chosen, loaded or not', () => {
    expect(readingPlan(meetings, null, null)).toEqual(meetings);
    expect(readingPlan(meetings, ['m1', 'm2'], ['u2']).map((m) => [m.id, m.people.map((p) => p.userId)])).toEqual([['m1', ['u2']]]);
    expect(readingPlan(meetings, [], null)).toEqual([]);
  });

  it('keeps the chosen meetings with the chosen people, in order, and drops meetings left empty', () => {
    expect(filterNotes(meetings, null, null)).toEqual(meetings);
    const some = filterNotes(meetings, ['m1', 'm3'], ['u2', 'u3']);
    expect(some.map((m) => [m.id, m.people.map((p) => p.userId)])).toEqual([
      ['m1', ['u2']],
      ['m3', ['u3']],
    ]);
    expect(filterNotes(meetings, ['m2'], ['u3'])).toEqual([]);
  });

  it('describes the selection for the page, the print and the Word file', () => {
    expect(describeSelection(meetings, null, null)).toBe('All 3 meetings · all 3 people');
    expect(describeSelection(meetings, ['m1', 'm3'], ['u1'])).toBe('2 of 3 meetings: Thu 1 Oct, Thu 15 Oct · 1 of 3 people: Ari Cole');
  });

  it('describes it in Indonesian on screen, and in English for the downloads', () => {
    expect(describeSelection(meetings, null, null, 'id')).toBe('Semua 3 rapat · semua 3 orang');
    expect(describeSelection(meetings, ['m1', 'm3'], ['u1'], 'id')).toBe('2 dari 3 rapat: Kam, 1 Okt, Kam, 15 Okt · 1 dari 3 orang: Ari Cole');
    expect(describeSelection(meetings, [], [], 'id')).toBe('Tidak ada rapat yang dipilih · tidak ada orang yang dipilih');
    expect(describeSelection(meetings, ['m1', 'm3'], ['u1'], 'en')).toBe('2 of 3 meetings: Thu 1 Oct, Thu 15 Oct · 1 of 3 people: Ari Cole');
    expect(describeSelection(meetings, [], [], 'en')).toBe('No meetings picked · no people picked');
    // More than four names: the rest are counted.
    const many = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => meeting(id, `2026-11-0${i + 1}`, [['u1', 'Ari Cole']]));
    expect(describeSelection(many, ['a', 'b', 'c', 'd', 'e'], null, 'id')).toBe(
      '5 dari 6 rapat: Min, 1 Nov, Sen, 2 Nov, Sel, 3 Nov, Rab, 4 Nov dan 1 lainnya · semua 1 orang',
    );
    expect(describeSelection(many, ['a', 'b', 'c', 'd', 'e'], null, 'en')).toBe(
      '5 of 6 meetings: Sun 1 Nov, Mon 2 Nov, Tue 3 Nov, Wed 4 Nov and 1 more · all 1 person',
    );
  });

  it('names the file safely', () => {
    expect(exportFileName('Team PIR', 'Q4 2026', meetings, null, null, 'docx')).toBe('Team PIR - Q4 2026.docx');
    expect(exportFileName('R&D: "Core"/Ops', 'FY 2026/27', meetings, null, null, 'pdf')).toBe('R&D Core Ops - FY 2026 27.pdf');
    // It says what was picked: the days (up to three) and the people (up to two names).
    expect(exportFileName('Team PIR', 'Q4 2026', meetings, ['m3'], ['u1'], 'docx')).toBe('Team PIR - Q4 2026 - 15 Oct - Ari Cole.docx');
    expect(exportFileName('Team PIR', 'Q4 2026', meetings, ['m3', 'm1'], null, 'pdf')).toBe('Team PIR - Q4 2026 - 1 Oct, 15 Oct.pdf');
    expect(exportFileName('Team PIR', 'Q4 2026', meetings, null, ['u1', 'u2', 'u3'], 'docx')).toBe('Team PIR - Q4 2026 - 3 people.docx');
  });
});

describe('matchingOptions', () => {
  const options = [{ label: 'Andi Pratama' }, { label: 'Budi Santoso' }, { label: 'Citra Pratiwi' }, { label: 'Thu 19 Nov' }];

  it('keeps every option when nothing (or only spaces) is typed', () => {
    expect(matchingOptions(options, '')).toBe(options);
    expect(matchingOptions(options, '   ')).toBe(options);
  });

  it('finds names containing every word typed, ignoring case and order', () => {
    expect(matchingOptions(options, 'prat').map((o) => o.label)).toEqual(['Andi Pratama', 'Citra Pratiwi']);
    expect(matchingOptions(options, '  PRATAMA andi ').map((o) => o.label)).toEqual(['Andi Pratama']);
    expect(matchingOptions(options, '19 nov').map((o) => o.label)).toEqual(['Thu 19 Nov']);
  });

  it('finds nothing when a word is in no name', () => {
    expect(matchingOptions(options, 'andi zzz')).toEqual([]);
  });
});

describe('the reader starts with the latest 3 meetings (owner, 2026-11-25)', () => {
  const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
  const quarter = [1, 2, 3, 4, 5].map((n) => meeting(id(n), `2026-10-0${n}`, [['u1', 'Ari Cole']]));
  const latest = [id(3), id(4), id(5)];

  it('asks the server for the latest 3, all, or the meetings listed', () => {
    expect(notesRequest('')).toEqual({ latest: 3 });
    expect(notesRequest('all')).toEqual({ meetings: 'all' });
    expect(notesRequest(`${id(1)},${id(2)}`)).toEqual({ meetings: `${id(1)},${id(2)}` });
    expect(notesRequest('none')).toEqual({ latest: 3 }); // nothing to read: the cheap request
    expect(notesRequest('<script>')).toEqual({ latest: 3 }); // unreadable
  });

  it('asks for the people picked only, and for the next part by the meetings the server named (stress test)', () => {
    const who = `${id(7)},${id(8)}`;
    expect(notesRequest('all', who)).toEqual({ meetings: 'all', people: who });
    expect(notesRequest('', who)).toEqual({ latest: 3, people: who });
    expect(notesRequest('all', 'none')).toEqual({ meetings: 'all' }); // nobody picked: nothing to narrow
    expect(notesRequest('all', '<script>')).toEqual({ meetings: 'all' });
    expect(nextPart({ latest: 3, people: who }, [id(4), id(5)])).toEqual({ meetings: `${id(4)},${id(5)}`, people: who, more: 1 });
    expect(nextPart({ meetings: 'all' }, [id(5)])).toEqual({ meetings: id(5), more: 1 });
  });

  it('picks the latest 3 at the start, every meeting for "all", or the ones listed', () => {
    expect(pickedMeetingsOf('', quarter)).toEqual(latest);
    expect(pickedMeetingsOf('all', quarter)).toBeNull();
    expect(pickedMeetingsOf('none', quarter)).toEqual([]);
    expect(pickedMeetingsOf(id(2), quarter)).toEqual([id(2)]);
    expect(pickedMeetingsOf(id(9), quarter)).toEqual(latest); // none of this period's: the start
    expect(pickedMeetingsOf('', quarter.slice(0, 3))).toBeNull(); // three or fewer: all of them
  });

  it('keeps the address short: nothing for the latest 3, "all" for every meeting', () => {
    expect(meetingsParam(latest, quarter)).toBe('');
    expect(meetingsParam(null, quarter)).toBe('all');
    expect(meetingsParam([id(1)], quarter)).toBe(id(1));
    expect(meetingsParam(null, quarter.slice(0, 3))).toBe('');
  });

  it('says when only the latest are shown, and when the address names none of these meetings', () => {
    expect(showsLatest('', quarter)).toBe(true);
    expect(showsLatest('all', quarter)).toBe(false);
    expect(showsLatest(id(1), quarter)).toBe(false);
    expect(showsLatest('', quarter.slice(0, 3))).toBe(false);
    expect(isStale(id(9), quarter)).toBe(true);
    expect(isStale('junk', quarter)).toBe(true);
    expect(isStale(id(1), quarter)).toBe(false);
    expect(isStale('', quarter)).toBe(false);
    expect(isStale('all', quarter)).toBe(false);
  });
});
