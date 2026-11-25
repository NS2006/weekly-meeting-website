import type { EditorDoc, MeetingStatus, NoteMeeting, NoteProject, NoteSort, ProjectStatus } from '@weekly-meeting/shared';
import type { Db } from '../../database/pool.ts';
import { likePattern } from '../../utils/sql.ts';
import type { ProjectSection } from './content.ts';
import { SNIPPET_LENGTH } from './types.ts';

export interface NoteSummaryRow {
  id: string;
  title: string;
  snippet: string;
  createdAt: Date;
  updatedAt: Date;
  projects: NoteProject[];
  meetings: NoteMeeting[];
}

export interface NoteRow {
  id: string;
  title: string;
  content: EditorDoc | Record<string, never>;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateRow {
  noteId: string;
  noteTitle: string;
  position: number;
  content: EditorDoc;
  noteCreatedAt: Date;
  noteUpdatedAt: Date;
}

/** What narrows my notes list (all optional except the sort). */
export interface NoteFilters {
  q?: string | undefined;
  /** A project id, or 'none' for notes with no project part. */
  project?: string | undefined;
  team?: string | undefined;
  shared?: 'yes' | 'no' | undefined;
  from?: string | undefined;
  to?: string | undefined;
  sort: NoteSort;
}

/** An image stored for a note (to copy it with the note). */
export interface NoteAttachmentRow {
  id: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
}

/** What linking a note to a meeting needs to know; null when the user may not see the meeting's team. */
export interface LinkTarget {
  status: MeetingStatus;
  teamArchived: boolean;
}

export interface NotesRepository {
  /** A page of my notes matching the filters, in the filters' order; one row more than `limit` means more follow. */
  listForUser(ownerId: string, filters: NoteFilters, page: { offset: number; limit: number }, today: string): Promise<NoteSummaryRow[]>;
  /** How many of my notes match the filters. */
  countForUser(ownerId: string, filters: NoteFilters): Promise<number>;
  /** The note if this user owns it; null otherwise (missing and not-yours look the same). */
  findOwned(noteId: string, ownerId: string): Promise<NoteRow | null>;
  /** Same check; locks the note until the transaction ends. */
  lockOwned(noteId: string, ownerId: string): Promise<boolean>;
  /** The projects the note's sections are tagged with, in order of first appearance. */
  projectsOf(noteId: string): Promise<NoteProject[]>;
  /** Project ids the note's sections were tagged with at the last save. */
  taggedProjectIds(noteId: string): Promise<string[]>;
  /** The note's stored updates (its tagged sections with something written), as last saved. */
  sectionsOf(noteId: string): Promise<{ projectId: string; content: EditorDoc }[]>;
  /** The owner's projects among `ids`, with their status (others' and missing ids are left out). */
  ownedProjects(ownerId: string, ids: string[]): Promise<{ id: string; status: ProjectStatus }[]>;
  /** A new note; `id` is given when files were already stored under it (a copy's images). */
  create(ownerId: string, title: string, content: EditorDoc, text: string, id?: string): Promise<string>;
  /** Saves when `version` is still the stored one, and bumps it; null when it is not (someone saved in between). */
  save(
    noteId: string,
    version: number,
    changes: { title?: string; content?: EditorDoc; text?: string },
  ): Promise<{ version: number; updatedAt: Date } | null>;
  /** Replaces the note's derived section rows with its tagged sections. */
  replaceSections(noteId: string, sections: ProjectSection[]): Promise<void>;
  remove(noteId: string): Promise<void>;
  /** Storage keys of a note's images (to delete the files after the note). */
  attachmentKeys(noteId: string): Promise<string[]>;
  /** A note's stored images. */
  attachmentsOf(noteId: string): Promise<NoteAttachmentRow[]>;
  /** Records an image already stored under the note's folder (a copied one), with its own id. */
  addAttachment(noteId: string, image: NoteAttachmentRow): Promise<void>;
  /** The project's sections in the owner's notes, newest note first; one row more than `limit` means more follow. */
  updatesForProject(projectId: string, ownerId: string, page: { offset: number; limit: number }): Promise<UpdateRow[]>;
  /** The meetings the note is linked to, oldest first. */
  meetingsOf(noteId: string, today: string): Promise<NoteMeeting[]>;
  /**
   * The meeting, if the user may see its team (a member; a deleted team only for its leader, as the team pages).
   * Shares a lock on the meeting row, so a cancellation in progress finishes first.
   */
  linkTarget(meetingId: string, userId: string): Promise<LinkTarget | null>;
  link(noteId: string, meetingId: string): Promise<void>;
  unlink(noteId: string, meetingId: string): Promise<void>;
}

// content_text has one line per paragraph, heading or list item: lines are joined with " · " so "Done" and "Next"
// do not run into the sentence after them; other whitespace collapses to one space.
const SNIPPET = `left(btrim(regexp_replace(regexp_replace(n.content_text, '\\s*\\n\\s*', ' · ', 'g'), '\\s+', ' ', 'g')), ${SNIPPET_LENGTH})`;

// The projects a note's sections are tagged with, in order of first appearance, as JSON.
const PROJECTS_OF = `
  COALESCE((SELECT json_agg(json_build_object('id', p.id, 'name', p.name, 'status', p.status) ORDER BY x.first)
              FROM (SELECT s.project_id, min(s.position) AS first FROM note_sections s
                     WHERE s.note_id = n.id GROUP BY s.project_id) x
              JOIN projects p ON p.id = x.project_id), '[]'::json)`;

// The meetings a note is linked to, oldest first, as JSON. `todayParam` names the parameter holding today's date
// (a scheduled meeting whose day has passed is `done`, as everywhere else).
const MEETINGS_OF = (todayParam: string) => `
  COALESCE((SELECT json_agg(json_build_object(
                     'id', m.id, 'date', to_char(m.meeting_date, 'YYYY-MM-DD'), 'title', m.title,
                     'seriesName', s.name, 'teamId', t.id, 'teamName', t.name,
                     'status', CASE WHEN m.status = 'scheduled' AND m.meeting_date < ${todayParam}::date
                                    THEN 'done' ELSE m.status::text END)
                   ORDER BY m.meeting_date, m.id)
              FROM note_meetings nm
              JOIN meetings m ON m.id = nm.meeting_id
              JOIN meeting_series s ON s.id = m.series_id
              JOIN teams t ON t.id = s.team_id
             WHERE nm.note_id = n.id), '[]'::json)`;

const ORDER: Record<NoteSort, string> = {
  newest: 'n.created_at DESC, n.id DESC',
  oldest: 'n.created_at ASC, n.id ASC',
  edited: 'n.updated_at DESC, n.id DESC',
};

/**
 * The WHERE clause for my notes and its values ($1 is the owner). Only fixed SQL is added; every value is a
 * parameter. Days are Indonesia days: `to` includes the whole day.
 */
function whereOf(ownerId: string, f: NoteFilters): { sql: string; values: unknown[] } {
  const values: unknown[] = [ownerId];
  const param = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  const parts = ['n.user_id = $1'];
  if (f.q) {
    const q = param(likePattern(f.q));
    parts.push(`(n.title ILIKE ${q} OR n.content_text ILIKE ${q})`);
  }
  if (f.project === 'none') parts.push('NOT EXISTS (SELECT 1 FROM note_sections s WHERE s.note_id = n.id)');
  else if (f.project) parts.push(`EXISTS (SELECT 1 FROM note_sections s WHERE s.note_id = n.id AND s.project_id = ${param(f.project)})`);
  if (f.team) {
    parts.push(`EXISTS (SELECT 1 FROM note_meetings nm
                          JOIN meetings m ON m.id = nm.meeting_id
                          JOIN meeting_series ms ON ms.id = m.series_id
                         WHERE nm.note_id = n.id AND ms.team_id = ${param(f.team)})`);
  }
  if (f.shared === 'yes') parts.push('EXISTS (SELECT 1 FROM note_meetings nm WHERE nm.note_id = n.id)');
  if (f.shared === 'no') parts.push('NOT EXISTS (SELECT 1 FROM note_meetings nm WHERE nm.note_id = n.id)');
  if (f.from) parts.push(`n.created_at >= (${param(f.from)}::date::timestamp AT TIME ZONE 'Asia/Jakarta')`);
  if (f.to) parts.push(`n.created_at < ((${param(f.to)}::date + 1)::timestamp AT TIME ZONE 'Asia/Jakarta')`);
  return { sql: parts.join(' AND '), values };
}

// Every query that starts from a note id also checks its owner (n.user_id).
export function createNotesRepository(db: Db): NotesRepository {
  return {
    async listForUser(ownerId, filters, page, today) {
      const where = whereOf(ownerId, filters);
      const at = (i: number) => `$${where.values.length + i}`;
      const { rows } = await db.query<NoteSummaryRow>(
        `SELECT n.id, n.title, n.created_at AS "createdAt", n.updated_at AS "updatedAt", ${SNIPPET} AS snippet,
                ${PROJECTS_OF} AS projects, ${MEETINGS_OF(at(3))} AS meetings
           FROM notes n
          WHERE ${where.sql}
          ORDER BY ${ORDER[filters.sort]}
          LIMIT ${at(1)} OFFSET ${at(2)}`,
        [...where.values, page.limit + 1, page.offset, today],
      );
      return rows;
    },

    async countForUser(ownerId, filters) {
      const where = whereOf(ownerId, filters);
      const { rows } = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM notes n WHERE ${where.sql}`, where.values);
      return rows[0]?.n ?? 0;
    },

    async findOwned(noteId, ownerId) {
      const { rows } = await db.query<NoteRow>(
        `SELECT n.id, n.title, n.content, n.version, n.created_at AS "createdAt", n.updated_at AS "updatedAt"
           FROM notes n WHERE n.id = $1 AND n.user_id = $2`,
        [noteId, ownerId],
      );
      return rows[0] ?? null;
    },

    async lockOwned(noteId, ownerId) {
      const { rows } = await db.query('SELECT 1 FROM notes WHERE id = $1 AND user_id = $2 FOR UPDATE', [noteId, ownerId]);
      return rows.length > 0;
    },

    async projectsOf(noteId) {
      const { rows } = await db.query<{ projects: NoteProject[] }>(`SELECT ${PROJECTS_OF} AS projects FROM notes n WHERE n.id = $1`, [
        noteId,
      ]);
      return rows[0]?.projects ?? [];
    },

    async taggedProjectIds(noteId) {
      const { rows } = await db.query<{ id: string }>('SELECT DISTINCT project_id AS id FROM note_sections WHERE note_id = $1', [
        noteId,
      ]);
      return rows.map((row) => row.id);
    },

    async sectionsOf(noteId) {
      const { rows } = await db.query<{ projectId: string; content: EditorDoc }>(
        'SELECT project_id AS "projectId", content FROM note_sections WHERE note_id = $1 ORDER BY position',
        [noteId],
      );
      return rows;
    },

    async ownedProjects(ownerId, ids) {
      if (ids.length === 0) return [];
      const { rows } = await db.query<{ id: string; status: ProjectStatus }>(
        'SELECT id, status FROM projects WHERE user_id = $1 AND id = ANY($2::uuid[])',
        [ownerId, ids],
      );
      return rows;
    },

    async create(ownerId, title, content, text, id) {
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO notes (id, user_id, title, content, content_text)
         VALUES (COALESCE($5::uuid, gen_random_uuid()), $1, $2, $3::jsonb, $4) RETURNING id`,
        [ownerId, title, JSON.stringify(content), text, id ?? null],
      );
      const noteId = rows[0]?.id;
      if (!noteId) throw new Error('note insert returned no id');
      return noteId;
    },

    async save(noteId, version, changes) {
      const { rows } = await db.query<{ version: number; updatedAt: Date }>(
        `UPDATE notes
            SET title = COALESCE($3, title),
                content = COALESCE($4::jsonb, content),
                content_text = COALESCE($5, content_text),
                version = version + 1,
                updated_at = now()
          WHERE id = $1 AND version = $2
          RETURNING version, updated_at AS "updatedAt"`,
        [
          noteId,
          version,
          changes.title ?? null,
          changes.content === undefined ? null : JSON.stringify(changes.content),
          changes.text ?? null,
        ],
      );
      return rows[0] ?? null;
    },

    async replaceSections(noteId, sections) {
      await db.query('DELETE FROM note_sections WHERE note_id = $1', [noteId]);
      for (const section of sections) {
        if (!section.projectId) continue;
        await db.query(
          `INSERT INTO note_sections (note_id, position, project_id, content, content_text)
           VALUES ($1, $2, $3, $4::jsonb, $5)`,
          [noteId, section.position, section.projectId, JSON.stringify(section.content), section.text],
        );
      }
    },

    async remove(noteId) {
      await db.query('DELETE FROM notes WHERE id = $1', [noteId]);
    },

    async attachmentKeys(noteId) {
      const { rows } = await db.query<{ key: string }>('SELECT storage_key AS key FROM attachments WHERE note_id = $1', [
        noteId,
      ]);
      return rows.map((row) => row.key);
    },

    async attachmentsOf(noteId) {
      const { rows } = await db.query<NoteAttachmentRow>(
        `SELECT id, storage_key AS "storageKey", mime_type AS "mimeType", size_bytes::int AS "sizeBytes"
           FROM attachments WHERE note_id = $1`,
        [noteId],
      );
      return rows;
    },

    async addAttachment(noteId, image) {
      await db.query('INSERT INTO attachments (id, note_id, storage_key, mime_type, size_bytes) VALUES ($1, $2, $3, $4, $5)', [
        image.id,
        noteId,
        image.storageKey,
        image.mimeType,
        image.sizeBytes,
      ]);
    },

    async updatesForProject(projectId, ownerId, page) {
      const { rows } = await db.query<UpdateRow>(
        `SELECT s.note_id AS "noteId", n.title AS "noteTitle", s.position, s.content,
                n.created_at AS "noteCreatedAt", n.updated_at AS "noteUpdatedAt"
           FROM note_sections s
           JOIN notes n ON n.id = s.note_id
          WHERE s.project_id = $1 AND n.user_id = $2
          ORDER BY n.created_at DESC, n.id DESC, s.position
          LIMIT $3 OFFSET $4`,
        [projectId, ownerId, page.limit + 1, page.offset],
      );
      return rows;
    },

    async meetingsOf(noteId, today) {
      const { rows } = await db.query<{ meetings: NoteMeeting[] }>(
        `SELECT ${MEETINGS_OF('$2')} AS meetings FROM notes n WHERE n.id = $1`,
        [noteId, today],
      );
      return rows[0]?.meetings ?? [];
    },

    async linkTarget(meetingId, userId) {
      // The team first, in its own statement (the order every team change uses: team, then meetings). A leader's
      // schedule change holds it exclusively and removes only meetings without notes, so it either finishes before
      // this link (the meeting may be gone: 404) or starts after it (and sees the link).
      await db.query(
        `SELECT t.id FROM teams t
           JOIN meeting_series s ON s.team_id = t.id
           JOIN meetings m ON m.series_id = s.id
          WHERE m.id = $1
            FOR SHARE OF t`,
        [meetingId],
      );
      const { rows } = await db.query<LinkTarget>(
        `SELECT m.status, t.archived_at IS NOT NULL AS "teamArchived"
           FROM meetings m
           JOIN meeting_series s ON s.id = m.series_id
           JOIN teams t ON t.id = s.team_id
           JOIN team_members tm ON tm.team_id = t.id AND tm.user_id = $2
          WHERE m.id = $1 AND (t.archived_at IS NULL OR tm.role = 'leader')
            FOR SHARE OF m`,
        [meetingId, userId],
      );
      return rows[0] ?? null;
    },

    async link(noteId, meetingId) {
      await db.query('INSERT INTO note_meetings (note_id, meeting_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [noteId, meetingId]);
    },

    async unlink(noteId, meetingId) {
      await db.query('DELETE FROM note_meetings WHERE note_id = $1 AND meeting_id = $2', [noteId, meetingId]);
    },
  };
}
