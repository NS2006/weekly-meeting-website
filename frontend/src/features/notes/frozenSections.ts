import type { Node as PmNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';

/**
 * Parts of a note tagged with an archived project are frozen (owner, 2026-11-25: archived means done; its updates stay
 * as they were): they keep their tag and their content, and cannot be removed. They may move within the note. The
 * server checks the same on every save (409 `project_archived`).
 */

/** The note's top-level sections tagged with a frozen project. */
function frozenIn(doc: PmNode, isFrozen: (projectId: string) => boolean): PmNode[] {
  const found: PmNode[] = [];
  doc.forEach((node) => {
    const id: unknown = node.attrs.projectId;
    if (node.type.name === 'projectSection' && typeof id === 'string' && isFrozen(id)) found.push(node);
  });
  return found;
}

/** Whether `after` has exactly the frozen sections of `before`, each unchanged (in any order). */
export function keepsFrozen(before: PmNode, after: PmNode, isFrozen: (projectId: string) => boolean): boolean {
  const old = frozenIn(before, isFrozen);
  const left = frozenIn(after, isFrozen);
  if (left.length !== old.length) return false;
  return old.every((node) => {
    const at = left.findIndex((candidate) => candidate.eq(node));
    if (at < 0) return false;
    left.splice(at, 1);
    return true;
  });
}

/** The editor plugin: a change that would alter, remove or add a frozen section is not made. */
export const frozenGuard = (isFrozen: (projectId: string) => boolean) =>
  new Plugin({
    key: new PluginKey('frozenSections'),
    filterTransaction: (tr, state) => !tr.docChanged || keepsFrozen(state.doc, tr.doc, isFrozen),
  });
