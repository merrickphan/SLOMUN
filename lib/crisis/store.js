// Where the game state lives. With SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set, it is one row
// in Postgres (see supabase/crisis.sql). Without them it lives in server memory, which is fine for
// local testing but resets whenever the server restarts.
//
// Backups are extra rows in the same table ("<game>:snap:<slot>"), so no database change is needed.
// One is written automatically every few minutes and before any reset or restore; the newest 40 are kept.
import { createClient } from '@supabase/supabase-js';
import { initialState } from './engine';

const GAME = process.env.CRISIS_GAME_ID || 'wwii';
// Accept the URL with or without a pasted /rest/v1/ suffix.
const url = (process.env.SUPABASE_URL || '').trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, ''), key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const db = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
export const storageMode = db ? 'supabase' : 'memory';

const SNAP_SLOTS = 40, SNAP_EVERY = 3 * 60 * 1000, SNAP_PREFIX = `${GAME}:snap:`;
const mem = (globalThis.__slomunCrisis = globalThis.__slomunCrisis || { state: null, snaps: [] });
const clone = (x) => JSON.parse(JSON.stringify(x));
// The last full state this server instance has seen. Polls compare version numbers first and only
// download the whole game when it actually changed, which keeps 25 screens polling cheap.
let cache = { state: null, at: 0 };
let verCache = { v: null, at: 0 };

async function fullRead() {
  const { data, error } = await db.from('crisis_state').select('state, version').eq('id', GAME).maybeSingle();
  if (error) throw new Error('Could not load the game: ' + error.message);
  if (data) return { ...data.state, version: data.version };
  const s = initialState();
  const ins = await db.from('crisis_state').insert({ id: GAME, version: s.version, state: s });
  if (ins.error && !/duplicate/i.test(ins.error.message)) throw new Error('Could not create the game: ' + ins.error.message);
  return ins.error ? fullRead() : s;
}
async function dbVersion() {
  const { data, error } = await db.from('crisis_state').select('version').eq('id', GAME).maybeSingle();
  if (error) throw new Error('Could not load the game: ' + error.message);
  return data ? data.version : null;
}
async function read() {
  if (!db) { if (!mem.state) mem.state = initialState(); return mem.state; }
  if (cache.state) { const v = await dbVersion(); if (v === cache.state.version) return cache.state; }
  const s = await fullRead(); cache = { state: s, at: Date.now() }; return s;
}

// The current version number only, shared for a moment between polls on this instance.
export async function currentVersion() {
  if (!db) return (mem.state || (mem.state = initialState())).version;
  if (verCache.v != null && Date.now() - verCache.at < 700) return verCache.v;
  const v = await dbVersion(); verCache = { v, at: Date.now() }; return v;
}

// Reads are shared for a moment so 25 screens polling at once cost one database read.
export async function load() {
  if (cache.state && Date.now() - cache.at < 700) return cache.state;
  const s = await read(); cache = { state: s, at: Date.now() }; return s;
}

// Apply a change with optimistic locking: if someone else saved first, reload and try again.
export async function mutate(fn, { snapshot } = {}) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const cur = attempt ? await reread() : await read(); const next = clone(cur);
    const result = fn(next); next.version = cur.version + 1;
    const due = snapshot || Date.now() - (next.snapAt || 0) > SNAP_EVERY;
    if (due) { next.snapAt = Date.now(); next.snapSeq = (next.snapSeq || 0) + 1; }
    if (!db) { mem.state = next; cache = { state: next, at: Date.now() }; if (due) await writeSnap(next, snapshot || 'Automatic'); return { state: next, result }; }
    const { data, error } = await db.from('crisis_state').update({ state: next, version: next.version, updated_at: new Date().toISOString() })
      .eq('id', GAME).eq('version', cur.version).select('version');
    if (error) throw new Error('Could not save: ' + error.message);
    if (data && data.length) {
      cache = { state: next, at: Date.now() }; verCache = { v: next.version, at: Date.now() };
      if (due) await writeSnap(next, snapshot || 'Automatic').catch((e) => console.error('[crisis] backup failed', e.message));
      return { state: next, result };
    }
    // Someone else saved first: wait a little (longer each time, with jitter) and try again.
    await new Promise((r) => setTimeout(r, 30 * (attempt + 1) + Math.random() * 60 * (attempt + 1)));
  }
  throw new Error('The game is busy. Try again.');
}
async function reread() { if (!db) return mem.state; const s = await fullRead(); cache = { state: s, at: Date.now() }; return s; }

/* ---------- Backups ---------- */
const metaOf = (s, label) => ({ at: Date.now(), label: String(label || 'Backup').slice(0, 80), update: s.update?.no ?? null, title: s.update?.title || '', version: s.version });
async function writeSnap(state, label) {
  const snap = clone(state); snap._snap = metaOf(state, label);
  if (!db) { mem.snaps.unshift(snap); mem.snaps = mem.snaps.slice(0, SNAP_SLOTS); return; }
  const slot = (state.snapSeq || 0) % SNAP_SLOTS;
  const { error } = await db.from('crisis_state').upsert({ id: SNAP_PREFIX + slot, version: state.version, state: snap, updated_at: new Date().toISOString() });
  if (error) throw new Error('Could not write a backup: ' + error.message);
}
// Save a backup now (for example before something risky), outside the automatic schedule.
export async function backupNow(label) {
  const { state } = await mutate(() => '', { snapshot: label || 'Saved by staff' }); return state._snap || metaOf(state, label);
}
export async function listBackups() {
  if (!db) return mem.snaps.map((s, i) => ({ id: 'mem:' + i, ...s._snap }));
  const { data, error } = await db.from('crisis_state').select('id, snap:state->_snap').like('id', SNAP_PREFIX + '%');
  if (error) throw new Error('Could not list backups: ' + error.message);
  return (data || []).filter((r) => r.snap).map((r) => ({ id: r.id, ...r.snap })).sort((a, b) => b.at - a.at);
}
async function readBackup(id) {
  if (!db) { const s = mem.snaps[+String(id).replace('mem:', '')]; if (!s) throw new Error('That backup no longer exists.'); return clone(s); }
  if (!String(id).startsWith(SNAP_PREFIX)) throw new Error('That backup no longer exists.');
  const { data, error } = await db.from('crisis_state').select('state').eq('id', id).maybeSingle();
  if (error || !data) throw new Error('That backup no longer exists.'); return data.state;
}
export async function exportGame() { return clone(await read()); }
// Put a saved game back. The current game is backed up first, so a restore can itself be undone.
export async function restoreGame({ id, state }) {
  const src = state || (await readBackup(id));
  if (!src || !Array.isArray(src.units) || !Array.isArray(src.queue) || !src.update) throw new Error('That file is not a saved crisis game.');
  const label = src._snap ? `restored backup from ${new Date(src._snap.at).toISOString()}` : 'restored from a file';
  await mutate(() => '', { snapshot: 'Before restore' });
  return mutate((s) => { const keep = { snapSeq: s.snapSeq, snapAt: s.snapAt }; for (const k of Object.keys(s)) delete s[k]; Object.assign(s, clone(src), keep); delete s._snap; return `Game ${label}`; });
}
