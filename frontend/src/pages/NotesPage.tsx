import type { Me } from '@weekly-meeting/shared';
import { NotesOverview } from '../features/notes/NotesOverview';
import { AppLayout } from '../layouts/AppLayout';

/** My own notes (User role). */
export function NotesPage({ user }: { user: Me }) {
  return (
    <AppLayout user={user}>
      <NotesOverview user={user} />
    </AppLayout>
  );
}
