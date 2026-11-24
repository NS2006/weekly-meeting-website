import { describe, expect, it } from 'vitest';
import {
  dayRange,
  describeSplit,
  labelParts,
  monthName,
  monthRange,
  periodFacts,
  periodNoun,
  progressOf,
  recentPeriods,
  splitChoices,
  yearPreview,
} from './split';

const quarters = { periodsPerYear: 4, yearStartMonth: 1 } as const;

describe('period words', () => {
  it('describes the split', () => {
    expect(describeSplit(quarters)).toBe('4 quarters a year, from January');
    expect(describeSplit({ periodsPerYear: 1, yearStartMonth: 4 })).toBe('One for the whole year, from April');
    expect(describeSplit({ periodsPerYear: 6, yearStartMonth: 1 })).toBe('6 parts a year (2 months each), from January');
    expect(describeSplit({ periodsPerYear: 2, yearStartMonth: 7 })).toBe('2 halves a year, from July');
  });

  it('names the months a period covers', () => {
    expect(monthRange('2026-10-01', '2026-12-31')).toBe('Oct – Dec 2026');
    expect(monthRange('2026-11-01', '2026-11-30')).toBe('Nov 2026');
    expect(monthRange('2026-04-01', '2027-03-31')).toBe('Apr 2026 – Mar 2027');
    expect(dayRange('2026-10-01', '2026-12-31')).toBe('1 Oct – 31 Dec 2026');
    expect(dayRange('2026-04-01', '2027-03-31')).toBe('1 Apr 2026 – 31 Mar 2027');
  });

  it('counts meetings and notes, and how far the current period is', () => {
    expect(periodFacts({ meetingCount: 13, cancelledCount: 0, noteCount: 52, status: 'current' })).toBe('13 meetings · 52 notes');
    expect(periodFacts({ meetingCount: 12, cancelledCount: 1, noteCount: 40, status: 'current' })).toBe('12 meetings · 1 cancelled · 40 notes');
    expect(periodFacts({ meetingCount: 1, cancelledCount: 0, noteCount: 1, status: 'ended' })).toBe('1 meeting · 1 note');
    expect(periodFacts({ meetingCount: 0, cancelledCount: 0, noteCount: 0, status: 'upcoming' })).toBe('No meetings yet');
    expect(periodFacts({ meetingCount: 0, cancelledCount: 2, noteCount: 0, status: 'ended' })).toBe('No meetings · 2 cancelled');
    expect(progressOf({ days: 92, daysPassed: 54 })).toEqual({ percent: 59, text: 'Day 54 of 92 · 38 days left' });
    expect(progressOf({ days: 92, daysPassed: 92 }).text).toBe('Day 92 of 92 · last day');
  });

  it('splits a label for the tile', () => {
    expect(labelParts('Q4 2026')).toEqual({ main: 'Q4', year: '2026' });
    expect(labelParts('FY 2026/27')).toEqual({ main: 'FY', year: '2026/27' });
    expect(labelParts('2026')).toEqual({ main: '2026', year: null });
  });
});

describe('which periods the team page shows first', () => {
  const list = (statuses: string[]) => statuses.map((status, i) => ({ status: status as 'ended' | 'current' | 'upcoming', i }));

  it('shows all of a few', () => {
    expect(recentPeriods(list(['ended', 'current', 'upcoming']))).toEqual({ shown: list(['ended', 'current', 'upcoming']), hidden: 0 });
  });

  it('shows two before the current one, the current one and the next', () => {
    const { shown, hidden } = recentPeriods(list(['ended', 'ended', 'ended', 'ended', 'current', 'upcoming']));
    expect(shown.map((p) => p.i)).toEqual([2, 3, 4, 5]);
    expect(hidden).toBe(2);
  });

  it('fills up with older ones when later ones are missing', () => {
    expect(recentPeriods(list(['ended', 'ended', 'ended', 'ended', 'current'])).shown.map((p) => p.i)).toEqual([1, 2, 3, 4]);
  });
});

