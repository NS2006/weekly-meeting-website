import { describe, expect, it } from 'vitest';
import type { NoteDetail } from '@weekly-meeting/shared';
import { setLanguage } from '../../i18n/i18n';
import { noteExport, noteFileName } from './noteExport';
import { attachmentIdsIn, withAttachments } from './sectionClipboard';

const note: NoteDetail = {
  id: 'n1',
  title: 'Week 47',
  content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Done' }] }] },
  version: 3,
  createdAt: '2026-11-18T18:30:00.000Z', // 19 November in Indonesia
  updatedAt: '2026-11-20T03:00:00.000Z',
  projects: [{ id: 'p1', name: 'Quarter view', status: 'active' }],
  meetings: [
    { id: 'm1', date: '2026-11-19', title: null, seriesName: 'Weekly Update', teamId: 't1', teamName: 'Team Example', status: 'done' },
  ],
};

describe('one note as a download', () => {
  it('is in English whatever the screen shows, with who wrote it, when, and where it is shared', () => {
    setLanguage('id');
    try {
      const input = noteExport(note, { id: 'u1', name: 'Ari Cole' }, '2026-11-24');
      expect(input).toMatchObject({
        layout: 'note',
        title: 'Week 47',
        subtitle: 'Written by Ari Cole on Thursday, 19 November 2026',
        selection: 'Shared on Weekly Update · Team Example (Thu 19 Nov)',
        exportedOn: '2026-11-24',
      });
      expect(input.meetings).toHaveLength(1);
      expect(input.meetings[0]?.people[0]?.notes[0]).toMatchObject({ id: 'n1', title: 'Week 47', projects: note.projects });
      expect(noteExport({ ...note, title: '', meetings: [] }, { id: 'u1', name: 'Ari Cole' })).toMatchObject({
        title: 'Untitled note',
        selection: 'Not shared on a meeting',
      });
    } finally {
      setLanguage('en');
    }
  });

  it('is named after the note and the day it was written, safely', () => {
    expect(noteFileName(note, 'docx')).toBe('Week 47 - 2026-11-19.docx');
    expect(noteFileName({ ...note, title: 'a/b: "c"?' }, 'pdf')).toBe('a b c - 2026-11-19.pdf');
    expect(noteFileName({ ...note, title: '...' }, 'pdf')).toBe('Untitled note - 2026-11-19.pdf');
    expect(noteFileName({ ...note, title: '' }, 'docx')).toBe('Untitled note - 2026-11-19.docx');
  });
});

describe('a copied section', () => {
  const a = '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b';
  const b = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
  const section = {
    type: 'projectSection',
    attrs: { projectId: 'p1' },
    content: [
      { type: 'image', attrs: { src: `/api/attachments/${a}`, alt: 'Chart' } },
      { type: 'paragraph', content: [{ type: 'text', text: 'Done' }] },
      { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'image', attrs: { src: `/api/attachments/${b}` } }, { type: 'image', attrs: { src: `/api/attachments/${a}` } }] }] }] },
    ],
  };

  it('lists its pictures once each, wherever they are', () => {
    expect(attachmentIdsIn(section)).toEqual([a, b]);
    expect(attachmentIdsIn({ type: 'paragraph' })).toEqual([]);
  });

  it('points its pictures at their copies, leaving the rest as it was', () => {
    const c = '7c6b5a49-3827-4615-a4b3-c2d1e0f9a8b7';
    const moved = withAttachments(section, new Map([[a, c]]));
    expect(attachmentIdsIn(moved)).toEqual([c, b]);
    expect(moved.attrs).toEqual({ projectId: 'p1' });
    expect(moved.content?.[1]).toEqual(section.content[1]);
    expect(attachmentIdsIn(section)).toEqual([a, b]); // the copied section itself is untouched
  });
});
