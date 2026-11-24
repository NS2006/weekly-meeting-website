import { describe, expect, it } from 'vitest';
import { arrangeMeetings, monthsOf } from './meetingOrder';

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
