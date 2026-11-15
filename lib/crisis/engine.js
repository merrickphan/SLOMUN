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
const openingArrows = () => [];
function arrowBetween(from, to) {
  const dx = to[0] - from[0], dy = to[1] - from[1];
  const ctrl = [from[0] + dx / 2 - dy * 0.15, from[1] + dy / 2 + dx * 0.15];
  return [from, ctrl, to].map((p) => p.map((n) => +n.toFixed(3)));
}
function normalize(s) { if (!Array.isArray(s.arrows)) s.arrows = openingArrows(); if (!s.control) s.control = {}; return s; }

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
  if (!S.POWERS[owner] && !REGIONS.some((r) => r.country === owner)) fail('Pick who controls it.');
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
    flash: null,
    countdownEnd: Date.now() + 15 * 60 * 1000,
    intel: clone(S.INTEL_BY),
    agents: {},
    spotted: clone(S.SPOTTED_BY),
    seq: 1,
    dirNo: 0,
    arrows: openingArrows(),
  };
}

// Example requests and directives so staff can rehearse before the conference.
export function demoState() {
  const s = initialState();
  const t = clockNow();
  s.queue = [
    { from: 'Andrew Cunningham', country: 'United Kingdom', type: 'fleet', title: 'Move Home Fleet: North Sea', vis: 'private', detail: { unit: 'home-fleet', dest: 'North Sea' } },
    { from: 'Erwin Rommel', country: 'Germany', type: 'fleet', title: 'Move Panzer Divisions: Spearhead an attack', vis: 'private', detail: { unit: 'pz', dest: 'Spearhead an attack' } },
    { from: 'Erich Raeder', country: 'Germany', type: 'fleet', title: 'Move Kriegsmarine: North Atlantic', vis: 'private', detail: { unit: 'kriegsmarine', dest: 'North Atlantic' } },
    { from: 'Hugh Dowding', country: 'United Kingdom', type: 'spy', title: 'Spy to Berlin: steal war plans', vis: 'private', detail: { target: 'Germany', mission: 'Steal war plans', cover: 'Journalist', cost: 3 } },
    { from: 'Bernard Montgomery', country: 'United Kingdom', type: 'money', title: 'Send $15M to Poland', vis: 'public', detail: { to: 'Poland', amount: 15 } },
    { from: 'Isoroku Yamamoto', country: 'Japan', type: 'press', title: 'Press release: Japan has no interest in the war in Europe', vis: 'public', detail: {} },
  ].map((q, i) => ({ id: 'q' + (i + 1), status: 'pending', time: t, ...q }));
  s.agents = { 'Hugh Dowding': [{ target: 'Germany', mission: 'Steal war plans' }] };
  s.directives = [
    { id: 'd1', no: '1.1', title: 'Emergency Aid to Poland', sponsors: ['Edward Rydz-Śmigły'], signed: ['Edward Rydz-Śmigły', 'Bernard Montgomery', 'Charles de Gaulle', 'Andrew Cunningham'], requested: [], status: 'chair', clauses: ['Britain and France send $40M for weapons to Poland.', 'French forces begin a limited attack into the Saar within one week.'] },
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
  const me = sess.role === 'delegate' ? S.rosterEntry(sess.name) : null;
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
        if (list.length < 8) list.push({ target: detail.target, mission: detail.mission });
      }
      if (type === 'money') Object.assign(detail, { to: clean(d.to, 40), amount: Math.max(1, Math.min(9999, Math.round(+d.amount || 0))) });
      if (type === 'build') { if (!S.BUILD[d.btype]) fail('Pick what to build.'); Object.assign(detail, { btype: d.btype, qty: Math.max(1, Math.min(10, Math.round(+d.qty || 1))) }); }
      if (type === 'op') Object.assign(detail, { op: clean(d.op, 60), cost: Math.max(0, Math.min(9999, +d.cost || 0)) });
      const title = clean(a.title, 140); if (!title) fail('Write your request before sending it.');
      const vis = type === 'spy' ? 'private' : type === 'press' ? 'public' : a.vis === 'public' ? 'public' : 'private';
      const mine = s.queue.filter((q) => q.from === me.name && q.status === 'pending').length;
      if (mine >= 15) fail('You have 15 requests waiting. Wait for crisis staff to answer some first.');
      s.queue.unshift({ id: nextId(s, 'q'), from: me.name, country: me.country, type, title, vis, status: 'pending', time: clockNow(), detail, text: cleanBlock(a.text) });
      s.queue = s.queue.slice(0, 400);
      return 'Sent to crisis staff';
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
      const d = q.detail || {}; const def = S.DEFAULT_REPLY[q.type] || S.DEFAULT_REPLY.secret;
      const dec = a.dec; const ok = !['reject', 'spy-fail', 'spy-caught'].includes(dec);
      q.status = ok ? 'approved' : 'rejected';
      q.reply = clean(a.reply, 500) || (dec === 'spy-fail' ? def[1] : dec === 'spy-caught' ? def[2] : ok ? def[0] : def[1]);
      q.decidedAt = clockNow();
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
        const list = s.agents[q.from]; if (list && dec !== 'spy-ok') { const i = list.findIndex((x) => x.target === d.target); if (i >= 0) list.splice(i, 1); }
      }
      if (q.type === 'money' && ok) { s.treasury[q.country] -= d.amount; const to = LABEL_TO_KEY[d.to] || (S.POWERS[d.to] ? d.to : null); if (to) s.treasury[to] += d.amount; }
      if (q.type === 'build' && ok) {
        s.treasury[q.country] -= (S.BUILD[d.btype] || 0) * d.qty;
        const u = s.units.find((x) => x.owner === q.country && x.kind === S.BUILD_KIND[d.btype]); if (u) u.str += d.qty;
      }
      if (q.type === 'op' && ok) s.treasury[q.country] -= d.cost || 0;
      if (q.type === 'press' && ok) wire(s, `PRESS RELEASE · ${label(q.country)}: ${q.text || q.title.replace(/^Press release: /, '')}`);
      return 'Saved';
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
    case 'publish': {
      const title = clean(a.title, 140), text = clean(a.text, 900);
      if (!title || !text) fail('Add a headline and what happened.');
      s.update = { no: s.update.no + 1, date: clean(a.date, 60) || s.update.date, title, text };
      wire(s, `CRISIS UPDATE ${s.update.no} · ${title}`);
      s.arrows = s.arrows.filter((x) => x.update >= s.update.no - 1); // arrows fade one update after they appear
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
      if (a.str != null) u.str = Math.max(1, Math.min(99, Math.round(+a.str) || 1));
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
      if (!S.POWERS[a.owner]) fail('Pick a country.'); if (!S.KINDS.includes(a.kind)) fail('Pick a unit type.');
      const at = (a.at || []).map(Number); if (at.length !== 2 || at.some((n) => !isFinite(n))) fail('Pick a spot on the map.');
      const u = { id: nextId(s, 'u'), owner: a.owner, name: clean(a.name, 60) || `New ${S.KIND_NAME[a.kind]}`, kind: a.kind, at: at.map((n) => +n.toFixed(3)), str: Math.max(1, Math.min(99, Math.round(+a.str) || 1)), note: clean(a.note, 200) || 'Newly raised.', shown: null };
      if (a.public) u.shown = u.at.slice();
      s.units.push(u); return a.public ? `${u.name} placed on the map` : `${u.name} placed secretly`;
    }
    case 'battle.resolve': {
      const results = a.results || []; const lines = [];
      for (const r of results) {
        const u = s.units.find((x) => x.id === r.id); if (!u) continue;
        if (r.destroy) { s.units = s.units.filter((x) => x.id !== u.id); s.arrows = s.arrows.filter((x) => x.unit !== u.id); lines.push(`${u.name} ${u.kind === 'fleet' ? 'sunk' : u.kind === 'air' ? 'shot down' : 'destroyed'}`); }
        else if (r.str != null) u.str = Math.max(1, Math.min(99, Math.round(+r.str) || 1));
      }
      let taken = '';
      if ((a.regions || []).length && a.regionOwner) taken = describeRegions(setControl(s, a.regions, a.regionOwner));
      const head = clean(a.headline, 160) || 'Battle reported';
      wire(s, `BATTLE · ${head}${taken ? ` · ${nameOf(a.regionOwner)} takes ${taken}` : ''}${lines.length ? ' · ' + lines.join(', ') : ''}`);
      return 'Battle result applied';
    }
    case 'arrows.clear': { s.arrows = []; return 'All arrows cleared from the map'; }
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
  const base = { version: s.version, now: Date.now(), treasury: s.treasury, wire: s.wire, update: s.update, flash: s.flash, countdownEnd: s.countdownEnd };
  const publicDirs = s.directives.filter((d) => ['floor', 'passed', 'failed'].includes(d.status));
  if (sess.role === 'staff' && !as) return { ...base, role: 'staff', ...s, hiddenMoves: s.units.filter((u) => !sameSpot(u.at, u.shown)).map((u) => u.id) };
  if (sess.role === 'projector' || (sess.role === 'staff' && as === '@projector')) {
    return { ...base, role: 'projector', units: s.units.filter((u) => u.shown).map(({ shown, basis, ...u }) => ({ ...u, at: shown })), control: s.control, arrows: s.arrows.filter((a) => a.public), directives: publicDirs, pending: s.queue.filter((q) => q.status === 'pending').length };
  }
  const name = sess.role === 'staff' ? as : sess.name; const me = S.rosterEntry(name);
  if (!me) return { ...base, role: 'none' };
  const allies = S.alliesOf(me.country); const spotted = s.spotted[S.spottedKeyOf(me.country)] || {};
  const agents = s.agents[me.name] || [];
  const nearAgent = (u) => agents.some((g) => { const c = S.CAPITAL[g.target]; return c && Math.hypot(c[0] - u.at[0], c[1] - u.at[1]) < 2.6; });
  const units = s.units.flatMap(({ shown, basis, ...u }) => {
    if (allies.includes(u.owner)) return [u];
    if (spotted[u.id]) return [{ ...u, spotted: spotted[u.id] }];
    if (nearAgent(u)) return [{ ...u, spotted: 'Reported by your agent' }];
    return [];
  });
  const directives = s.directives.filter((d) => d.status !== 'signing' || d.sponsors.includes(me.name) || d.signed.includes(me.name) || d.requested.includes(me.name));
  return { ...base, role: 'delegate', me, allies, control: s.control, units, arrows: s.arrows.filter((a) => a.public || allies.includes(a.owner)), agents, intel: s.intel[me.country] || [], queue: s.queue.filter((q) => q.from === me.name), directives };
}
