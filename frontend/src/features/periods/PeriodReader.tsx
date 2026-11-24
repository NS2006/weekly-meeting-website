import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { PeriodDetail, PeriodMeetingNotes } from '@weekly-meeting/shared';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { BlueAlert, BlueAvatar, BlueBadge, BlueButton, BlueCard, BlueEmptyState, BlueSelect, BlueSkeleton } from '../../components/blue';
import { BackToTop } from '../../components/BackToTop';
import { NotesIcon } from '../../components/icons';
import { useJumpSelect } from '../../hooks/useJumpSelect';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { ApiFailure } from '../../services/api';
import { formatDay, formatFullDay, todayWib } from '../../utils/dates';
import { errorLabel } from '../../utils/errorLabels';
import { cancelReason, meetingName } from '../meetings/meetingName';
import { DateTile } from '../meetings/MeetingParts';
import { NoteContentView } from '../notes/NoteContentView';
import { scrollBehavior, useActiveSection } from '../notes/ProjectNav';
import { ChecklistFilter } from './ChecklistFilter';
import { describeSelection, exportFileName, filterNotes, parseSelection, peopleOf, selectionParam, type Selection } from './readerFilter';
import { dayRange, periodNoun } from './split';
import { usePeriodNotes } from './usePeriods';
import '../notes/notes.css';
import '../notes/projectNav.css';

const meetingAnchor = (meetingId: string) => `read-${meetingId}`;
const personAnchor = (meetingId: string, userId: string) => `read-${meetingId}-${userId}`;

/** How far below the window's top a part counts as being read: under the header (and the phone's "Go to" bar). */
function readingOffset(): number {
  const header = document.querySelector('.app__header')?.getBoundingClientRect().height ?? 0;
  const jump = document.querySelector('.period-jump')?.getBoundingClientRect().height ?? 0;
  return header + jump + 24;
}

/**
 * Brings a meeting or person to the top. A long way is one jump (like Word's navigation pane): scrolling smoothly past
 * thousands of pixels of notes loads their pictures on the way, which push the target down. Pictures above it can
 * still finish loading afterwards, so once the page has settled it is put back at the top, unless the person has
 * started scrolling or pressing keys themselves.
 */
function jumpTo(element: HTMLElement) {
  const far = Math.abs(element.getBoundingClientRect().top) > window.innerHeight * 1.5;
  element.scrollIntoView({ behavior: far ? 'auto' : scrollBehavior(), block: 'start' });
  let cancelled = false;
  const inputs = ['wheel', 'touchmove', 'keydown', 'mousedown'] as const;
  const cancel = () => {
    cancelled = true;
  };
  for (const name of inputs) window.addEventListener(name, cancel, { capture: true, passive: true, once: true });
  const settle = () => {
    if (cancelled) return;
    const wanted = parseFloat(getComputedStyle(element).scrollMarginTop) || 0;
    if (Math.abs(element.getBoundingClientRect().top - wanted) > 8) element.scrollIntoView({ behavior: 'auto', block: 'start' });
  };
  // Twice: when the scroll has ended, and again after the pictures near it had time to load.
  window.setTimeout(settle, far ? 250 : 900);
  window.setTimeout(() => {
    settle();
    for (const name of inputs) window.removeEventListener(name, cancel, { capture: true });
  }, 1500);
}

/**
 * "Read notes" (owner, 2026-11-23, filters 2026-11-24): the notes shared on the period's meetings, in full, meeting by
 * meeting and in each meeting's speaking order, like the quarter's Word file. All of them, or the meetings and people
 * picked (kept in the address). Beside them, a column that stays in view: what to read, the downloads, and the
 * meetings to jump to (and, under the one being read, its people); on a phone a "Go to" list that stays at the top.
 * "Back to top" shows once the page is scrolled down. What is shown is downloaded as a PDF or a Word file (owner, 2026-11-24:
 * the PDF too is made here, not through the print window, which still prints the page as it is).
 */
