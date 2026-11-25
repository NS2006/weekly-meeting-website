import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { text as readText } from 'node:stream/consumers';
import { createLocalStorage, newStorageKey } from '../src/modules/attachments/storage.ts';
import { sniffImageType } from '../src/modules/attachments/types.ts';
import {
  attachmentIdsIn,
  hasContent,
  limitProjects,
  MAX_SECTIONS,
  normalizeColor,
  plainText,
  projectSections,
  safeHref,
  sameJson,
  sanitizeDoc,
  withAttachments,
} from '../src/modules/notes/content.ts';

const doc = (...content: unknown[]) => ({ type: 'doc', content });
const IMG_A = '/api/attachments/3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b';
const IMG_B = '/api/attachments/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
/** An empty paragraph has no `content` key, as the editor writes it. */
const p = (...content: unknown[]) => (content.length > 0 ? { type: 'paragraph', content } : { type: 'paragraph' });
const t = (text: string, marks?: unknown[]) => (marks ? { type: 'text', text, marks } : { type: 'text', text });

function ok(input: unknown) {
  const result = sanitizeDoc(input);
  if (!result.ok) throw new Error(`refused at ${result.path.join('.')}: ${result.reason}`);
  return result;
}
const refused = (input: unknown) => {
  const result = sanitizeDoc(input);
  return result.ok ? null : result.path.join('.');
};

describe('sanitizeDoc()', () => {
  it('keeps every format the editor offers, unchanged', () => {
    const full = doc(
      { type: 'heading', attrs: { level: 2, textAlign: 'center' }, content: [t('Week 48')] },
      p(
        t('bold', [{ type: 'bold' }]),
        t(' and '),
        t('red link', [{ type: 'link', attrs: { href: 'https://example.com/a?b=1' } }, { type: 'textStyle', attrs: { color: '#d32f2f' } }]),
        { type: 'hardBreak' },
        t('code', [{ type: 'code' }, { type: 'italic' }, { type: 'underline' }, { type: 'strike' }]),
      ),
      { type: 'bulletList', content: [{ type: 'listItem', content: [p(t('one')), { type: 'orderedList', attrs: { start: 3 }, content: [{ type: 'listItem', content: [p(t('nested'))] }] }] }] },
      { type: 'blockquote', content: [p(t('quoted'))] },
      { type: 'codeBlock', attrs: { language: 'ts' }, content: [t('const a = 1;')] },
      { type: 'horizontalRule' },
      {
        type: 'table',
        content: [
          { type: 'tableRow', content: [{ type: 'tableHeader', attrs: { colspan: 1, rowspan: 1, colwidth: [120] }, content: [p(t('Head'))] }] },
          { type: 'tableRow', content: [{ type: 'tableCell', attrs: { colspan: 2, rowspan: 1, colwidth: null, align: 'right' }, content: [p()] }] },
        ],
      },
      { type: 'image', attrs: { src: IMG_A, alt: 'Chart', title: null, width: 320 } },
      p(),
    );
    const result = ok(full);
    // colwidth null is "auto" (dropped, the default); title null is dropped the same way.
    const expected = structuredClone(full) as { content: { content?: { content: { attrs: Record<string, unknown> }[] }[] }[] };
    delete (expected.content[6]?.content?.[1]?.content[0]?.attrs as Record<string, unknown>).colwidth;
    delete (expected.content[7] as unknown as { attrs: Record<string, unknown> }).attrs.title;
    expect(result.doc).toEqual(expected);
    expect(result.text).toBe('Week 48\nbold and red link\ncode\none\nnested\nquoted\nconst a = 1;\nHead');
  });

  it('refuses what the editor never makes, naming only the path', () => {
    expect(refused(null)).toBe('');
    expect(refused({ type: 'paragraph' })).toBe('');
    expect(refused(doc())).toBe(''); // a document needs at least one block
    expect(refused(doc({ type: 'script', content: [] }))).toBe('content.0');
    expect(refused(doc(p({ type: 'paragraph' })))).toBe('content.0.content.0'); // a block inside a paragraph
    expect(refused(doc(t('loose text')))).toBe('content.0');
    expect(refused(doc(p(t(''))))).toBe('content.0.content.0');
    expect(refused(doc(p(t('x', [{ type: 'onclick' }]))))).toBe('content.0.content.0.marks.0');
    expect(refused(doc({ type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'heading', content: [] }] }] }))).toBe(
      'content.0.content.0',
    ); // a list item starts with a paragraph
    expect(refused(doc({ type: 'image', attrs: { src: 'https://tracker.example.com/pixel.gif' } }))).toBe('content.0');
    expect(refused(doc({ type: 'image', attrs: { src: 'data:image/png;base64,AAAA' } }))).toBe('content.0');
    expect(refused(doc({ type: 'image', attrs: { src: '/api/attachments/42' } }))).toBe('content.0'); // ids are UUIDs
    expect(refused(doc({ type: 'horizontalRule', content: [p()] }))).toBe('content.0');
    expect(refused(doc({ type: 'table', content: [] }))).toBe('content.0');
  });

  it('refuses documents nested too deep', () => {
    let node: unknown = p(t('deep'));
    for (let i = 0; i < 50; i += 1) node = { type: 'blockquote', content: [node] };
    expect(sanitizeDoc(doc(node)).ok).toBe(false);
  });

  it('drops attributes and keys it does not know, and invalid attribute values', () => {
    const result = ok({
      type: 'doc',
      extra: 'dropped',
      content: [
        { type: 'paragraph', attrs: { textAlign: 'middle', onclick: 'x', style: 'color:red' }, content: [t('a')] },
        { type: 'heading', attrs: { level: 7 }, content: [t('b')] },
        { type: 'codeBlock', attrs: { language: '<script>' }, content: [t('c', [{ type: 'bold' }])] },
        { type: 'image', attrs: { src: IMG_B, width: 240.6, height: '120' } },
      ],
    });
    expect(result.doc).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [t('a')] },
        { type: 'heading', content: [t('b')] },
        { type: 'codeBlock', content: [t('c')] },
        { type: 'image', attrs: { src: IMG_B, width: 241 } },
      ],
    });
  });

  it('drops a link to a dangerous address or a color that is not a color, keeping the text', () => {
    const result = ok(
      doc(
        p(
          t('js', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }, { type: 'bold' }, { type: 'bold' }]),
          t('css', [{ type: 'textStyle', attrs: { color: 'red; background:url(x)' } }]),
          t('word', [{ type: 'textStyle', attrs: { color: 'rgb(25, 118, 210)' } }]),
        ),
      ),
    );
    expect(result.doc.content?.[0]?.content).toEqual([
      t('js', [{ type: 'bold' }]),
      t('css'),
      t('word', [{ type: 'textStyle', attrs: { color: '#1976d2' } }]),
    ]);
  });
});

