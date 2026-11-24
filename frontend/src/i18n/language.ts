/**
 * The interface language (owner, 2026-11-24: English or Indonesian, English by default, each person's choice kept in
 * their own browser). This module has no dependencies, so plain helpers (dates, error sentences) and the workers that
 * build downloads can read it; downloads always pass 'en' (owner: downloaded files are always in English).
 */
export type Language = 'en' | 'id';

export const LANGUAGES: readonly Language[] = ['en', 'id'];
export const DEFAULT_LANGUAGE: Language = 'en';

/** The locale each language formats dates with. */
const LOCALES: Record<Language, string> = { en: 'en-GB', id: 'id-ID' };

let current: Language = DEFAULT_LANGUAGE;

export const asLanguage = (value: unknown): Language => (value === 'id' ? 'id' : 'en');
export const currentLanguage = (): Language => current;
export const localeOf = (language: Language = current): string => LOCALES[language];

/** Called by i18n.ts when the language changes (never by a worker, which stays in English). */
export function setCurrentLanguage(language: Language): void {
  current = language;
}
