import {
  nextPeriod,
  parsePeriodKey,
  periodAt,
  periodOf,
  periodProgress,
  periodsFrom,
  periodStatus,
  previousPeriod,
} from '../src/modules/meetings/periods.ts';

// A team's year split into periods (quarters by default): pure date math, no database.
const quarters = { periodsPerYear: 4, yearStartMonth: 1 } as const;

describe('periods of a team year', () => {
  it('puts a day in its calendar quarter', () => {
    expect(periodOf('2026-11-23', quarters)).toEqual({ key: '2026-10-3m', label: 'Q4 2026', start: '2026-10-01', end: '2026-12-31', year: 2026, index: 4 });
    expect(periodOf('2026-01-01', quarters).label).toBe('Q1 2026');
    expect(periodOf('2026-03-31', quarters).label).toBe('Q1 2026');
    expect(periodOf('2026-04-01', quarters)).toMatchObject({ label: 'Q2 2026', start: '2026-04-01', end: '2026-06-30' });
  });

  it('follows a year that starts in another month, named by both years', () => {
    const fromApril = { periodsPerYear: 4, yearStartMonth: 4 } as const;
    expect(periodOf('2026-02-10', fromApril)).toMatchObject({ key: '2026-01-3m', label: 'Q4 2025/26', start: '2026-01-01', end: '2026-03-31' });
    expect(periodOf('2026-04-01', fromApril)).toMatchObject({ key: '2026-04-3m', label: 'Q1 2026/27', start: '2026-04-01', end: '2026-06-30' });
    expect(periodOf('2026-07-15', { periodsPerYear: 1, yearStartMonth: 7 })).toMatchObject({ label: 'FY 2026/27', start: '2026-07-01', end: '2027-06-30' });
  });

  it('names halves, months, the whole year and other splits', () => {
    expect(periodOf('2026-08-01', { periodsPerYear: 2, yearStartMonth: 1 })).toMatchObject({ label: 'H2 2026', start: '2026-07-01', end: '2026-12-31' });
    expect(periodOf('2028-02-14', { periodsPerYear: 12, yearStartMonth: 1 })).toMatchObject({ label: 'Feb 2028', start: '2028-02-01', end: '2028-02-29' });
    expect(periodOf('2026-11-23', { periodsPerYear: 1, yearStartMonth: 1 })).toMatchObject({ label: '2026', start: '2026-01-01', end: '2026-12-31' });
    expect(periodOf('2026-05-20', { periodsPerYear: 3, yearStartMonth: 1 })).toMatchObject({ label: 'P2 2026', start: '2026-05-01', end: '2026-08-31' });
    expect(periodOf('2026-12-01', { periodsPerYear: 6, yearStartMonth: 1 })).toMatchObject({ label: 'P6 2026', start: '2026-11-01', end: '2026-12-31' });
  });

  it('goes to the next and previous period across years, and lists a range', () => {
    const q4 = periodAt(2026, 4, quarters);
    expect(nextPeriod(q4, quarters).key).toBe('2027-01-3m');
    expect(previousPeriod(periodAt(2027, 1, quarters), quarters).key).toBe('2026-10-3m');
    expect(periodsFrom(periodAt(2026, 3, quarters), periodAt(2027, 1, quarters), quarters).map((p) => p.label)).toEqual(['Q3 2026', 'Q4 2026', 'Q1 2027']);
    expect(periodsFrom(q4, periodAt(2026, 3, quarters), quarters)).toEqual([]);
  });

  it('reads a key only when a period of the split covers exactly its months', () => {
    expect(parsePeriodKey('2026-10-3m', quarters)?.label).toBe('Q4 2026');
    expect(parsePeriodKey('2026-12-1m', { periodsPerYear: 12, yearStartMonth: 1 })?.label).toBe('Dec 2026');
    // After a new split an old key finds the same months, named the new way, or nothing; never other months.
    expect(parsePeriodKey('2026-10-3m', { periodsPerYear: 4, yearStartMonth: 4 })?.label).toBe('Q3 2026/27');
    expect(parsePeriodKey('2026-10-3m', { periodsPerYear: 12, yearStartMonth: 1 })).toBeNull();
    expect(parsePeriodKey('2026-10-3m', { periodsPerYear: 2, yearStartMonth: 1 })).toBeNull();
    expect(parsePeriodKey('2026-11-3m', quarters)).toBeNull(); // a quarter never starts in November
    expect(parsePeriodKey('2026-13-3m', quarters)).toBeNull();
    expect(parsePeriodKey('2026-4', quarters)).toBeNull();
    expect(parsePeriodKey('26-10-3m', quarters)).toBeNull();
    expect(parsePeriodKey('2026-10-3m; drop', quarters)).toBeNull();
  });

  it('knows whether a period ended, is running or is still to come, and how far in it is', () => {
    const q4 = periodAt(2026, 4, quarters);
    expect(periodStatus(q4, '2026-11-23')).toBe('current');
    expect(periodStatus(q4, '2027-01-01')).toBe('ended');
    expect(periodStatus(q4, '2026-09-30')).toBe('upcoming');
    expect(periodProgress(q4, '2026-11-23')).toEqual({ days: 92, daysPassed: 54 });
    expect(periodProgress(q4, '2026-10-01')).toEqual({ days: 92, daysPassed: 1 });
    expect(periodProgress(q4, '2026-09-01').daysPassed).toBe(0);
    expect(periodProgress(q4, '2027-02-01').daysPassed).toBe(92);
  });
});
