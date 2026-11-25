import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateTeamRequest, TeamResponse, TeamsQuery, TeamsResponse, TeamSummary, UpdateTeamRequest } from '@weekly-meeting/shared';
import { api } from '../../services/api';

const TEAMS_KEY = ['teams'] as const;

/** My teams, filtered on the server. While new filters load, the previous results stay on screen. */
export function useTeams(query: TeamsQuery = {}) {
  return useQuery({
    queryKey: [...TEAMS_KEY, 'list', query],
    queryFn: () => api.listTeams(query),
    placeholderData: keepPreviousData,
  });
}

export function useTeam(id: string, enabled = true) {
  return useQuery({ queryKey: [...TEAMS_KEY, id], queryFn: () => api.getTeam(id), retry: false, enabled });
}

/**
 * A team picker before typing: a few of my teams at random. Fetched once per mount and kept as is (no refetch on
 * focus); dropped on unmount (gcTime 0), so the next opening shows a new pick. `refetch()` shows others.
 */
export function useTeamChoiceSuggestions() {
  return useQuery({
    queryKey: [...TEAMS_KEY, 'choices', 'random'],
    queryFn: () => api.teamChoices(),
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
}

/** A team picker's search: my teams whose name holds the text, from 2 letters on. */
export function useTeamChoiceSearch(q: string) {
  const text = q.trim();
  return useQuery({
    queryKey: [...TEAMS_KEY, 'choices', 'search', text],
    queryFn: () => api.teamChoices(text),
    enabled: text.length >= 2,
    staleTime: 30_000,
  });
}

export function usePeopleSearch(q: string) {
  const text = q.trim();
  return useQuery({
    queryKey: ['people', text],
    queryFn: () => api.searchPeople(text),
    enabled: text.length >= 2,
    staleTime: 30_000,
  });
}

/**
 * "Add people" before typing: a few random active people not in the team. Fetched once per mount and kept as is
 * (no refetch on focus or after adding someone, so the list doesn't reshuffle under the pointer); dropped on unmount
 * (gcTime 0), so the next opening shows a new pick. `refetch()` shows others.
 */
export function useMemberSuggestions(teamId: string) {
  return useQuery({
    queryKey: ['member-suggestions', teamId],
    queryFn: () => api.memberSuggestions(teamId),
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
}

/** Every team change refreshes the list and the team pages afterwards. */
function useTeamMutation<V, R>(fn: (vars: V) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => queryClient.invalidateQueries({ queryKey: TEAMS_KEY }),
  });
}

export const useCreateTeam = () => useTeamMutation((body: CreateTeamRequest) => api.createTeam(body));
export const useUpdateTeam = (id: string) => useTeamMutation((body: UpdateTeamRequest) => api.updateTeam(id, body));
export const useDeleteTeam = (id: string) => useTeamMutation((confirmName: string) => api.deleteTeam(id, confirmName));
export const useRestoreTeam = () => useTeamMutation((id: string) => api.restoreTeam(id));

export type DeletedTeamsAction = 'restore' | 'forever';

/**
 * The Deleted teams bar: restores the picked teams, or deletes them for good, one after the other. `onEach` counts each
 * team as soon as it is done, so a failure part-way still says what was done; the lists (and the meetings a restore
 * brings back) refresh once at the end.
 */
export function useDeletedTeamsAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, action, onEach }: { ids: readonly string[]; action: DeletedTeamsAction; onEach?: (id: string) => void }) => {
      for (const id of ids) {
        if (action === 'restore') await api.restoreTeam(id);
        else await api.deleteTeamForever(id);
        onEach?.(id);
      }
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: TEAMS_KEY }),
        queryClient.invalidateQueries({ queryKey: ['meetings'] }),
      ]),
  });
}
export const useAddMember = (id: string) => useTeamMutation((userId: string) => api.addTeamMember(id, userId));
export const useRemoveMember = (id: string) => useTeamMutation((userId: string) => api.removeTeamMember(id, userId));
export const useSetLeader = (id: string) => useTeamMutation((userId: string) => api.setTeamLeader(id, userId));

/**
 * Stars a team or takes its star off. The star shows at once (lists and the team page); the lists are then loaded
 * again, so a starred team moves first. If saving fails, the star goes back.
 */
export function useStarTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, starred }: { id: string; starred: boolean }) => (starred ? api.starTeam(id) : api.unstarTeam(id)),
    onMutate: async ({ id, starred }) => {
      await queryClient.cancelQueries({ queryKey: TEAMS_KEY });
      const lists = queryClient.getQueriesData<TeamsResponse>({ queryKey: [...TEAMS_KEY, 'list'] });
      const detail = queryClient.getQueryData<TeamResponse>([...TEAMS_KEY, id]);
      const mark = (team: TeamSummary) => (team.id === id ? { ...team, starred } : team);
      for (const [key, data] of lists) {
        if (data) queryClient.setQueryData<TeamsResponse>(key, { teams: data.teams.map(mark), archived: data.archived.map(mark) });
      }
      if (detail) queryClient.setQueryData<TeamResponse>([...TEAMS_KEY, id], { team: { ...detail.team, starred } });
      return { lists, detail };
    },
    onError: (_error, { id }, context) => {
      for (const [key, data] of context?.lists ?? []) queryClient.setQueryData(key, data);
      if (context?.detail) queryClient.setQueryData([...TEAMS_KEY, id], context.detail);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: TEAMS_KEY }),
  });
}
