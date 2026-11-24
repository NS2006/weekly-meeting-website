import PDFDocument, { registerStdFonts, type PDFOutline, type TextOptions } from 'pdfkit';
import { toBytes } from 'pdfkit/output';
import Courier from 'pdfkit/standard-fonts/Courier';
import Helvetica from 'pdfkit/standard-fonts/Helvetica';
import HelveticaBold from 'pdfkit/standard-fonts/HelveticaBold';
import HelveticaBoldOblique from 'pdfkit/standard-fonts/HelveticaBoldOblique';
import HelveticaOblique from 'pdfkit/standard-fonts/HelveticaOblique';
import type { EditorMark, EditorNode } from '@weekly-meeting/shared';
import { formatFullDay } from '../../utils/dates';
import { cancelReason, meetingName } from '../meetings/meetingName';
import type { NotesExport } from './notesDocx';

/**
 * A period's notes as a PDF, made in the browser and downloaded at once (owner, 2026-11-24), laid out like the Word
 * file: the period and what was picked at the top, then each meeting, each person and each project section as a
 * heading and a bookmark (the PDF reader's navigation pane: meeting, then person, then project), and each note as
 * written: headings, lists, quotes, code, links, colours and pictures. Tables keep their grid with plain text in the
 * cells. Built from the editor JSON, never from HTML; the pictures come in already loaded.
 *
 * The 14 fonts every PDF reader has are used, so nothing is embedded; they hold Western European letters only, so
 * arrows and a few symbols are written in plain characters and emoji are left out (pdfText).
 */

export interface PdfImage {
  data: Uint8Array;
  type: 'png' | 'jpg';
  /** Pixels, as shown (turned upright). */
  width: number;
  height: number;
}

export interface PdfExport extends Omit<NotesExport, 'images'> {
  /** Pictures by their address; null for one that could not be loaded. */
  images: ReadonlyMap<string, PdfImage | null>;
}

/** A4 with 2 cm margins, in points. */
const MARGIN = 56;
const PT_PER_PX = 0.75;
const BODY = 10.5;
const LINE_GAP = 2;
const INK = '#212529';
const BRAND = '#006494';
const MUTED = '#6C757D';
const RULE = '#CED4DA';
const SHADE = '#F1F3F5';
/** One indent step: lists and quotes. */
const STEP = 18;

// ---------- Text the standard fonts can write ----------

/** Windows-1252 letters beyond Latin-1 that the standard fonts have. */
const CP1252_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
const REPLACE: Record<string, string> = {
  '→': '->',
  '←': '<-',
  '↔': '<->',
  '⇒': '=>',
  '⇐': '<=',
  '≥': '>=',
  '≤': '<=',
  '≠': '!=',
  '≈': '~',
  '−': '-',
  '‐': '-',
  '‑': '-',
  '‒': '-',
  '′': "'",
  '″': '"',
  '✓': 'v',
  '✔': 'v',
  '✗': 'x',
  '✘': 'x',
  '\t': '    ',
  '\r': '',
};
const DROPPED = /[\p{Extended_Pictographic}\p{M}​-‏⁠︎️]/u;

/** The text as the standard fonts can write it: arrows and a few symbols spelled out, emoji left out, others "?". */
export function pdfText(text: string): string {
  let out = '';
  for (const ch of text.normalize('NFC')) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === '\n' || (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || CP1252_EXTRA.includes(ch)) out += ch;
    else if (REPLACE[ch] !== undefined) out += REPLACE[ch];
    else if (!DROPPED.test(ch)) out += '?';
  }
  return out;
}

// ---------- The editor JSON ----------

interface Piece {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
  color?: string;
  link?: string;
}

interface Style {
  size: number;
  bold?: boolean;
  italic?: boolean;
  color?: string;
}

/** Where a block goes: its left edge and width, in points. */
interface Place {
  left: number;
  width: number;
}

const SAFE_LINK = /^(https?:|mailto:)/i;
const ALIGNS = new Set(['left', 'center', 'right', 'justify']);
const colorOf = (value: unknown) => (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : undefined);
const alignOf = (node: EditorNode) =>
  typeof node.attrs?.textAlign === 'string' && ALIGNS.has(node.attrs.textAlign) ? (node.attrs.textAlign as TextOptions['align']) : undefined;
