import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TeamDetail } from '@weekly-meeting/shared';
import { BlueAlert, BlueButton, BlueCard, BlueSkeleton } from '../../components/blue';
import { ApiFailure } from '../../services/api';
import { todayWib } from '../../utils/dates';
import { errorLabel } from '../../utils/errorLabels';
import { PeriodCard } from './PeriodParts';
import { PeriodSettingsDialog } from './PeriodSettingsDialog';
import { capitalize, describeSplit, periodNoun, recentPeriods } from './split';
import { useTeamPeriods } from './usePeriods';

/**
 * The team page's quarters (owner, 2026-11-23): the team's year in periods, like the team's Word file that starts
 * anew each quarter. One card per period (the recent ones first shown, the rest behind "Show all"), each opening the
 * period's page; the team leader changes how the year is split.
 */
export function PeriodStrip({ team }: { team: TeamDetail }) {
  const { t } = useTranslation();
  const periods = useTeamPeriods(team.id);
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState(false);
  const headingId = useId();
  const today = todayWib();

  const canManage = team.myRole === 'leader' && team.archivedAt === null;
  const split = periods.data?.split ?? { periodsPerYear: team.periodsPerYear, yearStartMonth: team.yearStartMonth };
  const singular = periodNoun(split.periodsPerYear);
  const plural = periodNoun(split.periodsPerYear, true);
  const list = periods.data?.periods ?? [];
  const { shown } = showAll ? { shown: list } : recentPeriods(list);
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
            {[0, 1, 2].map((n) => (
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
        {list.length > shown.length || showAll ? (
          <button type="button" className="link-button small period-strip__more" onClick={() => setShowAll((all) => !all)}>
            {showAll ? t('periods.strip.showRecent', { nouns: plural }) : t('periods.strip.showAll', { total: list.length, nouns: plural })}
          </button>
        ) : null}
      </div>
      {editing ? <PeriodSettingsDialog teamId={team.id} split={split} onClose={() => setEditing(false)} /> : null}
    </BlueCard>
  );
}
