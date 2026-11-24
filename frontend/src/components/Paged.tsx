import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BluePagination, type BluePaginationProps } from './blue';

/**
 * A paged list (owner, 2026-11-24): the same pages above and below it, so Previous / Next are one click away at
 * either end without scrolling. `head` sits on the left of the top pager (how many, Clear filters). Use it for every
 * paged list. With one page only, neither pager shows.
 */
export function Paged({ head, children, label, ...pager }: Omit<BluePaginationProps, 'label'> & { label: string; head?: ReactNode; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <>
      <div className="paged__top">
        {head ? <div className="paged__head">{head}</div> : null}
        <BluePagination {...pager} label={label} />
      </div>
      {children}
      <BluePagination {...pager} label={t('ui.pagination.atEnd', { label })} />
    </>
  );
}
