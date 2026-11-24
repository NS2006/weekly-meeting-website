import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateTeamRequest, TeamsQuery, UpdateTeamRequest } from '@weekly-meeting/shared';
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
export const useAddMember = (id: string) => useTeamMutation((userId: string) => api.addTeamMember(id, userId));
export const useRemoveMember = (id: string) => useTeamMutation((userId: string) => api.removeTeamMember(id, userId));
export const useSetLeader = (id: string) => useTeamMutation((userId: string) => api.setTeamLeader(id, userId));
