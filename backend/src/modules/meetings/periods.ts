import type { PeriodsPerYear, PeriodStatus, YearSplit } from '@weekly-meeting/shared';

/**
 * A team's year split into periods (owner, 2026-11-23): 4 quarters from January unless the leader changes it. Like the
 * team's Word file, one per quarter: each period gathers the meetings (and their notes) whose day falls in it. All
 * dates are calendar dates (YYYY-MM-DD, Indonesia time, as meetings are). Nothing per period is stored.
 */
export interface Period {
  /**
   * The months it covers: its first month and its length, `2026-10-3m` (three months from October 2026). Not "Q4":
   * after the leader changes the split, an old link then finds the same months or nothing, never another period.
   */
  key: string;
  label: string;
  /** First and last day, both included. */
  start: string;
  end: string;
  /** The year the team's year starts in, and the period's place in it (1 = first). */
  year: number;
  index: number;
}

export const PERIODS_PER_YEAR: readonly PeriodsPerYear[] = [1, 2, 3, 4, 6, 12];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n: number) => String(n).padStart(2, '0');
/** The month `delta` months after (year, month), month 1–12. */
function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}
const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** "2026" for a year from January; "2026/27" for one that starts in another month. */
function yearName(year: number, split: YearSplit): string {
  return split.yearStartMonth === 1 ? String(year) : `${year}/${pad((year + 1) % 100)}`;
}

/** Q4 2026, H2 2026, Nov 2026, 2026; P1–P3 (four months) and P1–P6 (two months) otherwise. */
function labelOf(year: number, index: number, split: YearSplit, first: { year: number; month: number }): string {
  const name = yearName(year, split);
  switch (split.periodsPerYear) {
    case 1:
      return split.yearStartMonth === 1 ? name : `FY ${name}`;
    case 2:
      return `H${index} ${name}`;
    case 4:
      return `Q${index} ${name}`;
    case 12:
      return `${MONTHS[first.month - 1]} ${first.year}`;
    default:
      return `P${index} ${name}`;
  }
}

/** The `index`-th period (1-based) of the team year that starts in `year`. */
export function periodAt(year: number, index: number, split: YearSplit): Period {
  const months = 12 / split.periodsPerYear;
  const first = addMonths(year, split.yearStartMonth, (index - 1) * months);
  const last = addMonths(first.year, first.month, months - 1);
  return {
    key: `${first.year}-${pad(first.month)}-${months}m`,
    label: labelOf(year, index, split, first),
    start: `${first.year}-${pad(first.month)}-01`,
    end: `${last.year}-${pad(last.month)}-${pad(daysIn(last.year, last.month))}`,
    year,
    index,
  };
}

/** The period a day falls in. */
export function periodOf(date: string, split: YearSplit): Period {
  const [y, m] = date.split('-').map(Number) as [number, number];
  const fromStart = (m - split.yearStartMonth + 12) % 12;
  const year = m >= split.yearStartMonth ? y : y - 1;
  return periodAt(year, Math.floor(fromStart / (12 / split.periodsPerYear)) + 1, split);
}

/**
 * A period from its key, or null when no period of this split covers exactly those months (the split was changed
 * since, or the key is nonsense).
 */
export function parsePeriodKey(key: string, split: YearSplit): Period | null {
  const match = /^(\d{4})-(\d{2})-(\d{1,2})m$/.exec(key);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < 2000 || year > 2200 || month < 1 || month > 12) return null;
  const period = periodOf(`${match[1]}-${match[2]}-01`, split);
  return period.key === key ? period : null;
}

export function nextPeriod(period: Period, split: YearSplit): Period {
  return period.index < split.periodsPerYear ? periodAt(period.year, period.index + 1, split) : periodAt(period.year + 1, 1, split);
}

export function previousPeriod(period: Period, split: YearSplit): Period {
  return period.index > 1 ? periodAt(period.year, period.index - 1, split) : periodAt(period.year - 1, split.periodsPerYear, split);
}

/** Every period from `first` to `last`, both included (empty when `last` comes first). */
export function periodsFrom(first: Period, last: Period, split: YearSplit): Period[] {
  const out: Period[] = [];
  for (let p = first; p.start <= last.start && out.length < 500; p = nextPeriod(p, split)) out.push(p);
  return out;
}

export function periodStatus(period: Period, today: string): PeriodStatus {
  if (period.end < today) return 'ended';
  return period.start > today ? 'upcoming' : 'current';
}

/** The period's length in days, and how many of them have begun by `today` (0 before it, all after it). */
export function periodProgress(period: Period, today: string): { days: number; daysPassed: number } {
  const day = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86_400_000;
  const days = day(period.end) - day(period.start) + 1;
  const passed = Math.min(days, Math.max(0, day(today) - day(period.start) + 1));
  return { days, daysPassed: passed };
}
