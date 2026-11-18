import { NextResponse } from 'next/server';
import { getSession } from '@/lib/crisis/session';
import { mutate } from '@/lib/crisis/store';
import { applyAction, viewFor, GameError } from '@/lib/crisis/engine';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const sess = await getSession();
  if (!sess) return NextResponse.json({ error: 'Log in again.' }, { status: 401 });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad request.' }, { status: 400 }); }
  const as = sess.role === 'staff' ? body.as : undefined;
  try {
    // A full reset or demo load is backed up first, so it can be undone from the backup list.
    if (sess.role === 'staff' && (body?.type === 'game.reset' || body?.type === 'game.demo') && (body.type !== 'game.reset' || body.confirm === 'RESET')) await mutate(() => '', { snapshot: body.type === 'game.reset' ? 'Before reset' : 'Before demo data' });
    const { state, result } = await mutate((s) => applyAction(s, sess, body));
    return NextResponse.json({ ok: true, message: result, view: viewFor(state, sess, as) });
  } catch (e) {
    console.error('[crisis]', e.message);
    const status = e instanceof GameError ? 400 : 503;
    return NextResponse.json({ error: e.message }, { status });
  }
}
