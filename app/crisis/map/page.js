import { redirect } from 'next/navigation';
import { getSession } from '@/lib/crisis/session';
import CrisisClient from '@/components/crisis/CrisisClient';

export const dynamic = 'force-dynamic';

export default async function ProjectorPage() {
  const sess = await getSession();
  if (!sess || !['staff', 'projector'].includes(sess.role)) redirect('/crisis');
  return <CrisisClient view="map" session={sess} />;
}