export function PeriodReader({ period }: { period: PeriodDetail }) {
  const { t } = useTranslation();
  const notes = usePeriodNotes(period.teamId, period.key, true);
  const code = notes.error instanceof ApiFailure ? notes.error.code : notes.error ? 'unknown_error' : null;

  // A failed refresh (a dropped connection) keeps what is being read; only a first load that fails says so.
  if (code && !notes.data) return <BlueAlert variant="error">{errorLabel(code)}</BlueAlert>;
  if (!notes.data) {
    return (
      <div className="period-reader__loading" role="status">
        <span className="visually-hidden">{t('periods.reader.loading')}</span>
        <BlueSkeleton width="40%" height={20} />
        <BlueSkeleton width="90%" height={14} />
        <BlueSkeleton width="75%" height={14} />
        <BlueSkeleton width="82%" height={14} />
      </div>
    );
  }
  if (notes.data.meetings.length === 0) {
    return (
      <BlueCard>
        <BlueEmptyState icon={<NotesIcon size={26} />} title={t('periods.reader.emptyTitle')}>
          {t('periods.reader.emptyBody', { label: period.label, noun: periodNoun(period.split.periodsPerYear) })}
        </BlueEmptyState>
      </BlueCard>
    );
  }
  return <ReadingView period={period} meetings={notes.data.meetings} />;
}

