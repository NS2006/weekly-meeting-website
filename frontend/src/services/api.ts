import type {
  AdminUserResponse,
  AdminUsersQuery,
  AdminUsersResponse,
  ApiError,
  ArrangeNotesRequest,
  CopyAttachmentsResponse,
  CopyNoteRequest,
  ArrangeSpeakersRequest,
  AttachmentResponse,
  CreateNoteRequest,
  CreateProjectRequest,
  CreateSeriesRequest,
  CreateTeamRequest,
  CurrentPeriodsResponse,
  MeResponse,
  MeetingBoardResponse,
  MeetingNoteResponse,
  MeetingResponse,
  MeetingsResponse,
  UpcomingMeetingsQuery,
  UpcomingMeetingsResponse,
  ScheduleMeetingsResponse,
  MockSignInRequest,
  MyMeetingsQuery,
  NoteMeetingsResponse,
  NoteResponse,
  NoteSavedResponse,
  NotesQuery,
  NotesResponse,
  PeopleSearchResponse,
  ProjectResponse,
  ProjectChoicesResponse,
  TeamChoicesResponse,
  PeriodProjectsResponse,
  TeamProjectUpdatesResponse,
  ProjectsQuery,
  ProjectsResponse,
  PeriodNotesQuery,
  PeriodNotesResponse,
  PeriodResponse,
  ProjectUpdatesResponse,
  SeriesListResponse,
  SeriesResponse,
  TeamPeriodsResponse,
  TeamResponse,
  TeamStarResponse,
  TeamsQuery,
  TeamsResponse,
  UpdateMeetingRequest,
  UpdateNoteRequest,
  UpdateProjectRequest,
  UpdateSeriesRequest,
  UpdateTeamRequest,
  UserStatus,
  WebsiteRole,
} from '@weekly-meeting/shared';

/** A failed API call: HTTP status (0 when the server could not be reached) and the API's stable error code. */
export class ApiFailure extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.name = 'ApiFailure';
    this.status = status;
    this.code = code;
  }
}

/** The one place the frontend calls the backend (same origin; the session cookie goes along by itself). */
export function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  return send<T>(method, path, body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

/** A file as the raw request body (note images: the server checks the type from the bytes). */
export function upload<T>(path: string, file: Blob): Promise<T> {
  return send<T>('POST', path, { headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
}

async function send<T>(method: string, path: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method, credentials: 'same-origin', ...init });
  } catch {
    throw new ApiFailure(0, 'network_error');
  }
  if (res.status === 204) return undefined as T;
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // An empty or non-JSON body (for example a proxy error page) is handled below.
  }
  if (!res.ok) {
    const code = (data as ApiError | null)?.error?.code;
    throw new ApiFailure(res.status, typeof code === 'string' ? code : res.status >= 500 ? 'internal_error' : 'unknown_error');
  }
  return data as T;
}

