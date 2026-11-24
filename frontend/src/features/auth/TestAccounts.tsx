import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MockSignInRequest } from '@weekly-meeting/shared';
import { BlueAvatar, BlueButton } from '../../components/blue';
import { QUICK_SIGN_IN_ACCOUNTS } from '../../utils/testAccounts';
import './TestAccounts.css';

/** Development build only (the caller checks import.meta.env.DEV): one click signs in as a test account. */
export function TestAccounts({
  busy,
  signingAs,
  onPick,
}: {
  busy: boolean;
  signingAs: string | null;
  onPick: (account: MockSignInRequest) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <div className="test-accounts">
      <p className="test-accounts__divider muted small">
        <span>{t('auth.or')}</span>
      </p>
      <BlueButton
        variant="secondary"
        fullWidth
        aria-expanded={open}
        aria-controls="test-account-list"
        disabled={busy}
        onClick={() => setOpen(!open)}
      >
        {t('auth.quick')} {open ? '▴' : '▾'}
      </BlueButton>
      {/* Only in a development build: accounts set in frontend/.env.local stay on that machine; the built-in
          @example.com ones are fictitious. */}
      {open ? (
        <ul id="test-account-list" className="test-accounts__list" aria-label={t('auth.testAccounts')}>
          {QUICK_SIGN_IN_ACCOUNTS.map((account) => (
            <li key={account.email}>
              <button type="button" className="test-accounts__item" disabled={busy} onClick={() => onPick(account)}>
                <BlueAvatar name={account.name} size="sm" />
                <span className="test-accounts__who">
                  <span className="test-accounts__name">{account.name}</span>
                  <span className="test-accounts__email muted small">{account.email}</span>
                </span>
                <span className="test-accounts__go">{signingAs === account.email ? t('auth.signingIn') : t('auth.signIn')}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
