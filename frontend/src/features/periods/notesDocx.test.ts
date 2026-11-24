import { Packer } from 'docx';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { EditorNode, PeriodMeetingNotes } from '@weekly-meeting/shared';
import { imageSources } from './exportImages';
import { buildNotesDocument, type DocxImage } from './notesDocx';

const project = '7b0d2a52-6d0c-4bd5-9a43-3f1b3ad0c001';
const picture = '/api/attachments/0f9c1c5e-2d1b-4a77-8f0e-5b8f3c2a9d10';
const missing = '/api/attachments/0f9c1c5e-2d1b-4a77-8f0e-5b8f3c2a9d11';
// A 1×1 PNG.
const png = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
);

const text = (value: string, marks?: EditorNode['marks']): EditorNode => ({ type: 'text', text: value, ...(marks ? { marks } : {}) });
const para = (...content: EditorNode[]): EditorNode => ({ type: 'paragraph', content });

const content: EditorNode = {
  type: 'doc',
  content: [
    {
      type: 'projectSection',
      attrs: { projectId: project },
      content: [
        para(text('Shipped '), text('the quarter view', [{ type: 'bold' }]), text(' and '), text('a link', [{ type: 'link', attrs: { href: 'https://example.com/plan' } }])),
        {
          type: 'orderedList',
          attrs: { start: 1, type: 'a' },
          content: [
            { type: 'listItem', content: [para(text('First step')), { type: 'bulletList', content: [{ type: 'listItem', content: [para(text('Nested point'))] }] }] },
            { type: 'listItem', content: [para(text('Second step'))] },
          ],
        },
        { type: 'image', attrs: { src: picture, alt: 'Board', width: 1200 } },
      ],
    },
    { type: 'heading', attrs: { level: 2 }, content: [text('Next week')] },
    {
      type: 'table',
      content: [
        { type: 'tableRow', content: [{ type: 'tableHeader', content: [para(text('Item'))] }, { type: 'tableHeader', content: [para(text('State'))] }] },
        { type: 'tableRow', content: [{ type: 'tableCell', content: [para(text('Export'))] }, { type: 'tableCell', content: [para(text('Done', [{ type: 'textStyle', attrs: { color: '#2e7d32' } }]))] }] },
      ],
    },
    { type: 'codeBlock', content: [text('line one\nline two')] },
    { type: 'image', attrs: { src: missing, alt: 'Chart' } },
    para(text('Unsafe', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }])),
  ],
};

const meetings: PeriodMeetingNotes[] = [
  {
    id: 'm1',
    date: '2026-11-19',
    title: null,
    seriesName: 'Weekly Update',
    status: 'done',
    people: [
      {
        userId: 'u1',
        name: 'Ari Cole',
        notes: [{ id: 'n1', title: '13 – 19 Nov', content: content as PeriodMeetingNotes['people'][number]['notes'][number]['content'], projects: [{ id: project, name: 'Quarter view' }], updatedAt: '2026-11-19T00:00:00Z' }],
      },
    ],
  },
];

async function documentXml(images: Map<string, DocxImage | null>) {
  const doc = buildNotesDocument({
    title: 'Team Example · Q4 2026',
    subtitle: '1 Oct – 31 Dec 2026',
    selection: 'All 1 meeting · all 1 person',
    exportedOn: '2026-11-24',
    meetings,
    images,
  });
  const files = unzipSync(new Uint8Array(await Packer.toBuffer(doc)));
  return { files, xml: strFromU8(files['word/document.xml'] as Uint8Array) };
}

