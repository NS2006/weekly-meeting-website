import { Schema, type Node } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import { describe, expect, it } from 'vitest';
import { frozenGuard, keepsFrozen } from './frozenSections';

// The note's shape: top-level blocks or project sections (as NoteDocument and ProjectSection).
const schema = new Schema({
  nodes: {
    doc: { content: '(block | projectSection)+' },
    paragraph: { group: 'block', content: 'text*' },
    projectSection: { content: 'block+', isolating: true, attrs: { projectId: { default: null } } },
    text: {},
  },
});
const p = (text: string) => schema.node('paragraph', null, [schema.text(text)]);
const section = (projectId: string | null, text: string) => schema.node('projectSection', { projectId }, [p(text)]);
const doc = (...nodes: Node[]) => schema.node('doc', null, nodes);
const archived = (id: string) => id === 'vlm';

describe('parts of an archived project', () => {
  const before = doc(section('esl', 'ESL work'), section('vlm', 'VLM done'), p('Other'));

  it('may move, and the rest of the note may change', () => {
    expect(keepsFrozen(before, doc(section('vlm', 'VLM done'), section('esl', 'ESL work, more'), p('Other')), archived)).toBe(true);
  });

  it('may not change, lose their tag, be removed or be added', () => {
    expect(keepsFrozen(before, doc(section('esl', 'ESL work'), section('vlm', 'VLM done!'), p('Other')), archived)).toBe(false);
    expect(keepsFrozen(before, doc(section('esl', 'ESL work'), section(null, 'VLM done'), p('Other')), archived)).toBe(false);
    expect(keepsFrozen(before, doc(section('esl', 'ESL work'), p('Other')), archived)).toBe(false);
    expect(keepsFrozen(before, doc(section('esl', 'ESL work'), section('vlm', 'VLM done'), section('vlm', 'Again')), archived)).toBe(false);
  });

  it('stop an editor change that would touch them', () => {
    const state = EditorState.create({ doc: before, plugins: [frozenGuard(archived)] });
    // Type inside the VLM part: refused, the note stays as it was.
    const insideVlm = before.child(0).nodeSize + 2;
    expect(state.apply(state.tr.insertText('!', insideVlm)).doc.eq(before)).toBe(true);
    // Type inside the ESL part: made.
    expect(state.apply(state.tr.insertText('!', 2)).doc.eq(before)).toBe(false);
  });
});
