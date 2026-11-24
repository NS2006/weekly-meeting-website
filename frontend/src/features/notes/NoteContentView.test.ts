import type { EditorDoc } from '@weekly-meeting/shared';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../../i18n/i18n';
import { NoteContentView } from './NoteContentView';

afterEach(() => setLanguage('en'));

const html = (doc: EditorDoc) => renderToStaticMarkup(createElement(NoteContentView, { doc }));
const text = (value: string, marks?: unknown[]) => ({ type: 'text', text: value, ...(marks ? { marks } : {}) });

describe('NoteContentView', () => {
  it('renders the formats the editor offers', () => {
    const out = html({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2, textAlign: 'center' }, content: [text('Week 48')] },
        { type: 'paragraph', content: [text('bold', [{ type: 'bold' }]), { type: 'hardBreak' }, text('red', [{ type: 'textStyle', attrs: { color: '#e53935' } }])] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [text('one')] }] }] },
        { type: 'image', attrs: { src: '/api/attachments/6f1c2a3b-4d5e-4f60-8a9b-0c1d2e3f4a5b', alt: 'Chart', width: 240 } },
        { type: 'paragraph', content: [text('site', [{ type: 'link', attrs: { href: 'https://example.com' } }])] },
      ],
    } as EditorDoc);
    expect(out).toContain('<h2 style="text-align:center"><span>Week 48</span></h2>');
    expect(out).toContain('<strong>bold</strong>');
    expect(out).toContain('<br/>');
    expect(out).toContain('<span style="color:#e53935">red</span>');
    expect(out).toContain('<li><p><span>one</span></p></li>');
    expect(out).toContain('src="/api/attachments/6f1c2a3b-4d5e-4f60-8a9b-0c1d2e3f4a5b" alt="Chart" style="width:240px"');
    expect(out).toContain('<a href="https://example.com" target="_blank" rel="noopener noreferrer nofollow">site</a>');
    expect(out).toContain('aria-label="Open the picture larger: Chart"');
  });

  it('labels a picture in the interface language, keeping its own description as written', () => {
    setLanguage('id');
    const out = html({
      type: 'doc',
      content: [{ type: 'image', attrs: { src: '/api/attachments/6f1c2a3b-4d5e-4f60-8a9b-0c1d2e3f4a5b', alt: 'Chart' } }],
    } as EditorDoc);
    expect(out).toContain('aria-label="Buka gambar lebih besar: Chart"');
  });

  it('keeps a numbered list’s start and style (a. b. c., i. ii.), as a list pasted from Word has them', () => {
    const item = (value: string) => ({ type: 'listItem', content: [{ type: 'paragraph', content: [text(value)] }] });
    const out = html({
      type: 'doc',
      content: [
        { type: 'orderedList', attrs: { start: 3, type: 'a' }, content: [item('c')] },
        { type: 'orderedList', attrs: { start: 1, type: 'i' }, content: [item('one')] },
        { type: 'orderedList', attrs: { start: 1, type: 'disc;color:red' }, content: [item('plain')] },
      ],
    } as EditorDoc);
    expect(out).toContain('<ol start="3" type="a">');
    expect(out).toContain('<ol start="1" type="i">');
    expect(out).toContain('<ol start="1"><li>');
    expect(out).not.toContain('disc');
  });

  it('leaves out anything unsafe or unknown, and escapes text', () => {
    const out = html({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [text('<script>alert(1)</script>'), text('js', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }])] },
        { type: 'paragraph', content: [text('css', [{ type: 'textStyle', attrs: { color: 'red;background:url(x)' } }])] },
        { type: 'image', attrs: { src: 'https://tracker.example.com/pixel.gif' } },
        { type: 'iframe', attrs: { src: 'https://example.com' } },
      ],
    } as EditorDoc);
    expect(out).toContain('&lt;script&gt;');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('javascript:');
    expect(out).not.toContain('background');
    expect(out).not.toContain('tracker');
    expect(out).not.toContain('iframe');
  });
});
