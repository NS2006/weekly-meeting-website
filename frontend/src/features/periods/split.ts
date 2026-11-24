import type { PeriodsPerYear, PeriodSummary, YearSplit } from '@weekly-meeting/shared';
import { currentLanguage, localeOf, type Language } from '../../i18n/language';
import { fill, messages } from '../../i18n/messages';

/**
 * Words and small sums for a team's year split into periods (quarters by default). The server decides which periods
 * exist and what is in them (backend meetings/periods.ts); the one sum done here is the settings dialog's preview of
 * the year, which follows the same rules (the tests check the same examples as the server's). The words are in the
 * interface language (each helper takes an optional language); period labels ("Q4 2026", "Aug 2026") stay as the
 * server writes them.
 */

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;
/** The server's month abbreviations (its labels of monthly periods), and the English ones on screen. */
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const monthFormats = new Map<string, Intl.DateTimeFormat>();

/** A month's name (1 = January): "October" / "Oct", or "Oktober" / "Okt". */
export function monthName(month: number, style: 'long' | 'short' = 'long', language: Language = currentLanguage()): string {
  // English keeps the names it always had (Intl's en-GB writes September "Sept", the server "Sep").
  if (language === 'en') return (style === 'long' ? MONTH_NAMES : MONTH_SHORT)[month - 1] ?? '';
  if (month < 1 || month > 12) return '';
  const key = `${language}:${style}`;
  let format = monthFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(localeOf(language), { month: style, timeZone: 'UTC' });
    monthFormats.set(key, format);
  }
  return format.format(new Date(Date.UTC(2024, month - 1, 1)));
}

/** Where each choice's words are in the language lists. */
const SPLIT_KEYS = { 1: 'whole', 2: 'halves', 3: 'thirds', 4: 'quarters', 6: 'sixths', 12: 'months' } as const;
const SPLIT_ORDER: readonly PeriodsPerYear[] = [1, 2, 3, 4, 6, 12];

/** The choices, shortest periods last; 4 quarters is the default. */
export function splitChoices(language: Language = currentLanguage()): { value: PeriodsPerYear; title: string; detail: string }[] {
  const words = messages(language).periods.splits;
  return SPLIT_ORDER.map((value) => ({ value, ...words[SPLIT_KEYS[value]] }));
}

const NOUNS = {
  1: ['year', 'years'],
  2: ['half', 'halves'],
  3: ['period', 'periods'],
  4: ['quarter', 'quarters'],
  6: ['period', 'periods'],
  12: ['month', 'months'],
} as const;

/** "quarter" / "quarters" (or half, month, year, period), for the team's split. */
export function periodNoun(perYear: PeriodsPerYear, plural = false, language: Language = currentLanguage()): string {
  return messages(language).periods.nouns[NOUNS[perYear][plural ? 1 : 0]];
}

export const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** "4 quarters a year, from January" */
export function describeSplit(split: YearSplit, language: Language = currentLanguage()): string {
  const words = messages(language).periods.describe;
  const from = monthName(split.yearStartMonth, 'long', language) || monthName(1, 'long', language);
  const what =
    split.periodsPerYear === 1
      ? words.wholeYear
      : split.periodsPerYear === 3 || split.periodsPerYear === 6
        ? fill(words.parts, { count: split.periodsPerYear, months: 12 / split.periodsPerYear })
        : fill(words.perYear, { count: split.periodsPerYear, nouns: periodNoun(split.periodsPerYear, true, language) });
  return fill(words.from, { what, month: from });
}

const monthOf = (date: string) => ({ year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) });

/** The months a period covers: "Oct – Dec 2026", "Nov 2026", "Apr 2026 – Mar 2027". */
export function monthRange(start: string, end: string, language: Language = currentLanguage()): string {
  const a = monthOf(start);
  const b = monthOf(end);
  const name = (m: number) => monthName(m, 'short', language);
  if (a.year === b.year && a.month === b.month) return `${name(a.month)} ${a.year}`;
  if (a.year === b.year) return `${name(a.month)} – ${name(b.month)} ${b.year}`;
  return `${name(a.month)} ${a.year} – ${name(b.month)} ${b.year}`;
}

/** Its first and last day: "1 Oct – 31 Dec 2026", "1 Apr 2026 – 31 Mar 2027". */
export function dayRange(start: string, end: string, language: Language = currentLanguage()): string {
  const day = (date: string, withYear: boolean) =>
    `${Number(date.slice(8, 10))} ${monthName(Number(date.slice(5, 7)), 'short', language)}${withYear ? ` ${date.slice(0, 4)}` : ''}`;
  return start.slice(0, 4) === end.slice(0, 4) ? `${day(start, false)} – ${day(end, true)}` : `${day(start, true)} – ${day(end, true)}`;
}

