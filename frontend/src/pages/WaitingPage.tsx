import { Trans, useTranslation } from 'react-i18next';
import type { Me } from '@weekly-meeting/shared';
import { BrandMark } from '../components/BrandMark';
import { BlueAlert, BlueButton, BlueCard } from '../components/blue';
import { EntityName } from '../components/EntityName';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { useMe, useSignOut } from '../features/auth/useAuth';

const RECHECK_MS = 30_000;

/** An inactive user's only page. Checks every 30 s; once activated, the route guard moves them on. */
export function WaitingPage({ user }: { user: Me }) {
  const { t } = useTranslation();
  const me = useMe({ refetchInterval: RECHECK_MS });
  const signOut = useSignOut();

  return (
    <main className="center-page">
      <BlueCard>
        <div className="stack">
          <BrandMark />
          <div className="row">
            <span className="status-pulse" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="8.5" />
                <path d="M12 7.5V12l3 2" />
              </svg>
            </span>
            <h1 className="auth-title">{t('waiting.title')}</h1>
          </div>
          <div>
            <p className="muted">
              <Trans i18nKey="waiting.body" components={{ email: <EntityName>{user.email}</EntityName> }} />
            </p>
          </div>
          <BlueAlert variant="info">{t('waiting.recheck')}</BlueAlert>
          <div className="row">
            <BlueButton variant="primary" loading={me.isFetching} onClick={() => void me.refetch()}>
              {t('waiting.checkNow')}
            </BlueButton>
            <BlueButton variant="ghost" loading={signOut.isPending} onClick={() => signOut.mutate()}>
              {t('waiting.signOut')}
            </BlueButton>
          </div>
        </div>
      </BlueCard>
      <LanguageSwitch />
    </main>
  );
}
