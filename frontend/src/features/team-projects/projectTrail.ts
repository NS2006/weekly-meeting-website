/**
 * How a project's page (opened from a period's board) knows its way back and its neighbours: the board's address with
 * its filters, and the cards of the column it was opened from, in the board's order. Passed as the link's state, so a
 * shared link (no state) still opens the project, without previous and next.
 */
export interface BoardTrail {
  /** The board's address (path and filters). */
  from: string;
  /** The ids of the column's cards, in order. */
  sequence: string[];
  /** The column's name ("Ana Putri", "Thu 26 Nov"). */
  column: string;
}

export const boardPath = (teamId: string, key: string) => `/teams/${encodeURIComponent(teamId)}/periods/${encodeURIComponent(key)}?tab=projects`;

export const projectPath = (teamId: string, key: string, projectId: string) =>
  `/teams/${encodeURIComponent(teamId)}/periods/${encodeURIComponent(key)}/projects/${encodeURIComponent(projectId)}`;

/** The trail from a page's state, checked: only this period's board, a list of ids and a name; null otherwise. */
export function readTrail(state: unknown, teamId: string, key: string): BoardTrail | null {
  if (typeof state !== 'object' || state === null) return null;
  const { from, sequence, column } = state as Record<string, unknown>;
  const board = `/teams/${encodeURIComponent(teamId)}/periods/${encodeURIComponent(key)}`;
  if (typeof from !== 'string' || !(from === board || from.startsWith(`${board}?`))) return null;
  if (!Array.isArray(sequence) || !sequence.every((id) => typeof id === 'string') || typeof column !== 'string') return null;
  return { from, sequence: sequence as string[], column };
}
