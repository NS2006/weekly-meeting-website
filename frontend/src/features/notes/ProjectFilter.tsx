import type { ProjectChoice } from '@weekly-meeting/shared';
import { Trans, useTranslation } from 'react-i18next';
import { EntityName } from '../../components/EntityName';
import { SearchPicker, type PickerChoice, type PickerResults, type PickerWords } from '../../components/SearchPicker';
import { useProject, useProjectSearch, useProjectSuggestions } from '../projects/useProjects';

type Query = { data?: { projects: ProjectChoice[]; hasMore: boolean } | undefined } & Pick<
  ReturnType<typeof useProjectSuggestions>,
  'isPending' | 'isFetching' | 'error' | 'refetch'
>;

function useChoiceOf() {
  const { t } = useTranslation();
  return (p: ProjectChoice): PickerChoice => ({
    value: p.id,
    label: p.name,
    tag: p.status === 'archived' ? t('notes.filters.archivedTag') : undefined,
  });
}

function results(query: Query, choiceOf: (p: ProjectChoice) => PickerChoice): PickerResults {
  return {
    choices: (query.data?.projects ?? []).map(choiceOf),
    hasMore: query.data?.hasMore ?? false,
    isPending: query.isPending,
    isFetching: query.isFetching,
    error: query.error,
    refetch: () => void query.refetch(),
  };
}

// The picker's query hooks: module functions, so the picker gets the same ones on every render.
function useSuggested(): PickerResults {
  return results(useProjectSuggestions(), useChoiceOf());
}
function useFound(q: string): PickerResults {
  return results(useProjectSearch(q), useChoiceOf());
}

/**
 * The Notes page's Project filter (SearchPicker): All projects, No project and five of my projects at random, or from
 * 2 letters every project of mine whose name holds them. `value`: '' (all), 'none', or a project id.
 */
export function ProjectFilter({ value, onChange }: { value: string; onChange: (project: string) => void }) {
  const { t } = useTranslation();
  const isProject = value !== '' && value !== 'none';
  const picked = useProject(value, isProject);

  const valueLabel = !isProject
    ? t(value === 'none' ? 'notes.filters.noProject' : 'notes.filters.anyProject')
    : picked.data
      ? picked.data.project.status === 'archived'
        ? t('notes.filters.archivedProject', { name: picked.data.project.name })
        : picked.data.project.name
      : picked.isPending
        ? '…'
        : t('notes.filters.unknownProject');

  const words: PickerWords = {
    label: t('notes.filters.project'),
    dialog: t('notes.filters.pickProject'),
    search: t('notes.filters.searchProjects'),
    placeholder: t('notes.filters.typeTwoLetters'),
    suggested: t('notes.filters.suggestedProjects'),
    showOthers: t('notes.filters.showOthers'),
    loading: t('notes.filters.loadingChoices'),
    orType: t('notes.filters.orTypeProjects'),
    none: t('notes.filters.noProjects'),
    noMatch: (query) => <Trans i18nKey="notes.filters.noProjectMatch" components={{ query: <EntityName>{query}</EntityName> }} />,
    moreMatches: t('notes.filters.moreMatches'),
    found: t('notes.filters.foundProjects'),
  };

  return (
    <SearchPicker
      value={value}
      valueLabel={valueLabel}
      fixed={[
        { value: '', label: t('notes.filters.anyProject') },
        { value: 'none', label: t('notes.filters.noProject') },
      ]}
      useSuggestions={useSuggested}
      useSearch={useFound}
      words={words}
      onChange={onChange}
    />
  );
}
