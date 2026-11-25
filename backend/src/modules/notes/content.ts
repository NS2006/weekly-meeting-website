import type { EditorDoc, EditorMark, EditorNode } from '@weekly-meeting/shared';
import { idSchema, UUID } from '../../utils/ids.ts';

/**
 * The editor schema on the server (PRD section 4, Security): a note's content is the editor's JSON document, checked
 * here before it is stored. It mirrors the Tiptap extensions the frontend loads (StarterKit without the extras we do
 * not offer, TableKit, Image, TextAlign, TextStyle + Color, and our own ProjectSection).
 *
 * A project section ({ type: 'projectSection', attrs: { projectId } }) tags the blocks inside it with one of the
 * owner's projects. Sections sit only at the top level of the document (never inside a list, table or each other);
 * everything outside them is general text that stays in the note.
 *
 * - A node or mark type the editor does not have, a child where the schema does not allow it, an image that is not
 *   one of our attachments, or a document that is too deep or too large is refused (the editor never produces them).
 * - Attribute values that are not valid are dropped (the editor falls back to the default), and so are attributes
 *   the editor does not know; a link with a disallowed address or a color that is not a color loses that mark only.
 * - Everything else is copied into a new object, so nothing unexpected (extra keys, prototypes) is ever stored.
 */

export const MAX_DEPTH = 40;
export const MAX_NODES = 50_000;
/**
 * At most this many project parts in one note (stress-test review, 2026-11-25: each is a row rewritten on save; a
 * real note has a few, the team's busiest about ten).
 */
export const MAX_SECTIONS = 200;
const MAX_TEXT = 1_000_000;

/** Image sources: our own attachment route only (no external images, no data: URLs). */
export const ATTACHMENT_SRC = new RegExp(`^/api/attachments/(${UUID})$`);

type AttrRule = (value: unknown) => unknown;
type Path = (string | number)[];

const ALIGNMENTS = new Set(['left', 'center', 'right', 'justify']);
const CELL_ALIGNMENTS = new Set(['left', 'center', 'right']);

const oneOf =
  (allowed: ReadonlySet<unknown>): AttrRule =>
  (value) =>
    allowed.has(value) ? value : undefined;
const int =
  (min: number, max: number): AttrRule =>
  (value) =>
    typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : undefined;
const text =
  (max: number): AttrRule =>
  (value) =>
    typeof value === 'string' && value.length <= max ? value : undefined;

/** Pixels; resizing an image can give fractions, which are rounded. */
const pixels: AttrRule = (value) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 10_000 ? Math.round(value) : undefined;

const textAlign = oneOf(ALIGNMENTS);
const span = int(1, 100);
const cellAttrs: Record<string, AttrRule> = {
  colspan: span,
  rowspan: span,
  // One width per spanned column (pixels), or null for "auto".
  colwidth: (value) =>
    Array.isArray(value) && value.length <= 100 && value.every((w) => w === null || int(1, 5000)(w) !== undefined)
      ? [...(value as (number | null)[])]
      : undefined,
  align: oneOf(CELL_ALIGNMENTS),
};

/** 'docBlock': the blocks allowed at the top of the document (any block, or a project section). */
type Children = 'docBlock' | 'block' | 'inline' | 'text' | ReadonlySet<string> | null;

interface NodeRule {
  children: Children;
  /** At least one child ("block+" in the editor schema). */
  required?: boolean;
  /** The first child must be this type ("paragraph block*"). */
  first?: string;
  attrs?: Record<string, AttrRule>;
}

const BLOCK = new Set(['paragraph', 'heading', 'bulletList', 'orderedList', 'blockquote', 'codeBlock', 'horizontalRule', 'table', 'image']);
const INLINE = new Set(['text', 'hardBreak']);

/** A project id: a UUID, or the attribute is dropped (the section is untagged). */
const projectId: AttrRule = (value) => {
  const parsed = idSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
};

