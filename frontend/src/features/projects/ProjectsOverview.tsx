import { useState } from 'react';
import type { ProjectSort, ProjectStatus, ProjectsQuery } from '@weekly-meeting/shared';
import { Trans, useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
import {
  BlueAlert,
  BlueButton,
  BlueCard,
  BlueEmptyState,
  BlueSelect,
  BlueTabs,
  tabPanelProps,
} from '../../components/blue';
import { EntityName } from '../../components/EntityName';
import { NotesIcon } from '../../components/icons';
import { SearchField } from '../../components/SearchField';
import { ApiFailure } from '../../services/api';
import { errorLabel } from '../../utils/errorLabels';
import { useFilterParams } from '../../utils/useFilterParams';
import { NewProjectTile, ProjectCard, ProjectCardSkeleton } from './ProjectCard';
import { ProjectFormDialog } from './ProjectFormDialog';
import { useCreateProject, useProjects } from './useProjects';
import './projects.css';

const SORTS: readonly string[] = ['updated', 'name', 'newest'];
const codeOf = (error: unknown) => (error instanceof ApiFailure ? error.code : error ? 'unknown_error' : null);

/**
 * The Projects page: my own projects as cards, Active or Archived, searched and sorted on the server. Everything
 * lives in the address (?status=archived&q=…&sort=name), so Back, reload and a shared link keep it.
 */
export function ProjectsOverview() {
  const { t } = useTranslation();
  const filterParams = useFilterParams();
  const location = useLocation();
  const navigate = useNavigate();
  const create = useCreateProject();
  const [creating, setCreating] = useState(false);
  // After a delete the detail page sends us here with the name, to confirm what happened.
  const [deletedName, setDeletedName] = useState<string | null>(() => {
    const state = location.state as { deletedName?: unknown } | null;
    return typeof state?.deletedName === 'string' ? state.deletedName : null;
  });

  const status: ProjectStatus = filterParams.get('status') === 'archived' ? 'archived' : 'active';
  const sortParam = filterParams.get('sort');
  const query: ProjectsQuery = {
    status,
    q: filterParams.get('q') || undefined,
    sort: SORTS.includes(sortParam) ? (sortParam as ProjectSort) : undefined,
  };
  const searching = Boolean(query.q);
  const projects = useProjects(query);
  const list = projects.data?.projects ?? [];
  const counts = projects.data?.counts;
  const error = codeOf(projects.error);
  const here = `${location.pathname}${location.search}`;
  const hasAny = counts ? counts.active + counts.archived > 0 : false;

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
          onChange={(next) => filterParams.update({ status: next === 'archived' ? 'archived' : undefined })}
          tabs={[
            { id: 'active', label: `${t('projects.overview.active')}${counts ? ` (${counts.active})` : ''}` },
            { id: 'archived', label: `${t('projects.overview.archived')}${counts ? ` (${counts.archived})` : ''}` },
          ]}
        />

        {hasAny || searching ? (
          <>
            <div className="filter-bar" role="search" aria-label={t('projects.overview.filter')}>
              <SearchField
                className="filter-bar__search"
                label={t('projects.overview.search')}
                placeholder={t('projects.overview.searchPlaceholder')}
                value={query.q ?? ''}
                onCommit={(q) => filterParams.update({ q })}
              />
              <BlueSelect<ProjectSort>
                label={t('projects.overview.sortBy')}
                value={query.sort ?? 'updated'}
                onChange={(sort) => filterParams.update({ sort: sort === 'updated' ? undefined : sort })}
                options={[
                  { value: 'updated', label: t('projects.overview.sortUpdated') },
                  { value: 'name', label: t('projects.overview.sortName') },
                  { value: 'newest', label: t('projects.overview.sortNewest') },
                ]}
              />
            </div>
            {projects.data && searching ? (
              <p className="filter-summary small" aria-live="polite">
                <span className="muted">{t('projects.overview.matches', { count: list.length })}</span>
                <button type="button" className="link-button" onClick={() => filterParams.update({ q: undefined })}>
                  {t('projects.overview.clearSearch')}
                </button>
              </p>
            ) : null}
          </>
        ) : null}

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
              {searching ? (
                <BlueEmptyState
                  icon={<NotesIcon size={26} />}
                  title={t('projects.overview.noMatch')}
                  action={
                    <BlueButton variant="secondary" onClick={() => filterParams.update({ q: undefined })}>
                      {t('projects.overview.clearSearch')}
                    </BlueButton>
                  }
                >
                  {status === 'active' ? t('projects.overview.tryOtherArchived') : t('projects.overview.tryOther')}
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
            <div className={`project-grid tile-grid${projects.isPlaceholderData ? ' is-refreshing' : ''}`}>
              {list.map((project) => (
                <ProjectCard key={project.id} project={project} from={here} />
              ))}
              {status === 'active' && !searching ? <NewProjectTile onClick={startCreating} /> : null}
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
              void navigate(`/projects/${project.id}`, { state: { from: here } });
            },
          })
        }
      />
    </>
  );
}
