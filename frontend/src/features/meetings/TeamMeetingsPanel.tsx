import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { MeetingSeriesView, TeamDetail } from '@weekly-meeting/shared';
import { BlueAlert, BlueBadge, BlueButton, BlueCard, BlueEmptyState, BlueSkeleton } from '../../components/blue';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EntityName } from '../../components/EntityName';
import { CalendarIcon } from '../../components/icons';
import { ApiFailure } from '../../services/api';
import { describeDays, formatDay, relativeDay, todayWib } from '../../utils/dates';
import { errorLabel } from '../../utils/errorLabels';
import { PeriodStrip } from '../periods/PeriodStrip';
import { SeriesFormDialog } from './SeriesFormDialog';
import { TeamNextMeetings } from './TeamNextMeetings';
import { useCreateSeries, useDeleteSeries, useSeries, useUpdateSeries } from './useMeetings';
import './meetings.css';

type Dialog =
  | { kind: 'create' }
  | { kind: 'edit'; series: MeetingSeriesView }
  | { kind: 'stop'; series: MeetingSeriesView }
  | { kind: 'delete'; series: MeetingSeriesView }
  | null;

const codeOf = (error: unknown) => (error instanceof ApiFailure ? error.code : error ? 'unknown_error' : null);

/**
 * The team page's Meetings tab: its next 3 meetings (owner, 2026-11-25: a way straight to the next one), the team's
 * quarters, and its schedules (the leader sets them up). Every meeting is on its quarter's page (owner, 2026-11-24:
 * no Upcoming/Past list here).
 */
