import type { MeetingBoardColumn, MeetingDetail, MeetingNoteCard } from '@weekly-meeting/shared';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router';
import { BlueAlert, BlueAvatar, BlueBadge, BlueButton, BlueSkeleton } from '../../components/blue';
import { useDismiss } from '../../hooks/useDismiss';
import { useDragSort } from '../../hooks/useDragSort';
import { ApiFailure } from '../../services/api';
import { relativeDate } from '../../utils/dates';
import { errorLabel } from '../../utils/errorLabels';
import { useNoteMeetingLink } from '../notes/useNotes';
import { AddToMeetingDialog } from './AddToMeetingDialog';
import { notesAfterMove, participation, positionOf, readingOrder, selfAfterMove, speakersAfterMove, splitBoard } from './board';
import { BoardNoteReader } from './BoardNoteReader';
import { useArrangeBoard, useMeetingBoard, usePrefetchMeetingNote } from './useMeetings';
import './board.css';

const codeOf = (error: unknown) => (error instanceof ApiFailure ? error.code : error ? 'unknown_error' : null);

/**
 * The meeting's notes as a board (FR-10), a grid read left to right in the meeting's speaking order: one group per
 * person who added a note, their notes as cards; the rest of the team is behind one "No note yet" button (you first), so nobody's
 * empty group pushes the notes out of view. The leader holds a group's name bar and drags it to change the speaking
 * order; a writer (or the leader) holds a card and drags it to order that person's notes. Everyone in the team reads
 * every card; you add your own from the button, your group or your name in that list. A card opens the note in a
 * reader with Previous / Next, so the team can go through all notes in order during the meeting. The open note is in
 * the address (?note=…), so a link to it can be shared and the browser's Back button closes it.
 */
