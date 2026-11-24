import { useEffect, useId, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { IsoWeekday, MeetingSeriesView } from '@weekly-meeting/shared';
import { BlueAlert, BlueButton, BlueInput, BlueModal } from '../../components/blue';
import { EntityName } from '../../components/EntityName';
import { ApiFailure } from '../../services/api';
import { addDays, describeDays, formatDay, nextDates, todayWib, WEEKDAYS, weekdayName } from '../../utils/dates';
import { errorLabel } from '../../utils/errorLabels';
import './meetings.css';

const sameDays = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((d, i) => d === b[i]);

/**
 * Set up or edit a schedule: a name and the days of the week, with the next meetings previewed as you pick.
 * Editing also offers Stop and Delete (each confirmed by the caller).
 */
export function SeriesFormDialog({
  open,
  series,
  defaultName = '',
  busy,
  error,
  onClose,
  onSubmit,
  onStop,
  onDelete,
}: {
  open: boolean;
  /** Absent: a new schedule. */
  series?: MeetingSeriesView;
  defaultName?: string;
  busy: boolean;
  error: unknown;
  onClose: () => void;
  onSubmit: (values: { name: string; daysOfWeek: IsoWeekday[] }) => void;
  onStop?: () => void;
  onDelete?: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [days, setDays] = useState<IsoWeekday[]>([]);
  const daysLabelId = useId();
  const today = todayWib();

  useEffect(() => {
    if (open) {
      setName(series?.name ?? defaultName);
      setDays(series?.daysOfWeek ?? []);
    }
    // Keyed on `open`: start from the saved values each time the dialog opens.
  }, [open]);

  const code = error instanceof ApiFailure ? error.code : error ? 'unknown_error' : null;
  const valid = name.trim().length > 0 && days.length > 0;
  const changedDays = series ? !sameDays(series.daysOfWeek, days) : false;
  const upcoming = nextDates(days, today, 4);
  const tomorrow = addDays(today, 1);

  function toggle(day: IsoWeekday) {
    setDays((current) =>
      current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort((a, b) => a - b),
    );
  }

  return (
    <BlueModal
      open={open}
      title={
        series ? (
          <Trans i18nKey="meetings.series.edit" components={{ name: <EntityName>{series.name}</EntityName> }} />
        ) : (
          t('meetings.series.create')
        )
      }
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          {series && (onStop || onDelete) ? (
            <span className="modal-footer-start">
              {onStop ? (
                <BlueButton variant="ghost" disabled={busy} onClick={onStop}>
                  {t('meetings.series.stop')}
                </BlueButton>
              ) : null}
              {onDelete ? (
                <BlueButton variant="ghost" className="text-danger" disabled={busy} onClick={onDelete}>
                  {t('meetings.series.delete')}
                </BlueButton>
              ) : null}
            </span>
          ) : null}
          <BlueButton variant="ghost" disabled={busy} onClick={onClose}>
            {t('meetings.cancel')}
          </BlueButton>
          <BlueButton
            variant="primary"
            loading={busy}
            disabled={!valid}
            onClick={() => onSubmit({ name: name.trim(), daysOfWeek: days })}
          >
            {series ? t('meetings.series.save') : t('meetings.series.submitCreate')}
          </BlueButton>
        </>
      }
    >
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid && !busy) onSubmit({ name: name.trim(), daysOfWeek: days });
        }}
      >
        {code ? (
          <BlueAlert variant="error">{errorLabel(code, { validation_failed: t('meetings.series.invalid') })}</BlueAlert>
        ) : null}
        <BlueInput
          label={t('meetings.series.name')}
          maxLength={60}
          placeholder={t('meetings.series.namePlaceholder')}
          helperText={t('meetings.series.nameHelp')}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />

        <div className="blue-input">
          <span className="blue-input__label" id={daysLabelId}>
            {t('meetings.series.days')}
          </span>
          <div className="day-picker" role="group" aria-labelledby={daysLabelId}>
            {WEEKDAYS.map(({ day }) => {
              const on = days.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  className={`day-picker__day${on ? ' day-picker__day--on' : ''}`}
                  aria-pressed={on}
                  aria-label={weekdayName(day, 'long')}
                  onClick={() => toggle(day)}
                >
                  {weekdayName(day, 'short')}
                </button>
              );
            })}
          </div>
        </div>

        <div className="schedule-preview" aria-live="polite">
          {days.length === 0 ? (
            <span className="muted">{t('meetings.series.pickDays')}</span>
          ) : (
            <>
              <strong>{describeDays(days)}</strong>
              <span className="schedule-preview__label muted small">{t('meetings.series.nextMeetings')}</span>
              <ul className="schedule-preview__dates">
                {upcoming.map((date) => (
                  <li key={date} className={date === today ? 'schedule-preview__date--today' : undefined}>
                    {date === today ? t('meetings.status.today') : formatDay(date)}
                    {date === tomorrow ? ` ${t('meetings.series.tomorrow')}` : ''}
                  </li>
                ))}
              </ul>
              <span className="muted small">{t('meetings.series.share')}</span>
            </>
          )}
        </div>

        {changedDays ? <BlueAlert variant="info">{t('meetings.series.daysChanged')}</BlueAlert> : null}
      </form>
    </BlueModal>
  );
}
