import type { Me } from '@weekly-meeting/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Trans, useTranslation } from 'react-i18next';
import { Link, useLocation, useParams } from 'react-router';
import { BlueCard, BlueEmptyState, BlueSkeleton } from '../components/blue';
import { NoteEditor } from '../features/notes/NoteEditor';
import { NOTES_KEY, useNote } from '../features/notes/useNotes';
import { AppLayout } from '../layouts/AppLayout';
import { ApiFailure } from '../services/api';
import { errorLabel } from '../utils/errorLabels';
import '../features/teams/teams.css';

/** One of my notes, as its own document page. */
export function NotePage({ user }: { user: Me }) {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const note = useNote(id);
  const queryClient = useQueryClient();
  const code = note.error instanceof ApiFailure ? note.error.code : note.error ? 'unknown_error' : null;
  // Opened from a project page, a meeting's board or the Notes page with filters or on a later page: the back link
  // returns there; otherwise to the Notes page.
  const state = useLocation().state as { from?: unknown; label?: unknown; write?: unknown } | null;
  const back =
    typeof state?.from === 'string' && /^\/(projects\/|meetings\/|notes(\?|$))/.test(state.from) && typeof state.label === 'string'
      ? { to: state.from, label: state.label }
      : { to: '/notes', label: t('notes.page.allNotes') };

  return (
    <AppLayout user={user}>
      {note.isPending ? (
        <div className="note-page" role="status">
          <span className="visually-hidden">{t('notes.page.loading')}</span>
          <BlueSkeleton width={160} height={16} />
          <div className="note-paper" aria-hidden="true">
            <BlueSkeleton width="55%" height={34} />
            <BlueSkeleton width="30%" height={14} />
            <BlueSkeleton width="100%" height={14} />
            <BlueSkeleton width="92%" height={14} />
            <BlueSkeleton width="70%" height={14} />
          </div>
        </div>
      ) : note.data ? (
        // A reload after a conflict brings a new version: a fresh editor for it.
        <NoteEditor
          key={`${note.data.note.id}:${note.data.note.version}`}
          note={note.data.note}
          back={back}
          startWriting={state?.write === true}
          onReload={() => void queryClient.resetQueries({ queryKey: [...NOTES_KEY, 'one', id] })}
        />
      ) : (
        <BlueCard>
          <BlueEmptyState title={code === 'not_found' ? t('notes.page.notFound') : t('notes.page.couldNotLoad')}>
            {code === 'not_found' ? (
              <Trans i18nKey="notes.page.notFoundBody" components={{ page: <Link to="/notes" /> }} />
            ) : (
              errorLabel(code ?? '')
            )}
          </BlueEmptyState>
        </BlueCard>
      )}
    </AppLayout>
  );
}