describe('project sections', () => {
  const A = '6f1c2a3b-4d5e-4f60-8a9b-0c1d2e3f4a5b';
  const B = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
  const sec = (projectId: unknown, ...content: unknown[]) => ({ type: 'projectSection', attrs: { projectId }, content });

  it('keeps sections at the top level and drops a project id that is not a UUID', () => {
    const result = ok(doc(p(t('General')), sec(A, p(t('One'))), sec('75', p(t('Two'))), sec(A.toUpperCase(), p(t('Three')))));
    expect(result.doc.content?.[1]).toEqual(sec(A, p(t('One'))));
    expect(result.doc.content?.[2]).toEqual({ type: 'projectSection', content: [p(t('Two'))] }); // untagged
    expect(result.doc.content?.[3]).toEqual(sec(A, p(t('Three')))); // lower-cased
  });

  it('takes at most MAX_SECTIONS project parts in a note (stress-test review)', () => {
    const parts = (n: number) => doc(...Array.from({ length: n }, (_, i) => sec(A, p(t(`Part ${i}`)))));
    expect(refused(parts(MAX_SECTIONS))).toBeNull();
    expect(refused(parts(MAX_SECTIONS + 1))).toBe('content');
  });

  it('tells the same JSON whatever the order of its keys (as PostgreSQL stores it)', () => {
    expect(sameJson({ type: 'doc', content: [{ type: 'text', text: 'a', marks: [{ type: 'bold' }] }] }, { content: [{ marks: [{ type: 'bold' }], text: 'a', type: 'text' }], type: 'doc' })).toBe(true);
    expect(sameJson({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(sameJson({ a: [1, 2] }, { a: [2, 1] })).toBe(false); // order inside a list counts
    expect(sameJson({ a: '1' }, { a: 1 })).toBe(false);
  });

  it('refuses sections inside sections, lists or tables, and empty sections', () => {
    expect(refused(doc(sec(A, sec(B, p(t('x'))))))).toBe('content.0.content.0');
    expect(refused(doc({ type: 'blockquote', content: [sec(A, p(t('x')))] }))).toBe('content.0.content.0');
    expect(refused(doc({ type: 'projectSection', attrs: { projectId: A } }))).toBe('content.0');
  });

  it('lists the sections in order with their own text, and limits tags to allowed projects', () => {
    const source = ok(doc(p(t('General')), sec(A, p(t('Shipped'))), sec(B, p(t('Fixed')), p(t('Next'))))).doc;
    expect(projectSections(source)).toEqual([
      { position: 0, projectId: A, content: doc(p(t('Shipped'))), text: 'Shipped' },
      { position: 1, projectId: B, content: doc(p(t('Fixed')), p(t('Next'))), text: 'Fixed\nNext' },
    ]);
    const limited = limitProjects(source, new Set([B]));
    expect(limited.content?.[1]).toEqual({ type: 'projectSection', content: [p(t('Shipped'))] });
    expect(projectSections(limited).map((x) => x.projectId)).toEqual([null, B]);
  });
});

describe('hasContent()', () => {
  it('counts text, images and dividers, not empty lines, lists or tables', () => {
    expect(hasContent(doc(p(), p(t('  '))) as never)).toBe(false);
    expect(hasContent(doc({ type: 'bulletList', content: [{ type: 'listItem', content: [p()] }] }) as never)).toBe(false);
    expect(hasContent(doc({ type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [p()] }] }] }) as never)).toBe(false);
    expect(hasContent(doc(p(), p(t('Done.'))) as never)).toBe(true);
    expect(hasContent(doc({ type: 'image', attrs: { src: IMG_A } }) as never)).toBe(true);
    expect(hasContent(doc({ type: 'horizontalRule' }) as never)).toBe(true);
  });
});

