import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Trans } from 'react-i18next';
import { afterEach, describe, expect, it } from 'vitest';
import { EntityName } from '../../components/EntityName';
import { i18n, setLanguage } from '../../i18n/i18n';
import { teamsEn } from '../../i18n/locales/teams.en';
import { teamsId } from '../../i18n/locales/teams.id';
import { usersEn } from '../../i18n/locales/users.en';
import { usersId } from '../../i18n/locales/users.id';

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
// A name is a self-closing tag (<name/>): an empty pair (<name></name>) would make <Trans> drop the name itself.
const placeholders = (text: string) => [...text.matchAll(/<\w+\/>/g)].map((m) => m[0]).sort();

/** <Trans> with names in highlighted spans, as the screens render it. */
function render(i18nKey: string, names: Record<string, string>, extra: Record<string, unknown> = {}): string {
  const components: Record<string, ReactElement> = { strong: createElement('strong') };
  for (const [tag, value] of Object.entries(names)) components[tag] = createElement(EntityName, null, value);
  return renderToStaticMarkup(createElement(Trans, { i18nKey, components, ...extra } as never));
}

afterEach(() => setLanguage('en'));

describe('the Teams and Users words', () => {
  it('put the same names (<name/>) in each language, and never an empty tag pair', () => {
    const lists: [Map<string, string>, Map<string, string>][] = [
      [flatten(teamsEn), flatten(teamsId)],
      [flatten(usersEn), flatten(usersId)],
    ];
    for (const [english, indonesian] of lists) {
      for (const [key, text] of english) {
        expect(placeholders(indonesian.get(key) ?? ''), key).toEqual(placeholders(text));
        expect(text, key).not.toMatch(/<(\w+)><\/\1>/);
        expect(indonesian.get(key), key).not.toMatch(/<(\w+)><\/\1>/);
      }
    }
  });

  it('show the names as typed, highlighted, in the sentences around them', () => {
    expect(render('teams.team.leaderDone', { member: 'Budi <Test>', team: 'Payments & Co' })).toBe(
      '<span class="entity-name">Budi &lt;Test&gt;</span> now leads <span class="entity-name">Payments &amp; Co</span>. You are a member.',
    );
    expect(render('teams.delete.body', {}, { count: 1 })).toContain('for all 1 member right away. For 30 days you can restore it from <strong>Teams → Deleted teams</strong>.');
    expect(i18n.t('teams.list.matchCount', { count: 0 })).toBe('0 teams match');
    expect(i18n.t('teams.memberCount', { count: 1 })).toBe('1 member');

    setLanguage('id');
    expect(render('teams.add.noMatch', { query: 'zz' })).toBe(
      'Tidak ada orang aktif yang cocok dengan <span class="entity-name">zz</span>.',
    );
    expect(render('teams.delete.body', {}, { count: 3 })).toContain('<strong>Teams → Tim yang dihapus</strong>');
    expect(i18n.t('teams.list.title')).toBe('Teams'); // page names stay in English
    expect(i18n.t('teams.memberCount', { count: 1 })).toBe('1 anggota');
  });
});
