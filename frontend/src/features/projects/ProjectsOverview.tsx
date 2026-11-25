import { useEffect, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { BlueAlert, BlueButton, BlueCard, BlueEmptyState, BlueTabs, tabPanelProps } from '../../components/blue';
import { EntityName } from '../../components/EntityName';
import { NotesIcon } from '../../components/icons';
import { Paged } from '../../components/Paged';
import { ApiFailure } from '../../services/api';
import { errorLabel } from '../../utils/errorLabels';
import { readPage } from '../../utils/pageParam';
import { useFilterParams } from '../../utils/useFilterParams';
import { CLEARED, isFiltered, PROJECTS_PER_PAGE, projectsQuery, readProjectFilters, readProjectStatus } from './listFilters';
import { NewProjectTile, ProjectCard, ProjectCardSkeleton } from './ProjectCard';
import { ProjectFilters } from './ProjectFilters';
import { ProjectFormDialog } from './ProjectFormDialog';
import { useCreateProject, useProjects } from './useProjects';
import './projects.css';

const codeOf = (error: unknown) => (error instanceof ApiFailure ? error.code : error ? 'unknown_error' : null);

/**
 * The Projects page: my own projects as cards, Active or Archived, 12 to a page (owner, 2026-11-25), filtered, sorted
 * and counted on the server: words, when the updates were last written, where they are shared, and the order.
 * Everything lives in the address (?status=archived&activity=quiet&page=2), so Back, reload and a shared link keep it;
 * a new filter or tab starts from the first page. A new project stays on the list (owner, 2026-11-25): Active, page 1,
 * no filters, newest first, so it shows at the top, lit for a moment, with "<name> was created · Open it".
 */
export function ProjectsOverview() {
  const { t } = useTranslation();
  const params = useFilterParams();
  const location = useLocation();
  const create = useCreateProject();
  const [creating, setCreating] = useState(false);
  // After a delete the detail page sends us here with the name, to confirm what happened.
  const [deletedName, setDeletedName] = useState<string | null>(() => {
    const state = location.state as { deletedName?: unknown } | null;
    return typeof state?.deletedName === 'string' ? state.deletedName : null;
  });
  const [created, setCreated] = useState<{ id: string; name: string } | null>(null);
  const top = useRef<HTMLDivElement>(null);

  const status = readProjectStatus(params.get);
  const filters = readProjectFilters(params.get);
  const page = readPage(params.get);
  const projects = useProjects(projectsQuery(status, filters, page));
  const list = projects.data?.projects ?? [];
  const total = projects.data?.total ?? 0;
  const counts = projects.data?.counts;
  const lastPage = Math.max(1, Math.ceil(total / PROJECTS_PER_PAGE));
  const filtered = isFiltered(filters);
  const error = codeOf(projects.error);
  const here = `${location.pathname}${location.search}`;
  // A brand-new person has nothing to filter yet: the filters wait for the first project.
  const hasAny = filtered || (counts ? counts.active + counts.archived > 0 : false);

  // A page past the end (the last project on it archived, or an old link) goes to the last page there is.
  const { update } = params;
  useEffect(() => {
    if (projects.data && !projects.isPlaceholderData && page > lastPage) update({ page: lastPage > 1 ? String(lastPage) : '' });
  }, [projects.data, projects.isPlaceholderData, page, lastPage, update]);

  const change = (patch: Record<string, string | undefined>) => {
    setDeletedName(null);
    setCreated(null);
    params.update({ ...patch, page: '' }); // a new filter or tab starts from the first page
  };
  const goTo = (next: number) => {
    params.update({ page: next > 1 ? String(next) : '' });
    top.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };
  const startCreating = () => {
    create.reset();
    setCreating(true);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-head__title">{t('projects.overview.title')}</h1>
          <p className="muted">{t('projects.overview.lead')}</p>
        </div>
        <BlueButton variant="primary" onClick={startCreating}>
          {t('projects.overview.newProject')}
        </BlueButton>
      </div>

      <div className="stack">
        {created ? (
          <BlueAlert variant="success" onDismiss={() => setCreated(null)}>
            <span className="row" style={{ flexWrap: 'wrap' }}>
              <Trans i18nKey="projects.overview.created" components={{ name: <EntityName>{created.name}</EntityName> }} />
              <Link to={`/projects/${created.id}`} state={{ from: here }}>
                {t('projects.overview.openCreated')}
              </Link>
            </span>
          </BlueAlert>
        ) : null}
        {deletedName ? (
          <BlueAlert variant="success" onDismiss={() => setDeletedName(null)}>
            <Trans i18nKey="projects.overview.deleted" components={{ name: <EntityName>{deletedName}</EntityName> }} />
          </BlueAlert>
        ) : null}

        <BlueTabs
          variant="segmented"
          label={t('projects.overview.tabs')}
          idPrefix="projects"
          value={status}
          onChange={(next) => change({ status: next === 'archived' ? 'archived' : '' })}
          tabs={[
            { id: 'active', label: `${t('projects.overview.active')}${counts ? ` (${counts.active})` : ''}` },
            { id: 'archived', label: `${t('projects.overview.archived')}${counts ? ` (${counts.archived})` : ''}` },
          ]}
        />

        {hasAny ? <ProjectFilters value={filters} onChange={change} /> : null}

        <div {...tabPanelProps('projects', status)}>
          {error ? (
            <BlueAlert variant="error">{errorLabel(error)}</BlueAlert>
          ) : projects.isPending ? (
            <div className="project-grid" role="status">
              <span className="visually-hidden">{t('projects.overview.loading')}</span>
              {[0, 1, 2].map((n) => (
                <ProjectCardSkeleton key={n} />
              ))}
            </div>
          ) : list.length === 0 ? (
            <BlueCard>
              {filtered ? (
                <BlueEmptyState
                  icon={<NotesIcon size={26} />}
                  title={t('projects.overview.noMatch')}
                  action={
                    <BlueButton variant="secondary" onClick={() => change(CLEARED)}>
                      {t('projects.overview.clearFilters')}
                    </BlueButton>
                  }
                >
                  {/* "Look in Archived" only when something there matches. */}
                  {status === 'active' && (counts?.archived ?? 0) > 0 ? t('projects.overview.tryOtherArchived') : t('projects.overview.tryOther')}
                </BlueEmptyState>
              ) : status === 'archived' ? (
                <BlueEmptyState icon={<NotesIcon size={26} />} title={t('projects.overview.noArchived')}>
                  {t('projects.overview.noArchivedBody')}
                </BlueEmptyState>
              ) : (
                <BlueEmptyState
                  icon={<NotesIcon size={26} />}
                  title={t('projects.overview.firstTitle')}
                  action={
                    <BlueButton variant="primary" onClick={startCreating}>
                      {t('projects.overview.newProject')}
                    </BlueButton>
                  }
                >
                  {t('projects.overview.firstBody')}
                </BlueEmptyState>
              )}
            </BlueCard>
          ) : (
            <div className="project-results" ref={top}>
              <Paged
                current={page}
                total={total}
                pageSize={PROJECTS_PER_PAGE}
                label={t('projects.overview.pages')}
                disabled={projects.isPlaceholderData}
                onChange={goTo}
                head={
                  <>
                    <span className="project-results__count" role="status">
                      {lastPage > 1
                        ? t('projects.overview.range', {
                            from: (page - 1) * PROJECTS_PER_PAGE + 1,
                            to: (page - 1) * PROJECTS_PER_PAGE + list.length,
                            count: total,
                          })
                        : t('projects.overview.count', { count: total })}
                    </span>
                    {filtered ? (
                      <button type="button" className="link-button" onClick={() => change(CLEARED)}>
                        {t('projects.overview.clearFilters')}
                      </button>
                    ) : null}
                  </>
                }
              >
                <div className={`project-grid tile-grid${projects.isPlaceholderData ? ' is-refreshing' : ''}`}>
                  {list.map((project) => (
                    <ProjectCard key={project.id} project={project} from={here} fresh={created?.id === project.id} />
                  ))}
                  {/* "New project" ends the whole list: on its last page, when nothing narrows it. */}
                  {status === 'active' && !filtered && page === lastPage ? <NewProjectTile onClick={startCreating} /> : null}
                </div>
              </Paged>
            </div>
          )}
        </div>
      </div>

      <ProjectFormDialog
        open={creating}
        busy={create.isPending}
        error={create.error}
        onClose={() => setCreating(false)}
        onSubmit={(values) =>
          create.mutate(values, {
            onSuccess: ({ project }) => {
              setCreating(false);
              // Back to where the new project shows first: Active, page 1, no filters, recently updated (or newest).
              params.update({ ...CLEARED, status: '', sort: filters.sort === 'newest' ? 'newest' : '' });
              setDeletedName(null);
              setCreated({ id: project.id, name: project.name });
              window.scrollTo({ top: 0, behavior: 'smooth' });
            },
          })
        }
      />
    </>
  );
}
