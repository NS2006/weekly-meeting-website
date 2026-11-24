import { currentLanguage, localeOf, type Language } from '../i18n/language';
import { fill, messages } from '../i18n/messages';

// Dates are written in the interface language (owner, 2026-11-24): "Thu 19 Nov" or "Kam, 19 Nov". Every helper takes
// an optional language; downloads pass 'en', since downloaded files are always in English.

const formatters = new Map<string, Intl.DateTimeFormat>();
/** One formatter per language and style, made on first use. */
function formatter(language: Language, name: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${language}:${name}`;
  let made = formatters.get(key);
  if (!made) {
    made = new Intl.DateTimeFormat(localeOf(language), options);
    formatters.set(key, made);
  }
  return made;
}

/** "20 Nov 2026, 14:05" in Indonesia time (UTC+7), whatever the browser's time zone; `fallback` for null. */
export function formatDateTime(iso: string | null, fallback = '—', language: Language = currentLanguage()): string {
  if (!iso) return fallback;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return fallback;
  return formatter(language, 'wib', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(date);
}

/** "20 Nov 2026" in Indonesia time; `fallback` for null. */
export function formatDate(iso: string | null, fallback = '—', language: Language = currentLanguage()): string {
  if (!iso) return fallback;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return fallback;
  return formatter(language, 'wibDate', { dateStyle: 'medium', timeZone: 'Asia/Jakarta' }).format(date);
}

const WIB_HOUR = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Jakarta' });

/**
 * By the hour in Indonesia: "Good morning" (04–11), "Good afternoon" (12–17) or "Good evening"; in Indonesian
 * "Selamat pagi" (04–11), "siang" (12–14), "sore" (15–17) or "malam".
 */
export function greeting(now: Date = new Date(), language: Language = currentLanguage()): string {
  const hour = Number(WIB_HOUR.format(now));
  const words = messages(language).dates;
  if (hour >= 4 && hour < 12) return words.morning;
  if (hour >= 12 && hour < 15) return words.midday;
  if (hour >= 15 && hour < 18) return words.afternoon;
  return words.evening;
}

/** "Friday 20 November 2026" (or "Jumat, 20 November 2026"): today's date in Indonesia. */
export function formatLongDate(now: Date = new Date(), language: Language = currentLanguage()): string {
  return formatter(language, 'wibLong', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).format(now);
}

/** Whole days from `now` until `iso`, rounded up, never below 0 ("3 days left"). */
export function daysUntil(iso: string, now: number = Date.now()): number {
  return Math.max(0, Math.ceil((Date.parse(iso) - now) / 86_400_000));
}

// ---------------------------------------------------------------------------------------------------------------------
// Calendar dates ('YYYY-MM-DD', as the API sends meeting dates). They are days, not instants: they are formatted in
// UTC so the browser's own time zone never shifts them.

const WIB_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const asDay = (date: string) => new Date(`${date}T00:00:00Z`);

/** Today in Indonesia as 'YYYY-MM-DD' (the date the server uses for meetings). */
export function todayWib(now: Date = new Date()): string {
  const parts = WIB_PARTS.formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function addDays(date: string, days: number): string {
  const d = asDay(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((asDay(to).getTime() - asDay(from).getTime()) / 86_400_000);
}

/** ISO day of the week: Monday = 1 … Sunday = 7. */
export function isoWeekday(date: string): number {
  const day = asDay(date).getUTCDay();
  return day === 0 ? 7 : day;
}

/** "Wed 25 Nov" */
export const formatDay = (date: string, language: Language = currentLanguage()) =>
  formatter(language, 'dayShort', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(asDay(date));
/** "Wednesday 25 November 2026" */
export const formatFullDay = (date: string, language: Language = currentLanguage()) =>
  formatter(language, 'dayFull', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    asDay(date),
  );

/** For a calendar tile: { weekday: 'Wed', day: '25', month: 'Nov' }. */
export function dateParts(date: string, language: Language = currentLanguage()): { weekday: string; day: string; month: string } {
  const d = asDay(date);
  return {
    weekday: formatter(language, 'weekdayShort', { weekday: 'short', timeZone: 'UTC' }).format(d),
    day: String(d.getUTCDate()),
    month: formatter(language, 'monthShort', { month: 'short', timeZone: 'UTC' }).format(d),
  };
}

/** "Today", "Tomorrow", "In 3 days", "Yesterday", "5 days ago". */
export function relativeDay(date: string, today: string, language: Language = currentLanguage()): string {
  const n = daysBetween(today, date);
  const words = messages(language).dates;
  if (n === 0) return words.today;
  if (n === 1) return words.tomorrow;
  if (n === -1) return words.yesterday;
  return n > 0 ? fill(words.inDays, { count: n }) : fill(words.daysAgo, { count: -n });
}

export const WEEKDAYS = [
  { day: 1, short: 'Mon', long: 'Monday' },
  { day: 2, short: 'Tue', long: 'Tuesday' },
  { day: 3, short: 'Wed', long: 'Wednesday' },
  { day: 4, short: 'Thu', long: 'Thursday' },
  { day: 5, short: 'Fri', long: 'Friday' },
  { day: 6, short: 'Sat', long: 'Saturday' },
  { day: 7, short: 'Sun', long: 'Sunday' },
] as const;

/** "a", "a and b", "a, b and c" (in Indonesian "a, b, dan c"). */
function joinAnd(items: string[], language: Language): string {
  return new Intl.ListFormat(localeOf(language), { style: 'long', type: 'conjunction' }).format(items);
}

/** A weekday's name (1 = Monday): "Wednesday" / "Wed", or "Rabu" / "Rab". */
export function weekdayName(day: number, style: 'long' | 'short' = 'long', language: Language = currentLanguage()): string {
  // 1 January 2024 was a Monday.
  return formatter(language, `weekday-${style}`, { weekday: style, timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, day)));
}

/** "Every Wednesday and Friday", "Every weekday", "Every day"; `short` gives "Every Wed and Fri". */
export function describeDays(days: readonly number[], style: 'long' | 'short' = 'long', language: Language = currentLanguage()): string {
  const words = messages(language).dates;
  const sorted = [...new Set(days)].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
  if (sorted.length === 0) return words.noDays;
  if (sorted.length === 7) return words.everyDay;
  if (sorted.join() === '1,2,3,4,5') return words.everyWeekday;
  return fill(words.every, { days: joinAnd(sorted.map((d) => weekdayName(d, style, language)), language) });
}

/** The first `count` dates from `today` (included) that fall on these weekdays. */
export function nextDates(days: readonly number[], today: string, count: number): string[] {
  const wanted = new Set(days);
  const dates: string[] = [];
  if (wanted.size === 0) return dates;
  for (let i = 0; dates.length < count && i < 7 * count; i += 1) {
    const date = addDays(today, i);
    if (wanted.has(isoWeekday(date))) dates.push(date);
  }
  return dates;
}

/**
 * How long ago an instant was, by Indonesia calendar days: "today", "yesterday", "3 days ago", and from 30 days on
 * the date itself: "on 20 Nov 2026".
 */
export function relativeDate(iso: string, now: Date = new Date(), language: Language = currentLanguage()): string {
  const words = messages(language).dates;
  const days = daysBetween(todayWib(new Date(iso)), todayWib(now));
  if (days <= 0) return words.agoToday;
  if (days === 1) return words.agoYesterday;
  if (days < 30) return fill(words.agoDays, { count: days });
  return fill(words.agoOn, { date: formatDate(iso, '—', language) });
}
