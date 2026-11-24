import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { PeriodDetail } from '@weekly-meeting/shared';
import { Link, useLocation, useSearchParams } from 'react-router';
import { BlueCard, BlueEmptyState, BlueTabs, tabPanelProps } from '../../components/blue';
import { CalendarIcon } from '../../components/icons';
import { formatFullDay, relativeDay, todayWib } from '../../utils/dates';
import { groupByMonth, type MeetingGroup } from '../meetings/grouping';
import { MeetingRow } from '../meetings/MeetingParts';
import { arrangeMeetings, monthsOf } from './meetingOrder';
import { ProjectBoard } from '../team-projects/ProjectBoard';
import { PeriodProgress, PeriodStatusBadge, PeriodTile, type PeriodTab } from './PeriodParts';
import { PeriodReader } from './PeriodReader';
import { dayRange, describeSplit, periodNoun } from './split';
import '../meetings/meetings.css';

/**
 * One period of a team (a quarter by default), like that quarter's Word file: when it runs and whether it is the
 * current one, then its meetings, all its notes to read from top to bottom, or its projects as a board (owner,
 * 2026-11-24: per period, not per team). An ended period stays open: notes can still be shared on its meetings.
 */
export function PeriodDetailView({ period, tab, onTab }: { period: PeriodDetail; tab: PeriodTab; onTab: (tab: PeriodTab) => void }) {
  const { t } = useTranslation();
  const today = todayWib();
  const singular = periodNoun(period.split.periodsPerYear);
  const tabsId = `period-${period.key}`;

  return (
    <div className="stack">
      <div className="period-head">
        <PeriodTile label={period.label} status={period.status} />
        <div className="period-head__text">
          <h1 className="page-head__title">{period.label}</h1>
          <span className="period-head__meta muted">
            {dayRange(period.start, period.end)}
            <PeriodStatusBadge status={period.status} />
          </span>
          <span className="period-head__meta muted small">
            <Link to={`/teams/${period.teamId}`}>{period.teamName}</Link>
            <span aria-hidden="true">·</span>
            <span>{describeSplit(period.split)}</span>
          </span>
        </div>
      </div>

      {period.status === 'current' ? (
        <div className="period-state">
          <PeriodProgress period={period} />
          <span className="period-state__text">{t('periods.detail.runsUntil', { date: formatFullDay(period.end) })}</span>
        </div>
      ) : period.status === 'ended' ? (
        <p className="period-state period-state__text">
          {t('periods.detail.endedOn', { date: formatFullDay(period.end) })}{' '}
          {period.teamArchived ? t('periods.detail.readOnly') : t('periods.detail.staysOpen')}
        </p>
      ) : (
        <p className="period-state period-state__text">
          {t('periods.detail.startsOn', { date: formatFullDay(period.start), when: relativeDay(period.start, today).toLowerCase() })}
        </p>
      )}

      <BlueTabs
        label={t('periods.detail.sections', { label: period.label })}
        idPrefix={tabsId}
        value={tab}
        onChange={onTab}
        tabs={[
          { id: 'meetings', label: t('periods.detail.meetingsTab', { total: period.meetings.length }) },
          { id: 'read', label: t('periods.detail.readTab') },
          { id: 'projects', label: t('periods.detail.projectsTab') },
        ]}
      />

      {tab === 'meetings' ? (
        <div {...tabPanelProps(tabsId, 'meetings')}>
          <PeriodMeetings period={period} today={today} />
        </div>
      ) : tab === 'read' ? (
        <div {...tabPanelProps(tabsId, 'read')}>
          <PeriodReader period={period} />
        </div>
      ) : (
        <div {...tabPanelProps(tabsId, 'projects')}>
          <ProjectBoard period={period} />
        </div>
      )}
    </div>
  );
}

/** The period's meetings by month, first to last, each with how many notes it has. */
function PeriodMeetings({ period, today }: { period: PeriodDetail; today: string }) {
  const { t } = useTranslation();
  const location = useLocation();
  const from = { path: `${location.pathname}${location.search}`, label: period.label };

  if (period.meetings.length === 0) {
    return (
      <BlueCard>
        <BlueEmptyState
          icon={<CalendarIcon size={26} />}
          title={t(period.status === 'ended' ? 'periods.detail.noMeetings' : 'periods.detail.noMeetingsYet', { label: period.label })}
        >
          {period.status === 'ended'
            ? t('periods.detail.hadNone', { range: dayRange(period.start, period.end) })
            : period.status === 'upcoming'
              ? t('periods.detail.appearAhead', { label: period.label })
              : t('periods.detail.noSchedule')}
        </BlueEmptyState>
      </BlueCard>
    );
  }
  return <ArrangedMeetings period={period} today={today} from={from} />;
}

/**
 * The meetings by month, oldest first, with a pick of one month when there are several. The month is in the address,
 * so Back and a shared link keep it.
 */
function ArrangedMeetings({ period, today, from }: { period: PeriodDetail; today: string; from: { path: string; label: string } }) {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const months = monthsOf(period.meetings);
  const wanted = params.get('month');
  const month = months.some((m) => m.key === wanted) ? wanted : null;
  const shown = arrangeMeetings(period.meetings, month);
  const pick = (value: string | null) =>
    setParams(
      (current) => {
        const updated = new URLSearchParams(current);
        if (value) updated.set('month', value);
        else updated.delete('month');
        return updated;
      },
      { replace: true },
    );

  return (
    <BlueCard
      header={
        <header className="blue-card__header period-meetings__head">
          {months.length > 1 ? (
            <div className="period-choice" role="group" aria-label={t('periods.detail.showMonth')}>
              <button type="button" className="period-choice__item" aria-pressed={month === null} onClick={() => pick(null)}>
                {t('periods.detail.all')} <span className="period-choice__count">{period.meetings.length}</span>
              </button>
              {months.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  className="period-choice__item"
                  aria-pressed={month === m.key}
                  onClick={() => pick(m.key)}
                >
                  {m.label} <span className="period-choice__count">{m.count}</span>
                </button>
              ))}
            </div>
          ) : (
            <span>{t('periods.detail.meetings')}</span>
          )}
        </header>
      }
    >
      <div className="stack">
        {groupByMonth(shown).map((group) => (
          <MonthOfMeetings key={group.key} group={group} today={today} from={from} />
        ))}
      </div>
    </BlueCard>
  );
}

function MonthOfMeetings({ group, today, from }: { group: MeetingGroup; today: string; from: { path: string; label: string } }) {
  const headingId = useId();
  return (
    <section className="meeting-section" aria-labelledby={headingId}>
      <h2 className="meeting-section__title" id={headingId}>
        {group.label}
        <span className="meeting-section__count">{group.meetings.length}</span>
      </h2>
      <ul className="meeting-list">
        {group.meetings.map((m) => (
          <MeetingRow key={m.id} meeting={m} today={today} showNotes from={from} />
        ))}
      </ul>
    </section>
  );
}
