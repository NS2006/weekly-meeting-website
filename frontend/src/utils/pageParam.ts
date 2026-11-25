/** The page in the address (?page=3): 1 when missing or not a page number. Every paged list reads it this way. */
export function readPage(get: (key: string) => string): number {
  const page = Number(get('page'));
  return Number.isInteger(page) && page >= 1 && page <= 10_000 ? page : 1;
}
