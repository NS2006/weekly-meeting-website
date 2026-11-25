import type { MeetingView, NoteSummary } from '@weekly-meeting/shared';
import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { BlueAlert, BlueButton, BlueModal } from '../../components/blue';
import { EntityName } from '../../components/EntityName';
import { ApiFailure } from '../../services/api';
import { errorLabel } from '../../utils/errorLabels';
import { meetingLabel, useMeetingChoices } from './NoteMeetings';
import { meetingState, notesToChange, type SharedOn } from './selection';
import { useShareNotes } from './useNotes';

const codeOf = (error: unknown) => (error instanceof ApiFailure ? error.code : error ? 'unknown_error' : null);

/**
 * "Share…" from the Notes page, for the one or several notes picked (owner, 2026-11-25): my teams' meetings in the next
 * two weeks and the recent ones, as in the editor's "Shared on" list, each with a box. With several notes a box is
 * ticked when all of them are on the meeting and shows "–" with "2 of 3 notes" when only some are; ticking it puts the
 * rest on, unticking takes them all off. Each change is saved at once and said below the list; Done only closes.
 */
export function ShareNoteDialog({ notes, onClose }: { notes: readonly NoteSummary[]; onClose: () => void }) {
  const { t } = useTranslation();
  const noteIds = notes.map((n) => n.id);
  const [shared, setShared] = useState<SharedOn>(() => Object.fromEntries(notes.map((n) => [n.id, n.meetings.map((m) => m.id)])));
  const [said, setSaid] = useState<string | null>(null);
  const { soon, earlier, loading } = useMeetingChoices(true);
  const save = useShareNotes();
  const failed = codeOf(save.error);
  const one = notes.length === 1;
  const first = notes[0];

  const toggle = (meeting: MeetingView) => {
    // A box clicked while a change is saving keeps its look (it is not disabled, so the focus stays on it).
    if (save.isPending) return;
    const change = notesToChange(shared, noteIds, meeting.id);
    const where = `${meetingLabel(meeting)} · ${meeting.teamName}`;
    setSaid(null);
    save.mutate(
      {
        noteIds: change.noteIds,
        meetingId: meeting.id,
        linked: change.share,
        onEach: (noteId, meetings) => setShared((now) => ({ ...now, [noteId]: meetings.map((m) => m.id) })),
      },
      {
        onSuccess: () =>
          setSaid(
            t(change.share ? 'notes.shareDialog.shared' : 'notes.shareDialog.takenOff', { count: change.noteIds.length, meeting: where }),
          ),
      },
    );
  };

  const row = (meeting: MeetingView) => {
    const { state, on } = meetingState(shared, noteIds, meeting.id);
    return (
      <li key={meeting.id}>
        <label className={`share-choice${state === 'none' ? '' : ' share-choice--on'}`}>
          <input
            type="checkbox"
            className="share-choice__box"
            checked={state === 'all'}
            aria-disabled={save.isPending || undefined}
            ref={(box) => {
              if (box) box.indeterminate = state === 'some';
            }}
            onChange={() => toggle(meeting)}
          />
          <span className="share-choice__text">
            <span className="share-choice__name">{meetingLabel(meeting)}</span>
            <span className="share-choice__team">
              {meeting.teamName}
              {state === 'some' ? ` · ${t('notes.shareDialog.someOf', { on, count: notes.length })}` : ''}
            </span>
          </span>
        </label>
      </li>
    );
  };

  const group = (label: string, meetings: MeetingView[]) =>
    meetings.length > 0 ? (
      <section className="share-dialog__group" aria-label={label}>
        <h3 className="share-dialog__heading">{label}</h3>
        <ul className="share-dialog__choices">{meetings.map(row)}</ul>
      </section>
    ) : null;

  return (
    <BlueModal
      open
      size="sm"
      title={one ? t('notes.shareDialog.title') : t('notes.shareDialog.titleMany', { count: notes.length })}
      onClose={onClose}
      footer={
        <BlueButton variant="primary" onClick={onClose}>
          {t('notes.shareDialog.done')}
        </BlueButton>
      }
    >
      <div className="share-dialog">
        <p className="share-dialog__lead">
          {one && first ? (
            <Trans i18nKey="notes.shareDialog.lead" components={{ name: <EntityName>{first.title || t('notes.untitled')}</EntityName> }} />
          ) : (
            t('notes.shareDialog.leadMany', { count: notes.length })
          )}
        </p>
        {failed ? <BlueAlert variant="error">{errorLabel(failed)}</BlueAlert> : null}
        <div className="share-dialog__list" aria-busy={save.isPending}>
          {soon.length === 0 && earlier.length === 0 ? (
            <p className="share-dialog__empty">{loading ? t('notes.share.loading') : t('notes.share.none')}</p>
          ) : null}
          {group(t('notes.share.comingUp'), soon)}
          {group(t('notes.share.earlier'), earlier)}
        </div>
        <p className="share-dialog__status" role="status">
          {save.isPending ? t('notes.shareDialog.saving') : said}
        </p>
      </div>
    </BlueModal>
  );
}
