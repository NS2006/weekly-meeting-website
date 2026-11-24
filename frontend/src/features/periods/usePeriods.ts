import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';

// Under the team's own key (['teams', id, …]), so a team change (a new split) refreshes its periods as well.

/** The team's periods with their counts, oldest first. */
export function useTeamPeriods(teamId: string, enabled = true) {
  return useQuery({
    queryKey: ['teams', teamId, 'periods'],
    queryFn: () => api.teamPeriods(teamId),
    enabled: enabled && teamId !== '',
  });
}

/** One period. Going to the next one keeps this one on screen (faded) until it arrives, so the switcher stays put. */
export function usePeriod(teamId: string, key: string) {
  return useQuery({
    queryKey: ['teams', teamId, 'periods', key],
    queryFn: () => api.period(teamId, key),
    retry: false,
    placeholderData: keepPreviousData,
  });
}

/** The whole period to read; fetched only when that tab is open. */
export function usePeriodNotes(teamId: string, key: string, enabled: boolean) {
  return useQuery({
    queryKey: ['teams', teamId, 'periods', key, 'notes'],
    queryFn: () => api.periodNotes(teamId, key),
    enabled,
  });
}

/** The current period of each of my teams (Home). */
export function useCurrentPeriods(enabled = true) {
  return useQuery({ queryKey: ['teams', 'current-periods'], queryFn: () => api.currentPeriods(), enabled });
}
