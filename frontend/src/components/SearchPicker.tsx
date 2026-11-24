import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ApiFailure } from '../services/api';
import { errorLabel } from '../utils/errorLabels';
import { useDismiss } from '../hooks/useDismiss';
import { BlueAlert, BlueInput, BlueSkeleton, BlueSpinner } from './blue';
import './SearchPicker.css';

/** One choice: what the filter's value becomes, its name, and an optional tag ("Archived"). */
export interface PickerChoice {
  value: string;
  label: string;
  tag?: string | undefined;
}

/** What a picker's query hook gives back (a few at random, or what a search found). */
export interface PickerResults {
  choices: PickerChoice[];
  /** More match than were sent. */
  hasMore: boolean;
  isPending: boolean;
  isFetching: boolean;
  error: unknown;
  refetch: () => void;
}

/** Every text the picker shows, in the language on screen. */
export interface PickerWords {
  /** The field's label ("Project"). */
  label: string;
  /** Names the open panel for screen readers ("Pick a project"). */
  dialog: string;
  search: string;
  placeholder: string;
  /** Above the random few ("Some of your projects"). */
  suggested: string;
  showOthers: string;
  loading: string;
  orType: string;
  /** When there is nothing to suggest at all. */
  none: string;
  /** When a search finds nothing; given the text searched. */
  noMatch: (query: string) => ReactNode;
  moreMatches: string;
  /** Names the list of what a search found. */
  found: string;
}

const codeOf = (error: unknown) => (error instanceof ApiFailure ? error.code : error ? 'unknown_error' : null);

/**
 * A filter field that opens a small panel, like "Add people" on a team: before typing it offers the fixed choices
 * and a few at random ("Show others" for another pick); from 2 letters it searches on the server. A long list never
 * has to be scrolled. `useSuggestions` and `useSearch` are query hooks: pass the same function on every render.
 * The panel stays 16 px inside the window; ↑ / ↓ move through it, Enter in the box picks the first found, Escape
 * closes it and returns to the field.
 */
export function SearchPicker({
  value,
  valueLabel,
  fixed,
  useSuggestions,
  useSearch,
  words,
  onChange,
}: {
  value: string;
  /** What the field shows for the value in use. */
  valueLabel: string;
  /** Always offered before typing ("All projects", "No project"). */
  fixed: PickerChoice[];
  useSuggestions: () => PickerResults;
  useSearch: (q: string) => PickerResults;
  words: PickerWords;
  onChange: (value: string) => void;
}) {
  const labelId = useId();
  const valueId = useId();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(box, open, close);

  const pick = (next: string) => {
    setOpen(false);
    button.current?.focus();
    if (next !== value) onChange(next);
  };

  return (
    <div
      className="search-picker"
      ref={box}
      onKeyDown={(event) => {
        // Escape closes the panel (useDismiss) and puts the focus back on the field.
        if (event.key === 'Escape' && open) button.current?.focus();
      }}
    >
      <span className="blue-input__label" id={labelId}>
        {words.label}
      </span>
      <button
        ref={button}
        type="button"
        className="blue-select__field search-picker__button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-labelledby={`${labelId} ${valueId}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span id={valueId} className="search-picker__value">
          {valueLabel}
        </span>
      </button>
      {open ? (
        <Panel id={panelId} value={value} fixed={fixed} useSuggestions={useSuggestions} useSearch={useSearch} words={words} onPick={pick} />
      ) : null}
    </div>
  );
}