export function MeetingBoard({ meeting }: { meeting: MeetingDetail }) {
  const { t } = useTranslation();
  const board = useMeetingBoard(meeting.id);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  // True while the open note was opened from this board (its history entry is ours: closing goes back one step).
  const openedHere = useRef(false);
  const openId = params.get('note');
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<ReactNode>(null);
  const prefetch = usePrefetchMeetingNote(meeting.id);
  const link = useNoteMeetingLink();
  const arrange = useArrangeBoard(meeting.id);

  const columns = useMemo(() => board.data?.columns ?? [], [board.data]);
  const { writers, waiting } = useMemo(() => splitBoard(columns), [columns]);
  const order = useMemo(() => readingOrder(columns), [columns]);
  const position = positionOf(order, openId);
  const canAdd = board.data?.canAdd ?? false;
  const canArrange = board.data?.canArrange ?? false;
  const mine = columns.find((c) => c.isMe);
  const { wrote, members } = participation(columns);
  const meetingName = meeting.seriesName; // a meeting is called by its schedule's name (meetingName.ts)
  const failed = codeOf(board.error);

  const moveSpeaker = (from: number, to: number) => {
    const next = speakersAfterMove(columns, writers, from, to);
    arrange.mutate({ kind: 'speakers', columns: next.columns, body: { userIds: next.userIds } });
  };
  // A member moves only their own group (owner, 2026-11-24); the leader arranges everyone.
  const moveSelf = (from: number, to: number) => {
    const next = selfAfterMove(columns, writers, from, to);
    arrange.mutate({ kind: 'speakers', columns: next.columns, body: { userIds: next.userIds } });
  };
  const movesSelf = !canArrange && canAdd && writers.some((c) => c.isMe);
  const moveNote = (userId: string, from: number, to: number) => {
    const next = notesAfterMove(columns, userId, from, to);
    arrange.mutate({ kind: 'notes', columns: next.columns, body: { userId, noteIds: next.noteIds } });
  };
  const groups = useDragSort({
    ids: writers.map((c) => c.userId),
    enabled: canArrange || movesSelf,
    onMove: canArrange ? moveSpeaker : moveSelf,
    layout: 'grid',
  });
  const arrangeHint = canArrange
    ? writers.length > 1
      ? t('meetings.board.arrangeAll')
      : t('meetings.board.arrangeNotes')
    : movesSelf && writers.length > 1
      ? mine && mine.notes.length > 1
        ? t('meetings.board.arrangeSelfAndNotes')
        : t('meetings.board.arrangeSelf')
      : canAdd && mine && mine.notes.length > 1
        ? t('meetings.board.arrangeMyNotes')
        : null;

  const open = (noteId: string) => {
    link.reset();
    const next = new URLSearchParams(params);
    next.set('note', noteId);
    // Opening from the board adds a history entry (Back closes the note); moving between notes replaces it.
    if (openId === null) openedHere.current = true;
    setParams(next, { replace: openId !== null });
  };
  const close = () => {
    if (openedHere.current) {
      openedHere.current = false;
      void navigate(-1); // back to the board's own entry, so the browser's Back button then leaves the page
      return;
    }
    const next = new URLSearchParams(params);
    next.delete('note');
    setParams(next, { replace: true });
  };

  // A note in the address that is not on the board (taken off, deleted, or an old link): say so instead of nothing.
  const missing = board.data !== undefined && openId !== null && position.index === -1;
  useEffect(() => {
    if (!missing) return;
    setNotice(t('meetings.board.gone'));
    openedHere.current = false;
    const next = new URLSearchParams(params);
    next.delete('note');
    setParams(next, { replace: true });
  }, [missing]); // only when it becomes missing (the rest is read fresh then)

  const removeFromMeeting = (noteId: string, title: string) => {
    link.mutate(
      { noteId, meetingId: meeting.id, linked: false },
      {
        onSuccess: () => {
          close();
          setNotice(
            <span className="row" style={{ flexWrap: 'wrap', gap: 'var(--blue-space-2)' }}>
              <span>{t('meetings.board.removed', { title: title || t('meetings.untitled') })}</span>
              <button
                type="button"
                className="link-button"
                onClick={() =>
                  link.mutate({ noteId, meetingId: meeting.id, linked: true }, { onSuccess: () => setNotice(t('meetings.board.putBack')) })
                }
              >
                {t('meetings.board.undo')}
              </button>
            </span>,
          );
        },
      },
    );
  };

  return (
    <section className="board-section" aria-labelledby="board-heading">
      <div className="board-section__head">
        <div>
          <h2 id="board-heading" className="board-section__title">
            {t('meetings.board.title')} <span className="board-section__count">{order.length}</span>
          </h2>
          <p className="muted board-section__hint">
            {board.isPending ? (
              t('meetings.board.loading')
            ) : failed ? null : (
              <>
                {members > 0 ? t('meetings.board.participation', { count: members, wrote }) : ''}
                {order.length > 0 ? (
                  <>
                    {' '}
                    <Trans i18nKey="meetings.board.openHint" components={{ keys: <span className="board-section__keys" /> }} />
                  </>
                ) : null}
              </>
            )}
          </p>
          {!board.isPending && !failed && arrangeHint && order.length > 1 ? (
            <p className="muted board-section__hint board-section__arrange">{arrangeHint}</p>
          ) : null}
          {!board.isPending && !failed && waiting.length > 0 ? (
            <WaitingButton people={waiting} canAdd={canAdd} onAdd={() => setAdding(true)} />
          ) : null}
        </div>
        {canAdd ? (
          <BlueButton variant="primary" onClick={() => setAdding(true)}>
            {t('meetings.board.addMine')}
          </BlueButton>
        ) : null}
      </div>

      {meeting.status === 'cancelled' ? (
        <BlueAlert variant="info">
          {t('meetings.board.cancelled')}
          {order.length > 0 ? ` ${t('meetings.board.cancelledKept')}` : ''}
        </BlueAlert>
      ) : null}
      {meeting.teamArchived ? <BlueAlert variant="info">{t('meetings.board.teamDeleted')}</BlueAlert> : null}
      {notice ? (
        <BlueAlert variant="success" onDismiss={() => setNotice(null)}>
          {notice}
        </BlueAlert>
      ) : null}
      {link.error && !openId ? <BlueAlert variant="error">{errorLabel(codeOf(link.error) ?? '')}</BlueAlert> : null}
      {arrange.error ? (
        <BlueAlert variant="error" onDismiss={() => arrange.reset()}>
          {errorLabel(codeOf(arrange.error) ?? '')}
        </BlueAlert>
      ) : null}

      {board.isPending ? (
        <div className="board" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="board-column">
              <BlueSkeleton width="60%" height={18} />
              <div className="board-card board-card--skeleton">
                <BlueSkeleton width="80%" height={14} />
                <BlueSkeleton width="100%" height={12} />
                <BlueSkeleton width="70%" height={12} />
              </div>
            </div>
          ))}
        </div>
      ) : failed ? (
        <BlueAlert variant="error">{errorLabel(failed)}</BlueAlert>
      ) : (
        <>
          {writers.length > 0 ? (
            <div className="board" role="list" aria-label={t('meetings.board.groups', { name: meetingName })}>
              {writers.map((column) => (
                <BoardColumn
                  key={column.userId}
                  column={column}
                  item={groups.itemProps(column.userId)}
                  handle={canArrange || column.isMe ? groups.handleProps(column.userId) : {}}
                  canArrangeNotes={canArrange || (canAdd && column.isMe)}
                  onMoveNote={(from, to) => moveNote(column.userId, from, to)}
                  canAdd={canAdd && column.isMe}
                  onAdd={() => setAdding(true)}
                  onOpen={open}
                  onHover={prefetch}
                />
              ))}
            </div>
          ) : canAdd && mine ? (
            <button type="button" className="board-empty board-empty--mine board-empty--wide" onClick={() => setAdding(true)}>
              <span className="board-empty__title">{t('meetings.board.emptyTitle')}</span>
              <span>{t('meetings.board.emptyBody')}</span>
            </button>
          ) : (
            <p className="board-empty board-empty--wide">{t('meetings.board.empty')}</p>
          )}
        </>
      )}

      <BoardNoteReader
        meeting={meeting}
        position={position}
        onClose={close}
        onGo={open}
        prefetch={prefetch}
        removing={link.isPending}
        removeError={openId ? codeOf(link.error) : null}
        onRemove={removeFromMeeting}
      />
      <AddToMeetingDialog
        meeting={meeting}
        open={adding}
        onClose={() => setAdding(false)}
        onBoard={new Set(mine?.notes.map((n) => n.id) ?? [])}
        onAdded={(title) => setNotice(t('meetings.board.added', { title: title || t('meetings.untitled') }))}
      />
    </section>
  );
}

