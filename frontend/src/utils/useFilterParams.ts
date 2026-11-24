import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

/**
 * Page filters kept in the address (?q=…&team=…), so Back, reload and a shared link show the same results.
 * `update` merges a patch into the current values; an empty value removes that filter.
 */
export function useFilterParams() {
  const [params, setParams] = useSearchParams();
  const get = useCallback((key: string) => params.get(key) ?? '', [params]);
  const update = useCallback(
    (patch: Record<string, string | undefined>) => {
      // Start from the address as it is now, not from this render's copy: two changes close together (a pick right
      // after typing, whose search is sent 300 ms later) would otherwise undo each other.
      const next = new URLSearchParams(window.location.search);
      for (const [key, value] of Object.entries(patch)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      setParams(next, { replace: true });
    },
    [setParams],
  );
  return { get, update };
}
