import { describe, expect, it } from 'vitest';
import {
  ANIMATION_ATTEMPTS,
  ENCODINGS,
  fitWithin,
  GRAPHIC_SIDE,
  imageProblem,
  isAnimatedImage,
  keepOriginal,
  kindOf,
  MAX_GIF_SOURCE_BYTES,
  MAX_IMAGE_BYTES,
  MAX_SOURCE_BYTES,
  needsShrinking,
  nextAnimationAttempt,
  PHOTO_SIDE,
} from './images';

const MB = 1024 * 1024;

describe('imageProblem()', () => {
  it('takes any picture up to 25 MB, since it is shrunk before upload', () => {
    expect(imageProblem({ type: 'image/jpeg', size: 18 * MB })).toBeNull();
    expect(imageProblem({ type: 'image/heic', size: 4 * MB })).toBeNull(); // a phone photo, converted
    expect(imageProblem({ type: 'image/png', size: MAX_SOURCE_BYTES + 1 })).toBe('too_large');
  });

  it('refuses SVG and files that are not pictures', () => {
    expect(imageProblem({ type: 'image/svg+xml', size: 1000 })).toBe('invalid_image');
    expect(imageProblem({ type: 'application/pdf', size: 1000 })).toBe('invalid_image');
  });

  it('takes a GIF up to 100 MB (a phone screen recording), since it is shrunk too', () => {
    expect(MAX_GIF_SOURCE_BYTES).toBe(100 * MB);
    expect(imageProblem({ type: 'image/gif', size: 12 * MB })).toBeNull();
    expect(imageProblem({ type: 'image/gif', size: 84 * MB })).toBeNull();
    expect(imageProblem({ type: 'image/gif', size: MAX_GIF_SOURCE_BYTES + 1 })).toBe('too_large');
    expect(imageProblem({ type: 'image/webp', size: 84 * MB })).toBe('too_large'); // other pictures keep 25 MB
  });
});

describe('fitWithin()', () => {
  it('scales the longest side down to the limit, keeping the shape, and never enlarges', () => {
    expect(fitWithin(6000, 4000, 2000)).toEqual({ width: 2000, height: 1333 });
    expect(fitWithin(3000, 9000, 2000)).toEqual({ width: 667, height: 2000 });
    expect(fitWithin(800, 600, 2000)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(10000, 1, 2000)).toEqual({ width: 2000, height: 1 });
  });
});

describe('needsShrinking() and keepOriginal()', () => {
  const small = { width: 1200, height: 800 };
  it('re-encodes JPEG photos and types the server does not store, never GIFs', () => {
    expect(needsShrinking({ type: 'image/jpeg', size: 200 * 1024, ...small })).toBe(true);
    expect(needsShrinking({ type: 'image/heic', size: 200 * 1024, ...small })).toBe(true);
    expect(needsShrinking({ type: 'image/gif', size: 4 * MB, width: 5000, height: 5000 })).toBe(false);
  });

  it('leaves small screenshots alone, but shrinks big or huge ones', () => {
    expect(needsShrinking({ type: 'image/png', size: 300 * 1024, ...small })).toBe(false);
    expect(needsShrinking({ type: 'image/png', size: 2 * MB, ...small })).toBe(true);
    expect(needsShrinking({ type: 'image/webp', size: 300 * 1024, width: 4000, height: 3000 })).toBe(true);
  });

  it('keeps a PNG or WebP original when shrinking did not make it smaller, never a JPEG', () => {
    expect(keepOriginal({ type: 'image/png', size: 600 * 1024, ...small }, 700 * 1024)).toBe(true);
    expect(keepOriginal({ type: 'image/png', size: 600 * 1024, ...small }, 200 * 1024)).toBe(false);
    expect(keepOriginal({ type: 'image/jpeg', size: 100 * 1024, ...small }, 300 * 1024)).toBe(false);
    expect(keepOriginal({ type: 'image/png', size: 600 * 1024, width: 3000, height: 2000 }, 700 * 1024)).toBe(false);
  });
});