export function TeamMeetingsPanel({ team }: { team: TeamDetail }) {
  const { t } = useTranslation();
  const series = useSeries(team.id);
  const create = useCreateSeries(team.id);
  const update = useUpdateSeries();
  const remove = useDeleteSeries();
  const [dialog, setDialog] = useState<Dialog>(null);
  const today = todayWib();

  const canManage = team.myRole === 'leader' && team.archivedAt === null;
  const list = series.data?.series ?? [];
  const leaderName = team.leader?.name;

  function open(next: Exclude<Dialog, null>) {
    for (const m of [create, update, remove]) m.reset();
    setDialog(next);
  }
  const close = () => {
    setDialog(null);
    for (const m of [create, update, remove]) m.reset();
  };
  // Restart has no dialog: its error shows above the list.
  const restartError = !dialog ? codeOf(update.error) : null;

  return (
    <div className="stack">
      {/* The next meetings and the team's quarters, once it has a schedule (before that there is nothing in them): side
          by side on a wide screen (owner, 2026-11-25: the quarters in view without scrolling), stacked on a narrow one. */}
      {list.length > 0 ? (
        <div className="team-overview">
          <TeamNextMeetings team={team} />
          <PeriodStrip team={team} />
        </div>
      ) : null}
      <BlueCard
        header={
          <header className="blue-card__header row card-head">
            <span>{t('meetings.schedules.title')}</span>
            {canManage && list.length > 0 ? (
              <BlueButton variant="secondary" size="sm" onClick={() => open({ kind: 'create' })}>
                {t('meetings.schedules.add')}
              </BlueButton>
            ) : null}
          </header>
        }
      >
        {series.isPending ? (
          <div className="series-list" aria-hidden="true">
            <div className="series-row">
              <BlueSkeleton width={44} height={44} />
              <span className="series-row__text">
                <BlueSkeleton width="35%" height={16} />
                <BlueSkeleton width="55%" height={12} />
              </span>
            </div>
          </div>
        ) : series.isError ? (
          <BlueAlert variant="error">{errorLabel(codeOf(series.error) ?? '')}</BlueAlert>
        ) : list.length === 0 ? (
          <BlueEmptyState
            icon={<CalendarIcon size={26} />}
            title={canManage ? t('meetings.schedules.setUpTitle') : t('meetings.schedules.noneTitle')}
            action={
              canManage ? (
                <BlueButton variant="primary" onClick={() => open({ kind: 'create' })}>
                  {t('meetings.schedules.setUp')}
                </BlueButton>
              ) : undefined
            }
          >
            {canManage ? (
              t('meetings.schedules.setUpBody')
            ) : leaderName ? (
              <Trans i18nKey="meetings.schedules.leaderNamedSets" components={{ name: <EntityName>{leaderName}</EntityName> }} />
            ) : (
              t('meetings.schedules.leaderSets')
            )}
          </BlueEmptyState>
        ) : (
          <div className="stack">
            {restartError ? <BlueAlert variant="error">{errorLabel(restartError)}</BlueAlert> : null}
            <ul className="series-list">
              {list.map((s) => (
                <li key={s.id} className={`series-row${s.active ? '' : ' series-row--stopped'}`}>
                  <span className={`tile__icon${s.active ? '' : ' tile__icon--muted'}`} aria-hidden="true">
                    <CalendarIcon />
                  </span>
                  <span className="series-row__text">
                    <span className="series-row__name">
                      {s.name}
                      {s.active ? null : <BlueBadge>{t('meetings.schedules.stopped')}</BlueBadge>}
                    </span>
                    <span className="muted small">
                      {describeDays(s.daysOfWeek)}
                      {' · '}
                      {s.nextMeetingDate
                        ? t('meetings.schedules.next', {
                            when:
                              s.nextMeetingDate === today
                                ? t('meetings.schedules.nextToday')
                                : `${formatDay(s.nextMeetingDate)} (${relativeDay(s.nextMeetingDate, today).toLowerCase()})`,
                          })
                        : s.active
                          ? t('meetings.schedules.noUpcoming')
                          : t('meetings.schedules.noNew')}
                    </span>
                  </span>
                  {canManage ? (
                    <span className="series-row__actions">
                      {s.active ? null : (
                        <BlueButton
                          variant="secondary"
                          size="sm"
                          loading={update.isPending && update.variables?.id === s.id}
                          onClick={() => {
                            update.reset();
                            update.mutate({ id: s.id, body: { active: true } });
                          }}
                        >
                          {t('meetings.schedules.restart')}
                        </BlueButton>
                      )}
                      <BlueButton variant="ghost" size="sm" onClick={() => open({ kind: 'edit', series: s })}>
                        {t('meetings.schedules.edit')}
                      </BlueButton>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        )}
      </BlueCard>

      <SeriesFormDialog
        open={dialog?.kind === 'create'}
        defaultName={list.length === 0 ? t('meetings.schedules.defaultName') : ''}
        busy={create.isPending}
        error={create.error}
        onClose={close}
        onSubmit={(body) => create.mutate(body, { onSuccess: close })}
      />
      <SeriesFormDialog
        open={dialog?.kind === 'edit'}
        series={dialog?.kind === 'edit' ? dialog.series : undefined}
        busy={update.isPending}
        error={update.error}
        onClose={close}
        onSubmit={(values) => {
          if (dialog?.kind !== 'edit') return;
          const before = dialog.series;
          const body = {
            ...(values.name !== before.name ? { name: values.name } : {}),
            ...(values.daysOfWeek.join() !== before.daysOfWeek.join() ? { daysOfWeek: values.daysOfWeek } : {}),
          };
          if (Object.keys(body).length === 0) return close();
          update.mutate({ id: before.id, body }, { onSuccess: close });
        }}
        onStop={dialog?.kind === 'edit' && dialog.series.active ? () => open({ kind: 'stop', series: dialog.series }) : undefined}
        onDelete={dialog?.kind === 'edit' ? () => open({ kind: 'delete', series: dialog.series }) : undefined}
      />

      <ConfirmDialog
        open={dialog?.kind === 'stop'}
        title={
          dialog?.kind === 'stop' ? (
            <Trans i18nKey="meetings.schedules.stopTitle" components={{ name: <EntityName>{dialog.series.name}</EntityName> }} />
          ) : (
            ''
          )
        }
        confirmLabel={t('meetings.schedules.stopConfirm')}
        cancelLabel={t('meetings.cancel')}
        danger
        busy={update.isPending}
        error={codeOf(update.error) ? errorLabel(codeOf(update.error) ?? '') : null}
        onCancel={close}
        onConfirm={() => dialog?.kind === 'stop' && update.mutate({ id: dialog.series.id, body: { active: false } }, { onSuccess: close })}
      >
        {t('meetings.schedules.stopBody')}
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog?.kind === 'delete'}
        title={
          dialog?.kind === 'delete' ? (
            <Trans i18nKey="meetings.schedules.deleteTitle" components={{ name: <EntityName>{dialog.series.name}</EntityName> }} />
          ) : (
            ''
          )
        }
        confirmLabel={t('meetings.schedules.deleteConfirm')}
        cancelLabel={t('meetings.cancel')}
        danger
        busy={remove.isPending}
        error={codeOf(remove.error) ? errorLabel(codeOf(remove.error) ?? '') : null}
        onCancel={close}
        onConfirm={() => dialog?.kind === 'delete' && remove.mutate(dialog.series.id, { onSuccess: close })}
      >
        {t('meetings.schedules.deleteBody')}
      </ConfirmDialog>
    </div>
  );
}
