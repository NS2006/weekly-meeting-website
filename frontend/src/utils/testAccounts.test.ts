import { describe, expect, it } from 'vitest';
import { parseExtraAccounts, quickSignInAccounts, TEST_ACCOUNTS } from './testAccounts';

describe('TEST_ACCOUNTS', () => {
  it('lists the seeded accounts (Admin Test, PIR Leader, PIR 1 to PIR 10, Former Member, New Joiner), all fictitious', () => {
    expect(TEST_ACCOUNTS.map((a) => a.name)).toEqual([
      'Admin Test',
      'PIR Leader',
      ...Array.from({ length: 10 }, (_, i) => `PIR ${i + 1}`),
      'Former Member',
      'New Joiner',
    ]);
    expect(TEST_ACCOUNTS.every((a) => a.email.endsWith('@example.com'))).toBe(true);
  });
});

describe('parseExtraAccounts()', () => {
  it('reads "email|Name" entries separated by semicolons', () => {
    expect(parseExtraAccounts(' First.Person@Example.test | First Person ;second@example.test|Second')).toEqual([
      { email: 'first.person@example.test', name: 'First Person' },
      { email: 'second@example.test', name: 'Second' },
    ]);
  });

  it('skips malformed entries and duplicates, and anything that is not text', () => {
    expect(parseExtraAccounts('no-at-sign|Name;x@example.test|;a@example.test|A;a@example.test|Again;admin.test@example.com|Dup')).toEqual([
      { email: 'a@example.test', name: 'A' },
    ]);
    expect(parseExtraAccounts(undefined)).toEqual([]);
    expect(parseExtraAccounts('')).toEqual([]);
  });
});

describe('quickSignInAccounts()', () => {
  it('lists the fictitious accounts, after this machine’s extra ones, when no list of its own is set', () => {
    const list = quickSignInAccounts({ VITE_EXTRA_TEST_ACCOUNTS: 'me@company.example|Me' });
    expect(list[0]).toEqual({ email: 'me@company.example', name: 'Me' });
    expect(list.slice(1)).toEqual(TEST_ACCOUNTS);
    expect(quickSignInAccounts({})).toEqual(TEST_ACCOUNTS);
  });

  it('shows only the local list (the seeded team) when VITE_TEST_ACCOUNTS is set', () => {
    const list = quickSignInAccounts({
      VITE_TEST_ACCOUNTS: 'lead@company.example|Team Lead;writer@company.example|Writer;bad entry',
      VITE_EXTRA_TEST_ACCOUNTS: 'writer@company.example|Duplicate',
    });
    expect(list).toEqual([
      { email: 'lead@company.example', name: 'Team Lead' },
      { email: 'writer@company.example', name: 'Writer' },
    ]);
    expect(quickSignInAccounts({ VITE_TEST_ACCOUNTS: 'only malformed' })).toEqual(TEST_ACCOUNTS);
  });
});
