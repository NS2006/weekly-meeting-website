import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { BlueAlert, BlueCard, BlueSkeleton } from '../../components/blue';
import { Paged } from '../../components/Paged';
import { ApiFailure } from '../../services/api';
import { relativeDay, todayWib } from '../../utils/dates';
import { errorLabel } from '../../utils/errorLabels';
import { useFilterParams } from '../../utils/useFilterParams';
import { PeriodProgress, PeriodStatusBadge, PeriodTile } from './PeriodParts';
import { capitalize, monthRange, periodFacts, periodNoun, periodPath } from './split';
import { useCurrentPeriods } from './usePeriods';

/** Teams a page (two rows of two on a wide screen). */
export const CURRENT_PERIODS_PER_PAGE = 4;

/**
 * Home: where each of my teams is in its year (owner, 2026-11-23): its current quarter (or other period), how far in,
 * and how many meetings and notes it holds so far; a click opens it. A period that starts within the next four weeks
 * shows too (owner, 2026-11-25: next month, for a team split into months), with when it starts. Periods with no
 * meetings are left out, and the card is hidden when none is left. Two to a row, four a page with pages above them
 * when there are more (owner, 2026-11-25; not below too, as four fit on one screen; the page is in the address as
 * ?quartersPage=N). A person is in a few teams, so all come at once and the page is cut here.
 */
export function CurrentPeriods() {
  const { t } = useTranslation();
  const current = useCurrentPeriods();
  const { get, update } = useFilterParams();
  const code = current.error instanceof ApiFailure ? current.error.code : current.error ? 'unknown_error' : null;
  const today = todayWib();
  const teams = (current.data?.teams ?? []).filter((t) => t.period.meetingCount + t.period.cancelledCount > 0);
  if (current.data && teams.length === 0) return null;

  // A page past the end (a team left since the link was made) shows the last one.
  const lastPage = Math.max(1, Math.ceil(teams.length / CURRENT_PERIODS_PER_PAGE));
  const page = Math.min(lastPage, Math.max(1, Number.parseInt(get('quartersPage'), 10) || 1));
  const shown = teams.slice((page - 1) * CURRENT_PERIODS_PER_PAGE, page * CURRENT_PERIODS_PER_PAGE);
  const goTo = (next: number) => update({ quartersPage: next > 1 ? String(next) : '' });

  // "This quarter", or "This quarter / month" when teams split their years differently (each card names its own);
  // "This and next month" once one that is still to come shows. Capitalized: in Indonesian the noun comes first
  // ("Kuartal ini").
  const noun = [...new Set(teams.map((team) => periodNoun(team.split.periodsPerYear)))].join(' / ');
  const title = capitalize(
    t(teams.some((team) => team.period.status === 'upcoming') ? 'periods.current.titleNext' : 'periods.current.title', { noun }),
  );

  return (
    <section className="current-periods-section">
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
          <div className="current-periods" aria-hidden="true">
            {[0, 1].map((i) => (
              <div key={i} className="current-period current-period--skeleton">
                <BlueSkeleton width={56} height={64} />
                <span className="current-period__text">
                  <BlueSkeleton width="45%" height={16} />
                  <BlueSkeleton width="80%" height={12} />
                </span>
              </div>
            ))}
          </div>
        ) : (
          <Paged
            current={page}
            total={teams.length}
            pageSize={CURRENT_PERIODS_PER_PAGE}
            label={t('periods.current.pages')}
            onChange={goTo}
            below={false}
          >
            <ul className="current-periods">
              {shown.map(({ teamId, teamName, period }) => (
                <li key={`${teamId}:${period.key}`}>
                  <Link to={periodPath(teamId, period.key)} className={`current-period current-period--${period.status}`}>
                    <PeriodTile label={period.label} status={period.status} />
                    <span className="current-period__text">
                      <span className="current-period__team">
                        {teamName}
                        {period.status === 'upcoming' ? <PeriodStatusBadge status="upcoming" /> : null}
                      </span>
                      <span className="muted small">
                        {/* A month's name already says its months (labels are the server's, in English: "Nov 2026"). */}
                        {monthRange(period.start, period.end, 'en') === period.label
                          ? `${period.label} · ${periodFacts(period)}`
                          : `${period.label} · ${monthRange(period.start, period.end)} · ${periodFacts(period)}`}
                      </span>
                      {period.status === 'upcoming' ? (
                        <span className="small muted">{t('periods.card.starts', { when: relativeDay(period.start, today).toLowerCase() })}</span>
                      ) : (
                        <PeriodProgress period={period} />
                      )}
                      <span className="current-period__go small">
                        {t('periods.current.open', { label: period.label })}
                        <span className="meeting-row__arrow" aria-hidden="true">
                          →
                        </span>
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Paged>
        )}
      </BlueCard>
    </section>
  );
}
