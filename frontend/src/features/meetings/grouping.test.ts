import { describe, expect, it } from 'vitest';
import type { MeetingView } from '@weekly-meeting/shared';
import { groupByMonth } from './grouping';

const meeting = (id: string, date: string): MeetingView => ({
  id,
  seriesId: '1',
  seriesName: 'Weekly sync',
  teamId: '1',
  teamName: 'Squad',
  date,
  scheduledDate: date,
  title: null,
  status: 'scheduled',
  noteCount: 0,
  coversFrom: date,
  memberCount: 0,
  withoutNote: [],
});

describe('groupByMonth()', () => {
  it('groups newest-first meetings by month', () => {
    const groups = groupByMonth([meeting('a', '2026-12-02'), meeting('b', '2026-11-27'), meeting('c', '2026-11-25')]);
    expect(groups.map((g) => [g.label, g.meetings.length])).toEqual([
      ['December 2026', 1],
      ['November 2026', 2],
    ]);
  });

  it('names the months in Indonesian when asked', () => {
    const groups = groupByMonth([meeting('a', '2026-12-02'), meeting('b', '2026-11-27')], 'id');
    expect(groups.map((g) => g.label)).toEqual(['Desember 2026', 'November 2026']);
  });
});
