/**
 * Builders for editor documents (the Tiptap JSON the notes store), shaped exactly as the editor writes them, so the
 * seeded notes open in the editor unchanged and pass the server's schema check (modules/notes/content.ts).
 */
import type { EditorMark, EditorNode } from '@weekly-meeting/shared';

export type Inline = EditorNode;
export type Block = EditorNode;
type InlineInput = string | Inline;

/** Text colors from the editor's palette (frontend/src/features/notes/palette.ts). */
export const TEXT_COLOR = {
  gray: '#6c757d',
  blue: '#0095da',
  darkBlue: '#006494',
  red: '#e53935',
  green: '#2e7d32',
  amber: '#f9a825',
} as const;

const marked = (text: string, marks: EditorMark[]): Inline => ({ type: 'text', text, marks });
const toInline = (value: InlineInput): Inline => (typeof value === 'string' ? { type: 'text', text: value } : value);

export const bold = (text: string): Inline => marked(text, [{ type: 'bold' }]);
export const italic = (text: string): Inline => marked(text, [{ type: 'italic' }]);
export const underline = (text: string): Inline => marked(text, [{ type: 'underline' }]);
export const strike = (text: string): Inline => marked(text, [{ type: 'strike' }]);
export const code = (text: string): Inline => marked(text, [{ type: 'code' }]);
export const link = (text: string, href: string): Inline => marked(text, [{ type: 'link', attrs: { href } }]);
export const colored = (text: string, color: string, alsoBold = false): Inline =>
  marked(text, [...(alsoBold ? [{ type: 'bold' }] : []), { type: 'textStyle', attrs: { color } }]);

/** A paragraph; empty when nothing is given (the editor writes no `content` key then). */
export function paragraph(...inlines: InlineInput[]): Block {
  const content = inlines.filter((part) => part !== '').map(toInline);
  return content.length > 0 ? { type: 'paragraph', content } : { type: 'paragraph' };
}

export function aligned(align: 'center' | 'right', ...inlines: InlineInput[]): Block {
  return { ...paragraph(...inlines), attrs: { textAlign: align } };
}

export function heading(level: 1 | 2 | 3, text: string, align?: 'center'): Block {
  return { type: 'heading', attrs: align ? { level, textAlign: align } : { level }, content: [{ type: 'text', text }] };
}

/** List items: plain text or a run of inlines, each one paragraph. */
type Item = InlineInput | InlineInput[];
const listItem = (item: Item): Block => ({
  type: 'listItem',
  content: [paragraph(...(Array.isArray(item) ? item : [item]))],
});

export const bulletList = (...items: Item[]): Block => ({ type: 'bulletList', content: items.map(listItem) });
export const orderedList = (...items: Item[]): Block => ({
  type: 'orderedList',
  attrs: { start: 1 },
  content: items.map(listItem),
});

export const quote = (...blocks: Block[]): Block => ({ type: 'blockquote', content: blocks });

export const codeBlock = (language: string, text: string): Block => ({
  type: 'codeBlock',
  attrs: { language },
  content: [{ type: 'text', text }],
});

export const divider = (): Block => ({ type: 'horizontalRule' });

/** A table with a header row; each cell is plain text or a run of inlines. */
export function table(header: string[], rows: Item[][]): Block {
  const cell = (type: 'tableHeader' | 'tableCell', item: Item): Block => ({
    type,
    attrs: { colspan: 1, rowspan: 1 },
    content: [paragraph(...(Array.isArray(item) ? item : [item]))],
  });
  return {
    type: 'table',
    content: [
      { type: 'tableRow', content: header.map((text) => cell('tableHeader', text)) },
      ...rows.map((row) => ({ type: 'tableRow', content: row.map((item) => cell('tableCell', item)) })),
    ],
  };
}

/** An uploaded image: `/api/attachments/<id>`, optionally resized to `width` pixels. */
export function image(attachmentId: string, alt: string, width?: number): Block {
  return {
    type: 'image',
    attrs: { src: `/api/attachments/${attachmentId}`, alt, ...(width ? { width } : {}) },
  };
}

/** A project section: these blocks show on that project's page (an untagged section when projectId is null). */
export function section(projectId: string | null, blocks: Block[]): Block {
  return { type: 'projectSection', ...(projectId ? { attrs: { projectId } } : {}), content: blocks };
}
