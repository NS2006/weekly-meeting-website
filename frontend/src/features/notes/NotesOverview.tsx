import type { Me, NoteSummary } from '@weekly-meeting/shared';
import { useEffect, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router';
import { BlueAlert, BlueButton, BlueEmptyState, BlueSkeleton } from '../../components/blue';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EntityName } from '../../components/EntityName';
import { NotesIcon } from '../../components/icons';
import { Paged } from '../../components/Paged';
import { ApiFailure } from '../../services/api';
import { formatDay, relativeDate, todayWib } from '../../utils/dates';
import { errorLabel } from '../../utils/errorLabels';
import { useFilterParams } from '../../utils/useFilterParams';
import { DateTile } from '../meetings/MeetingParts';
import { meetingName } from '../meetings/meetingName';
import { groupByMonth } from './months';
import { NoteActions } from './NoteActions';
import { NoteFilters } from './NoteFilters';
import { CLEARED, isFiltered, listDateOf, NOTES_PER_PAGE, notesQuery, readNoteFilters, readPage } from './listFilters';
import { ShareNoteDialog } from './ShareNoteDialog';
import { useCopyNote, useCreateNote, useDeleteNote, useNotesPage } from './useNotes';
import { useNoteDownload } from './useNoteDownload';
import './notes.css';

const codeOf = (error: unknown) => (error instanceof ApiFailure ? error.code : error ? 'unknown_error' : null);

/**
 * The Notes page: my notes, one page of 20 at a time, filtered, sorted and counted on the server (words, project,
 * where shared, days written, order; all in the address with the page, so Back and a reload show the same list).
 * Rows are grouped by month; each has a "⋯" menu: Make a copy (opens the copy), Share on a meeting…, Download as
 * Word / PDF (the note alone, in English, as every download), Delete….
 */
