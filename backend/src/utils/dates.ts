// Calendar dates as 'YYYY-MM-DD' strings. The whole tool runs on Indonesia time (UTC+7, no daylight saving),
// whatever time zone the server is in.

const JAKARTA = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Today's date in Indonesia, e.g. '2026-11-20' (it is already the 21st there from 17:00 UTC). */
export function todayInJakarta(now: Date = new Date()): string {
  const part = (type: string) => JAKARTA.formatToParts(now).find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** The calendar date `days` after (or before, when negative) `date`. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** True for a real calendar date in 'YYYY-MM-DD' form (rejects 2026-02-30). */
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
