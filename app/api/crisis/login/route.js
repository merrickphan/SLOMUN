import { NextResponse } from 'next/server';
import { COOKIE, resolveCode, sign, cookieOptions } from '@/lib/crisis/auth';

const HOME = { staff: '/crisis/staff', projector: '/crisis/map', delegate: '/crisis/delegate' };

export async function POST(req) {
  let code = '';
  try { ({ code } = await req.json()); } catch {}
  await new Promise((r) => setTimeout(r, 400)); // slows down code guessing
  let sess;
  try { sess = resolveCode(code); } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
  if (!sess) return NextResponse.json({ error: 'That code did not work. Check it and try again.' }, { status: 401 });
  const res = NextResponse.json({ ok: true, role: sess.role, go: HOME[sess.role] });
  res.cookies.set(COOKIE, sign(sess), cookieOptions);
  return res;
}
