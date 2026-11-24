import type { NoteProject } from '@weekly-meeting/shared';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useProjects } from '../projects/useProjects';

interface NoteProjectsValue {
  /** The note being written (a pasted section's pictures are copied into it). */
  noteId: string | null;
  /** My active projects, by name: the ones a section can be tagged with. */
  active: NoteProject[];
  loading: boolean;
  /** Name and status of a project the note is tagged with (active or archived); undefined for a deleted one. */
  find: (id: string) => NoteProject | undefined;
}

const NoteProjectsContext = createContext<NoteProjectsValue>({ noteId: null, active: [], loading: false, find: () => undefined });

/**
 * The projects a note's sections can show and pick: the note's own tags (which may include archived projects) plus my
 * active projects. Section views read it through useNoteProjects (they render inside the editor, below this provider).
 */
export function NoteProjectsProvider({ noteId, tagged, children }: { noteId: string; tagged: NoteProject[]; children: ReactNode }) {
  const query = useProjects({ status: 'active', sort: 'name' });
  const value = useMemo<NoteProjectsValue>(() => {
    const active = (query.data?.projects ?? []).map(({ id, name, status }) => ({ id, name, status }));
    const byId = new Map<string, NoteProject>([...tagged, ...active].map((p) => [p.id, p]));
    return { noteId, active, loading: query.isPending, find: (id) => byId.get(id) };
  }, [noteId, query.data, query.isPending, tagged]);
  return <NoteProjectsContext.Provider value={value}>{children}</NoteProjectsContext.Provider>;
}

export const useNoteProjects = () => useContext(NoteProjectsContext);
