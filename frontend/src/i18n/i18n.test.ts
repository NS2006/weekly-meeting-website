import { afterEach, describe, expect, it } from 'vitest';
import { describeDays, formatDay, formatFullDay, greeting, relativeDay } from '../utils/dates';
import { errorLabel } from '../utils/errorLabels';
import { i18n, setLanguage } from './i18n';
import { currentLanguage } from './language';
import { en } from './locales/en';
import { id } from './locales/id';

/** Every key as "a.b.c", and its text. */
function flatten(value: unknown, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof inner === 'string') out.set(path, inner);
    else for (const [k, v] of flatten(inner, path)) out.set(k, v);
  }
  return out;
}
/** The {{values}} and <tags> a text uses: a translation must keep them all. */
const slots = (text: string) => [...text.matchAll(/\{\{\w+\}\}|<\/?\w+\/?>/g)].map((m) => m[0]).sort();

afterEach(() => setLanguage('en'));

describe('the two word lists', () => {
  it('have the same keys, nothing empty, and the same {{values}} and <tags> in each text', () => {
    const english = flatten(en);
    const indonesian = flatten(id);
    expect([...indonesian.keys()].sort()).toEqual([...english.keys()].sort());
    for (const [key, text] of english) {
      expect(text.trim(), key).not.toBe('');
      expect(indonesian.get(key)?.trim(), key).not.toBe('');
      expect(slots(indonesian.get(key) ?? ''), key).toEqual(slots(text));
      // A name or day inside a sentence is <tag/>: an empty pair (<tag></tag>) makes <Trans> drop it.
      expect(text, key).not.toMatch(/<(\w+)><\/\1>/);
      expect(indonesian.get(key), key).not.toMatch(/<(\w+)><\/\1>/);
      // An HTML void element's name (<link>, <br>…) is closed at once by the parser, so its words fall outside.
      expect(text, key).not.toMatch(/<\/?(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)\b/);
    }
  });
});

describe('the language', () => {
  it('is English unless another is chosen, and switches the screens, dates and error sentences', () => {
    expect(currentLanguage()).toBe('en');
    expect(i18n.t('nav.notes')).toBe('Notes');
    expect(formatFullDay('2026-11-19')).toBe('Thursday, 19 November 2026');
    expect(relativeDay('2026-11-26', '2026-11-24')).toBe('In 2 days');

    setLanguage('id');
    expect(currentLanguage()).toBe('id');
    expect(i18n.t('account.signOut')).toBe('Keluar');
    expect(i18n.t('nav.notes')).toBe('Notes'); // page names stay as they are (owner, 2026-11-24)
    expect(i18n.t('waitingUsers.count', { count: 3 })).toBe('3 orang sudah masuk dan menunggu Anda aktifkan.');
    expect(formatFullDay('2026-11-19')).toBe('Kamis, 19 November 2026');
    expect(formatDay('2026-11-19')).toBe('Kam, 19 Nov');
    expect(relativeDay('2026-11-26', '2026-11-24')).toBe('Dalam 2 hari');
    expect(describeDays([3, 5])).toBe('Setiap Rabu dan Jumat');
    expect(greeting(new Date('2026-11-20T09:00:00.000Z'))).toBe('Selamat sore'); // 16:00 WIB
    expect(errorLabel('not_found')).toBe('Tidak ditemukan. Mungkin sudah dihapus, atau Anda bukan bagian darinya.');

    // Downloads ask for English whatever is on screen.
    expect(formatFullDay('2026-11-19', 'en')).toBe('Thursday, 19 November 2026');
  });

  it('counts in English with one and many', () => {
    expect(i18n.t('waitingUsers.count', { count: 1 })).toBe('1 person signed in and is waiting for you to activate them.');
    expect(i18n.t('waitingUsers.count', { count: 2 })).toBe('2 people signed in and are waiting for you to activate them.');
  });
});
