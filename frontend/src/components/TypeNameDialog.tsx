import { useEffect, useId, useState, type ReactNode } from 'react';
import { Trans } from 'react-i18next';
import { BlueAlert, BlueButton, BlueModal } from './blue';
import { EntityName } from './EntityName';

/**
 * A permanent, destructive action confirmed by typing a name exactly (like GitHub's "delete this repository").
 * The button stays disabled until the text matches; the server compares it again.
 */
export function TypeNameDialog({
  open,
  title,
  name,
  confirmLabel,
  busy,
  error,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean;
  title: ReactNode;
  /** The text to type. */
  name: string;
  confirmLabel: string;
  busy: boolean;
  error: string | null;
  onConfirm: (typed: string) => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const [typed, setTyped] = useState('');
  const inputId = useId();
  useEffect(() => {
    if (open) setTyped('');
  }, [open]);
  const matches = typed.trim() === name;

  return (
    <BlueModal
      open={open}
      size="sm"
      title={title}
      onClose={busy ? () => undefined : onClose}
      footer={
        <BlueButton variant="danger" fullWidth loading={busy} disabled={!matches} onClick={() => onConfirm(typed)}>
          {confirmLabel}
        </BlueButton>
      }
    >
      <div className="stack">
        {error ? <BlueAlert variant="error">{error}</BlueAlert> : null}
        <div>{children}</div>
        <div className="blue-input type-confirm">
          <label className="blue-input__label" htmlFor={inputId}>
            <Trans i18nKey="ui.typeName.prompt" components={{ name: <EntityName>{name}</EntityName> }} />
          </label>
          <input
            id={inputId}
            className="blue-input__field"
            autoComplete="off"
            spellCheck={false}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && matches && !busy) onConfirm(typed);
            }}
            disabled={busy}
          />
        </div>
      </div>
    </BlueModal>
  );
}
