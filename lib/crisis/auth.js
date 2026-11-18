// Access codes and signed session cookies for the crisis app.
// Delegates get a code made from their surname plus six digits derived from CRISIS_SECRET,
// so codes can be printed ahead of time and never need to be stored.
import crypto from 'node:crypto';
import { ROSTER } from './scenario';

export const COOKIE = 'slomun_crisis';
const DEV = process.env.NODE_ENV !== 'production';

function secret() {
  const s = process.env.CRISIS_SECRET;
  if (s && s.length >= 16) return s;
  if (DEV) return 'dev-only-crisis-secret-change-me';
  throw new Error('CRISIS_SECRET is not set. Add it in the Vercel project settings.');
}
const hmac = (msg) => crypto.createHmac('sha256', secret()).update(msg).digest();
const norm = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const surname = (name) => {
  const parts = name.replace(/"[^"]*"/g, '').normalize('NFKD').replace(/[^\w\s-]/g, '').split(/\s+/).filter(Boolean);
  return parts[parts.length - 1].replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 8);
};
export function codeFor(name) {
  const n = hmac('code:' + name).readUInt32BE(0) % 1000000;
  return `${surname(name)}-${String(n).padStart(6, '0')}`;
}
export const delegateCodes = () => ROSTER.map((r) => ({ name: r.name, country: r.country, code: codeFor(r.name) }));
const staffCode = () => process.env.CRISIS_STAFF_CODE || (DEV ? 'STAFF-000000' : null);
const projectorCode = () => process.env.CRISIS_PROJECTOR_CODE || (DEV ? 'MAP-000000' : null);
const eq = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function resolveCode(code) {
  const c = norm(code); if (!c) return null;
  const sc = staffCode(), pc = projectorCode();
  if (sc && eq(c, norm(sc))) return { role: 'staff' };
  if (pc && eq(c, norm(pc))) return { role: 'projector' };
  for (const r of ROSTER) if (eq(c, norm(codeFor(r.name)))) return { role: 'delegate', name: r.name };
  return null;
}

export function sign(sess) {
  const body = Buffer.from(JSON.stringify({ ...sess, iat: Date.now() })).toString('base64url');
  return `${body}.${hmac('sess:' + body).toString('base64url')}`;
}
export function verify(token) {
  if (!token || typeof token !== 'string') return null;
  const [body, sig] = token.split('.'); if (!body || !sig) return null;
  try {
    if (!eq(sig, hmac('sess:' + body).toString('base64url'))) return null;
    const s = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (Date.now() - s.iat > 1000 * 60 * 60 * 24 * 3) return null; // sessions last 3 days
    if (s.role === 'delegate' && !ROSTER.some((r) => r.name === s.name)) return null; // that delegate was removed from the roster
    return s;
  } catch { return null; }
}
export const cookieOptions = { httpOnly: true, sameSite: 'lax', secure: !DEV, path: '/', maxAge: 60 * 60 * 24 * 3 };
