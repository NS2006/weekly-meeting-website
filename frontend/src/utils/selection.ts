/**
 * Picking items of a list by id, as OneDrive does (owner, 2026-11-25: the Notes page, Deleted teams). The picked ids
 * keep the order they were picked in; the lists show them in their own order.
 */

/** Picks the item, or puts it back. */
export function toggleId(picked: readonly string[], id: string): string[] {
  return picked.includes(id) ? picked.filter((p) => p !== id) : [...picked, id];
}

/** How much of the list is picked: all of it, some, or none (the "select all" box shows it). */
export function pickState(picked: readonly string[], ids: readonly string[]): 'all' | 'some' | 'none' {
  const on = ids.filter((id) => picked.includes(id)).length;
  if (on === 0) return 'none';
  return on === ids.length ? 'all' : 'some';
}

/** "Select all": picks every item, or none when all already are. */
export function toggleAll(picked: readonly string[], ids: readonly string[]): string[] {
  return pickState(picked, ids) === 'all' ? [] : [...ids];
}

/** The picked items still in the list (one gone after a refresh drops out), in the list's order. */
export function pickedIn<T extends { id: string }>(picked: readonly string[], items: readonly T[]): T[] {
  return items.filter((item) => picked.includes(item.id));
}
