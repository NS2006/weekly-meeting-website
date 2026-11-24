/**
 * Turns a data set (simulated or real) into rows and files, and writes it. `prepare` is pure (it renders the images and runs
 * every note through the same schema check and section rules as the app), so the tests can check exactly what would
 * be stored; `removeDummyData` and `writeScenario` run inside the seed's transaction.
 */
import { isDeepStrictEqual } from 'node:util';
import { newStorageKey } from '../../modules/attachments/storage.ts';
import { MAX_IMAGE_BYTES, sniffImageType, type ImageType } from '../../modules/attachments/types.ts';
import { hasContent, projectSections, sanitizeDoc, type ProjectSection } from '../../modules/notes/content.ts';
import type { Db } from '../pool.ts';
import { renderImage } from './png.ts';
import { SEED_DOMAIN, type Scenario, type SeedNote } from './scenario.ts';

export interface PreparedFile {
  key: string;
  data: Buffer;
  mimeType: ImageType;
  attachmentId: string;
  noteId: string;
  createdAt: Date;
}

export interface PreparedNote {
  note: SeedNote;
  /** Plain text, as the app extracts it on save. */
  text: string;
  /** The rows of note_sections: tagged sections with something written in them (as the notes service saves them). */
  sections: ProjectSection[];
}

export interface Prepared {
  scenario: Scenario;
  notes: PreparedNote[];
  files: PreparedFile[];
}

const ATTACHMENT_PATH = '/api/attachments/';

function imageIds(node: { type: string; attrs?: Record<string, unknown>; content?: unknown[] }): string[] {
  const own = node.type === 'image' && typeof node.attrs?.src === 'string' ? [node.attrs.src.slice(ATTACHMENT_PATH.length)] : [];
  return [...own, ...(node.content ?? []).flatMap((child) => imageIds(child as typeof node))];
}

/** Checks every note like the app does and renders the images. Throws on anything the app would not store. */
export function prepare(scenario: Scenario): Prepared {
  const projectsOf = new Map<string, Set<string>>();
  for (const project of scenario.projects) {
    const owned = projectsOf.get(project.userId) ?? new Set<string>();
    owned.add(project.id);
    projectsOf.set(project.userId, owned);
  }

  const notes = scenario.notes.map((note): PreparedNote => {
    const checked = sanitizeDoc(note.content);
    if (!checked.ok) throw new Error(`seed note ${note.id} is refused by the editor schema at ${checked.path.join('.')}`);
    if (!isDeepStrictEqual(checked.doc, note.content)) throw new Error(`seed note ${note.id} is not in the editor's canonical form`);
    const sections = projectSections(checked.doc).filter((s) => s.projectId !== null && hasContent(s.content));
    for (const s of sections) {
      if (!projectsOf.get(note.userId)?.has(s.projectId as string)) throw new Error(`seed note ${note.id} tags a project that is not its owner's`);
    }
    const inDoc = imageIds(checked.doc).sort();
    const attached = note.attachments.map((a) => a.id).sort();
    if (!isDeepStrictEqual(inDoc, attached)) throw new Error(`seed note ${note.id}: images and attachments differ`);
    return { note, text: checked.text, sections };
  });

  const files = scenario.notes.flatMap((note) =>
    note.attachments.map((attachment): PreparedFile => {
      const data = 'data' in attachment ? attachment.data : renderImage(attachment.spec);
      const mimeType = sniffImageType(data);
      if (!mimeType) throw new Error(`seed note ${note.id} has a picture that is not an image`);
      if (data.length > MAX_IMAGE_BYTES) throw new Error(`seed note ${note.id} has a picture over the upload limit`);
      return { key: newStorageKey(note.id), data, mimeType, attachmentId: attachment.id, noteId: note.id, createdAt: attachment.createdAt };
    }),
  );
  return { scenario, notes, files };
}

export interface Removed {
  accounts: number;
  teams: number;
  projects: number;
  notes: number;
  /** Storage keys of the removed notes' images (deleted after the commit). */
  keys: string[];
}

/**
 * Deletes every dummy account (SEED_DOMAIN, plus the `alsoEmails` the real data set lists) and what it owns: the teams
 * it leads (members, schedules, meetings and meeting links go with them), its notes (sections, images and links go
 * with them) and its projects. Other accounts (other company emails, the tests' @example.test users) are left alone;
 * their memberships in deleted teams go too.
 */