describe('notes as a Word document', () => {
  it('finds every picture once', () => {
    expect(imageSources([...meetings, ...meetings])).toEqual([picture, missing]);
  });

  it('writes the period, the meeting and person headings, and the notes as written', async () => {
    const { files, xml } = await documentXml(new Map([[picture, { data: png, type: 'png', width: 1, height: 1 }], [missing, null]]));
    for (const words of [
      'Team Example · Q4 2026',
      'All 1 meeting · all 1 person',
      'Saved from Weekly Meeting Notes on Tuesday, 24 November 2026',
      'Thursday, 19 November 2026 · Weekly Update',
      'Ari Cole',
      '13 – 19 NOV',
      'Quarter view',
      'the quarter view',
      'First step',
      'Nested point',
      'Next week',
      'Export',
      'line two',
      '[Picture not available: Chart]',
      'Unsafe',
    ]) {
      expect(xml).toContain(words);
    }
    expect(xml).toContain('w:val="Heading1"');
    expect(xml).toContain('w:val="Heading2"');
    // The project section is a Heading 3 (in Word's navigation pane); the note's own heading 2 comes below it.
    expect(xml).toMatch(/w:val="Heading3"[\s\S]{0,400}Quarter view/);
    expect(xml).toMatch(/w:val="Heading5"[\s\S]{0,400}Next week/);
    expect(xml).toMatch(/<w:b\/>[\s\S]*the quarter view/);
    expect(xml).toContain('<w:numPr>'); // lists
    expect(xml).toContain('<w:tbl>');
    expect(xml).toContain('w:val="2E7D32"'); // text colour
    expect(xml).toContain('Consolas');
    // The safe link is a hyperlink; javascript: is plain text.
    const rels = strFromU8(files['word/_rels/document.xml.rels'] as Uint8Array);
    expect(rels).toContain('https://example.com/plan');
    expect(rels).not.toContain('javascript:');
    // The picture is in the file, as wide as the page at most (600 px = 5715000 EMU).
    expect(Object.keys(files).some((name) => name.startsWith('word/media/') && name.endsWith('.png'))).toBe(true);
    expect(xml).toContain('cx="5715000"');
    // Ordered list "a." style.
    const numbering = strFromU8(files['word/numbering.xml'] as Uint8Array);
    expect(numbering).toContain('lowerLetter');
  });

  it('keeps nesting: quotes in quotes, lists in quotes, pictures in table cells, merged cells and list starts', async () => {
    const nested: EditorNode = {
      type: 'doc',
      content: [
        { type: 'blockquote', content: [para(text('Outer quote')), { type: 'blockquote', content: [para(text('Inner quote'))] }] },
        { type: 'blockquote', content: [{ type: 'bulletList', content: [{ type: 'listItem', content: [para(text('Quoted point'))] }] }] },
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', attrs: { rowspan: 2 }, content: [para(text('Tall'))] },
                { type: 'tableCell', content: [{ type: 'image', attrs: { src: picture, alt: 'In a cell', width: 900 } }] },
              ],
            },
            { type: 'tableRow', content: [{ type: 'tableCell', content: [para(text('Below'))] }] },
          ],
        },
        { type: 'orderedList', attrs: { start: 0, type: '1' }, content: [{ type: 'listItem', content: [para(text('Zero'))] }] },
        { type: 'orderedList', attrs: { start: 5, type: 'I' }, content: [{ type: 'listItem', content: [para(text('Five'))] }] },
      ],
    };
    const doc = buildNotesDocument({
      title: 'T',
      subtitle: 'S',
      selection: 'All',
      exportedOn: '2026-11-24',
      images: new Map([[picture, { data: png, type: 'png', width: 1, height: 1 }]]),
      meetings: [
        {
          ...meetings[0]!,
          status: 'cancelled',
          title: 'Public holiday',
          people: [{ userId: 'u1', name: 'Ari Cole', notes: [{ id: 'n2', title: '', content: nested as PeriodMeetingNotes['people'][number]['notes'][number]['content'], projects: [], updatedAt: '2026-11-19T00:00:00Z' }] }],
        },
      ],
    });
    const files = unzipSync(new Uint8Array(await Packer.toBuffer(doc)));
    const xml = strFromU8(files['word/document.xml'] as Uint8Array);
    const paragraph = (words: string) => {
      const at = xml.indexOf(words);
      return xml.slice(xml.lastIndexOf('<w:p>', at), at);
    };
    // The meeting keeps its schedule's name; a cancel reason follows it.
    expect(xml).toContain('Thursday, 19 November 2026 · Weekly Update (cancelled)');
    expect(xml).toContain('Reason: Public holiday');
    // A quote in a quote goes one step further in; both have the bar.
    expect(paragraph('Outer quote')).toContain('w:left="567"');
    expect(paragraph('Inner quote')).toContain('w:left="1134"');
    expect(paragraph('Inner quote')).toContain('<w:left w:val="single"');
    // A list in a quote keeps the bar and sits inside it.
    expect(paragraph('Quoted point')).toContain('<w:numPr>');
    expect(paragraph('Quoted point')).toContain('<w:left w:val="single"');
    expect(paragraph('Quoted point')).toContain('w:left="1134"');
    // A picture in one of two columns is at most half the page (286 px = 2724150 EMU), not 600 px.
    expect(xml).toContain('cx="2724150"');
    // The tall cell spans two rows.
    expect(xml).toContain('<w:vMerge w:val="restart"/>');
    expect(xml).toContain('<w:vMerge w:val="continue"/>');
    // Lists start where they did in the note.
    const numbering = strFromU8(files['word/numbering.xml'] as Uint8Array);
    expect(numbering).toContain('<w:start w:val="0"/>');
    expect(numbering).toContain('<w:start w:val="5"/>');
    expect(numbering).toContain('upperRoman');
  });

  it('writes one note on its own: its title on top, no meeting or person heading, its projects as Heading 1', async () => {
    const doc = buildNotesDocument({
      layout: 'note',
      title: '13 – 19 Nov',
      subtitle: 'Written by Ari Cole on Thursday, 19 November 2026',
      selection: 'Not shared on a meeting',
      exportedOn: '2026-11-24',
      meetings,
      images: new Map([[picture, { data: png, type: 'png', width: 1, height: 1 }], [missing, null]]),
    });
    const files = unzipSync(new Uint8Array(await Packer.toBuffer(doc)));
    const xml = strFromU8(files['word/document.xml'] as Uint8Array);
    for (const words of ['13 – 19 Nov', 'Written by Ari Cole on Thursday, 19 November 2026', 'Not shared on a meeting', 'the quarter view', 'Next week']) {
      expect(xml).toContain(words);
    }
    expect(xml).not.toContain('Weekly Update'); // no meeting heading
    expect(xml).not.toContain('13 – 19 NOV'); // the title is not repeated above the text
    expect(xml).not.toContain('w:val="Heading2"'); // no person heading
    expect(xml).toMatch(/w:val="Heading1"[\s\S]{0,400}Quarter view/);
  });
});