describe('kindOf() and ENCODINGS', () => {
  it('treats PNG, WebP and BMP as screenshots or diagrams, anything else as a photo', () => {
    expect(['image/png', 'image/webp', 'image/bmp'].map(kindOf)).toEqual(['graphic', 'graphic', 'graphic']);
    expect(['image/jpeg', 'image/heic', 'image/avif'].map(kindOf)).toEqual(['photo', 'photo', 'photo']);
  });

  it('tries screenshots without loss first, keeps them larger than photos, and always fits the server limit', () => {
    expect(ENCODINGS.graphic[0]).toMatchObject({ side: GRAPHIC_SIDE, quality: 1 });
    expect(ENCODINGS.photo[0]).toMatchObject({ side: PHOTO_SIDE });
    expect(ENCODINGS.photo.every((e) => e.quality < 1)).toBe(true);
    for (const list of Object.values(ENCODINGS)) {
      for (const [i, e] of list.entries()) {
        expect(e.maxBytes).toBeLessThanOrEqual(MAX_IMAGE_BYTES);
        if (i > 0) expect(e.side * e.quality).toBeLessThanOrEqual((list[i - 1]?.side ?? 0) * (list[i - 1]?.quality ?? 0));
      }
    }
  });
});

describe('isAnimatedImage()', () => {
  const chunk = (type: string, length = 0) => [0, 0, 0, length, ...[...type].map((c) => c.charCodeAt(0)), ...new Array(length + 4).fill(0)];
  const png = (...chunks: number[][]) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunks.flat()]);
  const webp = (flags: number) => new Uint8Array([...'RIFF'].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0], [...'WEBPVP8X'].map((c) => c.charCodeAt(0)), [10, 0, 0, 0, flags]));

  it('finds the APNG control chunk before the image data, and the WebP animation flag', () => {
    expect(isAnimatedImage(png(chunk('IHDR', 13), chunk('acTL', 8), chunk('IDAT', 5)), 'image/png')).toBe(true);
    expect(isAnimatedImage(png(chunk('IHDR', 13), chunk('IDAT', 5), chunk('acTL', 8)), 'image/png')).toBe(false);
    expect(isAnimatedImage(webp(0x02), 'image/webp')).toBe(true);
    expect(isAnimatedImage(webp(0x10), 'image/webp')).toBe(false); // alpha only
    expect(isAnimatedImage(png(chunk('acTL', 8)), 'image/jpeg')).toBe(false);
  });
});

describe('ANIMATION_ATTEMPTS and nextAnimationAttempt()', () => {
  const screen = { width: 1280, height: 720 };
  it('keeps the size a note shows images at and skips frames first, then gets smaller', () => {
    expect(ANIMATION_ATTEMPTS[0]).toEqual({ side: 800, frameStep: 1 });
    for (const [i, a] of ANIMATION_ATTEMPTS.entries()) {
      const before = ANIMATION_ATTEMPTS[i - 1];
      if (before) expect(a.side * a.side / a.frameStep).toBeLessThan(before.side * before.side / before.frameStep);
    }
  });

  it('jumps to the first attempt estimated to fit, or to the smallest, and stops after it', () => {
    expect(ANIMATION_ATTEMPTS[1]).toEqual({ side: 800, frameStep: 2 });
    expect(nextAnimationAttempt(0, 7 * MB, screen)).toBe(1); // every second frame: about 3.5 MB
    expect(nextAnimationAttempt(0, 12 * MB, screen)).toBe(2); // and 640 px (64% of the pixels): about 3.8 MB
    expect(nextAnimationAttempt(0, 16 * MB, screen)).toBe(3); // and every third frame: about 3.4 MB
    // A long recording: 400 px (25% of the pixels) and every fifth frame, about 4 MB.
    expect(ANIMATION_ATTEMPTS[nextAnimationAttempt(0, 80 * MB, screen)]).toEqual({ side: 400, frameStep: 5 });
    expect(nextAnimationAttempt(0, 400 * MB, screen)).toBe(ANIMATION_ATTEMPTS.length - 1);
    expect(nextAnimationAttempt(ANIMATION_ATTEMPTS.length - 1, 6 * MB, screen)).toBe(-1);
  });
});
