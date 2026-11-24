import { Trans, useTranslation } from 'react-i18next';
import type { TeamSummary } from '@weekly-meeting/shared';
import { Link } from 'react-router';
import { BlueAvatar, BlueBadge, BlueSkeleton, initials } from '../../components/blue';
import { EntityName } from '../../components/EntityName';

/** The team's initials on a tile: brand gradient for teams I lead, a light brand tint otherwise. */
export function TeamMonogram({ name, mine, size = 'md' }: { name: string; mine: boolean; size?: 'md' | 'lg' }) {
  const classes = ['tile__icon', size === 'lg' ? 'team-monogram--lg' : '', mine ? 'tile__icon--brand' : ''];
  return (
    <span className={classes.filter(Boolean).join(' ')} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function TeamCard({ team }: { team: TeamSummary }) {
  const { t } = useTranslation();
  const leads = team.myRole === 'leader';
  return (
    <Link to={`/teams/${team.id}`} className="tile tile--link team-card">
      <span className="team-card__top">
        <TeamMonogram name={team.name} mine={leads} />
        {leads ? <BlueBadge variant="info">{t('teams.card.leader')}</BlueBadge> : null}
      </span>
      <span className="team-card__name">{team.name}</span>
      {team.description ? <span className="muted team-card__description">{team.description}</span> : null}
      <span className="tile__foot team-card__foot muted small">
        {!leads && team.leader ? <BlueAvatar name={team.leader.name} size="sm" /> : null}
        <span>
          {t('teams.memberCount', { count: team.memberCount })}
          {leads ? null : (
            <>
              {' · '}
              {team.leader ? (
                <Trans i18nKey="teams.card.ledBy" components={{ name: <EntityName>{team.leader.name}</EntityName> }} />
              ) : (
                t('teams.card.ledByNobody')
              )}
            </>
          )}
        </span>
        <span className="tile__arrow" aria-hidden="true">
          →
        </span>
      </span>
    </Link>
  );
}

/** The last tile in the grid: another way to start a new team. */
export function NewTeamTile({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button type="button" className="tile tile--link tile--dashed team-card team-card--new" onClick={onClick}>
      <span className="tile__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </span>
      <span className="team-card__name">{t('teams.card.newTitle')}</span>
      <span className="muted small">{t('teams.card.newBody')}</span>
    </button>
  );
}

/** A shimmering team card while the list loads. */
export function TeamCardSkeleton() {
  return (
    <div className="tile team-card" aria-hidden="true">
      <BlueSkeleton width={44} height={44} />
      <BlueSkeleton width="55%" height={18} />
      <BlueSkeleton width="85%" height={14} />
      <span className="tile__foot team-card__foot">
        <BlueSkeleton width="45%" height={12} />
      </span>
    </div>
  );
}

/** The team page's shape while it loads. */
export function TeamPageSkeleton() {
  const { t } = useTranslation();
  return (
    <div className="stack" role="status">
      <span className="visually-hidden">{t('teams.card.loadingTeam')}</span>
      <div className="team-head" aria-hidden="true">
        <BlueSkeleton width={56} height={56} />
        <div className="team-head__text">
          <BlueSkeleton width={220} height={26} />
          <BlueSkeleton width={140} height={14} />
        </div>
      </div>
      <div className="tile" aria-hidden="true">
        <BlueSkeleton width="30%" height={18} />
        {[0, 1, 2].map((row) => (
          <div key={row} className="row">
            <BlueSkeleton width={36} height={36} radius="50%" />
            <BlueSkeleton width="40%" height={14} />
          </div>
        ))}
      </div>
    </div>
  );
}
