import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TeamDetail } from '@weekly-meeting/shared';
import { BlueAlert, BlueButton, BlueCard, BlueSkeleton } from '../../components/blue';
import { ApiFailure } from '../../services/api';
import { todayWib } from '../../utils/dates';
import { errorLabel } from '../../utils/errorLabels';
import { PeriodListDialog } from './PeriodListDialog';
import { PeriodCard } from './PeriodParts';
import { PeriodSettingsDialog } from './PeriodSettingsDialog';
import { capitalize, describeSplit, firstPeriods, periodGroups, periodNoun } from './split';
import { useTeamPeriods } from './usePeriods';

/**
 * The team page's quarters (owner, 2026-11-23): the team's year in periods, like the team's Word file that starts
 * anew each quarter. One card per period, each opening the period's page: only the current one and the next or the
 * one before (`firstPeriods`, owner 2026-11-25); "Show all" opens all of them in a dialog (`PeriodListDialog`:
 * current, upcoming, past newest first); the team leader changes how the year is split.
 */
export function PeriodStrip({ team }: { team: TeamDetail }) {
  const { t } = useTranslation();
  const periods = useTeamPeriods(team.id);
  const [listing, setListing] = useState(false);
  const [editing, setEditing] = useState(false);
  const headingId = useId();
  const today = todayWib();

  const canManage = team.myRole === 'leader' && team.archivedAt === null;
  const split = periods.data?.split ?? { periodsPerYear: team.periodsPerYear, yearStartMonth: team.yearStartMonth };
  const singular = periodNoun(split.periodsPerYear);
  const plural = periodNoun(split.periodsPerYear, true);
  const list = periods.data?.periods ?? [];
  const { shown } = firstPeriods(list, today);
  // What the dialog lists (a period more than four weeks away is left out).
  const groups = periodGroups(list, today);
  const listed = (groups.current ? 1 : 0) + groups.upcoming.length + groups.past.length;
  const code = periods.error instanceof ApiFailure ? periods.error.code : periods.error ? 'unknown_error' : null;

  return (
    <BlueCard
      header={
        <header className="blue-card__header row card-head">
          <span id={headingId}>{capitalize(plural)}</span>
          {canManage ? (
            <BlueButton variant="secondary" size="sm" onClick={() => setEditing(true)}>
              {t('periods.strip.change')}
            </BlueButton>
          ) : null}
        </header>
      }
    >
      <div className="stack period-strip">
        <p className="muted small">
          {t('periods.strip.about', { split: describeSplit(split), noun: singular })}
          {canManage ? '' : ` ${t('periods.strip.leaderSets')}`}
        </p>
        {code ? (
          <BlueAlert variant="error">{errorLabel(code)}</BlueAlert>
        ) : periods.isPending ? (
          <div className="period-grid" aria-hidden="true">
            {[0, 1].map((n) => (
              <div key={n} className="tile period-card">
                <BlueSkeleton width="50%" height={20} />
                <BlueSkeleton width="40%" height={12} />
                <BlueSkeleton width="70%" height={12} />
              </div>
            ))}
          </div>
        ) : (
          <ol className="period-grid tile-grid" aria-labelledby={headingId}>
            {shown.map((period) => (
              <li key={period.key}>
                <PeriodCard teamId={team.id} period={period} today={today} />
              </li>
            ))}
          </ol>
        )}
        {listed > shown.length ? (
          <button type="button" className="link-button small period-strip__more" aria-haspopup="dialog" onClick={() => setListing(true)}>
            {t('periods.strip.showAll', { total: listed, nouns: plural })}
          </button>
        ) : null}
      </div>
      {editing ? <PeriodSettingsDialog teamId={team.id} split={split} onClose={() => setEditing(false)} /> : null}
      {listing ? (
        <PeriodListDialog teamId={team.id} periods={list} nouns={plural} today={today} onClose={() => setListing(false)} />
      ) : null}
    </BlueCard>
  );
}
