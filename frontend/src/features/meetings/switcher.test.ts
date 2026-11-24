import { describe, expect, it } from 'vitest';
import { notesCount, scheduleOptionLabel } from './switcher';

const meeting = (date: string, status: 'scheduled' | 'cancelled' | 'done', noteCount = 0) => ({ id: date, date, status, noteCount });

describe('the "jump to" list of meetings', () => {
  it('names each meeting by its day, with today, cancelled or its notes', () => {
    const today = '2026-11-23';
    expect(scheduleOptionLabel(meeting('2026-10-08', 'done', 9), today)).toBe('Thu 8 Oct · 9 notes');
    expect(scheduleOptionLabel(meeting('2026-10-15', 'done', 1), today)).toBe('Thu 15 Oct · 1 note');
    expect(scheduleOptionLabel(meeting('2026-10-22', 'cancelled', 2), today)).toBe('Thu 22 Oct · cancelled');
    expect(scheduleOptionLabel(meeting('2026-11-23', 'scheduled'), today)).toBe('Mon 23 Nov · today');
    expect(scheduleOptionLabel(meeting('2026-11-26', 'scheduled'), today)).toBe('Thu 26 Nov');
    expect(scheduleOptionLabel(meeting('2027-01-07', 'scheduled'), today)).toBe('Thu 7 Jan 2027');
  });

  it('is in Indonesian when asked', () => {
    const today = '2026-11-23';
    expect(scheduleOptionLabel(meeting('2026-10-08', 'done', 9), today, 'id')).toBe('Kam, 8 Okt · 9 catatan');
    expect(scheduleOptionLabel(meeting('2026-10-15', 'done', 1), today, 'id')).toBe('Kam, 15 Okt · 1 catatan');
    expect(scheduleOptionLabel(meeting('2026-10-22', 'cancelled', 2), today, 'id')).toBe('Kam, 22 Okt · dibatalkan');
    expect(scheduleOptionLabel(meeting('2026-11-23', 'scheduled'), today, 'id')).toBe('Sen, 23 Nov · hari ini');
    expect(scheduleOptionLabel(meeting('2027-01-07', 'scheduled'), today, 'id')).toBe('Kam, 7 Jan 2027');
    expect(notesCount(1, 'en')).toBe('1 note');
    expect(notesCount(3, 'id')).toBe('3 catatan');
  });
});