const NODES: Record<string, NodeRule> = {
  doc: { children: 'docBlock', required: true },
  projectSection: { children: 'block', required: true, attrs: { projectId } },
  paragraph: { children: 'inline', attrs: { textAlign } },
  heading: { children: 'inline', attrs: { level: oneOf(new Set([1, 2, 3])), textAlign } },
  bulletList: { children: new Set(['listItem']), required: true },
  orderedList: {
    children: new Set(['listItem']),
    required: true,
    attrs: { start: int(0, 100_000), type: oneOf(new Set(['1', 'a', 'A', 'i', 'I'])) },
  },
  listItem: { children: 'block', required: true, first: 'paragraph' },
  blockquote: { children: 'block', required: true },
  codeBlock: { children: 'text', attrs: { language: (v) => (typeof v === 'string' && /^[\w+#.-]{1,40}$/.test(v) ? v : undefined) } },
  horizontalRule: { children: null },
  hardBreak: { children: null },
  table: { children: new Set(['tableRow']), required: true },
  tableRow: { children: new Set(['tableCell', 'tableHeader']), required: true },
  tableCell: { children: 'block', required: true, attrs: cellAttrs },
  tableHeader: { children: 'block', required: true, attrs: cellAttrs },
  image: {
    children: null,
    attrs: { src: text(60), alt: text(500), title: text(500), width: pixels, height: pixels },
  },
};

/** "#abc", "#AABBCC" or "rgb(1, 2, 3)" (what pasting from Word gives) as "#aabbcc"; anything else is not a color. */
export function normalizeColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const v = value.trim().toLowerCase();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  const rgb = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(v);
  if (!rgb) return undefined;
  const channels = rgb.slice(1, 4).map(Number);
  if (channels.some((c) => c > 255)) return undefined;
  return `#${channels.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** Links open web pages or write an email: http, https and mailto only (never javascript:, data: …). */
export function safeHref(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const href = value.trim();
  if (href.length === 0 || href.length > 2000) return undefined;
  try {
    const { protocol } = new URL(href);
    return protocol === 'http:' || protocol === 'https:' || protocol === 'mailto:' ? href : undefined;
  } catch {
    return undefined;
  }
}

/** Marks that carry no attributes, and the two that need one valid attribute (or are dropped). */
const PLAIN_MARKS = new Set(['bold', 'italic', 'underline', 'strike', 'code']);
const MARKS_WITH_ATTRS: Record<string, { attr: string; clean: (value: unknown) => string | undefined }> = {
  link: { attr: 'href', clean: safeHref },
  textStyle: { attr: 'color', clean: normalizeColor },
};

export type SanitizeResult = { ok: true; doc: EditorDoc; text: string } | { ok: false; path: Path; reason: string };

class Refused extends Error {
  readonly path: Path;

  constructor(path: Path, reason: string) {
    super(reason);
    this.path = path;
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Checks and copies an editor document; on success also returns its plain text (for search and snippets). */
export function sanitizeDoc(input: unknown): SanitizeResult {
  let nodes = 0;
  let textLength = 0;

  function marksOf(raw: unknown, path: Path): EditorMark[] | undefined {
    if (raw === undefined) return undefined;
    if (!Array.isArray(raw) || raw.length > 20) throw new Refused(path, 'marks must be a short list');
    const marks: EditorMark[] = [];
    const seen = new Set<string>();
    raw.forEach((mark, i) => {
      if (!isObject(mark) || typeof mark.type !== 'string') throw new Refused([...path, i], 'mark without a type');
      if (seen.has(mark.type)) return;
      if (PLAIN_MARKS.has(mark.type)) {
        seen.add(mark.type);
        marks.push({ type: mark.type });
        return;
      }
      const rule = MARKS_WITH_ATTRS[mark.type];
      if (!rule) throw new Refused([...path, i], 'unknown mark');
      const value = rule.clean(isObject(mark.attrs) ? mark.attrs[rule.attr] : undefined);
      if (value === undefined) return; // a bad link or color: keep the text, drop the mark
      seen.add(mark.type);
      marks.push({ type: mark.type, attrs: { [rule.attr]: value } });
    });
    return marks.length > 0 ? marks : undefined;
  }

  function allowed(children: Children, type: string): boolean {
    if (children === 'docBlock') return BLOCK.has(type) || type === 'projectSection';
    if (children === 'block') return BLOCK.has(type);
    if (children === 'inline') return INLINE.has(type);
    if (children === 'text') return type === 'text';
    return children !== null && children.has(type);
  }

  function node(raw: unknown, path: Path, depth: number, parent: Children, inCode: boolean): EditorNode {
    nodes += 1;
    if (nodes > MAX_NODES) throw new Refused(path, 'too many nodes');
    if (depth > MAX_DEPTH) throw new Refused(path, 'nested too deep');
    if (!isObject(raw) || typeof raw.type !== 'string') throw new Refused(path, 'node without a type');
    const { type } = raw;
    if (parent !== null && !allowed(parent, type)) throw new Refused(path, 'node not allowed here');

    if (type === 'text') {
      if (typeof raw.text !== 'string' || raw.text.length === 0) throw new Refused(path, 'empty text');
      textLength += raw.text.length;
      if (textLength > MAX_TEXT) throw new Refused(path, 'too much text');
      // Code blocks hold plain text: marks inside them are dropped.
      const marks = inCode ? undefined : marksOf(raw.marks, [...path, 'marks']);
      return marks ? { type, text: raw.text, marks } : { type, text: raw.text };
    }

    const rule = NODES[type];
    if (!rule || type === 'doc') throw new Refused(path, 'unknown node');
    return element(raw, type, rule, path, depth);
  }

  function element(raw: Record<string, unknown>, type: string, rule: NodeRule, path: Path, depth: number): EditorNode {
    const out: EditorNode = { type };

    if (rule.attrs) {
      const source = isObject(raw.attrs) ? raw.attrs : {};
      const attrs: Record<string, unknown> = {};
      for (const [name, clean] of Object.entries(rule.attrs)) {
        const value = clean(source[name]);
        if (value !== undefined) attrs[name] = value;
      }
      if (type === 'image') {
        if (typeof attrs.src !== 'string' || !ATTACHMENT_SRC.test(attrs.src)) throw new Refused(path, 'image source');
      }
      if (Object.keys(attrs).length > 0) out.attrs = attrs;
    }

    const rawChildren = raw.content;
    if (rule.children === null) {
      if (rawChildren !== undefined && !(Array.isArray(rawChildren) && rawChildren.length === 0)) {
        throw new Refused(path, 'leaf node with content');
      }
      return out;
    }
    if (rawChildren !== undefined && !Array.isArray(rawChildren)) throw new Refused(path, 'content must be a list');
    const children = (rawChildren ?? []).map((child, i) =>
      node(child, [...path, 'content', i], depth + 1, rule.children, type === 'codeBlock'),
    );
    if (rule.required && children.length === 0) throw new Refused(path, 'needs content');
    if (rule.first && children[0]?.type !== rule.first) throw new Refused(path, `must start with ${rule.first}`);
    if (children.length > 0) out.content = children;
    return out;
  }

  try {
    if (!isObject(input) || input.type !== 'doc') throw new Refused([], 'not a document');
    const doc = element(input, 'doc', NODES.doc as NodeRule, [], 0) as EditorDoc;
    if ((doc.content ?? []).filter((n) => n.type === 'projectSection').length > MAX_SECTIONS) {
      throw new Refused(['content'], 'too many project sections');
    }
    return { ok: true, doc, text: plainText(doc) };
  } catch (err) {
    if (err instanceof Refused) return { ok: false, path: err.path, reason: err.message };
    throw err;
  }
}

const TEXTBLOCKS = new Set(['paragraph', 'heading', 'codeBlock']);

/** The note's text, one line per paragraph, heading or code line (for full-text search and list snippets). */
export function plainText(doc: EditorNode): string {
  const lines: string[] = [];
  const inline = (n: EditorNode): string =>
    n.type === 'text' ? (n.text ?? '') : n.type === 'hardBreak' ? '\n' : (n.content ?? []).map(inline).join('');
  const walk = (n: EditorNode) => {
    if (TEXTBLOCKS.has(n.type)) lines.push(...inline(n).split('\n'));
    else for (const child of n.content ?? []) walk(child);
  };
  walk(doc);
  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

/** Whether anything is written: some text, an image or a divider (empty lines, lists or tables alone do not count). */
export function hasContent(doc: EditorNode): boolean {
  const filled = (n: EditorNode): boolean =>
    n.type === 'image' || n.type === 'horizontalRule' || (n.type === 'text' && (n.text ?? '').trim() !== '') || (n.content ?? []).some(filled);
  return filled(doc);
}

/** A new note: one empty paragraph. */
export const EMPTY_DOC: EditorDoc = { type: 'doc', content: [{ type: 'paragraph' }] };

/** A new note started from a project page: one section for that project, with an empty paragraph to write in. */
export const sectionDoc = (forProject: string): EditorDoc => ({
  type: 'doc',
  content: [{ type: 'projectSection', attrs: { projectId: forProject }, content: [{ type: 'paragraph' }] }],
});

export interface ProjectSection {
  /** Order among the note's sections (0, 1, …), tagged or not. */
  position: number;
  projectId: string | null;
  /** The section's blocks as a document of their own (what the project page shows). */
  content: EditorDoc;
  text: string;
}

/** The project sections of a (sanitized) document, in order. */
export function projectSections(doc: EditorDoc): ProjectSection[] {
  return (doc.content ?? [])
    .filter((n) => n.type === 'projectSection')
    .map((n, position) => {
      const content: EditorDoc = { type: 'doc', content: n.content ?? [] };
      const id = n.attrs?.projectId;
      return { position, projectId: typeof id === 'string' ? id : null, content, text: plainText(content) };
    });
}

/**
 * The same document with project tags limited to `allowed` (the owner's projects they may tag): any other project id
 * is removed, which leaves that section untagged with its text intact.
 */
export function limitProjects(doc: EditorDoc, allowed: ReadonlySet<string>): EditorDoc {
  return {
    ...doc,
    content: (doc.content ?? []).map((n) => {
      const id = n.attrs?.projectId;
      if (n.type !== 'projectSection' || typeof id !== 'string' || allowed.has(id)) return n;
      const { projectId: _dropped, ...rest } = n.attrs ?? {};
      return Object.keys(rest).length > 0 ? { ...n, attrs: rest } : { type: n.type, content: n.content };
    }),
  };
}

/**
 * The same document without the project sections tagged with one of `projects` (a copy leaves archived projects'
 * parts out, owner 2026-11-25); one empty paragraph when nothing is left, as a document needs a block.
 */
export function withoutSections(doc: EditorDoc, projects: ReadonlySet<string>): EditorDoc {
  const content = (doc.content ?? []).filter((n) => {
    const id = n.attrs?.projectId;
    return !(n.type === 'projectSection' && typeof id === 'string' && projects.has(id));
  });
  return { ...doc, content: content.length > 0 ? content : [{ type: 'paragraph' }] };
}

/**
 * What makes a section the same update when its project is archived (frozen, owner 2026-11-25): its text and its
 * pictures. Not its exact JSON: the editor may write unchanged formatting differently (default attributes).
 */
export function sectionPrint(content: EditorNode): string {
  return `${plainText(content)}\u0000${[...attachmentIdsIn(content)].sort().join(',')}`;
}

/** The same JSON, whatever the order of object keys (PostgreSQL's jsonb keeps them in an order of its own). */
export function sameJson(a: unknown, b: unknown): boolean {
  return stableJson(a) === stableJson(b);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (isObject(value)) {
    const keys = Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** The attachment ids of the document's images (our own `/api/attachments/<id>` sources), each once. */
export function attachmentIdsIn(doc: EditorNode): Set<string> {
  const ids = new Set<string>();
  const walk = (n: EditorNode) => {
    const match = n.type === 'image' && typeof n.attrs?.src === 'string' ? ATTACHMENT_SRC.exec(n.attrs.src) : null;
    if (match?.[1]) ids.add(match[1]);
    (n.content ?? []).forEach(walk);
  };
  walk(doc);
  return ids;
}

/** The same document with image sources moved to other attachments (`renamed`: old id → new id); others unchanged. */
export function withAttachments(doc: EditorDoc, renamed: ReadonlyMap<string, string>): EditorDoc {
  const walk = (n: EditorNode): EditorNode => {
    const match = n.type === 'image' && typeof n.attrs?.src === 'string' ? ATTACHMENT_SRC.exec(n.attrs.src) : null;
    const next = match?.[1] ? renamed.get(match[1]) : undefined;
    const attrs = next ? { ...n.attrs, src: `/api/attachments/${next}` } : n.attrs;
    return { ...n, ...(attrs ? { attrs } : {}), ...(n.content ? { content: n.content.map(walk) } : {}) };
  };
  return walk(doc) as EditorDoc;
}
