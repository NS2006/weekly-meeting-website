import type { Me } from '@weekly-meeting/shared';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useParams } from 'react-router';
import { BlueCard, BlueEmptyState, BlueSkeleton } from '../components/blue';
import { backLinkFrom } from '../features/meetings/backLink';
import { MeetingDetailView } from '../features/meetings/MeetingDetailView';
import { MeetingSwitcher } from '../features/meetings/MeetingParts';
import { useMeeting } from '../features/meetings/useMeetings';
import { AppLayout } from '../layouts/AppLayout';
import { ApiFailure } from '../services/api';
import { errorLabel } from '../utils/errorLabels';
import '../features/teams/teams.css';

/** One meeting of a team (members read it; the leader titles, moves, cancels or reopens it). */
export function MeetingPage({ user }: { user: Me }) {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const meeting = useMeeting(id);
  const code = meeting.error instanceof ApiFailure ? meeting.error.code : meeting.error ? 'unknown_error' : null;
  const data = meeting.data?.meeting;
  const location = useLocation();
  // Where the back link returns: a team's period page, when the meeting was opened from there; else its team.
  const back = backLinkFrom(location.state);

  return (
    <AppLayout user={user}>
      <div className="meeting-topbar">
        <Link
          to={back?.to ?? (data ? `/teams/${data.teamId}` : '/')}
          className="back-link"
        >
          <span className="back-link__arrow" aria-hidden="true">
            ←
          </span>
          {back ? back.label : data ? data.teamName : t('meetings.page.home')}
        </Link>
        {data ? <MeetingSwitcher meeting={data} state={location.state} /> : null}
      </div>
      {meeting.isPending ? (
        <div className="stack" role="status">
          <span className="visually-hidden">{t('meetings.page.loading')}</span>
          <div className="meeting-head" aria-hidden="true">
            <BlueSkeleton width={64} height={72} />
            <div className="team-head__text">
              <BlueSkeleton width={220} height={26} />
              <BlueSkeleton width={180} height={14} />
            </div>
          </div>
        </div>
      ) : data ? (
        // Keyed by meeting, so going to the previous or next one starts fresh (no notice or dialog from the last one).
        // While the next one loads, this one stays, faded.
        <div className={meeting.isPlaceholderData ? 'is-refreshing' : undefined}>
          <MeetingDetailView key={data.id} meeting={data} />
        </div>
      ) : (
        <BlueCard>
          <BlueEmptyState title={code === 'not_found' ? t('meetings.page.notFound') : t('meetings.page.failed')}>
            {code === 'not_found' ? t('meetings.page.notFoundBody') : errorLabel(code ?? '')}
          </BlueEmptyState>
        </BlueCard>
      )}
    </AppLayout>
  );
}