export const api = {
  me: () => request<MeResponse>('GET', '/me'),
  mockSignIn: (body: MockSignInRequest) => request<MeResponse>('POST', '/auth/mock-sign-in', body),
  signOut: () => request<void>('POST', '/auth/sign-out'),
  setActiveRole: (role: WebsiteRole) => request<MeResponse>('PUT', '/me/active-role', { role }),

  // Website admin, Users page
  listUsers: (query: AdminUsersQuery) => request<AdminUsersResponse>('GET', `/admin/users${queryString(query)}`),
  setUserStatus: (id: string, status: UserStatus) =>
    request<AdminUserResponse>('PATCH', `/admin/users/${encodeURIComponent(id)}`, { status }),
  setUserAdmin: (id: string, admin: boolean) =>
    request<AdminUserResponse>(admin ? 'PUT' : 'DELETE', `/admin/users/${encodeURIComponent(id)}/roles/admin`),

  // Teams
  listTeams: (query: TeamsQuery = {}) => request<TeamsResponse>('GET', `/teams${queryString(query)}`),
  getTeam: (id: string) => request<TeamResponse>('GET', `/teams/${encodeURIComponent(id)}`),
  createTeam: (body: CreateTeamRequest) => request<TeamResponse>('POST', '/teams', body),
  updateTeam: (id: string, body: UpdateTeamRequest) => request<TeamResponse>('PATCH', `/teams/${encodeURIComponent(id)}`, body),
  deleteTeam: (id: string, confirmName: string) =>
    request<TeamResponse>('DELETE', `/teams/${encodeURIComponent(id)}`, { confirmName }),
  restoreTeam: (id: string) => request<TeamResponse>('POST', `/teams/${encodeURIComponent(id)}/restore`),
  // A deleted team, for good, before its 30 days are over (its leader only).
  deleteTeamForever: (id: string) => request<void>('DELETE', `/teams/${encodeURIComponent(id)}/forever`),
  /** Starred teams come first in my lists; the star is mine only. */
  starTeam: (id: string) => request<TeamStarResponse>('PUT', `/teams/${encodeURIComponent(id)}/star`),
  unstarTeam: (id: string) => request<TeamStarResponse>('DELETE', `/teams/${encodeURIComponent(id)}/star`),
  addTeamMember: (id: string, userId: string) =>
    request<TeamResponse>('POST', `/teams/${encodeURIComponent(id)}/members`, { userId }),
  removeTeamMember: (id: string, userId: string) =>
    request<void>('DELETE', `/teams/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`),
  setTeamLeader: (id: string, userId: string) =>
    request<TeamResponse>('PUT', `/teams/${encodeURIComponent(id)}/leader`, { userId }),
  searchPeople: (q: string) => request<PeopleSearchResponse>('GET', `/users/search${queryString({ q })}`),
  memberSuggestions: (teamId: string) =>
    request<PeopleSearchResponse>('GET', `/teams/${encodeURIComponent(teamId)}/member-suggestions`),

  // Projects (only the owner's)
  listProjects: (query: ProjectsQuery = {}) => request<ProjectsResponse>('GET', `/projects${queryString(query)}`),
  getProject: (id: string) => request<ProjectResponse>('GET', `/projects/${encodeURIComponent(id)}`),
  // A period's Projects board: the members' projects through what was shared on the team's meetings in it only
  periodProjects: (teamId: string, key: string) =>
    request<PeriodProjectsResponse>('GET', `/teams/${encodeURIComponent(teamId)}/periods/${encodeURIComponent(key)}/projects`),
  periodProjectUpdates: (teamId: string, key: string, projectId: string, offset: number) =>
    request<TeamProjectUpdatesResponse>(
      'GET',
      `/teams/${encodeURIComponent(teamId)}/periods/${encodeURIComponent(key)}/projects/${encodeURIComponent(projectId)}/updates${queryString({ offset: String(offset) })}`,
    ),
  /** A few of the teams I am in at random, or (with `q`) the ones whose name holds it. */
  teamChoices: (q = '') => request<TeamChoicesResponse>('GET', `/teams/choices${queryString({ q })}`),
  /** A few of my projects at random, or (with `q`) the ones whose name holds it. */
  projectChoices: (q = '') => request<ProjectChoicesResponse>('GET', `/projects/choices${queryString({ q })}`),
  createProject: (body: CreateProjectRequest) => request<ProjectResponse>('POST', '/projects', body),
  updateProject: (id: string, body: UpdateProjectRequest) =>
    request<ProjectResponse>('PATCH', `/projects/${encodeURIComponent(id)}`, body),
  deleteProject: (id: string, confirmName: string) =>
    request<void>('DELETE', `/projects/${encodeURIComponent(id)}`, { confirmName }),

  // Notes (only the owner's), their images, and a project's updates (the note sections tagged with it)
  listNotes: ({ offset = 0, limit, ...query }: NotesQuery = {}) =>
    request<NotesResponse>('GET', `/notes${queryString({ ...query, offset: String(offset), limit: limit ? String(limit) : undefined })}`),
  /** Copies pictures of my other notes into this note (a pasted section); answers which became which. */
  copyAttachments: (noteId: string, attachmentIds: string[]) =>
    request<CopyAttachmentsResponse>('POST', `/notes/${encodeURIComponent(noteId)}/attachments/copy`, { attachmentIds }),
  /** A copy of my note as a new note (its own images; shared on no meeting). */
  copyNote: (id: string, body: CopyNoteRequest = {}) => request<NoteResponse>('POST', `/notes/${encodeURIComponent(id)}/copy`, body),
  createNote: (body: CreateNoteRequest = {}) => request<NoteResponse>('POST', '/notes', body),
  projectUpdates: (projectId: string, offset = 0) =>
    request<ProjectUpdatesResponse>('GET', `/projects/${encodeURIComponent(projectId)}/updates?offset=${offset}`),
  getNote: (id: string) => request<NoteResponse>('GET', `/notes/${encodeURIComponent(id)}`),
  saveNote: (id: string, body: UpdateNoteRequest) => request<NoteSavedResponse>('PATCH', `/notes/${encodeURIComponent(id)}`, body),
  deleteNote: (id: string) => request<void>('DELETE', `/notes/${encodeURIComponent(id)}`),
  uploadImage: (noteId: string, file: Blob) =>
    upload<AttachmentResponse>(`/notes/${encodeURIComponent(noteId)}/attachments`, file),
  /** Puts my note on a meeting's board (a meeting of a team I am in). */
  linkNoteToMeeting: (noteId: string, meetingId: string) =>
    request<NoteMeetingsResponse>('PUT', `/notes/${encodeURIComponent(noteId)}/meetings/${encodeURIComponent(meetingId)}`),
  unlinkNoteFromMeeting: (noteId: string, meetingId: string) =>
    request<NoteMeetingsResponse>('DELETE', `/notes/${encodeURIComponent(noteId)}/meetings/${encodeURIComponent(meetingId)}`),

  // Meeting schedules (series) and meetings
  listSeries: (teamId: string) => request<SeriesListResponse>('GET', `/teams/${encodeURIComponent(teamId)}/series`),
  createSeries: (teamId: string, body: CreateSeriesRequest) =>
    request<SeriesResponse>('POST', `/teams/${encodeURIComponent(teamId)}/series`, body),
  updateSeries: (id: string, body: UpdateSeriesRequest) =>
    request<SeriesResponse>('PATCH', `/series/${encodeURIComponent(id)}`, body),
  deleteSeries: (id: string) => request<void>('DELETE', `/series/${encodeURIComponent(id)}`),
  /** Home: a page of my teams' meetings of the next four weeks, with how many there are. */
  upcomingMeetings: ({ offset = 0, limit }: UpcomingMeetingsQuery = {}) =>
    request<UpcomingMeetingsResponse>(
      'GET',
      `/meetings/upcoming${queryString({ offset: String(offset), limit: limit ? String(limit) : undefined })}`,
    ),
  // A team's meetings from today on, the first `limit` of them (the team page's next meetings).
  teamNextMeetings: (teamId: string, limit: number) =>
    request<MeetingsResponse>('GET', `/teams/${encodeURIComponent(teamId)}/meetings${queryString({ when: 'upcoming', limit })}`),
  myMeetings: ({ offset = 0, ...query }: MyMeetingsQuery) =>
    request<MeetingsResponse>('GET', `/meetings${queryString({ ...query, offset: String(offset) })}`),
  getMeeting: (id: string) => request<MeetingResponse>('GET', `/meetings/${encodeURIComponent(id)}`),
  /** The "jump to" list: the meetings of this meeting's schedule around it. */
  meetingSchedule: (id: string) => request<ScheduleMeetingsResponse>('GET', `/meetings/${encodeURIComponent(id)}/schedule`),
  updateMeeting: (id: string, body: UpdateMeetingRequest) =>
    request<MeetingResponse>('PATCH', `/meetings/${encodeURIComponent(id)}`, body),
  /** The meeting's board: one column per person with the notes linked to it (team members only). */
  meetingBoard: (id: string) => request<MeetingBoardResponse>('GET', `/meetings/${encodeURIComponent(id)}/notes`),
  meetingNote: (id: string, noteId: string) =>
    request<MeetingNoteResponse>('GET', `/meetings/${encodeURIComponent(id)}/notes/${encodeURIComponent(noteId)}`),
  /** The meeting's speaking order (the team's leader, or a member moving only themselves); answers the board. */
  arrangeSpeakers: (id: string, body: ArrangeSpeakersRequest) =>
    request<MeetingBoardResponse>('PUT', `/meetings/${encodeURIComponent(id)}/speakers`, body),
  /** The order of one person's notes on the meeting (theirs, or the leader's); answers the board. */
  arrangeNotes: (id: string, body: ArrangeNotesRequest) =>
    request<MeetingBoardResponse>('PUT', `/meetings/${encodeURIComponent(id)}/note-order`, body),

  // A team's year in periods (quarters by default; the split is set on the team).
  teamPeriods: (teamId: string) => request<TeamPeriodsResponse>('GET', `/teams/${encodeURIComponent(teamId)}/periods`),
  period: (teamId: string, key: string) =>
    request<PeriodResponse>('GET', `/teams/${encodeURIComponent(teamId)}/periods/${encodeURIComponent(key)}`),
  /** The period's meetings with notes (who wrote), and the notes in full of the ones asked for (`latest`, ids or all). */
  periodNotes: (teamId: string, key: string, query: PeriodNotesQuery = {}) =>
    request<PeriodNotesResponse>(
      'GET',
      `/teams/${encodeURIComponent(teamId)}/periods/${encodeURIComponent(key)}/notes${queryString(query)}`,
    ),
  currentPeriods: () => request<CurrentPeriodsResponse>('GET', '/periods/current'),
};

