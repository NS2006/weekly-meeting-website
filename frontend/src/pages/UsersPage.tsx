import { useCallback, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import type { AdminUser, AdminUsersQuery, Me } from '@weekly-meeting/shared';
import { BlueAlert, BlueCard } from '../components/blue';
import { ConfirmChange, describeChange, needsConfirmation } from '../features/users/ConfirmChange';
import { UserFilters, type StatusFilter } from '../features/users/UserFilters';
import { UsersTable } from '../features/users/UsersTable';
import { useAdminUsers, useChangeUser, useWaitingUsers, type UserChange } from '../features/users/useUsers';
import { AppLayout } from '../layouts/AppLayout';
import { ApiFailure } from '../services/api';
import { errorLabel } from '../utils/errorLabels';

/** Website admin Users page (FR-3): activate or deactivate people, grant or remove admin. Admin role only (see Gate). */
export function UsersPage({ user: me }: { user: Me }) {
  const { t } = useTranslation();
  // Home's "Review and activate" opens the page on the people waiting (?status=waiting).
  const [params] = useSearchParams();
  const [start, setStart] = useState<{ status: StatusFilter; key: number }>(() => ({
    status: params.get('status') === 'waiting' ? 'waiting' : '',
    key: 0,
  }));
  const [query, setQuery] = useState<AdminUsersQuery>(() => (start.status ? { status: start.status } : {}));
  const waiting = useWaitingUsers();
  const waitingCount = waiting.data?.users.length ?? 0;
  const [pending, setPending] = useState<{ user: AdminUser; change: UserChange } | null>(null);
  // The change that was saved, worded at render time so the notice follows the language.
  const [notice, setNotice] = useState<{ user: AdminUser; change: UserChange } | null>(null);
  const users = useAdminUsers(query);
  const changeUser = useChangeUser();
  const onFilters = useCallback((next: AdminUsersQuery) => setQuery(next), []);

  function save(target: AdminUser, change: UserChange) {
    setNotice(null);
    changeUser.mutate(
      { id: target.id, change },
      {
        onSuccess: ({ user }) => {
          setPending(null);
          setNotice({ user, change });
        },
        onError: () => setPending(null),
      },
    );
  }

  function request(target: AdminUser, change: UserChange) {
    if (needsConfirmation(change)) setPending({ user: target, change });
    else save(target, change);
  }

  const loadError = users.error instanceof ApiFailure ? users.error.code : users.error ? 'unknown_error' : null;
  const saveError = changeUser.error instanceof ApiFailure ? changeUser.error.code : changeUser.error ? 'unknown_error' : null;
  const list = users.data?.users ?? [];

  return (
    <AppLayout user={me}>
      <div className="page-head">
        <div>
          <h1 className="page-head__title">{t('users.page.title')}</h1>
          <p className="muted">
            <Trans i18nKey="users.page.lead" components={{ strong: <strong /> }} />
          </p>
        </div>
      </div>
      <BlueCard
        header={
          <header className="blue-card__header row" style={{ justifyContent: 'space-between' }}>
            <span>{t('users.page.people')}</span>
            <span className="muted small">
              {users.data
                ? t(users.data.truncated ? 'users.page.shownTruncated' : 'users.page.shown', { number: list.length })
                : ''}
            </span>
          </header>
        }
      >
        <div className="stack">
          {waitingCount > 0 && query.status !== 'waiting' ? (
            <BlueAlert variant="warning">
              <span className="row" style={{ flexWrap: 'wrap', gap: 'var(--blue-space-3)' }}>
                <span>{t('users.page.waiting', { count: waitingCount })}</span>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => {
                    setStart((current) => ({ status: 'waiting', key: current.key + 1 }));
                    setQuery({ status: 'waiting' });
                  }}
                >
                  {t('users.page.showOnlyThem')}
                </button>
              </span>
            </BlueAlert>
          ) : null}
          <UserFilters key={start.key} initialStatus={start.status} onChange={onFilters} />
          {loadError ? <BlueAlert variant="error">{errorLabel(loadError)}</BlueAlert> : null}
          {saveError ? <BlueAlert variant="error">{errorLabel(saveError)}</BlueAlert> : null}
          {notice && !saveError ? (
            <BlueAlert variant="success" onDismiss={() => setNotice(null)}>
              {describeChange(notice.user, notice.change).done}
            </BlueAlert>
          ) : null}
          {users.data?.truncated ? (
            <BlueAlert variant="info">{t('users.page.truncated')}</BlueAlert>
          ) : null}
          <UsersTable
            users={list}
            meId={me.id}
            loading={users.isPending}
            busyId={changeUser.isPending ? (changeUser.variables?.id ?? null) : null}
            onRequest={request}
          />
        </div>
      </BlueCard>
      <ConfirmChange
        pending={pending}
        busy={changeUser.isPending}
        onConfirm={() => pending && save(pending.user, pending.change)}
        onCancel={() => setPending(null)}
      />
    </AppLayout>
  );
}
