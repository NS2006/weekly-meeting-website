/** Where an item sits on the page while one of them is dragged (measured once, when the drag starts). */
export interface Slot {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** How far `value` is outside [start, start + size] (0 inside). */
const outside = (value: number, start: number, size: number) => (value < start ? start - value : value > start + size ? value - start - size : 0);

/**
 * Where the dragged item would land, read like the board (left to right, row by row; a list is one item per row):
 * the row its middle is in (or the nearest row), then the place in that row its middle is over (or the nearest one,
 * so the empty space after the last item means "last"). The slots are measured once, before anything moved, so the
 * answer never flickers between two places.
 */
export function dropIndex(slots: readonly Slot[], center: Point): number {
  let rowTop = 0;
  let nearestRow = Infinity;
  for (const slot of slots) {
    const distance = outside(center.y, slot.top, slot.height);
    if (distance < nearestRow) {
      nearestRow = distance;
      rowTop = slot.top;
    }
  }
  let best = -1;
  let nearest = Infinity;
  for (const [index, slot] of slots.entries()) {
    if (Math.abs(slot.top - rowTop) > 1) continue;
    const distance = outside(center.x, slot.left, slot.width);
    if (distance < nearest) {
      nearest = distance;
      best = index;
    }
  }
  return best;
}

/** The room the dragged item takes in a list: its height and the gap to its neighbour (0 for a list of one). */
export function roomOf(slots: readonly Slot[], from: number): number {
  const slot = slots[from];
  if (!slot) return 0;
  const next = slots[from + 1];
  const previous = slots[from - 1];
  const gap = next ? next.top - (slot.top + slot.height) : previous ? slot.top - (previous.top + previous.height) : 0;
  return slot.height + Math.max(0, gap);
}

/**
 * How far the item at `index` moves aside while the dragged one (from `from`) hovers over `to`. In a list, the items
 * in between close the room the dragged one left; in a grid, each steps into its neighbour's place (along the row,
 * or to the end of the row above / the start of the row below).
 */
export function shiftOf(index: number, from: number, to: number, slots: readonly Slot[], layout: 'list' | 'grid'): Point {
  const step = from < to && index > from && index <= to ? -1 : from > to && index >= to && index < from ? 1 : 0;
  if (step === 0) return { x: 0, y: 0 };
  if (layout === 'list') return { x: 0, y: step * roomOf(slots, from) };
  const here = slots[index];
  const there = slots[index + step];
  return here && there ? { x: there.left - here.left, y: there.top - here.top } : { x: 0, y: 0 };
}

/** `list` with the item at `from` moved to `to`. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}
