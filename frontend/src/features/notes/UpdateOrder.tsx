import type { UpdateOrder } from '@weekly-meeting/shared';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';

/**
 * A project's updates newest first, or oldest first to review it from its start (owner, 2026-11-25): on a project's
 * page and on a period's project page. In the address as ?order=oldest, so Back keeps it.
 */
export function useUpdateOrder(): [UpdateOrder, (next: UpdateOrder) => void] {
  const [params, setParams] = useSearchParams();
  const order: UpdateOrder = params.get('order') === 'oldest' ? 'oldest' : 'newest';
  const setOrder = (next: UpdateOrder) =>
    setParams(
      (current) => {
        const updated = new URLSearchParams(current);
        if (next === 'oldest') updated.set('order', next);
        else updated.delete('order');
        return updated;
      },
      { replace: true },
    );
  return [order, setOrder];
}

/** "Newest first" and "Oldest first", in the head of an updates list. */
export function UpdateOrderSwitch({ order, onChange }: { order: UpdateOrder; onChange: (next: UpdateOrder) => void }) {
  const { t } = useTranslation();
  return (
    <div className="update-order" role="group" aria-label={t('notes.updates.order')}>
      {(['newest', 'oldest'] as const).map((choice) => (
        <button key={choice} type="button" className="update-order__item" aria-pressed={order === choice} onClick={() => onChange(choice)}>
          {t(choice === 'newest' ? 'notes.updates.newestFirst' : 'notes.updates.oldestFirst')}
        </button>
      ))}
    </div>
  );
}
