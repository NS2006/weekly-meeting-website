import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Trans } from 'react-i18next';
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../../i18n/i18n';
import { groupByMonth } from './months';

afterEach(() => setLanguage('en'));

const items = [{ at: '2026-08-20T03:00:00.000Z' }, { at: '2026-08-02T03:00:00.000Z' }, { at: '2026-07-31T18:00:00.000Z' }];

describe('groupByMonth()', () => {
  it('groups newest first by the month in Indonesia time, named in English by default', () => {
    const groups = groupByMonth(items, (item) => item.at);
    // 31 Jul 18:00 UTC is already 1 August in Indonesia (UTC+7).
    expect(groups.map((g) => [g.key, g.label, g.items.length])).toEqual([['2026-08', 'August 2026', 3]]);
  });

  it('names the month in Indonesian when asked, or when that is the interface language', () => {
    expect(groupByMonth(items, (item) => item.at, 'id')[0]?.label).toBe('Agustus 2026');
    setLanguage('id');
    expect(groupByMonth([{ at: '2026-10-05T03:00:00.000Z' }], (item) => item.at)[0]?.label).toBe('Oktober 2026');
    expect(groupByMonth([{ at: '2026-10-05T03:00:00.000Z' }], (item) => item.at, 'en')[0]?.label).toBe('October 2026');
  });
});

describe('the editor hint', () => {
  const hint = () => renderToStaticMarkup(createElement(Trans, { i18nKey: 'notes.editor.hint', components: { strong: createElement('strong') } }));

  it('reads as before in English, with the Project button in bold', () => {
    expect(hint()).toBe(
      'Work progress only: no personal or confidential data (ID numbers, salaries, customer data). The <strong>Project</strong> button puts a part on one of your projects&#x27; pages.',
    );
  });

  it('is in Indonesian when that is the interface language', () => {
    setLanguage('id');
    expect(hint()).toContain('Tombol <strong>Proyek</strong> menaruh');
  });
});
