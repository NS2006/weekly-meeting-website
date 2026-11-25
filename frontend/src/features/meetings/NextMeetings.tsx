import { useEffect, useRef } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { BlueAlert, BlueButton, BlueCard, BlueEmptyState } from '../../components/blue';
import { CalendarIcon } from '../../components/icons';
import { Paged } from '../../components/Paged';
import { ApiFailure } from '../../services/api';
import { todayWib } from '../../utils/dates';
import { errorLabel } from '../../utils/errorLabels';
import { useFilterParams } from '../../utils/useFilterParams';
import { MeetingRow, MeetingRowsSkeleton } from './MeetingParts';
import { useMyUpcomingMeetings } from './useMeetings';
import './meetings.css';

/** How many of the next meetings Home shows first, and how many a page holds once all are open. */
export const NEXT_MEETINGS_FIRST = 5;
export const NEXT_MEETINGS_PER_PAGE = 10;

/**
 * Home: my teams' next meetings (owner, 2026-11-25). The first five, soonest first and, on one day, my starred teams
 * first; "Show all" opens every meeting of the next four weeks, ten a page with pages above and below (from the
 * server). Open or not, and the page, live in
 * the address (?meetings=all&meetingsPage=2), so Back and reload keep them.
 */
export function NextMeetings() {
  const { t } = useTranslation();
  const { get, update } = useFilterParams();
  const expanded = get('meetings') === 'all';
  const page = expanded ? Math.max(1, Number.parseInt(get('meetingsPage'), 10) || 1) : 1;
  const meetings = useMyUpcomingMeetings(
    expanded ? { offset: (page - 1) * NEXT_MEETINGS_PER_PAGE, limit: NEXT_MEETINGS_PER_PAGE } : { offset: 0, limit: NEXT_MEETINGS_FIRST },
  );
  const today = todayWib();
  const top = useRef<HTMLElement>(null);
  const list = meetings.data?.meetings ?? [];
  const total = meetings.data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / NEXT_MEETINGS_PER_PAGE));
  const code = meetings.error instanceof ApiFailure ? meetings.error.code : meetings.error ? 'unknown_error' : null;

  // A page past the end (meetings have passed since the link was made) goes to the last page there is.
  useEffect(() => {
    if (expanded && meetings.data && !meetings.isPlaceholderData && page > lastPage) {
      update({ meetingsPage: lastPage > 1 ? String(lastPage) : '' });
    }
  }, [expanded, meetings.data, meetings.isPlaceholderData, page, lastPage, update]);

  const goTo = (next: number) => {
    update({ meetingsPage: next > 1 ? String(next) : '' });
    // From the pages below the list, back to its top.
    if ((top.current?.getBoundingClientRect().top ?? 0) < 0) top.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };
  const showAll = () => update({ meetings: 'all', meetingsPage: '' });
  const showFewer = () => update({ meetings: '', meetingsPage: '' });

  const rows = (
    <ul className="meeting-list">
      {list.map((m) => (
        <MeetingRow key={m.id} meeting={m} today={today} showTeam />
      ))}
    </ul>
  );

  return (
    <section ref={top} className="next-meetings">
      <BlueCard
        header={
          <header className="blue-card__header row card-head">
            <span>{t('meetings.next.title')}</span>
            {expanded ? (
              <BlueButton variant="ghost" size="sm" onClick={showFewer}>
                {t('meetings.next.showFewer')}
              </BlueButton>
            ) : null}
          </header>
        }
      >
        {code ? (
          <BlueAlert variant="error">{errorLabel(code)}</BlueAlert>
        ) : meetings.isPending ? (
          <MeetingRowsSkeleton rows={NEXT_MEETINGS_FIRST} />
        ) : total === 0 ? (
          <BlueEmptyState icon={<CalendarIcon size={26} />} title={t('meetings.next.empty')}>
            <Trans i18nKey="meetings.next.emptyBody" components={{ teams: <Link to="/teams" /> }} />
          </BlueEmptyState>
        ) : expanded ? (
          <Paged
            current={page}
            total={total}
            pageSize={NEXT_MEETINGS_PER_PAGE}
            label={t('meetings.next.pages')}
            disabled={meetings.isPlaceholderData}
            onChange={goTo}
            head={
              <span className="muted small" role="status">
                {t('meetings.next.range', {
                  from: Math.min(total, (page - 1) * NEXT_MEETINGS_PER_PAGE + 1),
                  to: Math.min(total, page * NEXT_MEETINGS_PER_PAGE),
                  count: total,
                })}
              </span>
            }
          >
            <div className={meetings.isPlaceholderData ? 'is-refreshing' : undefined}>{rows}</div>
          </Paged>
        ) : (
          <>
            {rows}
            {total > NEXT_MEETINGS_FIRST ? (
              <div className="meeting-list__foot">
                <BlueButton variant="secondary" size="sm" onClick={showAll}>
                  {t('meetings.next.showAll', { count: total })}
                </BlueButton>
              </div>
            ) : null}
          </>
        )}
      </BlueCard>
    </section>
  );
}
