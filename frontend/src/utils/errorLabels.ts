import { messages } from '../i18n/messages';

/**
 * A sentence for an API error code, in the interface language (i18n/locales). `overrides` words a code for one form
 * (validation_failed differs per form).
 */
export function errorLabel(code: string, overrides: Record<string, string> = {}): string {
  const errors: Record<string, string> = messages().errors;
  return overrides[code] ?? errors[code] ?? errors.fallback ?? 'Something went wrong. Try again.';
}
