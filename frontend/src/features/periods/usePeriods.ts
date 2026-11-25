import { keepPreviousData, useQueries, useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { PeriodMeetingNotes, PeriodNotesQuery } from '@weekly-meeting/shared';
import { api } from '../../services/api';
import { nextPart } from './readerFilter';

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

/**
 * The period's notes to read (fetched only when that tab is open): the list of its meetings with notes, and the first
 * part of the ones asked for in full (the latest 3 at the start; about 100 notes), with the meetings left for later
 * parts (`usePeriodParts`). While another pick loads, the notes on screen stay (faded).
 */
export function usePeriodNotes(teamId: string, key: string, request: PeriodNotesQuery, enabled: boolean) {
  return useQuery({
    queryKey: ['teams', teamId, 'periods', key, 'notes', request],
    queryFn: () => api.periodNotes(teamId, key, request),
    enabled,
    placeholderData: keepPreviousData,
    // Like its later parts, it stays as read (a refresh of the first part alone would mix old and new).
    refetchOnWindowFocus: false,
  });
}

/**
 * One later part of a reading: these meetings, for the request's people. Should the server send fewer (a note was
 * added since the parts were worked out), the rest is asked for at once, so the part always comes whole.
 */
export async function fetchPart(teamId: string, key: string, request: PeriodNotesQuery, meetingIds: readonly string[]): Promise<PeriodMeetingNotes[]> {
  const meetings: PeriodMeetingNotes[] = [];
  let left = meetingIds;
  while (left.length > 0) {
    const part = await api.periodNotes(teamId, key, nextPart(request, left));
    meetings.push(...part.meetings);
    left = part.rest;
  }
  return meetings;
}

/**
 * The later parts of a reading (stress test, 2026-11-25): each its own request, made only for the parts `wanted` (named
 * by their first meeting: near the screen, or jumped to), so going to the last meeting loads that part alone, not
 * everything before it.
 */
export function usePeriodParts(teamId: string, key: string, request: PeriodNotesQuery, parts: readonly string[][], wanted: ReadonlySet<string>) {
  return useQueries({
    queries: parts.map((meetingIds) => ({
      queryKey: ['teams', teamId, 'periods', key, 'notes', request, 'part', meetingIds],
      queryFn: () => fetchPart(teamId, key, request, meetingIds),
      enabled: wanted.has(meetingIds[0] ?? ''),
      // A part read once stays as it is while the page is open (no refetch on focus: that would load every part again).
      staleTime: Infinity,
      refetchOnWindowFocus: false,
    })),
    combine: partsOf,
  });
}

/** What the reader needs of each part; the same array while nothing changed (so effects do not run on every render). */
const partsOf = (results: UseQueryResult<PeriodMeetingNotes[]>[]) =>
  results.map((r) => ({ data: r.data, isError: r.isError, refetch: r.refetch }));

/** The current period of each of my teams (Home). */
export function useCurrentPeriods(enabled = true) {
  return useQuery({ queryKey: ['teams', 'current-periods'], queryFn: () => api.currentPeriods(), enabled });
}
