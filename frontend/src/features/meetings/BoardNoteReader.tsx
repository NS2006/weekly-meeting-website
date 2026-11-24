import type { MeetingDetail } from '@weekly-meeting/shared';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { BlueAlert, BlueAvatar, BlueButton, BlueModal, BlueSkeleton } from '../../components/blue';
import { ApiFailure } from '../../services/api';
import { formatDate, relativeDate } from '../../utils/dates';
import { errorLabel } from '../../utils/errorLabels';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { NoteContentView } from '../notes/NoteContentView';
import { ProjectNav, scrollBehavior, useActiveSection } from '../notes/ProjectNav';
import type { positionOf } from './board';
import { meetingName } from './meetingName';
import { useMeetingNote } from './useMeetings';

const codeOf = (error: unknown) => (error instanceof ApiFailure ? error.code : error ? 'unknown_error' : null);

/**
 * Reads one note of the board, like a card opened in Trello: the full note, read-only, with its author and projects.
 * Previous / Next (and the ← → keys) go through the board in reading order; they sit both at the top, beside the
 * author, and at the bottom (owner, 2026-11-23: a long note should not need a trip to the bottom), and the next note
 * starts at its top. A note's project sections are listed beside it, like Word's navigation pane, to jump to one
 * (owner, 2026-11-23). The owner can open it in the editor or take it off this meeting.
 */
export function BoardNoteReader({
  meeting,
  position,
  onClose,
  onGo,
  prefetch,
  removing,
  removeError,
  onRemove,
}: {
  meeting: MeetingDetail;
  position: ReturnType<typeof positionOf>;
  onClose: () => void;
  onGo: (noteId: string) => void;
  prefetch: (noteId: string) => void;
  removing: boolean;
  removeError: string | null;
  onRemove: (noteId: string, title: string) => void;
}) {
  const { t } = useTranslation();
  const { current, previous, next, index, total } = position;
  const noteId = current?.card.id ?? null;
  const note = useMeetingNote(meeting.id, noteId);
  const failed = codeOf(note.error);
  const detail = note.data?.note;
  // The card's own data shows at once; the full note replaces it when it arrives.
  const title = (detail?.title ?? current?.card.title) || t('meetings.untitled');

  // Load the neighbours ahead, so Previous / Next feel instant.
  useEffect(() => {
    if (previous) prefetch(previous.card.id);
    if (next) prefetch(next.card.id);
  }, [previous, next, prefetch]);

  // ← and → move between notes (not while typing in a field, and not with a modifier key held). The listener reads
  // the latest neighbours from a ref, so it stays attached while the reader is open.
  const neighbours = useRef({ previous, next, onGo });
  neighbours.current = { previous, next, onGo };
  const isOpen = noteId !== null;
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.altKey || event.ctrlKey || event.metaKey || target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const { previous: before, next: after, onGo: go } = neighbours.current;
      if (event.key === 'ArrowLeft' && before) go(before.card.id);
      if (event.key === 'ArrowRight' && after) go(after.card.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen]);

  // The reader's dialog is what scrolls: each note starts at its top, not where the last (longer) one was left.
  const readerBox = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const dialog = readerBox.current?.closest('dialog');
    if (dialog) dialog.scrollTop = 0;
  }, [noteId]);

  const projectName = (projectId: string | null) => detail?.projects.find((p) => p.id === projectId)?.name ?? null;
  const idPrefix = useId();
  const sectionId = (index: number) => `${idPrefix}section-${index}`;
  const sections = (detail?.content.content ?? []).flatMap((node, index) =>
    node.type === 'projectSection'
      ? [{ id: sectionId(index), name: projectName(typeof node.attrs?.projectId === 'string' ? node.attrs.projectId : null) }]
      : [],
  );
  const from = { from: `/meetings/${meeting.id}`, label: meetingName(meeting) };

  return (
    <BlueModal
      open={noteId !== null}
      onClose={onClose}
      size="xl"
      title={title}
      footer={
        <div className="reader-footer">
          <ReaderNav position={position} onGo={onGo} announce />
          {detail?.isMine ? (
            <div className="reader-footer__actions">
              <BlueButton variant="ghost" size="sm" loading={removing} onClick={() => onRemove(detail.id, detail.title)}>
                {t('meetings.reader.remove')}
              </BlueButton>
              <Link to={`/notes/${detail.id}`} state={from} className="blue-button blue-button--primary blue-button--sm">
                {t('meetings.reader.openInEditor')}
              </Link>
            </div>
          ) : null}
        </div>
      }
    >
      {current ? (
        <div className="reader" ref={readerBox}>
          <div className="reader__top">
            <div className="reader__meta">
              <BlueAvatar name={current.column.name} size="sm" />
              <span>
                <strong>{current.column.name}</strong>
                <span className="muted">
                  {' '}
                  · {t('meetings.reader.written', { date: formatDate(current.card.createdAt) })}
                  {current.card.updatedAt !== current.card.createdAt
                    ? ` · ${t('meetings.reader.edited', { when: relativeDate(current.card.updatedAt) })}`
                    : ''}
                </span>
              </span>
            </div>
            {total > 1 ? <ReaderNav position={position} onGo={onGo} /> : null}
          </div>
          {removeError ? <BlueAlert variant="error">{errorLabel(removeError)}</BlueAlert> : null}
          {failed ? (
            <BlueAlert variant="error">
              {failed === 'not_found' ? t('meetings.reader.gone') : errorLabel(failed)}
            </BlueAlert>
          ) : detail ? (
            <div className={sections.length > 0 ? 'reader__layout' : undefined}>
              {sections.length > 0 ? <SectionNav key={detail.id} sections={sections} /> : null}
              <NoteContentView
                doc={detail.content}
                className="reader__content"
                sectionId={sectionId}
                sectionLabel={(projectId) => {
                  const name = projectName(projectId);
                  return name ? <span className="project-chip">{name}</span> : <span className="muted">{t('meetings.reader.noProject')}</span>;
                }}
              />
            </div>
          ) : (
            <div className="reader__loading" role="status">
              <span className="visually-hidden">{t('meetings.reader.loading')}</span>
              <BlueSkeleton width="90%" height={14} />
              <BlueSkeleton width="75%" height={14} />
              <BlueSkeleton width="82%" height={14} />
            </div>
          )}
        </div>
      ) : null}
    </BlueModal>
  );
}

