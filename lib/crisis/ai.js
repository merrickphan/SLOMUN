// Crisis assistant: turns a crisis note, a staff reply, a passed directive or a staff description
// into game effects, a reply, a headline and (for big moments) a breaking news flash.
// Uses Claude when ANTHROPIC_API_KEY is set; otherwise a simple keyword fallback.
// Staff always see what will happen and can remove effects or undo.
import Anthropic from '@anthropic-ai/sdk';
import * as S from './scenario';
import { REGIONS } from './regions';

const MODEL = 'claude-opus-5-5';
const MOCK = process.env.CRISIS_AI_MOCK === '1' && process.env.NODE_ENV !== 'production'; // local tests only
export const aiMode = () => (process.env.ANTHROPIC_API_KEY || MOCK ? 'claude' : 'rules');

/* ---------- Output schema ---------- */
const N = (t) => ({ anyOf: [{ type: t }, { type: 'null' }] });
const NA = { anyOf: [{ type: 'array', items: { type: 'string' } }, { type: 'null' }] };
const EFFECT_TYPES = ['money', 'strength', 'destroy', 'move', 'unit', 'region', 'intel', 'wire', 'marker', 'asset', 'message', 'feature', 'feature.edit', 'trait', 'relation', 'status', 'battle', 'agent', 'reveal'];
const EFFECT = {
  type: 'object', additionalProperties: false,
  properties: {
    type: { type: 'string', enum: EFFECT_TYPES },
    country: N('string'), other: N('string'), unit: N('string'), name: N('string'),
    attackers: NA, defenders: NA, ids: NA, to_delegates: NA,
    amount: N('number'), defense: N('number'), mod: N('integer'), turns: N('integer'),
    to: N('string'), to2: N('string'), label: N('string'), text: N('string'), from: N('string'),
    kind: N('string'), status: N('string'), tone: N('string'), action: N('string'), public: N('boolean'),
  },
};
EFFECT.required = Object.keys(EFFECT.properties);
const BRANCH = {
  type: 'object', additionalProperties: false,
  properties: {
    reply: { type: 'string' }, headline: N('string'), flash_head: N('string'), flash_deck: N('string'),
    effects: { type: 'array', items: EFFECT }, staff_note: { type: 'string' },
  },
  required: ['reply', 'headline', 'flash_head', 'flash_deck', 'effects', 'staff_note'],
};
const BOTH = { type: 'object', additionalProperties: false, properties: { approve: BRANCH, reject: BRANCH }, required: ['approve', 'reject'] };

