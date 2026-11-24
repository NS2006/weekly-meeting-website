import type { Node as PmNode } from '@tiptap/pm/model';
import { Selection, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';

const SECTION = 'projectSection';

/**
 * Whether a project block holds nothing written: no text, image or divider (empty lines, or an empty list or table,
 * do not count). The same rule as the server's hasContent.
 */
export function isEmptySection(section: PmNode): boolean {
  let filled = false;
  section.descendants((node) => {
    if (filled) return false;
    if (node.type.name === 'image' || node.type.name === 'horizontalRule' || (node.isText && (node.text ?? '').trim() !== '')) filled = true;
    return !filled;
  });
  return !filled;
}

/**
 * The block's × button: an empty block is deleted; a block with something in it loses only its box and project tag,
 * its text staying where it is. Returns what happened.
 */
export function removeProjectBlock(tr: Transaction, pos: number): 'deleted' | 'unwrapped' | null {
  const section = tr.doc.nodeAt(pos);
  if (!section || section.type.name !== SECTION) return null;
  if (isEmptySection(section)) {
    deleteSection(tr, pos, section);
    return 'deleted';
  }
  tr.replaceWith(pos, pos + section.nodeSize, section.content);
  tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 1)));
  return 'unwrapped';
}

/**
 * Backspace at the very start of an empty project block deletes the block (the way it leaves an empty list): the
 * position of that block, or null when Backspace should do what it always does.
 */
export function emptySectionToDelete(state: EditorState): number | null {
  const { $from, empty } = state.selection;
  if (!empty || $from.depth !== 2 || $from.parentOffset !== 0 || $from.index(1) !== 0) return null;
  const section = $from.node(1);
  if (section.type.name !== SECTION || !isEmptySection(section)) return null;
  return $from.before(1);
}

/** Deletes the block; the cursor goes to the end of what is above it (or the start of what is below). */
export function deleteSection(tr: Transaction, pos: number, section: PmNode): void {
  const paragraph = tr.doc.type.schema.nodes.paragraph;
  if (tr.doc.childCount === 1 && paragraph) {
    // A note keeps at least one line to write in.
    tr.replaceWith(pos, pos + section.nodeSize, paragraph.create());
    tr.setSelection(TextSelection.create(tr.doc, pos + 1));
    return;
  }
  tr.delete(pos, pos + section.nodeSize);
  tr.setSelection(Selection.near(tr.doc.resolve(Math.min(pos, tr.doc.content.size)), -1));
}
