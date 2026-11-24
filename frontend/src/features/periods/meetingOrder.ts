import type { MeetingView } from '@weekly-meeting/shared';
import { currentLanguage, localeOf, type Language } from '../../i18n/language';

/**
 * The period page's meetings by month (owner, 2026-11-24): all months or one, oldest first. In the address as
 * `?month=YYYY-MM` (absent: every month).
 */
export interface MonthChoice {
  /** YYYY-MM */
  key: string;
  /** "Oct", or "Dec 2026" when the meetings run over two years (in the interface language: "Okt", "Des 2026"). */
  label: string;
  count: number;
}

const formats = new Map<Language, Intl.DateTimeFormat>();
function monthName(key: string, language: Language): string {
  let format = formats.get(language);
  if (!format) {
    format = new Intl.DateTimeFormat(localeOf(language), { month: 'short', timeZone: 'UTC' });
    formats.set(language, format);
  }
  return format.format(new Date(`${key}-01T00:00:00Z`));
}

/** The months that have meetings, first to last, with how many each. */
export function monthsOf(meetings: readonly Pick<MeetingView, 'date'>[], language: Language = currentLanguage()): MonthChoice[] {
  const counts = new Map<string, number>();
  for (const m of meetings) counts.set(m.date.slice(0, 7), (counts.get(m.date.slice(0, 7)) ?? 0) + 1);
  const keys = [...counts.keys()].sort();
  const years = new Set(keys.map((k) => k.slice(0, 4)));
  return keys.map((key) => ({
    key,
    label: years.size > 1 ? `${monthName(key, language)} ${key.slice(0, 4)}` : monthName(key, language),
    count: counts.get(key) ?? 0,
  }));
}

/** The meetings to list: one month's or all, first to last (same-day meetings keep their order). */
export function arrangeMeetings<T extends Pick<MeetingView, 'date'>>(meetings: readonly T[], month: string | null): T[] {
  const picked = month === null ? [...meetings] : meetings.filter((m) => m.date.startsWith(`${month}-`));
  return picked
    .map((m, i) => ({ m, i }))
    .sort((a, b) => a.m.date.localeCompare(b.m.date) || a.i - b.i)
    .map(({ m }) => m);
}
