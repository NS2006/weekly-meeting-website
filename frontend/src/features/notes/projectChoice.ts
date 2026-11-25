/** The editor's Project menu (owner, 2026-11-25): find a project by name, or create one from what was typed. */

/** The projects whose name holds the typed text (any case); all of them when nothing is typed. */
export function matchProjects<T extends { name: string }>(projects: readonly T[], typed: string): T[] {
  const q = typed.trim().toLowerCase();
  return q ? projects.filter((p) => p.name.toLowerCase().includes(q)) : [...projects];
}

/**
 * The name a new project would get from the typed text, or null when there is nothing to create: nothing typed, or a
 * project already has exactly that name (any case, as the server compares names). At most 100 characters, as the
 * server allows.
 */
export function nameToCreate(projects: readonly { name: string }[], typed: string): string | null {
  const name = typed.trim().slice(0, 100).trim();
  if (!name) return null;
  const lower = name.toLowerCase();
  return projects.some((p) => p.name.trim().toLowerCase() === lower) ? null : name;
}
