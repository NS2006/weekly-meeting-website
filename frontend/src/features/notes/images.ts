/** What the server stores (it checks the file's bytes again). */
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;
/** The server's limit per stored image (after shrinking). */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** What you may pick, paste or drop: it is shrunk in the browser before it is uploaded. */
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
/**
 * A GIF may be bigger: a phone's screen recording saved as GIF easily takes 30 to 90 MB, and it is shrunk the same
 * way (fewer frames, smaller), keeping the animation.
 */
export const MAX_GIF_SOURCE_BYTES = 100 * 1024 * 1024;
/** Longest side of a stored photo, in pixels: sharp on any screen, light to load. */
export const PHOTO_SIDE = 2000;
/** Longest side of a stored screenshot or diagram: larger, so small text stays readable. */
export const GRAPHIC_SIDE = 2560;
/** A PNG or WebP this small and within GRAPHIC_SIDE is uploaded as it is. */
export const SMALL_ENOUGH_BYTES = 400 * 1024;

export type ImageProblem = 'invalid_image' | 'too_large';

/** A reason an image cannot be added, found while preparing it (shown with a label in the editor). */
export class ImageError extends Error {
  readonly code: ImageProblem | 'animation_unsupported';

  constructor(code: ImageProblem | 'animation_unsupported') {
    super(code);
    this.code = code;
  }
}

const STORED = IMAGE_TYPES as readonly string[];

/**
 * Photos (JPEG, a phone's HEIC…) take lossy compression well. Screenshots, charts and diagrams (PNG, WebP, BMP) have
 * sharp edges and small text that lossy compression smudges, so they are tried without loss first.
 */
export type ImageKind = 'photo' | 'graphic';
export function kindOf(type: string): ImageKind {
  return type === 'image/png' || type === 'image/webp' || type === 'image/bmp' ? 'graphic' : 'photo';
}

/** One way to encode: the longest side, the WebP quality (1 is lossless in Chromium browsers), the most bytes it may take. */
export type Encoding = { side: number; quality: number; maxBytes: number };

/** Tried in order; the first result within its byte budget is uploaded. Later ones only for very detailed images. */
export const ENCODINGS: Record<ImageKind, readonly Encoding[]> = {
  photo: [
    { side: PHOTO_SIDE, quality: 0.85, maxBytes: MAX_IMAGE_BYTES },
    { side: 1600, quality: 0.75, maxBytes: MAX_IMAGE_BYTES },
    { side: 1200, quality: 0.65, maxBytes: MAX_IMAGE_BYTES },
  ],
  graphic: [
    { side: GRAPHIC_SIDE, quality: 1, maxBytes: 2 * 1024 * 1024 }, // exact pixels: text stays crisp
    { side: GRAPHIC_SIDE, quality: 0.92, maxBytes: MAX_IMAGE_BYTES }, // a photo saved as PNG
    { side: PHOTO_SIDE, quality: 0.85, maxBytes: MAX_IMAGE_BYTES },
    { side: 1600, quality: 0.75, maxBytes: MAX_IMAGE_BYTES },
  ],
};

/**
 * Why a file cannot be added as an image, or null when it can (it may still be shrunk). Any picture the browser can
 * read is fine (a phone's HEIC photo is converted), except SVG, which can carry scripts.
 */
export function imageProblem(file: Pick<File, 'type' | 'size'>): ImageProblem | null {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') return 'invalid_image';
  if (file.size > (file.type === 'image/gif' ? MAX_GIF_SOURCE_BYTES : MAX_SOURCE_BYTES)) return 'too_large';
  return null;
}

/**
 * Whether a PNG or WebP holds an animation (an APNG `acTL` chunk before the first `IDAT`; the WebP `VP8X` animation
 * flag), from the file's first bytes. Animated images are never flattened to their first frame.
 */
export function isAnimatedImage(head: Uint8Array, type: string): boolean {
  const ascii = (at: number, text: string) => [...text].every((c, i) => head[at + i] === c.charCodeAt(0));
  if (type === 'image/webp') return ascii(0, 'RIFF') && ascii(8, 'WEBP') && ascii(12, 'VP8X') && ((head[20] ?? 0) & 0x02) !== 0;
  if (type !== 'image/png') return false;
  for (let at = 8; at + 8 <= head.length; ) {
    const length = (((head[at] ?? 0) << 24) | ((head[at + 1] ?? 0) << 16) | ((head[at + 2] ?? 0) << 8) | (head[at + 3] ?? 0)) >>> 0;
    if (ascii(at + 4, 'acTL')) return true;
    if (ascii(at + 4, 'IDAT')) return false;
    at += 12 + length;
  }
  return false;
}

