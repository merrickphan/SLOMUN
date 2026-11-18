// Game rules for the crisis app. The server holds one state document; every change
// goes through applyAction, and every screen reads it through viewFor, which hides
// what that screen is not allowed to see.
import * as S from './scenario';
import { REGIONS } from './regions';

const clone = (x) => JSON.parse(JSON.stringify(x));
const MAX_TEXT = 1200;
const clean = (t, max = MAX_TEXT) => String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanBlock = (t, max = MAX_TEXT) => String(t ?? '').trim().slice(0, max);
const clockNow = () =>
  new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Los_Angeles' });

export class GameError extends Error {}
const fail = (msg) => { throw new GameError(msg); };

// Movement arrows drawn on the map. The committee starts with a clean map; arrows appear as moves are approved.
const openingArrows = () => []; // movement arrows are turned off
function arrowBetween(from, to) {
  const dx = to[0] - from[0], dy = to[1] - from[1];
  const ctrl = [from[0] + dx / 2 - dy * 0.15, from[1] + dy / 2 + dx * 0.15];
  return [from, ctrl, to].map((p) => p.map((n) => +n.toFixed(3)));
}
// A spy's country can be a power key ("USSR") or a capital name ("Soviet Union", "Romania").
const capOf = (t) => S.CAPITAL[t] || S.CAPITAL[S.POWERS[t]?.label] || null;
const targetKey = (t) => S.LABEL_TO_KEY[t] || t;
function normalize(s) {
  if (!Array.isArray(s.arrows)) s.arrows = openingArrows(); if (!s.control) s.control = {};
  if (!Array.isArray(s.markers)) s.markers = []; if (!Array.isArray(s.recon)) s.recon = []; if (!Array.isArray(s.alliances)) s.alliances = [];
  if (!Array.isArray(s.messages)) s.messages = []; if (!s.assets) s.assets = {};
  if (!Array.isArray(s.features)) s.features = []; if (!Array.isArray(s.scheduled)) s.scheduled = [];
  if (!Array.isArray(s.relations)) s.relations = clone(S.START_RELATIONS); if (!s.status) s.status = {};
  if (!Array.isArray(s.blocs)) s.blocs = [];
  if (!s.clock) s.clock = { game: S.CLOCK_START, at: 0, rate: S.CLOCK_RATE, running: false }; // older games start paused
  for (const list of Object.values(s.agents || {})) for (const g of list) { if (!g.at) g.at = capOf(g.target); if (!g.id) g.id = 'g' + Math.random().toString(36).slice(2, 8); }
  return s;
}
// Allies: the starting sides, plus any alliances made by treaty during the game.
export function alliesIn(s, country) {
  const set = new Set(S.alliesOf(country));
  let grew = true;
  while (grew) { grew = false; for (const [a, b] of s.alliances || []) { if (set.has(a) && !set.has(b)) { set.add(b); grew = true; } if (set.has(b) && !set.has(a)) { set.add(a); grew = true; } } }
  return [...set];
}
const validAt = (at) => Array.isArray(at) && at.length === 2 && at.every((n) => isFinite(+n)) ? [+(+at[0]).toFixed(3), +Math.max(-80, Math.min(80, +at[1])).toFixed(3)] : null;

