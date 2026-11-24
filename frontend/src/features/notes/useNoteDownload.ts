import type { NoteSummary } from '@weekly-meeting/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiFailure, api } from '../../services/api';
import { noteExport, noteFileName } from './noteExport';

export type DownloadKind = 'docx' | 'pdf';

/** Where a download stands: the file being made, and its pictures loaded so far. */
export interface DownloadProgress {
  kind: DownloadKind;
  done: number;
  total: number;
}

/**
 * "Download as Word / PDF" from the Notes page: loads the whole note, then the quarter reader's own Word or PDF maker
 * (loaded only when asked for) builds the file in a worker with the note's pictures and downloads it. One at a time;
 * leaving the page stops it. The outcome: how many pictures could not be added, or what went wrong.
 */
export function useNoteDownload(writer: { id: string; name: string }) {
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [outcome, setOutcome] = useState<{ missing: number } | { error: string } | null>(null);
  const running = useRef<AbortController | null>(null);
  useEffect(() => () => running.current?.abort(), []);

  const start = useCallback(
    async (summary: NoteSummary, kind: DownloadKind) => {
      if (running.current) return;
      const controller = new AbortController();
      running.current = controller;
      setOutcome(null);
      setProgress({ kind, done: 0, total: 0 });
      try {
        const { note } = await api.getNote(summary.id);
        const input = noteExport(note, writer);
        const save = kind === 'docx' ? (await import('../periods/saveAsWord')).saveAsWord : (await import('../periods/saveAsPdf')).saveAsPdf;
        const { missing } = await save(input, noteFileName(note, kind), (done, total) => setProgress({ kind, done, total }), controller.signal);
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

  return { progress, outcome, start, clear: () => setOutcome(null) };
}
