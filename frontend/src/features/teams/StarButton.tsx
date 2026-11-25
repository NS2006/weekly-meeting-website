import { useTranslation } from 'react-i18next';
import { useStarTeam } from './useTeams';

/**
 * A star on a team (owner, 2026-11-25, like a favourite): starred teams come first in my lists, whatever the order
 * picked. The star is mine only. It changes at once on screen; if saving fails it goes back.
 */
export function StarButton({ team }: { team: { id: string; name: string; starred: boolean } }) {
  const { t } = useTranslation();
  const star = useStarTeam();
  const on = team.starred;
  return (
    <button
      type="button"
      className={`star-button${on ? ' star-button--on' : ''}`}
      aria-pressed={on}
      aria-label={t('teams.star.label', { name: team.name })}
      title={t(on ? 'teams.star.on' : 'teams.star.off')}
      disabled={star.isPending}
      onClick={(event) => {
        // Inside a card that opens the team: the press is for the star only.
        event.preventDefault();
        event.stopPropagation();
        star.mutate({ id: team.id, starred: !on });
      }}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path
          d="M12 3.6l2.55 5.2 5.75.84-4.16 4.05.98 5.71L12 16.7l-5.12 2.7.98-5.71L3.7 9.64l5.75-.84z"
          fill={on ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
