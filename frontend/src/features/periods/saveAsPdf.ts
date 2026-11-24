import { downloadFile, fromWorker, loadImages, transferable } from './exportImages';
import type { NotesExport } from './notesDocx';
import type { PdfImage } from './notesPdf';
import type { PdfRequest } from './notesPdf.worker';

/**
 * "Save as PDF" (owner, 2026-11-24: downloaded at once, like Word, instead of the print window): loads the notes'
 * pictures as PNG or JPEG (exportImages.ts), builds the PDF in a worker, so the page never freezes, and downloads it.
 * Loaded only when asked for; the PDF library itself loads in the worker (or here, when the browser cannot start one).
 */
export async function saveAsPdf(
  input: Omit<NotesExport, 'images'>,
  fileName: string,
  onProgress: (done: number, total: number) => void,
  signal: AbortSignal,
): Promise<{ missing: number }> {
  const loaded = await loadImages(input.meetings, false, onProgress, signal);
  // Without GIFs kept, every picture is PNG or JPEG.
  const images = new Map<string, PdfImage | null>();
  for (const [src, image] of loaded.images) images.set(src, image && image.type !== 'gif' ? { ...image, type: image.type } : null);
  const request: PdfRequest = { input, images: [...images] };
  let blob = await fromWorker(() => new Worker(new URL('./notesPdf.worker.ts', import.meta.url), { type: 'module' }), request, transferable(images));
  if (!blob) {
    const { buildNotesPdf } = await import('./notesPdf');
    blob = new Blob([(await buildNotesPdf({ ...input, images })) as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });
  }
  if (signal.aborted) throw new DOMException('Stopped', 'AbortError');
  downloadFile(blob, fileName);
  return { missing: loaded.missing };
}
