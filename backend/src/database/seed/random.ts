/**
 * Repeatable randomness for the development seed: the same seed text always gives the same sequence, so a reseed on
 * the same day produces the same data (only the dates move with the calendar).
 */

/** A 32-bit hash of a text (FNV-1a), to derive one stream per person or project. */
export function hashText(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export class Random {
  private state: number;

  constructor(seed: string) {
    this.state = hashText(seed) || 1;
  }

  /** A number in [0, 1) (mulberry32). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** True with probability `p`. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** An integer in [min, max]. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pick from an empty list');
    return items[Math.floor(this.next() * items.length)] as T;
  }

  /** One item, chosen by weight. */
  weighted<T>(items: readonly (readonly [T, number])[]): T {
    const total = items.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = this.next() * total;
    for (const [item, weight] of items) {
      roll -= weight;
      if (roll < 0) return item;
    }
    return (items[items.length - 1] as readonly [T, number])[0];
  }

  /** A shuffled copy. */
  shuffle<T>(items: readonly T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.next() * (i + 1));
      [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
    }
    return copy;
  }

  /** Up to `count` different items. */
  sample<T>(items: readonly T[], count: number): T[] {
    return this.shuffle(items).slice(0, count);
  }
}

/**
 * Hands out the items of a list in a shuffled order and starts a new round when all were used, so one person does not
 * repeat a sentence until they have used the others.
 */
export class Deck<T> {
  private readonly items: readonly T[];
  private readonly random: Random;
  private queue: T[] = [];

  constructor(items: readonly T[], random: Random) {
    this.items = items;
    this.random = random;
  }

  draw(): T {
    if (this.queue.length === 0) this.queue = this.random.shuffle(this.items);
    const item = this.queue.pop();
    if (item === undefined) throw new Error('draw from an empty deck');
    return item;
  }
}
