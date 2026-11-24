import { useEffect, useState, type ReactNode } from 'react';
import type { MeetingDetail } from '@weekly-meeting/shared';
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { BlueAlert, BlueButton, BlueInput, BlueModal } from '../../components/blue';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EntityName } from '../../components/EntityName';
import { ApiFailure } from '../../services/api';
import { addDays, formatDay, formatFullDay, relativeDay, todayWib } from '../../utils/dates';
import { errorLabel } from '../../utils/errorLabels';
import { periodPath } from '../periods/split';
import { MeetingBoard } from './MeetingBoard';
import { DateTile, MeetingStatusBadge, movedFrom } from './MeetingParts';
import { cancelReason, meetingName } from './meetingName';
import { useUpdateMeeting } from './useMeetings';
import './meetings.css';

type Dialog = 'move' | 'cancel' | null;

const codeOf = (error: unknown) => (error instanceof ApiFailure ? error.code : error ? 'unknown_error' : null);

/**
 * One meeting: when, which team, and its board of notes; the leader can move or cancel it. It is called by its
 * schedule's name (owner, 2026-11-24: no separate titles); a reason given when cancelling shows with the cancellation.
 */
export function MeetingDetailView({ meeting }: { meeting: MeetingDetail }) {
  const { t } = useTranslation();
  const update = useUpdateMeeting(meeting.id);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState<ReactNode>(null);
  const today = todayWib();

  const canManage = meeting.myRole === 'leader' && !meeting.teamArchived;
  const upcoming = meeting.date >= today;
  const cancelled = meeting.status === 'cancelled';
  const moved = movedFrom(meeting);
  const reason = cancelReason(meeting);

  function open(next: Exclude<Dialog, null>) {
    update.reset();
    setNotice(null);
    setDialog(next);
  }
  const close = () => setDialog(null);
  const outsideError = !dialog ? codeOf(update.error) : null;

  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div className="meeting-head">
          <DateTile date={meeting.date} today={today} size="lg" />
          <div className="meeting-head__text">
            <h1 className="page-head__title">{meetingName(meeting)}</h1>
            <span className="meeting-head__meta muted">
              {formatFullDay(meeting.date)}
              <MeetingStatusBadge meeting={meeting} today={today} />
            </span>
            {/* Team and schedule in one line, so the board (what people come here for) starts high on the page. */}
            <span className="meeting-head__meta muted">
              <Link to={`/teams/${meeting.teamId}`}>{meeting.teamName}</Link>
              <span aria-hidden="true">·</span>
              {/* The quarter (or other period) the meeting belongs to: opens its page with the rest of its meetings. */}
              <Link
                to={periodPath(meeting.teamId, meeting.period.key)}
                className={`period-chip period-chip--${meeting.period.status}`}
                aria-label={t(meeting.period.status === 'ended' ? 'meetings.detail.periodEnded' : 'meetings.detail.period', {
                  period: meeting.period.label,
                })}
                title={t('meetings.detail.periodTitle', { period: meeting.period.label })}
              >
                {meeting.period.label}
                {meeting.period.status === 'ended' ? <span className="period-chip__state"> · {t('meetings.detail.ended')}</span> : null}
              </Link>
              {meeting.seriesActive ? null : (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{t('meetings.detail.stopped')}</span>
                </>
              )}
              {moved ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{moved}</span>
                </>
              ) : null}
            </span>
          </div>
        </div>
        {canManage ? (
          <div className="row meeting-head__actions">
            {upcoming && !cancelled ? (
              <>
                <BlueButton variant="secondary" onClick={() => open('move')}>
                  {t('meetings.detail.move')}
                </BlueButton>
                <BlueButton variant="ghost" className="text-danger" onClick={() => open('cancel')}>
                  {t('meetings.detail.cancelMeeting')}
                </BlueButton>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {cancelled ? (
        <BlueAlert variant="warning" title={t('meetings.detail.cancelledTitle')}>
          <span className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <span>
              {reason ? (
                <>
                  <Trans i18nKey="meetings.detail.reason" components={{ reason: <EntityName>{reason}</EntityName> }} />{' '}
                </>
              ) : null}
              {canManage && upcoming ? t('meetings.detail.canReopen') : t('meetings.detail.wontHappen')}
            </span>
            {canManage && upcoming ? (
              <BlueButton
                variant="secondary"
                size="sm"
                loading={update.isPending}
                onClick={() => {
                  update.reset();
                  // Back on: the cancel reason (kept in the meeting's title) goes with the cancellation.
                  update.mutate({ status: 'scheduled', title: null }, { onSuccess: () => setNotice(t('meetings.detail.reopened')) });
                }}
              >
                {t('meetings.detail.reopen')}
              </BlueButton>
            ) : null}
          </span>
        </BlueAlert>
      ) : null}
      {outsideError ? <BlueAlert variant="error">{errorLabel(outsideError)}</BlueAlert> : null}
      {notice ? (
        <BlueAlert variant="success" onDismiss={() => setNotice(null)}>
          {notice}
        </BlueAlert>
      ) : null}

      <MeetingBoard meeting={meeting} />

      <MoveDialog
        open={dialog === 'move'}
        meeting={meeting}
        today={today}
        busy={update.isPending}
        error={update.error}
        onClose={close}
        onMove={(date) =>
          update.mutate(
            { date },
            {
              onSuccess: () => {
                close();
                setNotice(<Trans i18nKey="meetings.detail.moved" components={{ day: <EntityName>{formatFullDay(date)}</EntityName> }} />);
              },
            },
          )
        }
      />
      <CancelDialog
        open={dialog === 'cancel'}
        meeting={meeting}
        busy={update.isPending}
        error={update.error}
        onClose={close}
        onConfirm={(reason) =>
          update.mutate(reason ? { status: 'cancelled', title: reason } : { status: 'cancelled' }, {
            onSuccess: close,
          })
        }
      />
    </div>
  );
}

function MoveDialog({
  open,
  meeting,
  today,
  busy,
  error,
  onClose,
  onMove,
}: {
  open: boolean;
  meeting: MeetingDetail;
  today: string;
  busy: boolean;
  error: unknown;
  onClose: () => void;
  onMove: (date: string) => void;
}) {
  const { t } = useTranslation();
  const [date, setDate] = useState('');
  useEffect(() => {
    if (open) setDate('');
  }, [open]);
  const last = addDays(today, 365);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= today && date <= last && date !== meeting.date;
  const code = codeOf(error);

  return (
    <BlueModal
      open={open}
      size="sm"
      title={t('meetings.move.title')}
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <BlueButton variant="ghost" disabled={busy} onClick={onClose}>
            {t('meetings.cancel')}
          </BlueButton>
          <BlueButton variant="primary" loading={busy} disabled={!valid} onClick={() => onMove(date)}>
            {t('meetings.move.submit')}
          </BlueButton>
        </>
      }
    >
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid && !busy) onMove(date);
        }}
      >
        <p>
          <Trans
            i18nKey="meetings.move.now"
            components={{
              day: <EntityName>{formatFullDay(meeting.date)}</EntityName>,
              schedule: <EntityName>{meeting.seriesName}</EntityName>,
            }}
          />
        </p>
        {code ? (
          <BlueAlert variant="error">{errorLabel(code, { validation_failed: t('meetings.move.invalid') })}</BlueAlert>
        ) : null}
        <BlueInput
          label={t('meetings.move.newDay')}
          type="date"
          min={today}
          max={last}
          value={date}
          onChange={(event) => setDate(event.target.value)}
          helperText={
            valid
              ? `${formatFullDay(date)} · ${relativeDay(date, today).toLowerCase()}`
              : date === meeting.date
                ? t('meetings.move.sameDay')
                : t('meetings.move.range')
          }
        />
      </form>
    </BlueModal>
  );
}

function CancelDialog({
  open,
  meeting,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  meeting: MeetingDetail;
  busy: boolean;
  error: unknown;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (open) setReason('');
  }, [open]);
  const code = codeOf(error);

  return (
    <ConfirmDialog
      open={open}
      title={<Trans i18nKey="meetings.cancelDialog.title" components={{ day: <EntityName>{formatDay(meeting.date)}</EntityName> }} />}
      confirmLabel={t('meetings.cancelDialog.confirm')}
      cancelLabel={t('meetings.cancelDialog.keep')}
      danger
      busy={busy}
      error={code ? errorLabel(code) : null}
      onCancel={onClose}
      onConfirm={() => onConfirm(reason.trim())}
    >
      <div className="stack">
        <p>{t('meetings.cancelDialog.body')}</p>
        <BlueInput
          label={t('meetings.cancelDialog.reason')}
          maxLength={120}
          placeholder={t('meetings.cancelDialog.reasonPlaceholder')}
          helperText={t('meetings.cancelDialog.reasonHelp')}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>
    </ConfirmDialog>
  );
}
