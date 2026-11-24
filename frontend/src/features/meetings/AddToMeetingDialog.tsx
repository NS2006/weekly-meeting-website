import type { MeetingDetail, NoteSummary } from '@weekly-meeting/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { BlueAlert, BlueButton, BlueModal, BlueSkeleton } from '../../components/blue';
import { SearchField } from '../../components/SearchField';
import { ApiFailure } from '../../services/api';
import { formatDate, formatDay, todayWib } from '../../utils/dates';
import { errorLabel } from '../../utils/errorLabels';
import { useCreateNote, useMyNotes, useNoteMeetingLink } from '../notes/useNotes';
import { writtenBetween } from './board';
import { meetingName } from './meetingName';

const codeOf = (error: unknown) => (error instanceof ApiFailure ? error.code : error ? 'unknown_error' : null);

/**
 * "Add my note": write a new note that starts on this meeting's board, or pick one of my notes. Notes written in the
 * days this meeting gathers are marked, so the right one is easy to spot; notes already here cannot be added twice.
 */
export function AddToMeetingDialog({
  meeting,
  open,
  onClose,
  onBoard,
  onAdded,
}: {
  meeting: MeetingDetail;
  open: boolean;
  onClose: () => void;
  /** My notes already on this meeting. */
  onBoard: ReadonlySet<string>;
  onAdded: (title: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <BlueModal open={open} onClose={onClose} title={t('meetings.add.title')} size="md">
      {/* Mounted only while open: the list loads when it is needed and starts fresh each time. */}
      {open ? <Picker meeting={meeting} onBoard={onBoard} onClose={onClose} onAdded={onAdded} /> : null}
    </BlueModal>
  );
}

function Picker({
  meeting,
  onBoard,
  onClose,
  onAdded,
}: {
  meeting: MeetingDetail;
  onBoard: ReadonlySet<string>;
  onClose: () => void;
  onAdded: (title: string) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const notes = useMyNotes(q);
  const create = useCreateNote();
  const link = useNoteMeetingLink();
  const list = notes.data?.pages.flatMap((page) => page.notes) ?? [];
  const failed = codeOf(create.error) ?? codeOf(link.error) ?? codeOf(notes.error);
  const from = { from: `/meetings/${meeting.id}`, label: meetingName(meeting) };
  const inWindow = (note: NoteSummary) => writtenBetween(note.createdAt, meeting.coversFrom, meeting.date, (iso) => todayWib(new Date(iso)));

  const writeNew = () =>
    create.mutate({ meetingId: meeting.id }, { onSuccess: ({ note }) => void navigate(`/notes/${note.id}`, { state: { ...from, write: true } }) });
  const add = (note: NoteSummary) =>
    link.mutate(
      { noteId: note.id, meetingId: meeting.id, linked: true },
      {
        onSuccess: () => {
          onAdded(note.title);
          onClose();
        },
      },
    );

  return (
    <div className="add-note">
      <div className="add-note__new">
        <div>
          <strong>{t('meetings.add.newTitle')}</strong>
          <p className="muted">{t('meetings.add.newBody')}</p>
        </div>
        <BlueButton variant="primary" loading={create.isPending} onClick={writeNew}>
          {t('meetings.add.write')}
        </BlueButton>
      </div>

      <div className="add-note__divider" role="separator">
        <span>{t('meetings.add.or')}</span>
      </div>
      <SearchField label={t('meetings.add.search')} placeholder={t('meetings.add.searchPlaceholder')} value={q} onCommit={setQ} />
      {failed ? <BlueAlert variant="error">{errorLabel(failed)}</BlueAlert> : null}

      {notes.isPending ? (
        <div className="add-note__list" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="add-note__row">
              <BlueSkeleton width="50%" height={14} />
              <BlueSkeleton width="80%" height={12} />
            </div>
          ))}
        </div>
      ) : list.length === 0 ? (
        <p className="muted add-note__empty">{q ? t('meetings.add.noMatch') : t('meetings.add.none')}</p>
      ) : (
        <ul className="add-note__list">
          {list.map((note) => {
            const here = onBoard.has(note.id);
            const elsewhere = note.meetings.filter((m) => m.id !== meeting.id);
            return (
              <li key={note.id}>
                <button
                  type="button"
                  className="add-note__row"
                  disabled={here || link.isPending}
                  onClick={() => add(note)}
                >
                  <span className="add-note__top">
                    <span className={`add-note__title ${note.title ? '' : 'add-note__title--untitled'}`.trim()}>
                      {note.title || t('meetings.untitled')}
                    </span>
                    {here ? (
                      <span className="add-note__state add-note__state--here">✓ {t('meetings.add.here')}</span>
                    ) : inWindow(note) ? (
                      <span className="add-note__state">{t('meetings.add.inWindow')}</span>
                    ) : null}
                  </span>
                  <span className="add-note__snippet">{note.snippet || t('meetings.emptyNote')}</span>
                  <span className="add-note__meta">
                    {formatDate(note.createdAt)}
                    {note.projects.length > 0 ? ` · ${note.projects.map((p) => p.name).join(', ')}` : ''}
                    {elsewhere.length > 0
                      ? ` · ${t('meetings.add.alsoOn', {
                          meetings: elsewhere.map((m) => `${meetingName(m)} (${formatDay(m.date)})`).join(', '),
                        })}`
                      : ''}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {notes.hasNextPage ? (
        <BlueButton variant="secondary" size="sm" loading={notes.isFetchingNextPage} onClick={() => void notes.fetchNextPage()}>
          {t('meetings.add.older')}
        </BlueButton>
      ) : null}
    </div>
  );
}
