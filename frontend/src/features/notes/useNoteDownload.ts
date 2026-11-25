import type { NoteSummary } from '@weekly-meeting/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiFailure, api } from '../../services/api';
import { noteExport, noteFileName } from './noteExport';

export type DownloadKind = 'docx' | 'pdf';

/** Where a download stands: the file being made, its pictures loaded so far, and (for several notes) which one. */
export interface DownloadProgress {
  kind: DownloadKind;
  done: number;
  total: number;
  /** The note being saved, from 1, and how many there are (several picked on the Notes page). */
  item: number;
  items: number;
}

/**
 * "Download as Word / PDF" from the Notes page: for each note picked, loads the whole note, then the quarter reader's
 * own Word or PDF maker (loaded only when asked for) builds the file in a worker with the note's pictures and
 * downloads it: one file a note, one after the other (the browser may ask once to allow several downloads). One run
 * at a time; leaving the page stops it. The outcome: how many pictures could not be added, or what went wrong.
 */
export function useNoteDownload(writer: { id: string; name: string }) {
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [outcome, setOutcome] = useState<{ missing: number } | { error: string } | null>(null);
  const running = useRef<AbortController | null>(null);
  useEffect(() => () => running.current?.abort(), []);

  const startMany = useCallback(
    async (summaries: readonly NoteSummary[], kind: DownloadKind) => {
      if (running.current || summaries.length === 0) return;
      const controller = new AbortController();
      running.current = controller;
      setOutcome(null);
      const items = summaries.length;
      let missing = 0;
      try {
        for (const [index, summary] of summaries.entries()) {
          if (controller.signal.aborted) return;
          const item = index + 1;
          setProgress({ kind, done: 0, total: 0, item, items });
          const { note } = await api.getNote(summary.id);
          const input = noteExport(note, writer);
          const save = kind === 'docx' ? (await import('../periods/saveAsWord')).saveAsWord : (await import('../periods/saveAsPdf')).saveAsPdf;
          const result = await save(input, noteFileName(note, kind), (done, total) => setProgress({ kind, done, total, item, items }), controller.signal);
          missing += result.missing;
        }
        if (!controller.signal.aborted) setOutcome({ missing });
      } catch (err) {
        if (!controller.signal.aborted) setOutcome({ error: err instanceof ApiFailure ? err.code : 'unknown_error' });
      } finally {
        running.current = null;
        if (!controller.signal.aborted) setProgress(null);
      }
    },
    [writer],
  );

  const start = useCallback((summary: NoteSummary, kind: DownloadKind) => startMany([summary], kind), [startMany]);

  return { progress, outcome, start, startMany, clear: () => setOutcome(null) };
}