const ATTACHMENT_SRC = /^\/api\/attachments\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * A note picture's bytes, with the same access check as on screen (for "Save as Word"). Gives up after `timeoutMs`,
 * or when `signal` is aborted (leaving the page).
 */
export async function fetchAttachment(src: string, signal?: AbortSignal, timeoutMs = 30_000): Promise<Blob> {
  if (!ATTACHMENT_SRC.test(src)) throw new ApiFailure(400, 'validation_failed');
  const controller = new AbortController();
  const stop = () => controller.abort();
  const timer = setTimeout(stop, timeoutMs);
  signal?.addEventListener('abort', stop, { once: true });
  try {
    let res: Response;
    try {
      res = await fetch(src, { credentials: 'same-origin', signal: controller.signal });
    } catch {
      throw new ApiFailure(0, 'network_error');
    }
    if (!res.ok) {
      const code = res.status === 401 ? 'unauthenticated' : res.status === 404 ? 'not_found' : 'unknown_error';
      throw new ApiFailure(res.status, code);
    }
    return await res.blob();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', stop);
  }
}

/**
 * `?a=1&b=2` from the non-empty string values and the finite numbers (a page's `offset: 0` included); '' when there
 * are none.
 */
export function queryString(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && value) search.set(key, value);
    else if (typeof value === 'number' && Number.isFinite(value)) search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}
