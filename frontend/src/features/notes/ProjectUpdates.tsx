import type { ProjectDetail } from '@weekly-meeting/shared';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { BlueAlert, BlueButton, BlueEmptyState, BlueSkeleton } from '../../components/blue';
import { NotesIcon } from '../../components/icons';
import { ApiFailure } from '../../services/api';
import { formatDate, relativeDate } from '../../utils/dates';
import { errorLabel } from '../../utils/errorLabels';
import { groupByMonth } from './months';
import { NoteContentView } from './NoteContentView';
import { useCreateNote, useProjectUpdates } from './useNotes';
import './notes.css';

const codeOf = (error: unknown) => (error instanceof ApiFailure ? error.code : error ? 'unknown_error' : null);

/**
 * The project's updates (FR-12): every part of my notes tagged with this project, newest note first, shown read-only
 * with a link to its note. "Write an update" opens a new note that already has this project's section.
 */
export function ProjectUpdates({ project }: { project: ProjectDetail }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const updates = useProjectUpdates(project.id);
  const create = useCreateNote();
  const archived = project.status === 'archived';
  const list = updates.data?.pages.flatMap((page) => page.updates) ?? [];
  const from = { from: `/projects/${project.id}`, label: project.name };
  const write = () =>
    create.mutate(
      { projectId: project.id },
      { onSuccess: ({ note }) => void navigate(`/notes/${note.id}`, { state: { ...from, write: true } }) },
    );
  const createError = codeOf(create.error);

  return (
    <section className="tile notes-panel" aria-labelledby="updates-heading">
      <div className="notes-panel__head">
        <h2 id="updates-heading" className="notes-panel__title">
          {t('notes.updates.title')} <span className="notes-panel__count">{project.updateCount}</span>
        </h2>
        {archived ? null : (
          <BlueButton variant="primary" loading={create.isPending} onClick={write}>
            {t('notes.updates.write')}
          </BlueButton>
        )}
      </div>
      {createError ? <BlueAlert variant="error">{errorLabel(createError)}</BlueAlert> : null}

      {updates.isPending ? (
        <div className="update-list" role="status" aria-label={t('notes.updates.loading')}>
          {[0, 1].map((i) => (
            <div key={i} className="update" aria-hidden="true">
              <BlueSkeleton width="35%" height={14} />
              <BlueSkeleton width="90%" height={14} />
              <BlueSkeleton width="70%" height={14} />
            </div>
          ))}
        </div>
      ) : updates.isError ? (
        <BlueAlert variant="error">{errorLabel(codeOf(updates.error) ?? 'unknown_error')}</BlueAlert>
      ) : list.length === 0 ? (
        <BlueEmptyState icon={<NotesIcon size={26} />} title={t('notes.updates.none')}>
          {archived ? (
            t('notes.updates.nothingWritten')
          ) : (
            <span className="stack" style={{ alignItems: 'center' }}>
              <span>{t('notes.updates.emptyBody')}</span>
              <BlueButton variant="secondary" loading={create.isPending} onClick={write}>
                {t('notes.updates.writeFirst')}
              </BlueButton>
            </span>
          )}
        </BlueEmptyState>
      ) : (
        <div className="note-timeline">
          {groupByMonth(list, (u) => u.noteCreatedAt).map((group) => (
            <section key={group.key} aria-label={group.label}>
              <h3 className="note-timeline__month">{group.label}</h3>
              <ol className="update-list">
                {group.items.map((update) => (
                  <li key={`${update.noteId}:${update.position}`} className="update">
                    <div className="update__head">
                      <Link to={`/notes/${update.noteId}`} state={from} className="update__note">
                        {update.noteTitle || t('notes.untitled')}
                      </Link>
                      <span className="update__date">
                        {t('notes.updates.dateEdited', {
                          date: formatDate(update.noteCreatedAt),
                          when: relativeDate(update.noteUpdatedAt),
                        })}
                      </span>
                    </div>
                    <NoteContentView doc={update.content} />
                  </li>
                ))}
              </ol>
            </section>
          ))}
          {updates.hasNextPage ? (
            <BlueButton variant="secondary" loading={updates.isFetchingNextPage} onClick={() => void updates.fetchNextPage()}>
              {t('notes.updates.showOlder')}
            </BlueButton>
          ) : null}
        </div>
      )}
    </section>
  );
}
