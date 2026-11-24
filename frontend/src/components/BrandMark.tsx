import { useTranslation } from 'react-i18next';
import './BrandMark.css';

/** Product mark and name. `tagline` adds the one-line description under the name. */
export function BrandMark({ tagline = false }: { tagline?: boolean }) {
  const { t } = useTranslation();
  return (
    <span className="brand">
      <span className="brand__mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="17" rx="2" />
          <path d="M8 2v4M16 2v4M3 9h18M8 13h8M8 17h5" />
        </svg>
      </span>
      <span>
        <span className="brand__name">Weekly Meeting Notes</span>
        {tagline ? <span className="brand__tagline muted small">{t('brand.tagline')}</span> : null}
      </span>
    </span>
  );
}
