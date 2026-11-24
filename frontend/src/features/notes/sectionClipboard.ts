import type { JSONContent } from '@tiptap/react';
import { useSyncExternalStore } from 'react';

/**
 * A project section copied (or cut) with its chip menu, ready for "Paste below" in this note or another one. Kept in
 * this tab's memory only, never in the browser's storage: note text stays on the server. A reload forgets it; the
 * system clipboard (written too) still holds it for Ctrl+V.
 */
export interface CopiedSection {
  /** The section as editor JSON (its project tag and blocks). */
  node: JSONContent;
  /** The note it came from: pasted into another note, its pictures are copied into that note first. */
  noteId: string;
}

let copied: CopiedSection | null = null;
const listeners = new Set<() => void>();

export function keepSection(section: CopiedSection): void {
  copied = section;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The section waiting to be pasted, or null. Every chip menu follows it. */
export const useCopiedSection = () => useSyncExternalStore(subscribe, () => copied);

const ATTACHMENT = /^\/api\/attachments\/([0-9a-f-]{36})$/;

/** The attachment ids of the pictures in a node, each once, in order. */
export function attachmentIdsIn(node: JSONContent): string[] {
  const ids: string[] = [];
  const walk = (n: JSONContent) => {
    const id = n.type === 'image' && typeof n.attrs?.src === 'string' ? ATTACHMENT.exec(n.attrs.src)?.[1] : undefined;
    if (id && !ids.includes(id)) ids.push(id);
    n.content?.forEach(walk);
  };
  walk(node);
  return ids;
}

/** The same node with picture sources moved to other attachments (`renamed`: old id → new id); others unchanged. */
export function withAttachments(node: JSONContent, renamed: ReadonlyMap<string, string>): JSONContent {
  const id = node.type === 'image' && typeof node.attrs?.src === 'string' ? ATTACHMENT.exec(node.attrs.src)?.[1] : undefined;
  const next = id ? renamed.get(id) : undefined;
  return {
    ...node,
    ...(next ? { attrs: { ...node.attrs, src: `/api/attachments/${next}` } } : {}),
    ...(node.content ? { content: node.content.map((child) => withAttachments(child, renamed)) } : {}),
  };
}
