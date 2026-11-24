import type { MeetingView, NoteMeeting } from '@weekly-meeting/shared';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ApiFailure } from '../../services/api';
import { addDays, formatDay, todayWib } from '../../utils/dates';
import { meetingName } from '../meetings/meetingName';
import { errorLabel } from '../../utils/errorLabels';
import { useMyMeetings, useMyPastMeetings } from '../meetings/useMeetings';
import { useDismiss } from '../../hooks/useDismiss';
import { useNoteMeetingLink } from './useNotes';

const codeOf = (error: unknown) => (error instanceof ApiFailure ? error.code : error ? 'unknown_error' : null);

/** "Weekly sync · Wed 25 Nov", or the meeting's own title. */
const meetingLabel = (m: Pick<MeetingView, 'seriesName' | 'date'>) => `${meetingName(m)} · ${formatDay(m.date)}`;

/** Suggestions only for notes written lately: an old note is rarely meant for this week's meeting. */
const SUGGEST_FOR_DAYS = 14;

/** The first meeting coming up in each of my teams, soonest first (one-click suggestions). */
export function nextPerTeam(meetings: readonly MeetingView[], limit: number): MeetingView[] {
  const seen = new Set<string>();
  const picked: MeetingView[] = [];
  for (const m of [...meetings].sort((a, b) => a.date.localeCompare(b.date))) {
    if (m.status === 'cancelled' || seen.has(m.teamId)) continue;
    seen.add(m.teamId);
    picked.push(m);
  }
  return picked.slice(0, limit);
}

type Shared = Pick<MeetingView, 'id' | 'title' | 'seriesName' | 'date' | 'teamName'>;

/**
 * The meetings a note can be shared on: every meeting of my teams in the next two weeks (always loaded, for the
 * suggestions) and, when `withPast`, the ten most recent ones. Cancelled meetings take no notes.
 */
export function useMeetingChoices(withPast: boolean) {
  const today = todayWib();
  const upcoming = useMyMeetings({ to: addDays(today, 13) }, true);
  const past = useMyPastMeetings({}, withPast);
  return {
    soon: (upcoming.data?.meetings ?? []).filter((m) => m.status !== 'cancelled'),
    earlier: (past.data?.pages[0]?.meetings ?? []).filter((m) => m.status !== 'cancelled').slice(0, 10),
    loading: upcoming.isPending || (withPast && past.isPending),
  };
}

/** "Coming up" and "Earlier" meetings, each a toggle: ✓ when the note is on it. */
export function MeetingChoiceList({
  soon,
  earlier,
  loading,
  linked,
  busy,
  onToggle,
}: {
  soon: MeetingView[];
  earlier: MeetingView[];
  loading: boolean;
  linked: ReadonlySet<string>;
  busy: boolean;
  onToggle: (meeting: MeetingView, on: boolean) => void;
}) {
  const { t } = useTranslation();
  const row = (m: MeetingView) => {
    const on = linked.has(m.id);
    return (
      <li key={m.id}>
        <button
          type="button"
          aria-pressed={on}
          className={`project-menu__item ${on ? 'project-menu__item--on' : ''}`.trim()}
          disabled={busy}
          onClick={() => onToggle(m, !on)}
        >
          <span className="project-menu__name">
            {meetingLabel(m)}
            <span className="meeting-menu__team">{m.teamName}</span>
          </span>
          {on ? (
            <span className="project-menu__check" aria-hidden="true">
              ✓
            </span>
          ) : null}
        </button>
      </li>
    );
  };
  return (
    <>
      {soon.length === 0 && earlier.length === 0 ? (
        <p className="project-menu__note">{loading ? t('notes.share.loading') : t('notes.share.none')}</p>
      ) : null}
      {soon.length > 0 ? (
        <>
          <p className="meeting-menu__group">{t('notes.share.comingUp')}</p>
          <ul className="project-menu__list">{soon.map(row)}</ul>
        </>
      ) : null}
      {earlier.length > 0 ? (
        <>
          <p className="meeting-menu__group">{t('notes.share.earlier')}</p>
          <ul className="project-menu__list">{earlier.map(row)}</ul>
        </>
      ) : null}
    </>
  );
}

