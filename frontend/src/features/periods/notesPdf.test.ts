import { describe, expect, it } from 'vitest';
import type { EditorNode, PeriodMeetingNotes } from '@weekly-meeting/shared';
import { buildNotesPdf, listNumber, pdfText, type PdfImage } from './notesPdf';

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
    { type: 'blockquote', content: [para(text('Quoted line'))] },
    {
      type: 'table',
      content: [
        { type: 'tableRow', content: [{ type: 'tableHeader', content: [para(text('Item'))] }, { type: 'tableHeader', content: [para(text('State'))] }] },
        { type: 'tableRow', content: [{ type: 'tableCell', content: [para(text('Export'))] }, { type: 'tableCell', content: [para(text('Done'))] }] },
      ],
    },
    { type: 'codeBlock', content: [text('line one\nline two')] },
    { type: 'horizontalRule' },
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
        notes: [
          {
            id: 'n1',
            title: '13 – 19 Nov',
            content: content as PeriodMeetingNotes['people'][number]['notes'][number]['content'],
            projects: [{ id: project, name: 'Quarter view' }],
            updatedAt: '2026-11-19T00:00:00Z',
          },
        ],
      },
    ],
  },
];

/** The PDF as text (uncompressed), and the words written with the standard fonts (as hex strings). */
async function pdf(images: Map<string, PdfImage | null>, layout: 'period' | 'note' = 'period') {
  const bytes = await buildNotesPdf(
    {
      layout,
      title: 'Team Example · Q4 2026',
      subtitle: '1 Oct – 31 Dec 2026',
      selection: 'All 1 meeting · all 1 person',
      exportedOn: '2026-11-24',
      meetings,
      images,
    },
    { compress: false },
  );
  const raw = new TextDecoder('latin1').decode(bytes);
  const words = [...raw.matchAll(/<([0-9a-f]+)>/gi)]
    .map((m) => (m[1] ?? '').replace(/../g, (h) => String.fromCharCode(parseInt(h, 16))))
    .join('');
  return { bytes, raw, words };
}

describe('notes as a PDF', () => {
  it('writes the period, the notes as written, and a bookmark per meeting, person and project', async () => {
    const { bytes, raw, words } = await pdf(new Map([[picture, { data: png, type: 'png', width: 1, height: 1 }], [missing, null]]));
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    for (const word of ['Team Example', 'Ari Cole', '13 ', 'NOV', 'Quarter view', 'Shipped', 'the quarter view', 'First step', 'Nested point', 'Second step', 'Next week', 'Quoted line', 'Item', 'Export', 'line two', '[Picture not available: Chart]', 'Unsafe']) {
      expect(words).toContain(word);
    }
    // Ordered "a." style; the nested bullet.
    expect(words).toContain('a.');
    expect(words).toContain('b.');
    // Bookmarks: meeting > person > project, and the reader opens with them shown.
    expect(raw).toContain('/Title (Ari Cole)');
    expect(raw).toContain('/Title (Quarter view)');
    expect(raw).toMatch(/\/Outlines \d+ 0 R/);
    expect(raw).toContain('/PageMode /UseOutlines');
    // The safe link is a link; javascript: is not.
    expect(raw).toContain('https://example.com/plan');
    expect(raw).not.toContain('javascript:');
    // The picture is in the file.
    expect(raw).toContain('/Subtype /Image');
  });

  it('writes only what the standard fonts have: arrows spelled out, emoji left out', () => {
    expect(pdfText('Done → next ✓ 🎉 “quoted” – café • 100€')).toBe('Done -> next v  “quoted” – café • 100€');
    expect(pdfText('漢字')).toBe('??');
    expect(pdfText('a\tb\r\n')).toBe('a    b\n');
  });

  it('numbers ordered lists in their style', () => {
    expect(['1', 'a', 'A', 'i', 'I'].map((type) => listNumber(4, type))).toEqual(['4', 'd', 'D', 'iv', 'IV']);
    expect(listNumber(27, 'a')).toBe('aa');
    expect(listNumber(0, 'a')).toBe('0');
  });

  it('writes one note on its own: no meeting or person heading, its projects as the top bookmarks', async () => {
    const { raw, words } = await pdf(new Map([[picture, { data: png, type: 'png', width: 1, height: 1 }], [missing, null]]), 'note');
    for (const word of ['Quarter view', 'the quarter view', 'Next week']) expect(words).toContain(word);
    expect(words).not.toContain('Weekly Update');
    expect(raw).not.toContain('/Title (Ari Cole)');
    expect(raw).toContain('/Title (Quarter view)');
  });
});