describe('normalizeColor() and safeHref()', () => {
  it('accepts hex and rgb colors only', () => {
    expect(normalizeColor('#ABC')).toBe('#aabbcc');
    expect(normalizeColor('#0095DA')).toBe('#0095da');
    expect(normalizeColor('rgb(0, 149, 218)')).toBe('#0095da');
    for (const bad of ['red', 'rgb(300, 0, 0)', '#12345', 'var(--x)', 42, null]) expect(normalizeColor(bad)).toBeUndefined();
  });

  it('accepts http, https and mailto links only', () => {
    expect(safeHref(' https://example.com ')).toBe('https://example.com');
    expect(safeHref('mailto:someone@example.test')).toBe('mailto:someone@example.test');
    for (const bad of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html,x', '/relative', 'ftp://x', '']) {
      expect(safeHref(bad)).toBeUndefined();
    }
  });
});

describe('plainText()', () => {
  it('puts each block and line break on its own line, skipping empty ones', () => {
    expect(plainText(doc(p(t('  a  '), { type: 'hardBreak' }, t('b')), p(), p(t('c'))) as never)).toBe('a\nb\nc');
  });
});

describe('sniffImageType()', () => {
  const bytes = (...values: (number | string)[]) =>
    Buffer.concat(values.map((v) => (typeof v === 'string' ? Buffer.from(v, 'latin1') : Buffer.from([v]))));

  it('knows PNG, JPEG, GIF and WebP by their first bytes', () => {
    expect(sniffImageType(bytes(0x89, 'PNG\r\n', 0x1a, '\n', 'rest'))).toBe('image/png');
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(sniffImageType(bytes('GIF89a...'))).toBe('image/gif');
    expect(sniffImageType(bytes('RIFF', 0, 0, 0, 0, 'WEBPVP8 '))).toBe('image/webp');
  });

  it('refuses SVG, HTML and anything else, whatever it is called', () => {
    expect(sniffImageType(bytes('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'))).toBeNull();
    expect(sniffImageType(bytes('<html>'))).toBeNull();
    expect(sniffImageType(bytes('RIFF', 0, 0, 0, 0, 'WAVE'))).toBeNull();
    expect(sniffImageType(Buffer.alloc(0))).toBeNull();
  });
});

