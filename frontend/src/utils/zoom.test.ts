import { describe, expect, it } from 'vitest';
import { FITTED, MAX_ZOOM, zoomAt, zoomLabel } from './zoom';

describe('zooming a picture', () => {
  it('keeps the spot under the pointer where it is', () => {
    // Zooming 2x around a spot 100 px right of the middle moves the picture 100 px left, so that spot stays put.
    expect(zoomAt(FITTED, 2, { x: 100, y: 0 })).toEqual({ scale: 2, x: -100, y: 0 });
    // Around the middle, it only grows.
    expect(zoomAt(FITTED, 2, { x: 0, y: 0 })).toEqual({ scale: 2, x: 0, y: 0 });
    // Zooming again around the same screen spot keeps it there too.
    expect(zoomAt({ scale: 2, x: -100, y: 0 }, 2, { x: 100, y: 0 })).toEqual({ scale: 4, x: -300, y: 0 });
  });

  it('never goes below fitted (back in the middle) or above the maximum', () => {
    expect(zoomAt({ scale: 2, x: -100, y: 40 }, 0.25, { x: 0, y: 0 })).toEqual(FITTED);
    expect(zoomAt({ scale: 6, x: 0, y: 0 }, 4, { x: 0, y: 0 }).scale).toBe(MAX_ZOOM);
    expect(zoomLabel({ scale: 2.5, x: 0, y: 0 })).toBe('250%');
  });
});
