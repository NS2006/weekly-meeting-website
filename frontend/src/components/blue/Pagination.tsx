import { useTranslation } from 'react-i18next';
import { pageItems } from '../../utils/pageItems';

// BLUE3 BPagination → BluePagination (no plugin template yet; props: current, total, pageSize, onChange).
export interface BluePaginationProps {
  /** The page shown, from 1. */
  current: number;
  /** How many items there are in all. */
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
  /** Names the navigation for screen readers ("Pages" when not given). */
  label?: string;
  disabled?: boolean;
}

/**
 * Previous, the page numbers (first, last, and the ones around the current page) and Next. On a phone the numbers
 * give way to "Page 3 of 16" and Previous / Next to their arrows (still named for screen readers). Nothing is shown
 * when everything fits on one page.
 */
export function BluePagination({ current, total, pageSize, onChange, label, disabled = false }: BluePaginationProps) {
  const { t } = useTranslation();
  const last = Math.max(1, Math.ceil(total / pageSize));
  if (last <= 1) return null;
  const page = Math.min(Math.max(current, 1), last);

  return (
    <nav className="blue-pagination" aria-label={label ?? t('ui.pagination.label')}>
      <button
        type="button"
        className="blue-pagination__step"
        disabled={disabled || page <= 1}
        onClick={() => onChange(page - 1)}
      >
        <span aria-hidden="true">←</span> <span className="blue-pagination__word">{t('ui.pagination.previous')}</span>
      </button>
      <ol className="blue-pagination__pages">
        {pageItems(page, last).map((item, i) =>
          item === 'gap' ? (
            <li key={`gap-${i}`} className="blue-pagination__gap" aria-hidden="true">
              …
            </li>
          ) : (
            <li key={item}>
              <button
                type="button"
                className="blue-pagination__page"
                aria-current={item === page ? 'page' : undefined}
                aria-label={t('ui.pagination.page', { page: item })}
                disabled={disabled}
                onClick={() => item !== page && onChange(item)}
              >
                {item}
              </button>
            </li>
          ),
        )}
      </ol>
      <span className="blue-pagination__status">{t('ui.pagination.status', { page, last })}</span>
      <button
        type="button"
        className="blue-pagination__step"
        disabled={disabled || page >= last}
        onClick={() => onChange(page + 1)}
      >
        <span className="blue-pagination__word">{t('ui.pagination.next')}</span> <span aria-hidden="true">→</span>
      </button>
    </nav>
  );
}
