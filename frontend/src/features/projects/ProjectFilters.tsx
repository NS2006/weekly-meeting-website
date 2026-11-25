import type { ProjectActivity, ProjectSort } from '@weekly-meeting/shared';
import { useTranslation } from 'react-i18next';
import { BlueSelect } from '../../components/blue';
import { SearchField } from '../../components/SearchField';
import { fromSharedChoice, sharedChoice } from '../notes/listFilters';
import { SharedFilter } from '../notes/SharedFilter';
import type { ProjectListFilters } from './listFilters';

type Patch = Partial<Record<keyof ProjectListFilters, string>>;

/**
 * The Projects page's filters, all run on the server (owner, 2026-11-25): words, when the updates were last written,
 * where they are shared (the Notes page's searchable team picker) and the order. `onChange` gets only what changed (an
 * empty string clears it).
 */
export function ProjectFilters({ value, onChange }: { value: ProjectListFilters; onChange: (patch: Patch) => void }) {
  const { t } = useTranslation();
  return (
    <div className="filter-bar project-filters" role="search" aria-label={t('projects.overview.filter')}>
      <SearchField
        className="filter-bar__search"
        label={t('projects.overview.search')}
        placeholder={t('projects.overview.searchPlaceholder')}
        value={value.q}
        onCommit={(q) => onChange({ q })}
      />
      <BlueSelect<'any' | ProjectActivity>
        label={t('projects.filters.lastUpdate')}
        value={value.activity || 'any'}
        onChange={(activity) => onChange({ activity: activity === 'any' ? '' : activity })}
        options={[
          { value: 'any', label: t('projects.filters.activityAny') },
          { value: 'week', label: t('projects.filters.activityWeek') },
          { value: 'month', label: t('projects.filters.activityMonth') },
          { value: 'quarter', label: t('projects.filters.activityQuarter') },
          { value: 'quiet', label: t('projects.filters.activityQuiet') },
          { value: 'none', label: t('projects.filters.activityNone') },
        ]}
      />
      <SharedFilter value={sharedChoice(value)} onChange={(choice) => onChange(fromSharedChoice(choice))} />
      <BlueSelect<ProjectSort>
        label={t('projects.overview.sortBy')}
        value={value.sort}
        onChange={(sort) => onChange({ sort: sort === 'updated' ? '' : sort })}
        options={[
          { value: 'updated', label: t('projects.overview.sortUpdated') },
          { value: 'stale', label: t('projects.overview.sortStale') },
          { value: 'updates', label: t('projects.overview.sortUpdates') },
          { value: 'name', label: t('projects.overview.sortName') },
          { value: 'newest', label: t('projects.overview.sortNewest') },
          { value: 'oldest', label: t('projects.overview.sortOldest') },
        ]}
      />
    </div>
  );
}
