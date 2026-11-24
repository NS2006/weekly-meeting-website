import { useEffect, useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { BlueAlert, BlueButton, BlueInput, BlueModal } from '../../components/blue';
import { ApiFailure } from '../../services/api';
import { errorLabel } from '../../utils/errorLabels';

/** Name and optional description, for creating a team or editing one. */
export function TeamFormDialog({
  open,
  title,
  submitLabel,
  initial,
  busy,
  error,
  onSubmit,
  onClose,
}: {
  open: boolean;
  title: string;
  submitLabel: string;
  initial: { name: string; description: string | null };
  busy: boolean;
  error: unknown;
  onSubmit: (values: { name: string; description: string | null }) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description ?? '');
  const descriptionId = useId();

  // Start from the given values each time the dialog opens.
  useEffect(() => {
    if (open) {
      setName(initial.name);
      setDescription(initial.description ?? '');
    }
    // Keyed on `open` only, so typing is not reset when the team data refreshes.
  }, [open]);

  const ready = name.trim() !== '';
  const code = error instanceof ApiFailure ? error.code : error ? 'unknown_error' : null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (ready && !busy) onSubmit({ name: name.trim(), description: description.trim() || null });
  }

  return (
    <BlueModal
      open={open}
      title={title}
      size="sm"
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <BlueButton variant="ghost" onClick={onClose} disabled={busy}>
            {t('teams.form.cancel')}
          </BlueButton>
          <BlueButton type="submit" form="team-form" variant="primary" loading={busy} disabled={!ready}>
            {submitLabel}
          </BlueButton>
        </>
      }
    >
      <form id="team-form" className="stack" onSubmit={submit} noValidate>
        {code ? <BlueAlert variant="error">{errorLabel(code)}</BlueAlert> : null}
        <BlueInput
          label={t('teams.form.name')}
          placeholder={t('teams.form.namePlaceholder')}
          maxLength={100}
          required
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={busy}
        />
        <div className="blue-input">
          <label className="blue-input__label" htmlFor={descriptionId}>
            {t('teams.form.description')} <span className="muted">{t('teams.form.optional')}</span>
          </label>
          <textarea
            id={descriptionId}
            className="blue-input__field team-form__textarea"
            placeholder={t('teams.form.descriptionPlaceholder')}
            maxLength={500}
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={busy}
          />
        </div>
      </form>
    </BlueModal>
  );
}
