import type { NoteMeeting, NoteSummary } from '@weekly-meeting/shared';
import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { BlueAlert, BlueButton, BlueModal } from '../../components/blue';
import { EntityName } from '../../components/EntityName';
import { ApiFailure } from '../../services/api';
import { errorLabel } from '../../utils/errorLabels';
import { MeetingChoiceList, useMeetingChoices } from './NoteMeetings';
import { useNoteMeetingLink } from './useNotes';

const codeOf = (error: unknown) => (error instanceof ApiFailure ? error.code : error ? 'unknown_error' : null);

/**
 * "Share on a meeting…" from the Notes page: the same choices as the editor's "Shared on" list (my teams' meetings
 * in the next two weeks and the recent ones), each a toggle. Changes are saved at once; Done only closes.
 */
export function ShareNoteDialog({ note, onClose }: { note: NoteSummary; onClose: () => void }) {
  const { t } = useTranslation();
  const [meetings, setMeetings] = useState<NoteMeeting[]>(note.meetings);
  const { soon, earlier, loading } = useMeetingChoices(true);
  const link = useNoteMeetingLink();
  const failed = codeOf(link.error);
  const title = note.title || t('notes.untitled');

  return (
    <BlueModal
      open
      size="sm"
      title={t('notes.shareDialog.title')}
      onClose={onClose}
      footer={
        <BlueButton variant="primary" onClick={onClose}>
          {t('notes.shareDialog.done')}
        </BlueButton>
      }
    >
      <div className="stack share-dialog">
        <p>
          <Trans i18nKey="notes.shareDialog.lead" components={{ name: <EntityName>{title}</EntityName> }} />
        </p>
        {failed ? <BlueAlert variant="error">{errorLabel(failed)}</BlueAlert> : null}
        <div className="share-dialog__list">
          <MeetingChoiceList
            soon={soon}
            earlier={earlier}
            loading={loading}
            linked={new Set(meetings.map((m) => m.id))}
            busy={link.isPending}
            onToggle={(m, on) =>
              link.mutate({ noteId: note.id, meetingId: m.id, linked: on }, { onSuccess: (answer) => setMeetings(answer.meetings) })
            }
          />
        </div>
      </div>
    </BlueModal>
  );
}
