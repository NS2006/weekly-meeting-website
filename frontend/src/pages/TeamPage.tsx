import { useState, type ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { Me, TeamDetail, TeamMemberView } from '@weekly-meeting/shared';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { BlueAlert, BlueBadge, BlueButton, BlueCard, BlueEmptyState, BlueTabs, tabPanelProps } from '../components/blue';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EntityName } from '../components/EntityName';
import { TeamMeetingsPanel } from '../features/meetings/TeamMeetingsPanel';
import { AddMemberDialog } from '../features/teams/AddMemberDialog';
import { DeleteTeamDialog } from '../features/teams/DeleteTeamDialog';
import { MembersTable } from '../features/teams/MembersTable';
import { TeamMonogram, TeamPageSkeleton } from '../features/teams/TeamCard';
import { TeamFormDialog } from '../features/teams/TeamFormDialog';
import {
  useDeleteTeam,
  useRemoveMember,
  useRestoreTeam,
  useSetLeader,
  useTeam,
  useUpdateTeam,
} from '../features/teams/useTeams';
import { AppLayout } from '../layouts/AppLayout';
import { ApiFailure } from '../services/api';
import { daysUntil, formatDate } from '../utils/dates';
import { errorLabel } from '../utils/errorLabels';
import '../features/teams/teams.css';

type Dialog =
  | { kind: 'edit' }
  | { kind: 'add' }
  | { kind: 'delete' }
  | { kind: 'leave' }
  | { kind: 'leader'; member: TeamMemberView }
  | { kind: 'remove'; member: TeamMemberView }
  | null;

const codeOf = (error: unknown) => (error instanceof ApiFailure ? error.code : error ? 'unknown_error' : null);

/** One team: members, and — for its leader — editing, adding people, handing over, removing and deleting. */
export function TeamPage({ user }: { user: Me }) {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const team = useTeam(id);

  return (
    <AppLayout user={user}>
      <Link to="/teams" className="back-link">
        <span className="back-link__arrow" aria-hidden="true">
          ←
        </span>
        {t('teams.team.allTeams')}
      </Link>
      {team.isPending ? (
        <TeamPageSkeleton />
      ) : team.data ? (
        <TeamView team={team.data.team} me={user} />
      ) : (
        <BlueCard>
          <BlueEmptyState title={codeOf(team.error) === 'not_found' ? t('teams.team.notFound') : t('teams.team.loadFailed')}>
            {codeOf(team.error) === 'not_found' ? t('teams.team.notFoundBody') : errorLabel(codeOf(team.error) ?? '')}
          </BlueEmptyState>
        </BlueCard>
      )}
    </AppLayout>
  );
}

