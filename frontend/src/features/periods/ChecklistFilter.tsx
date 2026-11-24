import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDismiss } from '../../hooks/useDismiss';
import { matchingOptions, SEARCH_ABOVE, type Selection } from './readerFilter';

export interface ChecklistOption {
  value: string;
  label: string;
  /** A short note after the label ("7 people", "3 meetings"). */
  detail?: string;
}

/**
 * A button that opens a list of check boxes to pick some of many (which meetings, whose notes), "All" first. Changes
 * apply at once; the button says what is picked ("Meetings: All", "3 of 8", or the one picked). A long list (more than
 * eight) has a box to find names in it. Escape, a press outside it, "Done" or tabbing out of it closes it; the
 * keyboard focus then goes back to the button, never lost.
 */
export function ChecklistFilter({
  label,
  noun,
  options,
  selected,
  onChange,
}: {
  /** "Meetings" */
  label: string;
  /** "meetings", for "All meetings" */
  noun: string;
  options: ChecklistOption[];
  selected: Selection;
  onChange: (next: Selection) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const allBox = useRef<HTMLInputElement>(null);
  const panelId = useId();
  const [find, setFind] = useState('');
  const close = useCallback(() => {
    // Closing from inside the list (Escape on a box): the focus would fall to the page; it goes to the button.
    if (box.current?.contains(document.activeElement) && document.activeElement !== button.current) button.current?.focus();
    setOpen(false);
  }, []);
  useDismiss(box, open, close);
  // A list opened again starts whole.
  useEffect(() => {
    if (!open) setFind('');
  }, [open]);
  const long = options.length > SEARCH_ABOVE;
  const visible = matchingOptions(options, find);

  const chosen = new Set(selected ?? options.map((o) => o.value));
  const all = selected === null;
  const some = !all && chosen.size > 0;
  // "All" shows a dash while only some are picked.
  useEffect(() => {
    if (allBox.current) allBox.current.indeterminate = some;
  });

  const summary = all
    ? t('periods.checklist.all')
    : chosen.size === 0
      ? t('periods.checklist.none')
      : chosen.size === 1
        ? (options.find((o) => chosen.has(o.value))?.label ?? '1')
        : t('periods.checklist.some', { picked: chosen.size, total: options.length });

  function toggle(value: string) {
    const next = new Set(chosen);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    // Everything picked is "all" again; nothing picked stays an empty list (the reader then says so).
    onChange(next.size === options.length ? null : options.filter((o) => next.has(o.value)).map((o) => o.value));
  }

  return (
    <div
      className="checklist-filter"
      ref={box}
      // Tabbing out of the open list closes it. A press on a name (not its box) moves the focus to the nearest
      // focusable parent, such as the reader's tab panel: that is not leaving, and closing then would swallow the
      // click that ticks the box. Presses outside are useDismiss's.
      onBlur={(event) => {
        const to = event.relatedTarget;
        const list = box.current;
        if (open && list && to instanceof Node && !list.contains(to) && !to.contains(list)) setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        className={`checklist-filter__toggle${all ? '' : ' checklist-filter__toggle--on'}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="checklist-filter__label">{label}:</span>
        <span className="checklist-filter__value">{summary}</span>
        <svg className="checklist-filter__chevron" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <div className="checklist-filter__panel" id={panelId} role="group" aria-label={t('periods.checklist.pick', { noun })}>
          <label className="checklist-filter__option checklist-filter__option--all">
            <input ref={allBox} type="checkbox" checked={all} onChange={() => onChange(all ? [] : null)} />
            <span>{t('periods.checklist.allOf', { noun })}</span>
          </label>
          {long ? (
            <input
              className="checklist-filter__find"
              type="search"
              placeholder={t('periods.checklist.find', { noun })}
              aria-label={t('periods.checklist.find', { noun })}
              value={find}
              onChange={(event) => setFind(event.target.value)}
            />
          ) : null}
          {visible.length === 0 ? <p className="checklist-filter__empty muted small">{t('periods.checklist.noMatch')}</p> : null}
          <ul className="checklist-filter__list">
            {visible.map((option) => (
              <li key={option.value}>
                <label className="checklist-filter__option">
                  <input type="checkbox" checked={chosen.has(option.value)} onChange={() => toggle(option.value)} />
                  <span className="checklist-filter__text">{option.label}</span>
                  {option.detail ? <span className="checklist-filter__detail">{option.detail}</span> : null}
                </label>
              </li>
            ))}
          </ul>
          <div className="checklist-filter__foot">
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setOpen(false);
                button.current?.focus();
              }}
            >
              {t('periods.checklist.done')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
