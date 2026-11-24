import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type {
  ArrangeNotesRequest,
  ArrangeSpeakersRequest,
  CreateSeriesRequest,
  MeetingBoardColumn,
  MeetingBoardResponse,
  MyMeetingsQuery,
  UpdateMeetingRequest,
  UpdateSeriesRequest,
} from '@weekly-meeting/shared';

/** The Meetings page filters (everything but the tab and the page). */
type MyMeetingsFilters = Omit<MyMeetingsQuery, 'when' | 'offset'>;
import { api } from '../../services/api';

const SERIES_KEY = ['series'] as const;
const MEETINGS_KEY = ['meetings'] as const;

export function useSeries(teamId: string) {
  return useQuery({ queryKey: [...SERIES_KEY, teamId], queryFn: () => api.listSeries(teamId) });
}

export function useUpcomingTeamMeetings(teamId: string) {
  return useQuery({
    queryKey: [...MEETINGS_KEY, 'team', teamId, 'upcoming'],
    queryFn: () => api.teamMeetings(teamId, 'upcoming'),
  });
}

/** Past meetings, newest first, a page at a time ("Show more"). Loads only once the Past tab is opened. */
export function usePastTeamMeetings(teamId: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: [...MEETINGS_KEY, 'team', teamId, 'past'],
    queryFn: ({ pageParam }) => api.teamMeetings(teamId, 'past', pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.reduce((n, page) => n + page.meetings.length, 0) : undefined),
    enabled,
  });
}

/** The Meetings page: every upcoming meeting of my teams, filtered on the server. Old results stay while new load. */
export function useMyMeetings(filters: MyMeetingsFilters, enabled: boolean) {
  return useQuery({
    queryKey: [...MEETINGS_KEY, 'all', 'upcoming', filters],
    queryFn: () => api.myMeetings({ ...filters, when: 'upcoming' }),
    enabled,
    placeholderData: keepPreviousData,
  });
}

/** The Meetings page, Past: newest first, a page at a time, filtered on the server. */
export function useMyPastMeetings(filters: MyMeetingsFilters, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: [...MEETINGS_KEY, 'all', 'past', filters],
    queryFn: ({ pageParam }) => api.myMeetings({ ...filters, when: 'past', offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.reduce((n, page) => n + page.meetings.length, 0) : undefined),
    enabled,
    placeholderData: keepPreviousData,
  });
}

/** The next two weeks of meetings across my teams (Home). */
export function useMyUpcomingMeetings() {
  return useQuery({ queryKey: [...MEETINGS_KEY, 'mine'], queryFn: () => api.upcomingMeetings() });
}

/**
 * One meeting. Going to the previous or next one keeps this one on screen (faded) until it arrives, so the switcher,
 * and the keyboard focus in it, stay put.
 */
export function useMeeting(id: string) {
  return useQuery({
    queryKey: [...MEETINGS_KEY, 'one', id],
    queryFn: () => api.getMeeting(id),
    retry: false,
    placeholderData: keepPreviousData,
  });
}

/** The meetings of a meeting's schedule around it, for the "jump to" list (refreshed with every meeting change). */
export function useMeetingSchedule(id: string) {
  return useQuery({ queryKey: [...MEETINGS_KEY, 'schedule', id], queryFn: () => api.meetingSchedule(id), retry: false });
}

const boardKey = (meetingId: string) => [...MEETINGS_KEY, 'board', meetingId] as const;
const boardNoteKey = (meetingId: string, noteId: string) => [...boardKey(meetingId), 'note', noteId] as const;

/** A meeting's board of notes (refreshed when the tab comes back into view, so new notes show up during the meeting). */
export function useMeetingBoard(meetingId: string) {
  return useQuery({ queryKey: boardKey(meetingId), queryFn: () => api.meetingBoard(meetingId), retry: false });
}

/** One note on the board, in full; nothing is fetched while `noteId` is null. */
export function useMeetingNote(meetingId: string, noteId: string | null) {
  return useQuery({
    queryKey: boardNoteKey(meetingId, noteId ?? ''),
    queryFn: () => api.meetingNote(meetingId, noteId ?? ''),
    enabled: noteId !== null,
    retry: false,
    staleTime: NOTE_FRESH_MS,
  });
}

/** A note read on the board stays fresh this long (Previous / Next back and forth loads nothing again). */
const NOTE_FRESH_MS = 60_000;

/** Loads a note before it is opened (the next and previous ones while reading). */
export function usePrefetchMeetingNote(meetingId: string) {
  const queryClient = useQueryClient();
  return useCallback(
    (noteId: string) =>
      void queryClient.prefetchQuery({
        queryKey: boardNoteKey(meetingId, noteId),
        queryFn: () => api.meetingNote(meetingId, noteId),
        staleTime: NOTE_FRESH_MS,
      }),
    [queryClient, meetingId],
  );
}

/** A new order for the board: the speaking order, or one person's notes. `columns` is the board as it will look. */
export type BoardArrangement = { columns: MeetingBoardColumn[] } & (
  | { kind: 'speakers'; body: ArrangeSpeakersRequest }
  | { kind: 'notes'; body: ArrangeNotesRequest }
);

/**
 * Saves a new order on the board. The board shows it at once (a dropped card stays where it was dropped); if the
 * server refuses, the board goes back as it was and is loaded again.
 */
export function useArrangeBoard(meetingId: string) {
  const queryClient = useQueryClient();
  const key = boardKey(meetingId);
  return useMutation({
    mutationFn: (change: BoardArrangement) =>
      change.kind === 'speakers' ? api.arrangeSpeakers(meetingId, change.body) : api.arrangeNotes(meetingId, change.body),
    onMutate: async (change) => {
      await queryClient.cancelQueries({ queryKey: key });
      const before = queryClient.getQueryData<MeetingBoardResponse>(key);
      if (before) queryClient.setQueryData<MeetingBoardResponse>(key, { ...before, columns: change.columns });
      return { before };
    },
    onError: (_error, _change, context) => {
      if (context?.before) queryClient.setQueryData(key, context.before);
      void queryClient.invalidateQueries({ queryKey: key });
    },
    onSuccess: (board) => queryClient.setQueryData(key, board),
  });
}

/** A schedule or meeting change refreshes every schedule and meeting list afterwards (they depend on each other). */
function useMeetingMutation<V, R>(fn: (vars: V) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: SERIES_KEY }),
        queryClient.invalidateQueries({ queryKey: MEETINGS_KEY }),
      ]),
  });
}

export const useCreateSeries = (teamId: string) =>
  useMeetingMutation((body: CreateSeriesRequest) => api.createSeries(teamId, body));
export const useUpdateSeries = () =>
  useMeetingMutation(({ id, body }: { id: string; body: UpdateSeriesRequest }) => api.updateSeries(id, body));
export const useDeleteSeries = () => useMeetingMutation((id: string) => api.deleteSeries(id));
export const useUpdateMeeting = (id: string) =>
  useMeetingMutation((body: UpdateMeetingRequest) => api.updateMeeting(id, body));
