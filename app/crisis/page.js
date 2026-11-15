import { redirect } from 'next/navigation';
import { getSession } from '@/lib/crisis/session';
import Login from '@/components/crisis/Login';

export const dynamic = 'force-dynamic';
const HOME = { staff: '/crisis/staff', projector: '/crisis/map', delegate: '/crisis/delegate' };

export default async function CrisisHome() {
  const sess = await getSession();
  if (sess) redirect(HOME[sess.role]);
  return <Login />;
}
