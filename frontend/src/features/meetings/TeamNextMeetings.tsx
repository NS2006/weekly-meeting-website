import type { TeamDetail } from '@weekly-meeting/shared';
import { useTranslation } from 'react-i18next';
import { BlueAlert, BlueCard } from '../../components/blue';
import { ApiFailure } from '../../services/api';
import { todayWib } from '../../utils/dates';
import { errorLabel } from '../../utils/errorLabels';
import { MeetingRow, MeetingRowsSkeleton } from './MeetingParts';
import { useTeamNextMeetings } from './useMeetings';

/** How many of the team's next meetings the team page shows (owner, 2026-11-25). */
export const TEAM_NEXT_MEETINGS = 3;

/**
 * The team page's next meetings, above its quarters (owner, 2026-11-25): the first three from today on, each opening
 * its meeting page (whose back link returns here). The rest are on their quarter's page.
 */
export function TeamNextMeetings({ team }: { team: TeamDetail }) {
  const { t } = useTranslation();
  const next = useTeamNextMeetings(team.id, TEAM_NEXT_MEETINGS, true);
  const today = todayWib();
  const list = next.data?.meetings ?? [];
  const failed = next.error instanceof ApiFailure ? next.error.code : next.error ? 'unknown_error' : null;
  const from = { path: `/teams/${team.id}`, label: team.name };

  return (
    <BlueCard title={t('meetings.teamNext.title')}>
      {next.isPending ? (
        <div role="status" aria-label={t('meetings.teamNext.loading')}>
          <MeetingRowsSkeleton rows={TEAM_NEXT_MEETINGS} />
        </div>
      ) : failed ? (
        <BlueAlert variant="error">{errorLabel(failed)}</BlueAlert>
      ) : list.length === 0 ? (
        <p className="muted">{t('meetings.teamNext.empty')}</p>
      ) : (
        <>
          <ul className="meeting-list">
            {list.map((meeting) => (
              <MeetingRow key={meeting.id} meeting={meeting} today={today} showNotes from={from} />
            ))}
          </ul>
          {next.data?.hasMore ? <p className="muted small team-next__more">{t('meetings.teamNext.more')}</p> : null}
        </>
      )}
    </BlueCard>
  );
}
