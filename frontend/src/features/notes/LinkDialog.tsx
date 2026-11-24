import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { BlueButton, BlueInput, BlueModal } from '../../components/blue';
import { normalizeLink } from './link';

/** Add or change the link on the selected text; "Remove link" when it already has one. */
export function LinkDialog({
  open,
  initial,
  onApply,
  onRemove,
  onClose,
}: {
  open: boolean;
  /** The current link's address, or '' for a new one. */
  initial: string;
  onApply: (href: string) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initial);
  const [touched, setTouched] = useState(false);
  const href = normalizeLink(value);
  const error = touched && value.trim() && !href ? t('notes.link.invalid') : undefined;

  function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (href) onApply(href);
  }

  return (
    <BlueModal
      open={open}
      size="sm"
      title={initial ? t('notes.link.edit') : t('notes.link.add')}
      onClose={onClose}
      footer={
        <>
          {initial ? (
            <BlueButton variant="ghost" onClick={onRemove}>
              {t('notes.link.remove')}
            </BlueButton>
          ) : null}
          <BlueButton variant="ghost" onClick={onClose}>
            {t('notes.link.cancel')}
          </BlueButton>
          <BlueButton variant="primary" type="submit" form="note-link-form" disabled={!value.trim()}>
            {initial ? t('notes.link.save') : t('notes.link.add')}
          </BlueButton>
        </>
      }
    >
      <form id="note-link-form" onSubmit={submit} noValidate>
        <BlueInput
          label={t('notes.link.address')}
          placeholder={t('notes.link.placeholder')}
          value={value}
          maxLength={2000}
          error={error}
          onChange={(event) => {
            setValue(event.target.value);
            setTouched(false);
          }}
          onBlur={() => setTouched(true)}
        />
      </form>
    </BlueModal>
  );
}