describe('the year preview (same results as the server)', () => {
  it('shows the calendar quarters, the current one marked', () => {
    expect(yearPreview(quarters, '2026-11-23')).toEqual([
      { key: '2026-01-3m', label: 'Q1 2026', months: 'Jan – Mar 2026', current: false },
      { key: '2026-04-3m', label: 'Q2 2026', months: 'Apr – Jun 2026', current: false },
      { key: '2026-07-3m', label: 'Q3 2026', months: 'Jul – Sep 2026', current: false },
      { key: '2026-10-3m', label: 'Q4 2026', months: 'Oct – Dec 2026', current: true },
    ]);
  });

  it('follows a year from April, named by both years', () => {
    const preview = yearPreview({ periodsPerYear: 4, yearStartMonth: 4 }, '2026-02-10');
    expect(preview[0]).toMatchObject({ key: '2025-04-3m', label: 'Q1 2025/26', months: 'Apr – Jun 2025' });
    expect(preview[3]).toMatchObject({ key: '2026-01-3m', label: 'Q4 2025/26', months: 'Jan – Mar 2026', current: true });
    expect(yearPreview({ periodsPerYear: 1, yearStartMonth: 7 }, '2026-07-15')).toEqual([
      { key: '2026-07-12m', label: 'FY 2026/27', months: 'Jul 2026 – Jun 2027', current: true },
    ]);
  });

  it('names halves, months and other splits', () => {
    expect(yearPreview({ periodsPerYear: 2, yearStartMonth: 1 }, '2026-08-01')[1]).toMatchObject({ label: 'H2 2026', current: true });
    expect(yearPreview({ periodsPerYear: 12, yearStartMonth: 1 }, '2028-02-14')[1]).toMatchObject({ label: 'Feb 2028', months: 'Feb 2028', current: true });
    expect(yearPreview({ periodsPerYear: 3, yearStartMonth: 1 }, '2026-05-20')[1]).toMatchObject({ label: 'P2 2026', months: 'May – Aug 2026' });
    expect(yearPreview({ periodsPerYear: 6, yearStartMonth: 1 }, '2026-12-01')[5]).toMatchObject({ label: 'P6 2026', current: true });
  });
});

describe('in Indonesian (the screen; downloads stay English)', () => {
  it('names the split, the months and the period', () => {
    expect(periodNoun(4, false, 'id')).toBe('kuartal');
    expect(periodNoun(2, true, 'id')).toBe('semester');
    expect(describeSplit(quarters, 'id')).toBe('4 kuartal setahun, mulai Januari');
    expect(describeSplit({ periodsPerYear: 1, yearStartMonth: 4 }, 'id')).toBe('Satu untuk setahun penuh, mulai April');
    expect(describeSplit({ periodsPerYear: 6, yearStartMonth: 8 }, 'id')).toBe('6 bagian setahun (masing-masing 2 bulan), mulai Agustus');
    expect(monthRange('2026-10-01', '2026-12-31', 'id')).toBe('Okt – Des 2026');
    expect(dayRange('2026-04-01', '2027-03-31', 'id')).toBe('1 Apr 2026 – 31 Mar 2027');
    expect(dayRange('2026-08-01', '2026-12-31', 'id')).toBe('1 Agu – 31 Des 2026');
    expect(monthName(5, 'long', 'id')).toBe('Mei');
    expect(monthName(9, 'short', 'en')).toBe('Sep');
  });

  it('counts meetings and notes, and how far the current period is', () => {
    expect(periodFacts({ meetingCount: 12, cancelledCount: 1, noteCount: 40, status: 'current' }, 'id')).toBe('12 rapat · 1 dibatalkan · 40 catatan');
    expect(periodFacts({ meetingCount: 0, cancelledCount: 0, noteCount: 0, status: 'upcoming' }, 'id')).toBe('Belum ada rapat');
    expect(progressOf({ days: 92, daysPassed: 54 }, 'id').text).toBe('Hari ke-54 dari 92 · sisa 38 hari');
    expect(progressOf({ days: 92, daysPassed: 92 }, 'id').text).toBe('Hari ke-92 dari 92 · hari terakhir');
  });

  it('words the choices, and previews the year with the server labels and Indonesian months', () => {
    expect(splitChoices('id').map((c) => c.title)).toEqual(['Setahun penuh', '2 semester', '3 bagian', '4 kuartal', '6 bagian', '12 bulan']);
    expect(splitChoices('en')[3]).toEqual({ value: 4, title: '4 quarters', detail: '3 months each' });
    expect(yearPreview(quarters, '2026-11-23', 'id')[3]).toEqual({ key: '2026-10-3m', label: 'Q4 2026', months: 'Okt – Des 2026', current: true });
    expect(yearPreview({ periodsPerYear: 12, yearStartMonth: 1 }, '2026-08-14', 'id')[7]).toMatchObject({ label: 'Aug 2026', months: 'Agu 2026' });
  });
});
