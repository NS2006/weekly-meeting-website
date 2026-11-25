import { useTranslation } from 'react-i18next';
import type { Me } from '@weekly-meeting/shared';
import { EntityName } from '../../components/EntityName';
import { NextMeetings } from '../meetings/NextMeetings';
import { WaitingUsers } from '../users/WaitingUsers';
import { CurrentPeriods } from '../periods/CurrentPeriods';
import { formatLongDate, greeting } from '../../utils/dates';
import './home.css';

/**
 * Home: a greeting, then for a user each team's current period and then the next meetings (owner, 2026-11-25: the
 * periods first), and for an admin the people waiting for access. No tiles for Notes, Projects, Teams or Users: the menu at the top already leads there (owner,
 * 2026-11-24).
 */
export function HomeOverview({ user }: { user: Me }) {
  const { t } = useTranslation();
  const firstName = user.name.trim().split(/\s+/)[0] || user.name;
  const admin = user.activeRole === 'admin';

  return (
    <>
      <section className="home-hero">
        <p className="home-hero__date">{formatLongDate()}</p>
        <h1 className="home-hero__title">
          {greeting()}, <EntityName>{firstName}</EntityName>
        </h1>
        <p className="home-hero__lead">
          {admin ? t('home.leadAdmin') : t('home.leadUser')}
        </p>
      </section>

      {admin ? <WaitingUsers /> : null}
      {admin ? null : <CurrentPeriods />}
      {admin ? null : <NextMeetings />}
    </>
  );
}
