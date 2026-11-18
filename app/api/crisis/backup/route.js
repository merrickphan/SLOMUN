import { NextResponse } from 'next/server';
import { getSession } from '@/lib/crisis/session';
import { listBackups, backupNow, restoreGame, exportGame, storageMode } from '@/lib/crisis/store';
import { viewFor } from '@/lib/crisis/engine';

// Staff-only backups: list, save now, restore one, download the whole game, or restore from a downloaded file.
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
const H = { 'Cache-Control': 'no-store' };

export async function GET(req) {
  const sess = await getSession();
  if (sess?.role !== 'staff') return NextResponse.json({ error: 'Only crisis staff can see backups.' }, { status: 403, headers: H });
  try {
    if (new URL(req.url).searchParams.get('download')) {
      const s = await exportGame(); const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
      return new NextResponse(JSON.stringify(s), { headers: { ...H, 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="slomun-crisis-${stamp}.json"` } });
    }
    return NextResponse.json({ storage: storageMode, backups: await listBackups() }, { headers: H });
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 503, headers: H }); }
}

export async function POST(req) {
  const sess = await getSession();
  if (sess?.role !== 'staff') return NextResponse.json({ error: 'Only crisis staff can change backups.' }, { status: 403, headers: H });
  let b; try { b = await req.json(); } catch { return NextResponse.json({ error: 'Bad request.' }, { status: 400, headers: H }); }
  try {
    if (b.do === 'save') { const m = await backupNow(String(b.label || '').slice(0, 80) || 'Saved by staff'); return NextResponse.json({ ok: true, message: 'Backup saved', backup: m }, { headers: H }); }
    if (b.do === 'restore' || b.do === 'import') {
      const { state, result } = await restoreGame(b.do === 'restore' ? { id: b.id } : { state: b.state });
      return NextResponse.json({ ok: true, message: result, view: viewFor(state, sess) }, { headers: H });
    }
    return NextResponse.json({ error: 'Unknown backup action.' }, { status: 400, headers: H });
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 400, headers: H }); }
}
