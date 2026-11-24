import { randomUUID } from 'node:crypto';
import type {
  CopyNoteRequest,
  CreateNoteRequest,
  EditorDoc,
  NoteDetail,
  NoteMeeting,
  NoteSavedResponse,
  NotesQuery,
  NotesResponse,
  NoteSummary,
  ProjectUpdatesResponse,
  UpdateNoteRequest,
} from '@weekly-meeting/shared';
import type { Database } from '../../database/pool.ts';
import { todayInJakarta } from '../../utils/dates.ts';
import { AppError } from '../../utils/errors.ts';
import type { Logger } from '../../utils/logger.ts';
import { newStorageKey, removeFiles, type ObjectStorage } from '../attachments/storage.ts';
import type { AuthContext } from '../auth/types.ts';
import {
  attachmentIdsIn,
  EMPTY_DOC,
  hasContent,
  limitProjects,
  plainText,
  projectSections,
  sectionDoc,
  withAttachments,
} from './content.ts';
import {
  createNotesRepository,
  type NoteAttachmentRow,
  type NoteRow,
  type NotesRepository,
  type NoteSummaryRow,
} from './repository.ts';
import { PAGE_SIZE } from './types.ts';

export interface NotesService {
  list(actor: AuthContext, filters: NotesQuery): Promise<NotesResponse>;
  create(actor: AuthContext, input: CreateNoteRequest): Promise<NoteDetail>;
  get(actor: AuthContext, noteId: string): Promise<NoteDetail>;
  update(actor: AuthContext, noteId: string, input: UpdateNoteRequest): Promise<NoteSavedResponse['note']>;
  remove(actor: AuthContext, noteId: string): Promise<void>;
  /** A copy of my note as a new note of mine (text, project parts, its own copies of the images; no meetings). */
  copy(actor: AuthContext, noteId: string, input: CopyNoteRequest): Promise<NoteDetail>;
  /** A project page's updates: the sections of my notes tagged with my project. */
  updates(actor: AuthContext, projectId: string, offset: number): Promise<ProjectUpdatesResponse>;
  /** FR-9: puts my note on a meeting's board (a meeting of a team I am in); answers the note's meetings. */
  linkMeeting(actor: AuthContext, noteId: string, meetingId: string): Promise<NoteMeeting[]>;
  /** Takes my note off a meeting's board; answers the note's meetings. */
  unlinkMeeting(actor: AuthContext, noteId: string, meetingId: string): Promise<NoteMeeting[]>;
}

const toSummary = (row: NoteSummaryRow): NoteSummary => ({
  id: row.id,
  title: row.title,
  snippet: row.snippet,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  projects: row.projects,
  meetings: row.meetings,
});

// Notes made before the editor existed hold `{}`: they open as an empty document.
const docOf = (row: NoteRow): EditorDoc => ((row.content as EditorDoc).type === 'doc' ? (row.content as EditorDoc) : EMPTY_DOC);

/**
 * Notes (FR-7, PRD 8.2): each person's own documents; only the owner reads or writes them (others get 404). Parts of
 * a note are project sections (FR-12): on every save the tags are checked against the owner's projects and the
 * derived note_sections rows are rebuilt in the same transaction. Saves use optimistic locking: a save with an older
 * version answers 409 `version_conflict` and changes nothing. Logs carry ids and versions only.
 */