const num = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const fontOf = (bold?: boolean, italic?: boolean) =>
  bold ? (italic ? 'Helvetica-BoldOblique' : 'Helvetica-Bold') : italic ? 'Helvetica-Oblique' : 'Helvetica';
const plain = (text: string, style: Omit<Piece, 'text'> = {}): Piece => ({ text: pdfText(text), ...style });

function piecesOf(nodes: readonly EditorNode[] | undefined): Piece[] {
  const out: Piece[] = [];
  for (const node of nodes ?? []) {
    if (node.type === 'hardBreak') {
      out.push({ text: '\n' });
      continue;
    }
    if (node.type !== 'text' || !node.text) continue;
    const marks = new Map((node.marks ?? []).map((m: EditorMark) => [m.type, m]));
    const href = marks.get('link')?.attrs?.href;
    const link = typeof href === 'string' && SAFE_LINK.test(href) ? href : undefined;
    out.push({
      text: pdfText(node.text),
      bold: marks.has('bold'),
      italic: marks.has('italic'),
      underline: marks.has('underline') || link !== undefined,
      strike: marks.has('strike'),
      code: marks.has('code'),
      color: link ? BRAND : colorOf(marks.get('textStyle')?.attrs?.color),
      link,
    });
  }
  return out.filter((p) => p.text.length > 0);
}

const ROMAN: [number, string][] = [
  [1000, 'm'],
  [900, 'cm'],
  [500, 'd'],
  [400, 'cd'],
  [100, 'c'],
  [90, 'xc'],
  [50, 'l'],
  [40, 'xl'],
  [10, 'x'],
  [9, 'ix'],
  [5, 'v'],
  [4, 'iv'],
  [1, 'i'],
];

/** An ordered list's number in its style: 1, a, A, i or I (0 and below stay digits). */
export function listNumber(n: number, type: string): string {
  if (type === '1' || n < 1) return String(n);
  if (type === 'a' || type === 'A') {
    let letters = '';
    for (let rest = n; rest > 0; rest = Math.floor((rest - 1) / 26)) letters = String.fromCharCode(97 + ((rest - 1) % 26)) + letters;
    return type === 'A' ? letters.toUpperCase() : letters;
  }
  if (type === 'i' || type === 'I') {
    let roman = '';
    let rest = Math.min(n, 3999);
    for (const [value, digits] of ROMAN) {
      while (rest >= value) {
        roman += digits;
        rest -= value;
      }
    }
    return type === 'I' ? roman.toUpperCase() : roman;
  }
  return String(n);
}

/** A table cell's words, line by line (lists keep their markers; pictures are named). */
function plainText(nodes: readonly EditorNode[] | undefined, depth = 0): string {
  const lines: string[] = [];
  for (const node of nodes ?? []) {
    if (node.type === 'paragraph' || node.type === 'heading') {
      lines.push((node.content ?? []).map((n) => (n.type === 'hardBreak' ? '\n' : (n.text ?? ''))).join(''));
    } else if (node.type === 'bulletList' || node.type === 'orderedList') {
      const ordered = node.type === 'orderedList';
      const type = typeof node.attrs?.type === 'string' ? node.attrs.type : '1';
      const start = Math.max(0, num(node.attrs?.start, 1));
      (node.content ?? []).forEach((item, i) => {
        const [first = '', ...rest] = plainText(item.content, depth + 1).split('\n');
        lines.push(`${'  '.repeat(depth)}${ordered ? `${listNumber(start + i, type)}.` : '•'} ${first}`, ...rest);
      });
    } else if (node.type === 'image') {
      lines.push('[Picture]');
    } else if (node.content) {
      lines.push(plainText(node.content, depth));
    }
  }
  return lines.join('\n');
}

// ---------- Laying it out ----------

const MARKERS = ['•', '–', '·'];

class Writer {
  constructor(
    private readonly doc: PDFDocument,
    private readonly images: ReadonlyMap<string, PdfImage | null>,
  ) {}

  private get bottom() {
    return this.doc.page.maxY();
  }

  /** A new page unless `height` still fits on this one (headings stay with what follows them). */
  room(height: number) {
    if (this.doc.y + height > this.bottom) this.doc.addPage();
  }

