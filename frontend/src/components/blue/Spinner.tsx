import { useTranslation } from 'react-i18next';

// BLUE3 BSpinner → BlueSpinner (no plugin template yet). `label` is read out; "Loading" when not given.
export function BlueSpinner({ size = 'md', label }: { size?: 'sm' | 'md' | 'lg'; label?: string }) {
  const { t } = useTranslation();
  return (
    <span className={`blue-spinner blue-spinner--${size}`} role="status">
      <span className="visually-hidden">{label ?? t('ui.spinner.loading')}</span>
    </span>
  );
}