export function createNotesService(deps: { db: Database; logger: Logger; storage: ObjectStorage; now?: () => Date }): NotesService {
  const { db, logger, storage } = deps;
  const notes = createNotesRepository(db);
  const today = () => todayInJakarta(deps.now?.() ?? new Date());

  async function detail(repo: NotesRepository, noteId: string, ownerId: string): Promise<NoteDetail> {
    const row = await repo.findOwned(noteId, ownerId);
    if (!row) throw new AppError(404, 'not_found');
    return {
      id: row.id,
      title: row.title,
      content: docOf(row),
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      projects: await repo.projectsOf(noteId),
      meetings: await repo.meetingsOf(noteId, today()),
    };
  }

  /**
   * PRD 8.4: the owner links a note to any meeting of a team they are in. A meeting they cannot see answers 404 (as
   * the meeting pages); a deleted team or a cancelled meeting gathers no notes (409). Linking twice changes nothing.
   */
  async function linkTo(repo: NotesRepository, noteId: string, meetingId: string, userId: string): Promise<void> {
    const target = await repo.linkTarget(meetingId, userId);
    if (!target) throw new AppError(404, 'not_found');
    if (target.teamArchived) throw new AppError(409, 'team_archived');
    if (target.status === 'cancelled') throw new AppError(409, 'meeting_cancelled');
    await repo.link(noteId, meetingId);
  }

  /**
   * The sections a project page shows: tagged ones with something written in them. A section left empty (a new
   * "Write an update" note nobody wrote in yet) stays in the note but is not an update.
   */
  const updatesIn = (doc: EditorDoc) => projectSections(doc).filter((s) => s.projectId !== null && hasContent(s.content));

  /**
   * Which projects this note may be tagged with: the owner's active projects, plus archived ones it was already
   * tagged with (an archived project is read-only: it gets no new sections, but keeps the ones it has). Any other
   * tag (someone else's project, a deleted one) is removed, leaving that section untagged with its text intact.
   */
  async function allowedProjects(repo: NotesRepository, doc: EditorDoc, noteId: string | null, ownerId: string) {
    const ids = [...new Set(projectSections(doc).flatMap((s) => (s.projectId ? [s.projectId] : [])))];
    const owned = await repo.ownedProjects(ownerId, ids);
    const already = new Set(noteId ? await repo.taggedProjectIds(noteId) : []);
    return new Set(owned.filter((p) => p.status === 'active' || already.has(p.id)).map((p) => p.id));
  }

  return {
    async list(actor, query) {
      const { offset = 0, limit = PAGE_SIZE, sort = 'newest', ...rest } = query;
      const filters = { ...rest, sort };
      const [rows, total] = await Promise.all([
        notes.listForUser(actor.user.id, filters, { offset, limit }, today()),
        notes.countForUser(actor.user.id, filters),
      ]);
      return { notes: rows.slice(0, limit).map(toSummary), hasMore: rows.length > limit, total };
    },

    async create(actor, input) {
      const created = await db.transaction(async (tx) => {
        const repo = createNotesRepository(tx);
        let content = EMPTY_DOC;
        if (input.projectId) {
          const [project] = await repo.ownedProjects(actor.user.id, [input.projectId]);
          if (!project) throw new AppError(404, 'not_found');
          if (project.status === 'archived') throw new AppError(409, 'project_archived');
          content = sectionDoc(input.projectId);
        }
        const noteId = await repo.create(actor.user.id, input.title ?? '', content, '');
        await repo.replaceSections(noteId, updatesIn(content));
        if (input.meetingId) await linkTo(repo, noteId, input.meetingId, actor.user.id);
        return detail(repo, noteId, actor.user.id);
      });
      logger.info(
        { actorId: actor.user.id, noteId: created.id, projectId: input.projectId, meetingId: input.meetingId },
        'note: created',
      );
      return created;
    },

    get: (actor, noteId) => detail(notes, noteId, actor.user.id),

    async update(actor, noteId, input) {
      const saved = await db.transaction(async (tx) => {
        const repo = createNotesRepository(tx);
        if (!(await repo.lockOwned(noteId, actor.user.id))) throw new AppError(404, 'not_found');
        if (input.content === undefined) {
          const result = await repo.save(noteId, input.version, { title: input.title });
          if (!result) throw new AppError(409, 'version_conflict');
          return result;
        }
        const content = limitProjects(input.content, await allowedProjects(repo, input.content, noteId, actor.user.id));
        const result = await repo.save(noteId, input.version, { title: input.title, content, text: plainText(content) });
        if (!result) throw new AppError(409, 'version_conflict');
        await repo.replaceSections(noteId, updatesIn(content));
        return result;
      });
      // Autosave runs every few seconds while typing: debug, not info.
      logger.debug({ actorId: actor.user.id, noteId, version: saved.version }, 'note: saved');
      return { id: noteId, version: saved.version, updatedAt: saved.updatedAt.toISOString() };
    },

    async remove(actor, noteId) {
      const keys = await db.transaction(async (tx) => {
        const repo = createNotesRepository(tx);
        if (!(await repo.lockOwned(noteId, actor.user.id))) throw new AppError(404, 'not_found');
        const imageKeys = await repo.attachmentKeys(noteId);
        await repo.remove(noteId); // its attachments rows, sections and meeting links cascade
        return imageKeys;
      });
      logger.info({ actorId: actor.user.id, noteId, images: keys.length }, 'note: deleted');
      await removeFiles(storage, logger, keys);
    },

    async copy(actor, noteId, input) {
      const source = await notes.findOwned(noteId, actor.user.id);
      if (!source) throw new AppError(404, 'not_found');
      const doc = docOf(source);
      // The copy gets its own image files and rows, so it keeps its pictures when the original is deleted, and its
      // own access check (a teammate reading the copy on a meeting's board). Only the images still in the text.
      const used = attachmentIdsIn(doc);
      const images = (await notes.attachmentsOf(noteId)).filter((image) => used.has(image.id));
      const copyId = randomUUID();
      const copied: NoteAttachmentRow[] = [];
      const renamed = new Map<string, string>();
      try {
        for (const image of images) {
          const storageKey = newStorageKey(copyId);
          // A file already missing stays missing: its image shows as broken in both notes.
          if (!(await storage.copy(image.storageKey, storageKey))) continue;
          const copy = { ...image, id: randomUUID(), storageKey };
          copied.push(copy);
          renamed.set(image.id, copy.id);
        }
        const created = await db.transaction(async (tx) => {
          const repo = createNotesRepository(tx);
          const moved = withAttachments(doc, renamed);
          // Archived projects get no new sections: their parts are copied untagged, text intact.
          const content = limitProjects(moved, await allowedProjects(repo, moved, null, actor.user.id));
          await repo.create(actor.user.id, input.title ?? source.title, content, plainText(content), copyId);
          for (const image of copied) await repo.addAttachment(copyId, image);
          await repo.replaceSections(copyId, updatesIn(content));
          return detail(repo, copyId, actor.user.id);
        });
        logger.info({ actorId: actor.user.id, noteId, copyId, images: copied.length }, 'note: copied');
        return created;
      } catch (err) {
        await removeFiles(storage, logger, copied.map((image) => image.storageKey));
        throw err;
      }
    },

    async updates(actor, projectId, offset) {
      const [project] = await notes.ownedProjects(actor.user.id, [projectId]);
      if (!project) throw new AppError(404, 'not_found');
      const rows = await notes.updatesForProject(projectId, actor.user.id, { offset, limit: PAGE_SIZE });
      return {
        updates: rows.slice(0, PAGE_SIZE).map((row) => ({
          ...row,
          noteCreatedAt: row.noteCreatedAt.toISOString(),
          noteUpdatedAt: row.noteUpdatedAt.toISOString(),
        })),
        hasMore: rows.length > PAGE_SIZE,
      };
    },

    async linkMeeting(actor, noteId, meetingId) {
      const meetings = await db.transaction(async (tx) => {
        const repo = createNotesRepository(tx);
        if (!(await repo.lockOwned(noteId, actor.user.id))) throw new AppError(404, 'not_found');
        await linkTo(repo, noteId, meetingId, actor.user.id);
        return repo.meetingsOf(noteId, today());
      });
      logger.info({ actorId: actor.user.id, noteId, meetingId }, 'note: linked to meeting');
      return meetings;
    },

    async unlinkMeeting(actor, noteId, meetingId) {
      // Always allowed for the owner (also after leaving the team, or when the meeting was cancelled).
      const meetings = await db.transaction(async (tx) => {
        const repo = createNotesRepository(tx);
        if (!(await repo.lockOwned(noteId, actor.user.id))) throw new AppError(404, 'not_found');
        await repo.unlink(noteId, meetingId);
        return repo.meetingsOf(noteId, today());
      });
      logger.info({ actorId: actor.user.id, noteId, meetingId }, 'note: unlinked from meeting');
      return meetings;
    },
  };
}