/* ---------- Prompts ---------- */
// Everything here is fixed for the whole conference, so it is cached.
const SYSTEM = `You are the backroom assistant for a Model UN crisis committee: "Early WWII", starting 3 September 1939. Delegates play real generals and ministers. They send crisis notes (free-form plans), move or build forces, and pass directives. Human crisis staff decide what is approved; your job is to turn their decision into concrete game effects so staff do not have to click through forms.

How to judge outcomes:
- Staff decisions and staff replies are final. If a staff reply describes an outcome, your effects must match it exactly, even if it is partial or surprising.
- Approved plans achieve what is realistic for that character in 1939, scaled to their budget, forces and powers. Big ambitions get partial results; small, well-specified plans can fully succeed.
- Rejected plans usually have no effects. Add consequences only when the reply or the plan makes them obvious (for example an agent caught).
- Fighting between units uses a "battle" effect: the game rolls the result with the same table staff use. Do not decide battle outcomes yourself unless the staff reply states the outcome.
- The note's own budget is charged automatically on approval. Do not add a money effect for it.
- Only use unit ids, region ids, delegate names and feature ids that appear in the lists you are given. If a plan names something that does not exist, do what fits and say so in staff_note.
- Prefer a few meaningful effects (usually 1 to 4, never more than 8).
- Secret plans stay secret: public=false on their effects and no headline, unless the outcome is something the world would notice (an explosion, a battle, a declaration).
- Declaring war, making peace, alliances and pacts: use a "relation" effect, a headline and a breaking flash.
- Lasting national conditions (rationing, mobilization, blockade, strikes, unrest, morale): use a "status" effect.
- Make the effects deliver what the plan is for. If a delegate asks to see or learn something (enemy troops, fleet positions, war plans), the approved effects must actually show it to them: a "reveal" effect for forces, and an "intel" report that states concrete facts from the game state (unit names, strengths, places).
- Sharing: when a delegate shares, passes or leaks information to another delegate or country, deliver it. Send an "intel" report to the receiving country with the concrete facts (from the game state), a "reveal" effect so the receiver sees the forces in question on their map, and a "message" from the sender if a personal note fits. Within one country, spies already report to every delegate of that country, but still send the intel report.
- Anything else: delegates will try things no rule covers. Find the nearest combination of effects that makes the approved outcome real and visible to the people it affects (a message, an intel report, a status, an asset, a feature, a reveal). Never approve something with no effects unless it truly changes nothing.
- Spies and agents: when an approved plan sends spies, agents, informants or saboteurs somewhere, add an "agent" effect so the sender sees their agent on the map. An active agent reveals forces near it and can intercept private notes sent to or from delegates of that country. Agents that are caught or recalled are removed with action "remove", and a capture is usually public news. Also give the sender an "intel" report with what the agent learns, when the plan is about gathering information.
- Trenches, bunkers, factories, sabotage of oil fields and similar: use "feature" and "feature.edit" effects so they appear on the map. Building something large takes 1 to 3 crisis updates (turns).

Writing:
- reply: one or two sentences to the delegate, in the voice of the crisis backroom, consistent with the decision. Never reveal what the delegate could not know.
- headline: for the public news wire, in the form "COUNTRY · What happened", under 120 characters, plain and factual. Null when nothing public happened.
- flash_head and flash_deck: only for major moments (war declared, peace, alliance, a capital falls, a leader killed). Otherwise null.
- staff_note: one short line telling staff what the effects do and any assumption you made.
Never use em dashes.

Effect fields (fill the ones each type uses; set the rest to null):
- money: country, amount (+ or - $ millions)
- strength: unit, amount (+ or - strength)
- destroy: unit, public
- move: unit, to, public
- unit (new unit): country, kind (army, armor, fleet or air), amount (strength), name, to, public
- region (change who holds regions): ids (region ids), country (new holder), public
- intel (secret report to a country): country, from, text, status (High, Medium or Low reliability)
- wire (an extra headline): text
- marker (a labelled pin): label, country, to, public
- asset (a new lasting power for one delegate): name (delegate's full name), text
- message (letter from a character such as Hitler or Stalin): from, to_delegates, text
- feature (built or placed on the map): kind (${Object.keys(S.FEATURES).join(', ')}), label, country, to, to2 (line end for trenches, bunkers or wire, else null), mod (defense bonus, null for the default), turns (0 to 3 updates to finish), public
- feature.edit: name (feature id), action (ruin, repair, finish or remove), public
- trait (a unit's lasting condition): unit, label, mod (battle bonus, each point is 25%), action (add or clear)
- relation: country, other, status (war, peace, alliance, pact, trade or tension)
- status (a country's lasting condition): country, label (2 to 4 words), tone (good, bad or info), action (add or clear)
- agent: name (delegate who owns the agent, usually the sender), country (target country), to (where the agent operates, "@here" for the marked spot, or null for the capital), text (mission in a few words), action (add or remove)
- reveal (let a side see forces on its map): country (who gets to see), other (whose forces), ids (specific unit ids, or null for all of that country's forces), text (how they learned it, e.g. "Reported by agents in London")
- battle: attackers (unit ids), defenders (unit ids), ids (regions the attacker takes if it wins), amount (attacker bonus as a fraction, e.g. 0.25 for surprise), defense (defender bonus as a fraction), label (short name of the attack)
"to" is a region id, a sea name, or "@here" for the spot the delegate marked on the map.

Countries (use these keys): ${S.ORDER.map((k) => `${k} (${S.POWERS[k].label})`).join(', ')}.
Seas: ${Object.keys(S.SEAS).join(', ')}.

Delegates (name | country | commands):
${S.ROSTER.map((r) => `${r.name} | ${r.country} | ${r.commands.join(', ') || 'no forces'}`).join('\n')}

Regions (id | name | country | zone):
${REGIONS.map((r) => `${r.id} | ${r.name} | ${r.country} | ${r.zone}`).join('\n')}`;

