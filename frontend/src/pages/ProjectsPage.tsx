import type { Me } from '@weekly-meeting/shared';
import { ProjectsOverview } from '../features/projects/ProjectsOverview';
import { AppLayout } from '../layouts/AppLayout';

/** My own projects as cards (User role). */
export function ProjectsPage({ user }: { user: Me }) {
  return (
    <AppLayout user={user}>
      <ProjectsOverview />
    </AppLayout>
  );
}
