import type { MeetingView } from '@weekly-meeting/shared';
import { currentLanguage, localeOf, type Language } from '../../i18n/language';

export interface MeetingGroup {
  key: string;
  label: string;
  meetings: MeetingView[];
}

const formatters = new Map<Language, Intl.DateTimeFormat>();
/** "November 2026" (or "Desember 2026"), one formatter per language. */
function monthFormat(language: Language): Intl.DateTimeFormat {
  let made = formatters.get(language);
  if (!made) {
    made = new Intl.DateTimeFormat(localeOf(language), { month: 'long', year: 'numeric', timeZone: 'UTC' });
    formatters.set(language, made);
  }
  return made;
}

/** Past meetings (newest first) by month: "November 2026". */
export function groupByMonth(meetings: readonly MeetingView[], language: Language = currentLanguage()): MeetingGroup[] {
  const groups: MeetingGroup[] = [];
  for (const m of meetings) {
    const key = m.date.slice(0, 7);
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      group = { key, label: monthFormat(language).format(new Date(`${key}-01T00:00:00Z`)), meetings: [] };
      groups.push(group);
    }
    group.meetings.push(m);
  }
  return groups;
}
