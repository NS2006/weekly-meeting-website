import type { MeetingStatus } from './meetings.ts';
import type { ProjectStatus } from './projects.ts';

/**
 * A note's content: the editor's own JSON document (Tiptap / ProseMirror), never HTML. The backend checks it against
 * the editor schema before saving (unknown node or mark types are refused; invalid attribute values are dropped).
 * Top-level `projectSection` nodes ({ attrs: { projectId } }) tag their blocks with one of the owner's projects.
 */
export interface EditorNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: EditorNode[];
  marks?: EditorMark[];
  text?: string;
}

export interface EditorMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface EditorDoc extends EditorNode {
  type: 'doc';
}

/** A project a note has a section for. */
export interface NoteProject {
  id: string;
  name: string;
  status: ProjectStatus;
}

/**
 * A meeting a note is linked to: the team members see the note on that meeting's board. The owner links a note to
 * any meeting of a team they are in (not a cancelled one), and unlinks it at any time.
 */
export interface NoteMeeting {
  id: string;
  date: string;
  title: string | null;
  seriesName: string;
  teamId: string;
  teamName: string;
  status: MeetingStatus;
}

/** A note in my list: no content, a short plain-text snippet instead. */
export interface NoteSummary {
  id: string;
  title: string;
  /** The first characters of the note's text, on one line; empty for an empty note. */
  snippet: string;
  createdAt: string;
  /** When the note was last saved. */
  updatedAt: string;
  /** The projects it has sections for, in the order they first appear. */
  projects: NoteProject[];
  /** The meetings it is linked to, soonest date last. */
  meetings: NoteMeeting[];
}

export interface NoteDetail {
  id: string;
  title: string;
  content: EditorDoc;
  /** Optimistic locking: send it back with every save; a save with an older version answers 409 `version_conflict`. */
  version: number;
  createdAt: string;
  updatedAt: string;
  /** The projects its sections are tagged with (to name them; a tag of a deleted project is not listed). */
  projects: NoteProject[];
  /** The meetings it is linked to (oldest first). */
  meetings: NoteMeeting[];
}

/** Newest written first (default), oldest written first, or last saved first. */
export type NoteSort = 'newest' | 'oldest' | 'edited';

/** GET /api/notes: my notes, filtered and sorted on the server, in pages. */
export interface NotesQuery {
  /** Text in the title or the note's text. */
  q?: string;
  /** Only notes with a part on this project of mine, or `none`: notes with no project part. */
  project?: string;
  /** Only notes shared on a meeting of this team. */
  team?: string;
  /** `yes`: shared on at least one meeting; `no`: on none. */
  shared?: 'yes' | 'no';
  /** Written on or after this day (YYYY-MM-DD, Indonesia time). */
  from?: string;
  /** Written on or before this day (YYYY-MM-DD, Indonesia time). */
  to?: string;
  sort?: NoteSort;
  offset?: number;
  /** Notes per page, 1–50 (30 when not given). */
  limit?: number;
}

export interface NotesResponse {
  notes: NoteSummary[];
  /** More notes after this page (ask again with offset = notes so far). */
  hasMore: boolean;
  /** How many notes match the filters, on every page. */
  total: number;
}

/**
 * POST /api/notes/:id/copy: a new note of mine with the same text, project parts (active projects only) and its own
 * copies of the images; not shared on any meeting. Without `title`, the copy keeps the note's title.
 */
export interface CopyNoteRequest {
  title?: string;
}

export interface NoteResponse {
  note: NoteDetail;
}

/**
 * POST /api/notes: a new note, optionally with a title. With `projectId` (from a project page), it starts with one
 * section for that project (it must be mine and active: 404 / 409 `project_archived`). With `meetingId` (from a
 * meeting's board), it is linked to that meeting at once (the same rules as linking).
 */
export interface CreateNoteRequest {
  title?: string;
  projectId?: string;
  meetingId?: string;
}

/**
 * PUT /api/notes/:id/meetings/:meetingId links my note to a meeting of a team I am in (404 otherwise; 409
 * `meeting_cancelled` or `team_archived`); DELETE unlinks it. Both answer the note's meetings.
 */
export interface NoteMeetingsResponse {
  meetings: NoteMeeting[];
}

/** One section of one of my notes, as a project page shows it. */
export interface ProjectUpdate {
  noteId: string;
  noteTitle: string;
  /** Order of the section in its note. */
  position: number;
  content: EditorDoc;
  noteCreatedAt: string;
  noteUpdatedAt: string;
}

/** GET /api/projects/:id/updates: the sections tagged with the project, newest note first, in pages. */
export interface ProjectUpdatesResponse {
  updates: ProjectUpdate[];
  hasMore: boolean;
}

/** PATCH /api/notes/:id (autosave). `version` is the one the editor last loaded or saved. */
export interface UpdateNoteRequest {
  title?: string;
  content?: EditorDoc;
  version: number;
}

export interface NoteSavedResponse {
  note: { id: string; version: number; updatedAt: string };
}

/** An image stored for a note. The editor puts `url` in the image node's `src`. */
export interface AttachmentView {
  id: string;
  /** `/api/attachments/<id>`: the only image source the editor schema accepts. */
  url: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
  sizeBytes: number;
}

export interface AttachmentResponse {
  attachment: AttachmentView;
}

/**
 * POST /api/notes/:id/attachments/copy: copies pictures of my other notes into this note (a pasted project section),
 * so the note keeps them when the other note is deleted and teammates reading it can see them. Ids that are not mine
 * (or whose file is gone) are left out of the answer; ids already in this note answer themselves. 409
 * `too_many_images` past 100 pictures in the note.
 */
export interface CopyAttachmentsRequest {
  attachmentIds: string[];
}

export interface CopyAttachmentsResponse {
  attachments: { from: string; id: string; url: string }[];
}
