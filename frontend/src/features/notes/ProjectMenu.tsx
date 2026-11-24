import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useNoteProjects } from './noteProjects';

/**
 * The list of my active projects to tag a section with (a search box once there are many), and optional extra actions
 * below it (for example "Remove section"). Picks keep the editor's selection (mousedown is not let through).
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
  const [q, setQ] = useState('');
  const search = useRef<HTMLInputElement>(null);
  const many = active.length > 7;
  const shown = q.trim() ? active.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase())) : active;

  useEffect(() => {
    if (many) search.current?.focus();
  }, [many]);

  return (
    <div className={`project-menu ${className}`.trim()} role="menu" aria-label={t('notes.projectMenu.label')}>
      {many ? (
        <input
          ref={search}
          className="project-menu__search"
          type="search"
          placeholder={t('notes.projectMenu.find')}
          aria-label={t('notes.projectMenu.find')}
          value={q}
          onChange={(event) => setQ(event.target.value)}
        />
      ) : null}
      {loading ? (
        <p className="project-menu__note">{t('notes.projectMenu.loading')}</p>
      ) : active.length === 0 ? (
        <p className="project-menu__note">
          <Trans i18nKey="notes.projectMenu.none" components={{ page: <Link to="/projects" /> }} />
        </p>
      ) : shown.length === 0 ? (
        <p className="project-menu__note">{t('notes.projectMenu.noMatch')}</p>
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
      {footer ? <div className="project-menu__footer">{footer}</div> : null}
    </div>
  );
}