describe("a note's images (for copies)", () => {
  const idA = IMG_A.slice('/api/attachments/'.length);
  const idB = IMG_B.slice('/api/attachments/'.length);
  const idC = '7c6b5a49-3827-4615-a4b3-c2d1e0f9a8b7';
  const image = (src: string) => ({ type: 'image', attrs: { src, alt: 'Chart', width: 300 } });
  const note = doc(
    image(IMG_A),
    { type: 'projectSection', attrs: { projectId: 'p1' }, content: [image(IMG_B), image(IMG_A)] },
    { type: 'paragraph', content: [{ type: 'text', text: 'After' }] },
  );

  it('lists each attachment used, wherever it is', () => {
    expect([...attachmentIdsIn(note as never)]).toEqual([idA, idB]);
    expect(attachmentIdsIn(doc({ type: 'paragraph' }) as never).size).toBe(0);
  });

  it('moves image sources to other attachments, leaving everything else as it was', () => {
    const moved = withAttachments(note as never, new Map([[idA, idC]]));
    expect(moved).toEqual(
      doc(
        image(`/api/attachments/${idC}`),
        { type: 'projectSection', attrs: { projectId: 'p1' }, content: [image(IMG_B), image(`/api/attachments/${idC}`)] },
        { type: 'paragraph', content: [{ type: 'text', text: 'After' }] },
      ),
    );
    expect(note.content[0]).toEqual(image(IMG_A)); // the original is untouched
  });
});

describe('local storage', () => {
  let dir = '';
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'wm-storage-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('stores, reads and removes files under notes/<note id>/', async () => {
    const storage = createLocalStorage(dir);
    const key = newStorageKey('6f1c2a3b-4d5e-4f60-8a9b-0c1d2e3f4a5b');
    await storage.put(key, Buffer.from('hello'), 'image/png');
    await expect(storage.put(key, Buffer.from('again'), 'image/png')).rejects.toThrow(); // never overwrites
    const stream = await storage.open(key);
    expect(stream && (await readText(stream))).toBe('hello');

    await storage.remove([key]);
    expect(await storage.open(key)).toBeNull();
    expect(await readdir(path.join(dir, 'notes'))).toEqual([]); // the empty note folder went too
    await expect(storage.remove([key])).resolves.toBeUndefined(); // missing files are fine
  });

  it('copies a file to a new key, never over another, and says when the source is missing', async () => {
    const storage = createLocalStorage(dir);
    const from = newStorageKey('6f1c2a3b-4d5e-4f60-8a9b-0c1d2e3f4a5b');
    const to = newStorageKey('1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d');
    await storage.put(from, Buffer.from('picture'), 'image/png');
    await expect(storage.copy(from, to)).resolves.toBe(true);
    const stream = await storage.open(to);
    expect(stream && (await readText(stream))).toBe('picture');
    await expect(storage.copy(from, to)).rejects.toThrow(); // never overwrites

    const gone = newStorageKey('2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e');
    const nowhere = newStorageKey('3c4d5e6f-7a8b-4c9d-8e0f-2a3b4c5d6e7f');
    await expect(storage.copy(gone, nowhere)).resolves.toBe(false);
    await storage.remove([from, to]);
    expect(await readdir(path.join(dir, 'notes'))).toEqual([]); // no folder left behind
  });

  it('still reads keys stored before ids became UUIDs (numeric note folder)', async () => {
    const storage = createLocalStorage(dir);
    await expect(storage.open('notes/7/00000000-0000-4000-8000-000000000001')).resolves.toBeNull();
  });

  it('refuses keys it did not make (no path tricks)', async () => {
    const storage = createLocalStorage(dir);
    for (const key of ['../secret', 'notes/1/../../x', '/etc/passwd', 'notes/1/abc']) {
      await expect(storage.open(key)).rejects.toThrow('invalid storage key');
    }
  });
});
