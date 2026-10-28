import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import Workspace from '@/components/workspace';
export const dynamic = 'force-dynamic';
export default async function Dashboard() {
  const user = await currentUser();
  if (!user) redirect('/signin');
  return <Workspace user={user} />;
}
