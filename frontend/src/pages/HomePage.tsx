import type { Me } from '@weekly-meeting/shared';
import { HomeOverview } from '../features/home/HomeOverview';
import { AppLayout } from '../layouts/AppLayout';

/** Home: a greeting, the next meetings and each team's current period (HomeOverview). */
export function HomePage({ user }: { user: Me }) {
  return (
    <AppLayout user={user}>
      <HomeOverview user={user} />
    </AppLayout>
  );
}
