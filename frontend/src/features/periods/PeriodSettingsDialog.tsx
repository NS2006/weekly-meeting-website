import { useId, useState, type CSSProperties } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import type { PeriodsPerYear, YearSplit } from '@weekly-meeting/shared';
import { BlueAlert, BlueButton, BlueModal, BlueSelect } from '../../components/blue';
import { ApiFailure } from '../../services/api';
import { todayWib } from '../../utils/dates';
import { errorLabel } from '../../utils/errorLabels';
import { useUpdateTeam } from '../teams/useTeams';
import { capitalize, monthName, periodNoun, splitChoices, yearPreview, type PreviewPeriod } from './split';

const PREVIEW_COLUMNS: Record<PeriodsPerYear, number> = { 1: 1, 2: 2, 3: 3, 4: 4, 6: 3, 12: 4 };

/** "This year: 4 quarters, from Q1 2026 (Jan – Mar 2026) to Q4 2026; now Q4 2026." */
function previewSummary(preview: PreviewPeriod[], perYear: PeriodsPerYear, t: TFunction): string {
  const first = preview[0];
  const last = preview[preview.length - 1];
  const now = preview.find((p) => p.current);
  if (!first || !last) return '';
  if (preview.length === 1) {
    return t('periods.settings.previewOne', { total: 1, noun: periodNoun(perYear), label: first.label, months: first.months });
  }
  const values = { total: preview.length, nouns: periodNoun(perYear, true), first: first.label, months: first.months, last: last.label };
  return now ? t('periods.settings.previewManyNow', { ...values, now: now.label }) : t('periods.settings.previewMany', values);
}

/**
 * The team leader's choice of how the team's year is split (4 quarters from January unless changed), with a preview
 * of this year under the choice before it is saved. Mounted only while open, so each opening starts from the saved
 * split. Nothing is moved: the meetings and notes are only grouped differently.
 */
export function PeriodSettingsDialog({ teamId, split, onClose }: { teamId: string; split: YearSplit; onClose: () => void }) {
  const { t } = useTranslation();
  const update = useUpdateTeam(teamId);
  const [perYear, setPerYear] = useState<PeriodsPerYear>(split.periodsPerYear);
  const [startMonth, setStartMonth] = useState(split.yearStartMonth);
  const name = useId();
  const formId = useId();

  const preview = yearPreview({ periodsPerYear: perYear, yearStartMonth: startMonth }, todayWib());
  const code = update.error instanceof ApiFailure ? update.error.code : update.error ? 'unknown_error' : null;

  function save() {
    const body = {
      ...(perYear !== split.periodsPerYear ? { periodsPerYear: perYear } : {}),
      ...(startMonth !== split.yearStartMonth ? { yearStartMonth: startMonth } : {}),
    };
    if (Object.keys(body).length === 0) return onClose();
    update.mutate(body, { onSuccess: onClose });
  }

  return (
    <BlueModal
      open
      onClose={onClose}
      title={t('periods.settings.title')}
      footer={
        <>
          <BlueButton variant="secondary" onClick={onClose}>
            {t('periods.settings.cancel')}
          </BlueButton>
          <BlueButton variant="primary" type="submit" form={formId} loading={update.isPending}>
            {t('periods.settings.save')}
          </BlueButton>
        </>
      }
    >
      <form
        id={formId}
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <p className="muted">{t('periods.settings.intro')}</p>

        <fieldset className="split-options">
          <legend className="blue-input__label">{t('periods.settings.splitInto')}</legend>
          <div className="split-options__grid">
            {splitChoices().map((option) => (
              <label key={option.value} className={`split-option${option.value === perYear ? ' split-option--selected' : ''}`}>
                <input
                  type="radio"
                  name={name}
                  className="split-option__input"
                  value={option.value}
                  checked={option.value === perYear}
                  onChange={() => setPerYear(option.value)}
                />
                <span className="split-option__title">
                  {option.title}
                  {option.value === 4 ? <span className="split-option__default">{t('periods.settings.defaultBadge')}</span> : null}
                </span>
                <span className="split-option__detail">{option.detail}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <BlueSelect
            label={t('periods.settings.startsIn')}
            value={String(startMonth)}
            onChange={(month) => setStartMonth(Number(month))}
            options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: monthName(i + 1) }))}
          />
          <p className="muted small split-help">{t('periods.settings.startsHelp')}</p>
        </div>

        <div className="split-preview">
          <p className="split-preview__title">
            {/* Capitalized: in Indonesian the noun comes first ("Kuartal tahun ini"). */}
            {perYear === 1 ? t('periods.settings.thisYear') : capitalize(t('periods.settings.thisYearsPeriods', { nouns: periodNoun(perYear, true) }))}
          </p>
          {/* Screen readers hear one line when the choice changes, not the whole list again. */}
          <p className="visually-hidden" aria-live="polite">
            {previewSummary(preview, perYear, t)}
          </p>
          <ol className="split-preview__list" style={{ '--preview-columns': PREVIEW_COLUMNS[perYear] } as CSSProperties}>
            {preview.map((p) => (
              <li key={p.key} className={`split-preview__item${p.current ? ' split-preview__item--now' : ''}`}>
                <span className="split-preview__label">{p.label}</span>
                {/* A month's name already says its months (its label is the server's, in English: "Aug 2026"). */}
                {perYear !== 12 ? <span className="split-preview__months">{p.months}</span> : null}
                {p.current ? <span className="split-preview__now">{t('periods.settings.now')}</span> : null}
              </li>
            ))}
          </ol>
        </div>

        <BlueAlert variant="info">{t('periods.settings.nothingMoved')}</BlueAlert>
        {code ? <BlueAlert variant="error">{errorLabel(code)}</BlueAlert> : null}
      </form>
    </BlueModal>
  );
}
