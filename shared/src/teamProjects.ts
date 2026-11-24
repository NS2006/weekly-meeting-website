import type { MeetingStatus } from './meetings.ts';
import type { EditorDoc } from './notes.ts';
import type { ProjectStatus } from './projects.ts';

/**
 * A period's projects (owner, 2026-11-24: the third tab of a team's quarter page, as a board): the team members'
 * projects, seen through what was shared on the team's meetings in that period only. A project shows once a part of
 * it (a project section) is in a note shared on one of those meetings, with only those parts; nothing else of the
 * owner's projects or notes. Team members only (a deleted team: its leader), as the period page itself.
 */
export interface PeriodProject {
  id: string;
  name: string;
  status: ProjectStatus;
  /** Whose project it is. */
  owner: { id: string; name: string };
  /** How many notes shared on the period's meetings have a part for it. */
  updateCount: number;
  /** The latest of those meetings (YYYY-MM-DD). */
  lastSharedOn: string;
  /** The period's meetings a note with a part for it is shared on (the board's columns when grouped by meeting). */
  meetingIds: string[];
}

/**
 * GET /api/teams/:id/periods/:key/projects: every project shared in the period, latest meeting first (a period is a
 * few months of one team, so the board has them all and filters them at once). 404 for a team the user may not see,
 * or a key that does not fit the team's split.
 */
export interface PeriodProjectsResponse {
  projects: PeriodProject[];
  /** More than the most sent at once (1000) were shared: only the latest are here. */
  truncated: boolean;
}

/** A meeting of this team a note is shared on. */
export interface TeamProjectMeeting {
  id: string;
  date: string;
  title: string | null;
  seriesName: string;
  status: MeetingStatus;
}

/** One part of a shared note, as the board's project panel shows it. */
export interface TeamProjectUpdate {
  noteId: string;
  noteTitle: string;
  /** Order of the part in its note. */
  position: number;
  content: EditorDoc;
  noteCreatedAt: string;
  noteUpdatedAt: string;
  /** The period's meetings of this team the note is shared on, oldest first (each opens the note on that meeting's board). */
  meetings: TeamProjectMeeting[];
}

/**
 * GET /api/teams/:id/periods/:key/projects/:projectId/updates?offset=: the project's parts shared on the period's
 * meetings, latest meeting first, pages of 30. 404 when none is.
 */
export interface TeamProjectUpdatesResponse {
  updates: TeamProjectUpdate[];
  hasMore: boolean;
}
