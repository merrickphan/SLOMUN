// Staff-only: ask the crisis assistant what a decision should do. Returns effects for staff to apply.
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/crisis/session';
import { load, mutate } from '@/lib/crisis/store';
import { suggestRequest, decideRequest, carryDirective, describeEvent, aiMode, AI_VERSION } from '@/lib/crisis/ai';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req) {
  const sess = await getSession();
  if (!sess || sess.role !== 'staff') return NextResponse.json({ error: 'Staff only.' }, { status: 401 });
  let b; try { b = await req.json(); } catch { return NextResponse.json({ error: 'Bad request.' }, { status: 400 }); }
  try {
    const s = await load();
    if (b.kind === 'request') {
      const q = s.queue.find((x) => x.id === b.id); if (!q) return NextResponse.json({ error: 'That request no longer exists.' }, { status: 404 });
      if (b.decision) return NextResponse.json({ ok: true, mode: aiMode(), result: await decideRequest(s, q, b.decision === 'approve', String(b.reply || '').slice(0, 800)) });
      // Suggestions are stored on the request so every staff screen sees them, and computed once.
      if (q.ai && q.ai.v === AI_VERSION && !b.force) return NextResponse.json({ ok: true, mode: aiMode(), result: q.ai });
      if (q.aiAt && Date.now() - q.aiAt < 45000 && !b.force) return NextResponse.json({ ok: true, pending: true });
      await mutate((n) => { const x = n.queue.find((y) => y.id === q.id); if (x) x.aiAt = Date.now(); });
      const result = await suggestRequest(s, q);
      await mutate((n) => { const x = n.queue.find((y) => y.id === q.id); if (x) x.ai = result; });
      return NextResponse.json({ ok: true, mode: aiMode(), result });
    }
    if (b.kind === 'directive') {
      const d = s.directives.find((x) => x.id === b.id); if (!d) return NextResponse.json({ error: 'That directive no longer exists.' }, { status: 404 });
      if (d.ai && !b.force) return NextResponse.json({ ok: true, mode: aiMode(), result: d.ai });
      const result = await carryDirective(s, d);
      await mutate((n) => { const x = n.directives.find((y) => y.id === d.id); if (x) x.ai = result; });
      return NextResponse.json({ ok: true, mode: aiMode(), result });
    }
    if (b.kind === 'event') {
      const text = String(b.text || '').trim().slice(0, 1500); if (!text) return NextResponse.json({ error: 'Describe what happens.' }, { status: 400 });
      return NextResponse.json({ ok: true, mode: aiMode(), result: await describeEvent(s, text) });
    }
    return NextResponse.json({ error: 'Unknown request.' }, { status: 400 });
  } catch (e) {
    console.error('[crisis assist]', e.message);
    return NextResponse.json({ error: 'The assistant is unavailable right now. Add effects by hand. (' + e.message.slice(0, 160) + ')' }, { status: 503 });
  }
}