/**
 * How a GIF (or other animation) over the server's limit is made smaller, tried in order. Size comes first: 800 px
 * is about as wide as a note shows images, so text stays as readable as on screen. Next every second frame is kept
 * (each shows twice as long, so the animation lasts as long as before): a 30 fps recording plays at 15, still smooth.
 * Smoothness is kept down to 480 px before every third frame (owner, 2026-11-25: 3–5 fps GIFs looked laggy; at 10 fps
 * or fewer, scrolling and page slides jump). The last ones are for long recordings (hundreds of frames, tens of MB):
 * fewer frames per second and a phone-screen size, still readable and still moving.
 */
export const ANIMATION_ATTEMPTS: readonly { side: number; frameStep: number }[] = [
  { side: 800, frameStep: 1 },
  { side: 800, frameStep: 2 },
  { side: 640, frameStep: 2 },
  { side: 560, frameStep: 2 },
  { side: 480, frameStep: 2 },
  { side: 560, frameStep: 3 },
  { side: 480, frameStep: 3 },
  { side: 400, frameStep: 3 },
  { side: 400, frameStep: 4 },
  { side: 360, frameStep: 5 },
  { side: 320, frameStep: 6 },
  { side: 320, frameStep: 8 },
];

/**
 * A colour that moved at most this many levels (0–255, per channel) since the last frame counts as unchanged: a screen
 * recording's frames differ everywhere by a little noise, which costs size and shows nothing (gifEncoder nearColours).
 */
export const ANIMATION_NOISE_LEVELS = 6;

/**
 * Lossy compression: a colour this close (levels per channel) is written where it compresses better (gifEncoder
 * closeColours). With the noise above, about a quarter to a half smaller on recordings, so more frames fit
 * (2026-11-25, measured on made-up 20 s phone recordings: 15 fps instead of 10, under the same 5 MB).
 */
export const ANIMATION_LOSSY_LEVELS = 6;

/**
 * After attempt `current` came out at `bytes` (too big), the next attempt worth trying: the first whose estimated size
 * (scaled by pixels and frames) is comfortably under the limit, else the smallest one, or -1 when that was tried.
 */
export function nextAnimationAttempt(current: number, bytes: number, source: { width: number; height: number }): number {
  const area = (side: number) => {
    const size = fitWithin(source.width, source.height, side);
    return size.width * size.height;
  };
  const from = ANIMATION_ATTEMPTS[current];
  const last = ANIMATION_ATTEMPTS.length - 1;
  if (!from || current >= last) return -1;
  for (let next = current + 1; next <= last; next++) {
    const to = ANIMATION_ATTEMPTS[next]!;
    const estimate = bytes * (area(to.side) / area(from.side)) * (from.frameStep / to.frameStep);
    if (estimate <= MAX_IMAGE_BYTES * 0.8) return next;
  }
  return last;
}

/** The size to draw at: the longest side at most `maxSide`, never enlarged, at least 1 pixel. */
export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * Whether a still picture is re-encoded before upload (animations go through shrinkAnimation instead). JPEGs always: phone photos are large and
 * carry metadata such as the place they were taken, which re-encoding drops. Types the server does not store (HEIC,
 * BMP, AVIF…) always. PNG and WebP only when they are big in bytes or pixels.
 */
export function needsShrinking(image: { type: string; size: number; width: number; height: number }): boolean {
  if (image.type === 'image/gif') return false;
  if (image.type === 'image/jpeg' || !STORED.includes(image.type)) return true;
  return image.size > SMALL_ENOUGH_BYTES || Math.max(image.width, image.height) > GRAPHIC_SIDE;
}

/**
 * After shrinking: keep the original instead when it is a PNG or WebP the server takes as it is and the shrunk one
 * did not get smaller (a small, simple screenshot often compresses better as PNG).
 */
export function keepOriginal(original: { type: string; size: number; width: number; height: number }, shrunkBytes: number): boolean {
  return (
    (original.type === 'image/png' || original.type === 'image/webp') &&
    original.size <= shrunkBytes &&
    original.size <= MAX_IMAGE_BYTES &&
    Math.max(original.width, original.height) <= GRAPHIC_SIDE
  );
}

/** The image files in a paste or drop (not text or HTML that merely mentions images). */
export function imageFiles(data: DataTransfer | null): File[] {
  if (!data) return [];
  return Array.from(data.files).filter((file) => file.type.startsWith('image/'));
}
