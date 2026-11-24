import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDismiss } from '../../hooks/useDismiss';

/**
 * The "⋯" button on a note row and its menu: Make a copy, Share on a meeting…, Download as Word / PDF, Delete…. It
 * sits beside the row's link (a button cannot be inside a link). Opening moves the focus to the first item; Escape
 * brings it back. While a file is being made, the downloads wait (one at a time).
 */
export function NoteActions({
  title,
  busy,
  downloading,
  onCopy,
  onShare,
  onDownload,
  onDelete,
}: {
  /** The note's title as shown (for the button's name). */
  title: string;
  busy: boolean;
  downloading: boolean;
  onCopy: () => void;
  onShare: () => void;
  onDownload: (kind: 'docx' | 'pdf') => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(box, open, close);

  useEffect(() => {
    if (open) menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);

  const pick = (action: () => void) => () => {
    setOpen(false);
    button.current?.focus();
    action();
  };

  // Up and down move between the items, as in any menu.
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      button.current?.focus();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = items[(at + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length];
    if (next) {
      event.preventDefault();
      next.focus();
    }
  };

  return (
    <div className={`note-actions ${open ? 'note-actions--open' : ''}`.trim()} ref={box} onKeyDown={onKeyDown}>
      <button
        ref={button}
        type="button"
        className="note-actions__button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('notes.actions.button', { title })}
        title={t('notes.actions.menu')}
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
          <circle cx="3" cy="8" r="1.5" fill="currentColor" />
          <circle cx="8" cy="8" r="1.5" fill="currentColor" />
          <circle cx="13" cy="8" r="1.5" fill="currentColor" />
        </svg>
      </button>
      {open ? (
        <div className="note-actions__menu" role="menu" aria-label={t('notes.actions.menu')} ref={menu}>
          <button type="button" role="menuitem" className="note-actions__item" onClick={pick(onCopy)}>
            {t('notes.actions.copy')}
          </button>
          <button type="button" role="menuitem" className="note-actions__item" onClick={pick(onShare)}>
            {t('notes.actions.share')}
          </button>
          <button type="button" role="menuitem" className="note-actions__item" disabled={downloading} onClick={pick(() => onDownload('docx'))}>
            {t('notes.actions.downloadWord')}
          </button>
          <button type="button" role="menuitem" className="note-actions__item" disabled={downloading} onClick={pick(() => onDownload('pdf'))}>
            {t('notes.actions.downloadPdf')}
          </button>
          <button type="button" role="menuitem" className="note-actions__item note-actions__item--danger" onClick={pick(onDelete)}>
            {t('notes.actions.delete')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
