import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { BlueAlert, BlueCard, BlueEmptyState } from '../../components/blue';
import { CalendarIcon } from '../../components/icons';
import { ApiFailure } from '../../services/api';
import { todayWib } from '../../utils/dates';
import { errorLabel } from '../../utils/errorLabels';
import { MeetingRow, MeetingRowsSkeleton } from './MeetingParts';
import { useMyUpcomingMeetings } from './useMeetings';
import './meetings.css';

/** Home: the next two weeks of meetings across all my teams. */
export function NextMeetings() {
  const { t } = useTranslation();
  const meetings = useMyUpcomingMeetings();
  const today = todayWib();
  const list = meetings.data?.meetings ?? [];
  const code = meetings.error instanceof ApiFailure ? meetings.error.code : meetings.error ? 'unknown_error' : null;

  return (
    <BlueCard
      header={
        <header className="blue-card__header row card-head">
          <span>{t('meetings.next.title')}</span>
        </header>
      }
    >
      {code ? (
        <BlueAlert variant="error">{errorLabel(code)}</BlueAlert>
      ) : meetings.isPending ? (
        <MeetingRowsSkeleton rows={2} />
      ) : list.length === 0 ? (
        <BlueEmptyState icon={<CalendarIcon size={26} />} title={t('meetings.next.empty')}>
          <Trans i18nKey="meetings.next.emptyBody" components={{ teams: <Link to="/teams" /> }} />
        </BlueEmptyState>
      ) : (
        <>
          <ul className="meeting-list">
            {list.map((m) => (
              <MeetingRow key={m.id} meeting={m} today={today} showTeam />
            ))}
          </ul>
          {meetings.data?.hasMore ? (
            <p className="muted small meeting-list__foot">{t('meetings.next.more')}</p>
          ) : null}
        </>
      )}
    </BlueCard>
  );
}