/* ----- Effects: anything crisis staff decide should happen ----- */
// A place is a region id, a named sea, or [lon, lat].
// Unit size in strength points (1 = a division, 100 aircraft or a capital ship with escorts); fractions allowed.
const strOf = (x) => Math.max(0.01, Math.min(999, Math.round((+x || 1) * 100) / 100));
function placeAt(to) {
  if (Array.isArray(to)) return validAt(to);
  const r = REGIONS.find((x) => x.id === to); if (r) return r.c.slice();
  if (S.SEAS[to]) return S.SEAS[to].slice();
  const c = S.cityNamed(to); if (c) return c.at.slice();
  return null;
}
// Who holds a city now: the region of its country nearest to it, and that region's current controller.
export function cityHolder(s, c) {
  const base = OWNER_OF(c.country); let best = null, bd = 99;
  for (const r of REGIONS) { if (OWNER_OF(r.country) !== base) continue; const d = Math.hypot(r.c[0] - c.at[0], r.c[1] - c.at[1]); if (d < bd) { bd = d; best = r; } }
  return best ? (s.control?.[best.id] || base) : base;
}
const placeName = (to) => (REGIONS.find((x) => x.id === to) || {}).name || (S.SEAS[to] ? to : S.cityNamed(to)?.name || 'the map');
const FEATURE_CAP = 120;
// Add a map feature. Line features (trenches, bunkers, wire) run from `at` to `to2` when given.
export function addFeature(s, e, ctx = {}) {
  const K = S.FEATURES[e.kind]; if (!K) return null;
  let at = e.to === '@here' ? validAt(ctx.at) : Array.isArray(e.at) ? validAt(e.at) : placeAt(e.to); if (!at) return null;
  if (['factory', 'shipyard', 'port', 'embassy', 'radio', 'hospital'].includes(e.kind)) { const c = S.nearestCity(at, e.kind === 'factory' || e.kind === 'shipyard' ? 3 : 1.5); if (c && (e.kind !== 'shipyard' || c.port)) at = [c.at[0] + 0.12, c.at[1] - 0.08]; }
  let to = e.to2 === '@here' ? validAt(ctx.at) : Array.isArray(e.at2) ? validAt(e.at2) : e.to2 ? placeAt(e.to2) : null;
  if (to && (!K.line || Math.hypot(to[0] - at[0], to[1] - at[1]) < 0.15 || Math.hypot(to[0] - at[0], to[1] - at[1]) > 12)) to = null;
  const turns = Math.max(0, Math.min(5, Math.round(+e.turns || 0)));
  const mod = e.mod === '' || e.mod == null || !isFinite(+e.mod) ? K.mod : Math.max(-4, Math.min(4, Math.round(+e.mod)));
  const owner = S.isOwner(e.owner) ? e.owner : ctx.country && S.POWERS[ctx.country] ? ctx.country : 'Germany';
  const f = { id: nextId(s, 'ft'), kind: e.kind, label: clean(e.label, 50) || K.name, owner, at, ...(to ? { to } : {}), mod, public: !!e.public, ready: s.update.no + turns, ruined: false, update: s.update.no };
  s.features.push(f); if (s.features.length > FEATURE_CAP) s.features.splice(0, s.features.length - FEATURE_CAP);
  return f;
}
export function applyEffects(s, effects = [], ctx = {}) {
  const done = [];
  for (const e of (effects || []).slice(0, 80)) {
    const u = e.unit && s.units.find((x) => x.id === e.unit);
    switch (e.type) {
      case 'money': if (S.POWERS[e.country]) { const n = Math.round(+e.amount || 0); s.treasury[e.country] += n; done.push(`${n >= 0 ? '+' : ''}$${n}M for ${S.POWERS[e.country].label}`); } break;
      case 'strength': if (u) { u.str = strOf(u.str + (+e.delta || 0)); done.push(`${u.name} now ${u.str}`); } break;
      case 'rename': { const n = clean(e.name, 60); if (u && n) { done.push(`${u.name} renamed ${n}`); u.name = n; } break; }
      case 'destroy': if (u) { s.units = s.units.filter((x) => x.id !== u.id); s.arrows = s.arrows.filter((x) => x.unit !== u.id); done.push(`${u.name} destroyed`); if (e.public !== false) wire(s, `${(S.POWERS[u.owner]?.label || u.owner).toUpperCase()} · ${u.name} ${u.kind === 'fleet' ? 'sunk' : u.kind === 'air' ? 'shot down' : 'destroyed'}`); } break;
      case 'move': { const at = placeAt(e.to); if (u && at) { const from = u.at.slice(); u.at = at; if (e.public) u.shown = at.slice(); s.arrows.push({ id: nextId(s, 'a'), pts: arrowBetween(from, at), owner: u.owner, unit: u.id, public: !!e.public, update: s.update.no }); done.push(`${u.name} to ${placeName(e.to)}`); } break; }
      case 'unit': { const at = placeAt(e.to); if (S.isOwner(e.owner) && S.KINDS.includes(e.kind) && at) { s.units.push({ id: nextId(s, 'u'), owner: e.owner, kind: e.kind, at, str: strOf(e.str), name: clean(e.name, 60) || `New ${S.KIND_NAME[e.kind].toLowerCase()}`, note: clean(e.note, 200) || 'Raised during the crisis.', shown: e.public ? at.slice() : null, ...(clean(e.traitLabel, 40) ? { traits: [{ label: clean(e.traitLabel, 40), mod: Math.max(-4, Math.min(4, Math.round(+e.traitMod || 0))) }] } : {}) }); done.push(`new unit at ${placeName(e.to)}`); } break; }
      case 'region': { const ids = (e.ids || []).filter((id) => REGION[id]); if (ids.length) { setControl(s, ids, e.owner); if (e.public !== false) wire(s, `FRONT · ${nameOf(e.owner)} takes ${describeRegions(ids)}`); done.push(`${ids.length} region(s) to ${nameOf(e.owner)}`); } break; }
      case 'intel': if (S.POWERS[e.country] && clean(e.text)) { (s.intel[e.country] = s.intel[e.country] || []).unshift({ from: clean(e.from, 60) || 'Crisis staff', text: clean(e.text, 600), rel: ['High', 'Medium', 'Low'].includes(e.rel) ? e.rel : 'Medium' }); done.push(`intel to ${S.POWERS[e.country].label}`); } break;
      case 'wire': if (clean(e.text)) { wire(s, e.text); done.push('wire headline'); } break;
      case 'marker': { const at = placeAt(e.to); if (at) { s.markers.push({ id: nextId(s, 'm'), at, label: clean(e.label, 40) || 'Event', owner: S.POWERS[e.owner] ? e.owner : 'United Kingdom', public: !!e.public, update: s.update.no }); done.push('map marker'); } break; }
      case 'asset': if (S.rosterEntry(e.name) && clean(e.text)) { (s.assets[e.name] = s.assets[e.name] || []).push({ text: clean(e.text, 200), update: s.update.no }); done.push(`new asset for ${e.name}`); } break;
      case 'feature': { const f = addFeature(s, e, ctx); if (f) { done.push(`${f.label}${f.ready > s.update.no ? ` (ready after Update ${f.ready})` : ''}`); if (f.public && e.announce !== false) wire(s, `${nameOf(f.owner).toUpperCase()} · ${f.ready > s.update.no ? 'Work begins on ' + f.label.toLowerCase() : f.label + ' reported'}${placeNear(f.at)}`); } break; }
      case 'feature.edit': { const f = s.features.find((x) => x.id === e.id); if (!f) break;
        if (e.action === 'remove') { s.features = s.features.filter((x) => x !== f); done.push(`${f.label} removed`); }
        else if (e.action === 'repair') { f.ruined = false; done.push(`${f.label} repaired`); }
        else if (e.action === 'finish') { f.ready = s.update.no; done.push(`${f.label} finished`); }
        else if (e.action === 'move') { const at = placeAt(e.to); if (at) { if (f.to) { f.to = [+(f.to[0] + at[0] - f.at[0]).toFixed(3), +(f.to[1] + at[1] - f.at[1]).toFixed(3)]; } f.at = at; done.push(`${f.label} moved`); } }
        else { f.ruined = true; done.push(`${f.label} destroyed`); if (f.public || e.public) { f.public = true; wire(s, `${nameOf(f.owner).toUpperCase()} · ${f.label} destroyed${placeNear(f.at)}`); } }
        break; }
      case 'trait': if (u) {
        if (e.action === 'clear') { delete u.traits; done.push(`${u.name}: traits cleared`); break; }
        const t = clean(e.label, 40); if (!t) break; const mod = Math.max(-4, Math.min(4, Math.round(+e.mod || 0)));
        u.traits = (u.traits || []).filter((x) => x.label !== t).concat([{ label: t, mod }]).slice(-4); done.push(`${u.name}: ${t} ${mod >= 0 ? '+' : ''}${mod}`);
      } break;
      case 'relation': {
        // Any country can be named, as long as one side is a playable power (Britain at war with Spain, Japan allied with Siam).
        const nm = (c) => (S.POWERS[c] ? c : S.LABEL_TO_KEY?.[c] || clean(c, 40)); const a = nm(e.country), b = nm(e.other); if (!a || !b || a === b || (!S.POWERS[a] && !S.POWERS[b])) break;
        const st = ['war', 'alliance', 'pact', 'trade', 'tension', 'none', 'peace'].includes(e.status) ? e.status : 'war';
        const same = (r) => (r.a === a && r.b === b) || (r.a === b && r.b === a);
        // War and peace replace each other; an alliance or pact ends a war.
        s.relations = s.relations.filter((r) => !same(r) || (st !== 'none' && st !== 'peace' && !['war', 'alliance', 'pact'].includes(r.status) && !['war', 'alliance', 'pact'].includes(st)));
        if (st !== 'none' && st !== 'peace') s.relations.push({ a, b, status: st, update: s.update.no });
        if (st === 'alliance' && !s.alliances.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) s.alliances.push([a, b]);
        if (st === 'war' || st === 'peace' || st === 'none') s.alliances = s.alliances.filter(([x, y]) => !((x === a && y === b) || (x === b && y === a)));
        done.push(`${nameOf(a)} and ${nameOf(b)}: ${st === 'none' ? 'relations reset' : st}`); break; }
      case 'status': {
        const c = S.POWERS[e.country] ? e.country : null; if (!c) break; const list = (s.status[c] = s.status[c] || []); const t = clean(e.label, 40);
        if (e.action === 'clear') { s.status[c] = list.filter((x) => x.label !== t); done.push(`${nameOf(c)}: ${t || 'status'} cleared`); break; }
        if (!t) break; s.status[c] = list.filter((x) => x.label !== t).concat([{ label: t, tone: ['good', 'bad', 'info'].includes(e.tone) ? e.tone : 'info', update: s.update.no }]).slice(-6);
        done.push(`${nameOf(c)}: ${t}`); break; }
      case 'flash': if (clean(e.label || e.text)) { s.flash = { id: nextId(s, 'f'), head: clean(e.label || e.text, 140), deck: clean(e.text && e.label ? e.text : '', 600) }; done.push('breaking news'); } break;
      case 'battle': { const r = resolveBattle(s, e); if (r) done.push(r); break; }
      case 'reveal': {
        // Show the viewer's side some or all of another country's forces (until staff hide them again).
        const viewer = S.POWERS[e.country] ? e.country : null; if (!viewer) break; const key = S.spottedKeyOf(viewer); const book = (s.spotted[key] = s.spotted[key] || {});
        const list = (e.ids || []).length ? s.units.filter((u) => e.ids.includes(u.id)) : s.units.filter((u) => u.owner === e.other);
        const why = clean(e.text, 80) || 'Reported by intelligence'; let n = 0;
        for (const u of list) if (!S.alliesOf(viewer).includes(u.owner)) { book[u.id] = why; n++; }
        if (n) done.push(`${nameOf(viewer)} can now see ${n} ${n === 1 ? 'force' : 'forces'}`); break; }
      case 'agent': {
        const who = S.rosterEntry(e.name) ? e.name : S.rosterEntry(ctx.from) ? ctx.from : null; if (!who) break;
        const list = (s.agents[who] = s.agents[who] || []); const tgt = targetKey(clean(e.target, 40));
        if (e.action === 'move') { const g = list.find((x) => x.id === e.id); const at = g && placeAt(e.to); if (at) { g.at = at; done.push(`${who}'s agent moved`); } break; }
        if (e.action === 'remove') { const before = list.length; s.agents[who] = list.filter((g) => !(g.id === e.id || (tgt && g.target === tgt))); if (s.agents[who].length < before) done.push(`${who}'s agent removed`); break; }
        const at = e.to ? (e.to === '@here' ? validAt(ctx.at) : placeAt(e.to)) : null; const spot = at || capOf(tgt); if (!spot) break;
        list.push({ id: nextId(s, 'g'), target: tgt || 'unknown', mission: clean(e.mission, 80) || 'Gather intelligence', at: spot, update: s.update.no });
        if (list.length > 8) list.shift();
        done.push(`agent for ${who} in ${nameOf(tgt) || 'the field'}`); break; }
      case 'message': if (clean(e.text)) { s.messages.push({ id: nextId(s, 'msg'), from: clean(e.from, 60) || 'Crisis staff', staff: true, to: (e.to || []).filter((n) => S.rosterEntry(n)), text: clean(e.text, 1200), time: clockNow() }); done.push('message sent'); } break;
    }
  }
  s.messages = s.messages.slice(-500);
  return done;
}
// Effects can happen now or at a later crisis update. Returns a summary for the reply.
export function runEffects(s, effects, ctx = {}, when = 0) {
  const n = Math.max(0, Math.min(5, Math.round(+when || 0)));
  const list = (effects || []).filter((e) => e && e.type);
  if (!list.length) return [];
  if (!n) return applyEffects(s, list, ctx);
  const due = s.update.no + n;
  s.scheduled.push({ id: nextId(s, 'sch'), due, effects: list.slice(0, 20), ctx: { at: validAt(ctx.at), country: ctx.country, from: ctx.from }, note: clean(ctx.note, 140) });
  return [`${list.length} effect${list.length > 1 ? 's' : ''} scheduled for Update ${due}`];
}
// Automatic battle: same ratio table as the staff calculator, including features near the defenders and unit traits.
const traitMul = (u) => Math.max(0.25, 1 + S.MOD_STEP * (u.traits || []).reduce((a, t) => a + (+t.mod || 0), 0));
function featDist(f, at) {
  if (!f.to) return Math.hypot(f.at[0] - at[0], f.at[1] - at[1]);
  const [x1, y1] = f.at, [x2, y2] = f.to, dx = x2 - x1, dy = y2 - y1; const t = Math.max(0, Math.min(1, ((at[0] - x1) * dx + (at[1] - y1) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x1 + t * dx - at[0], y1 + t * dy - at[1]);
}
export function battleOdds(s, att, def, aBonus = 0, dBonus = 0) {
  const aOwner = att[0].owner, dOwner = def[0].owner; const dSide = S.alliesOf(dOwner);
  const feats = s.features.filter((f) => !f.ruined && f.ready <= s.update.no && f.mod && f.owner !== aOwner && (f.owner === dOwner || dSide.includes(f.owner)) && def.some((u) => featDist(f, u.at) < 1.4));
  const A = att.reduce((a, u) => a + u.str * traitMul(u), 0) * Math.max(0.25, 1 + aBonus);
  const D = def.reduce((a, u) => a + u.str * traitMul(u), 0) * Math.max(0.25, 1 + dBonus + feats.reduce((a, f) => a + f.mod, 0) * S.MOD_STEP);
  return { A, D, ratio: A / Math.max(0.1, D), feats };
}
function resolveBattle(s, e) {
  const att = (e.attackers || []).map((id) => s.units.find((u) => u.id === id)).filter(Boolean), def = (e.defenders || []).map((id) => s.units.find((u) => u.id === id)).filter(Boolean);
  if (!att.length || !def.length) return null;
  const { ratio, feats } = battleOdds(s, att, def, Math.max(-0.75, Math.min(1.5, +e.amount || 0)), Math.max(-0.75, Math.min(1.5, +e.mod || 0)));
  let ti = S.TIERS.findIndex((t) => ratio >= t.min); const roll = 1 + Math.floor(Math.random() * 6);
  if (roll === 1) ti = Math.min(S.TIERS.length - 1, ti + 1); if (roll === 6) ti = Math.max(0, ti - 1);
  const t = S.TIERS[ti]; const lost = [];
  const hit = (u, frac) => { const n = Math.round(u.str * (1 - frac)); if (n < 1) { s.units = s.units.filter((x) => x !== u); lost.push(`${u.name} ${u.kind === 'fleet' ? 'sunk' : u.kind === 'air' ? 'shot down' : 'destroyed'}`); } else u.str = n; };
  att.forEach((u) => hit(u, t.att)); def.forEach((u) => hit(u, t.def));
  let taken = '';
  if (t.win) { feats.forEach((f) => (f.ruined = true)); const ids = (e.ids || []).filter((id) => REGION[id]); if (ids.length) taken = describeRegions(setControl(s, ids, att[0].owner)); }
  const verdict = t.name.toLowerCase().replace('attacker', nameOf(att[0].owner));
  wire(s, `BATTLE · ${clean(e.label, 100) || `${nameOf(att[0].owner)} attacks ${def.map((u) => u.name).join(' and ')}`}: ${verdict}${taken ? ` · ${nameOf(att[0].owner)} takes ${taken}` : ''}${lost.length ? ' · ' + lost.join(', ') : ''}`);
  return `battle: ${verdict} (ratio ${ratio.toFixed(2)}, die ${roll})`;
}
// One step of undo for staff: the state right before the last big decision.
const UNDO_FIELDS = ['units', 'treasury', 'queue', 'directives', 'wire', 'flash', 'intel', 'agents', 'control', 'markers', 'recon', 'alliances', 'messages', 'assets', 'features', 'scheduled', 'relations', 'status', 'seq', 'update', 'countdownEnd', 'dirNo'];
export function saveUndo(s, label) { s.undo = { label: clean(label, 120), at: Date.now(), snap: JSON.stringify(Object.fromEntries(UNDO_FIELDS.map((k) => [k, s[k]]))) }; }
const placeNear = (at) => { let best = null, d = 1e9; for (const r of REGIONS) { const k = Math.hypot(r.c[0] - at[0], r.c[1] - at[1]); if (k < d) { d = k; best = r; } } return best && d < 4 ? ` near ${best.name}` : ''; };

/* ----- Territory ----- */
const REGION = Object.fromEntries(REGIONS.map((r) => [r.id, r]));
const OWNER_OF = (country) => S.OWNER[country] || country;
export const baseOwner = (r) => OWNER_OF(r.country);
const ZONE_ADJ = { North: 'northern', South: 'southern', East: 'eastern', West: 'western', Central: 'central', Northeast: 'northeastern', Northwest: 'northwestern', Southeast: 'southeastern', Southwest: 'southwestern' };
const CNAME = { USSR: 'the Soviet Union', 'United Kingdom': 'Britain', Czechoslovakia: 'Czechoslovakia', Netherlands: 'the Netherlands' };
const nameOf = (c) => S.POWERS[c]?.label || c;
const placeOf = (c) => CNAME[c] || nameOf(c);
// Describe a set of flipped regions the way a newspaper would: "western Poland" when a whole zone fell.
function describeRegions(ids) {
  const byCountry = {};
  for (const id of ids) { const r = REGION[id]; (byCountry[r.country] = byCountry[r.country] || []).push(r); }
  return Object.entries(byCountry).map(([c, list]) => {
    const all = REGIONS.filter((r) => r.country === c);
    if (list.length === all.length) return `all of ${placeOf(c)}`;
    const parts = []; const zones = [...new Set(list.map((r) => r.zone))];
    for (const z of zones) {
      const zr = all.filter((r) => r.zone === z), got = list.filter((r) => r.zone === z);
      if (got.length === zr.length && zr.length > 1) parts.push(`${ZONE_ADJ[z] ? ZONE_ADJ[z] + ' ' + placeOf(c).replace(/^the /, '') : z} (${got.map((r) => r.name).join(', ')})`);
      else parts.push(...got.map((r) => r.name));
    }
    return parts.join(', ');
  }).join('; ');
}
function setControl(s, ids, owner) {
  const valid = ids.filter((id) => REGION[id]); if (!valid.length) fail('Pick at least one region.');
  if (!S.isOwner(owner) && !REGIONS.some((r) => r.country === owner)) fail('Pick who controls it.');
  for (const id of valid) { if (owner === baseOwner(REGION[id])) delete s.control[id]; else s.control[id] = owner; }
  return valid;
}

export function initialState() {
  return {
    version: 1,
    units: clone(S.UNITS).map((u) => ({ ...u, shown: u.at.slice() })),
    treasury: Object.fromEntries(Object.entries(S.POWERS).map(([k, p]) => [k, p.treasury])),
    queue: [],
    directives: [],
    wire: S.START_WIRE.slice(),
    update: { ...S.START_UPDATE },
    clock: { game: S.CLOCK_START, at: Date.now(), rate: S.CLOCK_RATE, running: true },
    flash: null,
    countdownEnd: Date.now() + 15 * 60 * 1000,
    intel: clone(S.INTEL_BY),
    agents: {},
    spotted: clone(S.SPOTTED_BY),
    seq: 1,
    dirNo: 0,
    arrows: openingArrows(),
    // Everything below must be listed so a reset really starts over.
    control: {}, markers: [], recon: [], alliances: [], messages: [], assets: {}, features: [], scheduled: [],
    relations: clone(S.START_RELATIONS), status: {},
  };
}

// Example requests and directives so staff can rehearse before the conference.
export function demoState() {
  const s = initialState();
  const t = clockNow();
  s.queue = [
    { from: 'Winston Churchill', country: 'United Kingdom', type: 'fleet', title: 'Move Home Fleet: North Sea', vis: 'private', detail: { unit: 'home-fleet', dest: 'North Sea' } },
    { from: 'Gerd von Rundstedt', country: 'Germany', type: 'fleet', title: 'Move Panzer Divisions: Spearhead an attack', vis: 'private', detail: { unit: 'pz', dest: 'Spearhead an attack' } },
    { from: 'Erich Raeder', country: 'Germany', type: 'fleet', title: 'Move Kriegsmarine: North Atlantic', vis: 'private', detail: { unit: 'kriegsmarine', dest: 'North Atlantic' } },
    { from: 'Edmund Ironside', country: 'United Kingdom', type: 'spy', title: 'Spy to Berlin: steal war plans', vis: 'private', detail: { target: 'Germany', mission: 'Steal war plans', cover: 'Journalist', cost: 3 } },
    { from: 'Neville Chamberlain', country: 'United Kingdom', type: 'money', title: 'Send $15M to Poland', vis: 'public', detail: { to: 'Poland', amount: 15 } },
    { from: 'Isoroku Yamamoto', country: 'Japan', type: 'press', title: 'Press release: Japan has no interest in the war in Europe', vis: 'public', detail: {} },
  ].map((q, i) => ({ id: 'q' + (i + 1), status: 'pending', time: t, ...q }));
  s.agents = { 'Edmund Ironside': [{ target: 'Germany', mission: 'Steal war plans' }] };
  s.directives = [
    { id: 'd1', no: '1.1', title: 'Emergency Aid to Poland', sponsors: ['Edward Rydz-Śmigły'], signed: ['Edward Rydz-Śmigły', 'Neville Chamberlain', 'Édouard Daladier', 'Maurice Gamelin'], requested: [], status: 'chair', clauses: ['Britain and France send $40M for weapons to Poland.', 'French forces begin a limited attack into the Saar within one week.'] },
  ];
  s.seq = 20; s.dirNo = 1;
  return s;
}

const nextId = (s, p) => p + ++s.seq;
const findQ = (s, id) => s.queue.find((q) => q.id === id) || fail('That request no longer exists.');
const findD = (s, id) => s.directives.find((d) => d.id === id) || fail('That directive no longer exists.');
const label = (c) => S.POWERS[c]?.label || c;
const LABEL_TO_KEY = Object.fromEntries(Object.entries(S.POWERS).map(([k, p]) => [p.label, k]));
const wire = (s, line) => { s.wire.unshift(clean(line, 200)); s.wire = s.wire.slice(0, 40); };

export function applyAction(s, sess, a) {
  normalize(s);
  const staff = sess.role === 'staff';
  // Staff can act as a delegate (for testing and for helping a delegate whose laptop fails).
  const me = sess.role === 'delegate' ? S.rosterEntry(sess.name) : staff && a?.as ? S.rosterEntry(a.as) : null;
  if (!staff && !me) fail('You are not allowed to do that.');
  switch (a?.type) {
    /* ----- Delegates ----- */
    case 'request': {
      if (!me) fail('Only delegates send requests.');
      const type = a.kind; if (!S.REQUEST_TYPES.includes(type)) fail('Unknown action.');
      const d = a.detail || {}; const detail = {};
      if (type === 'fleet') {
        const u = s.units.find((x) => x.id === d.unit);
        if (!u || u.owner !== me.country) fail('Pick one of your own forces.');
        if (!me.commands.includes(u.kind)) fail('That force is under another commander.');
        if (!S.DEST_BY_KIND[u.kind].includes(d.dest)) fail('Pick a destination from the list.');
        Object.assign(detail, { unit: u.id, dest: d.dest });
      }
      if (type === 'spy') {
        if (!S.CAPITAL[d.target]) fail('Pick a target country.');
        Object.assign(detail, { target: d.target, mission: clean(d.mission, 60), cover: clean(d.cover, 30), cost: Math.max(0, Math.min(9999, +d.cost || 0)) });
        const list = (s.agents[me.name] = s.agents[me.name] || []);
        if (list.length < 8) list.push({ id: nextId(s, 'g'), target: targetKey(detail.target), mission: detail.mission, at: capOf(detail.target), update: s.update.no });
      }
      if (type === 'money') Object.assign(detail, { to: clean(d.to, 40), amount: Math.max(1, Math.min(9999, Math.round(+d.amount || 0))) });
      if (type === 'build') {
        if (!S.BUILD[d.btype]) fail('Pick what to build.'); const c = S.cityNamed(d.city); if (!c) fail('Pick a city to build in.');
        if (cityHolder(s, c) !== me.country) fail(`${c.name} is not held by ${S.POWERS[me.country].label}.`);
        if (S.BUILD_KIND[d.btype] === 'fleet' && !c.port) fail(`${c.name} has no shipyard. Pick a port city.`);
        Object.assign(detail, { btype: d.btype, qty: Math.max(1, Math.min(10, Math.round(+d.qty || 1))), at: c.at.slice(), where: c.name, city: c.name });
      }
      if (type === 'op') { const at = validAt(d.at); Object.assign(detail, { op: clean(d.op, 60), cost: Math.max(0, Math.min(9999, +d.cost || 0)), ...(at ? { at, where: clean(d.where, 60) } : {}) }); }
      if (type === 'treaty') Object.assign(detail, { with: S.POWERS[d.with] ? d.with : '' });
      if (type === 'secret') { const at = validAt(d.at); const to = S.backroomNamed(d.to); Object.assign(detail, { cost: Math.max(0, Math.min(9999, +d.cost || 0)), ...(at ? { at, where: clean(d.where, 60) } : {}), ...(to ? { to: to.name } : {}) }); }
      if (d.parent && s.queue.some((q) => q.id === d.parent && q.from === me.name)) detail.parent = d.parent;
      const title = clean(a.title, 140); if (!title) fail('Write your request before sending it.');
      const vis = type === 'spy' ? 'private' : type === 'press' ? 'public' : a.vis === 'public' ? 'public' : 'private';
      const mine = s.queue.filter((q) => q.from === me.name && q.status === 'pending').length;
      if (mine >= 15) fail('You have 15 requests waiting. Wait for crisis staff to answer some first.');
      s.queue.unshift({ id: nextId(s, 'q'), from: me.name, country: me.country, type, title, vis, status: 'pending', time: clockNow(), detail, text: cleanBlock(a.text) });
      s.queue = s.queue.slice(0, 400);
      return 'Sent to crisis staff';
    }
    // Blocs: standing group chats for passing notes between several delegates.
    case 'bloc.create': {
      if (!me) fail('Only delegates make blocs.'); const name = clean(a.name, 50); if (!name) fail('Name the bloc.');
      const members = [...new Set([me.name, ...(a.members || []).filter((n) => S.rosterEntry(n))])]; if (members.length < 2) fail('Invite at least one delegate.');
      if (s.blocs.filter((b) => b.members.includes(me.name)).length >= 12) fail('Leave a bloc before starting another.');
      s.blocs.push({ id: nextId(s, 'b'), name, owner: me.name, members, time: clockNow() }); return `Bloc "${name}" created`;
    }
    case 'bloc.invite': case 'bloc.leave': {
      const b = s.blocs.find((x) => x.id === a.id) || fail('That bloc no longer exists.');
      if (!me || !b.members.includes(me.name)) fail('Only members can do that.');
      if (a.type === 'bloc.leave') { b.members = b.members.filter((n) => n !== me.name); if (!b.members.length) s.blocs = s.blocs.filter((x) => x !== b); return `You left ${b.name}`; }
      const add = (a.names || []).filter((n) => S.rosterEntry(n) && !b.members.includes(n)); if (!add.length) fail('Pick someone to invite.');
      b.members.push(...add); return `Invited ${add.join(', ')}`;
    }
    case 'msg.send': {
      if (!me) fail('Only delegates send messages here.');
      const bloc = a.bloc ? s.blocs.find((x) => x.id === a.bloc && x.members.includes(me.name)) || fail('You are not in that bloc.') : null;
      const to = [...new Set((bloc ? bloc.members : a.to || []).filter((n) => S.rosterEntry(n) && n !== me.name))]; const text = clean(a.text, 1200);
      if (!to.length) fail('Pick who to send it to.'); if (!text) fail('Write a message.');
      // Spies placed in a country have an even chance of copying each note sent to or from its delegates.
      const countries = new Set([me.country, ...to.map((n) => S.rosterEntry(n).country)]); const intercepted = [];
      for (const [spyOwner, list] of Object.entries(s.agents)) {
        const r = S.rosterEntry(spyOwner); if (!r || spyOwner === me.name || to.includes(spyOwner)) continue;
        if (list.some((g) => countries.has(g.target) && g.target !== r.country) && Math.random() < 0.5) intercepted.push(spyOwner);
      }
      s.messages.push({ id: nextId(s, 'msg'), from: me.name, to, text, time: clockNow(), ...(bloc ? { bloc: bloc.id } : {}), ...(intercepted.length ? { intercepted } : {}) }); s.messages = s.messages.slice(-800);
      return bloc ? '' : 'Note passed. Crisis staff can read every note.';
    }
    case 'dir.create': {
      if (!me) fail('Only delegates write directives.');
      const title = clean(a.title, 120); const clauses = (a.clauses || []).map((c) => clean(c, 500)).filter(Boolean).slice(0, 8);
      const asked = [...new Set((a.asked || []).filter((n) => S.rosterEntry(n) && n !== me.name))];
      if (!title || !clauses.length) fail('Add a title and at least one clause.');
      if (asked.length < S.SIGS_NEEDED - 1) fail(`Ask at least ${S.SIGS_NEEDED - 1} people to sign.`);
      s.directives.unshift({ id: nextId(s, 'd'), no: '', title, sponsors: [me.name], signed: [me.name], requested: asked, status: 'signing', clauses });
      return 'Sent for signatures';
    }
    // Shared drafts: co-authors edit the title and clauses together, then send for signatures.
    case 'dir.draft': {
      if (!me) fail('Only delegates write directives.');
      if (s.directives.filter((d) => d.status === 'drafting' && d.authors?.includes(me.name)).length >= 6) fail('Finish or discard one of your drafts first.');
      s.directives.unshift({ id: nextId(s, 'd'), no: '', title: '', sponsors: [me.name], authors: [me.name], signed: [], requested: [], status: 'drafting', clauses: [''], typing: {}, owner: me.name });
      return 'Draft started';
    }
    case 'dir.edit': case 'dir.clause.add': case 'dir.clause.remove': case 'dir.invite': case 'dir.send': case 'dir.discard': {
      const d = findD(s, a.id);
      if (!me || !d.authors?.includes(me.name)) fail('Only the co-authors can change this draft.');
      if (d.status !== 'drafting') fail('This directive was already sent for signatures.');
      d.typing = d.typing || {};
      if (a.type === 'dir.edit') {
        if (a.key === 'title') d.title = clean(a.text, 120);
        else { const i = +a.key; if (!(i >= 0 && i < d.clauses.length)) fail('That clause was removed.'); d.clauses[i] = cleanBlock(a.text).slice(0, 600); }
        d.typing[a.key] = { by: me.name, at: Date.now() }; return '';
      }
      if (a.type === 'dir.clause.add') { if (d.clauses.length >= 12) fail('A directive can have at most 12 clauses.'); const at = Math.max(0, Math.min(d.clauses.length, +a.at || d.clauses.length)); d.clauses.splice(at, 0, ''); d.typing = {}; return ''; }
      if (a.type === 'dir.clause.remove') { if (d.clauses.length <= 1) fail('Keep at least one clause.'); d.clauses.splice(+a.i, 1); d.typing = {}; return ''; }
      if (a.type === 'dir.invite') {
        const add = (a.names || []).filter((n) => S.rosterEntry(n) && !d.authors.includes(n)); if (!add.length) fail('Pick someone to invite.');
        d.authors.push(...add); d.sponsors = [...d.authors]; return `Invited ${add.join(', ')}`;
      }
      if (a.type === 'dir.discard') { if (d.owner && d.owner !== me.name) { d.authors = d.authors.filter((n) => n !== me.name); d.sponsors = [...d.authors]; return 'You left the draft'; } s.directives = s.directives.filter((x) => x !== d); return 'Draft discarded'; }
      const clauses = d.clauses.map((c) => c.trim()).filter(Boolean); if (!d.title.trim() || !clauses.length) fail('Add a title and at least one clause.');
      const asked = [...new Set((a.asked || []).filter((n) => S.rosterEntry(n) && !d.authors.includes(n)))];
      if (d.authors.length + asked.length < S.SIGS_NEEDED) fail(`You need ${S.SIGS_NEEDED} names in total. Ask ${S.SIGS_NEEDED - d.authors.length - asked.length} more to sign.`);
      Object.assign(d, { clauses, sponsors: [...d.authors], signed: [...d.authors], requested: asked, status: 'signing' }); delete d.typing;
      return 'Sent for signatures';
    }
    case 'dir.sign': case 'dir.decline': {
      if (!me) fail('Only delegates sign directives.');
      const d = findD(s, a.id); if (d.status !== 'signing') fail('This directive is no longer collecting signatures.');
      if (a.type === 'dir.sign') { if (!d.signed.includes(me.name)) d.signed.push(me.name); return `You signed "${d.title}"`; }
      d.requested = d.requested.filter((n) => n !== me.name); return 'Declined';
    }
    case 'dir.submit': {
      const d = findD(s, a.id);
      if (!me || !d.sponsors.includes(me.name)) fail('Only a sponsor can submit this directive.');
      if (d.signed.length < S.SIGS_NEEDED) fail(`It needs ${S.SIGS_NEEDED} signatures first.`);
      d.status = 'chair'; return 'Sent to the chair for approval';
    }
  }
  if (!staff) fail('Only crisis staff can do that.');
  switch (a.type) {
    case 'decide': {
      const q = findQ(s, a.id); if (q.status !== 'pending') fail('Someone already answered this request.');
      saveUndo(s, `${a.dec === 'reject' ? 'Rejected' : 'Approved'}: ${q.title}`);
      const d = q.detail || {}; const def = S.DEFAULT_REPLY[q.type] || S.DEFAULT_REPLY.secret;
      const dec = a.dec; const ok = !['reject', 'spy-fail', 'spy-caught'].includes(dec);
      q.status = ok ? 'approved' : 'rejected';
      q.reply = clean(a.reply, 500) || (dec === 'spy-fail' ? def[1] : dec === 'spy-caught' ? def[2] : ok ? def[0] : def[1]);
      q.decidedAt = clockNow();
      const fx = runEffects(s, a.effects, { at: d.at, country: q.country, from: q.from, note: q.title }, a.when); if (fx.length) q.effects = fx;
      if (+a.when > 0) q.outcome = `scheduled for Update ${s.update.no + Math.round(+a.when)}`;
      // Staged by hand on the staff map: the effects already say exactly what happens, so nothing automatic is added.
      if (dec === 'manual') {
        q.outcome = q.outcome || 'carried out'; const head = clean(a.headline, 200); if (head) wire(s, head);
        if (a.flash?.head) s.flash = { id: nextId(s, 'f'), head: clean(a.flash.head, 140), deck: clean(a.flash.deck, 600) };
        return 'Approved' + (fx.length ? ': ' + fx.join(', ') : '');
      }
      if (dec === 'move-public' || dec === 'move-secret') {
        const u = s.units.find((x) => x.id === d.unit);
        if (u) {
          const from = u.at.slice(); u.at = S.destFor(u, d.dest).map((n) => +n.toFixed(3)); if (dec === 'move-public') u.shown = u.at.slice();
          if (Math.hypot(u.at[0] - from[0], u.at[1] - from[1]) > 0.3) {
            s.arrows = s.arrows.filter((a) => a.unit !== u.id || a.public !== (dec === 'move-public'));
            s.arrows.push({ id: nextId(s, 'a'), pts: arrowBetween(from, u.at), owner: u.owner, unit: u.id, public: dec === 'move-public', update: s.update.no });
          }
        }
        q.outcome = dec === 'move-public' ? 'moved' : 'moved secretly';
      }
      if (q.type === 'spy') {
        const city = S.CITY_OF[d.target] || d.target;
        s.treasury[q.country] -= d.cost || 0;
        q.outcome = { 'spy-ok': 'succeeded', 'spy-fail': 'failed', 'spy-caught': 'caught' }[dec] || q.status;
        if (dec === 'spy-ok') (s.intel[q.country] = s.intel[q.country] || []).unshift({ from: `Agent in ${city}`, text: q.reply, rel: 'High' });
        if (dec === 'spy-caught') wire(s, `${city.toUpperCase()} · Foreign agent posing as a ${String(d.cover).toLowerCase()} arrested`);
        const list = s.agents[q.from]; if (list && dec !== 'spy-ok') { const i = list.findIndex((x) => x.target === targetKey(d.target)); if (i >= 0) list.splice(i, 1); }
      }
      if (q.type === 'money' && ok) { s.treasury[q.country] -= d.amount; const to = LABEL_TO_KEY[d.to] || (S.POWERS[d.to] ? d.to : null); if (to) s.treasury[to] += d.amount; }
      if (q.type === 'build' && ok) {
        s.treasury[q.country] -= (S.BUILD[d.btype] || 0) * d.qty; const kind = S.BUILD_KIND[d.btype];
        const at = d.at || (s.units.find((x) => x.owner === q.country) || {}).at;
        const near = at && s.units.find((x) => x.owner === q.country && x.kind === kind && Math.hypot(x.at[0] - at[0], x.at[1] - at[1]) < 1.2);
        if (near) { near.str += d.qty; q.outcome = `joined ${near.name}`; }
        else if (at) {
          const u = { id: nextId(s, 'u'), owner: q.country, kind, at: at.slice(), str: d.qty, name: `New ${S.KIND_NAME[kind].toLowerCase()}${d.where ? ' (' + d.where + ')' : ''}`, note: `Raised after Crisis Update ${s.update.no}.`, shown: q.vis === 'public' ? at.slice() : null };
          s.units.push(u); q.outcome = 'built';
        }
      }
      if (q.type === 'secret' && ok) s.treasury[q.country] -= d.cost || 0;
      const building = s.features.filter((f) => f.update === s.update.no && f.ready > s.update.no && fx.some((x) => x.startsWith(f.label)));
      if (ok && building.length && !q.outcome) q.outcome = `under way, ready after Update ${building[0].ready}`;
      if (q.type === 'op' && ok) {
        s.treasury[q.country] -= d.cost || 0;
        if (d.at) {
          s.markers.push({ id: nextId(s, 'm'), at: d.at, label: d.op || 'Operation', owner: q.country, public: q.vis === 'public', update: s.update.no });
          if (/recon/i.test(d.op || '')) s.recon.push({ owner: q.country, at: d.at, r: 4, update: s.update.no });
        }
      }
      if (dec === 'ally' && q.type === 'treaty' && d.with) {
        s.alliances.push([q.country, d.with]); q.outcome = `allied with ${label(d.with)}`;
        wire(s, `ALLIANCE · ${label(q.country)} and ${label(d.with)} sign a treaty`);
      }
      // Anything approved in public reaches the room through the news wire.
      if (ok && q.vis === 'public' && !['press', 'fleet', 'spy', 'secret'].includes(q.type) && dec !== 'ally' && !clean(a.headline)) wire(s, `${label(q.country).toUpperCase()} · ${q.title}${q.text && q.type !== 'build' ? ': ' + q.text : ''}`);
      if (q.type === 'press' && ok) wire(s, `PRESS RELEASE · ${label(q.country)}: ${q.text || q.title.replace(/^Press release: /, '')}`);
      // Headline written for this decision (by the assistant or staff); otherwise public crisis notes reach the wire as they are.
      const head = clean(a.headline, 200);
      if (head) wire(s, head);
      else if (ok && q.type === 'secret' && q.vis === 'public' && !fx.length) wire(s, `${label(q.country).toUpperCase()} · ${q.text || q.title}`);
      if (a.flash?.head) s.flash = { id: nextId(s, 'f'), head: clean(a.flash.head, 140), deck: clean(a.flash.deck, 600) };
      return ok ? 'Approved' + (fx.length ? ': ' + fx.join(', ') : '') : 'Rejected' + (fx.length ? ': ' + fx.join(', ') : '');
    }
    case 'reveal': {
      const u = s.units.find((x) => x.id === a.unitId) || fail('Unit not found.');
      const hidden = s.arrows.find((x) => x.unit === u.id && !x.public);
      if (hidden) hidden.public = true; else if (u.shown && Math.hypot(u.at[0] - u.shown[0], u.at[1] - u.shown[1]) > 0.3) s.arrows.push({ id: nextId(s, 'a'), pts: arrowBetween(u.shown, u.at), owner: u.owner, unit: u.id, public: true, update: s.update.no });
      u.shown = u.at.slice(); wire(s, `REPORTS · ${label(u.owner)} ${u.name} spotted in a new position`);
      return 'Revealed on the projector';
    }
    case 'chair.floor': {
      const d = findD(s, a.id);
      s.directives.forEach((x) => { if (x.status === 'floor') x.status = 'chair'; });
      d.status = 'floor'; if (!d.no) d.no = `${s.update.no}.${++s.dirNo}`;
      return 'On the floor';
    }
    case 'chair.back': { findD(s, a.id).status = 'signing'; return 'Sent back to the sponsors'; }
    case 'chair.vote': {
      const d = findD(s, a.id); const f = Math.max(0, +a.for || 0), g = Math.max(0, +a.against || 0);
      d.status = f > g ? 'passed' : 'failed'; d.vote = `${f > g ? 'Passed' : 'Failed'} ${f} to ${g}`;
      wire(s, `COMMITTEE · Directive ${d.no} ${d.title}: ${d.vote.toLowerCase()}`);
      return d.vote;
    }
    case 'clock': {
      const c = s.clock, now = Date.now(); const g = S.gameTime(c, now);
      if (a.do === 'pause') { Object.assign(c, { game: g, at: now, running: false }); return `Clock paused at ${S.gameDateText(g)}`; }
      if (a.do === 'run') { Object.assign(c, { game: g, at: now, running: true }); return 'Clock running'; }
      if (a.do === 'set') { const t = Date.parse(String(a.date || '') + 'T' + (String(a.time || '12:00').match(/^\d{1,2}:\d{2}$/) ? a.time.padStart(5, '0') : '12:00') + ':00Z'); if (!isFinite(t) || t < Date.UTC(1930, 0, 1) || t > Date.UTC(1950, 0, 1)) fail('Pick a date between 1930 and 1950.'); Object.assign(c, { game: t, at: now }); return `Clock set to ${S.gameDateText(t)}`; }
      if (a.do === 'speed') { const k = Math.max(0.1, Math.min(10, +a.k || 1)); Object.assign(c, { game: g, at: now, rate: S.CLOCK_RATE * k }); return k === 1 ? 'Normal speed' : `Clock at ${k}x speed`; }
      fail('Unknown clock action.');
    }
    case 'publish': {
      const title = clean(a.title, 140), text = clean(a.text, 900);
      if (!title || !text) fail('Add a headline and what happened.');
      s.update = { no: s.update.no + 1, date: clean(a.date, 60) || S.gameDateText(S.gameTime(s.clock)), title, text };
      wire(s, `CRISIS UPDATE ${s.update.no} · ${title}`);
      s.arrows = s.arrows.filter((x) => x.update >= s.update.no - 1); // arrows fade one update after they appear
      s.markers = s.markers.filter((x) => x.update >= s.update.no - 1); s.recon = s.recon.filter((x) => x.update >= s.update.no - 1);
      // Scheduled effects whose time has come, and features that finish building now.
      const due = s.scheduled.filter((x) => x.due <= s.update.no); s.scheduled = s.scheduled.filter((x) => x.due > s.update.no);
      for (const x of due) applyEffects(s, x.effects, x.ctx || {});
      for (const f of s.features) if (f.ready === s.update.no && f.update < s.update.no && f.public && !f.ruined) wire(s, `${nameOf(f.owner).toUpperCase()} · ${f.label} completed${placeNear(f.at)}`);
      saveUndo(s, `Published Crisis Update ${s.update.no}`);
      if (a.reset) s.countdownEnd = Date.now() + Math.max(1, Math.min(60, +a.minutes || 15)) * 60 * 1000;
      if (a.flash) s.flash = { id: nextId(s, 'f'), head: title, deck: text };
      return 'Published to the room';
    }
    case 'flash': { s.flash = { id: nextId(s, 'f'), head: clean(a.head, 140) || s.update.title, deck: clean(a.deck, 900) || s.update.text }; return 'Flash sent to the projector'; }
    case 'region.set': {
      const ids = setControl(s, a.ids || [], a.owner);
      const back = ids.every((id) => baseOwner(REGION[id]) === a.owner);
      const text = describeRegions(ids);
      if (a.announce !== false) wire(s, back ? `FRONT · ${nameOf(a.owner)} retakes ${text}` : `FRONT · ${nameOf(a.owner)} takes ${text}`);
      return `${ids.length} region${ids.length > 1 ? 's' : ''} updated`;
    }
    case 'unit.edit': {
      const u = s.units.find((x) => x.id === a.id) || fail('Unit not found.');
      if (a.str != null) u.str = strOf(a.str);
      if (a.name) u.name = clean(a.name, 60);
      if (a.note != null) u.note = clean(a.note, 200);
      return 'Unit updated';
    }
    case 'unit.move': {
      const u = s.units.find((x) => x.id === a.id) || fail('Unit not found.');
      const to = (a.at || []).map(Number); if (to.length !== 2 || to.some((n) => !isFinite(n))) fail('Pick a spot on the map.');
      const from = u.at.slice(); u.at = [+to[0].toFixed(3), +Math.max(-80, Math.min(80, to[1])).toFixed(3)];
      if (a.public) u.shown = u.at.slice();
      if (Math.hypot(u.at[0] - from[0], u.at[1] - from[1]) > 0.3) {
        s.arrows = s.arrows.filter((x) => x.unit !== u.id || x.public !== !!a.public);
        s.arrows.push({ id: nextId(s, 'a'), pts: arrowBetween(from, u.at), owner: u.owner, unit: u.id, public: !!a.public, update: s.update.no });
      }
      return a.public ? 'Moved on the projector' : 'Moved secretly';
    }
    case 'unit.destroy': {
      const i = s.units.findIndex((x) => x.id === a.id); if (i < 0) fail('Unit not found.');
      const u = s.units[i]; s.units.splice(i, 1); s.arrows = s.arrows.filter((x) => x.unit !== u.id);
      const verb = u.kind === 'fleet' ? 'sunk' : u.kind === 'air' ? 'shot down' : 'destroyed';
      if (a.announce !== false) wire(s, `${nameOf(u.owner).toUpperCase()} · ${u.name} ${verb}`);
      return `${u.name} ${verb}`;
    }
    case 'unit.add': {
      if (!S.isOwner(a.owner)) fail('Pick a country.'); if (!S.KINDS.includes(a.kind)) fail('Pick a unit type.');
      const at = (a.at || []).map(Number); if (at.length !== 2 || at.some((n) => !isFinite(n))) fail('Pick a spot on the map.');
      const u = { id: nextId(s, 'u'), owner: a.owner, name: clean(a.name, 60) || `New ${S.KIND_NAME[a.kind]}`, kind: a.kind, at: at.map((n) => +n.toFixed(3)), str: strOf(a.str), note: clean(a.note, 200) || 'Newly raised.', shown: null };
      if (a.public) u.shown = u.at.slice();
      s.units.push(u); return a.public ? `${u.name} placed on the map` : `${u.name} placed secretly`;
    }
    case 'battle.resolve': {
      saveUndo(s, 'Battle result'); const results = a.results || []; const lines = [];
      for (const r of results) {
        const u = s.units.find((x) => x.id === r.id); if (!u) continue;
        if (r.destroy) { s.units = s.units.filter((x) => x.id !== u.id); s.arrows = s.arrows.filter((x) => x.unit !== u.id); lines.push(`${u.name} ${u.kind === 'fleet' ? 'sunk' : u.kind === 'air' ? 'shot down' : 'destroyed'}`); }
        else if (r.str != null) u.str = strOf(r.str);
      }
      for (const id of a.ruin || []) { const f = s.features.find((x) => x.id === id); if (f && !f.ruined) { f.ruined = true; lines.push(`${f.label} overrun`); } }
      let taken = '';
      if ((a.regions || []).length && a.regionOwner) taken = describeRegions(setControl(s, a.regions, a.regionOwner));
      const head = clean(a.headline, 160) || 'Battle reported';
      wire(s, `BATTLE · ${head}${taken ? ` · ${nameOf(a.regionOwner)} takes ${taken}` : ''}${lines.length ? ' · ' + lines.join(', ') : ''}`);
      return 'Battle result applied';
    }
    case 'effects.apply': {
      saveUndo(s, a.directive ? 'Carried out a directive' : 'Staff event');
      const fx = runEffects(s, a.effects, {}, a.when); if (!fx.length && !clean(a.headline) && !a.directive) fail('Add at least one complete effect.');
      if (clean(a.headline)) wire(s, a.headline); if (a.flash?.head) s.flash = { id: nextId(s, 'f'), head: clean(a.flash.head, 140), deck: clean(a.flash.deck, 600) };
      if (a.directive) { const d = s.directives.find((x) => x.id === a.directive); if (d) d.carried = (d.carried || []).concat(fx); }
      return 'Done: ' + fx.join(', ');
    }
    case 'feature.add': {
      const f = addFeature(s, { ...a, at: a.at, at2: a.at2 }); if (!f) fail('Pick a feature type and a spot on the map.');
      if (f.public && a.announce !== false) wire(s, `${nameOf(f.owner).toUpperCase()} · ${f.ready > s.update.no ? 'Work begins on ' + f.label.toLowerCase() : f.label + ' reported'}${placeNear(f.at)}`);
      return `${f.label} placed${f.public ? '' : ' secretly'}`;
    }
    case 'feature.edit': { const fx = applyEffects(s, [{ type: 'feature.edit', id: a.id, action: a.action }]); if (!fx.length) fail('Feature not found.'); return fx[0]; }
    case 'schedule.cancel': { const n = s.scheduled.length; s.scheduled = s.scheduled.filter((x) => x.id !== a.id); return n > s.scheduled.length ? 'Scheduled event cancelled' : fail('Already gone.'); }
    case 'undo': {
      if (!s.undo) fail('Nothing to undo.'); if (Date.now() - s.undo.at > 10 * 60 * 1000) fail('Too late to undo (10 minutes).');
      const snap = JSON.parse(s.undo.snap); Object.assign(s, snap); const l = s.undo.label; delete s.undo; return `Undone: ${l}`;
    }
    case 'arrows.clear': { s.arrows = []; s.markers = []; return 'All arrows and markers cleared from the map'; }
    case 'countdown': { s.countdownEnd = Date.now() + Math.max(1, Math.min(60, +a.minutes || 15)) * 60 * 1000; return 'Countdown restarted'; }
    case 'game.reset': { if (a.confirm !== 'RESET') fail('Type RESET to confirm.'); Object.assign(s, initialState(), { version: s.version }); return 'Game reset to the start'; }
    case 'game.demo': { Object.assign(s, demoState(), { version: s.version }); return 'Demo data loaded'; }
  }
  fail('Unknown action.');
}

const sameSpot = (a, b) => a && b && Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;

// What each screen is allowed to see.
export function viewFor(s, sess, as) {
  normalize(s);
  const base = { version: s.version, now: Date.now(), treasury: s.treasury, wire: s.wire, update: s.update, flash: s.flash, countdownEnd: s.countdownEnd, clock: s.clock };
  const publicDirs = s.directives.filter((d) => ['floor', 'passed', 'failed'].includes(d.status)).map(({ ai, ...d }) => d);
  if (sess.role === 'staff' && !as) return { ...base, role: 'staff', ...s, undo: s.undo ? { label: s.undo.label, at: s.undo.at } : null, messages: s.messages.slice(-200), hiddenMoves: s.units.filter((u) => !sameSpot(u.at, u.shown)).map((u) => u.id) };
  if (sess.role === 'projector' || (sess.role === 'staff' && as === '@projector')) {
    return { ...base, role: 'projector', units: s.units.filter((u) => u.shown).map(({ shown, basis, ...u }) => ({ ...u, at: shown })), control: s.control, arrows: [], markers: s.markers.filter((m) => m.public), features: s.features.filter((f) => f.public), relations: s.relations, status: s.status, directives: publicDirs, pending: s.queue.filter((q) => q.status === 'pending').length };
  }
  const name = sess.role === 'staff' ? as : sess.name; const me = S.rosterEntry(name);
  if (!me) return { ...base, role: 'none' };
  const allies = alliesIn(s, me.country); const spotted = Object.assign({}, ...allies.map((c) => s.spotted[S.spottedKeyOf(c)] || {}));
  const recon = s.recon.filter((r) => allies.includes(r.owner));
  const nearRecon = (u) => recon.some((r) => Math.hypot(r.at[0] - u.at[0], r.at[1] - u.at[1]) < r.r);
  // Spies report to their whole government: every delegate of a country sees what its agents see.
  const agents = Object.entries(s.agents).flatMap(([name, list]) => (S.rosterEntry(name)?.country === me.country ? list.map((g) => (name === me.name ? g : { ...g, owner: name })) : []));
  // An agent sees anything close by, and its target country's forces across a wide area.
  const nearAgent = (u) => agents.some((g) => g.at && Math.hypot(g.at[0] - u.at[0], g.at[1] - u.at[1]) < (g.target === u.owner ? 10 : 2.6));
  const seesSpot = (at) => s.units.some((u) => allies.includes(u.owner) && Math.hypot(u.at[0] - at[0], u.at[1] - at[1]) < (u.kind === 'air' ? 4 : 2.5)) || recon.some((r) => Math.hypot(r.at[0] - at[0], r.at[1] - at[1]) < r.r) || agents.some((g) => g.at && Math.hypot(g.at[0] - at[0], g.at[1] - at[1]) < 2.6);
  const units = s.units.flatMap(({ shown, basis, ...u }) => {
    if (allies.includes(u.owner)) return [u];
    if (spotted[u.id]) return [{ ...u, spotted: spotted[u.id] }];
    if (nearAgent(u)) return [{ ...u, spotted: `Reported by your agent in ${nameOf(agents.find((g) => g.target === u.owner)?.target || u.owner)}` }];
    if (nearRecon(u)) return [{ ...u, spotted: 'Seen by air reconnaissance' }];
    if (seesSpot(u.at)) return [{ ...u, spotted: 'In sight of your forces' }];
    return [];
  });
  // Enemy features show up once your forces, planes or agents are close enough to see them.
  // Fog of war covers everything: other sides' features show only where your forces, agents or reconnaissance can see.
  const features = s.features.filter((f) => allies.includes(f.owner) || seesSpot(f.at) || (f.to && seesSpot(f.to)));
  const directives = s.directives.filter((d) => d.status === 'drafting' ? d.authors?.includes(me.name) : d.status !== 'signing' || d.sponsors.includes(me.name) || d.signed.includes(me.name) || d.requested.includes(me.name));
  return { ...base, role: 'delegate', me, allies, control: s.control, units, arrows: [], markers: s.markers.filter((m) => allies.includes(m.owner) || seesSpot(m.at)), features, recon, agents, intel: s.intel[me.country] || [], queue: s.queue.filter((q) => q.from === me.name).map(({ ai, aiAt, ...q }) => q), directives: directives.map(({ ai, ...d }) => d), assets: s.assets[me.name] || [], relations: s.relations, status: s.status,
    blocs: s.blocs.filter((b) => b.members.includes(me.name)),
    messages: s.messages.filter((m) => m.from === me.name || (m.to || []).includes(me.name) || (m.intercepted || []).includes(me.name) || (m.bloc && s.blocs.some((b) => b.id === m.bloc && b.members.includes(me.name)))).slice(-200)
      .map(({ intercepted, ...m }) => (m.from === me.name || (m.to || []).includes(me.name) || (m.bloc && s.blocs.some((b) => b.id === m.bloc && b.members.includes(me.name))) ? m : { ...m, intercepted: true })) };
}
