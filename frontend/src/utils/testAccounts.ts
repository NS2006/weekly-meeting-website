import type { MockSignInRequest } from '@weekly-meeting/shared';

/**
 * Fictitious accounts for the development-only "quick sign-in" list (shown only when import.meta.env.DEV). The same
 * accounts are created by `npm run db:seed --prefix backend` (backend/src/database/seed/scenario.ts, ACCOUNTS): all
 * active except Former Member (deactivated) and New Joiner (waiting for activation), who see the waiting page.
 * admin.test@example.com is in backend/.env ADMIN_EMAILS, which keeps it an active admin.
 */
export const TEST_ACCOUNTS: MockSignInRequest[] = [
  { email: 'admin.test@example.com', name: 'Admin Test' },
  { email: 'pir.leader@example.com', name: 'PIR Leader' },
  ...Array.from({ length: 10 }, (_, i) => ({ email: `pir.${i + 1}@example.com`, name: `PIR ${i + 1}` })),
  { email: 'former.member@example.com', name: 'Former Member' },
  { email: 'new.joiner@example.com', name: 'New Joiner' },
];

/**
 * Accounts written as "email|Name;email|Name" (in frontend/.env.local, gitignored, so real names and work emails never
 * go into the source). Malformed entries and duplicates, also of `taken`, are skipped.
 */
export function parseAccounts(raw: unknown, taken: readonly MockSignInRequest[] = []): MockSignInRequest[] {
  if (typeof raw !== 'string') return [];
  const accounts: MockSignInRequest[] = [];
  for (const entry of raw.split(';')) {
    const [email = '', name = ''] = entry.split('|').map((part) => part.trim());
    const known = (e: string) => [...taken, ...accounts].some((a) => a.email === e);
    if (/^[^\s@|;]+@[^\s@|;]+\.[^\s@|;]+$/.test(email) && name && !known(email.toLowerCase())) {
      accounts.push({ email: email.toLowerCase(), name: name.slice(0, 255) });
    }
  }
  return accounts;
}

/** Extra accounts for this machine only (VITE_EXTRA_TEST_ACCOUNTS, such as your own work account). */
export const parseExtraAccounts = (raw: unknown): MockSignInRequest[] => parseAccounts(raw, TEST_ACCOUNTS);

/**
 * The quick sign-in list. VITE_TEST_ACCOUNTS, when set, replaces the fictitious accounts: the people the seed made
 * from the team's real data (its tools print the line). VITE_EXTRA_TEST_ACCOUNTS comes first either way.
 */
export function quickSignInAccounts(env: { VITE_TEST_ACCOUNTS?: unknown; VITE_EXTRA_TEST_ACCOUNTS?: unknown }): MockSignInRequest[] {
  const own = parseAccounts(env.VITE_TEST_ACCOUNTS);
  const base = own.length > 0 ? own : TEST_ACCOUNTS;
  return [...parseAccounts(env.VITE_EXTRA_TEST_ACCOUNTS, base), ...base];
}

/** Empty in a production build, so the local names and work emails never ship in its code. */
export const QUICK_SIGN_IN_ACCOUNTS: MockSignInRequest[] = import.meta.env.DEV
  ? quickSignInAccounts({
      VITE_TEST_ACCOUNTS: import.meta.env.VITE_TEST_ACCOUNTS,
      VITE_EXTRA_TEST_ACCOUNTS: import.meta.env.VITE_EXTRA_TEST_ACCOUNTS,
    })
  : [];