/**
 * Who has not added a note, behind one small button: it opens a short list (me first, with a way to add mine, and the
 * leader marked). Escape or a press outside closes it, and the focus goes back to the button.
 */
function WaitingButton({ people, canAdd, onAdd }: { people: MeetingBoardColumn[]; canAdd: boolean; onAdd: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(box, open, close);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') button.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="board-waiting" ref={box}>
      <button
        ref={button}
        type="button"
        className="board-waiting__toggle"
        aria-expanded={open}
        aria-controls="board-waiting-panel"
        onClick={() => setOpen((value) => !value)}
      >
        {t('meetings.waiting.button')} <span className="board-waiting__count">{people.length}</span>
        <svg className="board-waiting__chevron" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <div className="board-waiting__panel" id="board-waiting-panel">
          <p className="board-waiting__title">{t('meetings.waiting.title', { count: people.length })}</p>
          <ul className="board-waiting__list">
            {people.map((person) => (
              <li key={person.userId} className="board-waiting__person">
                <BlueAvatar name={person.name} size="sm" />
                <span className="board-waiting__name">
                  {person.name}
                  {person.isMe ? <span className="board-column__you">{t('meetings.board.youMark')}</span> : null}
                </span>
                {person.role === 'leader' ? <span className="board-waiting__role">{t('meetings.waiting.leader')}</span> : null}
                {person.isMe && canAdd ? (
                  <button
                    type="button"
                    className="link-button board-waiting__add"
                    onClick={() => {
                      setOpen(false);
                      onAdd();
                    }}
                  >
                    {t('meetings.waiting.addYours')}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

type DragSort = ReturnType<typeof useDragSort>;

function BoardColumn({
  column,
  item,
  handle,
  canArrangeNotes,
  onMoveNote,
  canAdd,
  onAdd,
  onOpen,
  onHover,
}: {
  column: MeetingBoardColumn;
  /** Where the group is measured and moved while the speaking order is dragged. */
  item: ReturnType<DragSort['itemProps']>;
  /** The name bar as the part held to drag the group: any for the leader, my own for a member (else empty). */
  handle: ReturnType<DragSort['handleProps']>;
  canArrangeNotes: boolean;
  onMoveNote: (from: number, to: number) => void;
  canAdd: boolean;
  onAdd: () => void;
  onOpen: (noteId: string) => void;
  onHover: (noteId: string) => void;
}) {
  const { t } = useTranslation();
  const cards = useDragSort({ ids: column.notes.map((n) => n.id), enabled: canArrangeNotes, onMove: onMoveNote });
  const sortable = 'data-sortable' in handle;
  const notesLabel = t('meetings.counts.notes', { count: column.notes.length });
  const flags: ReactNode[] = [];
  if (column.role === 'leader') flags.push(<BlueBadge key="leader" variant="info">{t('meetings.column.leader')}</BlueBadge>);
  if (column.role === null) flags.push(<BlueBadge key="left">{t('meetings.column.left')}</BlueBadge>);
  if (!column.active) flags.push(<BlueBadge key="inactive" variant="warning">{t('meetings.column.deactivated')}</BlueBadge>);

  return (
    <section
      {...item}
      className={`board-column ${column.isMe ? 'board-column--me' : ''}`.trim()}
      role="listitem"
      aria-label={`${column.name}: ${notesLabel}`}
    >
      <header
        className="board-column__head"
        {...handle}
        {...(sortable ? { tabIndex: 0, 'aria-label': t('meetings.column.handle', { name: column.name }) } : {})}
      >
        {sortable ? <GripGlyph /> : null}
        <BlueAvatar name={column.name} size="sm" />
        <span className="board-column__name">
          {column.name}
          {column.isMe ? <span className="board-column__you">{t('meetings.board.youMark')}</span> : null}
        </span>
        {flags.length > 0 ? <span className="board-column__flags">{flags}</span> : null}
        {/* Only worth saying when someone added more than one: most people add one note a week. */}
        {column.notes.length > 1 ? (
          <span className="board-column__count" aria-hidden="true">
            {notesLabel}
          </span>
        ) : null}
      </header>

      <div className="board-column__cards">
        {column.notes.map((card) => (
          <div key={card.id} className="board-card-slot" {...cards.itemProps(card.id)}>
            <BoardCard card={card} author={column.name} onOpen={onOpen} onHover={onHover} handle={cards.handleProps(card.id)} />
          </div>
        ))}
      </div>

      {canAdd ? (
        <button type="button" className="board-column__add" onClick={onAdd}>
          {t('meetings.column.addAnother')}
        </button>
      ) : null}
    </section>
  );
}

function BoardCard({
  card,
  author,
  onOpen,
  onHover,
  handle,
}: {
  card: MeetingNoteCard;
  author: string;
  onOpen: (noteId: string) => void;
  onHover: (noteId: string) => void;
  /** Holding the card drags it (empty when it may not be moved). */
  handle: ReturnType<DragSort['handleProps']>;
}) {
  const { t } = useTranslation();
  const title = card.title || t('meetings.untitled');
  const shownProjects = card.projects.slice(0, 3);
  const sortable = 'data-sortable' in handle;
  return (
    <button
      type="button"
      className="board-card"
      {...handle}
      onClick={() => onOpen(card.id)}
      onMouseEnter={() => onHover(card.id)}
      onFocus={() => onHover(card.id)}
      aria-label={t(sortable ? 'meetings.card.labelMovable' : 'meetings.card.label', { title, author })}
    >
      {card.coverUrl ? (
        <span className="board-card__cover">
          <img src={card.coverUrl} alt="" loading="lazy" draggable={false} />
        </span>
      ) : null}
      <span className="board-card__body">
        <span className={`board-card__title ${card.title ? '' : 'board-card__title--untitled'}`.trim()}>{title}</span>
        {shownProjects.length > 0 ? (
          <span className="board-card__projects">
            {shownProjects.map((name) => (
              <span key={name} className="project-chip">
                {name}
              </span>
            ))}
            {card.projects.length > shownProjects.length ? (
              <span className="board-card__more">+{card.projects.length - shownProjects.length}</span>
            ) : null}
          </span>
        ) : null}
        <span className="board-card__snippet">{card.snippet || t('meetings.emptyNote')}</span>
        <span className="board-card__meta">
          <span>{t('meetings.card.edited', { when: relativeDate(card.updatedAt) })}</span>
          {card.imageCount > 0 ? (
            <span className="board-card__images" title={t('meetings.counts.images', { count: card.imageCount })}>
              <ImageGlyph /> {card.imageCount}
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}

function GripGlyph() {
  return (
    <svg className="board-column__grip" width="12" height="16" viewBox="0 0 12 16" fill="currentColor" aria-hidden="true">
      <circle cx="3" cy="3" r="1.4" />
      <circle cx="9" cy="3" r="1.4" />
      <circle cx="3" cy="8" r="1.4" />
      <circle cx="9" cy="8" r="1.4" />
      <circle cx="3" cy="13" r="1.4" />
      <circle cx="9" cy="13" r="1.4" />
    </svg>
  );
}

function ImageGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="m21 17-5-5-9 8" />
    </svg>
  );
}
