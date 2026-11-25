import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiFailure } from '../../services/api';
import { errorLabel } from '../../utils/errorLabels';
import { useCreateProject } from '../projects/useProjects';
import { useNoteProjects } from './noteProjects';
import { matchProjects, nameToCreate } from './projectChoice';

/**
 * The list of my active projects to tag a section with, and optional extra actions below it (for example "Remove
 * section"). The box above finds a project, or creates one (owner, 2026-11-25: without leaving the note): when no
 * project has the typed name, "+ Create project “…”" makes it and tags the section at once; with nothing typed,
 * "+ New project" puts the cursor in the box. Enter picks the first project found, or creates when none is. Picks keep
 * the editor's selection (mousedown is not let through).
 */
export function ProjectMenu({
  current,
  onPick,
  footer,
  className = '',
}: {
  current: string | null;
  onPick: (projectId: string) => void;
  footer?: ReactNode;
  className?: string;
}) {
  const { t } = useTranslation();
  const { active, loading } = useNoteProjects();
  const create = useCreateProject();
  const [q, setQ] = useState('');
  const [naming, setNaming] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  // With many projects the box is where to start; with a few, a click on one is quicker (and on a phone, focusing the
  // box would open the keyboard for nothing).
  const many = active.length > 7;
  const shown = matchProjects(active, q);
  const newName = nameToCreate(active, q);
  const failed = create.error instanceof ApiFailure ? create.error.code : create.error ? 'unknown_error' : null;

  useEffect(() => {
    if (many) search.current?.focus();
  }, [many]);

  const make = async (name: string) => {
    if (create.isPending) return;
    try {
      // The list of projects is loaded again before the pick, so the section shows the new name straight away.
      const { project } = await create.mutateAsync({ name });
      onPick(project.id);
    } catch {
      // Said below the list (create.error).
    }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const first = shown[0];
    if (q.trim() && first) onPick(first.id);
    else if (newName) void make(newName);
  };

  return (
    <div className={`project-menu ${className}`.trim()} role="menu" aria-label={t('notes.projectMenu.label')}>
      <input
        ref={search}
        className="project-menu__search"
        type="search"
        maxLength={100}
        placeholder={naming ? t('notes.projectMenu.newName') : t('notes.projectMenu.find')}
        aria-label={t('notes.projectMenu.find')}
        value={q}
        onChange={(event) => {
          setQ(event.target.value);
          if (create.error) create.reset();
        }}
        onKeyDown={onKeyDown}
      />
      {loading ? (
        <p className="project-menu__note">{t('notes.projectMenu.loading')}</p>
      ) : active.length === 0 && !q.trim() ? (
        <p className="project-menu__note">{t('notes.projectMenu.none')}</p>
      ) : shown.length === 0 ? (
        newName ? null : <p className="project-menu__note">{t('notes.projectMenu.noMatch')}</p>
      ) : (
        <ul className="project-menu__list">
          {shown.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={p.id === current}
                className={`project-menu__item ${p.id === current ? 'project-menu__item--on' : ''}`.trim()}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onPick(p.id)}
              >
                <span className="project-menu__dot" aria-hidden="true" />
                <span className="project-menu__name">{p.name}</span>
                {p.id === current ? <span className="project-menu__check">✓</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
      {loading ? null : newName ? (
        <button
          type="button"
          role="menuitem"
          className="project-menu__create"
          disabled={create.isPending}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => void make(newName)}
        >
          {create.isPending ? t('notes.projectMenu.creating', { name: newName }) : t('notes.projectMenu.create', { name: newName })}
        </button>
      ) : !q.trim() ? (
        <button
          type="button"
          role="menuitem"
          className="project-menu__create"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            setNaming(true);
            search.current?.focus();
          }}
        >
          {t('notes.projectMenu.newProject')}
        </button>
      ) : null}
      {failed ? (
        <p className="project-menu__error" role="alert">
          {failed === 'project_name_taken' ? t('notes.projectMenu.nameTaken') : errorLabel(failed)}
        </p>
      ) : null}
      {footer ? <div className="project-menu__footer">{footer}</div> : null}
    </div>
  );
}
