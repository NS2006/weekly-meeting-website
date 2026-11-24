import { Schema, type Node } from '@tiptap/pm/model';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { describe, expect, it } from 'vitest';
import { emptySectionToDelete, isEmptySection, removeProjectBlock } from './sectionCommands';

// The note's shape: top-level blocks or project sections (as NoteDocument and ProjectSection).
const schema = new Schema({
  nodes: {
    doc: { content: '(block | projectSection)+' },
    paragraph: { group: 'block', content: 'text*' },
    image: { group: 'block', atom: true, attrs: { src: {} } },
    projectSection: { content: 'block+', isolating: true, attrs: { projectId: { default: null } } },
    text: {},
  },
});
const p = (text = '') => schema.node('paragraph', null, text ? [schema.text(text)] : []);
const section = (...blocks: Node[]) => schema.node('projectSection', { projectId: 'x' }, blocks);
const doc = (...nodes: Node[]) => schema.node('doc', null, nodes);
const shape = (d: Node) =>
  d.content.content.map((n) => (n.type.name === 'projectSection' ? `[${n.content.content.map((c) => c.textContent || c.type.name).join('|')}]` : n.textContent || n.type.name));
/** Position of the n-th top-level node. */
const at = (d: Node, index: number) => {
  let pos = 0;
  for (let i = 0; i < index; i++) pos += d.child(i).nodeSize;
  return pos;
};

describe('isEmptySection()', () => {
  it('counts text, images and dividers as written; blank lines are not', () => {
    expect(isEmptySection(section(p(), p('  ')))).toBe(true);
    expect(isEmptySection(section(p('Done')))).toBe(false);
    expect(isEmptySection(section(schema.node('image', { src: '/api/attachments/1' })))).toBe(false);
  });
});

describe('removeProjectBlock() (the × button)', () => {
  it('deletes an empty block and puts the cursor at the end of the line above', () => {
    const d = doc(p('Intro'), section(p()), p('After'));
    const tr = EditorState.create({ schema, doc: d }).tr;
    expect(removeProjectBlock(tr, at(d, 1))).toBe('deleted');
    expect(shape(tr.doc)).toEqual(['Intro', 'After']);
    expect(tr.selection.$from.parent.textContent).toBe('Intro');
    expect(tr.selection.$from.parentOffset).toBe(5);
  });

  it('keeps the text of a block with something in it, without the box', () => {
    const d = doc(section(p('Done'), p('Next')), p('After'));
    const tr = EditorState.create({ schema, doc: d }).tr;
    expect(removeProjectBlock(tr, 0)).toBe('unwrapped');
    expect(shape(tr.doc)).toEqual(['Done', 'Next', 'After']);
  });

  it('leaves one empty line when the empty block was all there was', () => {
    const d = doc(section(p()));
    const tr = EditorState.create({ schema, doc: d }).tr;
    expect(removeProjectBlock(tr, 0)).toBe('deleted');
    expect(tr.doc.childCount).toBe(1);
    expect(tr.doc.child(0).type.name).toBe('paragraph');
  });

  it('does nothing at a position that is not a project block', () => {
    const d = doc(p('Text'));
    expect(removeProjectBlock(EditorState.create({ schema, doc: d }).tr, 0)).toBeNull();
  });
});

describe('emptySectionToDelete() (Backspace)', () => {
  const stateWithCursor = (d: Node, pos: number) => EditorState.create({ schema, doc: d, selection: TextSelection.create(d, pos) });

  it('finds the empty block when the cursor is at its very start', () => {
    const d = doc(p('Intro'), section(p()), section(p('Kept')));
    const start = at(d, 1) + 2; // inside the section's first line
    expect(emptySectionToDelete(stateWithCursor(d, start))).toBe(at(d, 1));
  });

  it('leaves Backspace alone in a block with text, further into a line, or on a later line', () => {
    const d = doc(section(p('Done')), section(p(), p()));
    expect(emptySectionToDelete(stateWithCursor(d, 2))).toBeNull(); // has text
    expect(emptySectionToDelete(stateWithCursor(d, 4))).toBeNull(); // not at the start of the line
    const second = at(d, 1) + 1 + p().nodeSize + 1; // the second empty line of the empty block
    expect(emptySectionToDelete(stateWithCursor(d, second))).toBeNull();
    expect(emptySectionToDelete(stateWithCursor(doc(p('Plain')), 1))).toBeNull(); // outside any block
  });
});