/** The address of a team's period page. */
export const periodPath = (teamId: string, key: string) => `/teams/${encodeURIComponent(teamId)}/periods/${encodeURIComponent(key)}`;

/**
 * "13 meetings · 52 notes", with "· 1 cancelled" when some were (so it adds up with the period's list of meetings);
 * "No meetings yet" (still to come) or "No meetings".
 */
export function periodFacts(
  period: Pick<PeriodSummary, 'meetingCount' | 'cancelledCount' | 'noteCount' | 'status'>,
  language: Language = currentLanguage(),
): string {
  const words = messages(language).periods.facts;
  const cancelled = period.cancelledCount > 0 ? fill(words.cancelled, { count: period.cancelledCount }) : null;
  if (period.meetingCount === 0) {
    const none = period.status === 'ended' ? words.none : words.noneYet;
    return cancelled ? `${none} · ${cancelled}` : none;
  }
  const meetings = fill(period.meetingCount === 1 ? words.meetings_one : words.meetings_other, { count: period.meetingCount });
  const notes = fill(period.noteCount === 1 ? words.notes_one : words.notes_other, { count: period.noteCount });
  return [meetings, cancelled, notes].filter(Boolean).join(' · ');
}

/** How far into the current period today is: "Day 54 of 92 · 39 days left" and the share done (0–100). */
export function progressOf(
  period: Pick<PeriodSummary, 'days' | 'daysPassed'>,
  language: Language = currentLanguage(),
): { percent: number; text: string } {
  const words = messages(language).periods.progress;
  const left = period.days - period.daysPassed;
  const rest = left === 0 ? words.lastDay : fill(left === 1 ? words.daysLeft_one : words.daysLeft_other, { count: left });
  return {
    percent: period.days > 0 ? Math.round((period.daysPassed / period.days) * 100) : 0,
    text: fill(words.text, { passed: period.daysPassed, days: period.days, rest }),
  };
}

/**
 * The periods the team page shows before "Show all": up to four, ending one after the current period (two before it,
 * the current one and the next), oldest first. Teams with few periods see them all.
 */
export function recentPeriods<T extends Pick<PeriodSummary, 'status'>>(periods: readonly T[], count = 4): { shown: T[]; hidden: number } {
  if (periods.length <= count) return { shown: [...periods], hidden: 0 };
  const current = periods.findIndex((p) => p.status === 'current');
  const end = current < 0 ? periods.length : Math.min(periods.length, current + 2);
  const start = Math.max(0, end - count);
  return { shown: periods.slice(start, start + count), hidden: periods.length - count };
}

/** "Q4" and "2026" for a period's tile; a label that is only a year ("2026") has no second part. */
export function labelParts(label: string): { main: string; year: string | null } {
  const [main = label, ...rest] = label.split(' ');
  return rest.length > 0 ? { main, year: rest.join(' ') } : { main, year: null };
}

// ---------------------------------------------------------------------------------------------------------------------
// The preview in the settings dialog: the periods of the team year that today falls in, under a split not saved yet.

function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

function previewLabel(year: number, index: number, split: YearSplit, first: { year: number; month: number }): string {
  const name = split.yearStartMonth === 1 ? String(year) : `${year}/${String((year + 1) % 100).padStart(2, '0')}`;
  switch (split.periodsPerYear) {
    case 1:
      return split.yearStartMonth === 1 ? name : `FY ${name}`;
    case 2:
      return `H${index} ${name}`;
    case 4:
      return `Q${index} ${name}`;
    case 12:
      return `${MONTH_SHORT[first.month - 1]} ${first.year}`;
    default:
      return `P${index} ${name}`;
  }
}

export interface PreviewPeriod {
  key: string;
  label: string;
  months: string;
  current: boolean;
}

/** This year's periods: their labels as the server writes them (English abbreviations), their months in `language`. */
export function yearPreview(split: YearSplit, today: string, language: Language = currentLanguage()): PreviewPeriod[] {
  const { year: y, month: m } = monthOf(today);
  const year = m >= split.yearStartMonth ? y : y - 1;
  const length = 12 / split.periodsPerYear;
  const currentIndex = Math.floor(((m - split.yearStartMonth + 12) % 12) / length) + 1;
  return Array.from({ length: split.periodsPerYear }, (_, i) => {
    const first = addMonths(year, split.yearStartMonth, i * length);
    const last = addMonths(first.year, first.month, length - 1);
    const pad = (n: number) => String(n).padStart(2, '0');
    return {
      key: `${first.year}-${pad(first.month)}-${length}m`,
      label: previewLabel(year, i + 1, split, first),
      months: monthRange(`${first.year}-${pad(first.month)}-01`, `${last.year}-${pad(last.month)}-01`, language),
      current: i + 1 === currentIndex,
    };
  });
}
