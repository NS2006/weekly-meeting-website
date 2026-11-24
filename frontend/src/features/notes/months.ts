import { currentLanguage, localeOf, type Language } from '../../i18n/language';
import { todayWib } from '../../utils/dates';

/** One month-name formatter per language, made on first use. */
const formatters = new Map<Language, Intl.DateTimeFormat>();
function monthFormat(language: Language): Intl.DateTimeFormat {
  let made = formatters.get(language);
  if (!made) {
    made = new Intl.DateTimeFormat(localeOf(language), { month: 'long', year: 'numeric', timeZone: 'UTC' });
    formatters.set(language, made);
  }
  return made;
}

/**
 * Items in order (newest first), grouped by the month of `dateOf(item)` in Indonesia time: "November 2026", or in
 * Indonesian "Agustus 2026".
 */
export function groupByMonth<T>(
  items: readonly T[],
  dateOf: (item: T) => string,
  language: Language = currentLanguage(),
): { key: string; label: string; items: T[] }[] {
  const MONTH = monthFormat(language);
  const groups: { key: string; label: string; items: T[] }[] = [];
  for (const item of items) {
    const key = todayWib(new Date(dateOf(item))).slice(0, 7);
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      group = { key, label: MONTH.format(new Date(`${key}-01T00:00:00Z`)), items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}