const near = (at) => { let best = null, d = 1e9; for (const r of REGIONS) { const k = Math.hypot(r.c[0] - at[0], r.c[1] - at[1]); if (k < d) { d = k; best = r; } } return best ? best.id : ''; };
function stateText(s) {
  const L = [];
  L.push(`Now: Crisis Update ${s.update.no}, ${s.update.date}. Latest update: ${s.update.title}.`);
  L.push('Treasuries ($M): ' + S.ORDER.map((k) => `${k} ${s.treasury[k]}`).join(', '));
  L.push('Relations: ' + (s.relations || []).map((r) => `${r.a}-${r.b} ${r.status}`).join('; '));
  const st = Object.entries(s.status || {}).filter(([, v]) => v.length); if (st.length) L.push('Country conditions: ' + st.map(([k, v]) => `${k}: ${v.map((x) => x.label).join(', ')}`).join('; '));
  const ctl = Object.entries(s.control || {}); if (ctl.length) L.push('Occupied regions (region: holder): ' + ctl.map(([k, v]) => `${k}: ${v}`).join(', '));
  L.push('Units (id | owner | kind | name | strength | near region | traits):');
  for (const u of s.units) L.push(`${u.id} | ${u.owner} | ${u.kind} | ${u.name} | ${u.str} | ${near(u.at)}${u.traits?.length ? ' | ' + u.traits.map((t) => `${t.label} ${t.mod}`).join(', ') : ''}`);
  if (s.features?.length) { L.push('Map features (id | owner | kind | label | near region | state):'); for (const f of s.features) L.push(`${f.id} | ${f.owner} | ${f.kind} | ${f.label} | ${near(f.at)} | ${f.ruined ? 'destroyed' : f.ready > s.update.no ? 'building' : 'ready'}`); }
  L.push('Recent news wire: ' + s.wire.slice(0, 8).join(' / '));
  return L.join('\n');
}
function requestText(s, q) {
  const r = S.rosterEntry(q.from); const d = q.detail || {}; const chain = [];
  let p = d.parent && s.queue.find((x) => x.id === d.parent);
  while (p && chain.length < 4) { chain.unshift(`Earlier note: "${p.text || p.title}" -> staff ${p.status}: "${p.reply || ''}"`); p = p.detail?.parent && s.queue.find((x) => x.id === p.detail.parent); }
  return [
    `From: ${q.from}, ${r?.role || ''} of ${q.country} (commands: ${r?.commands.join(', ') || 'none'}).`,
    `Type: ${q.type === 'secret' ? 'crisis note' : q.type}. Visibility: ${q.vis}.`, `Title: ${q.title}`, q.text ? `Text: ${q.text}` : '',
    d.cost ? `Budget: $${d.cost}M` : '', d.where ? `Marked on the map: ${d.where} (${near(d.at)}), use "@here" to place things there.` : '',
    ...chain,
    { fleet: 'On approval the game moves this force to the named destination by itself. Add only extra effects.', build: 'On approval the game builds these forces and charges the cost by itself. Add only extra effects.', money: 'On approval the game transfers the money by itself. Add only extra effects.' }[q.type] || '',
  ].filter(Boolean).join('\n');
}

