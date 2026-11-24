import { describe, expect, it } from 'vitest';
import type { PeriodProject } from '@weekly-meeting/shared';
import { boardColumns, filterProjects, highlightParts, ownersOf, parseGroup, parseSort, sortCards, timelineOf, type BoardMeeting } from './boardModel';

const meeting = (id: string, date: string, status: BoardMeeting['status'] = 'done'): BoardMeeting => ({
  id,
  date,
  title: null,
  seriesName: 'Weekly Update',
  status,
});
const project = (id: string, name: string, owner: [string, string], updateCount: number, lastSharedOn: string, meetingIds: string[]): PeriodProject => ({
  id,
  name,
  status: 'active',
  owner: { id: owner[0], name: owner[1] },
  updateCount,
  lastSharedOn,
  meetingIds,
});

const ana: [string, string] = ['u-ana', 'Ana Putri'];
const budi: [string, string] = ['u-budi', 'budi Santoso'];
const meetings = [meeting('m1', '2026-10-01'), meeting('m2', '2026-10-08'), meeting('m3', '2026-10-15', 'cancelled'), meeting('m4', '2026-10-22', 'scheduled')];
const projects = [
  project('p1', 'Reach Truck', ana, 2, '2026-10-08', ['m1', 'm2']),
  project('p2', 'Audit', budi, 1, '2026-10-01', ['m1']),
  project('p3', 'audit trail', ana, 3, '2026-10-08', ['m1', 'm2']),
  project('p4', 'Server Room', budi, 1, '2026-10-08', ['m2']),
];

describe('ownersOf', () => {
  it('lists each person once, A–Z ignoring case, with their number of projects', () => {
    expect(ownersOf(projects)).toEqual([
      { id: 'u-ana', name: 'Ana Putri', count: 2 },
      { id: 'u-budi', name: 'budi Santoso', count: 2 },
    ]);
  });
});

describe('filterProjects', () => {
  it('keeps names with every word typed, in any case and order', () => {
    expect(filterProjects(projects, 'AUDIT', null).map((p) => p.id)).toEqual(['p2', 'p3']);
    expect(filterProjects(projects, ' trail audit ', null).map((p) => p.id)).toEqual(['p3']);
    expect(filterProjects(projects, '', null)).toHaveLength(4);
  });

  it('keeps the people picked only (none picked: nothing)', () => {
    expect(filterProjects(projects, '', ['u-budi']).map((p) => p.id)).toEqual(['p2', 'p4']);
    expect(filterProjects(projects, 'audit', ['u-ana']).map((p) => p.id)).toEqual(['p3']);
    expect(filterProjects(projects, '', [])).toEqual([]);
  });
});

describe('sortCards', () => {
  it('sorts by latest meeting (then name), by name, or by most updates (then latest, then name)', () => {
    expect(sortCards(projects, 'latest').map((p) => p.id)).toEqual(['p3', 'p1', 'p4', 'p2']);
    expect(sortCards(projects, 'name').map((p) => p.id)).toEqual(['p2', 'p3', 'p1', 'p4']);
    expect(sortCards(projects, 'updates').map((p) => p.id)).toEqual(['p3', 'p1', 'p4', 'p2']);
  });
});

describe('boardColumns', () => {
  it('makes one column per person, A–Z, with their cards sorted', () => {
    const columns = boardColumns(projects, meetings, 'person', 'name');
    expect(columns.map((c) => [c.key, c.cards.map((p) => p.id)])).toEqual([
      ['person:u-ana', ['p3', 'p1']],
      ['person:u-budi', ['p2', 'p4']],
    ]);
    expect(columns[0]?.person).toEqual({ id: 'u-ana', name: 'Ana Putri' });
  });

  it('makes one column per meeting with something shared, latest first', () => {
    const columns = boardColumns(projects, meetings, 'meeting', 'latest');
    expect(columns.map((c) => [c.key, c.cards.map((p) => p.id)])).toEqual([
      ['meeting:m2', ['p3', 'p1', 'p4']],
      ['meeting:m1', ['p3', 'p1', 'p2']],
    ]);
    expect(boardColumns([], meetings, 'meeting', 'latest')).toEqual([]);
  });
});

describe('timelineOf', () => {
  it('has the meetings that took place and any with something shared, oldest first', () => {
    expect(timelineOf(meetings, projects, '2026-10-20').map((m) => m.id)).toEqual(['m1', 'm2']);
    // A cancelled meeting with a note on it still counts; one ahead does not yet.
    const shared = [project('p9', 'X', ana, 1, '2026-10-15', ['m3'])];
    expect(timelineOf(meetings, shared, '2026-10-20').map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
    expect(timelineOf(meetings, [], '2026-10-22').map((m) => m.id)).toEqual(['m1', 'm2', 'm4']);
  });
});

describe('highlightParts', () => {
  it('marks every part matching a word typed', () => {
    expect(highlightParts('Audit trail audit', 'AUD')).toEqual([
      { text: 'Aud', match: true },
      { text: 'it trail ', match: false },
      { text: 'aud', match: true },
      { text: 'it', match: false },
    ]);
    expect(highlightParts('Reach Truck', 'tru rea')).toEqual([
      { text: 'Rea', match: true },
      { text: 'ch ', match: false },
      { text: 'Tru', match: true },
      { text: 'ck', match: false },
    ]);
    expect(highlightParts('Reach Truck', '  ')).toEqual([{ text: 'Reach Truck', match: false }]);
  });
});

describe('address values', () => {
  it('reads the group and sort, falling back to the defaults', () => {
    expect([parseGroup('meeting'), parseGroup('person'), parseGroup('x'), parseGroup(null)]).toEqual(['meeting', 'person', 'person', 'person']);
    expect([parseSort('name'), parseSort('updates'), parseSort('size'), parseSort(null)]).toEqual(['name', 'updates', 'latest', 'latest']);
  });
});
