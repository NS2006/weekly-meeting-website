import { ENCODINGS, fitWithin, ImageError, isAnimatedImage, keepOriginal, kindOf, MAX_IMAGE_BYTES, needsShrinking, type ImageKind } from './images';
import { canShrinkAnimations, shrinkAnimation } from './shrinkAnimation';

/**
 * Shrinks a picture in the browser before it is uploaded, so stored images stay small however big the original was.
 * Photos: at most 2000 pixels on the longest side, lossy WebP. Screenshots and diagrams: at most 2560, lossless WebP
 * when that stays small (text keeps exact pixels), else high-quality WebP. Where the browser cannot write WebP
 * (Safari): PNG for screenshots, JPEG for photos. The photo is turned upright first (its EXIF orientation), and its
 * metadata (such as location) is not copied. Small screenshots come back unchanged.
 * GIFs and animated PNG or WebP keep their animation: unchanged up to the server's limit, else re-encoded as a smaller
 * GIF (shrinkAnimation; `onProgress` follows it, from 0 to 1).
 * No library: the browser decodes, a canvas draws, toBlob (or gifEncoder) encodes.
 */
export async function prepareImage(file: File, onProgress?: (done: number) => void): Promise<Blob> {
  if (file.type === 'image/gif' || (await isAnimated(file))) {
    if (file.size <= MAX_IMAGE_BYTES) return file;
    if (!canShrinkAnimations()) throw new ImageError('animation_unsupported');
    return shrinkAnimation(file, onProgress);
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new ImageError('invalid_image'); // a file the browser cannot read as a picture
  }
  try {
    const original = { type: file.type, size: file.size, width: bitmap.width, height: bitmap.height };
    if (!needsShrinking(original)) return file;
    const kind = kindOf(file.type);
    for (const encoding of ENCODINGS[kind]) {
      const size = fitWithin(bitmap.width, bitmap.height, encoding.side);
      const blob = await encode(bitmap, size, encoding.quality, kind);
      if (blob.size > encoding.maxBytes) continue;
      return keepOriginal(original, blob.size) ? file : blob;
    }
    throw new ImageError('too_large');
  } finally {
    bitmap.close();
  }
}

/** An animated PNG or WebP says so in its first bytes (the APNG control chunk comes before the image data). */
async function isAnimated(file: File): Promise<boolean> {
  if (file.type !== 'image/png' && file.type !== 'image/webp') return false;
  return isAnimatedImage(new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer()), file.type);
}

async function encode(bitmap: ImageBitmap, size: { width: number; height: number }, quality: number, kind: ImageKind): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  try {
    const context = canvas.getContext('2d');
    if (!context) throw new ImageError('invalid_image');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    const webp = await toBlob(canvas, 'image/webp', quality);
    if (webp && webp.type === 'image/webp') return webp;
    // No WebP encoder: the browser answered PNG instead. Lossless suits a screenshot; a photo goes JPEG, on white
    // (JPEG has no transparency).
    if (webp && kind === 'graphic') return webp;
    context.globalCompositeOperation = 'destination-over';
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, size.width, size.height);
    const jpeg = await toBlob(canvas, 'image/jpeg', Math.min(0.92, quality + 0.03));
    if (!jpeg) throw new ImageError('invalid_image');
    return jpeg;
  } finally {
    // Frees the canvas memory at once (large photos make large canvases).
    canvas.width = 0;
    canvas.height = 0;
  }
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
