import type { EditorDoc, UpdateNoteRequest } from '@weekly-meeting/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiFailure } from '../../services/api';
import { Autosaver, type AutosaveState } from './autosave';

const doc = (text: string): EditorDoc => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });

function setup(save: (body: UpdateNoteRequest) => Promise<{ id: string; version: number; updatedAt: string }>) {
  const current = { title: 'T', content: doc('a') };
  const states: AutosaveState['status'][] = [];
  const saver = new Autosaver({
    version: 1,
    savedAt: null,
    read: () => current,
    save,
    onState: (state) => states.push(state.status),
    delayMs: 1500,
    retryMs: 5000,
  });
  return { saver, current, states };
}

const ok = (version: number) => ({ id: '1', version, updatedAt: `2026-11-20T00:00:0${version}Z` });

describe('Autosaver', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('saves once, 1.5 s after the last change, with only the changed fields and the current version', async () => {
    const save = vi.fn(async (body: UpdateNoteRequest) => ok(body.version + 1));
    const { saver, current, states } = setup(save);
    saver.change('content');
    await vi.advanceTimersByTimeAsync(1000);
    current.content = doc('ab');
    saver.change('content');
    await vi.advanceTimersByTimeAsync(1499);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenLastCalledWith({ version: 1, content: doc('ab') });

    saver.change('title');
    await vi.advanceTimersByTimeAsync(1500);
    expect(save).toHaveBeenLastCalledWith({ version: 2, title: 'T' });
    expect(states).toEqual(['unsaved', 'saving', 'saved', 'unsaved', 'saving', 'saved']);
    expect(saver.hasUnsavedChanges).toBe(false);
  });

  it('never runs two saves at once: changes during a save go in the next one', async () => {
    let finish: () => void = () => undefined;
    const save = vi.fn(
      (body: UpdateNoteRequest) =>
        new Promise<ReturnType<typeof ok>>((resolve) => {
          finish = () => resolve(ok(body.version + 1));
        }),
    );
    const { saver } = setup(save);
    saver.change('content');
    void saver.flush();
    saver.change('title');
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(1500);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith({ version: 2, title: 'T' });
  });

  it('leaving during a save still sends what was typed meanwhile, then stops', async () => {
    let finish: () => void = () => undefined;
    const save = vi.fn(
      (body: UpdateNoteRequest) =>
        new Promise<ReturnType<typeof ok>>((resolve) => {
          finish = () => resolve(ok(body.version + 1));
        }),
    );
    const { saver } = setup(save);
    saver.change('content');
    void saver.flush();
    saver.change('title');
    const left = saver.flush(); // the page is left
    saver.dispose();
    finish();
    await vi.advanceTimersByTimeAsync(0);
    finish();
    await left;
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith({ version: 2, title: 'T' });
    saver.change('content'); // after dispose: ignored
    await vi.advanceTimersByTimeAsync(10_000);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('discards pending changes when the note is deleted', async () => {
    const save = vi.fn(async () => ok(2));
    const { saver } = setup(save);
    saver.change('content');
    saver.discard();
    await saver.flush();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(save).not.toHaveBeenCalled();
  });

  it('retries network failures by itself, keeping the changes', async () => {
    const save = vi.fn().mockRejectedValueOnce(new ApiFailure(0, 'network_error')).mockResolvedValue(ok(2));
    const { saver, states } = setup(save);
    saver.change('content');
    await saver.flush();
    expect(states.at(-1)).toBe('retrying');
    expect(saver.hasUnsavedChanges).toBe(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(2);
    expect(states.at(-1)).toBe('saved');
  });

  it('stops on a version conflict until the person keeps their version', async () => {
    const save = vi.fn().mockRejectedValueOnce(new ApiFailure(409, 'version_conflict')).mockResolvedValue(ok(8));
    const { saver, states } = setup(save);
    saver.change('content');
    await saver.flush();
    expect(states.at(-1)).toBe('conflict');
    saver.change('content');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(save).toHaveBeenCalledTimes(1); // nothing is overwritten by itself

    await saver.overwriteFrom(7);
    expect(save).toHaveBeenLastCalledWith({ version: 7, title: 'T', content: doc('a') });
    expect(states.at(-1)).toBe('saved');
  });

  it('stops for good on a refusal a retry cannot fix', async () => {
    const save = vi.fn().mockRejectedValue(new ApiFailure(409, 'project_archived'));
    const { saver, states } = setup(save);
    saver.change('title');
    await saver.flush();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(states.at(-1)).toBe('stopped');
  });
});
