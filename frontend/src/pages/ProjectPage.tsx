import type { Me } from '@weekly-meeting/shared';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useParams } from 'react-router';
import { BlueCard, BlueEmptyState, BlueSkeleton } from '../components/blue';
import { ProjectDetailView } from '../features/projects/ProjectDetailView';
import { useProject } from '../features/projects/useProjects';
import { AppLayout } from '../layouts/AppLayout';
import { ApiFailure } from '../services/api';
import { errorLabel } from '../utils/errorLabels';
import '../features/teams/teams.css';

/** One of my projects. Its back link returns to the Projects page with the filters it was opened from. */
export function ProjectPage({ user }: { user: Me }) {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const project = useProject(id);
  const code = project.error instanceof ApiFailure ? project.error.code : project.error ? 'unknown_error' : null;
  const from = (useLocation().state as { from?: unknown } | null)?.from;
  const back = typeof from === 'string' && from.startsWith('/projects') ? from : '/projects';

  return (
    <AppLayout user={user}>
      <Link to={back} className="back-link">
        <span className="back-link__arrow" aria-hidden="true">
          ←
        </span>
        {t('projects.page.all')}
      </Link>
      {project.isPending ? (
        <div className="stack" role="status">
          <span className="visually-hidden">{t('projects.page.loading')}</span>
          <div className="project-head" aria-hidden="true">
            <BlueSkeleton width={56} height={56} />
            <div className="project-head__text">
              <BlueSkeleton width={240} height={26} />
              <BlueSkeleton width={180} height={14} />
            </div>
          </div>
        </div>
      ) : project.data ? (
        <ProjectDetailView project={project.data.project} />
      ) : (
        <BlueCard>
          <BlueEmptyState title={code === 'not_found' ? t('projects.page.notFound') : t('projects.page.couldNotLoad')}>
            {code === 'not_found' ? t('projects.page.notFoundBody') : errorLabel(code ?? '')}
          </BlueEmptyState>
        </BlueCard>
      )}
    </AppLayout>
  );
}
