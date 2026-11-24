import type { Db } from '../../database/pool.ts';
import type { ImageType } from './types.ts';

/** One of my stored pictures, with the note it belongs to. */
export interface OwnedAttachment extends StoredAttachment {
  id: string;
  noteId: string;
}

export interface StoredAttachment {
  storageKey: string;
  mimeType: ImageType;
  sizeBytes: number;
}

export interface AttachmentsRepository {
  /** The note's image count if this user owns the note; null otherwise. Locks the note. */
  lockNoteForUpload(noteId: string, ownerId: string): Promise<{ images: number } | null>;
  create(noteId: string, image: StoredAttachment): Promise<string>;
  /** The pictures among `ids` that belong to notes of this user (others' and missing ids are left out). */
  ownedBy(ids: readonly string[], userId: string): Promise<OwnedAttachment[]>;
  /**
   * The stored image if this user may read its note: they own it, or it is linked to a meeting of a team they may see
   * (a member; a deleted team only for its leader). Null otherwise.
   */
  findReadable(attachmentId: string, userId: string): Promise<StoredAttachment | null>;
}

export function createAttachmentsRepository(db: Db): AttachmentsRepository {
  return {
    async lockNoteForUpload(noteId, ownerId) {
      const { rows } = await db.query('SELECT 1 FROM notes WHERE id = $1 AND user_id = $2 FOR UPDATE', [noteId, ownerId]);
      if (rows.length === 0) return null;
      const count = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM attachments WHERE note_id = $1', [noteId]);
      return { images: count.rows[0]?.n ?? 0 };
    },

    async create(noteId, image) {
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO attachments (note_id, storage_key, mime_type, size_bytes) VALUES ($1, $2, $3, $4) RETURNING id`,
        [noteId, image.storageKey, image.mimeType, image.sizeBytes],
      );
      const attachmentId = rows[0]?.id;
      if (!attachmentId) throw new Error('attachment insert returned no id');
      return attachmentId;
    },

    async ownedBy(ids, userId) {
      const { rows } = await db.query<OwnedAttachment>(
        `SELECT a.id, a.note_id AS "noteId", a.storage_key AS "storageKey", a.mime_type AS "mimeType",
                a.size_bytes::int AS "sizeBytes"
           FROM attachments a
           JOIN notes n ON n.id = a.note_id
          WHERE a.id = ANY($1::uuid[]) AND n.user_id = $2`,
        [ids, userId],
      );
      return rows;
    },

    // Same rule as reading the note (PRD section 9): its owner, or a member of a team with a meeting it is linked to.
    async findReadable(attachmentId, userId) {
      const { rows } = await db.query<StoredAttachment>(
        `SELECT a.storage_key AS "storageKey", a.mime_type AS "mimeType", a.size_bytes::int AS "sizeBytes"
           FROM attachments a
           JOIN notes n ON n.id = a.note_id
          WHERE a.id = $1
            AND (n.user_id = $2
                 OR EXISTS (SELECT 1
                              FROM note_meetings nm
                              JOIN meetings m ON m.id = nm.meeting_id
                              JOIN meeting_series s ON s.id = m.series_id
                              JOIN teams t ON t.id = s.team_id
                              JOIN team_members tm ON tm.team_id = t.id AND tm.user_id = $2
                             WHERE nm.note_id = n.id AND (t.archived_at IS NULL OR tm.role = 'leader')))`,
        [attachmentId, userId],
      );
      return rows[0] ?? null;
    },
  };
}
