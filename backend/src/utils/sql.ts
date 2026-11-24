/**
 * A "contains" pattern for ILIKE that matches the text literally: a search for "50%" or "a_b" finds those characters
 * instead of treating % and _ as wildcards. Backslash is PostgreSQL's default LIKE escape character.
 * Always pass the result as a query parameter.
 */
export function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
