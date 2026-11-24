import { buildPalette, changedRect, ColorHistogram, delayFromMicroseconds, GifWriter, PaletteMapper, type GifFrame } from './gifEncoder';
import { ANIMATION_ATTEMPTS, fitWithin, ImageError, MAX_IMAGE_BYTES, nextAnimationAttempt } from './images';

/** Shrinking animations needs the browser's ImageDecoder (Chrome and Edge; Firefox from version 133). */
export const canShrinkAnimations = () => typeof ImageDecoder !== 'undefined';

/** At most this many frames are sampled for the shared palette, and this many of their pixels in all. */
const PALETTE_FRAMES = 24;
const PALETTE_PIXELS = 1_500_000;

/**
 * Makes a GIF (or an animated PNG or WebP) over the server's limit smaller, keeping the animation: the browser decodes
 * each frame, a canvas resizes it, and gifEncoder writes a new GIF. Tries ANIMATION_ATTEMPTS until the result fits.
 * `onProgress` gets the share of the current attempt done (0 to 1). The page stays responsive (it yields while working).
 */
export async function shrinkAnimation(file: File, onProgress?: (done: number) => void): Promise<Blob> {
  let decoder: ImageDecoder;
  try {
    decoder = new ImageDecoder({ data: await file.arrayBuffer(), type: file.type });
    await decoder.tracks.ready;
    await decoder.completed;
  } catch {
    throw new ImageError('invalid_image');
  }
  try {
    const track = decoder.tracks.selectedTrack;
    if (!track || track.frameCount < 1) throw new ImageError('invalid_image');
    const first = (await decoder.decode({ frameIndex: 0 })).image;
    const source = { width: first.displayWidth, height: first.displayHeight };
    first.close();
    // ImageDecoder counts repeats after the first play (Infinity: forever); a GIF writes 0 for forever.
    const loop = track.repetitionCount === Infinity ? 0 : track.repetitionCount > 0 ? Math.min(track.repetitionCount, 65_535) : null;
    for (let attempt = 0; attempt >= 0; ) {
      const plan = ANIMATION_ATTEMPTS[attempt]!;
      const bytes = await encode(decoder, track.frameCount, loop, fitWithin(source.width, source.height, plan.side), plan.frameStep, onProgress);
      if (bytes.length <= MAX_IMAGE_BYTES) return new Blob([bytes], { type: 'image/gif' });
      attempt = nextAnimationAttempt(attempt, bytes.length, source);
    }
    throw new ImageError('too_large');
  } finally {
    decoder.close();
  }
}

async function encode(
  decoder: ImageDecoder,
  frameCount: number,
  loop: number | null,
  size: { width: number; height: number },
  frameStep: number,
  onProgress?: (done: number) => void,
): Promise<Uint8Array<ArrayBuffer>> {
  const { width, height } = size;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new ImageError('invalid_image');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  const pace = pacer();
  // Draws a frame (the decoder gives it whole, earlier frames included) and answers how long it shows.
  const draw = async (frameIndex: number, paint: boolean) => {
    const { image } = await decoder.decode({ frameIndex });
    try {
      if (paint) {
        context.clearRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
      }
      return image.duration ?? 100_000;
    } finally {
      image.close();
    }
  };

  try {
    // 1. One palette for every frame (no flicker between frames), from frames spread over the animation.
    const histogram = new ColorHistogram();
    const samples = Math.min(PALETTE_FRAMES, frameCount);
    const pixelStep = (width * height * samples) / PALETTE_PIXELS;
    for (let s = 0; s < samples; s++) {
      await draw(Math.floor((s * frameCount) / samples), true);
      histogram.add(context.getImageData(0, 0, width, height).data, pixelStep);
      onProgress?.((0.15 * (s + 1)) / samples);
      await pace();
    }
    const palette = buildPalette(histogram, 255);
    const transparent = palette.length; // one entry kept for "unchanged" and clear pixels
    const restore = histogram.sawTransparency; // real transparency: whole frames, each cleared after it shows
    const mapper = new PaletteMapper(palette, transparent);
    const writer = new GifWriter(width, height, palette, loop, transparent, restore);

    // 2. Every frame (or every frameStep-th; the skipped ones' time goes to the frame before).
    const shown = new Uint8Array(width * height).fill(transparent);
    const current = new Uint8Array(width * height);
    let pending: Omit<GifFrame, 'delayCs'> | null = null;
    let pendingUs = 0;
    for (let index = 0; index < frameCount; index++) {
      const keep = index % frameStep === 0 || pending === null;
      const us = await draw(index, keep);
      if (!keep) {
        pendingUs += us;
        continue;
      }
      mapper.map(context.getImageData(0, 0, width, height).data, current);
      let frame: Omit<GifFrame, 'delayCs'> | null;
      if (restore) {
        frame = pending && current.every((v, i) => v === shown[i]) ? null : { left: 0, top: 0, width, height, indices: current.slice() };
        shown.set(current);
      } else {
        frame = changedRect(shown, current, width, transparent) ?? (pending ? null : { left: 0, top: 0, width: 1, height: 1, indices: new Uint8Array([transparent]) });
      }
      if (frame === null) {
        pendingUs += us; // the same picture: the previous frame shows longer
      } else {
        if (pending) writer.frame({ ...pending, delayCs: delayFromMicroseconds(pendingUs) });
        pending = frame;
        pendingUs = us;
      }
      onProgress?.(0.15 + (0.85 * (index + 1)) / frameCount);
      await pace();
    }
    if (pending) writer.frame({ ...pending, delayCs: delayFromMicroseconds(pendingUs) });
    return writer.finish();
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/** Lets the page paint and react about every 25 ms of work, so typing and scrolling stay smooth. */
function pacer() {
  let last = performance.now();
  return async () => {
    if (performance.now() - last < 25) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
    last = performance.now();
  };
}
