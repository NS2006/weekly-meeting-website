import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Me, TeamRole, TeamSort, TeamsQuery } from '@weekly-meeting/shared';
import { useNavigate } from 'react-router';
import { BlueAlert, BlueButton, BlueCard, BlueEmptyState } from '../components/blue';
import { TeamsIcon } from '../components/icons';
import { DeletedTeams } from '../features/teams/DeletedTeams';
import { NewTeamTile, TeamCard, TeamCardSkeleton } from '../features/teams/TeamCard';
import { TeamFilters } from '../features/teams/TeamFilters';
import { TeamFormDialog } from '../features/teams/TeamFormDialog';
import { useCreateTeam, useTeams } from '../features/teams/useTeams';
import { AppLayout } from '../layouts/AppLayout';
import { ApiFailure } from '../services/api';
import { errorLabel } from '../utils/errorLabels';
import { useFilterParams } from '../utils/useFilterParams';
import '../features/teams/teams.css';

const ROLES: readonly string[] = ['leader', 'member'];
const SORTS: readonly string[] = ['name', 'newest', 'members'];

/** My teams (searchable, by role, sorted), a "New team" button, and the deleted teams I can still restore. */
export function TeamsPage({ user }: { user: Me }) {
  const { t } = useTranslation();
  const filterParams = useFilterParams();
  // Unknown values in the address are ignored rather than sent to the server.
  const role = filterParams.get('role');
  const sort = filterParams.get('sort');
  const filters: TeamsQuery = {
    q: filterParams.get('q') || undefined,
    role: ROLES.includes(role) ? (role as TeamRole) : undefined,
    sort: SORTS.includes(sort) ? (sort as TeamSort) : undefined,
  };
  const filtering = Boolean(filters.q || filters.role);

  const teams = useTeams(filters);
  const createTeam = useCreateTeam();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  const loadError = teams.error instanceof ApiFailure ? teams.error.code : teams.error ? 'unknown_error' : null;
  const list = teams.data?.teams ?? [];
  const archived = teams.data?.archived ?? [];
  const startCreating = () => {
    createTeam.reset();
    setCreating(true);
  };
  const clearFilters = () => filterParams.update({ q: undefined, role: undefined });
  function changeFilters(patch: TeamsQuery) {
    const next: Record<string, string | undefined> = {};
    if ('q' in patch) next.q = patch.q;
    if ('role' in patch) next.role = patch.role;
    // Name is the default order: leave it out of the address.
    if ('sort' in patch) next.sort = patch.sort === 'name' ? undefined : patch.sort;
    filterParams.update(next);
  }
  // Without any team and without filters there is nothing to filter: the page shows only the welcome.
  const showFilters = filtering || list.length > 0 || archived.length > 0;

  return (
    <AppLayout user={user}>
      <div className="page-head">
        <div>
          <h1 className="page-head__title">{t('teams.list.title')}</h1>
          <p className="muted">{t('teams.list.lead')}</p>
        </div>
        <BlueButton variant="primary" onClick={startCreating}>
          {t('teams.list.newTeam')}
        </BlueButton>
      </div>

      <div className="stack">
        {showFilters ? (
          <>
            <TeamFilters value={filters} onChange={changeFilters} />
            {teams.data ? (
              <p className="filter-summary small" aria-live="polite">
                <span className="muted">
                  {t(filtering ? 'teams.list.matchCount' : 'teams.list.count', { count: list.length })}
                </span>
                {filtering ? (
                  <button type="button" className="link-button" onClick={clearFilters}>
                    {t('teams.list.clearFilters')}
                  </button>
                ) : null}
              </p>
            ) : null}
          </>
        ) : null}

        {loadError ? <BlueAlert variant="error">{errorLabel(loadError)}</BlueAlert> : null}
        {teams.isPending ? (
          <div className="team-grid" role="status">
            <span className="visually-hidden">{t('teams.list.loading')}</span>
            {[0, 1, 2].map((n) => (
              <TeamCardSkeleton key={n} />
            ))}
          </div>
        ) : loadError ? null : list.length === 0 && filtering ? (
          <BlueCard>
            <BlueEmptyState
              title={t('teams.list.noMatch')}
              icon={<TeamsIcon size={26} />}
              action={
                <BlueButton variant="secondary" onClick={clearFilters}>
                  {t('teams.list.clearFilters')}
                </BlueButton>
              }
            >
              {t('teams.list.noMatchBody')}
            </BlueEmptyState>
          </BlueCard>
        ) : list.length === 0 ? (
          <BlueCard>
            <BlueEmptyState
              title={t('teams.list.empty')}
              icon={<TeamsIcon size={26} />}
              action={
                <BlueButton variant="primary" onClick={startCreating}>
                  {t('teams.list.createTeam')}
                </BlueButton>
              }
            >
              {t('teams.list.emptyBody')}
            </BlueEmptyState>
          </BlueCard>
        ) : (
          <div className={`team-grid tile-grid${teams.isPlaceholderData ? ' is-refreshing' : ''}`}>
            {list.map((team) => (
              <TeamCard key={team.id} team={team} />
            ))}
            {filtering ? null : <NewTeamTile onClick={startCreating} />}
          </div>
        )}

        {archived.length > 0 ? <DeletedTeams teams={archived} /> : null}
      </div>

      <TeamFormDialog
        open={creating}
        title={t('teams.list.formTitle')}
        submitLabel={t('teams.list.formSubmit')}
        initial={{ name: '', description: null }}
        busy={createTeam.isPending}
        error={createTeam.error}
        onClose={() => setCreating(false)}
        onSubmit={(values) =>
          createTeam.mutate(values, {
            onSuccess: ({ team }) => {
              setCreating(false);
              void navigate(`/teams/${team.id}`);
            },
          })
        }
      />
    </AppLayout>
  );
}
