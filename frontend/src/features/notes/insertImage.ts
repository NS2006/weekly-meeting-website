import { NodeSelection, TextSelection, type Transaction } from '@tiptap/pm/state';

/**
 * After an image is added it is left selected, so the next image (several picked at once, or one pasted right after)
 * would replace it. This puts the cursor in the paragraph below the selected image instead (adding an empty one when
 * there is none), so images line up in order and writing carries on under them. Returns false when nothing moved.
 */
export function moveBelowSelectedNode(tr: Transaction): boolean {
  const { selection } = tr;
  if (!(selection instanceof NodeSelection)) return false;
  const after = selection.to;
  const $after = tr.doc.resolve(after);
  if (!$after.nodeAfter?.isTextblock) {
    const paragraph = tr.doc.type.schema.nodes.paragraph;
    const index = $after.index();
    if (!paragraph || !$after.parent.canReplaceWith(index, index, paragraph)) return false;
    tr.insert(after, paragraph.create());
  }
  tr.setSelection(TextSelection.create(tr.doc, after + 1));
  return true;
}
