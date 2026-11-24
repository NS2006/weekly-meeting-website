import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateNoteRequest, NoteResponse, NotesQuery } from '@weekly-meeting/shared';
import { api } from '../../services/api';

export const NOTES_KEY = ['notes'] as const;

/** My notes, newest first, in pages ("Show more"); narrowed by text on the server. Old results stay while new load. */
export function useMyNotes(q: string) {
  return useInfiniteQuery({
    queryKey: [...NOTES_KEY, 'mine', 'search', q],
    queryFn: ({ pageParam }) => api.listNotes({ q: q || undefined, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.reduce((n, page) => n + page.notes.length, 0) : undefined),
    placeholderData: keepPreviousData,
  });
}

/**
 * One page of my notes for the Notes page, filtered and sorted on the server, with how many match in all. The page on
 * screen stays (faded) while the next one loads.
 */
export function useNotesPage(query: NotesQuery) {
  return useQuery({
    queryKey: [...NOTES_KEY, 'mine', 'page', query],
    queryFn: () => api.listNotes(query),
    placeholderData: keepPreviousData,
  });
}

/** A project page's updates: the sections of my notes tagged with it, newest note first, in pages. */
export function useProjectUpdates(projectId: string) {
  return useInfiniteQuery({
    queryKey: [...NOTES_KEY, 'updates', projectId],
    queryFn: ({ pageParam }) => api.projectUpdates(projectId, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.reduce((n, page) => n + page.updates.length, 0) : undefined),
  });
}

/**
 * One note, loaded once for the editor: no refetch on focus, since the editor owns the content from then on (a
 * newer version saved elsewhere shows up as a conflict when saving, not as text replaced under the cursor).
 */
export function useNote(id: string) {
  return useQuery({
    queryKey: [...NOTES_KEY, 'one', id],
    queryFn: () => api.getNote(id),
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
    gcTime: 0,
  });
}

/** Note lists, project updates and the project cards (update counts) refresh after a note changes. */
export function useRefreshNoteLists() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: [...NOTES_KEY, 'mine'] }),
      queryClient.invalidateQueries({ queryKey: [...NOTES_KEY, 'updates'] }),
      queryClient.invalidateQueries({ queryKey: ['projects'] }),
    ]);
}

export function useCreateNote() {
  const refresh = useRefreshNoteLists();
  return useMutation({ mutationFn: (body: CreateNoteRequest = {}) => api.createNote(body), onSettled: refresh });
}

/**
 * Puts a note on a meeting's board or takes it off. The note's own cache entry gets the new list of meetings (its
 * version is untouched, so an open editor is not reloaded); note lists and every meeting view refresh.
 */
export function useNoteMeetingLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ noteId, meetingId, linked }: { noteId: string; meetingId: string; linked: boolean }) =>
      linked ? api.linkNoteToMeeting(noteId, meetingId) : api.unlinkNoteFromMeeting(noteId, meetingId),
    onSuccess: ({ meetings }, { noteId }) => {
      queryClient.setQueryData<NoteResponse>([...NOTES_KEY, 'one', noteId], (old) => (old ? { note: { ...old.note, meetings } } : old));
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: [...NOTES_KEY, 'mine'] }),
        queryClient.invalidateQueries({ queryKey: ['meetings'] }),
      ]),
  });
}

/** Deletes one of my notes (`mutate(noteId)`); the lists refresh. */
export function useDeleteNote() {
  const queryClient = useQueryClient();
  const refresh = useRefreshNoteLists();
  return useMutation({
    mutationFn: (id: string) => api.deleteNote(id),
    onSuccess: (_answer, id) => queryClient.removeQueries({ queryKey: [...NOTES_KEY, 'one', id] }),
    onSettled: refresh,
  });
}

/** Makes a copy of one of my notes as a new note; the lists refresh. */
export function useCopyNote() {
  const refresh = useRefreshNoteLists();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title?: string }) => api.copyNote(id, title === undefined ? {} : { title }),
    onSettled: refresh,
  });
}
