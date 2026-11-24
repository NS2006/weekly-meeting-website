import type { ScheduleMeeting } from '@weekly-meeting/shared';
import { currentLanguage, type Language } from '../../i18n/language';
import { fill, messages } from '../../i18n/messages';
import { formatDay } from '../../utils/dates';

/** "1 note", "3 notes" (in Indonesian "3 catatan"). */
export function notesCount(count: number, language: Language = currentLanguage()): string {
  const words = messages(language).meetings.counts;
  return fill(count === 1 ? words.notes_one : words.notes_other, { count });
}

/**
 * A meeting in the "jump to" list: its day (with the year when it is not this year's), then what is worth knowing
 * before opening it: today, cancelled, or how many notes it holds.
 */
export function scheduleOptionLabel(meeting: ScheduleMeeting, today: string, language: Language = currentLanguage()): string {
  const words = messages(language).meetings.switcher;
  const day = formatDay(meeting.date, language) + (meeting.date.slice(0, 4) === today.slice(0, 4) ? '' : ` ${meeting.date.slice(0, 4)}`);
  const parts = [day];
  if (meeting.date === today) parts.push(words.today);
  if (meeting.status === 'cancelled') parts.push(words.cancelled);
  else if (meeting.noteCount > 0) parts.push(notesCount(meeting.noteCount, language));
  return parts.join(' · ');
}
