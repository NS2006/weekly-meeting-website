import { downloadFile, fromWorker, loadImages, transferable } from './exportImages';
import type { NotesExport } from './notesDocx';
import type { PackRequest } from './notesDocx.worker';

/**
 * "Save as Word": loads the notes' pictures (exportImages.ts), builds the .docx in a worker, so the page never
 * freezes, and downloads it. Loaded only when asked for; the Word library itself loads in the worker (or here, when the
 * browser cannot start one).
 */
export async function saveAsWord(
  input: Omit<NotesExport, 'images'>,
  fileName: string,
  onProgress: (done: number, total: number) => void,
  signal: AbortSignal,
): Promise<{ missing: number }> {
  const { images, missing } = await loadImages(input.meetings, true, onProgress, signal);
  const request: PackRequest = { input, images: [...images] };
  let blob = await fromWorker(() => new Worker(new URL('./notesDocx.worker.ts', import.meta.url), { type: 'module' }), request, transferable(images));
  if (!blob) {
    const [{ Packer }, { buildNotesDocument }] = await Promise.all([import('docx'), import('./notesDocx')]);
    blob = await Packer.toBlob(buildNotesDocument({ ...input, images }));
  }
  if (signal.aborted) throw new DOMException('Stopped', 'AbortError');
  downloadFile(blob, fileName);
  return { missing };
}