  space(height: number) {
    this.doc.y = Math.min(this.doc.y + height, this.bottom);
  }

  /** A bookmark at this point of the page, under `parent`. */
  mark(parent: PDFOutline, title: string, expanded = false): PDFOutline {
    // pdfkit 0.21 counts the bookmark's left edge from the page's right side: the page's width is its left edge.
    return parent.addItem(title, { top: Math.max(0, this.doc.y - 6), left: this.doc.page.width, expanded });
  }

  /** One paragraph of pieces in different styles, wrapped to the place and onto the next page when needed. */
  line(pieces: Piece[], place: Place, style: Style, align?: TextOptions['align']) {
    const doc = this.doc;
    if (pieces.length === 0) {
      this.space(style.size * 0.8);
      return;
    }
    pieces.forEach((piece, i) => {
      doc
        .font(piece.code ? 'Courier' : fontOf(style.bold || piece.bold, style.italic || piece.italic))
        .fontSize(piece.code ? style.size - 0.5 : style.size)
        .fillColor(piece.color ?? style.color ?? INK);
      // Every option is given each time: pdfkit carries a continued line's options over to its next piece.
      const options: TextOptions = {
        continued: i < pieces.length - 1,
        width: place.width,
        align,
        lineGap: LINE_GAP,
        underline: piece.underline ?? false,
        strike: piece.strike ?? false,
        link: piece.link ?? null,
      };
      if (i === 0) doc.text(piece.text, place.left, doc.y, options);
      else doc.text(piece.text, options);
    });
  }

  blocks(nodes: readonly EditorNode[] | undefined, place: Place) {
    for (const node of nodes ?? []) this.block(node, place);
  }

  block(node: EditorNode, place: Place) {
    switch (node.type) {
      case 'paragraph':
        this.line(piecesOf(node.content), place, { size: BODY }, alignOf(node));
        this.space(4);
        return;
      case 'heading': {
        const level = Math.min(Math.max(num(node.attrs?.level, 1), 1), 3);
        const size = [15, 13, 11.5][level - 1] ?? BODY;
        this.space(4);
        this.room(size * 3);
        this.line(piecesOf(node.content), place, { size, bold: true }, alignOf(node));
        this.space(3);
        return;
      }
      case 'bulletList':
      case 'orderedList':
        this.list(node, place, 0);
        return;
      case 'blockquote':
        this.quote(node, place);
        return;
      case 'codeBlock':
        this.code(node, place);
        return;
      case 'horizontalRule':
        this.rule(place);
        return;
      case 'image':
        this.image(node, place);
        return;
      case 'table':
        this.table(node, place);
        return;
      case 'projectSection':
        this.blocks(node.content, place);
        return;
      default:
        return;
    }
  }

  /** Each item's marker hangs left of its text; what follows in an item, nested lists too, sits under its text. */
  list(node: EditorNode, place: Place, depth: number) {
    const doc = this.doc;
    const ordered = node.type === 'orderedList';
    const type = typeof node.attrs?.type === 'string' ? node.attrs.type : '1';
    const start = Math.max(0, num(node.attrs?.start, 1));
    const inner: Place = { left: place.left + STEP, width: Math.max(40, place.width - STEP) };
    (node.content ?? []).forEach((item, index) => {
      const marker = ordered ? `${listNumber(start + index, type)}.` : (MARKERS[depth % MARKERS.length] ?? '•');
      (item.content ?? []).forEach((child, i) => {
        if (i === 0 && child.type === 'paragraph') {
          this.room(BODY * 1.6);
          const y = doc.y;
          doc.font('Helvetica').fontSize(BODY).fillColor(INK);
          const x = place.left + STEP - 4 - doc.widthOfString(marker);
          doc.text(marker, Math.max(place.left, x), y, { lineBreak: false });
          doc.y = y;
          this.block(child, inner);
        } else if (child.type === 'bulletList' || child.type === 'orderedList') {
          this.list(child, inner, depth + 1);
        } else {
          this.block(child, inner);
        }
      });
    });
  }

