// Typed keys: `t('nav.home')` is checked against the English list, so a typo or a missing key fails the type check.
import 'i18next';
import type { en } from './locales/en';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof en };
  }
}
