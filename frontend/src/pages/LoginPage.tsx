import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MockSignInRequest } from '@weekly-meeting/shared';
import { BrandMark } from '../components/BrandMark';
import { BlueAlert, BlueCard } from '../components/blue';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { SignInForm } from '../features/auth/SignInForm';
import { TestAccounts } from '../features/auth/TestAccounts';
import { useSignIn } from '../features/auth/useAuth';
import { ApiFailure } from '../services/api';
import { errorLabel } from '../utils/errorLabels';

/** Mock sign-in page: a development stand-in for Apps Gateway (company SSO). */
export function LoginPage({ notice }: { notice?: string }) {
  const { t } = useTranslation();
  const signIn = useSignIn();
  const [signingAs, setSigningAs] = useState<string | null>(null);
  const error = signIn.error instanceof ApiFailure ? signIn.error.code : signIn.error ? 'unknown_error' : null;

  function submit(identity: MockSignInRequest, viaTestAccount = false) {
    setSigningAs(viaTestAccount ? identity.email : null);
    signIn.mutate(identity, { onSettled: () => setSigningAs(null) });
  }

  return (
    <main className="center-page">
      <BlueCard>
        <div className="stack">
          <BrandMark tagline />
          <div>
            <h1 className="auth-title">{t('auth.title')}</h1>
            <p className="muted">{t('auth.lead')}</p>
          </div>

          {error ? <BlueAlert variant="error">{errorLabel(error)}</BlueAlert> : null}
          {!error && notice ? <BlueAlert variant="info">{errorLabel(notice)}</BlueAlert> : null}

          <SignInForm busy={signIn.isPending && !signingAs} onSubmit={(identity) => submit(identity)} />

          {import.meta.env.DEV ? (
            <TestAccounts
              busy={signIn.isPending}
              signingAs={signingAs}
              onPick={(account) => submit(account, true)}
            />
          ) : null}

          <BlueAlert variant="warning" title={t('auth.mockTitle')}>
            {t('auth.mockBody')}
          </BlueAlert>
        </div>
      </BlueCard>
      <LanguageSwitch />
      <p className="muted small">{t('auth.footer')}</p>
    </main>
  );
}