  /** Indented, with a grey bar beside it (on the page it ends on, when it runs over). */
  quote(node: EditorNode, place: Place) {
    const doc = this.doc;
    const page = doc.page;
    const start = doc.y;
    this.blocks(node.content, { left: place.left + STEP, width: Math.max(40, place.width - STEP) });
    const top = doc.page === page ? start : doc.page.margins.top;
    const end = doc.y - 4;
    if (end > top) doc.moveTo(place.left + 4, top).lineTo(place.left + 4, end).lineWidth(2.5).strokeColor(RULE).stroke();
  }

  /** Monospace on a grey ground (the ground only when it fits on one page). */
  code(node: EditorNode, place: Place) {
    const doc = this.doc;
    const text = pdfText((node.content ?? []).map((t) => t.text ?? '').join('')) || ' ';
    doc.font('Courier').fontSize(9);
    const width = Math.max(40, place.width - 12);
    const height = doc.heightOfString(text, { width, lineGap: 1 }) + 10;
    this.room(Math.min(height, 60));
    const page = doc.page;
    const y = doc.y;
    if (y + height <= this.bottom) doc.rect(place.left, y, place.width, height).fill(SHADE);
    doc.font('Courier').fontSize(9).fillColor(INK).text(text, place.left + 6, y + 5, { width, lineGap: 1 });
    if (doc.page === page) doc.y = Math.max(doc.y, y + height);
    this.space(6);
  }

  rule(place: Place) {
    const doc = this.doc;
    this.room(12);
    const y = doc.y + 5;
    doc.moveTo(place.left, y).lineTo(place.left + place.width, y).lineWidth(0.75).strokeColor(RULE).stroke();
    doc.y = y + 7;
  }

  /** At the width it had in the note (or its own), never wider than the place nor taller than a page. */
  image(node: EditorNode, place: Place) {
    const doc = this.doc;
    const src = typeof node.attrs?.src === 'string' ? node.attrs.src : '';
    const alt = typeof node.attrs?.alt === 'string' ? node.attrs.alt : '';
    const picture = this.images.get(src);
    if (!picture) {
      this.line([plain(alt ? `[Picture not available: ${alt}]` : '[Picture not available]', { italic: true, color: MUTED })], place, {
        size: BODY,
      });
      this.space(4);
      return;
    }
    let width = Math.max(20, Math.min(num(node.attrs?.width, picture.width) * PT_PER_PX, place.width));
    let height = (picture.height / picture.width) * width;
    const pageRoom = this.bottom - doc.page.margins.top;
    if (height > pageRoom) {
      width *= pageRoom / height;
      height = pageRoom;
    }
    this.room(height);
    const align = alignOf(node);
    const x = align === 'center' ? place.left + (place.width - width) / 2 : align === 'right' ? place.left + place.width - width : place.left;
    const y = doc.y;
    // The width alone: pdfkit turns a JPEG upright from its EXIF data and keeps its proportions.
    doc.image(picture.data, x, y, { width });
    doc.y = y + height;
    this.space(6);
  }

