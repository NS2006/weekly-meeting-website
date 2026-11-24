import { describe, expect, it } from 'vitest';
import { initials } from './Avatar';

describe('initials()', () => {
  it.each([
    ['Admin Test', 'AT'],
    ['Budi', 'B'],
    ['  siti  nur   aisyah ', 'SA'],
    ['', ''],
    ['PIR 1', 'P1'],
    ['PIR 10', 'P10'],
    ['PIR Leader', 'PL'],
  ])('%j → %j', (name, expected) => {
    expect(initials(name)).toBe(expected);
  });
});
