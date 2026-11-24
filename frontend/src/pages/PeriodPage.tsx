import type { Me } from '@weekly-meeting/shared';
import { Trans, useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router';
import { BlueCard, BlueEmptyState, BlueSkeleton } from '../components/blue';
import { PeriodDetailView } from '../features/periods/PeriodDetailView';
import { PeriodSwitcher, parsePeriodTab } from '../features/periods/PeriodParts';
import { usePeriod } from '../features/periods/usePeriods';
import { AppLayout } from '../layouts/AppLayout';
import { ApiFailure } from '../services/api';
import { errorLabel } from '../utils/errorLabels';
import '../features/teams/teams.css';

/** One period of a team (a quarter by default): its meetings, or all its notes to read (team members only). */
export function PeriodPage({ user }: { user: Me }) {
  const { t } = useTranslation();
  const { id = '', key = '' } = useParams();
  const period = usePeriod(id, key);
  const code = period.error instanceof ApiFailure ? period.error.code : period.error ? 'unknown_error' : null;
  // A period that no longer exists (the leader changed the split, or an old or broken link) is gone, even when an
  // earlier copy of it is still at hand; another error keeps what is on screen.
  const gone = code === 'not_found' || code === 'validation_failed';
  const data = gone ? undefined : period.data?.period;
  // The open tab lives in the address (?tab=read, ?tab=projects), so reload, Back and a shared link keep it.
  const [params, setParams] = useSearchParams();
  const tab = parsePeriodTab(params.get('tab'));

  return (
    <AppLayout user={user}>
      <div className="meeting-topbar">
        <Link to={`/teams/${encodeURIComponent(id)}`} className="back-link">
          <span className="back-link__arrow" aria-hidden="true">
            ←
          </span>
          {data ? data.teamName : t('periods.page.team')}
        </Link>
        {data ? <PeriodSwitcher period={data} tab={tab} /> : null}
      </div>
      {period.isPending ? (
        <div className="stack" role="status">
          <span className="visually-hidden">{t('periods.page.loading')}</span>
          <div className="period-head" aria-hidden="true">
            <BlueSkeleton width={64} height={72} />
            <div className="period-head__text">
              <BlueSkeleton width={160} height={26} />
              <BlueSkeleton width={220} height={14} />
            </div>
          </div>
        </div>
      ) : data ? (
        // Keyed by team and period, so another one starts with nothing left over from the last one. While the next
        // one loads, this one stays, faded.
        <div className={period.isPlaceholderData ? 'is-refreshing' : undefined}>
          <PeriodDetailView
            key={`${data.teamId}:${data.key}`}
            period={data}
            tab={tab}
            onTab={(next) =>
              setParams(
                (current) => {
                  const updated = new URLSearchParams(current);
                  if (next === 'meetings') updated.delete('tab');
                  else updated.set('tab', next);
                  return updated;
                },
                { replace: true },
              )
            }
          />
        </div>
      ) : (
        <BlueCard>
          <BlueEmptyState title={gone ? t('periods.page.goneTitle') : t('periods.page.failedTitle')}>
            {gone ? (
              <Trans i18nKey="periods.page.goneBody" components={{ team: <Link to={`/teams/${encodeURIComponent(id)}`} /> }} />
            ) : (
              errorLabel(code ?? '')
            )}
          </BlueEmptyState>
        </BlueCard>
      )}
    </AppLayout>
  );
}
