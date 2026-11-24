import type { PeriodDetail, PeriodRef, PeriodStatus, PeriodSummary } from '@weekly-meeting/shared';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { BlueBadge, BlueButton, BlueSelect } from '../../components/blue';
import { useJumpSelect } from '../../hooks/useJumpSelect';
import { relativeDay } from '../../utils/dates';
import { capitalize, labelParts, monthRange, periodFacts, periodNoun, periodPath, progressOf } from './split';
import { useTeamPeriods } from './usePeriods';
import './periods.css';

/** Current (with a dot), Ended or Upcoming. */
export function PeriodStatusBadge({ status }: { status: PeriodStatus }) {
  const { t } = useTranslation();
  return (
    <BlueBadge variant={status === 'current' ? 'info' : 'default'} dot={status === 'current'}>
      {t(`periods.status.${status}`)}
    </BlueBadge>
  );
}

/** "Q4" over "2026", like the date tile of a meeting: filled for the current period, dashed for one to come. */
export function PeriodTile({ label, status }: { label: string; status: PeriodStatus }) {
  const { main, year } = labelParts(label);
  return (
    <span className={`period-tile period-tile--${status}${main.length > 3 ? ' period-tile--long' : ''}`} aria-hidden="true">
      <span className="period-tile__main">{main}</span>
      {year ? <span className="period-tile__year">{year}</span> : null}
    </span>
  );
}

/** How far into the current period today is, as a bar and "Day 55 of 92 · 37 days left". */
export function PeriodProgress({ period }: { period: Pick<PeriodSummary, 'label' | 'days' | 'daysPassed'> }) {
  const { t } = useTranslation();
  const { percent, text } = progressOf(period);
  return (
    <span className="period-progress">
      <span
        className="period-progress__bar"
        role="progressbar"
        aria-label={t('periods.progress.label', { label: period.label })}
        aria-valuemin={0}
        aria-valuemax={period.days}
        aria-valuenow={period.daysPassed}
        aria-valuetext={text}
      >
        <span className="period-progress__done" style={{ width: `${percent}%` }} />
      </span>
      <span className="period-progress__text" aria-hidden="true">
        {text}
      </span>
    </span>
  );
}

/**
 * One period as a card that opens its page: its name and months, whether it is the current one (with how far in), has
 * ended or is still to come, and how many meetings and notes it holds.
 */
export function PeriodCard({ teamId, period, today }: { teamId: string; period: PeriodSummary; today: string }) {
  const { t } = useTranslation();
  const classes = ['tile', 'tile--link', 'period-card', `period-card--${period.status}`, period.status === 'upcoming' ? 'tile--dashed' : ''];
  return (
    <Link to={periodPath(teamId, period.key)} className={classes.filter(Boolean).join(' ')}>
      <span className="period-card__top">
        <span className="period-card__label">{period.label}</span>
        <PeriodStatusBadge status={period.status} />
      </span>
      {/* A month's name already says its months (labels are the server's, in English: "Aug 2026"). */}
      {monthRange(period.start, period.end, 'en') !== period.label ? <span className="muted small">{monthRange(period.start, period.end)}</span> : null}
      {period.status === 'current' ? (
        <PeriodProgress period={period} />
      ) : period.status === 'upcoming' ? (
        <span className="small muted">{t('periods.card.starts', { when: relativeDay(period.start, today).toLowerCase() })}</span>
      ) : null}
      <span className="period-card__facts small">{periodFacts(period)}</span>
      <span className="tile__foot small period-card__foot">
        {t('periods.card.open')}
        <span className="tile__arrow" aria-hidden="true">
          →
        </span>
      </span>
    </Link>
  );
}

/**
 * Going from period to period of the team without its page: "← Q3 2026", a list of all of them (this one selected),
 * and "Q1 2027 →". The open tab (meetings, reading the whole period, or the projects board with its grouping and
 * order) stays open.
 */
export function PeriodSwitcher({ period, tab }: { period: PeriodDetail; tab: PeriodTab }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const all = useTeamPeriods(period.teamId);
  const noun = periodNoun(period.split.periodsPerYear);
  const search = periodTabSearch(tab, params);
  const listed = all.data?.periods ?? [];
  // A period outside the team's list (an old link) is still shown as the one selected.
  const options = (listed.some((p) => p.key === period.key) ? listed : [...listed, period].sort((a, b) => a.start.localeCompare(b.start))).map(
    (p) => ({ value: p.key, label: p.status === 'current' ? t('periods.switcher.currentOption', { label: p.label }) : p.label }),
  );
  const jump = useJumpSelect(period.key, (key) => void navigate(`${periodPath(period.teamId, key)}${search}`));

  const step = (to: PeriodRef | null, direction: 'previous' | 'next') => {
    // On a phone only the arrows show (the names stay for screen readers), so the list keeps its room.
    const text =
      direction === 'previous' ? (
        <>
          ←<span className="meeting-switcher__word"> {to ? to.label : t('periods.switcher.previous')}</span>
        </>
      ) : (
        <>
          <span className="meeting-switcher__word">{to ? to.label : t('periods.switcher.next')} </span>→
        </>
      );
    if (!to) {
      return (
        <BlueButton
          variant="secondary"
          size="sm"
          disabled
          aria-label={t(direction === 'previous' ? 'periods.switcher.noPrevious' : 'periods.switcher.noNext', { noun })}
        >
          {text}
        </BlueButton>
      );
    }
    return (
      <Link
        to={`${periodPath(period.teamId, to.key)}${search}`}
        className="blue-button blue-button--secondary blue-button--sm"
        // Capitalized: in Indonesian the noun comes first ("Kuartal sebelumnya: Q3 2026").
        aria-label={capitalize(t(direction === 'previous' ? 'periods.switcher.toPrevious' : 'periods.switcher.toNext', { noun, label: to.label }))}
      >
        {text}
      </Link>
    );
  };

  return (
    <nav className="meeting-switcher" aria-label={capitalize(t('periods.switcher.nav', { nouns: periodNoun(period.split.periodsPerYear, true) }))}>
      {step(period.previous, 'previous')}
      <BlueSelect
        size="sm"
        className="meeting-switcher__jump"
        ariaLabel={t('periods.switcher.jump', { noun })}
        options={options}
        {...jump}
      />
      {step(period.next, 'next')}
    </nav>
  );
}

/** The tabs of a period's page. */
export type PeriodTab = 'meetings' | 'read' | 'projects';

export const parsePeriodTab = (value: string | null): PeriodTab => (value === 'read' || value === 'projects' ? value : 'meetings');

/** The address of the same tab in another period: the board keeps its grouping and order (its people and cards are this period's). */
export function periodTabSearch(tab: PeriodTab, params: URLSearchParams): string {
  if (tab === 'meetings') return '';
  const next = new URLSearchParams({ tab });
  if (tab === 'projects') {
    for (const name of ['group', 'sort']) {
      const value = params.get(name);
      if (value) next.set(name, value);
    }
  }
  return `?${next.toString()}`;
}