  /** A grid with the cells' words; each cell as wide as its columns. */
  table(node: EditorNode, place: Place) {
    const doc = this.doc;
    const rows = node.content ?? [];
    const columns = Math.max(1, ...rows.map((row) => (row.content ?? []).reduce((sum, cell) => sum + Math.max(1, num(cell.attrs?.colspan, 1)), 0)));
    const unit = place.width / columns;
    const pageRoom = this.bottom - doc.page.margins.top;
    for (const row of rows) {
      const cells = (row.content ?? []).map((cell) => ({
        span: Math.max(1, num(cell.attrs?.colspan, 1)),
        header: cell.type === 'tableHeader',
        text: pdfText(plainText(cell.content)) || ' ',
      }));
      const heights = cells.map((cell) =>
        doc
          .font(cell.header ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(9.5)
          .heightOfString(cell.text, { width: unit * cell.span - 8, lineGap: 1 }),
      );
      const height = Math.min(Math.max(14, ...heights) + 8, pageRoom);
      this.room(height);
      const y = doc.y;
      let x = place.left;
      for (const cell of cells) {
        const width = unit * cell.span;
        if (cell.header) doc.rect(x, y, width, height).fill(SHADE);
        doc.rect(x, y, width, height).lineWidth(0.5).strokeColor(RULE).stroke();
        // Never past the row: a cell taller than a page is cut short, marked with "…".
        doc
          .font(cell.header ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(9.5)
          .fillColor(INK)
          .text(cell.text, x + 4, y + 4, { width: width - 8, height: height - 8, ellipsis: true, lineGap: 1 });
        x += width;
      }
      doc.y = y + height;
    }
    this.space(6);
  }
}

/** Writes the notes into `doc` (A4, 2 cm margins). */
export function writeNotesPdf(doc: PDFDocument, input: PdfExport): void {
  const writer = new Writer(doc, input.images);
  const full: Place = { left: MARGIN, width: doc.page.width - 2 * MARGIN };
  writer.line([plain(input.title)], full, { size: 20, bold: true });
  writer.space(4);
  writer.line([plain(input.subtitle)], full, { size: 11, color: MUTED });
  writer.line([plain(input.selection)], full, { size: 10, italic: true, color: MUTED });
  writer.space(2);
  writer.line([plain(`Saved from Weekly Meeting Notes on ${formatFullDay(input.exportedOn, 'en')}`)], full, { size: 8.5, color: MUTED });

  // One note on its own ('note'): no meeting or person headings; its projects are the top bookmarks.
  const single = input.layout === 'note';
  if (single) writer.space(14);
  for (const meeting of input.meetings) {
    let meetingMark = doc.outline;
    if (!single) {
      const title = `${formatFullDay(meeting.date, 'en')} · ${meetingName(meeting)}${meeting.status === 'cancelled' ? ' (cancelled)' : ''}`;
      writer.space(20);
      writer.room(110);
      meetingMark = writer.mark(doc.outline, title, true);
      writer.line([plain(title)], full, { size: 15, bold: true, color: BRAND });
      writer.space(4);
      const reason = cancelReason(meeting);
      if (reason) writer.line([plain(`Reason: ${reason}`)], full, { size: BODY, italic: true, color: MUTED });
    }
    for (const person of meeting.people) {
      let personMark = meetingMark;
      if (!single) {
        writer.space(10);
        writer.room(80);
        personMark = writer.mark(meetingMark, person.name);
        writer.line([plain(person.name)], full, { size: 13, bold: true });
        writer.space(4);
      }
      for (const note of person.notes) {
        if (note.title && !single) {
          writer.line([plain(note.title.toUpperCase())], full, { size: 8.5, bold: true, color: MUTED });
          writer.space(3);
        }
        const projects = new Map(note.projects.map((p) => [p.id, p.name]));
        for (const node of note.content.content ?? []) {
          if (node.type === 'projectSection') {
            const id = typeof node.attrs?.projectId === 'string' ? node.attrs.projectId : null;
            const project = id ? projects.get(id) : undefined;
            writer.space(6);
            if (project) {
              // A project is a heading and a bookmark, under its person; a part without one is only labelled.
              writer.room(60);
              writer.mark(personMark, project);
              writer.line([plain(project)], full, { size: 11.5, bold: true, color: BRAND });
            } else {
              writer.line([plain('No project', { italic: true, color: MUTED })], full, { size: BODY });
            }
            writer.space(3);
          }
          writer.block(node, full);
        }
      }
    }
  }
}

let fontsReady = false;

/** The finished PDF file. `compress: false` keeps it readable as text (for tests). */
export async function buildNotesPdf(input: PdfExport, options: { compress?: boolean } = {}): Promise<Uint8Array> {
  if (!fontsReady) {
    registerStdFonts(Helvetica, HelveticaBold, HelveticaOblique, HelveticaBoldOblique, Courier);
    fontsReady = true;
  }
  const doc = new PDFDocument({
    size: 'A4',
    margin: MARGIN,
    compress: options.compress ?? true,
    displayTitle: true,
    lang: 'en',
    info: { Title: input.title, Subject: input.selection, Creator: 'Weekly Meeting Notes' },
  });
  const bytes = toBytes(doc);
  // Opens with the bookmarks shown, like Word's navigation pane.
  (doc as unknown as { _root: { data: Record<string, unknown> } })._root.data.PageMode = 'UseOutlines';
  writeNotesPdf(doc, input);
  doc.end();
  return bytes;
}
