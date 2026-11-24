import { Packer } from 'docx';
import { buildNotesDocument, type DocxImage, type NotesExport } from './notesDocx';

/**
 * Builds and packs the Word file away from the page: zipping a quarter's pictures (up to ~90 MB) takes seconds, and
 * on the page's own thread it would freeze it. Gets the notes and the loaded pictures, answers with the file.
 */
export interface PackRequest {
  input: Omit<NotesExport, 'images'>;
  images: [string, DocxImage | null][];
}

self.onmessage = async (event: MessageEvent<PackRequest>) => {
  try {
    const { input, images } = event.data;
    const blob = await Packer.toBlob(buildNotesDocument({ ...input, images: new Map(images) }));
    self.postMessage({ blob });
  } catch {
    self.postMessage({ failed: true });
  }
};
