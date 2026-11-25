import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { UpdateOrder } from '@weekly-meeting/shared';
import { api } from '../../services/api';

// Stale at once (the app's default): opening the tab or a project, or coming back to the window, loads it again, so
// notes shared or taken off since show up.
const KEY = ['team-projects'] as const;

/** Every project shared on the team's meetings in the period (the board filters them on the page). */
export function usePeriodProjects(teamId: string, key: string) {
  return useQuery({ queryKey: [...KEY, teamId, key], queryFn: () => api.periodProjects(teamId, key) });
}

/** A project's parts shared on the period's meetings, latest first, in pages ("Show older updates"). */
export function usePeriodProjectUpdates(teamId: string, key: string, projectId: string | null, order: UpdateOrder = 'newest') {
  return useInfiniteQuery({
    queryKey: [...KEY, teamId, key, 'updates', projectId, order],
    queryFn: ({ pageParam }) => api.periodProjectUpdates(teamId, key, projectId ?? '', pageParam, order),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.reduce((n, page) => n + page.updates.length, 0) : undefined),
    enabled: projectId !== null,
  });
}
