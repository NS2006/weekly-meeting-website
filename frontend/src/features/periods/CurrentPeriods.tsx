import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { BlueAlert, BlueCard, BlueSkeleton } from '../../components/blue';
import { ApiFailure } from '../../services/api';
import { errorLabel } from '../../utils/errorLabels';
import { PeriodProgress, PeriodTile } from './PeriodParts';
import { capitalize, monthRange, periodFacts, periodNoun, periodPath } from './split';
import { useCurrentPeriods } from './usePeriods';

/**
 * Home: where each of my teams is in its year (owner, 2026-11-23): its current quarter (or other period), how far in,
 * and how many meetings and notes it holds so far; a click opens it. Teams that have no meetings are left out, and
 * the card is hidden when none is left.
 */
export function CurrentPeriods() {
  const { t } = useTranslation();
  const current = useCurrentPeriods();
  const code = current.error instanceof ApiFailure ? current.error.code : current.error ? 'unknown_error' : null;
  const teams = (current.data?.teams ?? []).filter((t) => t.period.meetingCount + t.period.cancelledCount > 0);
  if (current.data && teams.length === 0) return null;

  // "This quarter", or "This quarter / month" when teams split their years differently (each row names its own).
  // Capitalized: in Indonesian the noun comes first ("Kuartal ini").
  const title = capitalize(
    t('periods.current.title', { noun: [...new Set(teams.map((team) => periodNoun(team.split.periodsPerYear)))].join(' / ') }),
  );

  return (
    <BlueCard
      header={
        <header className="blue-card__header row card-head">
          <span>{current.data ? title : capitalize(t('periods.current.title', { noun: periodNoun(4) }))}</span>
        </header>
      }
    >
      {code ? (
        <BlueAlert variant="error">{errorLabel(code)}</BlueAlert>
      ) : !current.data ? (
        <div className="current-period current-period--skeleton" aria-hidden="true">
          <BlueSkeleton width={64} height={72} />
          <span className="current-period__text">
            <BlueSkeleton width="35%" height={16} />
            <BlueSkeleton width="60%" height={12} />
          </span>
        </div>
      ) : (
        <ul className="current-periods">
          {teams.map(({ teamId, teamName, period }) => (
            <li key={teamId}>
              <Link to={periodPath(teamId, period.key)} className="current-period">
                <PeriodTile label={period.label} status="current" />
                <span className="current-period__text">
                  <span className="current-period__team">{teamName}</span>
                  <span className="muted small">
                    {period.label} · {monthRange(period.start, period.end)} · {periodFacts(period)}
                  </span>
                  <PeriodProgress period={period} />
                </span>
                <span className="current-period__go small">
                  {t('periods.current.open', { label: period.label })}
                  <span className="meeting-row__arrow" aria-hidden="true">
                    →
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </BlueCard>
  );
}
