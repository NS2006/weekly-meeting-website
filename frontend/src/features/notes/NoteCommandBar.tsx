import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useDismiss } from '../../hooks/useDismiss';

const Icon = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
const OpenIcon = () => (
  <Icon>
    <path d="M11 4h5v5M16 4l-7 7M14 12v3.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5H8" />
  </Icon>
);
const ShareIcon = () => (
  <Icon>
    <path d="M12 3.5 16.5 8 12 12.5M16.5 8H10a5 5 0 0 0-5 5v3" />
  </Icon>
);
const CopyIcon = () => (
  <Icon>
    <rect x="7" y="7" width="9.5" height="9.5" rx="1.5" />
    <path d="M13 7V4.5A1.5 1.5 0 0 0 11.5 3h-7A1.5 1.5 0 0 0 3 4.5v7A1.5 1.5 0 0 0 4.5 13H7" />
  </Icon>
);
const DownloadIcon = () => (
  <Icon>
    <path d="M10 3v10M5.5 8.5 10 13l4.5-4.5M4 16.5h12" />
  </Icon>
);
const DeleteIcon = () => (
  <Icon>
    <path d="M3.5 5.5h13M8 5.5V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M5 5.5l.8 10.1a1.5 1.5 0 0 0 1.5 1.4h5.4a1.5 1.5 0 0 0 1.5-1.4L15 5.5" />
  </Icon>
);

/**
 * The bar over the Notes list once notes are picked (owner, 2026-11-25, like OneDrive's): Open for one note; Share…,
 * Make a copy, Download (Word or PDF) and Delete… for one or several; and "× N selected" to let go of them.
 * Escape on the list lets go too.
 */
export function NoteCommandBar({
  count,
  copying,
  downloading,
  deleting,
  onOpen,
  onShare,
  onCopy,
  onDownload,
  onDelete,
  onClear,
}: {
  count: number;
  copying: boolean;
  downloading: boolean;
  deleting: boolean;
  onOpen: () => void;
  onShare: () => void;
  onCopy: () => void;
  onDownload: (kind: 'docx' | 'pdf') => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  const one = count === 1;
  return (
    <div className="select-bar" role="group" aria-label={t('notes.select.bar', { count })}>
      {one ? (
        <button type="button" className="select-bar__item" onClick={onOpen}>
          <OpenIcon />
          {t('notes.select.open')}
        </button>
      ) : null}
      <button type="button" className="select-bar__item" onClick={onShare}>
        <ShareIcon />
        {t('notes.select.share')}
      </button>
      <button type="button" className="select-bar__item" disabled={copying} onClick={onCopy}>
        <CopyIcon />
        {t('notes.select.copy', { count })}
      </button>
      <DownloadMenu disabled={downloading} onPick={onDownload} />
      <button type="button" className="select-bar__item select-bar__item--danger" disabled={deleting} onClick={onDelete}>
        <DeleteIcon />
        {t('notes.select.delete')}
      </button>
      <button type="button" className="select-bar__clear" onClick={onClear} title={t('notes.select.clear')} aria-label={t('notes.select.clearCount', { count })}>
        <span aria-hidden="true">×</span>
        {t('notes.select.count', { count })}
      </button>
    </div>
  );
}

/** "Download ▾": Word or PDF, one file a note. */
function DownloadMenu({ disabled, onPick }: { disabled: boolean; onPick: (kind: 'docx' | 'pdf') => void }) {
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

  const pick = (kind: 'docx' | 'pdf') => {
    setOpen(false);
    button.current?.focus();
    onPick(kind);
  };
  // Up and down move between the two, as in any menu; Escape closes it.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && open) {
      event.stopPropagation();
      setOpen(false);
      button.current?.focus();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = items[(at + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length];
    if (next) {
      event.preventDefault();
      next.focus();
    }
  };

  return (
    <div className="select-bar__menu-box" ref={box} onKeyDown={onKeyDown}>
      <button
        ref={button}
        type="button"
        className="select-bar__item"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <DownloadIcon />
        {t('notes.select.download')}
        <span className="select-bar__chevron" aria-hidden="true">
          ▾
        </span>
      </button>
      {open ? (
        <div className="select-bar__menu" role="menu" aria-label={t('notes.select.download')} ref={menu}>
          <button type="button" role="menuitem" className="select-bar__menu-item" onClick={() => pick('docx')}>
            {t('notes.select.asWord')}
          </button>
          <button type="button" role="menuitem" className="select-bar__menu-item" onClick={() => pick('pdf')}>
            {t('notes.select.asPdf')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