function ReadingView({ period, meetings }: { period: PeriodDetail; meetings: PeriodMeetingNotes[] }) {
  const { t } = useTranslation();
  const people = (count: number) => t('periods.reader.personCount', { count });
  const today = todayWib();
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const from = { path: `${location.pathname}${location.search}`, label: period.label };
  const narrow = useMediaQuery('(max-width: 900px)');
  const [saving, setSaving] = useState<{ kind: 'pdf' | 'word'; done: number; total: number } | null>(null);
  // After saving: what to tell (an error, or pictures left out), and the one line screen readers hear.
  const [saveResult, setSaveResult] = useState<{ kind: 'error' | 'note'; text: string } | null>(null);
  const [announce, setAnnounce] = useState('');
  const pdfId = useId();
  const wordId = useId();
  const top = useRef<HTMLDivElement>(null);
  // Leaving the page stops a file being made.
  const stopSaving = useRef<AbortController | null>(null);
  useEffect(() => () => stopSaving.current?.abort(), []);
  // A busy button is disabled, which drops the keyboard focus; it goes back to the button when done.
  const refocus = (id: string) =>
    requestAnimationFrame(() => {
      if (document.activeElement === document.body || document.activeElement === null) document.getElementById(id)?.focus();
    });

  // Which meetings and whose notes: in the address (?meetings=…&people=…), everything when absent.
  const meetingIds = useMemo(() => meetings.map((m) => m.id), [meetings]);
  const everyone = useMemo(() => peopleOf(meetings), [meetings]);
  const userIds = useMemo(() => everyone.map((p) => p.userId), [everyone]);
  const meetingsParam = params.get('meetings') ?? '';
  const peopleParam = params.get('people') ?? '';
  const pickedMeetings = useMemo(() => parseSelection(meetingsParam, meetingIds), [meetingsParam, meetingIds]);
  const pickedPeople = useMemo(() => parseSelection(peopleParam, userIds), [peopleParam, userIds]);
  const shown = useMemo(() => filterNotes(meetings, pickedMeetings, pickedPeople), [meetings, pickedMeetings, pickedPeople]);
  const filtered = pickedMeetings !== null || pickedPeople !== null;
  const selection = describeSelection(meetings, pickedMeetings, pickedPeople);
  // Downloads are always in English (owner, 2026-11-24).
  const selectionInEnglish = describeSelection(meetings, pickedMeetings, pickedPeople, 'en');

  const pick = (name: 'meetings' | 'people', next: Selection, available: readonly string[]) =>
    setParams(
      (current) => {
        const updated = new URLSearchParams(current);
        const value = selectionParam(next, available);
        if (value) updated.set(name, value);
        else updated.delete(name);
        return updated;
      },
      { replace: true },
    );
  const showAll = () =>
    setParams(
      (current) => {
        const updated = new URLSearchParams(current);
        updated.delete('meetings');
        updated.delete('people');
        return updated;
      },
      { replace: true },
    );

  // Every place to jump to, top to bottom: each meeting shown, then each of its people.
  const entries = useMemo(
    () =>
      shown.flatMap((m) => [
        { key: meetingAnchor(m.id), meetingId: m.id },
        ...m.people.map((p) => ({ key: personAnchor(m.id, p.userId), meetingId: m.id })),
      ]),
    [shown],
  );
  const keys = useMemo(() => entries.map((e) => e.key), [entries]);
  const [active, choose] = useActiveSection(keys, (key) => document.getElementById(key), window, readingOffset);
  const activeMeeting = entries.find((e) => e.key === active)?.meetingId ?? shown[0]?.id;

  const go = (key: string) => {
    const element = document.getElementById(key);
    if (!element) return;
    jumpTo(element);
    element.focus({ preventScroll: true });
    choose(key);
  };

  // Back from a meeting opened here ("Open meeting"), the address names that meeting (#read-…): carry on from it.
  // Read once, when the notes first show; an address naming nothing here starts at the top.
  useEffect(() => {
    const target = location.hash.slice(1);
    if (keys.includes(target)) go(target);
    else if (target) window.scrollTo(0, 0);
  }, []);

  // What is shown, as a PDF or a Word file. Each library loads only now. The messages here are in the interface
  // language; the file is in English.
  async function save(kind: 'pdf' | 'word') {
    const controller = new AbortController();
    stopSaving.current = controller;
    setSaveResult(null);
    setSaving({ kind, done: 0, total: 0 });
    setAnnounce(t(`periods.reader.save.${kind}.preparing`));
    try {
      const input = {
        title: `${period.teamName} · ${period.label}`,
        subtitle: dayRange(period.start, period.end, 'en'),
        selection: selectionInEnglish,
        exportedOn: today,
        meetings: shown,
      };
      const fileName = exportFileName(period.teamName, period.label, meetings, pickedMeetings, pickedPeople, kind === 'pdf' ? 'pdf' : 'docx');
      const progress = (done: number, total: number) => setSaving({ kind, done, total });
      const { missing } =
        kind === 'pdf'
          ? await (await import('./saveAsPdf')).saveAsPdf(input, fileName, progress, controller.signal)
          : await (await import('./saveAsWord')).saveAsWord(input, fileName, progress, controller.signal);
      if (controller.signal.aborted) return;
      const note = missing > 0 ? t(`periods.reader.save.${kind}.savedMissing`, { count: missing }) : null;
      setSaveResult(note ? { kind: 'note', text: note } : null);
      setAnnounce(note ?? t(`periods.reader.save.${kind}.saved`));
    } catch (error) {
      if (controller.signal.aborted) return;
      const text =
        error instanceof ApiFailure && error.code === 'unauthenticated'
          ? errorLabel('unauthenticated')
          : t(`periods.reader.save.${kind}.failed`);
      setSaveResult({ kind: 'error', text });
      setAnnounce(text);
    } finally {
      if (!controller.signal.aborted) {
        setSaving(null);
        refocus(kind === 'pdf' ? pdfId : wordId);
      }
    }
  }

  const filterControls = (
    <div className="period-tools__filters" role="group" aria-label={t('periods.reader.choose')}>
      <ChecklistFilter
        label={t('periods.reader.meetingsLabel')}
        noun={t('periods.reader.meetingsNoun')}
        options={meetings.map((m) => ({ value: m.id, label: formatDay(m.date), detail: people(m.people.length) }))}
        selected={pickedMeetings}
        onChange={(next) => pick('meetings', next, meetingIds)}
      />
      <ChecklistFilter
        label={t('periods.reader.peopleLabel')}
        noun={t('periods.reader.peopleNoun')}
        options={everyone.map((p) => ({ value: p.userId, label: p.name, detail: t('periods.reader.meetingCount', { count: p.meetings }) }))}
        selected={pickedPeople}
        onChange={(next) => pick('people', next, userIds)}
      />
      {filtered ? (
        <button type="button" className="link-button small" onClick={showAll}>
          {t('periods.reader.showAll')}
        </button>
      ) : null}
    </div>
  );
  const saveButtons = (
    <div className="period-tools__save">
      <BlueButton
        id={pdfId}
        variant="secondary"
        size="sm"
        loading={saving?.kind === 'pdf'}
        disabled={shown.length === 0 || saving !== null}
        title={t('periods.reader.save.pdf.title')}
        onClick={() => void save('pdf')}
      >
        {t('periods.reader.save.pdf.button')}
      </BlueButton>
      <BlueButton
        id={wordId}
        variant="secondary"
        size="sm"
        loading={saving?.kind === 'word'}
        disabled={shown.length === 0 || saving !== null}
        title={t('periods.reader.save.word.title')}
        onClick={() => void save('word')}
      >
        {t('periods.reader.save.word.button')}
      </BlueButton>
    </div>
  );
  // Progress is shown, not read out picture by picture: screen readers hear the start and the end only.
  const progress = saving
    ? saving.total > 0
      ? t(`periods.reader.save.${saving.kind}.progressPictures`, { done: saving.done, total: saving.total })
      : t(`periods.reader.save.${saving.kind}.progress`)
    : null;
  const result = saveResult ? (
    <BlueAlert variant={saveResult.kind === 'error' ? 'error' : 'warning'} onDismiss={() => setSaveResult(null)}>
      {saveResult.text}
    </BlueAlert>
  ) : null;

  // Wide screens (owner, 2026-11-24): what to read and the downloads sit at the top of the column beside the notes,
  // which stays in view while reading, so they can be changed halfway down; the meetings list below them scrolls on
  // its own when there are many. Phones keep them above the notes, with the "Go to" list that stays at the top.
  return (
    <div className="period-reader" ref={top} tabIndex={-1}>
      {narrow ? (
        <div className="period-reader__bar">
          {filterControls}
          {saveButtons}
        </div>
      ) : null}
      <p className="muted small period-reader__summary">{narrow && progress ? progress : t('periods.reader.summary', { selection })}</p>
      <p className="visually-hidden" aria-live="polite">
        {announce}
      </p>
      {narrow ? result : null}
      {/* On paper, what was picked stands under the period's name. */}
      <p className="period-print-selection">{selection}</p>
      <div className="period-reader__layout">
        {narrow ? (
          shown.length > 0 ? (
            <JumpBar meetings={shown} active={active} onGo={go} />
          ) : null
        ) : (
          <aside className="period-side" aria-label={t('periods.reader.sideLabel')}>
            <div className="period-tools">
              {filterControls}
              {saveButtons}
              {progress ? <p className="muted small period-tools__status">{progress}</p> : null}
              {result}
            </div>
            {shown.length > 0 ? (
              <ReadingNav label={period.label} meetings={shown} active={active} activeMeeting={activeMeeting} onGo={go} />
            ) : null}
          </aside>
        )}
        <div className="period-reader__content">
          {shown.length === 0 ? (
            <BlueCard>
              <BlueEmptyState
                icon={<NotesIcon size={26} />}
                title={t('periods.reader.noNotesTitle')}
                action={
                  <BlueButton variant="secondary" onClick={showAll}>
                    {t('periods.reader.showAll')}
                  </BlueButton>
                }
              >
                {t('periods.reader.noNotesBody')}
              </BlueEmptyState>
            </BlueCard>
          ) : (
            shown.map((m) => (
              <MeetingNotes
                key={m.id}
                meeting={m}
                today={today}
                from={{ ...from, path: `${from.path}#${meetingAnchor(m.id)}` }}
                // Before leaving, this page's own address names the meeting, so the browser's Back returns to it too.
                onOpen={() => void navigate({ search: location.search, hash: meetingAnchor(m.id) }, { replace: true, state: location.state })}
              />
            ))
          )}
        </div>
      </div>
      <BackToTop focusTarget={top} />
    </div>
  );
}

