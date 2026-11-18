import { NextResponse } from 'next/server';
import { getSession } from '@/lib/crisis/session';
import { load, currentVersion } from '@/lib/crisis/store';
import { viewFor } from '@/lib/crisis/engine';

export const dynamic = 'force-dynamic';
const H = { 'Cache-Control': 'no-store' };

export async function GET(req) {
  const sess = await getSession();
  if (!sess) return NextResponse.json({ error: 'Log in again.' }, { status: 401, headers: H });
  const sp = new URL(req.url).searchParams;
  const as = sess.role === 'staff' ? sp.get('as') || undefined : undefined;
  try {
    // Most polls find nothing new: answer from the version number alone, without loading the game.
    if (sp.get('v') && +sp.get('v') === (await currentVersion())) return NextResponse.json({ version: +sp.get('v'), unchanged: true, now: Date.now() }, { headers: H });
    const s = await load();
    if (sp.get('v') && +sp.get('v') === s.version) return NextResponse.json({ version: s.version, unchanged: true, now: Date.now() }, { headers: H });
    return NextResponse.json(viewFor(s, sess, as), { headers: H });
  } catch (e) {
    console.error('[crisis]', e.message);
    return NextResponse.json({ error: e.message }, { status: 503, headers: H });
  }
}
