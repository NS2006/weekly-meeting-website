import { describe, expect, it } from 'vitest';
import { isSafeHref, normalizeLink } from './link';
import { TEXT_COLORS } from './palette';

describe('normalizeLink()', () => {
  it('turns what people type into a safe address', () => {
    expect(normalizeLink('example.com/page?x=1')).toBe('https://example.com/page?x=1');
    expect(normalizeLink(' https://example.com ')).toBe('https://example.com');
    expect(normalizeLink('someone@example.test')).toBe('mailto:someone@example.test');
    expect(normalizeLink('http://localhost:5173/notes/1')).toBe('http://localhost:5173/notes/1');
  });

  it('refuses scripts, other schemes and things that are not addresses', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'ftp://example.com', 'two words', '', 'intranet']) {
      expect(normalizeLink(bad)).toBeNull();
    }
    expect(isSafeHref('JavaScript:alert(1)')).toBe(false);
  });
});

describe('TEXT_COLORS', () => {
  it('are hex values the server accepts', () => {
    for (const color of TEXT_COLORS) expect(color.value).toMatch(/^#[0-9a-f]{6}$/);
  });
});
