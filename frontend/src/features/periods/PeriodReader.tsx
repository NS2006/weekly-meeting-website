import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { PeriodDetail, PeriodMeetingIndex, PeriodMeetingNotes, PeriodNotesQuery } from '@weekly-meeting/shared';
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
import {
  describeSelection,
  exportFileName,
  filterNotes,
  isStale,
  meetingsParam,
  notesRequest,
  parseSelection,
  peopleOf,
  pickedMeetingsOf,
  READER_LATEST,
  readingPlan,
  selectionParam,
  showsLatest,
  splitParts,
  type Selection,
} from './readerFilter';
import { dayRange, periodNoun } from './split';
import { fetchPart, usePeriodNotes, usePeriodParts } from './usePeriods';
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
 * meeting and in each meeting's speaking order, like the quarter's Word file. The latest 3 meetings at the start
 * (owner, 2026-11-25: only those are loaded, so a full quarter opens quickly), all of them once asked for, or the
 * meetings and people picked (kept in the address). They load a part at a time (stress test, 2026-11-25: a big team's
 * quarter is thousands of notes), the next as the reader scrolls near the end; the meeting list and "Go to" show the
 * whole reading and load up to a meeting that is not there yet; a download fetches the rest first. Beside them, a column that stays in view: what to read, the downloads, and the
 * meetings to jump to (and, under the one being read, its people); on a phone a "Go to" list that stays at the top.
 * "Back to top" shows once the page is scrolled down. What is shown is downloaded as a PDF or a Word file (owner, 2026-11-24:
 * the PDF too is made here, not through the print window, which still prints the page as it is).
 */
