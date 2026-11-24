import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Trans } from 'react-i18next';
import { afterEach, describe, expect, it } from 'vitest';
import { EntityName } from '../../components/EntityName';
import { setLanguage } from '../../i18n/i18n';

afterEach(() => setLanguage('en'));

/** A sentence with the project's name in it, as the Projects page and the delete dialog render it. */
const sentence = (key: 'projects.overview.deleted' | 'projects.detail.confirmTitle', name: string) =>
  renderToStaticMarkup(createElement(Trans, { i18nKey: key, components: { name: createElement(EntityName, null, name) } }));

describe('project sentences with a name', () => {
  it('keep the name as typed, in English and in Indonesian', () => {
    expect(sentence('projects.overview.deleted', 'Checkout <revamp>')).toBe(
      '<span class="entity-name">Checkout &lt;revamp&gt;</span> was deleted.',
    );
    expect(sentence('projects.detail.confirmTitle', 'Checkout revamp')).toBe('Delete <span class="entity-name">Checkout revamp</span>?');

    setLanguage('id');
    expect(sentence('projects.overview.deleted', 'Checkout revamp')).toBe('<span class="entity-name">Checkout revamp</span> sudah dihapus.');
    expect(sentence('projects.detail.confirmTitle', 'Checkout revamp')).toBe('Hapus <span class="entity-name">Checkout revamp</span>?');
  });
});