/**
 * Which meetings the note is shared on (FR-9): a chip per meeting (opens it; × takes the note off), a one-click
 * suggestion of the next meeting of each of my teams when a recent note is on none, and a list of every meeting of
 * my teams coming up in the next two weeks and the recent ones. Sharing says who can read the note now, with Undo.
 */
export function NoteMeetings({ noteId, meetings, createdAt }: { noteId: string; meetings: NoteMeeting[]; createdAt: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [justShared, setJustShared] = useState<Shared | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const toggleButton = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(box, open, close);
  const today = todayWib();
  const { soon, earlier, loading } = useMeetingChoices(open);
  const link = useNoteMeetingLink();

  const linked = new Set(meetings.map((m) => m.id));
  const recent = todayWib(new Date(createdAt)) >= addDays(today, -SUGGEST_FOR_DAYS);
  const suggestions = meetings.length === 0 && recent ? nextPerTeam(soon, 3) : [];
  const failed = codeOf(link.error);

  const share = (m: Shared) =>
    link.mutate({ noteId, meetingId: m.id, linked: true }, { onSuccess: () => setJustShared(m) });
  const unshare = (meetingId: string) =>
    link.mutate(
      { noteId, meetingId, linked: false },
      { onSuccess: () => setJustShared((last) => (last?.id === meetingId ? null : last)) },
    );

  return (
    <div
      className="note-meetings"
      ref={box}
      onKeyDown={(event) => {
        // Escape closes the list (useDismiss) and puts the focus back on its button.
        if (event.key === 'Escape' && open) toggleButton.current?.focus();
      }}
    >
      <span className="note-meetings__label">{meetings.length > 0 ? t('notes.share.sharedOn') : t('notes.share.shareOn')}</span>
      {meetings.map((m) => (
        <span key={m.id} className={`meeting-chip ${m.status === 'cancelled' ? 'meeting-chip--cancelled' : ''}`.trim()}>
          <Link to={`/meetings/${m.id}`} className="meeting-chip__link" title={t('notes.share.openMeeting')}>
            {meetingLabel(m)}
            <span className="meeting-chip__team">· {m.teamName}</span>
            {m.status === 'cancelled' ? ` ${t('notes.share.cancelled')}` : ''}
          </Link>
          <button
            type="button"
            className="meeting-chip__remove"
            aria-label={t('notes.share.takeOff', { meeting: meetingLabel(m), team: m.teamName })}
            title={t('notes.share.takeOffTitle')}
            disabled={link.isPending}
            onClick={() => unshare(m.id)}
          >
            ×
          </button>
        </span>
      ))}
      {suggestions.map((m) => (
        <button
          key={m.id}
          type="button"
          className="meeting-chip meeting-chip--suggest"
          disabled={link.isPending}
          onClick={() => share(m)}
        >
          + {meetingLabel(m)}
          <span className="meeting-chip__team">· {m.teamName}</span>
        </button>
      ))}
      <button
        ref={toggleButton}
        type="button"
        className="note-meetings__add"
        aria-expanded={open}
        aria-controls={`meetings-for-${noteId}`}
        onClick={() => setOpen((v) => !v)}
      >
        {meetings.length > 0
          ? t('notes.share.another')
          : suggestions.length > 0
            ? t('notes.share.other')
            : t('notes.share.shareOnMeeting')}
      </button>

      {justShared && linked.has(justShared.id) ? (
        <span className="note-meetings__status" role="status">
          {t('notes.share.shared', { team: justShared.teamName, meeting: meetingLabel(justShared) })}{' '}
          <button type="button" className="link-button" disabled={link.isPending} onClick={() => unshare(justShared.id)}>
            {t('notes.share.undo')}
          </button>
        </span>
      ) : meetings.length === 0 ? (
        <span className="note-meetings__hint">{t('notes.share.onlyYou')}</span>
      ) : null}
      {failed ? <span className="note-meetings__error">{errorLabel(failed)}</span> : null}

      {open ? (
        <div id={`meetings-for-${noteId}`} className="project-menu meeting-menu" aria-label={t('notes.share.menuLabel')}>
          <MeetingChoiceList
            soon={soon}
            earlier={earlier}
            loading={loading}
            linked={linked}
            busy={link.isPending}
            onToggle={(m, on) => (on ? share(m) : unshare(m.id))}
          />
        </div>
      ) : null}
    </div>
  );
}
