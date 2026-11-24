import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { asLanguage, DEFAULT_LANGUAGE, setCurrentLanguage, type Language } from './language';
import { en, id } from './messages';

/**
 * i18next for the screens (owner, 2026-11-24). The choice is kept in this browser only (localStorage), English when
 * nothing is saved or storage is blocked (a private window); nothing is sent to the server. Both word lists are in
 * the bundle, so the first screen is already in the right language.
 */
const STORAGE_KEY = 'wmn.language';

function savedLanguage(): Language {
  try {
    return asLanguage(globalThis.localStorage?.getItem(STORAGE_KEY) ?? DEFAULT_LANGUAGE);
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

function apply(language: Language) {
  setCurrentLanguage(language);
  // Screen readers read the page in its language.
  if (typeof document !== 'undefined') document.documentElement.lang = language;
}

const initial = savedLanguage();
apply(initial);
i18n.on('languageChanged', (language) => apply(asLanguage(language)));

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, id: { translation: id } },
  lng: initial,
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: ['en', 'id'],
  initAsync: false,
  // React escapes text itself.
  interpolation: { escapeValue: false },
  returnNull: false,
});

/** Switches the screens and keeps the choice in this browser. */
export function setLanguage(language: Language): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, language);
  } catch {
    // Storage blocked: the choice lasts until the page is closed.
  }
  void i18n.changeLanguage(language);
}

export { i18n };
