import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { PeriodNotesQuery } from '@weekly-meeting/shared';
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
/**
 * The period's notes to read: the list of its meetings with notes, and the ones asked for in full (the latest 3 at the
 * start). While another pick loads, the notes on screen stay (faded).
 */
export function usePeriodNotes(teamId: string, key: string, request: PeriodNotesQuery, enabled: boolean) {
  return useQuery({
    queryKey: ['teams', teamId, 'periods', key, 'notes', request],
    queryFn: () => api.periodNotes(teamId, key, request),
    enabled,
    placeholderData: keepPreviousData,
  });
}

/** The current period of each of my teams (Home). */
export function useCurrentPeriods(enabled = true) {
  return useQuery({ queryKey: ['teams', 'current-periods'], queryFn: () => api.currentPeriods(), enabled });
}
