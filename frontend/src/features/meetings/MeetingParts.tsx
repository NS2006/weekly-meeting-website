import type { MeetingDetail, MeetingNeighbour, MeetingView } from '@weekly-meeting/shared';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { BlueBadge, BlueButton, BlueSelect, BlueSkeleton } from '../../components/blue';
import { useJumpSelect } from '../../hooks/useJumpSelect';
import { currentLanguage, type Language } from '../../i18n/language';
import { fill, messages } from '../../i18n/messages';
import { dateParts, formatDay, formatFullDay, relativeDay, todayWib } from '../../utils/dates';
import { cancelReason, meetingName } from './meetingName';
import { notesCount, scheduleOptionLabel } from './switcher';
import { useMeetingSchedule } from './useMeetings';
import './meetings.css';

/** A small calendar page: weekday, day, month. Today's is filled with the brand color. */
export function DateTile({ date, today, size = 'md' }: { date: string; today: string; size?: 'md' | 'lg' }) {
  const { weekday, day, month } = dateParts(date);
  const classes = ['date-tile', `date-tile--${size}`, date === today ? 'date-tile--today' : '', date < today ? 'date-tile--past' : ''];
  return (
    <span className={classes.filter(Boolean).join(' ')} aria-hidden="true">
      <span className="date-tile__weekday">{weekday}</span>
      <span className="date-tile__day">{day}</span>
      <span className="date-tile__month">{month}</span>
    </span>
  );
}

/**
 * Going from meeting to meeting of a schedule without the list (owner, 2026-11-23): "← Previous", a "jump to" list of
 * the schedule's meetings (this one selected; each with its notes, or cancelled), and "Next →". `state` is passed on,
 * so the page's back link keeps pointing where it pointed.
 */
export function MeetingSwitcher({
  meeting,
  state,
}: {
  meeting: Pick<MeetingDetail, 'id' | 'date' | 'previous' | 'next'>;
  state: unknown;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const schedule = useMeetingSchedule(meeting.id);
  const today = todayWib();
  const options = schedule.data?.meetings.map((m) => ({ value: m.id, label: scheduleOptionLabel(m, today) })) ?? [
    { value: meeting.id, label: formatDay(meeting.date) },
  ];
  const jump = useJumpSelect(meeting.id, (id) => void navigate(`/meetings/${id}`, { state }));

  const step = (neighbour: MeetingNeighbour | null, direction: 'previous' | 'next') => {
    // On a phone only the arrows show (the words stay for screen readers), so the list keeps its room.
    const text =
      direction === 'previous' ? (
        <>
          ←<span className="meeting-switcher__word"> {t('meetings.switcher.previous')}</span>
        </>
      ) : (
        <>
          <span className="meeting-switcher__word">{t('meetings.switcher.next')} </span>→
        </>
      );
    if (!neighbour) {
      return (
        <BlueButton variant="secondary" size="sm" disabled>
          {text}
        </BlueButton>
      );
    }
    const day = formatFullDay(neighbour.date);
    const when = neighbour.status === 'cancelled' ? t('meetings.switcher.whenCancelled', { date: day }) : day;
    return (
      <Link
        to={`/meetings/${neighbour.id}`}
        state={state}
        className="blue-button blue-button--secondary blue-button--sm"
        aria-label={t(direction === 'previous' ? 'meetings.switcher.previousMeeting' : 'meetings.switcher.nextMeeting', { when })}
        title={when}
      >
        {text}
      </Link>
    );
  };

  return (
    <nav className="meeting-switcher" aria-label={t('meetings.switcher.label')}>
      {step(meeting.previous, 'previous')}
      <BlueSelect
        size="sm"
        className="meeting-switcher__jump"
        ariaLabel={t('meetings.switcher.jump')}
        options={options}
        {...jump}
      />
      {step(meeting.next, 'next')}
    </nav>
  );
}

/** Cancelled, Today, Done, or how far away it is ("In 3 days"). */
export function MeetingStatusBadge({ meeting, today }: { meeting: Pick<MeetingView, 'date' | 'status'>; today: string }) {
  const { t } = useTranslation();
  if (meeting.status === 'cancelled') return <BlueBadge variant="error">{t('meetings.status.cancelled')}</BlueBadge>;
  if (meeting.date === today) {
    return (
      <BlueBadge variant="info" dot>
        {t('meetings.status.today')}
      </BlueBadge>
    );
  }
  if (meeting.status === 'done') return <BlueBadge>{t('meetings.status.done')}</BlueBadge>;
  return <span className="muted small nowrap">{relativeDay(meeting.date, today)}</span>;
}

/** "Moved from Wed 25 Nov" when the leader moved it off its scheduled day. */
export function movedFrom(meeting: Pick<MeetingView, 'date' | 'scheduledDate'>, language: Language = currentLanguage()): string | null {
  if (meeting.date === meeting.scheduledDate) return null;
  return fill(messages(language).meetings.row.movedFrom, { date: formatDay(meeting.scheduledDate, language) });
}

/** "3 notes", "1 note", "No notes yet" (or "No notes" once its day has passed). */
export function noteCountLabel(
  meeting: Pick<MeetingView, 'date' | 'noteCount'>,
  today: string,
  language: Language = currentLanguage(),
): string {
  const words = messages(language).meetings.row;
  if (meeting.noteCount === 0) return meeting.date < today ? words.noNotes : words.noNotesYet;
  return notesCount(meeting.noteCount, language);
}

/**
 * One meeting in a list; opens the meeting page. `showTeam` for lists that mix teams (Home), `showNotes` to count its
 * notes (a period's meetings), `from` to make the meeting page's back link return to this list (path and its name).
 */
export function MeetingRow({
  meeting,
  today,
  showTeam = false,
  showNotes = false,
  from,
}: {
  meeting: MeetingView;
  today: string;
  showTeam?: boolean;
  showNotes?: boolean;
  from?: { path: string; label: string };
}) {
  const { t } = useTranslation();
  const moved = movedFrom(meeting);
  const notes = showNotes && meeting.status !== 'cancelled' ? noteCountLabel(meeting, today) : null;
  const reason = cancelReason(meeting);
  const details = [showTeam ? meeting.teamName : null, reason ? t('meetings.row.reason', { reason }) : null, notes, moved].filter(Boolean);
  return (
    <li>
      <Link
        to={`/meetings/${meeting.id}`}
        state={from ? { from: from.path, fromLabel: from.label } : undefined}
        className={`meeting-row${meeting.status === 'cancelled' ? ' meeting-row--cancelled' : ''}`}
      >
        <DateTile date={meeting.date} today={today} />
        <span className="meeting-row__text">
          <span className="meeting-row__title">
            <span className="visually-hidden">{formatDay(meeting.date)}: </span>
            {meetingName(meeting)}
          </span>
          {details.length > 0 ? <span className="muted small">{details.join(' · ')}</span> : null}
        </span>
        <MeetingStatusBadge meeting={meeting} today={today} />
        <span className="meeting-row__arrow" aria-hidden="true">
          →
        </span>
      </Link>
    </li>
  );
}

/** Rows of shimmer while a meeting list loads. */
export function MeetingRowsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <ul className="meeting-list" aria-hidden="true">
      {Array.from({ length: rows }, (_, n) => (
        <li key={n} className="meeting-row meeting-row--skeleton">
          <BlueSkeleton width={48} height={56} />
          <span className="meeting-row__text">
            <BlueSkeleton width="45%" height={16} />
            <BlueSkeleton width="30%" height={12} />
          </span>
        </li>
      ))}
    </ul>
  );
}
