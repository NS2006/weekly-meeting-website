import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

// BLUE3 BModal → BlueModal (no plugin template yet; same props: open, onClose, title, size).
// Built on the native <dialog>: focus is trapped and Escape closes it without extra code.
// Closes on Escape, the × button, and a click on the dimmed area outside the box.
export interface BlueModalProps {
  open: boolean;
  onClose: () => void;
  /** Plain text, or text with highlighted values (EntityName). */
  title: ReactNode;
  /** xl: reading a note with its project navigation beside it. */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  footer?: ReactNode;
  children: ReactNode;
}

export function BlueModal({ open, onClose, title, size = 'md', footer, children }: BlueModalProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  // Where the press started. A drag that starts inside the box (selecting text) and ends outside still
  // produces a click on the <dialog> itself; only a press that starts outside should close it.
  const pressedOutside = useRef(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // showModal() focuses the first focusable element (the × button). A dialog that asks for input should
      // start in its first field instead (React's autoFocus runs at mount, while the dialog is still closed).
      dialog.querySelector<HTMLElement>('.blue-modal__body :is(input, textarea, select):not(:disabled)')?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    // The box's content fills the <dialog> edge to edge (no padding), so a click whose target is the
    // <dialog> element itself landed on the backdrop around it.
    <dialog
      ref={ref}
      className={`blue-modal blue-modal--${size}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onMouseDown={(event) => {
        pressedOutside.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (pressedOutside.current && event.target === event.currentTarget) onClose();
        pressedOutside.current = false;
      }}
    >
      <header className="blue-modal__header">
        <h2 id={titleId} className="blue-modal__title">
          {title}
        </h2>
        <button type="button" className="blue-modal__close" aria-label={t('ui.modal.close')} onClick={onClose}>
          ×
        </button>
      </header>
      <div className="blue-modal__body">{children}</div>
      {footer ? <footer className="blue-modal__footer">{footer}</footer> : null}
    </dialog>
  );
}
