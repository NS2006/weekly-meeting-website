import { useTranslation } from 'react-i18next';
import type { TeamDetail, TeamMemberView } from '@weekly-meeting/shared';
import { BlueAvatar, BlueBadge, BlueButton, BlueTable, type BlueTableColumn } from '../../components/blue';
import { formatDate } from '../../utils/dates';
import './teams.css';

/** Members, leader first. The leader gets "Make leader" and "Remove" on everyone else's row. */
export function MembersTable({
  team,
  meId,
  onMakeLeader,
  onRemove,
}: {
  team: TeamDetail;
  meId: string;
  onMakeLeader: (member: TeamMemberView) => void;
  onRemove: (member: TeamMemberView) => void;
}) {
  const { t } = useTranslation();
  const canManage = team.myRole === 'leader' && !team.archivedAt;

  const columns: BlueTableColumn<TeamMemberView>[] = [
    {
      key: 'member',
      header: t('teams.members.member'),
      render: (m) => (
        <span className="member-cell">
          <BlueAvatar name={m.name} size="sm" />
          <span className="member-cell__who">
            <span className="member-cell__name">
              {m.name}
              {m.userId === meId ? <BlueBadge variant="info">{t('teams.members.you')}</BlueBadge> : null}
              {m.status === 'inactive' ? <BlueBadge variant="warning">{t('teams.members.inactive')}</BlueBadge> : null}
            </span>
            <span className="muted small">{m.email}</span>
          </span>
        </span>
      ),
    },
    {
      key: 'role',
      header: t('teams.members.role'),
      render: (m) =>
        m.role === 'leader' ? (
          <BlueBadge variant="info">{t('teams.members.leader')}</BlueBadge>
        ) : (
          <span className="muted">{t('teams.members.memberRole')}</span>
        ),
    },
    { key: 'added', header: t('teams.members.added'), render: (m) => <span className="nowrap muted">{formatDate(m.addedAt)}</span> },
  ];

  if (canManage) {
    columns.push({
      key: 'actions',
      header: '',
      render: (m) =>
        m.userId === meId ? null : (
          <span className="member-actions">
            <BlueButton
              variant="ghost"
              size="sm"
              disabled={m.status !== 'active'}
              title={m.status !== 'active' ? t('teams.members.onlyActiveLead') : undefined}
              onClick={() => onMakeLeader(m)}
            >
              {t('teams.members.makeLeader')}
            </BlueButton>
            <BlueButton variant="ghost" size="sm" className="text-danger" onClick={() => onRemove(m)}>
              {t('teams.members.remove')}
            </BlueButton>
          </span>
        ),
    });
  }

  return <BlueTable caption={t('teams.members.caption')} columns={columns} data={team.members} rowKey={(m) => m.userId} />;
}
