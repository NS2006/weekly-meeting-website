import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { BlueAlert, BlueAvatar, BlueCard, BlueEmptyState, BlueSkeleton } from '../../components/blue';
import { UsersIcon } from '../../components/icons';
import { ApiFailure } from '../../services/api';
import { relativeDate } from '../../utils/dates';
import { errorLabel } from '../../utils/errorLabels';
import { useWaitingUsers } from './useUsers';
import './users.css';

/** How many waiting people Home names; the rest are counted. */
const SHOWN = 5;

/**
 * Admin Home (owner, 2026-11-24): the people who signed in and are waiting for access, newest first, so a new person
 * is seen at once; "Review and activate" opens the Users page showing only them. Checked again every minute.
 */
export function WaitingUsers() {
  const { t } = useTranslation();
  const waiting = useWaitingUsers();
  const list = waiting.data?.users ?? [];
  const code = waiting.error instanceof ApiFailure ? waiting.error.code : waiting.error ? 'unknown_error' : null;
  const count = list.length;

  return (
    <BlueCard
      header={
        <header className="blue-card__header row card-head">
          <span>{t('waitingUsers.title')}</span>
          {count > 0 ? <span className="waiting-count">{count}</span> : null}
        </header>
      }
    >
      {code ? (
        <BlueAlert variant="error">{errorLabel(code)}</BlueAlert>
      ) : waiting.isPending ? (
        <div className="stack" aria-hidden="true">
          <BlueSkeleton width="60%" height={16} />
          <BlueSkeleton width="45%" height={16} />
        </div>
      ) : count === 0 ? (
        <BlueEmptyState icon={<UsersIcon size={26} />} title={t('waitingUsers.none')}>
          {t('waitingUsers.noneBody')}
        </BlueEmptyState>
      ) : (
        <div className="stack">
          <p className="muted">{t('waitingUsers.count', { count })}</p>
          <ul className="waiting-list">
            {list.slice(0, SHOWN).map((person) => (
              <li key={person.id} className="waiting-list__item">
                <BlueAvatar name={person.name} size="sm" />
                <span className="waiting-list__who">
                  <span className="waiting-list__name">{person.name}</span>
                  <span className="muted small waiting-list__email">{person.email}</span>
                </span>
                {person.lastLoginAt ? (
                  <span className="muted small nowrap">{t('waitingUsers.signedIn', { when: relativeDate(person.lastLoginAt) })}</span>
                ) : null}
              </li>
            ))}
          </ul>
          {count > SHOWN ? <p className="muted small">{t('waitingUsers.more', { count: count - SHOWN })}</p> : null}
          <div>
            <Link to="/users?status=waiting" className="blue-button blue-button--primary blue-button--md">
              {t('waitingUsers.review')}
            </Link>
          </div>
        </div>
      )}
    </BlueCard>
  );
}
