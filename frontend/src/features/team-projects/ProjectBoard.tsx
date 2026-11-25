import type { PeriodDetail, PeriodProject } from '@weekly-meeting/shared';
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useSearchParams } from 'react-router';
import { BackToTop } from '../../components/BackToTop';
import { BlueAlert, BlueAvatar, BlueButton, BlueCard, BlueEmptyState, BlueInput, BlueSelect, BlueSkeleton } from '../../components/blue';
import { NotesIcon } from '../../components/icons';
import { ApiFailure } from '../../services/api';
import { formatDay } from '../../utils/dates';
import { errorLabel } from '../../utils/errorLabels';
import { meetingName } from '../meetings/meetingName';
import { ChecklistFilter } from '../periods/ChecklistFilter';
import { parseSelection, selectionParam } from '../periods/readerFilter';
import {
  boardColumns,
  BOARD_SORTS,
  filterProjects,
  meetingOptions,
  onMeetings,
  groupParam,
  highlightParts,
  ownersOf,
  parseGroup,
  parseSort,
  type BoardColumn,
  type BoardGroup,
  type BoardSort,
} from './boardModel';
import { projectPath, type BoardTrail } from './projectTrail';
import { usePeriodProjects } from './useTeamProjects';
import './teamProjects.css';

/** The board's settings in the address, so reload, Back and a shared link keep them. */
const PARAM = { group: 'group', search: 'search', owners: 'owners', meetings: 'meetings', sort: 'sort' } as const;

/**
 * A period's Projects tab (owner, 2026-11-24: on the quarter page, like a Trello board): the team members' projects
 * through what was shared on the team's meetings in the period, one column per person (or per meeting), each column a
 * list of cards that scrolls on its own; the columns wrap into rows (owner, 2026-11-24: no sideways scrolling). Search,
 * people, meetings (owner, 2026-11-25: only what was shared on the meetings picked) and order apply at once; a card
 * opens the project on its own
 * page (with previous and next through its column). Read-only: every project belongs to its writer, so cards are not
 * dragged between columns.
 */
export function ProjectBoard({ period }: { period: PeriodDetail }) {
  const { t } = useTranslation();
  const query = usePeriodProjects(period.teamId, period.key);

  if (query.isPending) return <BoardSkeleton />;
  if (query.isError) {
    const code = query.error instanceof ApiFailure ? query.error.code : 'unknown_error';
    return (
      <BlueAlert variant="error">
        {t('teams.projects.loadFailed')} {errorLabel(code)}
      </BlueAlert>
    );
  }
  if (query.data.projects.length === 0) {
    return (
      <BlueCard>
        <BlueEmptyState icon={<NotesIcon size={26} />} title={t('teams.projects.none', { label: period.label })}>
          {t('teams.projects.noneBody', { label: period.label })}
        </BlueEmptyState>
      </BlueCard>
    );
  }
  return <Board period={period} projects={query.data.projects} truncated={query.data.truncated} />;
}