export function NotesOverview({ user }: { user: Me }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useFilterParams();
  const filters = readNoteFilters(params.get);
  const page = readPage(params.get);
  const notes = useNotesPage(notesQuery(filters, page));
  const create = useCreateNote();
  const copy = useCopyNote();
  const remove = useDeleteNote();
  const download = useNoteDownload(user);
  const [sharing, setSharing] = useState<NoteSummary | null>(null);
  const [deleting, setDeleting] = useState<NoteSummary | null>(null);
  const [deleted, setDeleted] = useState<string | null>(null);
  const top = useRef<HTMLDivElement>(null);

  const list = notes.data?.notes ?? [];
  const total = notes.data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / NOTES_PER_PAGE));
  const filtered = isFiltered(filters);
  const today = todayWib();
  // A note opened from here returns to this page of the list, with its filters.
  const back = { from: `/notes${location.search}`, label: t('notes.page.allNotes') };
  const failed = codeOf(notes.error) ?? codeOf(create.error) ?? codeOf(copy.error);
  const word = (kind: 'docx' | 'pdf') => (kind === 'docx' ? 'word' : 'pdf');
  const progress = download.progress;
  const outcome = download.outcome;
  const titleOf = (note: NoteSummary) => note.title || t('notes.untitled');

  // A page past the end (the last note on it deleted, or an old link) goes to the last page there is.
  const { update } = params;
  useEffect(() => {
    if (notes.data && !notes.isPlaceholderData && page > lastPage) update({ page: lastPage > 1 ? String(lastPage) : '' });
  }, [notes.data, notes.isPlaceholderData, page, lastPage, update]);

  const change = (patch: Record<string, string | undefined>) => {
    setDeleted(null);
    params.update({ ...patch, page: '' }); // a new filter starts from the first page
  };
  const goTo = (next: number) => {
    params.update({ page: next > 1 ? String(next) : '' });
    top.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };
  const newNote = () => create.mutate({}, { onSuccess: ({ note }) => void navigate(`/notes/${note.id}`) });
  const makeCopy = (note: NoteSummary) =>
    copy.mutate(
      { id: note.id, title: t('notes.actions.copyTitle', { title: titleOf(note) }).slice(0, 200) },
      { onSuccess: ({ note: made }) => void navigate(`/notes/${made.id}`, { state: back }) },
    );

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1 className="page-head__title">{t('notes.overview.title')}</h1>
          <p className="muted">{t('notes.overview.lead')}</p>
        </div>
        <BlueButton variant="primary" loading={create.isPending} onClick={newNote}>
          {t('notes.overview.newNote')}
        </BlueButton>
      </div>

      <NoteFilters value={filters} onChange={change} />
      {failed ? <BlueAlert variant="error">{errorLabel(failed)}</BlueAlert> : null}
      {outcome && 'error' in outcome ? (
        <BlueAlert variant="error" onDismiss={download.clear}>
          {outcome.error === 'unknown_error' ? t('notes.actions.downloadFailed') : errorLabel(outcome.error)}
        </BlueAlert>
      ) : outcome && outcome.missing > 0 ? (
        <BlueAlert variant="info" onDismiss={download.clear}>
          {t('notes.actions.downloadMissing', { count: outcome.missing })}
        </BlueAlert>
      ) : null}
      {deleted !== null ? (
        <BlueAlert variant="success" onDismiss={() => setDeleted(null)}>
          <Trans i18nKey="notes.actions.deleted" components={{ name: <EntityName>{deleted}</EntityName> }} />
        </BlueAlert>
      ) : null}

      <div ref={top} className="note-results">
        {notes.isPending ? (
          <div className="tile note-list" role="status" aria-label={t('notes.overview.loading')}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="note-row note-row--skeleton" aria-hidden="true">
                <BlueSkeleton width={52} height={60} />
                <div className="note-row__text">
                  <BlueSkeleton width="45%" height={16} />
                  <BlueSkeleton width="85%" height={13} />
                </div>
              </div>
            ))}
          </div>
        ) : list.length === 0 ? (
          <div className="tile">
            <BlueEmptyState icon={<NotesIcon size={26} />} title={filtered ? t('notes.overview.noMatch') : t('notes.overview.none')}>
              {filtered ? (
                <button type="button" className="link-button" onClick={() => change(CLEARED)}>
                  {t('notes.overview.clearFilters')}
                </button>
              ) : (
                <span className="stack" style={{ alignItems: 'center' }}>
                  <span>{t('notes.overview.emptyBody')}</span>
                  <BlueButton variant="secondary" loading={create.isPending} onClick={newNote}>
                    {t('notes.overview.writeFirst')}
                  </BlueButton>
                </span>
              )}
            </BlueEmptyState>
          </div>
        ) : (
          <div className={`tile note-timeline ${notes.isPlaceholderData ? 'is-refreshing' : ''}`.trim()}>
            <Paged
              current={page}
              total={total}
              pageSize={NOTES_PER_PAGE}
              label={t('notes.overview.pages')}
              disabled={notes.isPlaceholderData}
              onChange={goTo}
              head={
                <>
                  <span className="note-results__count" role="status">
                    {copy.isPending
                      ? t('notes.overview.copying')
                      : progress
                        ? progress.total > 0
                          ? t(`periods.reader.save.${word(progress.kind)}.progressPictures`, { done: progress.done, total: progress.total })
                          : t(`periods.reader.save.${word(progress.kind)}.progress`)
                        : lastPage > 1
                        ? t('notes.overview.range', {
                            from: (page - 1) * NOTES_PER_PAGE + 1,
                            to: (page - 1) * NOTES_PER_PAGE + list.length,
                            count: total,
                          })
                        : t('notes.overview.count', { count: total })}
                  </span>
                  {filtered ? (
                    <button type="button" className="link-button" onClick={() => change(CLEARED)}>
                      {t('notes.overview.clearFilters')}
                    </button>
                  ) : null}
                </>
              }
            >
              {groupByMonth(list, (n) => listDateOf(filters.sort, n)).map((group) => (
                <section key={group.key} aria-label={group.label}>
                  <h2 className="note-timeline__month">{group.label}</h2>
                  <ol className="note-list">
                    {group.items.map((note) => (
                      <li key={note.id} className="note-item">
                        <Link to={`/notes/${note.id}`} state={back} className="note-row">
                          <DateTile date={todayWib(new Date(listDateOf(filters.sort, note)))} today={today} />
                          <span className="note-row__text">
                            <span className={`note-row__title ${note.title ? '' : 'note-row__title--untitled'}`.trim()}>
                              {titleOf(note)}
                            </span>
                            {note.projects.length > 0 ? (
                              <span className="note-row__projects">
                                {note.projects.map((p) => (
                                  <span key={p.id} className="project-chip">
                                    {p.name}
                                  </span>
                                ))}
                              </span>
                            ) : null}
                            <span className="note-row__snippet">{note.snippet || t('notes.overview.emptyNote')}</span>
                            {note.meetings.length > 0 ? (
                              <span className="note-row__meetings">
                                {t('notes.overview.sharedOn', {
                                  meetings: note.meetings.map((m) => `${meetingName(m)} (${formatDay(m.date)})`).join(', '),
                                })}
                              </span>
                            ) : null}
                            <span className="note-row__meta">
                              {filters.sort === 'edited'
                                ? t('notes.overview.written', { date: formatDay(todayWib(new Date(note.createdAt))) })
                                : t('notes.overview.edited', { when: relativeDate(note.updatedAt) })}
                            </span>
                          </span>
                        </Link>
                        <NoteActions
                          title={titleOf(note)}
                          busy={copy.isPending}
                          downloading={progress !== null}
                          onCopy={() => makeCopy(note)}
                          onShare={() => setSharing(note)}
                          onDownload={(kind) => void download.start(note, kind)}
                          onDelete={() => {
                            remove.reset();
                            setDeleting(note);
                          }}
                        />
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
            </Paged>
          </div>
        )}
      </div>

      {sharing ? <ShareNoteDialog note={sharing} onClose={() => setSharing(null)} /> : null}
      <ConfirmDialog
        open={deleting !== null}
        danger
        title={
          <Trans i18nKey="notes.actions.deleteTitle" components={{ name: <EntityName>{deleting ? titleOf(deleting) : ''}</EntityName> }} />
        }
        confirmLabel={t('notes.editor.deleteNote')}
        busy={remove.isPending}
        error={remove.error ? errorLabel(codeOf(remove.error) ?? 'unknown_error') : null}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (!deleting) return;
          const gone = deleting;
          remove.mutate(gone.id, {
            onSuccess: () => {
              setDeleting(null);
              setDeleted(titleOf(gone));
            },
          });
        }}
      >
        {t('notes.editor.deleteBody')}
      </ConfirmDialog>
    </div>
  );
}
