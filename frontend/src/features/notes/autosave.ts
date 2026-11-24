import type { EditorDoc, NoteSavedResponse, UpdateNoteRequest } from '@weekly-meeting/shared';
import { ApiFailure } from '../../services/api';

/**
 * - saved: everything typed is on the server.
 * - unsaved: changes wait for the pause in typing (or for the save in progress to finish).
 * - saving: a save is on its way.
 * - retrying: the last save failed for a reason that may pass (network, server); it is tried again by itself.
 * - conflict: the note was saved elsewhere (another tab) since this one loaded it. Nothing is saved until the person
 *   chooses (reload the other version, or keep this one).
 * - stopped: a save was refused for good (the project was archived, the note deleted, the session ended).
 */
export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'retrying' | 'conflict' | 'stopped';

export interface AutosaveState {
  status: SaveStatus;
  /** When the server last saved this note. */
  savedAt: string | null;
  /** The API error code of the last failed save. */
  errorCode: string | null;
}

type Field = 'title' | 'content';

export interface AutosaverOptions {
  /** The version the note was loaded with. */
  version: number;
  savedAt: string | null;
  /** The current title and content, read when a save starts (not on every keystroke). */
  read: () => { title: string; content: EditorDoc };
  save: (body: UpdateNoteRequest) => Promise<NoteSavedResponse['note']>;
  onState: (state: AutosaveState) => void;
  /** Wait after the last change before saving (PRD 8.2: 1.5 s). */
  delayMs?: number;
  retryMs?: number;
}

/** Errors a retry can fix by itself; anything else stops autosaving until the person acts. */
const PASSING = new Set(['network_error', 'internal_error', 'unknown_error', 'request_aborted']);

/**
 * Saves a note shortly after the person stops typing: one save at a time, only the fields that changed, each with
 * the version from the previous save (optimistic locking: the server answers 409 `version_conflict` instead of
 * overwriting someone else's save). Changes made while a save is running go in the next one.
 */
export class Autosaver {
  private readonly options: Required<AutosaverOptions>;
  private readonly dirty = new Set<Field>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<void> | null = null;
  private halted = false;
  private disposed = false;
  private state: AutosaveState;
  version: number;

  constructor(options: AutosaverOptions) {
    this.options = { delayMs: 1500, retryMs: 5000, ...options };
    this.version = options.version;
    this.state = { status: 'saved', savedAt: options.savedAt, errorCode: null };
  }

  /** True while something typed is not on the server yet (to warn before the page closes). */
  get hasUnsavedChanges(): boolean {
    return this.dirty.size > 0 || this.running !== null;
  }

  get status(): SaveStatus {
    return this.state.status;
  }

  change(field: Field): void {
    if (this.disposed) return;
    this.dirty.add(field);
    if (this.halted) return; // kept for "keep mine", but not saved until then
    if (!this.running) this.set({ status: 'unsaved' });
    this.schedule(this.options.delayMs);
  }

  /** Saves now (the page is hidden or left). Resolves when everything changed so far was tried. */
  flush(): Promise<void> {
    this.clearTimer();
    if (this.running) return this.running.then(() => this.flush());
    // Not stopped by dispose(): leaving the page flushes, then disposes, and a save still running must be followed
    // by one with the changes typed meanwhile.
    if (this.dirty.size === 0 || this.halted) return Promise.resolve();
    this.running = this.run().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  /** After a conflict, "keep mine": continue from the server's latest version, saving everything shown here. */
  overwriteFrom(version: number): Promise<void> {
    this.version = version;
    this.halted = false;
    this.dirty.add('title');
    this.dirty.add('content');
    return this.flush();
  }

  /** Stops timers, retries and state reports. Call flush() first to send what is pending. */
  dispose(): void {
    this.disposed = true;
    this.clearTimer();
  }

  /** Drops pending changes and stops for good (the note was deleted). */
  discard(): void {
    this.dirty.clear();
    this.halted = true;
    this.dispose();
  }

  private async run(): Promise<void> {
    const fields = [...this.dirty];
    this.dirty.clear();
    const snapshot = this.options.read();
    const body: UpdateNoteRequest = { version: this.version };
    if (fields.includes('title')) body.title = snapshot.title;
    if (fields.includes('content')) body.content = snapshot.content;
    this.set({ status: 'saving' });
    try {
      const saved = await this.options.save(body);
      this.version = saved.version;
      this.set({ status: this.dirty.size > 0 ? 'unsaved' : 'saved', savedAt: saved.updatedAt, errorCode: null });
      if (this.dirty.size > 0) this.schedule(this.options.delayMs);
    } catch (err) {
      for (const field of fields) this.dirty.add(field);
      const code = err instanceof ApiFailure ? err.code : 'unknown_error';
      if (code === 'version_conflict') {
        this.halted = true;
        this.set({ status: 'conflict', errorCode: code });
      } else if (PASSING.has(code)) {
        this.set({ status: 'retrying', errorCode: code });
        this.schedule(this.options.retryMs);
      } else {
        this.halted = true;
        this.set({ status: 'stopped', errorCode: code });
      }
    }
  }

  private schedule(ms: number): void {
    if (this.disposed) return;
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, ms);
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Reports only real changes (not one per keystroke). */
  private set(next: Partial<AutosaveState>): void {
    const state = { ...this.state, ...next };
    const same = (Object.keys(state) as (keyof AutosaveState)[]).every((key) => state[key] === this.state[key]);
    this.state = state;
    if (!same && !this.disposed) this.options.onState(state);
  }
}
