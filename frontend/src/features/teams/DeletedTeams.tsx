import type { TeamSummary } from '@weekly-meeting/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { BlueAlert, BlueCard } from '../../components/blue';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EntityName } from '../../components/EntityName';
import { ApiFailure } from '../../services/api';
import { daysUntil, formatDate } from '../../utils/dates';
import { errorLabel } from '../../utils/errorLabels';
import { pickedIn, pickState, toggleAll, toggleId } from '../../utils/selection';
import { useDeletedTeamsAction, type DeletedTeamsAction } from './useTeams';

const codeOf = (error: unknown) => (error instanceof ApiFailure ? error.code : error ? 'unknown_error' : null);

const Icon = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
const RestoreIcon = () => (
  <Icon>
    <path d="M4 9a6 6 0 1 1 1.8 4.3M4 4.5V9h4.5" />
  </Icon>
);
const DeleteIcon = () => (
  <Icon>
    <path d="M3.5 5.5h13M8 5.5V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M5 5.5l.8 10.1a1.5 1.5 0 0 0 1.5 1.4h5.4a1.5 1.5 0 0 0 1.5-1.4L15 5.5" />
  </Icon>
);

/** What the last action did, for the notice: how many, and the name when it was one team. */
type Done = { action: DeletedTeamsAction; count: number; name: string | null };

/**
 * The deleted teams I lead and can still restore (30 days), as OneDrive's recycle bin (owner, 2026-11-25): a box on
 * each row (the whole row ticks it) and one over the list, and once teams are picked a bar to Restore them or Delete
 * them for good (after a confirmation; the 30 days are then over at once). Escape lets go of them.
 */
export function DeletedTeams({ teams }: { teams: TeamSummary[] }) {
  const { t } = useTranslation();
  const act = useDeletedTeamsAction();
  const [picked, setPicked] = useState<string[]>([]);
  const [confirming, setConfirming] = useState<TeamSummary[] | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const ids = teams.map((team) => team.id);
  const chosen = pickedIn(picked, teams);
  const state = pickState(picked, ids);
  const failed = codeOf(act.error);
  const key = ids.join(' ');

  // A team that left the list (restored, deleted, or from another tab) is let go.
  useEffect(() => setPicked((now) => now.filter((id) => key.split(' ').includes(id))), [key]);

  const run = (action: DeletedTeamsAction, list: TeamSummary[]) => {
    if (list.length === 0) return;
    setDone(null);
    let count = 0;
    act.mutate(
      {
        ids: list.map((team) => team.id),
        action,
        onEach: () => {
          count += 1;
        },
      },
      {
        onSuccess: () => {
          setPicked([]);
          setConfirming(null);
        },
        // A failure part-way: what was done is said, and the rest stays picked (its error shows).
        onSettled: () => {
          if (count > 0) setDone({ action, count, name: list.length === 1 ? (list[0]?.name ?? null) : null });
        },
      },
    );
  };

  const doneText = (d: Done) =>
    d.action === 'restore'
      ? d.name
        ? t('teams.deleted.restoredOne', { name: d.name })
        : t('teams.deleted.restoredMany', { count: d.count })
      : d.name
        ? t('teams.deleted.deletedOne', { name: d.name })
        : t('teams.deleted.deletedMany', { count: d.count });

  const only = confirming?.length === 1 ? confirming[0] : undefined;

  return (
    <BlueCard title={t('teams.list.deletedTitle')}>
      <div
        className="stack"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && picked.length > 0 && !confirming) setPicked([]);
        }}
      >
        <p className="muted">{t('teams.list.deletedLead')}</p>
        {done ? (
          <BlueAlert variant="success" onDismiss={() => setDone(null)}>
            {doneText(done)}
          </BlueAlert>
        ) : null}
        {failed && !confirming ? <BlueAlert variant="error">{errorLabel(failed)}</BlueAlert> : null}

        {chosen.length > 0 ? (
          <div className="select-bar" role="group" aria-label={t('teams.deleted.bar', { count: chosen.length })}>
            <button type="button" className="select-bar__item" disabled={act.isPending} onClick={() => run('restore', chosen)}>
              <RestoreIcon />
              {act.isPending && act.variables?.action === 'restore' ? t('teams.deleted.restoring') : t('teams.deleted.restore')}
            </button>
            <button
              type="button"
              className="select-bar__item select-bar__item--danger"
              disabled={act.isPending}
              onClick={() => {
                act.reset();
                setConfirming(chosen);
              }}
            >
              <DeleteIcon />
              {t('teams.deleted.deleteForGood')}
            </button>
            <button
              type="button"
              className="select-bar__clear"
              onClick={() => setPicked([])}
              title={t('teams.deleted.clear')}
              aria-label={t('teams.deleted.clearCount', { count: chosen.length })}
            >
              <span aria-hidden="true">×</span>
              {t('teams.deleted.count', { count: chosen.length })}
            </button>
          </div>
        ) : null}

        <div className="deleted-head">
          <label className="deleted-head__all">
            <input
              type="checkbox"
              className="deleted-box"
              checked={state === 'all'}
              ref={(box) => {
                if (box) box.indeterminate = state === 'some';
              }}
              onChange={() => setPicked((now) => toggleAll(now, ids))}
            />
            <span>{t('teams.deleted.all')}</span>
          </label>
          <span className="muted small">{t('teams.deleted.total', { count: teams.length })}</span>
        </div>

        <ul className="deleted-list">
          {teams.map((team) => {
            const on = picked.includes(team.id);
            return (
              <li key={team.id} className={on ? 'deleted-item deleted-item--picked' : 'deleted-item'}>
                {/* The whole row ticks the box. */}
                <label className="deleted-item__label">
                  <input type="checkbox" className="deleted-box" checked={on} onChange={() => setPicked((now) => toggleId(now, team.id))} />
                  <span className="deleted-item__text">
                    <strong>{team.name}</strong>
                    <span className="muted small">
                      {t('teams.list.deletedWhen', {
                        deleted: formatDate(team.archivedAt),
                        purge: formatDate(team.purgeAt),
                        count: team.purgeAt ? daysUntil(team.purgeAt) : 0,
                      })}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      <ConfirmDialog
        open={confirming !== null}
        danger
        title={
          only ? (
            <Trans i18nKey="teams.deleted.confirmTitleOne" components={{ name: <EntityName>{only.name}</EntityName> }} />
          ) : (
            t('teams.deleted.confirmTitleMany', { count: confirming?.length ?? 0 })
          )
        }
        confirmLabel={only ? t('teams.deleted.confirmOne') : t('teams.deleted.confirmMany', { count: confirming?.length ?? 0 })}
        busy={act.isPending}
        error={failed ? errorLabel(failed) : null}
        onConfirm={() => confirming && run('forever', confirming.filter((team) => ids.includes(team.id)))}
        onCancel={() => setConfirming(null)}
      >
        {t('teams.deleted.confirmBody')}
      </ConfirmDialog>
    </BlueCard>
  );
}
