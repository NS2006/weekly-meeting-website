/**
 * Where a meeting page's back link returns, from the history state the page was opened with: a team's period page
 * (its meetings, or its notes at the meeting that was being read, `#read-…`), named by the period. Anything else (an
 * old or hand-made state, such as one from the Meetings page that was removed on 2026-11-24) is ignored, and the
 * page links to its team.
 */
export type BackLink = { kind: 'period'; to: string; label: string };

const PERIOD_PATH = /^\/teams\/[^/?#]+\/periods\/[^/?#]+$/;
const ID_LIST = /^(none|[0-9a-f-]{36}(,[0-9a-f-]{36}){0,199})$/;
const READ_ANCHOR = /^#read-[0-9a-f-]{1,80}$/;

/**
 * A period page of this site: its tab, the month of its meetings, the reader's chosen meetings and people, a meeting to
 * read at; nothing else.
 */
function isPeriodPage(from: string): boolean {
  if (!from.startsWith('/') || from.startsWith('//')) return false;
  let url: URL;
  try {
    url = new URL(from, 'https://site.invalid');
  } catch {
    return false;
  }
  if (url.origin !== 'https://site.invalid' || !PERIOD_PATH.test(url.pathname)) return false;
  for (const [key, value] of url.searchParams) {
    const fits =
      key === 'tab' ? value === 'read'
      : key === 'month' ? /^\d{4}-\d{2}$/.test(value)
      : key === 'meetings' || key === 'people' ? ID_LIST.test(value)
      : false;
    if (!fits) return false;
  }
  return url.hash === '' || READ_ANCHOR.test(url.hash);
}

export function backLinkFrom(state: unknown): BackLink | null {
  if (typeof state !== 'object' || state === null) return null;
  const { from, fromLabel } = state as { from?: unknown; fromLabel?: unknown };
  if (typeof from !== 'string') return null;
  if (isPeriodPage(from) && typeof fromLabel === 'string' && fromLabel.length > 0 && fromLabel.length <= 40) {
    return { kind: 'period', to: from, label: fromLabel };
  }
  return null;
}
