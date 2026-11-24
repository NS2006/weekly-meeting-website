import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminUsersQuery, UserStatus } from '@weekly-meeting/shared';
import { ApiFailure, api } from '../../services/api';
import { ME_KEY } from '../auth/useAuth';

const USERS_KEY = ['admin', 'users'] as const;

export function useAdminUsers(query: AdminUsersQuery) {
  return useQuery({
    queryKey: [...USERS_KEY, query],
    queryFn: () => api.listUsers(query),
    placeholderData: keepPreviousData, // keep the table while a new filter loads
  });
}

/**
 * The people waiting for access (admin Home, the count on the Users link), checked again every minute. The same
 * query as the Users page filtered to them, so activating someone there updates both.
 */
export function useWaitingUsers(enabled = true) {
  return useQuery({
    queryKey: [...USERS_KEY, { status: 'waiting' }],
    queryFn: () => api.listUsers({ status: 'waiting' }),
    enabled,
    refetchInterval: 60_000,
  });
}

export type UserChange = { kind: 'status'; status: UserStatus } | { kind: 'admin'; admin: boolean };

export function useChangeUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, change }: { id: string; change: UserChange }) =>
      change.kind === 'status' ? api.setUserStatus(id, change.status) : api.setUserAdmin(id, change.admin),
    onSettled: (_data, error) => {
      void queryClient.invalidateQueries({ queryKey: USERS_KEY });
      // Lost the admin role meanwhile (another admin removed it): refresh who we are, which leaves the page.
      if (error instanceof ApiFailure && (error.code === 'admin_only' || error.code === 'account_inactive')) {
        void queryClient.invalidateQueries({ queryKey: ME_KEY });
      }
    },
  });
}
