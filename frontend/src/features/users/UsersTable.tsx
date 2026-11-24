import { useTranslation } from 'react-i18next';
import type { AdminUser } from '@weekly-meeting/shared';
import { BlueAvatar, BlueBadge, BlueEmptyState, BlueSelect, BlueTable, type BlueTableColumn } from '../../components/blue';
import { formatDateTime } from '../../utils/dates';
import type { UserChange } from './useUsers';
import './users.css';

type StatusValue = 'active' | 'inactive';
type RoleValue = 'user' | 'admin';

/**
 * One row per user. The dropdowns show the saved value: a change is asked for (onRequest), and the row only
 * shows the new value once the server has saved it, so a cancelled or refused change leaves it as it was.
 */
export function UsersTable({
  users,
  meId,
  loading,
  busyId,
  onRequest,
}: {
  users: AdminUser[];
  meId: string;
  loading: boolean;
  busyId: string | null;
  onRequest: (user: AdminUser, change: UserChange) => void;
}) {
  const { t } = useTranslation();
  const locked = (user: AdminUser) => user.id === meId || user.adminFromConfig || busyId !== null;

  const columns: BlueTableColumn<AdminUser>[] = [
    {
      key: 'user',
      header: t('users.table.user'),
      render: (user) => (
        <span className="user-cell">
          <BlueAvatar name={user.name} size="sm" />
          <span className="user-cell__who">
            <span className="user-cell__name">
              {user.name}
              {user.id === meId ? <BlueBadge variant="info">{t('users.table.you')}</BlueBadge> : null}
              {user.waiting ? <BlueBadge variant="warning">{t('users.table.waiting')}</BlueBadge> : null}
            </span>
            <span className="muted small user-cell__email">{user.email}</span>
            {user.adminFromConfig ? <span className="muted small">{t('users.table.adminFromConfig')}</span> : null}
          </span>
        </span>
      ),
    },
    {
      key: 'status',
      header: t('users.table.status'),
      width: '160px',
      render: (user) => (
        <BlueSelect<StatusValue>
          size="sm"
          ariaLabel={t('users.table.statusOf', { name: user.name })}
          value={user.status}
          disabled={locked(user)}
          onChange={(status) => onRequest(user, { kind: 'status', status })}
          options={[
            { value: 'active', label: t('users.table.active') },
            { value: 'inactive', label: t('users.table.inactive') },
          ]}
        />
      ),
    },
    {
      key: 'role',
      header: t('users.table.role'),
      width: '140px',
      render: (user) => (
        <BlueSelect<RoleValue>
          size="sm"
          ariaLabel={t('users.table.roleOf', { name: user.name })}
          value={user.roles.includes('admin') ? 'admin' : 'user'}
          disabled={locked(user)}
          onChange={(role) => onRequest(user, { kind: 'admin', admin: role === 'admin' })}
          options={[
            { value: 'user', label: t('roles.user') },
            { value: 'admin', label: t('roles.admin') },
          ]}
        />
      ),
    },
    {
      key: 'last',
      header: t('users.table.lastSignIn'),
      render: (user) => <span className="nowrap">{formatDateTime(user.lastLoginAt, t('users.table.notRecorded'))}</span>,
    },
    {
      key: 'first',
      header: t('users.table.firstSignIn'),
      render: (user) => <span className="nowrap muted">{formatDateTime(user.createdAt)}</span>,
    },
  ];

  return (
    <BlueTable
      caption={t('users.table.caption')}
      columns={columns}
      data={users}
      rowKey={(user) => user.id}
      loading={loading}
      empty={<BlueEmptyState title={t('users.table.noMatch')}>{t('users.table.noMatchBody')}</BlueEmptyState>}
    />
  );
}
