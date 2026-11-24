import type { NoteDetail } from '@weekly-meeting/shared';
import { formatDay, formatFullDay, todayWib } from '../../utils/dates';
import { meetingName } from '../meetings/meetingName';
import type { NotesExport } from '../periods/notesDocx';

/**
 * One note as the Word / PDF builders take it (layout 'note'): the note's title on top, who wrote it and when, where
 * it is shared, then its text with each project section as a heading. Always in English, as every download is
 * (owner, 2026-11-24); what the person typed stays as typed.
 */
export function noteExport(note: NoteDetail, writer: { id: string; name: string }, today: string = todayWib()): Omit<NotesExport, 'images'> {
  const written = todayWib(new Date(note.createdAt));
  const shared = note.meetings.map((m) => `${meetingName(m)} · ${m.teamName} (${formatDay(m.date, 'en')})`);
  return {
    layout: 'note',
    title: note.title || 'Untitled note',
    subtitle: `Written by ${writer.name} on ${formatFullDay(written, 'en')}`,
    selection: shared.length > 0 ? `Shared on ${shared.join(', ')}` : 'Not shared on a meeting',
    exportedOn: today,
    meetings: [
      {
        id: note.id,
        date: written,
        title: null,
        seriesName: '',
        status: 'done',
        people: [
          {
            userId: writer.id,
            name: writer.name,
            notes: [{ id: note.id, title: note.title, content: note.content, projects: note.projects, updatedAt: note.updatedAt }],
          },
        ],
      },
    ],
  };
}

/** "Week 48 - 2026-11-19.docx": the note's title (or "Untitled note") and the day it was written, safe as a file name. */
export function noteFileName(note: Pick<NoteDetail, 'title' | 'createdAt'>, extension: 'docx' | 'pdf'): string {
  const title = (note.title || 'Untitled note')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, 120)
    .trim();
  return `${title || 'Untitled note'} - ${todayWib(new Date(note.createdAt))}.${extension}`;
}
