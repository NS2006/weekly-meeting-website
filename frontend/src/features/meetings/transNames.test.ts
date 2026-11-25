import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Trans } from 'react-i18next';
import { afterEach, describe, expect, it } from 'vitest';
import { EntityName } from '../../components/EntityName';
import { setLanguage } from '../../i18n/i18n';

afterEach(() => setLanguage('en'));

const render = (i18nKey: string, tag: string, value: string) =>
  renderToStaticMarkup(createElement(Trans, { i18nKey, components: { [tag]: createElement(EntityName, null, value) } } as never));

describe('names and days inside translated sentences', () => {
  it('show the value as typed, in both languages', () => {
    expect(render('waiting.body', 'email', 'new.joiner@example.com')).toContain(
      'Your account <span class="entity-name">new.joiner@example.com</span> is created.',
    );
    expect(render('meetings.schedules.deleteTitle', 'name', 'Weekly Update')).toBe(
      'Delete <span class="entity-name">Weekly Update</span>?',
    );
    setLanguage('id');
    expect(render('waiting.body', 'email', 'new.joiner@example.com')).toContain(
      'Akun <span class="entity-name">new.joiner@example.com</span> sudah dibuat.',
    );
    expect(render('meetings.schedules.deleteTitle', 'name', 'Weekly Update')).toBe(
      'Hapus <span class="entity-name">Weekly Update</span>?',
    );
  });
});

describe('links inside translated sentences', () => {
  it('hold their own words', () => {
    // (Was the Project menu's "Create one on the Projects page" link; that menu now creates projects itself.)
    const html = renderToStaticMarkup(
      createElement(Trans, { i18nKey: 'notes.page.notFoundBody', components: { page: createElement('a', { href: '/notes' }) } } as never),
    );
    expect(html).toBe(
      "It may have been deleted. Only its owner can open a note here; teammates read shared notes on the meeting&#x27;s page. <a href=\"/notes\">Your notes</a>",
    );
  });
});