function Board({ period, projects, truncated }: { period: PeriodDetail; projects: PeriodProject[]; truncated: boolean }) {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const hintId = useId();

  const group = parseGroup(params.get(PARAM.group));
  const sort = parseSort(params.get(PARAM.sort));
  const owners = ownersOf(projects);
  const ownerIds = owners.map((o) => o.id);
  const picked = parseSelection(params.get(PARAM.owners) ?? '', ownerIds);
  const meetingChoices = meetingOptions(projects, period.meetings);
  const meetingIds = meetingChoices.map((o) => o.meeting.id);
  const pickedMeetings = parseSelection(params.get(PARAM.meetings) ?? '', meetingIds);

  /**
   * Changes the board's settings in place (no new history entry). Built on the address as it is now, not as it was
   * when this was rendered: the search writes after a pause, and must not undo what another change did meanwhile.
   */
  const update = useCallback(
    (changes: Partial<Record<keyof typeof PARAM, string>>) => {
      const current = new URLSearchParams(window.location.search);
      const next = new URLSearchParams(current);
      for (const [name, value] of Object.entries(changes)) {
        const param = PARAM[name as keyof typeof PARAM];
        if (value) next.set(param, value);
        else next.delete(param);
      }
      if (next.toString() !== current.toString()) setParams(next, { replace: true });
    },
    [setParams],
  );

  // The words filter at once; the address follows after a pause (and Back or a link brings its words back).
  const urlSearch = params.get(PARAM.search) ?? '';
  const [search, setSearch] = useState(urlSearch);
  useEffect(() => {
    if (urlSearch !== search.trim()) setSearch(urlSearch);
    // Only the address changing (not typing) brings its words back.
  }, [urlSearch]);
  useEffect(() => {
    if (search.trim() === urlSearch) return;
    const timer = setTimeout(() => update({ search: search.trim() }), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const shown = filterProjects(onMeetings(projects, pickedMeetings, period.meetings), search, picked);
  const columns = boardColumns(shown, period.meetings, group, sort);
  const filtered = search.trim() !== '' || picked !== null || pickedMeetings !== null;
  const clearFilters = () => {
    setSearch('');
    update({ search: '', owners: '', meetings: '' });
  };
  // What a card's page needs to come back here and step through its column.
  const from = `${location.pathname}${location.search}`;

  // The bar of tools stays below the header; the columns fit the screen under it.
  const toolsRef = useRef<HTMLDivElement>(null);
  const [toolsHeight, setToolsHeight] = useState(0);
  useEffect(() => {
    const tools = toolsRef.current;
    if (!tools) return;
    const observer = new ResizeObserver(() => setToolsHeight(tools.offsetHeight));
    observer.observe(tools);
    return () => observer.disconnect();
  }, []);

  const boardRef = useRef<HTMLDivElement>(null);
  // Back to top moves the keyboard focus to the tools (it is not a stop for Tab).
  const topRef = useRef<HTMLDivElement>(null);

  // Back from a project's page, the keyboard focus (and the view) goes to its card.
  const focusCard = (location.state as { focusCard?: unknown } | null)?.focusCard;
  useEffect(() => {
    if (typeof focusCard !== 'string') return;
    const card = boardRef.current?.querySelector<HTMLElement>(`[data-card="${CSS.escape(focusCard)}"]`);
    card?.focus({ preventScroll: true });
    card?.scrollIntoView({ block: 'center' });
  }, [focusCard]);

  // Arrow keys move between cards: up and down in a column, left and right to the column before or after (in the
  // board's order, across rows); Home and End.
  const moveFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    const card = (event.target as HTMLElement).closest<HTMLElement>('[data-col]');
    if (!card) return;
    const col = Number(card.dataset.col);
    const row = Number(card.dataset.row);
    const to: Record<string, [number, number]> = {
      ArrowDown: [col, row + 1],
      ArrowUp: [col, row - 1],
      ArrowRight: [col + 1, row],
      ArrowLeft: [col - 1, row],
      Home: [col, 0],
      End: [col, Number.MAX_SAFE_INTEGER],
    };
    const target = to[event.key];
    const next = target ? columns[target[0]] : undefined;
    if (!target || !next) return;
    const r = Math.max(0, Math.min(target[1], next.cards.length - 1));
    const element = boardRef.current?.querySelector<HTMLElement>(`[data-col="${target[0]}"][data-row="${r}"]`);
    if (!element) return;
    event.preventDefault();
    element.focus();
  };

  const sortOptions = BOARD_SORTS.map((value) => ({
    value,
    label: t(value === 'latest' ? 'teams.projects.sortLatest' : value === 'name' ? 'teams.projects.sortName' : 'teams.projects.sortUpdates'),
  }));

  return (
    <div className="project-board" ref={topRef} tabIndex={-1} style={{ '--board-tools-height': `${toolsHeight}px` } as CSSProperties}>
      <div className="board-tools" ref={toolsRef} role="search" aria-label={t('teams.projects.tools')}>
        <div className="board-tools__group" role="group" aria-label={t('teams.projects.groupBy')}>
          <span className="board-tools__label small" aria-hidden="true">
            {t('teams.projects.groupBy')}
          </span>
          <span className="period-choice">
            {(['person', 'meeting'] as BoardGroup[]).map((value) => (
              <button
                key={value}
                type="button"
                className="period-choice__item"
                aria-pressed={group === value}
                onClick={() => update({ group: groupParam(value) })}
              >
                {t(value === 'person' ? 'teams.projects.groupPerson' : 'teams.projects.groupMeeting')}
              </button>
            ))}
          </span>
        </div>
        <BlueInput
          className="board-tools__search"
          type="search"
          maxLength={100}
          aria-label={t('teams.projects.search')}
          placeholder={t('teams.projects.search')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <ChecklistFilter
          label={t('teams.projects.peopleLabel')}
          noun={t('teams.projects.peopleNoun')}
          options={owners.map((o) => ({ value: o.id, label: o.name, detail: t('teams.projects.projectCount', { count: o.count }) }))}
          selected={picked}
          onChange={(next) => update({ owners: selectionParam(next, ownerIds) })}
        />
        <ChecklistFilter
          label={t('teams.projects.meetingsLabel')}
          noun={t('teams.projects.meetingsNoun')}
          options={meetingChoices.map((o) => ({
            value: o.meeting.id,
            label: formatDay(o.meeting.date),
            detail: t('teams.projects.projectCount', { count: o.count }),
          }))}
          selected={pickedMeetings}
          onChange={(next) => update({ meetings: selectionParam(next, meetingIds) })}
        />
        <BlueSelect<BoardSort>
          size="sm"
          ariaLabel={t('teams.projects.sortBy')}
          value={sort}
          options={sortOptions}
          onChange={(value) => update({ sort: value === 'latest' ? '' : value })}
        />
        <p className="board-tools__summary small muted" aria-live="polite">
          {filtered
            ? t('teams.projects.shownOf', { shown: shown.length, count: projects.length })
            : t('teams.projects.projectCount', { count: projects.length })}
          <span aria-hidden="true"> · </span>
          {t('teams.projects.peopleCount', { count: ownersOf(shown).length })}
          {filtered ? (
            <button type="button" className="link-button small" onClick={clearFilters}>
              {t('teams.projects.clearFilters')}
            </button>
          ) : null}
        </p>
      </div>

      {truncated ? <BlueAlert variant="warning">{t('teams.projects.truncated', { label: period.label })}</BlueAlert> : null}
      <p id={hintId} className="visually-hidden">
        {t('teams.projects.keys')}
      </p>

      {columns.length === 0 ? (
        <BlueCard>
          <BlueEmptyState
            icon={<NotesIcon size={26} />}
            title={t('teams.projects.noMatch')}
            action={
              <BlueButton variant="secondary" onClick={clearFilters}>
                {t('teams.projects.clearFilters')}
              </BlueButton>
            }
          >
            {t('teams.projects.noMatchBody')}
          </BlueEmptyState>
        </BlueCard>
      ) : (
        <div ref={boardRef} className="board" role="region" aria-label={t('teams.projects.board', { label: period.label })} onKeyDown={moveFocus}>
          {columns.map((c, index) => (
            <BoardColumnView
              key={c.key}
              column={c}
              index={index}
              group={group}
              search={search}
              period={period}
              hintId={hintId}
              from={from}
              onPicked={pickedMeetings !== null}
            />
          ))}
        </div>
      )}
      <BackToTop focusTarget={topRef} />
    </div>
  );
}

/** A column's name: the person, or the meeting's day (and its schedule's name). */
function columnName(column: BoardColumn): string {
  return column.person ? column.person.name : column.meeting ? formatDay(column.meeting.date) : '';
}

function BoardColumnView({
  column,
  index,
  group,
  search,
  period,
  hintId,
  from,
  onPicked,
}: {
  column: BoardColumn;
  index: number;
  group: BoardGroup;
  search: string;
  period: PeriodDetail;
  hintId: string;
  from: string;
  /** Meetings are picked: a card counts the picked meetings it was shared on. */
  onPicked: boolean;
}) {
  const { t } = useTranslation();
  const headingId = useId();
  const trail: BoardTrail = { from, sequence: column.cards.map((card) => card.id), column: columnName(column) };
  return (
    <section className="board-column" aria-labelledby={headingId}>
      <header className="board-column__head">
        {column.person ? <BlueAvatar name={column.person.name} size="sm" /> : null}
        <h3 id={headingId} className="board-column__title">
          {column.meeting ? (
            <>
              <Link
                to={`/meetings/${column.meeting.id}`}
                state={{ from, fromLabel: period.label }}
                className="board-column__link"
                title={t('teams.projects.openMeeting', { date: formatDay(column.meeting.date) })}
              >
                {formatDay(column.meeting.date)}
              </Link>
              <span className="board-column__sub small muted">{meetingName(column.meeting)}</span>
            </>
          ) : (
            columnName(column)
          )}
        </h3>
        <span className="board-column__count" title={t('teams.projects.projectCount', { count: column.cards.length })}>
          <span aria-hidden="true">{column.cards.length}</span>
          <span className="visually-hidden">{t('teams.projects.projectCount', { count: column.cards.length })}</span>
        </span>
      </header>
      <ul className="board-column__cards">
        {column.cards.map((card, row) => (
          <li key={card.id}>
            <BoardCard card={card} col={index} row={row} group={group} search={search} period={period} hintId={hintId} trail={trail} onPicked={onPicked} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A card: the project's name and one line (whose it is when grouped by meeting, how many updates, the latest day). */
function BoardCard({
  card,
  col,
  row,
  group,
  search,
  period,
  hintId,
  trail,
  onPicked,
}: {
  card: PeriodProject;
  col: number;
  row: number;
  group: BoardGroup;
  search: string;
  period: PeriodDetail;
  hintId: string;
  trail: BoardTrail;
  onPicked: boolean;
}) {
  const { t } = useTranslation();
  const archived = card.status === 'archived';
  const facts = [
    group === 'meeting' ? card.owner.name : null,
    // With meetings picked, the count is of those meetings (onMeetings).
    onPicked && group === 'person'
      ? t('teams.projects.onPicked', { count: card.updateCount })
      : onPicked
        ? null
        : t('teams.projects.updateCount', { count: card.updateCount }),
    group === 'person' ? t('teams.projects.latest', { date: formatDay(card.lastSharedOn) }) : null,
    archived ? t('teams.projects.archived') : null,
  ].filter(Boolean);
  return (
    <Link
      to={projectPath(period.teamId, period.key, card.id)}
      state={trail}
      className={`board-card${archived ? ' board-card--archived' : ''}`}
      data-col={col}
      data-row={row}
      data-card={card.id}
      aria-describedby={hintId}
    >
      <span className="board-card__name">
        {highlightParts(card.name, search).map((part, i) => (part.match ? <mark key={i}>{part.text}</mark> : <span key={i}>{part.text}</span>))}
      </span>
      <span className="board-card__facts small">{facts.join(' · ')}</span>
    </Link>
  );
}

function BoardSkeleton() {
  const { t } = useTranslation();
  return (
    <div className="board" role="status">
      <span className="visually-hidden">{t('teams.projects.loading')}</span>
      {[0, 1, 2].map((c) => (
        <div key={c} className="board-column" aria-hidden="true">
          <div className="board-column__head">
            <BlueSkeleton width={28} height={28} />
            <BlueSkeleton width="55%" height={16} />
          </div>
          <div className="board-column__cards">
            {[0, 1, 2].map((r) => (
              <div key={r} className="board-card board-card--skeleton">
                <BlueSkeleton width="70%" height={16} />
                <BlueSkeleton width="45%" height={12} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
