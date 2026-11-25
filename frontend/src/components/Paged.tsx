import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BluePagination, type BluePaginationProps } from './blue';

/**
 * A paged list (owner, 2026-11-24): the same pages above and below it, so Previous / Next are one click away at
 * either end without scrolling. `head` sits on the left of the top pager (how many, Clear filters). Use it for every
 * paged list. With one page only, neither pager shows. `below={false}` leaves out the pages below, for a list short
 * enough that its top stays on screen (Home's quarters, owner 2026-11-25).
 */
export function Paged({
  head,
  children,
  label,
  below = true,
  ...pager
}: Omit<BluePaginationProps, 'label'> & { label: string; head?: ReactNode; below?: boolean; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <>
      <div className="paged__top">
        {head ? <div className="paged__head">{head}</div> : null}
        <BluePagination {...pager} label={label} />
      </div>
      {children}
      {below ? <BluePagination {...pager} label={t('ui.pagination.atEnd', { label })} /> : null}
    </>
  );
}