export function PeriodReader({ period }: { period: PeriodDetail }) {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const request = notesRequest(params.get('meetings') ?? '', params.get('people') ?? '');
  const notes = usePeriodNotes(period.teamId, period.key, request, true);
  const index = notes.data?.index;
  const code = notes.error instanceof ApiFailure ? notes.error.code : notes.error ? 'unknown_error' : null;

  // A failed refresh (a dropped connection) keeps what is being read; only a first load that fails says so.
  if (code && !index) return <BlueAlert variant="error">{errorLabel(code)}</BlueAlert>;
  if (!notes.data || !index) {
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
  if (index.length === 0) {
    return (
      <BlueCard>
        <BlueEmptyState icon={<NotesIcon size={26} />} title={t('periods.reader.emptyTitle')}>
          {t('periods.reader.emptyBody', { label: period.label, noun: periodNoun(period.split.periodsPerYear) })}
        </BlueEmptyState>
      </BlueCard>
    );
  }
  return (
    <ReadingView
      period={period}
      index={index}
      first={notes.data.meetings}
      rest={notes.data.rest}
      request={request}
      refreshing={notes.isPlaceholderData}
    />
  );
}

/** "read-<meeting id>" or "read-<meeting id>-<user id>": the meeting's id. */
const meetingOfKey = (key: string) => key.slice('read-'.length, 'read-'.length + 36);

function ReadingView({
  period,
  index,
  first,
  rest,
  request,
  refreshing,
}: {
  period: PeriodDetail;
  /** Every meeting of the period with notes (who wrote and how many notes, no text): pickers, counts and parts. */
  index: PeriodMeetingIndex[];
  /** The first part of the reading, in full (about 100 notes). */
  first: PeriodMeetingNotes[];
  /** The other meetings of the reading, in order: they load in parts of their own as they come near (or are picked). */
  rest: string[];
  /** What was asked for (the later parts, and a download, ask for the rest of it). */
  request: PeriodNotesQuery;
  /** Another pick is loading: the notes on screen are the previous ones. */
  refreshing: boolean;
}) {
  const { t } = useTranslation();
  const people = (count: number) => t('periods.reader.personCount', { count });
  const today = todayWib();
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const from = { path: `${location.pathname}${location.search}`, label: period.label };
  const narrow = useMediaQuery('(max-width: 900px)');
  // `notes`: the parts not loaded yet are fetched first (done / total are then meetings, else pictures).
  const [saving, setSaving] = useState<{ kind: 'pdf' | 'word'; done: number; total: number; notes?: boolean } | null>(null);
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

  // Which meetings and whose notes: in the address (?meetings=…&people=…). No `meetings`: the latest 3 (owner,
  // 2026-11-25); `all`: every meeting; no `people`: everyone.
  const everyone = useMemo(() => peopleOf(index), [index]);
  const userIds = useMemo(() => everyone.map((p) => p.userId), [everyone]);
  const meetingsValue = params.get('meetings') ?? '';
  const peopleParam = params.get('people') ?? '';
  const pickedMeetings = useMemo(() => pickedMeetingsOf(meetingsValue, index), [meetingsValue, index]);
  const pickedPeople = useMemo(() => parseSelection(peopleParam, userIds), [peopleParam, userIds]);
  const filtered = pickedMeetings !== null || pickedPeople !== null;
  const latestOnly = showsLatest(meetingsValue, index);
  const selection = describeSelection(index, pickedMeetings, pickedPeople);
  // Downloads are always in English (owner, 2026-11-24).
  const selectionInEnglish = describeSelection(index, pickedMeetings, pickedPeople, 'en');

  // The reading, in order: the first part, then the meetings the server left for later, split into the same parts it
  // makes (readerFilter `splitParts`), each loaded on its own when it comes near or is picked (stress test, 2026-11-25).
  const plan = useMemo(() => readingPlan(index, pickedMeetings, pickedPeople), [index, pickedMeetings, pickedPeople]);
  const planById = useMemo(() => new Map(plan.map((m) => [m.id, m])), [plan]);
  const notesIn = (meetingId: string) => planById.get(meetingId)?.people.reduce((n, p) => n + p.noteCount, 0) ?? 0;
  const parts = useMemo(() => splitParts(rest.map((id) => ({ id, notes: notesIn(id) }))), [rest, planById]);
  const partOf = useMemo(() => new Map(parts.flatMap((ids, at) => ids.map((id) => [id, at] as const))), [parts]);
  // The parts asked for so far, by their first meeting (a new pick makes new parts, which start unasked).
  const [wanted, setWanted] = useState<ReadonlySet<string>>(() => new Set());
  const want = (meetingId: string) => {
    const at = partOf.get(meetingId);
    const key = at === undefined ? undefined : parts[at]?.[0];
    if (key) setWanted((current) => (current.has(key) ? current : new Set(current).add(key)));
  };
  const partResults = usePeriodParts(period.teamId, period.key, request, parts, wanted);
  const order = useMemo(() => [...first.map((m) => m.id), ...rest], [first, rest]);
  const loadedById = useMemo(() => {
    const byId = new Map(first.map((m) => [m.id, m]));
    for (const result of partResults) for (const m of result.data ?? []) byId.set(m.id, m);
    return byId;
  }, [first, partResults]);
  const loaded = useMemo(() => order.flatMap((id) => loadedById.get(id) ?? []), [order, loadedById]);
  const shown = useMemo(() => filterNotes(loaded, pickedMeetings, pickedPeople), [loaded, pickedMeetings, pickedPeople]);
  const shownById = useMemo(() => new Map(shown.map((m) => [m.id, m])), [shown]);
  // The meetings of the reading as the list beside the notes names them, loaded or not.
  const heads = useMemo(() => order.flatMap((id) => planById.get(id) ?? []), [order, planById]);

  const setParam = (name: 'meetings' | 'people', value: string) =>
    setParams(
      (current) => {
        const updated = new URLSearchParams(current);
        if (value) updated.set(name, value);
        else updated.delete(name);
        return updated;
      },
      { replace: true },
    );
  const pickMeetings = (next: Selection) => setParam('meetings', meetingsParam(next, index));
  // An address naming none of this period's meetings (an old link) starts over at the latest ones.
  useEffect(() => {
    if (isStale(meetingsValue, index)) setParam('meetings', '');
  }, [meetingsValue, index]);
  const pickPeople = (next: Selection) => setParam('people', selectionParam(next, userIds));
  // An address naming people who wrote nothing here (an old link) is read as everyone, so the request says so too.
  useEffect(() => {
    if (peopleParam && peopleParam !== 'none' && peopleParam.split(',').some((id) => !userIds.includes(id))) {
      setParam('people', selectionParam(pickedPeople, userIds));
    }
  }, [peopleParam, pickedPeople, userIds]);
  // Every meeting and everyone.
  const showAll = () =>
    setParams(
      (current) => {
        const updated = new URLSearchParams(current);
        const all = meetingsParam(null, index);
        if (all) updated.set('meetings', all);
        else updated.delete('meetings');
        updated.delete('people');
        return updated;
      },
      { replace: true },
    );

  // Every place to jump to, top to bottom: each meeting (loaded or waiting), then each person of a loaded one.
  const entries = useMemo(
    () =>
      heads.flatMap((m) => [
        { key: meetingAnchor(m.id), meetingId: m.id },
        ...(shownById.get(m.id)?.people ?? []).map((p) => ({ key: personAnchor(m.id, p.userId), meetingId: m.id })),
      ]),
    [heads, shownById],
  );
  const keys = useMemo(() => entries.map((e) => e.key), [entries]);
  const [active, choose] = useActiveSection(keys, (key) => document.getElementById(key), window, readingOffset);
  const activeMeeting = entries.find((e) => e.key === active)?.meetingId ?? heads[0]?.id;

  // Every meeting and person of the reading, loaded or not.
  const planKeys = useMemo(
    () => new Set(plan.flatMap((m) => [meetingAnchor(m.id), ...m.people.map((p) => personAnchor(m.id, p.userId))])),
    [plan],
  );
  const isWaiting = (element: HTMLElement | null) => element?.classList.contains('period-meeting--waiting') ?? false;
  // A place picked whose part is still loading: gone to again once it has (unless the reader moves on first).
  const [pending, setPending] = useState<string | null>(null);
  const go = (key: string) => {
    const element = document.getElementById(key) ?? document.getElementById(meetingAnchor(meetingOfKey(key)));
    if (!element) return;
    jumpTo(element);
    element.focus({ preventScroll: true });
    if (keys.includes(key)) choose(key);
    const there = document.getElementById(key);
    if (!there || isWaiting(there)) {
      want(meetingOfKey(key));
      setPending(key);
    } else setPending(null);
  };
  useEffect(() => {
    if (!pending) return;
    const element = document.getElementById(pending);
    const at = partOf.get(meetingOfKey(pending));
    if (element && !isWaiting(element)) go(pending);
    else if (at !== undefined && partResults[at]?.isError) setPending(null);
  }, [pending, loadedById]);
  // Scrolling or typing meanwhile means the reader went on: no jump back when the part arrives.
  useEffect(() => {
    if (!pending) return;
    const inputs = ['wheel', 'touchmove', 'keydown', 'mousedown'] as const;
    const cancel = () => setPending(null);
    // From the next turn: the click that picked the place must not cancel it.
    const timer = window.setTimeout(() => {
      for (const name of inputs) window.addEventListener(name, cancel, { capture: true, passive: true, once: true });
    }, 0);
    return () => {
      window.clearTimeout(timer);
      for (const name of inputs) window.removeEventListener(name, cancel, { capture: true });
    };
  }, [pending]);

  // A meeting waiting for its part asks for it when it comes within about two screens.
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const waiting = content.current?.querySelectorAll<HTMLElement>('.period-meeting--waiting') ?? [];
    if (waiting.length === 0 || refreshing) return;
    const observer = new IntersectionObserver(
      (seen) => {
        for (const entry of seen) if (entry.isIntersecting) want(meetingOfKey(entry.target.id));
      },
      { rootMargin: '1500px 0px 1500px 0px' },
    );
    waiting.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [heads, loadedById, refreshing, parts]);

  // Back from a meeting opened here ("Open meeting"), the address names that meeting (#read-…): carry on from it.
  // Read once, when the notes first show; an address naming nothing here starts at the top.
  useEffect(() => {
    const target = location.hash.slice(1);
    if (planKeys.has(target)) go(target);
    else if (target) window.scrollTo(0, 0);
  }, []);

  /**
   * Everything the reading holds, for a download: the parts loaded, and the others fetched here one after the other
   * (without putting them on the page). Null when the download was stopped.
   */
  async function everything(kind: 'pdf' | 'word', signal: AbortSignal): Promise<PeriodMeetingNotes[] | null> {
    const byId = new Map(loadedById);
    for (const ids of parts) {
      if (ids.every((id) => byId.has(id))) continue;
      if (signal.aborted) return null;
      setSaving({ kind, done: order.filter((id) => byId.has(id)).length, total: order.length, notes: true });
      for (const m of await fetchPart(period.teamId, period.key, request, ids)) byId.set(m.id, m);
    }
    return filterNotes(order.flatMap((id) => byId.get(id) ?? []), pickedMeetings, pickedPeople);
  }

  // What is shown, as a PDF or a Word file. Each library loads only now. The messages here are in the interface
  // language; the file is in English.
  async function save(kind: 'pdf' | 'word') {
    const controller = new AbortController();
    stopSaving.current = controller;
    setSaveResult(null);
    setSaving({ kind, done: 0, total: 0 });
    setAnnounce(t(`periods.reader.save.${kind}.preparing`));
    try {
      const meetings = await everything(kind, controller.signal);
      if (!meetings || controller.signal.aborted) return;
      setSaving({ kind, done: 0, total: 0 });
      const input = {
        title: `${period.teamName} · ${period.label}`,
        subtitle: dayRange(period.start, period.end, 'en'),
        selection: selectionInEnglish,
        exportedOn: today,
        meetings,
      };
      const fileName = exportFileName(period.teamName, period.label, index, pickedMeetings, pickedPeople, kind === 'pdf' ? 'pdf' : 'docx');
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
        options={index.map((m) => ({ value: m.id, label: formatDay(m.date), detail: people(m.people.length) }))}
        selected={pickedMeetings}
        onChange={pickMeetings}
      />
      <ChecklistFilter
        label={t('periods.reader.peopleLabel')}
        noun={t('periods.reader.peopleNoun')}
        options={everyone.map((p) => ({ value: p.userId, label: p.name, detail: t('periods.reader.meetingCount', { count: p.meetings }) }))}
        selected={pickedPeople}
        onChange={pickPeople}
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
        disabled={shown.length === 0 || saving !== null || refreshing}
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
        disabled={shown.length === 0 || saving !== null || refreshing}
        title={t('periods.reader.save.word.title')}
        onClick={() => void save('word')}
      >
        {t('periods.reader.save.word.button')}
      </BlueButton>
    </div>
  );
  // Progress is shown, not read out picture by picture: screen readers hear the start and the end only.
  const progress = saving
    ? saving.notes
      ? t('periods.reader.save.gettingNotes', { done: saving.done, total: saving.total })
      : saving.total > 0
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
      <p className="muted small period-reader__summary" role="status">
        {narrow && progress
          ? progress
          : refreshing
            ? t('periods.reader.loading')
            : `${t('periods.reader.summary', { selection })}${latestOnly ? ` ${t('periods.reader.latestHint', { count: READER_LATEST })}` : ''}${
              loaded.length < order.length ? ` ${t('periods.reader.partial', { loaded: loaded.length, total: order.length })}` : ''
            }`}
      </p>
      <p className="visually-hidden" aria-live="polite">
        {announce}
      </p>
      {narrow ? result : null}
      {/* On paper, what was picked stands under the period's name. */}
      <p className="period-print-selection">{selection}</p>
      <div className="period-reader__layout">
        {narrow ? (
          shown.length > 0 ? (
            <JumpBar meetings={heads} active={active} onGo={go} />
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
              <ReadingNav label={period.label} meetings={heads} active={active} activeMeeting={activeMeeting} onGo={go} />
            ) : null}
          </aside>
        )}
        <div ref={content} className={`period-reader__content${refreshing ? ' is-refreshing' : ''}`}>
          {heads.length === 0 ? (
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
            heads.map((head) => {
              const m = shownById.get(head.id);
              if (m) {
                return (
                  <MeetingNotes
                    key={m.id}
                    meeting={m}
                    today={today}
                    from={{ ...from, path: `${from.path}#${meetingAnchor(m.id)}` }}
                    // Before leaving, this page's own address names the meeting, so the browser's Back returns to it too.
                    onOpen={() => void navigate({ search: location.search, hash: meetingAnchor(m.id) }, { replace: true, state: location.state })}
                  />
                );
              }
              const at = partOf.get(head.id);
              const result = at === undefined ? undefined : partResults[at];
              return (
                <MeetingWaiting
                  key={head.id}
                  meeting={head}
                  today={today}
                  notes={notesIn(head.id)}
                  failed={result?.isError ?? false}
                  onRetry={() => void result?.refetch()}
                />
              );
            })
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
  /** Every meeting of the reading, loaded or not (one not loaded yet loads when picked). */
  meetings: readonly PeriodMeetingIndex[];
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
function JumpBar({ meetings, active, onGo }: { meetings: readonly PeriodMeetingIndex[]; active: string | null; onGo: (key: string) => void }) {
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

/** About how tall a note is on screen: the room a meeting keeps while its part loads (so the page below stays put). */
const NOTE_HEIGHT_PX = 1100;

/**
 * A meeting of the reading whose part has not loaded yet: its heading and room for its notes, so the list beside and
 * "Go to" can lead here; the part loads when this comes near the screen.
 */
function MeetingWaiting({
  meeting,
  today,
  notes,
  failed,
  onRetry,
}: {
  meeting: PeriodMeetingIndex;
  today: string;
  /** How many notes it holds (for the room it keeps). */
  notes: number;
  failed: boolean;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const titleId = `${meetingAnchor(meeting.id)}-title`;
  return (
    <section
      id={meetingAnchor(meeting.id)}
      tabIndex={-1}
      className="period-meeting period-meeting--waiting"
      aria-labelledby={titleId}
      aria-busy={!failed}
      style={{ minHeight: `${Math.min(Math.max(notes, 1) * NOTE_HEIGHT_PX, 400_000)}px` }}
    >
      <header className="period-meeting__head">
        <DateTile date={meeting.date} today={today} />
        <div className="period-meeting__text">
          <h2 id={titleId} className="period-meeting__title">
            {formatFullDay(meeting.date)}
          </h2>
          <span className="muted small period-meeting__meta">
            <span>{meetingName(meeting)}</span>
            <span aria-hidden="true">·</span>
            <span>{t('periods.reader.personCount', { count: meeting.people.length })}</span>
          </span>
        </div>
      </header>
      {failed ? (
        <div className="period-reader__more">
          <span className="small">{t('periods.reader.loadMoreFailed')}</span>
          <BlueButton variant="secondary" size="sm" onClick={onRetry}>
            {t('periods.reader.retry')}
          </BlueButton>
        </div>
      ) : (
        <div className="period-meeting__waiting">
          <span className="visually-hidden">{t('periods.reader.loadingMore')}</span>
          <BlueSkeleton width="35%" height={18} />
          <BlueSkeleton width="90%" height={14} />
          <BlueSkeleton width="80%" height={14} />
        </div>
      )}
    </section>
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
