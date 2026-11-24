import { useEffect, useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { BlueAlert, BlueButton, BlueInput, BlueModal } from '../../components/blue';
import { ApiFailure } from '../../services/api';
import { errorLabel } from '../../utils/errorLabels';
import './projects.css';

/** A new project: a name (unique among my projects) and an optional description. */
export function ProjectFormDialog({
  open,
  busy,
  error,
  onSubmit,
  onClose,
}: {
  open: boolean;
  busy: boolean;
  error: unknown;
  onSubmit: (values: { name: string; description: string | null }) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const descriptionId = useId();

  useEffect(() => {
    if (open) {
      setName('');
      setDescription('');
    }
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
      title={t('projects.form.title')}
      size="sm"
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <BlueButton variant="ghost" onClick={onClose} disabled={busy}>
            {t('projects.form.cancel')}
          </BlueButton>
          <BlueButton type="submit" form="project-form" variant="primary" loading={busy} disabled={!ready}>
            {t('projects.form.create')}
          </BlueButton>
        </>
      }
    >
      <form id="project-form" className="stack" onSubmit={submit} noValidate>
        {code && code !== 'project_name_taken' ? <BlueAlert variant="error">{errorLabel(code)}</BlueAlert> : null}
        <BlueInput
          label={t('projects.form.name')}
          placeholder={t('projects.form.namePlaceholder')}
          maxLength={100}
          required
          value={name}
          error={code === 'project_name_taken' ? errorLabel(code) : undefined}
          onChange={(event) => setName(event.target.value)}
          disabled={busy}
        />
        <div className="blue-input">
          <label className="blue-input__label" htmlFor={descriptionId}>
            {t('projects.form.description')} <span className="muted">{t('projects.form.optional')}</span>
          </label>
          <textarea
            id={descriptionId}
            className="blue-input__field project-form__textarea"
            placeholder={t('projects.form.descriptionPlaceholder')}
            maxLength={500}
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={busy}
          />
        </div>
        <p className="muted small">{t('projects.form.privacy')}</p>
      </form>
    </BlueModal>
  );
}
