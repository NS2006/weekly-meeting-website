import type { EditorNode, PeriodMeetingNotes } from '@weekly-meeting/shared';
import { ApiFailure, fetchAttachment } from '../../services/api';

/**
 * What "Save as Word" and "Save as PDF" share: the notes' pictures, loaded and made ready, and the download itself.
 * Pictures keep their own file when the format can show it (PNG and JPEG; GIF, also animated, in Word); others (WebP,
 * and GIF for a PDF, which shows its first frame) are drawn again as PNG when they have see-through parts, JPEG
 * otherwise, at most 1600 px on their longest side, which is sharp at the page's width and keeps the file small. A
 * picture that cannot be loaded (or takes over 30 s) becomes a short note in its place, and is counted; a signed-out
 * session stops it all.
 */

export interface ExportImage {
  data: Uint8Array;
  type: 'png' | 'jpg' | 'gif';
  /** Pixels, as shown (turned upright). */
  width: number;
  height: number;
}

const MAX_SIDE = 1600;

/** Every picture address in the notes, once each (to load them before building the file). */
export function imageSources(meetings: readonly PeriodMeetingNotes[]): string[] {
  const found = new Set<string>();
  const walk = (node: EditorNode) => {
    if (node.type === 'image' && typeof node.attrs?.src === 'string') found.add(node.attrs.src);
    node.content?.forEach(walk);
  };
  for (const m of meetings) for (const p of m.people) for (const n of p.notes) walk(n.content);
  return [...found];
}

function hasSeeThrough(pixels: Uint8ClampedArray): boolean {
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i] !== 255) return true;
  return false;
}

async function prepare(blob: Blob, keepGif: boolean): Promise<ExportImage> {
  const kept: Record<string, ExportImage['type']> = { 'image/png': 'png', 'image/jpeg': 'jpg', ...(keepGif ? { 'image/gif': 'gif' } : {}) };
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  try {
    const { width, height } = bitmap;
    const type = kept[blob.type];
    if (type && (type === 'gif' || Math.max(width, height) <= MAX_SIDE)) {
      return { data: new Uint8Array(await blob.arrayBuffer()), type, width, height };
    }
    const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    canvas.width = w;
    canvas.height = h;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('no canvas');
    context.drawImage(bitmap, 0, 0, w, h);
    const png = hasSeeThrough(context.getImageData(0, 0, w, h).data);
    const out = await new Promise<Blob | null>((done) => canvas.toBlob(done, png ? 'image/png' : 'image/jpeg', 0.92));
    if (!out) throw new Error('not encoded');
    return { data: new Uint8Array(await out.arrayBuffer()), type: png ? 'png' : 'jpg', width: w, height: h };
  } finally {
    bitmap.close();
    // Browsers cap the memory all canvases may hold (Safari especially): give this one's back at once.
    canvas.width = 0;
    canvas.height = 0;
  }
}

/** Loads the pictures four at a time. A signed-out session (or leaving the page) stops the rest and throws. */
export async function loadImages(
  meetings: readonly PeriodMeetingNotes[],
  keepGif: boolean,
  onProgress: (done: number, total: number) => void,
  signal: AbortSignal,
): Promise<{ images: Map<string, ExportImage | null>; missing: number }> {
  const sources = imageSources(meetings);
  const images = new Map<string, ExportImage | null>();
  const queue = [...sources];
  let done = 0;
  let missing = 0;
  let stop: unknown = null;
  onProgress(0, sources.length);
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let src = queue.shift(); src !== undefined && stop === null; src = queue.shift()) {
        try {
          images.set(src, await prepare(await fetchAttachment(src, signal), keepGif));
        } catch (error) {
          if (signal.aborted || (error instanceof ApiFailure && error.status === 401)) {
            stop = signal.aborted ? new DOMException('Stopped', 'AbortError') : error;
            break;
          }
          images.set(src, null);
          missing += 1;
        }
        onProgress(++done, sources.length);
      }
    }),
  );
  if (stop !== null) throw stop;
  return { images, missing };
}

/** The pictures' bytes, to move them to a worker rather than copy them. */
export function transferable(images: ReadonlyMap<string, ExportImage | null>): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>();
  for (const image of images.values()) if (image && image.data.buffer instanceof ArrayBuffer) buffers.add(image.data.buffer);
  return [...buffers];
}

/** Runs a worker that answers `{ blob }`; null when the browser cannot start one (the caller builds it on the page). */
export async function fromWorker(start: () => Worker, request: unknown, transfer: ArrayBuffer[]): Promise<Blob | null> {
  let worker: Worker;
  try {
    worker = start();
  } catch {
    return null;
  }
  try {
    return await new Promise<Blob>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<{ blob?: Blob }>) =>
        event.data.blob instanceof Blob ? resolve(event.data.blob) : reject(new Error('not built'));
      worker.onerror = () => reject(new Error('worker failed'));
      worker.postMessage(request, transfer);
    });
  } finally {
    worker.terminate();
  }
}

/** Downloads the file under `fileName`. */
export function downloadFile(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Long enough for a browser that asks where to save it first.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
