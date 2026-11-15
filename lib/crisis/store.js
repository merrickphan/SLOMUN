// Where the game state lives. With SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set, it is one row
// in Postgres (see supabase/crisis.sql). Without them it lives in server memory, which is fine for
// local testing but resets whenever the server restarts.
import { createClient } from '@supabase/supabase-js';
import { initialState } from './engine';

const GAME = process.env.CRISIS_GAME_ID || 'wwii';
// Accept the URL with or without a pasted /rest/v1/ suffix.
const url = (process.env.SUPABASE_URL || '').trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, ''), key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const db = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
export const storageMode = db ? 'supabase' : 'memory';

const mem = (globalThis.__slomunCrisis = globalThis.__slomunCrisis || { state: null });
let cache = { state: null, at: 0 };

async function read() {
  if (!db) { if (!mem.state) mem.state = initialState(); return mem.state; }
  const { data, error } = await db.from('crisis_state').select('state, version').eq('id', GAME).maybeSingle();
  if (error) throw new Error('Could not load the game: ' + error.message);
  if (data) return { ...data.state, version: data.version };
  const s = initialState();
  const ins = await db.from('crisis_state').insert({ id: GAME, version: s.version, state: s });
  if (ins.error && !/duplicate/i.test(ins.error.message)) throw new Error('Could not create the game: ' + ins.error.message);
  return ins.error ? read() : s;
}

// Reads are shared for a moment so 25 screens polling at once cost one database read.
export async function load() {
  if (cache.state && Date.now() - cache.at < 700) return cache.state;
  const s = await read(); cache = { state: s, at: Date.now() }; return s;
}

// Apply a change with optimistic locking: if someone else saved first, reload and try again.
export async function mutate(fn) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const cur = await read(); const next = JSON.parse(JSON.stringify(cur));
    const result = fn(next); next.version = cur.version + 1;
    if (!db) { mem.state = next; cache = { state: next, at: Date.now() }; return { state: next, result }; }
    const { data, error } = await db.from('crisis_state').update({ state: next, version: next.version, updated_at: new Date().toISOString() })
      .eq('id', GAME).eq('version', cur.version).select('version');
    if (error) throw new Error('Could not save: ' + error.message);
    if (data && data.length) { cache = { state: next, at: Date.now() }; return { state: next, result }; }
    await new Promise((r) => setTimeout(r, 40 + Math.random() * 80));
  }
  throw new Error('The game is busy. Try again.');
}
