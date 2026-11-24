import { Schema, type Node } from '@tiptap/pm/model';
import { EditorState, NodeSelection, TextSelection } from '@tiptap/pm/state';
import { describe, expect, it } from 'vitest';
import { moveBelowSelectedNode } from './insertImage';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'text*' },
    image: { group: 'block', atom: true, selectable: true, attrs: { src: {} } },
    text: {},
  },
});
const p = (text = '') => schema.node('paragraph', null, text ? [schema.text(text)] : []);
const img = (src: string) => schema.node('image', { src });

/** Adds an image the way the editor does (it replaces the selection and is left selected), then moves below it. */
function addImage(state: EditorState, src: string): EditorState {
  const tr = state.tr.replaceSelectionWith(img(src));
  let at = -1;
  tr.doc.descendants((node, pos) => {
    if (node.type.name === 'image' && node.attrs.src === src) at = pos;
  });
  tr.setSelection(NodeSelection.create(tr.doc, at));
  expect(moveBelowSelectedNode(tr)).toBe(true);
  return state.apply(tr);
}
const shape = (doc: Node) => doc.content.content.map((n) => (n.type.name === 'image' ? `img:${n.attrs.src}` : `p:${n.textContent}`));

describe('moveBelowSelectedNode()', () => {
  it('keeps every image when several are added in a row, with a paragraph below to write in', () => {
    let state = EditorState.create({ schema, doc: schema.node('doc', null, [p()]) });
    state = addImage(state, 'a');
    state = addImage(state, 'b');
    state = addImage(state, 'c');
    expect(shape(state.doc)).toEqual(['img:a', 'img:b', 'img:c', 'p:']);
    expect(state.selection).toBeInstanceOf(TextSelection);
    expect(state.selection.$from.parent.type.name).toBe('paragraph');
  });

  it('moves into the paragraph that already follows, without adding one', () => {
    const doc = schema.node('doc', null, [img('a'), p('after')]);
    const state = EditorState.create({ schema, doc, selection: NodeSelection.create(doc, 0) });
    const tr = state.tr;
    expect(moveBelowSelectedNode(tr)).toBe(true);
    expect(shape(tr.doc)).toEqual(['img:a', 'p:after']);
    expect(tr.selection.from).toBe(2); // the start of "after"
  });

  it('does nothing when no image is selected', () => {
    const doc = schema.node('doc', null, [p('text')]);
    const tr = EditorState.create({ schema, doc }).tr;
    expect(moveBelowSelectedNode(tr)).toBe(false);
    expect(tr.docChanged).toBe(false);
  });
});
