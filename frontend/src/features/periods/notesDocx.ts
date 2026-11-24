import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type IParagraphOptions,
  type ParagraphChild,
} from 'docx';
import type { EditorMark, EditorNode, PeriodMeetingNotes } from '@weekly-meeting/shared';
import { formatFullDay } from '../../utils/dates';
import { cancelReason, meetingName } from '../meetings/meetingName';

/**
 * A period's notes as a Word document (owner, 2026-11-24), like the team's own quarterly Word file: the period and
 * what was picked at the top, then a Heading 1 per meeting, a Heading 2 per person and a Heading 3 per project section
 * (owner, 2026-11-24), so Word's navigation pane lists them all; then each note as written: its own headings (Heading 4
 * to 6, under the project), lists (with their numbering style), tables, quotes, code, links, colours and pictures. Built from the editor JSON, never from HTML. Pure: the pictures come in already loaded.
 */

export interface DocxImage {
  data: Uint8Array;
  type: 'png' | 'jpg' | 'gif';
  /** Pixels of the bytes. */
  width: number;
  height: number;
}

export interface NotesExport {
  /** "Team PIR · Q4 2026" */
  title: string;
  /** "1 Oct – 31 Dec 2026" */
  subtitle: string;
  /** What was picked: "All 8 meetings · all 11 people". */
  selection: string;
  /** The day it was made (YYYY-MM-DD). */
  exportedOn: string;
  meetings: PeriodMeetingNotes[];
  /**
   * 'note': one note on its own (the Notes page's "Download"): the title is the note's, no meeting or person headings,
   * and its project sections are the top headings. A period otherwise.
   */
  layout?: 'period' | 'note';
  /** Pictures by their address; null for one that could not be loaded. */
  images: ReadonlyMap<string, DocxImage | null>;
}

/** The text width of an A4 page with 2.54 cm margins, in pixels at 96 to the inch. */
const PAGE_WIDTH_PX = 600;
const BRAND = '006494';
const MUTED = '6C757D';
const RULE = 'CED4DA';
const SHADE = 'F1F3F5';
/** The note's own headings 1–3 sit below the meeting, person and project headings. */
const HEADINGS = [HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];
const ALIGN: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
};
const LIST_FORMAT: Record<string, (typeof LevelFormat)[keyof typeof LevelFormat]> = {
  '1': LevelFormat.DECIMAL,
  a: LevelFormat.LOWER_LETTER,
  A: LevelFormat.UPPER_LETTER,
  i: LevelFormat.LOWER_ROMAN,
  I: LevelFormat.UPPER_ROMAN,
};

type Block = Paragraph | Table;

/**
 * What a block takes from where it sits: how far it is indented (twips), whether it is in a quote (the grey bar),
 * and how wide a picture may be there (pixels): the page, less the indents, or a table cell's share of it.
 */
interface Look {
  indent: number;
  quote: boolean;
  room: number;
}
const TOP: Look = { indent: 0, quote: false, room: PAGE_WIDTH_PX };
/** One indent step: 1 cm in twips, and about the same in pixels. */
const STEP = 567;
const STEP_PX = 38;
const QUOTE_BAR = { style: BorderStyle.SINGLE, size: 18, color: RULE, space: 8 };

function placed(look: Look, extra: Pick<IParagraphOptions, 'border'> = {}): Pick<IParagraphOptions, 'indent' | 'border'> {
  const border = { ...(look.quote ? { left: QUOTE_BAR } : {}), ...extra.border };
  return {
    ...(look.indent > 0 ? { indent: { left: look.indent } } : {}),
    ...(Object.keys(border).length > 0 ? { border } : {}),
  };
}

const SAFE_LINK = /^(https?:|mailto:)/i;
const colorOf = (value: unknown) => (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.slice(1).toUpperCase() : undefined);
const alignOf = (node: EditorNode) => (typeof node.attrs?.textAlign === 'string' ? ALIGN[node.attrs.textAlign] : undefined);
const num = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

class Converter {
  /** Each ordered list is its own Word list, so it counts from its own start. */
  private lists = 0;

  constructor(private readonly images: ReadonlyMap<string, DocxImage | null>) {}

