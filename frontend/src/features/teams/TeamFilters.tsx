import { useTranslation } from 'react-i18next';
import type { TeamRole, TeamSort, TeamsQuery } from '@weekly-meeting/shared';
import { BlueSelect } from '../../components/blue';
import { SearchField } from '../../components/SearchField';

/** Search, my role and sort for the Teams page. The server does the filtering. */
export function TeamFilters({ value, onChange }: { value: TeamsQuery; onChange: (patch: TeamsQuery) => void }) {
  const { t } = useTranslation();
  return (
    <div className="filter-bar" role="search" aria-label={t('teams.filters.label')}>
      <SearchField
        className="filter-bar__search"
        label={t('teams.filters.search')}
        placeholder={t('teams.filters.searchPlaceholder')}
        value={value.q ?? ''}
        onCommit={(q) => onChange({ q })}
      />
      <BlueSelect<'' | TeamRole>
        label={t('teams.filters.myRole')}
        value={value.role ?? ''}
        onChange={(role) => onChange({ role: role || undefined })}
        options={[
          { value: '', label: t('teams.filters.allTeams') },
          { value: 'leader', label: t('teams.filters.lead') },
          { value: 'member', label: t('teams.filters.member') },
        ]}
      />
      <BlueSelect<TeamSort>
        label={t('teams.filters.sortBy')}
        value={value.sort ?? 'name'}
        onChange={(sort) => onChange({ sort })}
        options={[
          { value: 'name', label: t('teams.filters.byName') },
          { value: 'newest', label: t('teams.filters.newest') },
          { value: 'members', label: t('teams.filters.mostMembers') },
        ]}
      />
    </div>
  );
}
