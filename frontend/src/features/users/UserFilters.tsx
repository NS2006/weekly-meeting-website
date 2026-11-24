import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AdminUsersQuery } from '@weekly-meeting/shared';
import { BlueInput, BlueSelect } from '../../components/blue';
import './users.css';

export type StatusFilter = '' | 'active' | 'inactive' | 'waiting';
type AdminFilter = '' | 'true' | 'false';

/** Search (waits 300 ms after typing) plus status and role filters; the status can start set (from the address). */
export function UserFilters({
  initialStatus = '',
  onChange,
}: {
  initialStatus?: StatusFilter;
  onChange: (query: AdminUsersQuery) => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [status, setStatus] = useState<StatusFilter>(initialStatus);
  const [admin, setAdmin] = useState<AdminFilter>('');

  useEffect(() => {
    const timer = setTimeout(
      () => onChange({ q: text.trim() || undefined, status: status || undefined, admin: admin || undefined }),
      300,
    );
    return () => clearTimeout(timer);
  }, [text, status, admin, onChange]);

  return (
    <div className="user-filters" role="search">
      <BlueInput
        className="user-filters__search"
        label={t('users.filters.search')}
        type="search"
        placeholder={t('users.filters.searchPlaceholder')}
        maxLength={100}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <BlueSelect<StatusFilter>
        label={t('users.filters.status')}
        value={status}
        onChange={setStatus}
        options={[
          { value: '', label: t('users.filters.allStatuses') },
          { value: 'waiting', label: t('users.filters.waiting') },
          { value: 'inactive', label: t('users.filters.inactive') },
          { value: 'active', label: t('users.filters.active') },
        ]}
      />
      <BlueSelect<AdminFilter>
        label={t('users.filters.role')}
        value={admin}
        onChange={setAdmin}
        options={[
          { value: '', label: t('users.filters.allRoles') },
          { value: 'true', label: t('users.filters.admins') },
          { value: 'false', label: t('users.filters.users') },
        ]}
      />
    </div>
  );
}