/**
 * The note's project sections, like Word's navigation pane: one entry per section (its project, or "No project"),
 * the one being read highlighted as the reader scrolls, a click jumping to it. Beside the note on a wide screen
 * (staying in view), a row above it on a narrow one.
 */
function SectionNav({ sections }: { sections: { id: string; name: string | null }[] }) {
  // The reader's dialog is what scrolls (a stable ref callback: a new one each render would set it again and again).
  const [scroller, setScroller] = useState<HTMLElement | null>(null);
  const attach = useCallback((element: HTMLDivElement | null) => setScroller(element?.closest('dialog') ?? null), []);
  const narrow = useMediaQuery('(max-width: 900px)');
  const [active, setActive] = useActiveSection(
    sections.map((s) => s.id),
    (id) => document.getElementById(id),
    scroller,
    () => 96,
  );

  const go = (id: string) => {
    const element = document.getElementById(id);
    if (!element) return;
    element.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
    element.focus({ preventScroll: true });
    setActive(id);
  };

  return (
    <div className="reader-nav" ref={attach}>
      <ProjectNav
        className={narrow ? 'project-nav--row' : ''}
        items={sections.map((s) => ({ key: s.id, name: s.name }))}
        active={active}
        onGo={go}
      />
    </div>
  );
}

/** ← Previous · 3 of 9 · Next →. Only one of the two copies announces the position to screen readers. */
function ReaderNav({
  position,
  onGo,
  announce = false,
}: {
  position: ReturnType<typeof positionOf>;
  onGo: (noteId: string) => void;
  announce?: boolean;
}) {
  const { t } = useTranslation();
  const { previous, next, index, total } = position;
  return (
    <div className="reader-footer__nav">
      <BlueButton variant="secondary" size="sm" disabled={!previous} onClick={() => previous && onGo(previous.card.id)}>
        ← {t('meetings.switcher.previous')}
      </BlueButton>
      <span className="muted reader-footer__position" aria-live={announce ? 'polite' : undefined}>
        {index >= 0 ? t('meetings.reader.position', { index: index + 1, total }) : ''}
      </span>
      <BlueButton variant="secondary" size="sm" disabled={!next} onClick={() => next && onGo(next.card.id)}>
        {t('meetings.switcher.next')} →
      </BlueButton>
    </div>
  );
}