/**
 * Beside the notes: the meetings (with how many people wrote), and the people of the one being read. With many, the
 * list scrolls on its own, and keeps the meeting or person being read in view as the notes go by.
 */
function ReadingNav({
  label,
  meetings,
  active,
  activeMeeting,
  onGo,
}: {
  label: string;
  meetings: PeriodMeetingNotes[];
  active: string | null;
  activeMeeting: string | undefined;
  onGo: (key: string) => void;
}) {
  const { t } = useTranslation();
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    const list = nav.current;
    const item = list?.querySelector<HTMLElement>('[aria-current="location"]') ?? list?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!list || !item) return;
    // Only the list moves (scrollIntoView would move the page too).
    const box = list.getBoundingClientRect();
    const at = item.getBoundingClientRect();
    if (at.top < box.top) list.scrollTop -= box.top - at.top + 8;
    else if (at.bottom > box.bottom) list.scrollTop += at.bottom - box.bottom + 8;
  }, [active, activeMeeting]);
  return (
    <nav ref={nav} className="period-nav" aria-label={t('periods.reader.navLabel', { label })}>
      <p className="project-nav__title">{t('periods.reader.navTitle')}</p>
      <ol className="period-nav__list">
        {meetings.map((m) => {
          const open = m.id === activeMeeting;
          return (
            <li key={m.id}>
              <button
                type="button"
                className={`project-nav__item period-nav__meeting${open ? ' project-nav__item--active' : ''}`}
                // The meeting being read; "location" when it is the meeting itself, not one of its people.
                aria-current={open ? (active === meetingAnchor(m.id) ? 'location' : 'true') : undefined}
                onClick={() => onGo(meetingAnchor(m.id))}
              >
                <span>{formatDay(m.date)}</span>
                <span className="period-nav__count" aria-hidden="true">
                  {m.people.length}
                </span>
                <span className="visually-hidden">, {t('periods.reader.personCount', { count: m.people.length })}</span>
              </button>
              {open ? (
                <ul className="period-nav__people">
                  {m.people.map((p) => {
                    const key = personAnchor(m.id, p.userId);
                    return (
                      <li key={p.userId}>
                        <button
                          type="button"
                          className={`period-nav__person${key === active ? ' period-nav__person--active' : ''}`}
                          aria-current={key === active ? 'location' : undefined}
                          onClick={() => onGo(key)}
                        >
                          {p.name}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** On a phone: one "Go to" list (meetings, and their people under them) that stays below the header. */
function JumpBar({ meetings, active, onGo }: { meetings: PeriodMeetingNotes[]; active: string | null; onGo: (key: string) => void }) {
  const { t } = useTranslation();
  const jump = useJumpSelect(active ?? meetingAnchor(meetings[0]?.id ?? ''), onGo);
  const options = meetings.flatMap((m) => [
    { value: meetingAnchor(m.id), label: `${formatDay(m.date)} · ${t('periods.reader.personCount', { count: m.people.length })}` },
    // Non-breaking spaces: the list keeps them, so people sit under their meeting.
    ...m.people.map((p) => ({ value: personAnchor(m.id, p.userId), label: `    ${p.name}` })),
  ]);
  return (
    <div className="period-jump">
      <span className="period-jump__label small" aria-hidden="true">
        {t('periods.reader.goTo')}
      </span>
      <BlueSelect size="sm" ariaLabel={t('periods.reader.goToLabel')} options={options} {...jump} />
    </div>
  );
}

/** One meeting's notes: its day and name, then each person (in speaking order) with their notes in full. */
function MeetingNotes({
  meeting,
  today,
  from,
  onOpen,
}: {
  meeting: PeriodMeetingNotes;
  today: string;
  from: { path: string; label: string };
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const titleId = `${meetingAnchor(meeting.id)}-title`;
  return (
    <section id={meetingAnchor(meeting.id)} tabIndex={-1} className="period-meeting" aria-labelledby={titleId}>
      <header className="period-meeting__head">
        <DateTile date={meeting.date} today={today} />
        <div className="period-meeting__text">
          <h2 id={titleId} className="period-meeting__title">
            {formatFullDay(meeting.date)}
            {meeting.status === 'cancelled' ? <BlueBadge variant="error">{t('periods.reader.cancelled')}</BlueBadge> : null}
          </h2>
          <span className="muted small period-meeting__meta">
            <span>{meetingName(meeting)}</span>
            {cancelReason(meeting) ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{t('periods.reader.reason', { reason: cancelReason(meeting) ?? '' })}</span>
              </>
            ) : null}
            <span aria-hidden="true">·</span>
            <span>{t('periods.reader.personCount', { count: meeting.people.length })}</span>
            <span aria-hidden="true">·</span>
            <Link to={`/meetings/${meeting.id}`} state={{ from: from.path, fromLabel: from.label }} onClick={onOpen}>
              {t('periods.reader.openMeeting')}
            </Link>
          </span>
        </div>
      </header>
      {meeting.people.map((person) => (
        <article
          key={person.userId}
          id={personAnchor(meeting.id, person.userId)}
          tabIndex={-1}
          className="period-person"
          aria-label={`${person.name}, ${formatDay(meeting.date)}`}
        >
          <h3 className="period-person__name">
            <BlueAvatar name={person.name} size="sm" />
            {person.name}
          </h3>
          {person.notes.map((note) => (
            <div key={note.id} className="period-note">
              {note.title ? <p className="period-note__title">{note.title}</p> : null}
              <NoteContentView
                doc={note.content}
                className="period-note__content"
                sectionLabel={(projectId) => {
                  const project = projectId ? note.projects.find((p) => p.id === projectId) : undefined;
                  return project ? <span className="project-chip">{project.name}</span> : <span className="muted">{t('periods.reader.noProject')}</span>;
                }}
              />
            </div>
          ))}
        </article>
      ))}
    </section>
  );
}
