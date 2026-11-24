/**
 * The page buttons to show: the first and last page, the current one with one on each side, and a gap (…) where
 * pages are left out. A gap never stands for a single page: that page is shown instead.
 * pageItems(6, 20) → [1, 'gap', 5, 6, 7, 'gap', 20].
 */
export function pageItems(current: number, last: number): (number | 'gap')[] {
  if (last <= 0) return [];
  const page = Math.min(Math.max(current, 1), last);
  const shown = new Set([1, last, page - 1, page, page + 1].filter((p) => p >= 1 && p <= last));
  // Next to the ends, keep five buttons so the row does not jump in width: 1 2 3 4 … 20.
  if (page <= 3) for (let p = 1; p <= Math.min(4, last); p++) shown.add(p);
  if (page >= last - 2) for (let p = Math.max(1, last - 3); p <= last; p++) shown.add(p);
  const pages = [...shown].sort((a, b) => a - b);
  const items: (number | 'gap')[] = [];
  for (const p of pages) {
    const before = items[items.length - 1];
    if (typeof before === 'number' && p - before === 2) items.push(before + 1);
    else if (typeof before === 'number' && p - before > 2) items.push('gap');
    items.push(p);
  }
  return items;
}
