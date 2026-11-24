import { createElement, Fragment, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AdminUser } from '@weekly-meeting/shared';
import { describeChange, needsConfirmation } from './ConfirmChange';

// Titles and notices are elements now (the name is highlighted), so compare their rendered HTML or text.
const html = (node: ReactNode) => renderToStaticMarkup(createElement(Fragment, null, node));
const text = (node: ReactNode) => html(node).replace(/<[^>]+>/g, '');

const budi: AdminUser = {
  id: '7',
  name: 'Budi Test',
  email: 'budi@example.com',
  status: 'inactive',
  roles: ['user'],
  adminFromConfig: false,
  createdAt: '2026-11-20T00:00:00.000Z',
  lastLoginAt: null,
  waiting: false,
};

describe('user changes', () => {
  it('asks for confirmation for everything except activating', () => {
    expect(needsConfirmation({ kind: 'status', status: 'active' })).toBe(false);
    expect(needsConfirmation({ kind: 'status', status: 'inactive' })).toBe(true);
    expect(needsConfirmation({ kind: 'admin', admin: true })).toBe(true);
    expect(needsConfirmation({ kind: 'admin', admin: false })).toBe(true);
  });

  it('describes each change in words, and marks the destructive ones', () => {
    const deactivate = describeChange(budi, { kind: 'status', status: 'inactive' });
    expect(text(deactivate.title)).toBe('Deactivate Budi Test?');
    expect(text(deactivate.done)).toBe('Budi Test is deactivated.');
    expect(deactivate.danger).toBe(true);

    const makeAdmin = describeChange(budi, { kind: 'admin', admin: true });
    expect(makeAdmin.action).toBe('Make admin');
    expect(text(makeAdmin.done)).toBe('Budi Test is now an admin.');
    expect(makeAdmin.danger).toBe(false);

    expect(describeChange(budi, { kind: 'admin', admin: false }).danger).toBe(true);
  });

  it('highlights the name as a value, apart from the wording, and still escapes it', () => {
    expect(html(describeChange(budi, { kind: 'admin', admin: true }).title)).toBe(
      'Make <span class="entity-name">Budi Test</span> an admin?',
    );
    const tricky = { ...budi, name: '<b>Budi</b>' };
    expect(html(describeChange(tricky, { kind: 'status', status: 'active' }).done)).toBe(
      '<span class="entity-name">&lt;b&gt;Budi&lt;/b&gt;</span> is now active.',
    );
  });

  it('words each change in Indonesian when asked, and leaves the name as typed', () => {
    const makeAdmin = describeChange(budi, { kind: 'admin', admin: true }, 'id');
    expect(html(makeAdmin.title)).toBe('Jadikan <span class="entity-name">Budi Test</span> admin?');
    expect(makeAdmin.action).toBe('Jadikan admin');
    expect(text(makeAdmin.done)).toBe('Budi Test sekarang menjadi admin.');

    const deactivate = describeChange(budi, { kind: 'status', status: 'inactive' }, 'id');
    expect(text(deactivate.title)).toBe('Nonaktifkan Budi Test?');
    expect(deactivate.action).toBe('Nonaktifkan');
    expect(deactivate.body).toMatch(/^Orang ini langsung dikeluarkan/);

    // English stays the default.
    expect(describeChange(budi, { kind: 'admin', admin: false }).action).toBe('Remove admin');
  });
});