  runs(nodes: readonly EditorNode[] | undefined): ParagraphChild[] {
    const out: ParagraphChild[] = [];
    for (const node of nodes ?? []) {
      if (node.type === 'hardBreak') {
        out.push(new TextRun({ break: 1 }));
        continue;
      }
      if (node.type !== 'text' || !node.text) continue;
      const marks = new Map((node.marks ?? []).map((m: EditorMark) => [m.type, m]));
      const href = marks.get('link')?.attrs?.href;
      const link = typeof href === 'string' && SAFE_LINK.test(href) ? href : undefined;
      const run = new TextRun({
        text: node.text,
        bold: marks.has('bold') || undefined,
        italics: marks.has('italic') || undefined,
        underline: marks.has('underline') ? {} : undefined,
        strike: marks.has('strike') || undefined,
        font: marks.has('code') ? 'Consolas' : undefined,
        color: colorOf(marks.get('textStyle')?.attrs?.color),
        style: link ? 'Hyperlink' : undefined,
      });
      out.push(link ? new ExternalHyperlink({ link, children: [run] }) : run);
    }
    return out;
  }

  blocks(nodes: readonly EditorNode[] | undefined, look: Look = TOP): Block[] {
    return (nodes ?? []).flatMap((node) => this.block(node, look));
  }

  block(node: EditorNode, look: Look = TOP): Block[] {
    switch (node.type) {
      case 'paragraph':
        return [new Paragraph({ ...placed(look), alignment: alignOf(node), children: this.runs(node.content) })];
      case 'heading': {
        const level = Math.min(Math.max(num(node.attrs?.level, 1), 1), 3);
        return [new Paragraph({ ...placed(look), heading: HEADINGS[level - 1], alignment: alignOf(node), children: this.runs(node.content) })];
      }
      case 'bulletList':
      case 'orderedList':
        return this.list(node, 0, look);
      case 'blockquote':
        // A quote in a quote (or in a list) goes one step further in, with the bar.
        return this.blocks(node.content, { indent: look.indent + STEP, quote: true, room: look.room - STEP_PX });
      case 'codeBlock': {
        const text = (node.content ?? []).map((t) => t.text ?? '').join('');
        return text.split('\n').map(
          (line) =>
            new Paragraph({
              ...placed(look),
              shading: { type: ShadingType.CLEAR, fill: SHADE, color: 'auto' },
              spacing: { after: 0 },
              children: [new TextRun({ text: line, font: 'Consolas', size: 19 })],
            }),
        );
      }
      case 'horizontalRule':
        return [new Paragraph({ ...placed(look, { border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE, space: 1 } } }), children: [] })];
      case 'image':
        return [new Paragraph({ ...placed(look), alignment: alignOf(node), children: [this.image(node, look.room)] })];
      case 'table':
        return [this.table(node, look)];
      case 'projectSection':
        return this.blocks(node.content, look);
      default:
        return [];
    }
  }

  /**
   * A list's items: the first paragraph of each carries the bullet or number, indented from where the list sits (also
   * inside a quote, keeping its bar); what follows in an item is indented under its text.
   */
  list(node: EditorNode, level: number, look: Look): Block[] {
    const ordered = node.type === 'orderedList';
    const type = typeof node.attrs?.type === 'string' && LIST_FORMAT[node.attrs.type] ? node.attrs.type : '1';
    const start = Math.max(0, num(node.attrs?.start, 1));
    const instance = ++this.lists;
    const left = look.indent + STEP * (level + 1);
    const marker: Partial<IParagraphOptions> = ordered
      ? {
          numbering: {
            reference: {
              reference: `ordered-${type}-${start}`,
              levels: Array.from({ length: 9 }, (_, l) => ({
                level: l,
                format: LIST_FORMAT[type],
                text: `%${l + 1}.`,
                start,
                alignment: AlignmentType.LEFT,
                style: { paragraph: { indent: { left: STEP * (l + 1), hanging: 360 } } },
              })),
            },
            level,
            instance,
          },
        }
      : { bullet: { level } };
    const inside: Look = { indent: left, quote: look.quote, room: look.room - STEP_PX * (level + 1) };
    const out: Block[] = [];
    for (const item of node.content ?? []) {
      (item.content ?? []).forEach((child, i) => {
        if (i === 0 && child.type === 'paragraph') {
          out.push(
            new Paragraph({
              ...marker,
              ...placed(look),
              indent: { left, hanging: 360 },
              alignment: alignOf(child),
              children: this.runs(child.content),
            }),
          );
        } else if (child.type === 'bulletList' || child.type === 'orderedList') {
          out.push(...this.list(child, Math.min(level + 1, 8), look));
        } else {
          out.push(...this.block(child, inside));
        }
      });
    }
    return out;
  }

  /** At the width it had in the note (or its own), never wider than the room it has; the height follows. */
  image(node: EditorNode, room: number): ParagraphChild {
    const src = typeof node.attrs?.src === 'string' ? node.attrs.src : '';
    const picture = this.images.get(src);
    const alt = typeof node.attrs?.alt === 'string' ? node.attrs.alt : '';
    if (!picture) return new TextRun({ text: alt ? `[Picture not available: ${alt}]` : '[Picture not available]', italics: true, color: MUTED });
    const width = Math.max(1, Math.round(Math.min(num(node.attrs?.width, picture.width), Math.max(40, room))));
    const height = Math.max(1, Math.round((picture.height / picture.width) * width));
    return new ImageRun({ type: picture.type, data: picture.data, transformation: { width, height }, altText: { name: alt || 'Picture', description: alt, title: alt } });
  }

  /** Each cell gets its share of the width (by its columns), so pictures in it fit. */
  table(node: EditorNode, look: Look): Table {
    const rows = node.content ?? [];
    const columns = Math.max(1, ...rows.map((row) => (row.content ?? []).reduce((sum, cell) => sum + num(cell.attrs?.colspan, 1), 0)));
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: rows.map(
        (row) =>
          new TableRow({
            children: (row.content ?? []).map((cell) => {
              const span = num(cell.attrs?.colspan, 1);
              const content = this.blocks(cell.content, { indent: 0, quote: false, room: Math.floor((look.room / columns) * span) - 14 });
              return new TableCell({
                children: content.length > 0 ? content : [new Paragraph({ children: [] })],
                columnSpan: span,
                rowSpan: num(cell.attrs?.rowspan, 1),
                shading: cell.type === 'tableHeader' ? { type: ShadingType.CLEAR, fill: SHADE, color: 'auto' } : undefined,
              });
            }),
          }),
      ),
    });
  }
}

