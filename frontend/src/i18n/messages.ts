import { currentLanguage, type Language } from './language';
import { en, type Messages } from './locales/en';
import { id } from './locales/id';

/**
 * The word lists for plain helpers outside React (dates, error sentences), without i18next, so the workers that build
 * downloads can use them too. Components use i18next's `t` (i18n.ts), which reads the same lists.
 */
const LISTS: Record<Language, Messages> = { en, id };

export const messages = (language: Language = currentLanguage()): Messages => LISTS[language];

/** "In {{count}} days" with { count: 3 } → "In 3 days". */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (whole, key: string) => (key in values ? String(values[key]) : whole));
}

export { en, id };
