import { redirect } from 'next/navigation';
import { getSession } from '@/lib/crisis/session';
import { delegateCodes } from '@/lib/crisis/auth';
import { storageMode } from '@/lib/crisis/store';
import CrisisClient from '@/components/crisis/CrisisClient';

export const dynamic = 'force-dynamic';

export default async function StaffPage() {
  const sess = await getSession();
  if (!sess || sess.role !== 'staff') redirect('/crisis');
  return <CrisisClient view="staff" session={sess} codes={delegateCodes()} storage={storageMode} />;
}
