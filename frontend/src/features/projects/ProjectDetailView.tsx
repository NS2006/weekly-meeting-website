import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { ProjectDetail } from '@weekly-meeting/shared';
import { Trans, useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { BlueAlert, BlueBadge, BlueButton, BlueCard, BlueInput } from '../../components/blue';
import { EntityName } from '../../components/EntityName';
import { TypeNameDialog } from '../../components/TypeNameDialog';
import { ApiFailure } from '../../services/api';
import { formatDate, relativeDate } from '../../utils/dates';
import { errorLabel } from '../../utils/errorLabels';
import { ProjectUpdates } from '../notes/ProjectUpdates';
import { ProjectMonogram } from './ProjectCard';
import { useDeleteProject, useUpdateProject } from './useProjects';
import './projects.css';

const codeOf = (error: unknown) => (error instanceof ApiFailure ? error.code : error ? 'unknown_error' : null);

/** The success notice after a change (kept as a kind, so it follows a language switch while shown). */
type Notice = 'saved' | 'restored' | 'archived';

/**
 * One of my projects: edit its name and description in place, archive or restore it (archiving can be undone at
 * once), and delete it for good by typing its name. Below: its updates (the parts of my notes tagged with it).
 */
export function ProjectDetailView({ project }: { project: ProjectDetail }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const update = useUpdateProject(project.id);
  const remove = useDeleteProject(project.id);
  const [editing, setEditing] = useState<false | 'name' | 'description'>(false);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const archived = project.status === 'archived';
  const outsideError = !editing ? codeOf(update.error) : null;

  function setStatus(status: 'active' | 'archived', message: Notice) {
    update.reset();
    update.mutate({ status }, { onSuccess: () => setNotice(message) });
  }

  return (
    <div className="stack">
      {editing ? (
        <EditProjectForm
          project={project}
          focus={editing}
          busy={update.isPending}
          error={update.error}
          onCancel={() => {
            update.reset();
            setEditing(false);
          }}
          onSave={(values) => {
            const body = {
              ...(values.name !== project.name ? { name: values.name } : {}),
              ...(values.description !== project.description ? { description: values.description } : {}),
            };
            if (Object.keys(body).length === 0) return setEditing(false);
            update.mutate(body, {
              onSuccess: () => {
                setEditing(false);
                setNotice('saved');
              },
            });
          }}
        />
      ) : (
        <>
          <div className="page-head" style={{ marginBottom: 0 }}>
            <div className="project-head">
              <ProjectMonogram name={project.name} archived={archived} size="lg" />
              <div className="project-head__text">
                <h1 className="page-head__title">{project.name}</h1>
                <span className="project-head__meta muted small">
                  {t('projects.detail.meta', { date: formatDate(project.createdAt), when: relativeDate(project.updatedAt) })}
                  {archived ? <BlueBadge>{t('projects.detail.archived')}</BlueBadge> : null}
                </span>
              </div>
            </div>
            <div className="row project-head__actions">
              {archived ? (
                <BlueButton
                  variant="primary"
                  loading={update.isPending}
                  onClick={() => setStatus('active', 'restored')}
                >
                  {t('projects.detail.restore')}
                </BlueButton>
              ) : (
                <>
                  <BlueButton
                    variant="secondary"
                    onClick={() => {
                      update.reset();
                      setNotice(null);
                      setEditing('name');
                    }}
                  >
                    {t('projects.detail.edit')}
                  </BlueButton>
                  <BlueButton variant="ghost" loading={update.isPending} onClick={() => setStatus('archived', 'archived')}>
                    {t('projects.detail.archive')}
                  </BlueButton>
                </>
              )}
            </div>
          </div>

          {project.description ? (
            <p className="project-description">{project.description}</p>
          ) : archived ? null : (
            <button
              type="button"
              className="link-button project-add-description"
              onClick={() => {
                update.reset();
                setNotice(null);
                setEditing('description');
              }}
            >
              {t('projects.detail.addDescription')}
            </button>
          )}
        </>
      )}

      {archived && !notice ? (
        <BlueAlert variant="warning" title={t('projects.detail.archivedTitle')}>
          {t('projects.detail.archivedBody')}
        </BlueAlert>
      ) : null}
      {outsideError ? <BlueAlert variant="error">{errorLabel(outsideError)}</BlueAlert> : null}
      {notice ? (
        <BlueAlert variant="success" onDismiss={() => setNotice(null)}>
          {notice === 'archived' ? (
            <span className="row" style={{ flexWrap: 'wrap' }}>
              <span>{t('projects.detail.archivedNotice')}</span>
              <BlueButton variant="secondary" size="sm" onClick={() => setStatus('active', 'restored')}>
                {t('projects.detail.undo')}
              </BlueButton>
            </span>
          ) : notice === 'restored' ? (
            t('projects.detail.restored')
          ) : (
            t('projects.detail.saved')
          )}
        </BlueAlert>
      ) : null}

      <ProjectUpdates project={project} />

      <BlueCard title={t('projects.detail.deleteTitle')} className="danger-zone">
        <div className="danger-zone__row">
          <p className="muted">{t('projects.detail.deleteLead')}</p>
          <BlueButton
            variant="danger"
            onClick={() => {
              remove.reset();
              setDeleting(true);
            }}
          >
            {t('projects.detail.deleteButton')}
          </BlueButton>
        </div>
      </BlueCard>

      <TypeNameDialog
        open={deleting}
        title={<Trans i18nKey="projects.detail.confirmTitle" components={{ name: <EntityName>{project.name}</EntityName> }} />}
        name={project.name}
        confirmLabel={t('projects.detail.confirmLabel')}
        busy={remove.isPending}
        error={codeOf(remove.error) ? errorLabel(codeOf(remove.error) ?? '') : null}
        onClose={() => setDeleting(false)}
        onConfirm={(typed) =>
          remove.mutate(typed, {
            onSuccess: () => void navigate('/projects', { replace: true, state: { deletedName: project.name } }),
          })
        }
      >
        {t('projects.detail.confirmBody')}
      </TypeNameDialog>
    </div>
  );
}

/** Name and description edited in place. Enter in the name saves; Escape cancels. */
function EditProjectForm({
  project,
  focus,
  busy,
  error,
  onCancel,
  onSave,
}: {
  project: ProjectDetail;
  focus: 'name' | 'description';
  busy: boolean;
  error: unknown;
  onCancel: () => void;
  onSave: (values: { name: string; description: string | null }) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const descriptionId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const code = codeOf(error);
  const ready = name.trim() !== '';

  useEffect(() => {
    const field = formRef.current?.querySelector<HTMLElement>(focus === 'name' ? 'input' : 'textarea');
    field?.focus();
  }, [focus]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (ready && !busy) onSave({ name: name.trim(), description: description.trim() || null });
  }

  return (
    <form
      ref={formRef}
      className="tile project-edit"
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !busy) onCancel();
      }}
      noValidate
    >
      <div className="project-edit__head">
        <ProjectMonogram name={name.trim() || project.name} archived={false} size="lg" />
        <span className="muted small">{t('projects.edit.heading')}</span>
      </div>
      {code && code !== 'project_name_taken' ? <BlueAlert variant="error">{errorLabel(code)}</BlueAlert> : null}
      <BlueInput
        label={t('projects.form.name')}
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
      <div className="row project-edit__actions">
        <BlueButton variant="ghost" onClick={onCancel} disabled={busy}>
          {t('projects.edit.cancel')}
        </BlueButton>
        <BlueButton type="submit" variant="primary" loading={busy} disabled={!ready}>
          {t('projects.edit.save')}
        </BlueButton>
      </div>
    </form>
  );
}