/* ---------- Calling Claude ---------- */
let client = null;
// Canned answer shaped like Claude's, for local tests without an API key.
function mockAnswer(task, schema) {
  const blank = Object.fromEntries(EFFECT.required.map((k) => [k, null]));
  const branch = (ok) => ({ reply: ok ? 'Your orders are carried out.' : 'Not possible right now.', headline: ok ? 'GERMANY · German forces attack along the Saar' : null, flash_head: null, flash_deck: null, staff_note: 'Mock answer for testing.',
    effects: ok ? [{ ...blank, type: 'battle', attackers: ['westwall'], defenders: ['fr-ne'], ids: ['france-lorraine'], amount: 0.25, label: 'Saar offensive' }, { ...blank, type: 'status', country: 'France', label: 'Mobilizing', tone: 'info', action: 'add' }, { ...blank, type: 'unit', unit: 'nope' }] : [] });
  return schema === BOTH ? { approve: branch(true), reject: branch(false) } : branch(!/REJECTED/.test(task));
}
async function ask(task, schema) {
  if (MOCK && !process.env.ANTHROPIC_API_KEY) { await new Promise((r) => setTimeout(r, 800)); return mockAnswer(task, schema); }
  client = client || new Anthropic();
  const params = {
    model: MODEL, max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema } },
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral', ttl: '1h' } }],
    messages: [{ role: 'user', content: task }],
  };
  let res;
  try { res = await client.beta.messages.create(params); }
  catch (e) {
    // If the schema itself is refused, ask for plain JSON instead.
    if (e instanceof Anthropic.BadRequestError && /schema|format/i.test(e.message)) {
      delete params.output_config.format; params.messages[0].content += '\n\nAnswer with only the JSON object, no other text.';
      res = await client.beta.messages.create(params);
    } else throw e;
  }
  if (res.stop_reason === 'refusal') throw new Error('The assistant declined this one. Add effects by hand.');
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const m = text.match(/\{[\s\S]*\}/); if (!m) throw new Error('The assistant gave no answer. Add effects by hand.');
  return JSON.parse(m[0]);
}

