import { redirect } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { currentUser } from '@/server/auth';

export const dynamic = 'force-dynamic';

/** Server-side session guard for every app route (proxy already checks; this protects RSC output too). */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let signedIn = false;
  try {
    signedIn = (await currentUser()) !== null;
  } catch (error) {
    console.error('[auth] layout session check failed:', error instanceof Error ? error.message : error);
  }
  if (!signedIn) redirect('/login');
  return <Shell>{children}</Shell>;
}
