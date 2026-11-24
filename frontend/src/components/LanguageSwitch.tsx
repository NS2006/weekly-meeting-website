import { useTranslation } from 'react-i18next';
import { setLanguage } from '../i18n/i18n';
import { asLanguage, type Language } from '../i18n/language';

/** Shown as "ID | EN"; each button's name is the language's own name. */
const ORDER: readonly Language[] = ['id', 'en'];

/**
 * The language switch (owner, 2026-11-24): two small buttons, "ID | EN", the one in use filled. In the header on
 * every signed-in page, and under the sign-in and waiting pages. The choice is kept in this browser.
 */
export function LanguageSwitch() {
  const { t, i18n } = useTranslation();
  const current = asLanguage(i18n.language);
  return (
    <div className="language-switch" role="group" aria-label={t('language.label')}>
      {ORDER.map((language) => (
        <button
          key={language}
          type="button"
          lang={language}
          className="language-switch__item"
          aria-pressed={current === language}
          aria-label={t(`language.${language}`)}
          title={t(`language.${language}`)}
          onClick={() => setLanguage(language)}
        >
          {language.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