/* ---------- Keyword fallback (no API key) ---------- */
// Whole words only, so "uk" inside "Dunkirk" or "usa" inside "usage" never count.
const COUNTRY_WORDS = [
  ...S.ORDER.flatMap((k) => [[k, k], [S.POWERS[k].label, k], [S.POWERS[k].short, k]]),
  ['britain', 'United Kingdom'], ['british', 'United Kingdom'], ['england', 'United Kingdom'], ['english', 'United Kingdom'], ['mi6', 'United Kingdom'],
  ['germany', 'Germany'], ['german', 'Germany'], ['germans', 'Germany'], ['reich', 'Germany'], ['berlin', 'Germany'],
  ['french', 'France'], ['paris', 'France'], ['polish', 'Poland'], ['warsaw', 'Poland'], ['italian', 'Italy'], ['rome', 'Italy'],
  ['soviet', 'USSR'], ['soviets', 'USSR'], ['russia', 'USSR'], ['russian', 'USSR'], ['moscow', 'USSR'], ['finnish', 'Finland'],
  ['japanese', 'Japan'], ['tokyo', 'Japan'], ['america', 'United States'], ['american', 'United States'], ['usa', 'United States'],
].map(([w, k]) => [new RegExp(`\\b${w.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'), k]);
// Countries named in a text, in the order they first appear.
const findCountries = (t) => COUNTRY_WORDS.map(([re, k]) => [(String(t || '').match(re) || { index: -1 }).index, k]).filter(([i]) => i >= 0).sort((a, b) => a[0] - b[0]).map(([, k]) => k).filter((k, i, a) => a.indexOf(k) === i);
const findCountry = (t) => findCountries(t)[0] || null;
// Sharing information: "give the Soviet troop info to Dowding", "share our intel with France".
const isShare = (t) => /\b(share|sharing|give|giving|pass|passing|send|sending|leak|leaking|tell|forward|hand)\b/i.test(t) && /\b(info|information|intel|intelligence|report|reports|findings|plans|secrets?|what (i|we) (found|know|learned))\b/i.test(t);
function shareRule(s, q, out) {
  const t = `${q.title} ${q.text}`;
  if (!isShare(t)) return;
  const people = S.ROSTER.filter((r) => r.name !== q.from && (t.includes(r.name) || t.toLowerCase().includes(r.name.split(' ').slice(-1)[0].toLowerCase())));
  const countries = people.length ? [...new Set(people.map((r) => r.country))] : findCountries(t).filter((c) => c !== q.country).slice(0, 1);
  if (!countries.length) return;
  // What the sender's side can see that the receivers cannot: enemy forces near the sender's spies, or of countries the note names.
  const sender = S.rosterEntry(q.from); const myAgents = Object.entries(s.agents || {}).flatMap(([n, l]) => (S.rosterEntry(n)?.country === sender?.country ? l : []));
  const named = findCountries(t).filter((c) => c !== q.country && !countries.includes(c));
  const seen = s.units.filter((u) => u.owner !== q.country && (named.includes(u.owner) || myAgents.some((g) => g.at && Math.hypot(g.at[0] - u.at[0], g.at[1] - u.at[1]) < (g.target === u.owner ? 10 : 2.6))));
  const facts = seen.slice(0, 8).map((u) => `${u.name} (${S.POWERS[u.owner]?.label || u.owner}, strength about ${u.str})`).join('; ');
  for (const c of countries) {
    if (seen.length) out.effects.push({ type: 'reveal', country: c, other: null, ids: seen.map((u) => u.id), text: `Shared by ${q.from}` });
    out.effects.push({ type: 'intel', country: c, from: `${q.from}`, text: facts ? `Shared intelligence: ${facts}.` : (q.text || q.title).slice(0, 500), status: 'Medium' });
  }
  if (people.length) out.effects.push({ type: 'message', from: q.from, to_delegates: people.map((r) => r.name), text: (q.text || q.title).slice(0, 600) });
  out.staff_note = `Detected: sharing information with ${people.length ? people.map((r) => r.name).join(', ') : countries.map((c) => S.POWERS[c].label).join(', ')}${seen.length ? ` (${seen.length} forces revealed)` : ''}.`;
}
function rules(country, text, ok) {
  const t = (text || '').toLowerCase(); const out = { reply: '', headline: null, flash_head: null, flash_deck: null, effects: [], staff_note: 'Keyword match only. Add any other effects by hand.' };
  if (!ok) return out;
  const rel = [[/declar\w* war|go(es)? to war/, 'war', 'declares war on'], [/\b(peace|armistice|ceasefire|cease-fire)\b/, 'peace', 'makes peace with'], [/alliance|\bally\b|allied/, 'alliance', 'forms an alliance with'], [/non-aggression|pact/, 'pact', 'signs a pact with'], [/trade (deal|agreement)/, 'trade', 'signs a trade deal with']];
  if (SPY_RE.test(t) && !isShare(t)) {
    const other = findCountries(text).find((c) => c !== country);
    if (other) { out.effects.push({ type: 'agent', name: null, country: other, to: null, text: text.slice(0, 80), action: 'add' }); out.staff_note = `Detected: agent sent to ${S.POWERS[other].label}. Add an intel report by hand if they learn something.`; }
  }
  for (const [re, status, verb] of rel) {
    if (!re.test(t)) continue; const after = t.split(re)[1] || t; const other = findCountries(after).find((c) => c !== country);
    if (!other || other === country) continue;
    out.effects.push({ type: 'relation', country, other, status });
    out.headline = `${S.POWERS[country].label.toUpperCase()} · ${S.POWERS[country].label} ${verb} ${S.POWERS[other].label}`;
    if (status !== 'trade') { out.flash_head = `${S.POWERS[country].label} ${verb} ${S.POWERS[other].label}`; out.flash_deck = text.slice(0, 300); }
    out.staff_note = `Detected: ${status} with ${S.POWERS[other].label}.`; break;
  }
  return out;
}

/* ---------- Clean up what comes back ---------- */
const REGION_IDS = new Set(REGIONS.map((r) => r.id));
function toEngine(e, s) {
  const x = Object.fromEntries(Object.entries(e || {}).filter(([, v]) => v !== null && v !== undefined));
  const unitOk = (id) => s.units.some((u) => u.id === id);
  switch (x.type) {
    case 'strength': return unitOk(x.unit) && { type: 'strength', unit: x.unit, delta: x.amount };
    case 'destroy': return unitOk(x.unit) && { type: 'destroy', unit: x.unit, public: x.public !== false };
    case 'move': return unitOk(x.unit) && { type: 'move', unit: x.unit, to: x.to, public: !!x.public };
    case 'unit': return { type: 'unit', owner: x.country, kind: x.kind, str: x.amount || 1, name: x.name, to: x.to, public: !!x.public };
    case 'region': return { type: 'region', ids: (x.ids || []).filter((id) => REGION_IDS.has(id)), owner: x.country, public: x.public !== false };
    case 'intel': return { type: 'intel', country: x.country, from: x.from, text: x.text, rel: x.status };
    case 'marker': return { type: 'marker', label: x.label, owner: x.country, to: x.to, public: !!x.public };
    case 'message': return { type: 'message', from: x.from, to: x.to_delegates || [], text: x.text };
    case 'feature': return { type: 'feature', kind: x.kind, label: x.label, owner: x.country, to: x.to, to2: x.to2, mod: x.mod ?? '', turns: x.turns || 0, public: !!x.public };
    case 'feature.edit': return { type: 'feature.edit', id: x.name, action: x.action, public: x.public };
    case 'trait': return unitOk(x.unit) && { type: 'trait', unit: x.unit, label: x.label, mod: x.mod ?? 0, action: x.action || 'add' };
    case 'reveal': return { type: 'reveal', country: x.country, other: x.other, ids: (x.ids || []).filter(unitOk), text: x.text };
    case 'agent': return { type: 'agent', name: x.name, target: S.CAPITAL[x.country] || S.POWERS[x.country] ? x.country : findCountry(x.country) || x.country, to: x.to, mission: x.text, action: x.action || 'add' };
    case 'battle': return { type: 'battle', attackers: (x.attackers || []).filter(unitOk), defenders: (x.defenders || []).filter(unitOk), ids: x.ids || [], amount: x.amount || 0, mod: x.defense || 0, label: x.label };
    case 'money': case 'wire': case 'asset': case 'relation': case 'status': return x;
  }
  return null;
}
// Drop effects that are missing what they need, so staff never see one that would do nothing.
const P = (c) => !!S.POWERS[c];
const PLACE = (t) => t === '@here' || REGION_IDS.has(t) || !!S.SEAS[t];
function valid(e) {
  if (!e) return false;
  switch (e.type) {
    case 'money': return P(e.country) && isFinite(+e.amount) && +e.amount !== 0;
    case 'strength': return isFinite(+e.delta) && +e.delta !== 0;
    case 'move': return PLACE(e.to);
    case 'unit': return P(e.owner) && S.KINDS.includes(e.kind) && PLACE(e.to);
    case 'region': return e.ids.length > 0 && (P(e.owner) || REGIONS.some((r) => r.country === e.owner));
    case 'intel': return P(e.country) && !!e.text;
    case 'wire': return !!e.text;
    case 'marker': return !!e.label && PLACE(e.to);
    case 'asset': return !!S.rosterEntry(e.name) && !!e.text;
    case 'message': return !!e.text && e.to.some((n) => S.rosterEntry(n));
    case 'feature': return !!S.FEATURES[e.kind] && PLACE(e.to);
    case 'feature.edit': return !!e.id && ['ruin', 'repair', 'finish', 'remove'].includes(e.action);
    case 'trait': return e.action === 'clear' || !!e.label;
    case 'relation': return P(e.country) && P(e.other) && e.country !== e.other && !!e.status;
    case 'status': return P(e.country) && !!e.label;
    case 'battle': return e.attackers.length > 0 && e.defenders.length > 0;
    case 'reveal': return P(e.country) && (e.ids.length > 0 || P(e.other));
    case 'agent': return e.action === 'remove' ? !!e.target : (!!S.CAPITAL[e.target] || P(e.target) || PLACE(e.to));
  }
  return true;
}
function tidy(b, s) {
  if (!b) return null;
  const strip = (t) => (t == null ? null : String(t).replace(/\s*—\s*/g, ', ').trim() || null);
  return {
    reply: strip(b.reply) || '', headline: strip(b.headline), staff_note: strip(b.staff_note) || '',
    flash: b.flash_head ? { head: strip(b.flash_head), deck: strip(b.flash_deck) || '' } : null,
    effects: (b.effects || []).slice(0, 8).map((e) => toEngine(e, s)).filter(valid),
  };
}

const shortMission = (t) => { const first = String(t).replace(/^Crisis note:\s*/, '').split(/(?<=[.!?])\s/)[0]; return first.length <= 80 ? first : first.slice(0, 80).replace(/\s+\S*$/, '') + '…'; };
// Approved spy plans always place an agent, even if the model forgot to.
// Only plans that send someone count: "I found it with my spies" is not a new spy.
const SPY_RE = /\b(send|sent|sending|deploy\w*|plant\w*|insert\w*|recruit\w*|dispatch\w*|place|placing|put|smuggl\w*|infiltrat\w*)\b[^.]{0,60}\b(spy|spies|agents?|informants?|saboteurs?|operatives?)\b|\bspy(ing)? on\b|\bespionage\b|\binfiltrat\w*/i;
function ensureAgent(branch, q, s) {
  if (!branch || !SPY_RE.test(`${q.title} ${q.text}`) || isShare(`${q.title} ${q.text}`) || branch.effects.some((e) => e.type === 'agent')) return branch;
  let target = findCountries(`${q.title} ${q.text}`).find((c) => c !== q.country);
  // If the note does not name the target clearly, use the country the assistant's own intel report is about.
  if (!target) target = findCountries([...branch.effects.filter((e) => e.type === 'intel' || e.type === 'reveal').map((e) => `${e.from || ''} ${e.text || ''} ${e.other || ''}`), branch.headline || '', branch.reply || ''].join(' ')).find((c) => c !== q.country);
  if (target) branch.effects.push({ type: 'agent', name: q.from, target, to: q.detail?.at ? '@here' : null, mission: shortMission(q.text || q.title), action: 'add' });
  return branch;
}
export const AI_VERSION = S.AI_VERSION;

/* ---------- Public entry points ---------- */
// Both outcomes for a pending request, so staff see what each button will do.
export async function suggestRequest(s, q) {
  if (aiMode() === 'rules') { const a = rules(q.country, q.text || q.title.replace(/^Crisis note: /, ''), true); shareRule(s, q, a); return { by: 'rules', v: AI_VERSION, approve: tidy(a, s), reject: tidy(rules(q.country, '', false), s) }; }
  const out = await ask(`${stateText(s)}\n\nREQUEST\n${requestText(s, q)}\n\nStaff have not decided yet. Give the effects for both outcomes: "approve" and "reject".`, BOTH);
  return { by: 'claude', v: AI_VERSION, approve: ensureAgent(tidy(out.approve, s), q, s), reject: tidy(out.reject, s) };
}
// One outcome, after staff wrote a reply that may change what happens.
export async function decideRequest(s, q, ok, reply) {
  if (aiMode() === 'rules') { const r = rules(q.country, `${q.title} ${q.text} ${reply}`, ok); if (ok) shareRule(s, q, r); return { by: 'rules', ...tidy(r, s) }; }
  const out = await ask(`${stateText(s)}\n\nREQUEST\n${requestText(s, q)}\n\nSTAFF DECISION: ${ok ? 'APPROVED' : 'REJECTED'}\nSTAFF REPLY (authoritative, effects must match it): ${reply}\n\nGive the effects for this decision. Use the staff reply as the reply text unless it is empty.`, BRANCH);
  const b = tidy(out, s); return { by: 'claude', ...(ok ? ensureAgent(b, q, s) : b) };
}
export async function carryDirective(s, d) {
  if (aiMode() === 'rules') return { by: 'rules', ...tidy(rules(null, '', false), s), headline: null };
  const out = await ask(`${stateText(s)}\n\nPASSED DIRECTIVE ${d.no}: ${d.title}\nSponsors: ${d.sponsors.join(', ')}. Signed by: ${d.signed.join(', ')}.\nClauses:\n${d.clauses.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\nThe committee passed this directive. Carry out every clause that is realistic. reply is a one-line summary for the sponsors.`, BRANCH);
  return { by: 'claude', ...tidy(out, s) };
}
export async function describeEvent(s, text) {
  if (aiMode() === 'rules') { const c = findCountry(text) || 'Germany'; return { by: 'rules', ...tidy(rules(c, text, true), s) }; }
  const out = await ask(`${stateText(s)}\n\nSTAFF EVENT (nobody requested this; staff want it to happen exactly as described):\n${text}\n\nGive the effects. reply is unused, set it to an empty string.`, BRANCH);
  return { by: 'claude', ...tidy(out, s) };
}
