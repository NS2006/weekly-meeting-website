import { useEffect, useRef } from 'react';
import { BlueAlert, BlueButton } from './blue';

/** How near (pixels, about two screens) the end of the list comes before the next page loads. */
const NEAR = 1500;

/**
 * The end of a list loaded a page at a time (owner, 2026-11-25, like the quarter reader): the next page loads by
 * itself once this comes within about two screens, so scrolling never stops at a button. The button stays, for the
 * keyboard and to try again: a failed page is shown here and nothing more loads by itself until it is pressed.
 */
export function LoadOlder({
  hasMore,
  loading,
  failed,
  errorText,
  label,
  onMore,
}: {
  hasMore: boolean;
  loading: boolean;
  failed: boolean;
  errorText?: string | null;
  label: string;
  onMore: () => unknown;
}) {
  const end = useRef<HTMLDivElement>(null);
  const latest = useRef(onMore);
  useEffect(() => {
    latest.current = onMore;
  });
  const automatic = hasMore && !loading && !failed;

  // Made again after each page, so a list still short of the screen keeps loading until it reaches past it.
  useEffect(() => {
    const element = end.current;
    if (!automatic || !element) return;
    const observer = new IntersectionObserver(
      (seen) => {
        if (seen.some((entry) => entry.isIntersecting)) latest.current();
      },
      { rootMargin: `${NEAR}px 0px` },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [automatic]);

  if (!hasMore) return null;
  return (
    <div ref={end} className="load-older">
      {failed && errorText ? <BlueAlert variant="error">{errorText}</BlueAlert> : null}
      <BlueButton variant="secondary" loading={loading} onClick={() => void onMore()}>
        {label}
      </BlueButton>
    </div>
  );
}
