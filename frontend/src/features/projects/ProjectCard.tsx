import type { ProjectSummary } from '@weekly-meeting/shared';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { BlueBadge, BlueSkeleton, initials } from '../../components/blue';
import { CalendarIcon, NotesIcon } from '../../components/icons';
import { formatDate, relativeDate } from '../../utils/dates';
import './projects.css';

/** The project's initials on a tile: brand gradient while active, muted once archived. */
export function ProjectMonogram({ name, archived, size = 'md' }: { name: string; archived: boolean; size?: 'md' | 'lg' }) {
  const classes = ['tile__icon', archived ? 'tile__icon--muted' : 'tile__icon--brand', size === 'lg' ? 'project-monogram--lg' : ''];
  return (
    <span className={classes.filter(Boolean).join(' ')} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

/** One project as a summary card; the whole card opens it. `from` is where its back link should return. */
export function ProjectCard({ project, from }: { project: ProjectSummary; from?: string }) {
  const { t } = useTranslation();
  const archived = project.status === 'archived';
  // "No updates yet", "1 update", "3 updates": how many of my notes have a section for the project.
  const updates =
    project.updateCount === 0 ? t('projects.card.noUpdates') : t('projects.card.updates', { count: project.updateCount });
  return (
    <Link
      to={`/projects/${project.id}`}
      state={from ? { from } : undefined}
      className={`tile tile--link project-card${archived ? ' project-card--archived' : ''}`}
    >
      <span className="project-card__top">
        <ProjectMonogram name={project.name} archived={archived} />
        <span className="project-card__heading">
          <span className="project-card__name">{project.name}</span>
          {archived ? <BlueBadge>{t('projects.card.archived')}</BlueBadge> : null}
        </span>
      </span>
      {project.description ? (
        <span className="muted project-card__description">{project.description}</span>
      ) : (
        <span className="muted project-card__description project-card__description--empty">{t('projects.card.noDescription')}</span>
      )}
      <ul className="project-card__facts small">
        <li>
          <NotesIcon size={16} />
          <span>{updates}</span>
        </li>
        <li>
          <CalendarIcon size={16} />
          <span>
            {project.lastUpdateAt
              ? t('projects.card.lastUpdate', { when: relativeDate(project.lastUpdateAt) })
              : t('projects.card.created', { date: formatDate(project.createdAt) })}
          </span>
        </li>
      </ul>
      <span className="tile__foot project-card__foot small">
        <span>{t('projects.card.open')}</span>
        <span className="tile__arrow" aria-hidden="true">
          →
        </span>
      </span>
    </Link>
  );
}

/** The last tile in the grid: another way to start a new project. */
export function NewProjectTile({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button type="button" className="tile tile--link tile--dashed project-card project-card--new" onClick={onClick}>
      <span className="tile__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </span>
      <span className="project-card__name">{t('projects.card.newTitle')}</span>
      <span className="muted small">{t('projects.card.newBody')}</span>
    </button>
  );
}

export function ProjectCardSkeleton() {
  return (
    <div className="tile project-card" aria-hidden="true">
      <span className="project-card__top">
        <BlueSkeleton width={44} height={44} />
        <BlueSkeleton width="55%" height={18} />
      </span>
      <BlueSkeleton width="85%" height={14} />
      <BlueSkeleton width="40%" height={12} />
    </div>
  );
}