function TeamView({ team, me }: { team: TeamDetail; me: Me }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState<ReactNode>(null);
  const update = useUpdateTeam(team.id);
  const setLeader = useSetLeader(team.id);
  const removeMember = useRemoveMember(team.id);
  const deleteTeam = useDeleteTeam(team.id);
  const restore = useRestoreTeam();

  const isLeader = team.myRole === 'leader';
  const archived = team.archivedAt !== null;

  function open(next: Exclude<Dialog, null>) {
    for (const m of [update, setLeader, removeMember, deleteTeam]) m.reset();
    setNotice(null);
    setDialog(next);
  }
  const close = () => setDialog(null);
  // The open tab lives in the address (?tab=members), so reload and Back keep it. Meetings is the default. Projects
  // are on each period's page (owner, 2026-11-24); an old ?tab=projects link opens Meetings.
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'members' ? 'members' : 'meetings';
  const tabsId = `team-${team.id}`;

  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div className="team-head">
          <TeamMonogram name={team.name} mine={isLeader} size="lg" />
          <div className="team-head__text">
            <h1 className="page-head__title">{team.name}</h1>
            <span className="team-head__meta muted small">
              {t('teams.memberCount', { count: team.memberCount })}
              {isLeader ? <BlueBadge variant="info">{t('teams.team.youLead')}</BlueBadge> : null}
            </span>
          </div>
        </div>
        {isLeader && !archived ? (
          <BlueButton variant="secondary" onClick={() => open({ kind: 'edit' })}>
            {t('teams.team.edit')}
          </BlueButton>
        ) : null}
      </div>

      {team.description ? <p className="muted">{team.description}</p> : null}

      {archived ? (
        <BlueAlert variant="warning" title={t('teams.team.deletedTitle')}>
          {t('teams.team.deletedBody', { date: formatDate(team.purgeAt), count: daysUntil(team.purgeAt ?? '') })}{' '}
          <BlueButton
            variant="secondary"
            size="sm"
            loading={restore.isPending}
            // Notices are <Trans> elements, so a notice on screen follows a language switch.
            onClick={() => restore.mutate(team.id, { onSuccess: () => setNotice(<Trans i18nKey="teams.team.restored" />) })}
          >
            {t('teams.team.restore')}
          </BlueButton>
        </BlueAlert>
      ) : null}
      {codeOf(restore.error) ? <BlueAlert variant="error">{errorLabel(codeOf(restore.error) ?? '')}</BlueAlert> : null}
      {notice ? (
        <BlueAlert variant="success" onDismiss={() => setNotice(null)}>
          {notice}
        </BlueAlert>
      ) : null}

      <BlueTabs
        label={t('teams.team.sections')}
        idPrefix={tabsId}
        value={tab}
        onChange={(next) => setParams(next === 'meetings' ? {} : { tab: next }, { replace: true })}
        tabs={[
          { id: 'meetings', label: t('teams.team.meetings') },
          { id: 'members', label: t('teams.team.members', { number: team.memberCount }) },
        ]}
      />

      {tab === 'meetings' ? (
        <div {...tabPanelProps(tabsId, 'meetings')}>
          <TeamMeetingsPanel team={team} />
        </div>
      ) : (
        <div {...tabPanelProps(tabsId, 'members')} className="stack">
          <BlueCard
            header={
              <header className="blue-card__header row card-head">
                <span>{t('teams.team.members', { number: team.memberCount })}</span>
                {isLeader && !archived ? (
                  <BlueButton variant="primary" size="sm" onClick={() => open({ kind: 'add' })}>
                    {t('teams.team.addPeople')}
                  </BlueButton>
                ) : null}
              </header>
            }
          >
            <div className="stack">
              <MembersTable
                team={team}
                meId={me.id}
                onMakeLeader={(member) => open({ kind: 'leader', member })}
                onRemove={(member) => open({ kind: 'remove', member })}
              />
              {!isLeader ? (
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="muted small">
                    {team.leader ? (
                      <Trans i18nKey="teams.team.ledBy" components={{ name: <EntityName>{team.leader.name}</EntityName> }} />
                    ) : (
                      t('teams.team.ledByNobody')
                    )}
                  </span>
                  <BlueButton variant="ghost" size="sm" className="text-danger" onClick={() => open({ kind: 'leave' })}>
                    {t('teams.team.leave')}
                  </BlueButton>
                </div>
              ) : !archived ? (
                <p className="muted small">{t('teams.team.leaderHint')}</p>
              ) : null}
            </div>
          </BlueCard>

          {isLeader && !archived ? (
            <BlueCard title={t('teams.team.deleteTitle')} className="danger-zone">
              <div className="danger-zone__row">
                <p className="muted">{t('teams.team.deleteBody')}</p>
                <BlueButton variant="danger" onClick={() => open({ kind: 'delete' })}>
                  {t('teams.team.deleteButton')}
                </BlueButton>
              </div>
            </BlueCard>
          ) : null}
        </div>
      )}

      <TeamFormDialog
        open={dialog?.kind === 'edit'}
        title={t('teams.team.editTitle')}
        submitLabel={t('teams.team.save')}
        initial={{ name: team.name, description: team.description }}
        busy={update.isPending}
        error={update.error}
        onClose={close}
        onSubmit={(values) => update.mutate(values, { onSuccess: () => { close(); setNotice(<Trans i18nKey="teams.team.saved" />); } })}
      />

      <AddMemberDialog open={dialog?.kind === 'add'} team={team} onClose={close} />

      <ConfirmDialog
        open={dialog?.kind === 'leader'}
        title={
          dialog?.kind === 'leader' ? (
            <Trans i18nKey="teams.team.leaderTitle" components={{ name: <EntityName>{dialog.member.name}</EntityName> }} />
          ) : (
            ''
          )
        }
        confirmLabel={t('teams.team.leaderConfirm')}
        busy={setLeader.isPending}
        error={codeOf(setLeader.error) ? errorLabel(codeOf(setLeader.error) ?? '') : null}
        onCancel={close}
        onConfirm={() => {
          if (dialog?.kind !== 'leader') return;
          const { member } = dialog;
          setLeader.mutate(member.userId, {
            onSuccess: () => {
              close();
              setNotice(
                <Trans
                  i18nKey="teams.team.leaderDone"
                  components={{ member: <EntityName>{member.name}</EntityName>, team: <EntityName>{team.name}</EntityName> }}
                />,
              );
            },
          });
        }}
      >
        {/* Only seen while the dialog is open, which is when a member is picked. */}
        {dialog?.kind === 'leader' ? (
          <Trans i18nKey="teams.team.leaderBody" components={{ name: <EntityName>{dialog.member.name}</EntityName> }} />
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog?.kind === 'remove'}
        title={
          dialog?.kind === 'remove' ? (
            <Trans i18nKey="teams.team.removeTitle" components={{ name: <EntityName>{dialog.member.name}</EntityName> }} />
          ) : (
            ''
          )
        }
        confirmLabel={t('teams.team.removeConfirm')}
        danger
        busy={removeMember.isPending}
        error={codeOf(removeMember.error) ? errorLabel(codeOf(removeMember.error) ?? '') : null}
        onCancel={close}
        onConfirm={() => {
          if (dialog?.kind !== 'remove') return;
          const { member } = dialog;
          removeMember.mutate(member.userId, {
            onSuccess: () => {
              close();
              setNotice(<Trans i18nKey="teams.team.removeDone" components={{ name: <EntityName>{member.name}</EntityName> }} />);
            },
          });
        }}
      >
        {t('teams.team.removeBody')}
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog?.kind === 'leave'}
        title={<Trans i18nKey="teams.team.leaveTitle" components={{ name: <EntityName>{team.name}</EntityName> }} />}
        confirmLabel={t('teams.team.leaveConfirm')}
        danger
        busy={removeMember.isPending}
        error={codeOf(removeMember.error) ? errorLabel(codeOf(removeMember.error) ?? '') : null}
        onCancel={close}
        onConfirm={() => removeMember.mutate(me.id, { onSuccess: () => void navigate('/teams') })}
      >
        {team.leader ? (
          <Trans i18nKey="teams.team.leaveBody" components={{ name: <EntityName>{team.leader.name}</EntityName> }} />
        ) : (
          t('teams.team.leaveBodyNoLeader')
        )}
      </ConfirmDialog>

      <DeleteTeamDialog
        open={dialog?.kind === 'delete'}
        team={team}
        busy={deleteTeam.isPending}
        error={deleteTeam.error}
        onClose={close}
        onConfirm={(confirmName) => deleteTeam.mutate(confirmName, { onSuccess: () => void navigate('/teams') })}
      />
    </div>
  );
}
