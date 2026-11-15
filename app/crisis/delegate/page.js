import { redirect } from 'next/navigation';
import { getSession } from '@/lib/crisis/session';
import { rosterEntry } from '@/lib/crisis/scenario';
import CrisisClient from '@/components/crisis/CrisisClient';

export const dynamic = 'force-dynamic';

export default async function DelegatePage({ searchParams }) {
  const sess = await getSession();
  if (!sess) redirect('/crisis');
  const as = (await searchParams)?.as;
  if (sess.role === 'delegate') return <CrisisClient view="delegate" session={sess} />;
  if (sess.role === 'staff' && rosterEntry(as)) return <CrisisClient view="delegate" session={sess} as={as} />;
  redirect('/crisis');
}