export async function removeDummyData(db: Db, alsoEmails: readonly string[] = []): Promise<Removed> {
  const { rows: dummies } = await db.query<{ id: string }>('SELECT id FROM users WHERE email LIKE $1 OR email = ANY($2::text[])', [
    `%${SEED_DOMAIN}`,
    alsoEmails.map((e) => e.toLowerCase()),
  ]);
  const ids = dummies.map((row) => row.id);
  const { rows: files } = await db.query<{ key: string }>(
    `SELECT a.storage_key AS key FROM attachments a JOIN notes n ON n.id = a.note_id WHERE n.user_id = ANY($1::uuid[])`,
    [ids],
  );
  const teams = await db.query(
    `DELETE FROM teams WHERE id IN (SELECT team_id FROM team_members WHERE role = 'leader' AND user_id = ANY($1::uuid[]))`,
    [ids],
  );
  const notes = await db.query('DELETE FROM notes WHERE user_id = ANY($1::uuid[])', [ids]);
  const projects = await db.query('DELETE FROM projects WHERE user_id = ANY($1::uuid[])', [ids]);
  await db.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [ids]);
  return {
    accounts: ids.length,
    teams: teams.rowCount ?? 0,
    projects: projects.rowCount ?? 0,
    notes: notes.rowCount ?? 0,
    keys: files.map((row) => row.key),
  };
}

/** Inserts the prepared data set (parameterized statements only). */
export async function writeScenario(db: Db, prepared: Prepared): Promise<void> {
  const { scenario } = prepared;
  for (const u of scenario.users) {
    await db.query(
      `INSERT INTO users (id, name, email, status, created_at, last_login_at, deactivated_at)
       VALUES ($1, $2, $3, $4::user_status, $5, $6, $7)`,
      [u.id, u.name, u.email, u.status, u.createdAt, u.lastLoginAt, u.deactivatedAt],
    );
    await db.query("INSERT INTO user_roles (user_id, role) VALUES ($1, 'user')", [u.id]);
    if (u.admin) await db.query("INSERT INTO user_roles (user_id, role) VALUES ($1, 'admin')", [u.id]);
  }
  for (const t of scenario.teams) {
    await db.query(`INSERT INTO teams (id, name, description, created_by, created_at, archived_at) VALUES ($1, $2, $3, $4, $5, $6)`, [
      t.id,
      t.name,
      t.description,
      t.createdBy,
      t.createdAt,
      t.archivedAt,
    ]);
  }
  for (const m of scenario.members) {
    await db.query(
      `INSERT INTO team_members (team_id, user_id, role, added_at, added_by) VALUES ($1, $2, $3::team_role, $4, $5)`,
      [m.teamId, m.userId, m.role, m.addedAt, m.addedBy],
    );
  }
  for (const s of scenario.series) {
    await db.query(
      `INSERT INTO meeting_series (id, team_id, name, days_of_week, active, created_by, created_at)
       VALUES ($1, $2, $3, $4::smallint[], $5, $6, $7)`,
      [s.id, s.teamId, s.name, s.daysOfWeek, s.active, s.createdBy, s.createdAt],
    );
  }
  for (const m of scenario.meetings) {
    await db.query(
      `INSERT INTO meetings (id, series_id, scheduled_date, meeting_date, title, status, created_at)
       VALUES ($1, $2, $3::date, $4::date, $5, $6::meeting_status, $7)`,
      [m.id, m.seriesId, m.scheduledDate, m.meetingDate, m.title, m.status, m.createdAt],
    );
  }
  for (const p of scenario.projects) {
    await db.query(
      `INSERT INTO projects (id, user_id, name, description, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5::project_status, $6, $7)`,
      [p.id, p.userId, p.name, p.description, p.status, p.createdAt, p.updatedAt],
    );
  }
  for (const { note, text, sections } of prepared.notes) {
    await db.query(
      `INSERT INTO notes (id, user_id, title, content, content_text, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)`,
      [note.id, note.userId, note.title, JSON.stringify(note.content), text, note.version, note.createdAt, note.updatedAt],
    );
    for (const s of sections) {
      await db.query(
        `INSERT INTO note_sections (note_id, position, project_id, content, content_text) VALUES ($1, $2, $3, $4::jsonb, $5)`,
        [note.id, s.position, s.projectId, JSON.stringify(s.content), s.text],
      );
    }
    for (const meetingId of note.meetingIds) {
      await db.query('INSERT INTO note_meetings (note_id, meeting_id) VALUES ($1, $2)', [note.id, meetingId]);
    }
  }
  for (const f of prepared.files) {
    await db.query(
      `INSERT INTO attachments (id, note_id, storage_key, mime_type, size_bytes, created_at) VALUES ($1, $2, $3, $4, $5, $6)`,
      [f.attachmentId, f.noteId, f.key, f.mimeType, f.data.length, f.createdAt],
    );
  }
}
