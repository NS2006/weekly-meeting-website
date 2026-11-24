import { buildNotesPdf, type PdfExport, type PdfImage } from './notesPdf';

/**
 * Builds the PDF away from the page: laying out a quarter's notes and pictures takes seconds, and on the page's own
 * thread it would freeze it. Gets the notes and the loaded pictures, answers with the file.
 */
export interface PdfRequest {
  input: Omit<PdfExport, 'images'>;
  images: [string, PdfImage | null][];
}

self.onmessage = async (event: MessageEvent<PdfRequest>) => {
  try {
    const { input, images } = event.data;
    const bytes = await buildNotesPdf({ ...input, images: new Map(images) });
    self.postMessage({ blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }) });
  } catch {
    self.postMessage({ failed: true });
  }
};
