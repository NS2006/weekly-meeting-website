import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateProjectRequest, ProjectsQuery, UpdateProjectRequest } from '@weekly-meeting/shared';
import { api } from '../../services/api';

const PROJECTS_KEY = ['projects'] as const;

/** My projects, filtered on the server. While new filters load, the previous results stay on screen. */
export function useProjects(query: ProjectsQuery) {
  return useQuery({
    queryKey: [...PROJECTS_KEY, 'list', query],
    queryFn: () => api.listProjects(query),
    placeholderData: keepPreviousData,
  });
}

export function useProject(id: string, enabled = true) {
  return useQuery({ queryKey: [...PROJECTS_KEY, 'one', id], queryFn: () => api.getProject(id), retry: false, enabled });
}

/**
 * A project picker before typing: a few of my projects at random. Fetched once per mount and kept as is (no refetch
 * on focus); dropped on unmount (gcTime 0), so the next opening shows a new pick. `refetch()` shows others.
 */
export function useProjectSuggestions() {
  return useQuery({
    queryKey: [...PROJECTS_KEY, 'choices', 'random'],
    queryFn: () => api.projectChoices(),
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
}

/** A project picker's search: my projects whose name holds the text, from 2 letters on. */
export function useProjectSearch(q: string) {
  const text = q.trim();
  return useQuery({
    queryKey: [...PROJECTS_KEY, 'choices', 'search', text],
    queryFn: () => api.projectChoices(text),
    enabled: text.length >= 2,
    staleTime: 30_000,
  });
}

/** Every project change refreshes the list and the project pages afterwards. */
function useProjectMutation<V, R>(fn: (vars: V) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => queryClient.invalidateQueries({ queryKey: PROJECTS_KEY }),
  });
}

export const useCreateProject = () => useProjectMutation((body: CreateProjectRequest) => api.createProject(body));
export const useUpdateProject = (id: string) =>
  useProjectMutation((body: UpdateProjectRequest) => api.updateProject(id, body));

/** Deleting also drops the cached project, so nothing tries to show it again. */
export function useDeleteProject(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (confirmName: string) => api.deleteProject(id, confirmName),
    onSuccess: () => queryClient.removeQueries({ queryKey: [...PROJECTS_KEY, 'one', id] }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: [...PROJECTS_KEY, 'list'] }),
  });
}
