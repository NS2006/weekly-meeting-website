import type { MeetingStatus } from '@weekly-meeting/shared';

/**
 * A meeting is called by its schedule's name, "Weekly Update" (owner, 2026-11-24: no separate meeting titles). The
 * meeting's `title` now only holds the reason a leader gave when cancelling it.
 */
export const meetingName = (meeting: { seriesName: string }) => meeting.seriesName;

/** The reason a cancelled meeting was called off, when the leader gave one. */
export function cancelReason(meeting: { status: MeetingStatus; title: string | null }): string | null {
  return meeting.status === 'cancelled' && meeting.title ? meeting.title : null;
}
