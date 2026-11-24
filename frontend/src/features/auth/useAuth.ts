import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Me, MockSignInRequest, WebsiteRole } from '@weekly-meeting/shared';
import { ApiFailure, api } from '../../services/api';

export const ME_KEY = ['me'] as const;

/** Who is signed in: the user, or null when nobody is (401). Other failures (server down) are errors. */
async function fetchMe(): Promise<Me | null> {
  try {
    return (await api.me()).user;
  } catch (err) {
    if (err instanceof ApiFailure && err.status === 401) return null;
    throw err;
  }
}

export function useMe(options: { refetchInterval?: number } = {}) {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: fetchMe,
    retry: (count, err) => !(err instanceof ApiFailure && err.status > 0 && err.status < 500) && count < 2,
    staleTime: 30_000,
    refetchInterval: options.refetchInterval,
  });
}

export function useSignIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (identity: MockSignInRequest) => api.mockSignIn(identity),
    onSuccess: ({ user }) => queryClient.setQueryData(ME_KEY, user),
  });
}

export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.signOut(),
    // Signed out on this device even if the request failed: forget everything cached for this user.
    // Not queryClient.clear(): that also drops the `me` query the route guard is watching, so it never
    // hears that nobody is signed in any more.
    onSettled: () => {
      queryClient.setQueryData(ME_KEY, null);
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== ME_KEY[0] });
    },
  });
}

export function useSetActiveRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (role: WebsiteRole) => api.setActiveRole(role),
    onSuccess: ({ user }) => queryClient.setQueryData(ME_KEY, user),
  });
}
