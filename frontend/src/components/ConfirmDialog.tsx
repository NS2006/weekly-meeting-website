import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BlueAlert, BlueButton, BlueModal } from './blue';

/** A yes/no question in a BlueModal. While `busy`, it cannot be dismissed: the change is already on its way. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel,
  danger = false,
  busy = false,
  error,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: ReactNode;
  children: ReactNode;
  confirmLabel: string;
  /** The button that closes without doing anything ("Cancel" when not given). */
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  return (
    <BlueModal
      open={open}
      size="sm"
      title={title}
      onClose={busy ? () => undefined : onCancel}
      footer={
        <>
          <BlueButton variant="ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel ?? t('ui.confirm.cancel')}
          </BlueButton>
          <BlueButton variant={danger ? 'danger' : 'primary'} loading={busy} onClick={onConfirm}>
            {confirmLabel}
          </BlueButton>
        </>
      }
    >
      <div className="stack">
        {error ? <BlueAlert variant="error">{error}</BlueAlert> : null}
        <div>{children}</div>
      </div>
    </BlueModal>
  );
}
