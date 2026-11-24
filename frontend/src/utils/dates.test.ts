import { describe, expect, it } from 'vitest';
import {
  addDays,
  dateParts,
  daysBetween,
  daysUntil,
  describeDays,
  formatDate,
  formatDateTime,
  formatDay,
  formatFullDay,
  formatLongDate,
  greeting,
  isoWeekday,
  nextDates,
  relativeDate,
  relativeDay,
  todayWib,
} from './dates';

describe('greeting()', () => {
  it('follows the hour in Indonesia (UTC+7), not the browser', () => {
    expect(greeting(new Date('2026-11-19T21:00:00.000Z'))).toBe('Good morning'); // 04:00 WIB
    expect(greeting(new Date('2026-11-20T04:59:00.000Z'))).toBe('Good morning'); // 11:59
    expect(greeting(new Date('2026-11-20T05:00:00.000Z'))).toBe('Good afternoon'); // 12:00
    expect(greeting(new Date('2026-11-20T11:00:00.000Z'))).toBe('Good evening'); // 18:00
    expect(greeting(new Date('2026-11-20T17:30:00.000Z'))).toBe('Good evening'); // 00:30 next day
  });
});

describe('formatLongDate()', () => {
  it('names the Indonesia day, which can be a day after UTC', () => {
    const text = formatLongDate(new Date('2026-11-20T17:30:00.000Z'));
    expect(text).toContain('Saturday');
    expect(text).toContain('21 November 2026');
  });
});

describe('formatDate()', () => {
  it('shows the Indonesia date', () => {
    expect(formatDate('2026-11-20T17:30:00.000Z')).toBe('21 Nov 2026');
  });
});

describe('daysUntil()', () => {
  const now = Date.parse('2026-11-20T00:00:00.000Z');
  it('rounds up partial days and never goes below zero', () => {
    expect(daysUntil('2026-12-20T00:00:00.000Z', now)).toBe(30);
    expect(daysUntil('2026-11-20T01:00:00.000Z', now)).toBe(1);
    expect(daysUntil('2026-11-19T00:00:00.000Z', now)).toBe(0);
  });
});

describe('formatDateTime()', () => {
  it('shows Indonesia time (UTC+7) whatever the browser time zone', () => {
    expect(formatDateTime('2026-11-20T17:30:00.000Z')).toBe('21 Nov 2026, 00:30');
  });
  it('uses the fallback for null or an invalid date', () => {
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime(null, 'Never')).toBe('Never');
    expect(formatDateTime('not a date')).toBe('—');
  });
});

describe('calendar dates for meetings', () => {
  it('takes today from Indonesia time', () => {
    expect(todayWib(new Date('2026-11-20T16:59:00Z'))).toBe('2026-11-20');
    expect(todayWib(new Date('2026-11-20T17:00:00Z'))).toBe('2026-11-21');
  });

  it('formats a day without the browser time zone shifting it', () => {
    expect(formatDay('2026-11-25')).toBe('Wed 25 Nov');
    expect(formatFullDay('2026-11-25')).toContain('Wednesday');
    expect(formatFullDay('2026-11-25')).toContain('25 November 2026');
    expect(dateParts('2026-12-01')).toEqual({ weekday: 'Tue', day: '1', month: 'Dec' });
  });

  it('counts days and weekdays across months', () => {
    expect(addDays('2026-11-30', 2)).toBe('2026-12-02');
    expect(daysBetween('2026-11-23', '2026-11-25')).toBe(2);
    expect(isoWeekday('2026-11-23')).toBe(1);
    expect(isoWeekday('2026-11-29')).toBe(7);
  });

  it('says how far a day is from today', () => {
    expect(relativeDay('2026-11-23', '2026-11-23')).toBe('Today');
    expect(relativeDay('2026-11-24', '2026-11-23')).toBe('Tomorrow');
    expect(relativeDay('2026-11-27', '2026-11-23')).toBe('In 4 days');
    expect(relativeDay('2026-11-22', '2026-11-23')).toBe('Yesterday');
    expect(relativeDay('2026-11-18', '2026-11-23')).toBe('5 days ago');
  });

  it('describes a schedule in words', () => {
    expect(describeDays([5, 3])).toBe('Every Wednesday and Friday');
    expect(describeDays([1, 3, 5], 'short')).toBe('Every Mon, Wed and Fri');
    expect(describeDays([1, 2, 3, 4, 5])).toBe('Every weekday');
    expect(describeDays([1, 2, 3, 4, 5, 6, 7])).toBe('Every day');
    expect(describeDays([2])).toBe('Every Tuesday');
  });

  it('lists the next meeting dates from today, today included', () => {
    expect(nextDates([3, 5], '2026-11-23', 3)).toEqual(['2026-11-25', '2026-11-27', '2026-12-02']);
    expect(nextDates([1], '2026-11-23', 2)).toEqual(['2026-11-23', '2026-11-30']);
    expect(nextDates([], '2026-11-23', 2)).toEqual([]);
  });
});

describe('relativeDate()', () => {
  const now = new Date('2026-11-20T09:00:00Z'); // Friday 20 Nov, 16:00 in Jakarta
  it('counts Indonesia calendar days, then shows the date', () => {
    expect(relativeDate('2026-11-19T18:00:00Z', now)).toBe('today'); // 01:00 on 20 Nov in Jakarta
    expect(relativeDate('2026-11-19T16:00:00Z', now)).toBe('yesterday'); // 23:00 on 19 Nov in Jakarta
    expect(relativeDate('2026-11-17T09:00:00Z', now)).toBe('3 days ago');
    expect(relativeDate('2026-10-01T09:00:00Z', now)).toBe('on 1 Oct 2026');
  });
});