export function buildNotesDocument(input: NotesExport): Document {
  const convert = new Converter(input.images);
  const children: Block[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(input.title)] }),
    new Paragraph({ children: [new TextRun({ text: input.subtitle, color: MUTED })] }),
    new Paragraph({ children: [new TextRun({ text: input.selection, italics: true, color: MUTED })] }),
    new Paragraph({
      spacing: { after: 360 },
      children: [new TextRun({ text: `Saved from Weekly Meeting Notes on ${formatFullDay(input.exportedOn, 'en')}`, size: 18, color: MUTED })],
    }),
  ];

  const single = input.layout === 'note';
  for (const meeting of input.meetings) {
    const reason = cancelReason(meeting);
    if (!single) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun(`${formatFullDay(meeting.date, 'en')} · ${meetingName(meeting)}${meeting.status === 'cancelled' ? ' (cancelled)' : ''}`)],
        }),
      );
    }
    if (reason && !single) children.push(new Paragraph({ children: [new TextRun({ text: `Reason: ${reason}`, italics: true, color: MUTED })] }));
    for (const person of meeting.people) {
      if (!single) children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(person.name)] }));
      for (const note of person.notes) {
        if (note.title && !single) {
          children.push(new Paragraph({ children: [new TextRun({ text: note.title.toUpperCase(), bold: true, size: 18, color: MUTED })] }));
        }
        const projects = new Map(note.projects.map((p) => [p.id, p.name]));
        for (const node of note.content.content ?? []) {
          if (node.type === 'projectSection') {
            const id = typeof node.attrs?.projectId === 'string' ? node.attrs.projectId : null;
            const project = id ? projects.get(id) : undefined;
            // A project is a heading, so it is in the navigation pane; a part without one is only labelled.
            children.push(
              project
                ? new Paragraph({ heading: single ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_3, children: [new TextRun(project)] })
                : new Paragraph({ spacing: { before: 160 }, children: [new TextRun({ text: 'No project', italics: true, color: MUTED })] }),
            );
          }
          children.push(...convert.block(node));
        }
      }
    }
  }

  return new Document({
    creator: 'Weekly Meeting Notes',
    title: input.title,
    description: input.selection,
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 22 }, paragraph: { spacing: { after: 100 } } },
        heading1: { run: { color: BRAND, size: 30, bold: true }, paragraph: { spacing: { before: 480, after: 160 } } },
        heading2: { run: { size: 26, bold: true }, paragraph: { spacing: { before: 280, after: 80 } } },
        heading3: { run: { color: BRAND, size: 23, bold: true }, paragraph: { spacing: { before: 200, after: 60 } } },
        heading4: { run: { color: '212529', size: 26, bold: true, italics: false }, paragraph: { spacing: { before: 200, after: 60 } } },
        heading5: { run: { color: '212529', size: 24, bold: true, italics: false }, paragraph: { spacing: { before: 160, after: 60 } } },
        heading6: { run: { color: '212529', size: 22, bold: true, italics: false }, paragraph: { spacing: { before: 160, after: 40 } } },
      },
    },
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
        children,
      },
    ],
  });
}
