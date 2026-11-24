import type { TeamChoicesResponse } from '@weekly-meeting/shared';
import { Trans, useTranslation } from 'react-i18next';
import { EntityName } from '../../components/EntityName';
import { SearchPicker, type PickerResults, type PickerWords } from '../../components/SearchPicker';
import { useTeam, useTeamChoiceSearch, useTeamChoiceSuggestions } from '../teams/useTeams';

type Query = ReturnType<typeof useTeamChoiceSuggestions>;

function results(query: Pick<Query, 'isPending' | 'isFetching' | 'error' | 'refetch'> & { data?: TeamChoicesResponse | undefined }): PickerResults {
  return {
    // A team's value in the address is "team:<id>" (listFilters.ts, sharedChoice).
    choices: (query.data?.teams ?? []).map((team) => ({ value: `team:${team.id}`, label: team.name })),
    hasMore: query.data?.hasMore ?? false,
    isPending: query.isPending,
    isFetching: query.isFetching,
    error: query.error,
    refetch: () => void query.refetch(),
  };
}

// The picker's query hooks: module functions, so the picker gets the same ones on every render.
const useSuggested = (): PickerResults => results(useTeamChoiceSuggestions());
const useFound = (q: string): PickerResults => results(useTeamChoiceSearch(q));

/**
 * The Notes page's Shared filter (SearchPicker): Shared or not, Not shared yet, Shared on a meeting, and five of my
 * teams at random, or from 2 letters every team of mine whose name holds them ("On Team PIR meetings").
 * `value`: '' | 'no' | 'yes' | 'team:<id>'.
 */
export function SharedFilter({ value, onChange }: { value: string; onChange: (choice: string) => void }) {
  const { t } = useTranslation();
  const teamId = value.startsWith('team:') ? value.slice('team:'.length) : '';
  const team = useTeam(teamId, teamId !== '');

  const valueLabel = !teamId
    ? t(value === 'no' ? 'notes.filters.sharedNo' : value === 'yes' ? 'notes.filters.sharedYes' : 'notes.filters.sharedAny')
    : team.data
      ? t('notes.filters.sharedTeam', { team: team.data.team.name })
      : team.isPending
        ? '…'
        : t('notes.filters.unknownTeam');

  const words: PickerWords = {
    label: t('notes.filters.shared'),
    dialog: t('notes.filters.pickShared'),
    search: t('notes.filters.searchTeams'),
    placeholder: t('notes.filters.typeTwoLetters'),
    suggested: t('notes.filters.suggestedTeams'),
    showOthers: t('notes.filters.showOthers'),
    loading: t('notes.filters.loadingChoices'),
    orType: t('notes.filters.orTypeTeams'),
    none: t('notes.filters.noTeams'),
    noMatch: (query) => <Trans i18nKey="notes.filters.noTeamMatch" components={{ query: <EntityName>{query}</EntityName> }} />,
    moreMatches: t('notes.filters.moreMatches'),
    found: t('notes.filters.foundTeams'),
  };

  return (
    <SearchPicker
      value={value}
      valueLabel={valueLabel}
      fixed={[
        { value: '', label: t('notes.filters.sharedAny') },
        { value: 'no', label: t('notes.filters.sharedNo') },
        { value: 'yes', label: t('notes.filters.sharedYes') },
      ]}
      useSuggestions={useSuggested}
      useSearch={useFound}
      words={words}
      onChange={onChange}
    />
  );
}