function Panel({
  id,
  value,
  fixed,
  useSuggestions,
  useSearch,
  words,
  onPick,
}: {
  id: string;
  value: string;
  fixed: PickerChoice[];
  useSuggestions: () => PickerResults;
  useSearch: (q: string) => PickerResults;
  words: PickerWords;
  onPick: (value: string) => void;
}) {
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const panel = useRef<HTMLDivElement>(null);
  const [shift, setShift] = useState(0);
  const found = useSearch(query);
  const searching = query.trim().length >= 2;

  // The panel opens under the field, moved left as far as needed to stay 16 px inside the page (layout sizes, not the
  // fade-in's scaled box; the page's width without its scrollbar).
  useLayoutEffect(() => {
    const el = panel.current;
    const field = el?.parentElement?.getBoundingClientRect();
    if (!el || !field) return;
    setShift(Math.min(0, document.documentElement.clientWidth - 16 - (field.left + el.offsetWidth)));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(text), 300);
    return () => clearTimeout(timer);
  }, [text]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const stops = [...(panel.current?.querySelectorAll<HTMLElement>('input, .search-picker__option') ?? [])];
    const at = stops.indexOf(document.activeElement as HTMLElement);
    const next = stops[Math.min(Math.max(at + (event.key === 'ArrowDown' ? 1 : -1), 0), stops.length - 1)];
    if (next) {
      event.preventDefault();
      next.focus();
    }
  };
  const failed = codeOf(found.error);

  return (
    <div
      id={id}
      ref={panel}
      className="search-picker__panel"
      style={shift ? { left: shift } : undefined}
      role="dialog"
      aria-label={words.dialog}
      onKeyDown={onKeyDown}
    >
      <BlueInput
        label={words.search}
        type="search"
        placeholder={words.placeholder}
        maxLength={100}
        autoFocus
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          const first = found.choices[0];
          if (event.key === 'Enter' && searching && first) {
            event.preventDefault();
            onPick(first.value);
          }
        }}
      />
      {!searching ? (
        <>
          <ul className="search-picker__list">
            {fixed.map((choice) => (
              <Option key={choice.value} choice={choice} on={choice.value === value} onPick={onPick} />
            ))}
          </ul>
          <Suggestions value={value} useSuggestions={useSuggestions} words={words} onPick={onPick} />
        </>
      ) : found.isPending ? (
        <BlueSpinner />
      ) : failed ? (
        <BlueAlert variant="error">{errorLabel(failed)}</BlueAlert>
      ) : found.choices.length === 0 ? (
        <p className="muted small">{words.noMatch(query.trim())}</p>
      ) : (
        <>
          <ul className="search-picker__list" aria-label={words.found}>
            {found.choices.map((choice) => (
              <Option key={choice.value} choice={choice} on={choice.value === value} onPick={onPick} />
            ))}
          </ul>
          {found.hasMore ? <p className="muted small">{words.moreMatches}</p> : null}
        </>
      )}
    </div>
  );
}

/** A few at random, with "Show others" for a new pick (mounted while not searching: each opening is a new pick). */
function Suggestions({
  value,
  useSuggestions,
  words,
  onPick,
}: {
  value: string;
  useSuggestions: () => PickerResults;
  words: PickerWords;
  onPick: (value: string) => void;
}) {
  const titleId = useId();
  const suggestions = useSuggestions();
  const { choices } = suggestions;
  const failed = codeOf(suggestions.error);

  return (
    <section className="search-picker__suggested" aria-labelledby={titleId}>
      <div className="search-picker__head">
        <span id={titleId} className="search-picker__title">
          {words.suggested}
        </span>
        {choices.length > 0 ? (
          <button type="button" className="link-button small" disabled={suggestions.isFetching} onClick={suggestions.refetch}>
            {suggestions.isFetching ? words.loading : words.showOthers}
          </button>
        ) : null}
      </div>
      {suggestions.isPending ? (
        <div className="search-picker__list" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <BlueSkeleton key={i} width={`${60 + i * 10}%`} height={14} />
          ))}
        </div>
      ) : failed ? (
        <BlueAlert variant="error">{errorLabel(failed)}</BlueAlert>
      ) : choices.length === 0 ? (
        <p className="muted small">{words.none}</p>
      ) : (
        <ul className={`search-picker__list ${suggestions.isFetching ? 'is-refreshing' : ''}`.trim()} aria-labelledby={titleId}>
          {choices.map((choice) => (
            <Option key={choice.value} choice={choice} on={choice.value === value} onPick={onPick} />
          ))}
        </ul>
      )}
      {choices.length > 0 ? <p className="muted small">{words.orType}</p> : null}
    </section>
  );
}

/** One choice: its name (and a tag), ✓ when it is the one in use. */
function Option({ choice, on, onPick }: { choice: PickerChoice; on: boolean; onPick: (value: string) => void }) {
  return (
    <li>
      <button type="button" className="search-picker__option" aria-pressed={on} onClick={() => onPick(choice.value)}>
        <span className="search-picker__name">{choice.label}</span>
        {choice.tag ? <span className="search-picker__tag">{choice.tag}</span> : null}
        {on ? (
          <span className="search-picker__check" aria-hidden="true">
            ✓
          </span>
        ) : null}
      </button>
    </li>
  );
}
