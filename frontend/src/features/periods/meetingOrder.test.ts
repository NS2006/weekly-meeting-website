import { describe, expect, it } from 'vitest';
import { arrangeMeetings, monthsOf, nextMeetings } from './meetingOrder';

const m = (id: string, date: string) => ({ id, date });
const quarter = [m('a', '2026-10-01'), m('b', '2026-10-08'), m('c', '2026-11-05'), m('d', '2026-11-05'), m('e', '2026-12-03')];

describe("the period's meetings by month", () => {
  it('lists the months that have meetings, with how many', () => {
    expect(monthsOf(quarter)).toEqual([
      { key: '2026-10', label: 'Oct', count: 2 },
      { key: '2026-11', label: 'Nov', count: 2 },
      { key: '2026-12', label: 'Dec', count: 1 },
    ]);
    // A year that starts in another month runs over two calendar years: the months say which.
    expect(monthsOf([m('x', '2027-01-07'), m('y', '2026-12-31')]).map((c) => c.label)).toEqual(['Dec 2026', 'Jan 2027']);
    expect(monthsOf([])).toEqual([]);
  });

  it('puts them oldest first, keeping same-day meetings in their order', () => {
    expect(arrangeMeetings(quarter, null).map((x) => x.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(arrangeMeetings([quarter[2]!, quarter[0]!], null).map((x) => x.id)).toEqual(['a', 'c']);
  });

  it('shows one month', () => {
    expect(arrangeMeetings(quarter, '2026-11').map((x) => x.id)).toEqual(['c', 'd']);
    expect(arrangeMeetings(quarter, '2026-10').map((x) => x.id)).toEqual(['a', 'b']);
    expect(arrangeMeetings(quarter, '2027-01')).toEqual([]);
  });
});

describe('the month labels in Indonesian', () => {
  it('names the months in the language asked for', () => {
    expect(monthsOf(quarter, 'id').map((c) => c.label)).toEqual(['Okt', 'Nov', 'Des']);
    expect(monthsOf([m('x', '2027-01-07'), m('y', '2026-12-31')], 'id').map((c) => c.label)).toEqual(['Des 2026', 'Jan 2027']);
    expect(monthsOf(quarter, 'en').map((c) => c.label)).toEqual(['Oct', 'Nov', 'Dec']);
  });
});

describe("the period page's next meeting", () => {
  const at = (id: string, date: string, status: 'scheduled' | 'cancelled' | 'done' = 'scheduled') => ({ id, date, status });
  const meetings = [
    at('past', '2026-11-19', 'done'),
    at('cancelled', '2026-11-26', 'cancelled'),
    at('sync', '2026-11-30'),
    at('weekly', '2026-11-30'),
    at('later', '2026-12-03'),
  ];
  const ids = (list: { id: string }[]) => list.map((m) => m.id);

  it('picks the soonest day from today, skipping cancelled ones, with every meeting of that day', () => {
    expect(ids(nextMeetings(meetings, '2026-11-25'))).toEqual(['sync', 'weekly']);
  });

  it("counts today's meeting as the next one", () => {
    expect(ids(nextMeetings(meetings, '2026-12-03'))).toEqual(['later']);
  });

  it('has none once the last meeting has passed', () => {
    expect(nextMeetings(meetings, '2026-12-04')).toEqual([]);
  });
});
