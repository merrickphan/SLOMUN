// Browser side of the crisis app: the 3D globe, figurines and all three screens.
// Loaded only in the browser by components/crisis/CrisisClient.js.
import * as THREE from 'three';
import { mergeBufferGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as S from '@/lib/crisis/scenario';
import { REGIONS } from '@/lib/crisis/regions';

const { LON0, LON1, LAT0, LAT1, OWNER, NEUTRALS, LABELS, SKIP_WORLD, LABEL_TEXT, CITIES, CAPITAL, CITY_OF, BUILD, BUILD_KIND,
  KIND_NAME, DEST_BY_KIND, ROSTER, POWER_TEXT, ALWAYS, LIMITS_ALWAYS, SECRET, SPECIAL, SIGS_NEEDED, DSTATUS, ORDER, KINDS } = S;
const POWERS = JSON.parse(JSON.stringify(S.POWERS));
Object.values(POWERS).forEach((p) => (p.delegates = []));
ROSTER.forEach((r) => POWERS[r.country]?.delegates.push(r.name));
let A = { geo: {}, wgeo: {}, towns: [], wtowns: [], wsub: {}, wlabels: {} };
let UNITS = [], ALLIES = [], AGENTS = [], LIVE_ARROWS = [], CONTROL = {}, RSHAPE = {}, MARKERS = [], RECON = [];
const REGION = Object.fromEntries(REGIONS.map((r) => [r.id, r]));
const baseOwner = (r) => OWNER[r.country] || r.country;
const ctrlOf = (r) => CONTROL[r.id] || baseOwner(r);
let imgs, patchCanvas, fogCanvas, mapGlobe, delGlobe;

const ownerOf = (n) => OWNER[n] || A.wsub?.[n] || n;
const colorOf = (n) => POWERS[ownerOf(n)]?.color || NEUTRALS[n] || '#8A8A8A';
const isPower = (n) => !!POWERS[ownerOf(n)];
/* ---------- Texture: satellite ground, city lights, country tints, borders ---------- */
const TW = 4096, TH = Math.round(TW * (LAT1 - LAT0) / (LON1 - LON0));
// Paint at up to 2x resolution where the GPU allows, so borders and coasts stay sharp when zoomed in.
const TEXK = (() => { try { const gl = document.createElement('canvas').getContext('webgl'); return gl && gl.getParameter(gl.MAX_TEXTURE_SIZE) >= 8192 ? 2 : 1; } catch (e) { return 1; } })();
const tx = (lon) => (lon - LON0) / (LON1 - LON0) * TW;
const ty = (lat) => (LAT1 - lat) / (LAT1 - LAT0) * TH;
const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

function ringPath(ctx, rings) { ctx.beginPath(); for (const r of rings) { r.forEach(([x, y], i) => i ? ctx.lineTo(tx(x), ty(y)) : ctx.moveTo(tx(x), ty(y))); ctx.closePath(); } }

// Whole-world texture painted in the same style as the Europe map, so the globe reads as one surface.
const WW = 4096 * TEXK, WH = 2048 * TEXK; // the whole world (8192 px where the GPU allows); Europe gets its own sharper patch
const PAL = ['#C9A44A', '#5FAE6A', '#B06A9E', '#5E8FC9', '#C97A4A', '#7FA84A', '#9A6FC0', '#4FA6A0', '#C05A5A', '#8E9A4A'];
function worldColor(n) { if (POWERS[ownerOf(n)] || NEUTRALS[n]) return colorOf(n); let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) >>> 0; return PAL[h % PAL.length]; }
// The world border data is coarse (0.1 degree steps), so smooth it once (Chaikin corner cutting) to drop the stair steps.
let WSMOOTH = null;
function smoothRing(r, n = 2) {
  let pts = r; for (let k = 0; k < n; k++) { const out = []; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); } pts = out; }
  return pts;
}
const wgeoSmooth = () => WSMOOTH || (WSMOOTH = Object.fromEntries(Object.entries(A.wgeo).map(([n, rings]) => [n, rings.map((r) => (r.length > 3 ? smoothRing(r) : r))])));
// Satellite ground, sea, country tints and borders never change during a game: paint them once and reuse.
let WORLD_BASE = null;
function worldBase() {
  if (WORLD_BASE) return WORLD_BASE;
  const X = (lon) => (lon + 180) / 360 * WW, Y = (lat) => (90 - lat) / 180 * WH; const G = wgeoSmooth();
  const base = document.createElement('canvas'); base.width = WW; base.height = WH; const ctx = base.getContext('2d');
  ctx.filter = 'saturate(1.15) contrast(1.06) brightness(0.96)'; ctx.drawImage(imgs.world, 0, 0, WW, WH); ctx.filter = 'none';
  // Tints and borders go on their own layer, then the sharp coastline mask trims everything that spills into the sea.
  const lay = document.createElement('canvas'); lay.width = WW; lay.height = WH; const l = lay.getContext('2d');
  const path = (rings) => { l.beginPath(); for (const r of rings) { r.forEach(([x, y], i) => i ? l.lineTo(X(x), Y(y)) : l.moveTo(X(x), Y(y))); l.closePath(); } };
  for (const [n, rings] of Object.entries(G)) { const k = flagKeyOf(n); if (k) { flagFill(l, k, rings, X, Y, 0.5); continue; } path(rings); l.fillStyle = worldColor(n); l.globalAlpha = 0.34; l.fill('evenodd'); }
  l.globalAlpha = 1; l.lineJoin = 'round'; l.lineCap = 'round';
  for (const rings of Object.values(G)) { path(rings); l.strokeStyle = 'rgba(10,20,40,0.4)'; l.lineWidth = 2 * TEXK; l.stroke(); l.strokeStyle = 'rgba(225,240,255,0.5)'; l.lineWidth = 0.8 * TEXK; l.stroke(); }
  l.globalCompositeOperation = 'destination-out'; l.drawImage(imgs.wwater, 0, 0, WW, WH);
  ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = 0.85; ctx.drawImage(lay, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.55; ctx.drawImage(lay, 0, 0); ctx.globalAlpha = 1;
  // Sea on top so the coast is exactly the mask's coast.
  l.globalCompositeOperation = 'copy'; l.fillStyle = '#0D1A3E'; l.fillRect(0, 0, WW, WH); l.globalCompositeOperation = 'destination-in'; l.drawImage(imgs.wwater, 0, 0, WW, WH);
  ctx.globalAlpha = 0.95; ctx.drawImage(lay, 0, 0); ctx.globalAlpha = 1;
  lay.width = lay.height = 0;
  return (WORLD_BASE = base);
}
function paintWorld(canvas, dark) {
  const ctx = canvas.getContext('2d'); const X = (lon) => (lon + 180) / 360 * WW, Y = (lat) => (90 - lat) / 180 * WH;
  ctx.globalCompositeOperation = 'copy'; ctx.drawImage(worldBase(), 0, 0); ctx.globalCompositeOperation = 'source-over';
  if (dark) {
    const fog = document.createElement('canvas'); fog.width = WW; fog.height = WH; const f = fog.getContext('2d');
    f.fillStyle = 'rgba(28,33,44,0.8)'; f.fillRect(0, 0, WW, WH); f.globalCompositeOperation = 'destination-out'; f.fillStyle = '#000'; f.lineJoin = 'round';
    for (const [n, rings] of Object.entries(wgeoSmooth())) {
      if (!ALLIES.includes(ownerOf(n))) continue; f.beginPath(); for (const r of rings) { r.forEach(([x, y], i) => i ? f.lineTo(X(x), Y(y)) : f.moveTo(X(x), Y(y))); f.closePath(); } f.fill('evenodd');
      for (const [w, a] of [[16, 0.15], [9, 0.2], [4, 0.3]]) { f.lineWidth = w * TEXK; f.strokeStyle = `rgba(0,0,0,${a})`; f.stroke(); }
    }
    const circ = (lo, la, d) => { const x = X(lo), y = Y(la), r = d / 360 * WW; const g = f.createRadialGradient(x, y, r * 0.35, x, y, r); g.addColorStop(0, '#000'); g.addColorStop(1, 'rgba(0,0,0,0)'); f.fillStyle = g; f.beginPath(); f.arc(x, y, r, 0, Math.PI * 2); f.fill(); };
    for (const u of UNITS) { if (ALLIES.includes(u.owner)) circ(u.at[0], u.at[1], u.kind === 'fleet' || u.kind === 'air' ? 6 : 4); else circ(u.at[0], u.at[1], 2.5); }
    ctx.drawImage(fog, 0, 0); fog.width = fog.height = 0;
  }
}

let grainPat = null;
let BASE_CACHE = null; // set to a canvas on the projector, where countries are clicked often
function paintTexture(canvas, imgs, sel) {
  const ctx = canvas.getContext('2d');
  ctx.setTransform(TEXK, 0, 0, TEXK, 0, 0);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.imageSmoothingQuality = 'high';
  // Bright daytime ground.
  ctx.filter = 'saturate(1.15) contrast(1.06) brightness(0.96)';
  ctx.drawImage(imgs.marble, 0, 0, TW, TH);
  ctx.filter = 'none';
  // Deep blue sea, using the water mask.
  const sea = document.createElement('canvas'); sea.width = TW; sea.height = TH; const s = sea.getContext('2d');
  const grad = s.createLinearGradient(0, 0, 0, TH); grad.addColorStop(0, '#0D1A3E'); grad.addColorStop(1, '#0D1A3E');
  s.fillStyle = grad; s.fillRect(0, 0, TW, TH);
  s.globalCompositeOperation = 'destination-in'; s.drawImage(imgs.water, 0, 0, TW, TH);
  ctx.globalAlpha = 0.95; ctx.drawImage(sea, 0, 0); ctx.globalAlpha = 1;
  // See-through country colors.
  for (const [name, g] of Object.entries(A.geo)) {
    { const k = flagKeyOf(name); if (k) { flagFill(ctx, k, g.r, tx, ty, 0.3); continue; } }
    ringPath(ctx, g.r);
    ctx.save(); ctx.clip('evenodd');
    ctx.fillStyle = colorOf(name);
    ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = 0.3; ctx.fillRect(0, 0, TW, TH);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.24; ctx.fillRect(0, 0, TW, TH);
    ctx.restore();
  }
  // Occupied Czech lands: hatch.
  const cz = A.geo['Czechoslovakia']; if (cz) {
    ctx.save(); ringPath(ctx, cz.r); ctx.clip('evenodd'); ctx.globalAlpha = 0.3; ctx.strokeStyle = '#2a2a20'; ctx.lineWidth = 5;
    for (let x = tx(10); x < tx(25); x += 16) { ctx.beginPath(); ctx.moveTo(x, ty(52)); ctx.lineTo(x + 140, ty(47)); ctx.stroke(); }
    ctx.restore();
  }
  // Borders: thin light lines.
  ctx.globalAlpha = 1; ctx.lineJoin = 'round';
  for (const [name, g] of Object.entries(A.geo)) {
    ringPath(ctx, g.r);
    ctx.strokeStyle = 'rgba(10,20,40,0.35)'; ctx.lineWidth = 3.5; ctx.stroke();
    ctx.strokeStyle = 'rgba(225,240,255,0.55)'; ctx.lineWidth = 1.3; ctx.stroke();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0); feather(canvas);
}
// Things that change during the game are drawn on light see-through layers above the map, so a move or an
// occupation only repaints a small image instead of the 8,000-pixel map (that repaint was the lag).
const OW = 2048 * TEXK, OH = Math.round(OW * (LAT1 - LAT0) / (LON1 - LON0)), FW = 2048 * TEXK, FH = FW / 2;
function paintOccupation(canvas, sel) {
  const ctx = canvas.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
  const k = canvas.width / TW; ctx.setTransform(k, 0, 0, k, 0, 0); ctx.globalAlpha = 1; ctx.lineJoin = 'round';
  // Occupied regions: stripes in the occupier's color, like wartime maps.
  for (const [id, owner] of Object.entries(CONTROL)) {
    const sh = RSHAPE[id]; if (!sh) continue; const col = POWERS[owner]?.color || NEUTRALS[owner] || '#999';
    if (POWERS[owner]) flagFill(ctx, owner, sh.r, tx, ty, 0.42);
    ctx.save(); ringPath(ctx, sh.r); ctx.clip('evenodd');
    ctx.globalAlpha = POWERS[owner] ? 0.12 : 0.28; ctx.fillStyle = col; ctx.fillRect(0, 0, TW, TH); ctx.globalAlpha = 0.7; ctx.strokeStyle = col; ctx.lineWidth = 6;
    const xs = sh.r.flat().map((p) => tx(p[0])), ys = sh.r.flat().map((p) => ty(p[1]));
    const x0 = Math.min(...xs) - 200, x1 = Math.max(...xs) + 200, y0 = Math.min(...ys), y1 = Math.max(...ys);
    for (let x = x0; x < x1; x += 22) { ctx.beginPath(); ctx.moveTo(x, y1 + 10); ctx.lineTo(x + (y1 - y0) + 20, y0 - 10); ctx.stroke(); }
    ctx.restore();
    ringPath(ctx, sh.r); ctx.globalAlpha = 1; ctx.strokeStyle = 'rgba(10,10,10,0.55)'; ctx.lineWidth = 3; ctx.setLineDash([10, 8]); ctx.stroke(); ctx.setLineDash([]);
  }
  if (sel && A.geo[sel]) {
    ringPath(ctx, A.geo[sel].r);
    ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fill('evenodd');
    ctx.strokeStyle = '#F5C21B'; ctx.lineWidth = 5; ctx.stroke();
  }
  // Offensive arrows.
  // Movement arrows from the server: in the moving side's color, dashed when only that side can see them.
  for (const a of []) { // movement arrows are turned off
    const p = a.pts.map(([lo, la]) => [tx(lo), ty(la)]); const col = a.owner === 'Germany' ? '#FF5A46' : (POWERS[a.owner]?.color || '#FF5A46');
    ctx.lineCap = 'round'; ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(15,15,10,0.7)'; ctx.lineWidth = 24; ctx.beginPath(); ctx.moveTo(...p[0]); ctx.quadraticCurveTo(...p[1], ...p[2]); ctx.stroke();
    if (!a.public) ctx.setLineDash([22, 16]);
    ctx.strokeStyle = col; ctx.lineWidth = 9; ctx.stroke(); ctx.setLineDash([]);
    const ang = Math.atan2(p[2][1] - p[1][1], p[2][0] - p[1][0]);
    ctx.save(); ctx.translate(...p[2]); ctx.rotate(ang); ctx.beginPath(); ctx.moveTo(30, 0); ctx.lineTo(-8, -24); ctx.lineTo(-8, 24); ctx.closePath();
    ctx.fillStyle = col; ctx.strokeStyle = 'rgba(15,15,10,0.8)'; ctx.lineWidth = 5; ctx.stroke(); ctx.fill(); ctx.restore();
  }
}
// Fog of war over the whole globe, in world coordinates.
function paintFogLayer(canvas) {
  const f = canvas.getContext('2d'); f.setTransform(1, 0, 0, 1, 0, 0); f.globalCompositeOperation = 'source-over'; f.clearRect(0, 0, FW, FH);
  const X = (lon) => (lon + 180) / 360 * FW, Y = (lat) => (90 - lat) / 180 * FH, deg = FW / 360;
  f.fillStyle = 'rgba(28,33,44,0.8)'; f.fillRect(0, 0, FW, FH);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 700; i++) { const x = rnd() * FW, y = rnd() * FH, r = (1.4 + rnd() * 6) * deg; const g = f.createRadialGradient(x, y, 0, x, y, r); const light = rnd() > 0.5; g.addColorStop(0, light ? 'rgba(120,130,150,0.22)' : 'rgba(5,8,14,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)'); f.fillStyle = g; f.beginPath(); f.arc(x, y, r, 0, Math.PI * 2); f.fill(); }
  f.globalCompositeOperation = 'destination-out'; f.lineJoin = 'round'; f.lineCap = 'round';
  const clearShape = (rings) => { f.beginPath(); for (const r of rings) { r.forEach(([x, y], i) => i ? f.lineTo(X(x), Y(y)) : f.moveTo(X(x), Y(y))); f.closePath(); } f.fillStyle = '#000'; f.fill('evenodd'); for (const [w, a] of [[1.5, 0.12], [1.1, 0.14], [0.8, 0.16], [0.45, 0.2], [0.2, 0.3]]) { f.lineWidth = w * deg; f.strokeStyle = `rgba(0,0,0,${a})`; f.stroke(); } };
  for (const [n, rings] of Object.entries(wgeoSmooth())) if (ALLIES.includes(ownerOf(n))) clearShape(rings);
  for (const n of ALLIES) if (A.geo[n]) clearShape(A.geo[n].r);
  for (const [id, owner] of Object.entries(CONTROL)) if (ALLIES.includes(owner) && RSHAPE[id]) clearShape(RSHAPE[id].r);
  const clear = (lon, lat, rDeg) => { const x = X(lon), y = Y(lat), r = rDeg * deg; const g = f.createRadialGradient(x, y, r * 0.35, x, y, r); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)'); f.fillStyle = g; f.beginPath(); f.arc(x, y, r, 0, Math.PI * 2); f.fill(); };
  for (const u of UNITS) { if (ALLIES.includes(u.owner)) clear(u.at[0], u.at[1], u.kind === 'air' ? 5 : u.kind === 'fleet' ? 4 : 3); else clear(u.at[0], u.at[1], 2.2); }
  for (const a of AGENTS) { const c = a.at || CAPITAL[a.target]; if (c) clear(c[0], c[1], 2.6); }
  for (const r of RECON) clear(r.at[0], r.at[1], r.r);
}

// Fade the detailed map patch into the plain globe so it has no hard edge.
function feather(canvas) {
  const ctx = canvas.getContext('2d'); const F = 7 * TW / (LON1 - LON0);
  const m = document.createElement('canvas'); m.width = TW; m.height = TH; const g = m.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, TW, TH); g.globalCompositeOperation = 'destination-out';
  const edge = (x0, y0, x1, y1, rx, ry, rw, rh) => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(rx, ry, rw, rh); };
  edge(0, 0, 0, F, 0, 0, TW, F); edge(0, TH, 0, TH - F, 0, TH - F, TW, F);
  edge(0, 0, F, 0, 0, 0, F, TH); edge(TW, 0, TW - F, 0, TW - F, 0, F, TH);
  ctx.save(); ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(m, 0, 0); ctx.restore();
}

/* ---------- Figurines ---------- */
const UNIFORM = {
  'Germany': { cloth: 0x5E6450, helmet: 0x4A5040, style: 'stahl' },
  'United Kingdom': { cloth: 0x8A7A4E, helmet: 0x5E5A3A, style: 'brodie' },
  'France': { cloth: 0x7C8C9E, helmet: 0x5F6E80, style: 'adrian' },
  'Poland': { cloth: 0x7E7A52, helmet: 0x5A5A3E, style: 'adrian' },
  'Italy': { cloth: 0x7E7E62, helmet: 0x5C5E48, style: 'stahl' },
  'USSR': { cloth: 0x7A7448, helmet: 0x4E5634, style: 'stahl' },
  'Finland': { cloth: 0x6E7068, helmet: 0x55574F, style: 'stahl' },
  'Japan': { cloth: 0x857A4C, helmet: 0x6A6440, style: 'stahl' },
  'United States': { cloth: 0x7E7550, helmet: 0x5A5A3C, style: 'brodie' },
};
const matCache = {};
const mat = (hex) => matCache[hex] || (matCache[hex] = new THREE.MeshStandardMaterial({ color: hex, flatShading: true, roughness: 0.75, metalness: 0.05 }));
function box(w, h, d, hex, x, y, z, parent, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(hex)); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); parent.add(m); return m;
}
function cyl(rt, rb, h, seg, hex, x, y, z, parent, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(hex)); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); parent.add(m); return m;
}
function soldier(owner, kneel) {
  const u = UNIFORM[owner]; const g = new THREE.Group(); const skin = 0xE2B98F, dark = 0x26282C, boot = 0x2E2A26, wood = 0x5A3E26;
  if (kneel) {
    box(0.34, 0.5, 0.34, u.cloth, -0.2, 0.25, 0.25, g); box(0.34, 0.34, 0.7, u.cloth, -0.2, 0.62, 0.05, g); box(0.36, 0.16, 0.42, boot, -0.2, 0.08, 0.32, g);
    box(0.34, 0.34, 0.7, u.cloth, 0.2, 0.17, -0.2, g, 0.25); box(0.34, 0.6, 0.34, u.cloth, 0.2, 0.55, 0.05, g);
  } else {
    box(0.34, 0.85, 0.34, u.cloth, -0.2, 0.55, 0, g); box(0.34, 0.85, 0.34, u.cloth, 0.2, 0.55, 0, g);
    box(0.38, 0.18, 0.48, boot, -0.2, 0.09, 0.05, g); box(0.38, 0.18, 0.48, boot, 0.2, 0.09, 0.05, g);
  }
  const top = kneel ? 0.8 : 1.0;
  box(0.9, 0.85, 0.5, u.cloth, 0, top + 0.42, 0, g);
  box(0.92, 0.12, 0.52, dark, 0, top + 0.06, 0, g);
  box(0.62, 0.62, 0.3, u.helmet, 0, top + 0.45, -0.38, g);
  box(0.5, 0.5, 0.5, skin, 0, top + 1.12, 0, g);
  if (u.style === 'brodie') { cyl(0.6, 0.6, 0.05, 16, u.helmet, 0, top + 1.42, 0, g); cyl(0.2, 0.34, 0.2, 14, u.helmet, 0, top + 1.52, 0, g); }
  else if (u.style === 'adrian') { cyl(0.3, 0.36, 0.26, 14, u.helmet, 0, top + 1.5, 0, g); cyl(0.46, 0.46, 0.05, 14, u.helmet, 0, top + 1.38, 0, g); box(0.06, 0.12, 0.6, u.helmet, 0, top + 1.66, 0, g); }
  else { cyl(0.3, 0.4, 0.34, 14, u.helmet, 0, top + 1.48, 0, g); cyl(0.44, 0.46, 0.12, 14, u.helmet, 0, top + 1.33, -0.02, g); }
  box(0.26, 0.75, 0.26, u.cloth, -0.58, top + 0.48, 0.2, g, -0.9); box(0.26, 0.75, 0.26, u.cloth, 0.58, top + 0.48, 0.2, g, -0.9);
  box(0.2, 0.2, 0.2, skin, -0.58, top + 0.7, 0.58, g); box(0.2, 0.2, 0.2, skin, 0.58, top + 0.7, 0.58, g);
  box(0.12, 0.16, 1.0, wood, 0.15, top + 0.7, 0.55, g, 0, 0.25);
  box(0.06, 0.06, 0.8, dark, 0.27, top + 0.74, 1.2, g, 0, 0.25);
  return g;
}
function ship(owner, flagHex) {
  const g = new THREE.Group(); const hull = 0x5E636B, deck = 0x8B7E66, sup = 0x767C85, dark = 0x2C3036, red = 0x7A2E28, boat = 0xD8D4C8;
  const s = new THREE.Shape(); s.moveTo(-1.6, -0.32); s.lineTo(0.9, -0.36); s.quadraticCurveTo(1.5, -0.28, 1.9, 0); s.quadraticCurveTo(1.5, 0.28, 0.9, 0.36); s.lineTo(-1.6, 0.32); s.quadraticCurveTo(-1.8, 0, -1.6, -0.32);
  const hg = new THREE.ExtrudeGeometry(s, { depth: 0.36, bevelEnabled: false }); hg.rotateX(-Math.PI / 2);
  const h = new THREE.Mesh(hg, mat(hull)); g.add(h);
  const wg = new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: false }); wg.rotateX(-Math.PI / 2); const wl = new THREE.Mesh(wg, mat(red)); wl.scale.set(1.005, 1, 1.02); wl.position.y = -0.02; g.add(wl);
  const dg = new THREE.ShapeGeometry(s); dg.rotateX(-Math.PI / 2); const d = new THREE.Mesh(dg, mat(deck)); d.position.y = 0.361; g.add(d);
  // Superstructure: stepped bridge, conning tower, funnels, masts with yards
  box(1.0, 0.28, 0.46, sup, -0.15, 0.5, 0, g); box(0.62, 0.22, 0.38, sup, 0.05, 0.75, 0, g); box(0.4, 0.2, 0.32, sup, 0.12, 0.96, 0, g);
  box(0.42, 0.05, 0.36, dark, 0.12, 1.08, 0, g); for (let i = 0; i < 4; i++) box(0.02, 0.05, 0.3, 0x9AB0BE, 0.32, 0.99, 0, g);
  cyl(0.06, 0.07, 0.16, 8, sup, 0.12, 1.18, 0, g);
  for (const x of [-0.35, -0.65]) { cyl(0.1, 0.12, 0.62, 10, sup, x, 0.88, 0, g, 0, 0, 0.12); cyl(0.105, 0.105, 0.08, 10, flagHex, x + 0.03, 1.1, 0, g, 0, 0, 0.12); cyl(0.09, 0.09, 0.03, 10, dark, x + 0.04, 1.2, 0, g, 0, 0, 0.12); }
  cyl(0.022, 0.03, 1.0, 5, dark, 0.3, 1.45, 0, g); box(0.02, 0.02, 0.5, dark, 0.3, 1.7, 0, g); box(0.02, 0.02, 0.3, dark, 0.3, 1.5, 0, g); box(0.08, 0.05, 0.08, sup, 0.3, 1.85, 0, g);
  cyl(0.018, 0.02, 0.7, 5, dark, -1.05, 0.72, 0, g); box(0.02, 0.02, 0.32, dark, -1.05, 0.95, 0, g);
  box(0.12, 0.08, 0.04, flagHex, -1.1, 1.0, 0.03, g);
  // Main turrets with twin barrels, fore and aft
  for (const [x, dir, y] of [[1.0, 1, 0.48], [0.62, 1, 0.6], [-1.12, -1, 0.48]]) {
    const t = new THREE.Group(); t.position.set(x, y, 0); g.add(t);
    if (y > 0.5) cyl(0.17, 0.2, 0.14, 10, sup, 0, -0.08, 0, t);
    box(0.36, 0.16, 0.3, sup, 0, 0.02, 0, t); box(0.2, 0.1, 0.28, sup, -dir * 0.12, 0.08, 0, t);
    for (const z of [-0.07, 0.07]) cyl(0.022, 0.028, 0.52, 6, dark, dir * 0.4, 0.04, z, t, 0, 0, Math.PI / 2);
  }
  // Secondary guns, anti-aircraft guns and lifeboats along the sides
  for (const z of [-1, 1]) {
    for (const x of [-0.45, 0.1]) { box(0.14, 0.08, 0.1, sup, x, 0.42, z * 0.26, g); cyl(0.012, 0.014, 0.22, 5, dark, x + 0.14, 0.43, z * 0.27, g, 0, 0, Math.PI / 2); }
    for (const x of [-0.2, 0.3]) { cyl(0.04, 0.045, 0.04, 8, dark, x, 0.66, z * 0.22, g); cyl(0.008, 0.008, 0.14, 4, dark, x + 0.04, 0.72, z * 0.22, g, 0, 0, -0.7); }
    for (const x of [-0.75, -0.5]) { box(0.2, 0.06, 0.07, boat, x, 0.69, z * 0.25, g); box(0.18, 0.02, 0.05, 0x5A4A36, x, 0.72, z * 0.25, g); }
    box(1.5, 0.04, 0.012, 0x9A9EA4, 0, 0.4, z * 0.33, g);
    cyl(0.03, 0.03, 0.02, 6, dark, 1.55, 0.25, z * 0.22, g, Math.PI / 2);
  }
  box(0.12, 0.05, 0.05, dark, -1.62, 0.39, 0, g);
  return g;
}
const ARMOR = { 'Germany': 0x4E5446, 'United Kingdom': 0x7A6E48, 'France': 0x6E785A, 'Poland': 0x6B6A48, 'USSR': 0x56613C, 'Italy': 0x8A7E5A, 'Finland': 0x5E6258, 'Japan': 0x6E6A48, 'United States': 0x5E6640 };
const AIR = { 'Germany': 0x6C7466, 'United Kingdom': 0x6E6A44, 'France': 0x7E8A8E, 'Poland': 0x6A6E4A, 'USSR': 0x5E6A44, 'Italy': 0x9A8E64, 'Finland': 0x6A7064, 'Japan': 0x8E8E7E, 'United States': 0x7A7E6A };
function tank(owner) {
  const g = new THREE.Group(); const c = ARMOR[owner], dark = 0x2A2A28, wheel = 0x3A3A36;
  for (const x of [-0.56, 0.56]) {
    box(0.34, 0.36, 1.9, dark, x, 0.2, 0, g);
    for (let i = 0; i < 5; i++) cyl(0.15, 0.15, 0.06, 14, wheel, x + Math.sign(x) * 0.18, 0.18, -0.68 + i * 0.34, g, 0, 0, Math.PI / 2);
  }
  box(0.82, 0.36, 1.7, c, 0, 0.52, -0.02, g);
  box(1.36, 0.08, 1.7, c, 0, 0.42, -0.02, g);
  box(0.82, 0.3, 0.32, c, 0, 0.48, 0.92, g, 0.6);
  box(0.66, 0.32, 0.78, c, 0, 0.86, -0.12, g);
  cyl(0.13, 0.15, 0.16, 8, c, -0.12, 1.08, -0.3, g);
  cyl(0.045, 0.05, 0.9, 6, dark, 0, 0.86, 0.68, g, Math.PI / 2);
  box(0.5, 0.14, 0.34, dark, 0, 0.6, -0.9, g);
  for (const x of [-0.56, 0.56]) box(0.36, 0.03, 1.96, c, x, 0.4, 0, g);
  cyl(0.11, 0.11, 0.05, 8, dark, -0.12, 1.18, -0.3, g); box(0.16, 0.03, 0.12, c, -0.12, 1.21, -0.38, g, -0.6);
  cyl(0.008, 0.008, 0.9, 4, dark, 0.26, 1.35, -0.4, g, 0.15);
  cyl(0.03, 0.03, 0.14, 6, dark, 0.22, 0.62, 0.88, g, Math.PI / 2 - 0.3);
  for (const x of [-0.24, 0.24]) cyl(0.05, 0.05, 0.16, 6, 0x4A4440, x, 0.62, -1.0, g, Math.PI / 2);
  box(0.6, 0.04, 0.2, 0x5A4A36, 0, 0.72, -0.58, g); box(0.18, 0.1, 0.3, dark, 0.3, 0.76, 0.3, g);
  for (const z of [-0.6, -0.1, 0.4]) cyl(0.06, 0.06, 0.06, 8, wheel, -0.56 - 0.02, 0.36, z, g, 0, 0, Math.PI / 2);
  return g;
}
function plane(owner, flagHex) {
  const g = new THREE.Group(); const c = AIR[owner], dark = 0x222428, glass = 0x6E8EA8, under = 0x9AA2A8, prop = 0x1A1A1A;
  const body = cyl(0.13, 0.17, 1.7, 8, c, 0, 0, 0, g, Math.PI / 2); body.scale.set(1, 1, 0.9);
  cyl(0.03, 0.16, 0.3, 8, c, 0, 0, -0.98, g, -Math.PI / 2);
  cyl(0.16, 0.17, 0.26, 10, dark, 0, 0, 0.84, g, Math.PI / 2);
  for (const x of [-0.17, 0.17]) for (const z of [0.66, 0.74]) box(0.03, 0.03, 0.05, 0x5A4A3A, x, -0.02, z, g);
  cyl(0.02, 0.07, 0.12, 8, 0xB0B0A8, 0, 0, 1.02, g, Math.PI / 2);
  box(0.7, 0.05, 0.08, prop, 0, 0, 1.04, g, 0, 0, 0.5); box(0.7, 0.05, 0.08, prop, 0, 0, 1.04, g, 0, 0, 2.07);
  // Wings: tapered, with underside color, ailerons and wing guns
  const wing = new THREE.Shape(); wing.moveTo(-1.18, 0.02); wing.lineTo(-1.15, 0.3); wing.lineTo(1.15, 0.3); wing.lineTo(1.18, 0.02); wing.lineTo(0.2, -0.2); wing.lineTo(-0.2, -0.2); wing.closePath();
  const wgeo = new THREE.ExtrudeGeometry(wing, { depth: 0.05, bevelEnabled: false }); wgeo.rotateX(Math.PI / 2); const w = new THREE.Mesh(wgeo, mat(c)); w.position.set(0, -0.02, 0.06); g.add(w);
  box(2.2, 0.01, 0.4, under, 0, -0.075, 0.2, g);
  for (const x of [-0.8, 0.8]) box(0.6, 0.012, 0.06, dark, x, -0.015, 0.0, g);
  for (const x of [-0.5, 0.5]) cyl(0.012, 0.012, 0.22, 4, dark, x, -0.04, 0.42, g, Math.PI / 2);
  box(0.3, 0.065, 0.3, flagHex, -0.92, -0.02, 0.15, g); box(0.3, 0.065, 0.3, flagHex, 0.92, -0.02, 0.15, g);
  // Tail: stabilizers, fin with rudder stripe, tail wheel
  box(0.82, 0.04, 0.28, c, 0, 0.02, -0.82, g); box(0.84, 0.042, 0.06, dark, 0, 0.02, -0.95, g);
  box(0.05, 0.38, 0.32, c, 0, 0.21, -0.86, g); box(0.055, 0.3, 0.08, flagHex, 0, 0.22, -0.99, g);
  box(0.12, 0.13, 0.04, flagHex, 0, 0.0, -0.45, g);
  // Cockpit: canopy with frame, headrest, antenna mast
  box(0.2, 0.15, 0.42, glass, 0, 0.17, 0.1, g); box(0.21, 0.02, 0.42, dark, 0, 0.245, 0.1, g); box(0.21, 0.16, 0.02, dark, 0, 0.17, 0.0, g);
  box(0.16, 0.1, 0.24, c, 0, 0.15, -0.22, g); cyl(0.006, 0.01, 0.24, 4, dark, 0, 0.27, -0.42, g, -0.3);
  return g;
}
function basePlate(hex) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.0, 0.1, 40), new THREE.MeshLambertMaterial({ color: 0xF5C21B })); ring.position.y = 0.07; ring.visible = false; ring.name = 'sel'; g.add(ring);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.88, 0.12, 40), new THREE.MeshLambertMaterial({ color: hex })); disc.position.y = 0.08; g.add(disc);
  return g;
}
const hexOf = (c) => parseInt(c.slice(1), 16);
function bakeFigure(root, keep) {
  root.updateMatrixWorld(true);
  const groups = new Map(); const drop = [];
  root.traverse((o) => {
    if (!o.isMesh || o === keep || o.name === 'sel') return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k);
    g.applyMatrix4(o.matrixWorld);
    if (!groups.has(o.material)) groups.set(o.material, []); groups.get(o.material).push(g); drop.push(o);
  });
  for (const o of drop) o.parent.remove(o);
  // Keep the selection ring with the root even if it sat inside a removed group.
  const ring = []; root.traverse((o) => { if (o.name === 'sel' && o.parent !== root) ring.push(o); });
  for (const o of ring) { o.updateMatrixWorld(true); o.applyMatrix4(o.parent.matrixWorld); root.add(o); }
  for (const c of [...root.children]) if (!c.isMesh && c.children.length === 0) root.remove(c);
  for (const [m, list] of groups) { const merged = mergeBufferGeometries(list, false); list.forEach((g) => g.dispose()); if (merged) root.add(new THREE.Mesh(merged, m)); }
}
function makeFigure(u) {
  const col = hexOf(POWERS[u.owner].color); const root = new THREE.Group();
  if (u.kind === 'fleet') {
    const sh = ship(u.owner, col); sh.scale.setScalar(0.85); sh.position.y = -0.05; root.add(sh);
    const sel = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.06, 6, 32), new THREE.MeshBasicMaterial({ color: 0xF5C21B })); sel.rotation.x = Math.PI / 2; sel.position.y = 0.1; sel.visible = false; sel.name = 'sel'; root.add(sel);
    root.userData.heading = u.heading ?? 0.6;
  } else if (u.kind === 'armor') {
    const plate = basePlate(col); root.add(plate);
    for (const [x, z] of (u.str >= 6 ? [[-0.42, 0.3], [0.45, -0.3]] : [[0, 0]])) { const t = tank(u.owner); t.scale.setScalar(0.52); t.position.set(x, 0.14, z); t.rotation.y = 0.15; plate.add(t); }
    root.userData.heading = u.heading ?? 0;
  } else if (u.kind === 'air') {
    const plate = basePlate(col); plate.scale.setScalar(0.6); root.add(plate);
    cyl(0.03, 0.03, 1.5, 6, 0xC8C8C0, 0, 0.8, 0, root);
    for (const [x, y, z] of [[0, 1.75, 0.35], [-0.75, 1.6, -0.35], [0.75, 1.6, -0.35]].slice(0, u.str >= 8 ? 3 : 2)) { const pl = plane(u.owner, col); pl.scale.setScalar(0.5); pl.position.set(x, y, z); pl.rotation.z = x * 0.15; root.add(pl); }
    root.userData.heading = u.heading ?? 0;
  } else {
    const plate = basePlate(col); root.add(plate);
    const spots = u.str >= 20 ? [[0, 0.35, false], [-0.62, -0.35, true], [0.62, -0.35, false]] : u.str >= 8 ? [[-0.36, 0.1, false], [0.4, -0.1, true]] : [[0, 0, false]];
    for (const [x, z, kneel] of spots) { const s = soldier(u.owner, kneel); s.scale.setScalar(0.5); s.position.set(x * 0.85, 0.12, z * 0.85); plate.add(s); }
    root.userData.heading = 0;
  }
  const sh = new THREE.Mesh(new THREE.CircleGeometry(u.kind === 'fleet' ? 1.6 : 1.15, 32), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: u.kind === 'air' ? 0.22 : 0.35, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2; sh.position.y = 0.01; sh.scale.set(1, u.kind === 'fleet' ? 0.55 : 1, 1); root.add(sh);
  bakeFigure(root, sh);
  root.traverse(o => { o.userData.unitId = u.id; });
  return root;
}


/* ---------- Map features: 3D props for trenches, bunkers, factories and more ---------- */
const FEAT = S.FEATURES;
let FEATS = [];
let SHOW_FEAT = (() => { try { return localStorage.getItem('crisis-feat') !== 'off'; } catch { return true; } })();
const ghostCache = {}, ruinCache = {};
const ghost = (m) => ghostCache[m.uuid] || (ghostCache[m.uuid] = Object.assign(m.clone(), { transparent: true, opacity: 0.42, depthWrite: false }));
const ruin = (m) => ruinCache[m.uuid] || (ruinCache[m.uuid] = (() => { const r = m.clone(); r.color = m.color.clone().multiplyScalar(0.32); return r; })());
const C = { dirt: 0x6E5A3C, dark: 0x3A3024, sand: 0xB8A47A, conc: 0x9A9C96, conc2: 0x7C7E78, steel: 0x3C4044, wood: 0x8A6A44, roof: 0x7A3E30, brick: 0x9A5A40, tar: 0x2E3034, white: 0xE8E4D8, canvas: 0x8E8A5E, tank: 0xB4B0A4, water: 0x2E4A66 };
function cone(r, h, seg, hex, x, y, z, parent, rx = 0, ry = 0, rz = 0) { const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat(hex)); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); parent.add(m); return m; }
// Each builder makes one piece in figurine units (about 2.6 long along z for line pieces). Emitters are smoke or fire spots.
const PROP = {
  trench(g, st) {
    for (const [z, r] of [[-0.9, 0.5], [0, -0.5], [0.9, 0.5]]) {
      const s = new THREE.Group(); s.position.z = z; s.rotation.y = r; g.add(s);
      box(0.42, 0.06, 1.0, C.dark, 0, 0.03, 0, s); box(0.12, 0.2, 1.0, C.dirt, -0.27, 0.1, 0, s); box(0.12, 0.2, 1.0, C.dirt, 0.27, 0.1, 0, s);
      for (let i = 0; i < 4; i++) box(0.16, 0.1, 0.22, C.sand, -0.37, 0.24, -0.36 + i * 0.24, s);
      for (let i = 0; i < 5; i++) box(0.3, 0.015, 0.08, C.wood, 0, 0.07, -0.4 + i * 0.2, s);
      for (const zz of [-0.45, 0.45]) box(0.03, 0.3, 0.03, C.wood, -0.21, 0.15, zz, s);
    }
    for (const z of [-0.5, 0.45]) { cyl(0.07, 0.08, 0.05, 10, 0x55594A, 0.02, 0.24, z, g); box(0.1, 0.06, 0.08, 0xD8B08A, 0.02, 0.19, z, g); }
    cyl(0.02, 0.02, 0.32, 5, C.steel, -0.3, 0.32, 0.1, g, Math.PI / 2 - 0.1); box(0.08, 0.06, 0.12, C.steel, -0.3, 0.3, -0.05, g);
  },
  fort(g) {
    box(1.0, 0.5, 0.9, C.conc, 0, 0.25, 0, g); box(1.1, 0.12, 1.0, C.conc2, 0, 0.56, 0, g); box(0.6, 0.08, 0.04, C.tar, 0, 0.36, -0.46, g);
    for (const x of [-0.5, 0.5]) box(0.2, 0.4, 0.95, C.conc2, x, 0.2, 0, g, 0, 0, x > 0 ? -0.35 : 0.35);
    cyl(0.04, 0.04, 0.5, 6, C.steel, 0, 0.36, -0.6, g, Math.PI / 2);
    cyl(0.16, 0.18, 0.14, 10, C.conc2, 0.25, 0.69, 0.15, g); box(0.18, 0.03, 0.02, C.tar, 0.25, 0.7, 0.0, g);
    box(0.24, 0.3, 0.03, 0x3A3E44, -0.25, 0.15, 0.46, g); cyl(0.01, 0.01, 0.5, 4, C.steel, -0.35, 0.85, 0.3, g);
    const net = new THREE.Mesh(new THREE.ConeGeometry(0.7, 0.18, 6, 1, true), mat(0x55603E)); net.position.set(0, 0.7, 0); net.scale.set(1, 1, 0.85); g.add(net);
    for (const z of [-1.0, 1.0]) for (const x of [-0.35, 0, 0.35]) cone(0.13, 0.26, 4, C.conc2, x + (z > 0 ? 0.17 : 0), 0.13, z, g);
  },
  wire(g) {
    for (let i = -2; i <= 2; i++) { const z = i * 0.5; box(0.04, 0.42, 0.04, C.wood, 0, 0.21, z, g); box(0.02, 0.5, 0.02, C.steel, 0, 0.22, z + 0.25, g, 0.9); box(0.02, 0.5, 0.02, C.steel, 0, 0.22, z + 0.25, g, -0.9); }
    box(0.015, 0.015, 2.1, C.steel, 0, 0.36, 0, g); box(0.015, 0.015, 2.1, C.steel, 0, 0.18, 0, g);
  },
  mines(g) {
    const d = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.05, 0.04, 20), mat(C.dirt)); d.position.y = 0.02; g.add(d);
    for (const [x, z] of [[-0.5, -0.3], [0.2, -0.55], [0.55, 0.1], [-0.15, 0.35], [0.3, 0.6], [-0.6, 0.45]]) cyl(0.09, 0.1, 0.05, 8, C.steel, x, 0.06, z, g);
    for (const [x, z] of [[-0.85, -0.5], [0.85, 0.5]]) { box(0.04, 0.55, 0.04, C.wood, x, 0.28, z, g); box(0.02, 0.16, 0.24, 0xC23A2E, x, 0.48, z + 0.12, g); }
  },
  flak(g) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.14, 6, 14), mat(C.sand)); ring.rotation.x = Math.PI / 2; ring.position.y = 0.12; g.add(ring);
    cyl(0.32, 0.36, 0.08, 10, C.steel, 0, 0.06, 0, g); box(0.4, 0.2, 0.4, C.steel, 0, 0.2, 0, g); box(0.42, 0.24, 0.03, OLIVE, 0, 0.42, -0.18, g, -0.5);
    for (const x of [-0.06, 0.06]) cyl(0.03, 0.04, 1.0, 6, C.steel, x, 0.62, -0.25, g, -0.75);
    box(0.08, 0.04, 0.12, C.tar, 0.16, 0.32, 0.12, g);
    person(g, 0.28, 0.25, OLIVE, 0.75); person(g, -0.3, 0.3, OLIVE, 0.75);
    for (const [x, z] of [[0.4, -0.35], [-0.42, -0.25]]) box(0.14, 0.1, 0.1, C.wood, x, 0.05, z, g);
  },
  factory(g, st, em) {
    box(2.2, 0.02, 1.6, 0x55524A, 0, 0.01, 0.05, g);
    box(1.8, 0.6, 1.1, C.brick, 0, 0.3, 0, g);
    for (let i = 0; i < 3; i++) { box(0.6, 0.06, 0.62, C.roof, -0.6 + i * 0.6, 0.72, 0, g, 0, 0, 0.5); box(0.04, 0.2, 1.1, 0x9AB0BE, -0.6 + i * 0.6 + 0.2, 0.72, 0, g, 0, 0, -0.9); }
    for (let i = 0; i < 6; i++) { box(0.16, 0.14, 0.02, 0x2A3036, -0.75 + i * 0.3, 0.38, -0.56, g); box(0.16, 0.14, 0.02, 0x2A3036, -0.75 + i * 0.3, 0.38, 0.56, g); }
    box(0.3, 0.32, 0.03, 0x3A2A1E, 0.55, 0.16, -0.565, g); box(0.5, 0.1, 0.02, 0xE8E0C8, -0.2, 0.55, -0.565, g);
    for (const x of [-0.55, 0.15]) { cyl(0.11, 0.14, 1.5, 8, C.brick, x, 0.75, 0.45, g); cyl(0.12, 0.12, 0.05, 8, 0x2A2A2A, x, 1.5, 0.45, g); em.push({ x, y: 1.55, z: 0.45, type: st === 'ruined' ? 'black' : 'smoke' }); }
    // Water tower, rail siding and crates
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) rod([0.85 + a * 0.12, 0, -0.45 + b * 0.12], [0.85 + a * 0.08, 0.75, -0.45 + b * 0.08], 0.025, C.steel, g);
    cyl(0.16, 0.16, 0.24, 12, C.wood, 0.85, 0.87, -0.45, g); cone(0.17, 0.1, 12, C.roof, 0.85, 1.04, -0.45, g);
    for (const x of [-0.95, -0.82]) box(0.025, 0.03, 1.5, C.steel, x, 0.02, 0.1, g); box(0.22, 0.2, 0.5, 0x6E3A2A, -0.885, 0.13, 0.25, g);
    for (const [x, z] of [[0.7, 0.68], [0.85, 0.7], [0.77, 0.7]]) box(0.12, 0.12, 0.12, C.wood, x, 0.06 + (x === 0.77 ? 0.12 : 0), z, g);
  },
  airfield(g, st, em, f) {
    box(1.6, 0.012, 3.0, 0x5E6A44, 0, 0.006, 0, g);
    box(0.6, 0.03, 2.8, C.tar, 0, 0.015, 0, g); for (let i = -2; i <= 2; i++) box(0.06, 0.035, 0.24, C.white, 0, 0.02, i * 0.5, g);
    box(0.3, 0.025, 1.6, C.tar, 0.62, 0.012, 0.3, g);
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.8, 10, 1, false, 0, Math.PI), mat(C.conc2)); h.rotation.set(0, 0, Math.PI / 2); h.rotation.order = 'ZYX'; h.position.set(0.85, 0, 0.6); h.rotateX(Math.PI / 2); g.add(h);
    box(0.02, 0.36, 0.72, 0x3A3E44, 0.45, 0.18, 0.6, g);
    const c = hexOf(POWERS[f?.owner]?.color || '#888888');
    for (const z of [-0.7, -0.1]) { const p = plane(f?.owner || 'Germany', c); p.scale.setScalar(0.32); p.position.set(0.8, 0.08, z); p.rotation.y = 1.4; g.add(p); }
    box(0.26, 0.5, 0.26, C.white, -0.7, 0.25, -0.6, g); box(0.34, 0.16, 0.34, 0x9AB0BE, -0.7, 0.58, -0.6, g); box(0.38, 0.04, 0.38, C.conc2, -0.7, 0.68, -0.6, g);
    cyl(0.012, 0.012, 0.6, 4, C.steel, -0.7, 0.3, 0.9, g); cone(0.05, 0.22, 6, 0xE07A2A, -0.7, 0.55, 1.0, g, Math.PI / 2);
    truck(g, -0.55, 0.2, 0.3, 0x8A8A3A);
  },
  oil(g, st, em) {
    box(2.2, 0.02, 2.0, 0x2E2A24, 0, 0.01, 0, g);
    // Derrick: four legs leaning in, cross braces, crown block, drill shed
    const dx = -0.5, dz = -0.35, H = 1.75, bw = 0.3, tw = 0.07;
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) rod([dx + a * bw, 0, dz + b * bw], [dx + a * tw, H, dz + b * tw], 0.035, C.steel, g);
    for (let i = 1; i <= 4; i++) { const y = H * i / 5, w = bw + (tw - bw) * i / 5; for (const [a, b, c, d] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) rod([dx + a * w, y, dz + b * w], [dx + c * w, y, dz + d * w], 0.02, C.steel, g); }
    for (let i = 0; i < 4; i++) { const y0 = H * i / 5, y1 = H * (i + 1) / 5, w0 = bw + (tw - bw) * i / 5, w1 = bw + (tw - bw) * (i + 1) / 5; rod([dx - w0, y0, dz - w0], [dx + w1, y1, dz - w1], 0.015, C.steel, g); rod([dx + w0, y0, dz + w0], [dx - w1, y1, dz + w1], 0.015, C.steel, g); }
    box(0.2, 0.1, 0.2, C.steel, dx, H + 0.05, dz, g); box(0.4, 0.04, 0.4, C.wood, dx, 0.32, dz, g);
    box(0.34, 0.24, 0.26, C.wood, dx + 0.42, 0.12, dz + 0.1, g); box(0.38, 0.03, 0.3, C.roof, dx + 0.42, 0.26, dz + 0.1, g);
    // Pumpjack: skid, A-frame, walking beam, horse head, crank and counterweights, motor
    const px = 0.45, pz = -0.45;
    box(0.16, 0.06, 0.9, C.steel, px, 0.03, pz, g);
    rod([px - 0.08, 0.06, pz - 0.05], [px, 0.62, pz], 0.04, 0x8A3A2A, g); rod([px + 0.08, 0.06, pz - 0.05], [px, 0.62, pz], 0.04, 0x8A3A2A, g); rod([px, 0.06, pz + 0.18], [px, 0.62, pz], 0.04, 0x8A3A2A, g);
    box(0.06, 0.07, 0.95, 0x8A3A2A, px, 0.66, pz - 0.02, g, 0.18);
    box(0.08, 0.26, 0.1, 0x8A3A2A, px, 0.62, pz - 0.5, g, 0.35);
    rod([px, 0.6, pz - 0.55], [px, 0.12, pz - 0.6], 0.012, C.steel, g); cyl(0.04, 0.05, 0.12, 8, C.steel, px, 0.09, pz - 0.6, g);
    for (const sx of [-1, 1]) { box(0.03, 0.22, 0.2, 0x3C3C3C, px + sx * 0.1, 0.24, pz + 0.38, g); }
    box(0.18, 0.14, 0.16, 0x3E5A3A, px, 0.1, pz + 0.55, g);
    // Storage tanks with roofs, stripe and ladder
    for (const [x, z, r] of [[0.5, 0.5, 0.3], [-0.25, 0.62, 0.24]]) {
      cyl(r, r, 0.5, 18, C.tank, x, 0.25, z, g); cone(r * 1.02, 0.12, 18, 0x9C988C, x, 0.56, z, g); cyl(r * 1.01, r * 1.01, 0.05, 18, 0xB23A2A, x, 0.36, z, g);
      rod([x + r * 0.7, 0, z + r * 0.75], [x + r * 0.7, 0.5, z + r * 0.75], 0.015, C.steel, g); rod([x + r * 0.85, 0, z + r * 0.6], [x + r * 0.85, 0.5, z + r * 0.6], 0.015, C.steel, g);
    }
    // Pipes linking it all
    cyl(0.025, 0.025, 1.05, 6, 0x6A6A60, 0.0, 0.05, 0.12, g, 0, 0.9, Math.PI / 2); cyl(0.025, 0.025, 0.9, 6, 0x6A6A60, 0.47, 0.05, 0.02, g, Math.PI / 2);
    if (st === 'ruined') em.push({ x: dx, y: 0.3, z: dz, type: 'fire' }, { x: dx, y: 0.9, z: dz, type: 'black' }, { x: 0.5, y: 0.5, z: 0.5, type: 'fire' }, { x: 0.5, y: 0.9, z: 0.5, type: 'black' });
  },
  port(g, st, em, f) {
    box(0.5, 0.12, 2.4, C.conc2, 0, 0.06, 0, g); box(0.9, 0.12, 0.4, C.conc2, 0.45, 0.06, 0.9, g);
    for (let i = 0; i < 6; i++) cyl(0.03, 0.035, 0.08, 6, C.tar, 0.22, 0.16, -1.0 + i * 0.4, g);
    box(0.7, 0.45, 0.9, C.brick, -0.65, 0.22, -0.3, g); box(0.76, 0.08, 0.96, C.roof, -0.65, 0.48, -0.3, g);
    for (let i = 0; i < 3; i++) box(0.02, 0.2, 0.2, 0x3A2A1E, -0.29, 0.12, -0.6 + i * 0.3, g);
    box(0.08, 1.3, 0.08, 0xC8A030, 0.1, 0.7, 0.2, g); box(0.07, 0.07, 1.1, 0xC8A030, 0.1, 1.3, 0.55, g); box(0.02, 0.5, 0.02, C.steel, 0.1, 1.05, 1.05, g); box(0.16, 0.1, 0.16, C.wood, 0.1, 0.75, 1.05, g);
    for (const [x, z, h] of [[-0.2, 0.55, 0.36], [-0.05, 0.75, 0.24], [-0.25, -0.95, 0.24]]) box(0.14, h, 0.14, C.wood, x, 0.12 + h / 2, z, g);
    const sh = ship(f?.owner || 'Germany', hexOf(POWERS[f?.owner]?.color || '#888888')); sh.scale.setScalar(0.4); sh.rotation.y = Math.PI / 2; sh.position.set(0.55, 0.0, -0.4); g.add(sh);
  },
  bridge(g, st) {
    const gap = st === 'ruined';
    for (const z of [-1.0, 1.0]) { box(0.5, 0.1, 0.9, C.conc, 0, 0.42, z * (gap ? 1.05 : 0.6), g, gap ? z * 0.25 : 0); }
    if (!gap) { box(0.5, 0.1, 0.6, C.conc, 0, 0.42, 0, g); for (const x of [-0.24, 0.24]) { box(0.03, 0.12, 2.1, C.steel, x, 0.53, 0, g); for (let i = 0; i < 8; i++) box(0.02, 0.12, 0.02, C.steel, x, 0.53, -1.0 + i * 0.28, g); } }
    for (const z of [-0.6, 0.6]) { box(0.36, 0.42, 0.18, C.conc2, 0, 0.2, z, g); box(0.42, 0.06, 0.24, C.conc, 0, 0.4, z, g); }
    const arch = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.04, 4, 12, Math.PI), mat(C.conc2)); arch.rotation.y = Math.PI / 2; arch.position.y = 0.0; if (!gap) g.add(arch);
    box(0.6, 0.02, 2.6, C.water, 0, 0.01, 0, g, 0, 1.57);
  },
  camp(g, st, em) {
    for (const [x, z] of [[-0.45, -0.3], [0.4, -0.35], [0, 0.45]]) cone(0.36, 0.5, 4, C.canvas, x, 0.25, z, g, 0, 0.78);
    box(0.04, 1.1, 0.04, C.wood, 0.6, 0.55, 0.5, g); box(0.02, 0.24, 0.4, 0xC23A2E, 0.6, 0.98, 0.7, g);
    for (const a of [0, 1.2, 2.4]) box(0.24, 0.04, 0.04, C.wood, 0, 0.03, -0.05, g, 0, a);
    for (const [x, z] of [[0.25, 0.05], [-0.25, 0.1], [0.05, -0.32]]) person(g, x, z, 0x4A4A3A, 0.7);
    for (const [x, z] of [[-0.75, 0.3], [0.75, -0.6]]) cone(0.18, 0.5, 6, 0x3E5A34, x, 0.25, z, g);
    em.push({ x: 0, y: 0.08, z: -0.05, type: 'camp' });
  },
  fire(g, st, em) { em.push({ x: 0, y: 0.1, z: 0, type: 'fire' }, { x: 0.3, y: 0.1, z: 0.2, type: 'fire' }, { x: 0, y: 0.5, z: 0, type: 'black' }); },

  // ---- More figurines: artillery, logistics, civil unrest, sea and air ----
  artillery(g) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.13, 5, 18, Math.PI * 1.2), mat(C.sand)); ring.rotation.set(Math.PI / 2, 0, Math.PI * 0.9); ring.position.y = 0.1; g.add(ring);
    for (const x of [-0.42, 0.42]) { gun(g, x, 0.1, 0.35); person(g, x + 0.22, 0.45, OLIVE, 0.7); }
    for (const [x, z] of [[-0.7, 0.55], [0.75, 0.5]]) { box(0.22, 0.14, 0.16, C.wood, x, 0.07, z, g); for (let i = 0; i < 3; i++) cyl(0.025, 0.025, 0.12, 6, 0xB08A3A, x - 0.06 + i * 0.06, 0.2, z, g); }
  },
  railgun(g, st, em, f) {
    track(g, 2.6); box(0.62, 0.22, 1.9, C.steel, 0, 0.32, 0, g); box(0.5, 0.42, 0.9, OLIVE, 0, 0.62, 0.15, g);
    cyl(0.07, 0.1, 2.3, 8, C.steel, 0, 1.15, -0.75, g, -1.1);
    for (const z of [-0.7, -0.25, 0.25, 0.7]) for (const x of [-0.26, 0.26]) cyl(0.12, 0.12, 0.08, 10, C.tar, x, 0.17, z, g, 0, 0, Math.PI / 2);
  },
  pillbox(g) {
    cyl(0.62, 0.7, 0.5, 6, C.conc, 0, 0.25, 0, g); cyl(0.68, 0.68, 0.1, 6, C.conc2, 0, 0.55, 0, g);
    for (const a of [0, 2.1, 4.2]) box(0.28, 0.07, 0.05, C.tar, Math.sin(a) * 0.66, 0.36, Math.cos(a) * 0.66, g, 0, a);
    cyl(0.03, 0.03, 0.45, 5, C.steel, 0, 0.36, -0.85, g, Math.PI / 2);
  },
  tanktrap(g) { for (let i = -2; i <= 2; i++) for (const x of [-0.25, 0.25]) cone(0.17, 0.34, 4, C.conc, x + (i % 2) * 0.12, 0.17, i * 0.5, g, 0, 0.78); },
  sandbags(g) { for (let r = 0; r < 3; r++) for (let i = 0; i < 8; i++) box(0.24, 0.12, 0.3, r % 2 ? C.sand : 0xA8946A, (r % 2) * 0.03, 0.06 + r * 0.12, -1.05 + i * 0.3 + (r % 2) * 0.15, g); },
  searchlight(g) {
    for (const [x, z, a] of [[-0.45, 0.2, 0.25], [0.45, -0.2, -0.3]]) {
      box(0.3, 0.12, 0.3, C.steel, x, 0.06, z, g); box(0.06, 0.32, 0.06, C.steel, x, 0.28, z, g);
      cyl(0.17, 0.2, 0.26, 12, C.steel, x, 0.48, z, g, -0.6, 0, a); cyl(0.15, 0.15, 0.02, 12, 0xFFF4C0, x, 0.6, z - 0.08, g, -0.6, 0, a);
      const b = new THREE.Mesh(new THREE.ConeGeometry(0.42, 3.4, 12, 1, true), BEAM); b.position.set(x + Math.sin(a) * 1.6, 2.1, z - 0.95); b.rotation.set(-0.6 + Math.PI, 0, -a); g.add(b);
    }
  },
  balloon(g) {
    for (const [x, y, z] of [[-0.6, 2.0, 0.2], [0.5, 2.3, -0.3], [0.1, 1.8, 0.75]]) {
      sph(0.22, 0xA8ACA6, x, y, z, g, 1, 1, 2.1); for (const r of [0, 2.1, 4.2]) box(0.02, 0.18, 0.16, 0xA8ACA6, x + Math.sin(r) * 0.15, y + Math.cos(r) * 0.15, z - 0.38, g, 0, 0, r);
      cyl(0.008, 0.008, y, 3, C.steel, x, y / 2, z, g); box(0.16, 0.1, 0.24, OLIVE, x, 0.05, z, g);
    }
  },
  radar(g) {
    for (const x of [-0.5, 0, 0.5]) { for (const a of [-1, 1]) box(0.04, 2.4, 0.04, C.steel, x + a * 0.1, 1.2, 0, g, 0, 0, -a * 0.04); for (let y = 0.4; y < 2.4; y += 0.4) box(0.22, 0.03, 0.03, C.steel, x, y, 0, g); box(0.5, 0.03, 0.03, C.steel, x, 2.25, 0, g); }
    box(0.6, 0.35, 0.5, C.brick, 0.2, 0.17, 0.75, g); box(0.66, 0.06, 0.56, C.roof, 0.2, 0.38, 0.75, g);
  },
  hq(g, st, em, f) {
    tent(g, 0, 0, 1.2, 0.8, C.canvas); box(0.5, 0.04, 0.3, C.wood, 0.8, 0.32, 0.5, g); for (const [x, z] of [[0.6, 0.38], [1.0, 0.38], [0.6, 0.62], [1.0, 0.62]]) box(0.03, 0.3, 0.03, C.wood, x, 0.15, z, g);
    cyl(0.02, 0.025, 1.8, 5, C.steel, -0.7, 0.9, -0.5, g); box(0.3, 0.02, 0.02, C.steel, -0.7, 1.7, -0.5, g); flagpole(g, 0.7, -0.5, f);
    car(g, -0.6, 0.65, 0.4, OLIVE);
  },
  barracks(g, st, em, f) {
    for (const x of [-0.6, 0.6]) { box(0.5, 0.35, 1.6, C.wood, x, 0.17, -0.2, g); box(0.62, 0.05, 1.7, C.roof, x - 0.14, 0.42, -0.2, g, 0, 0, 0.45); box(0.62, 0.05, 1.7, C.roof, x + 0.14, 0.42, -0.2, g, 0, 0, -0.45); }
    box(0.8, 0.02, 0.6, C.sand, 0, 0.01, 0.95, g); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) person(g, -0.22 + i * 0.22, 0.8 + j * 0.16, OLIVE, 0.7);
    flagpole(g, 0.55, 0.95, f);
  },
  depot(g) {
    for (const [x, z, n] of [[-0.55, -0.4, 3], [0.1, -0.5, 2], [-0.3, 0.3, 2]]) for (let k = 0; k < n; k++) box(0.34, 0.28, 0.34, C.wood, x + (k % 2) * 0.05, 0.14 + k * 0.28, z, g, 0, k * 0.2);
    for (const [x, z] of [[0.55, 0.1], [0.75, 0.3], [0.55, 0.45], [0.8, -0.1]]) cyl(0.1, 0.1, 0.3, 10, 0x4E5A3A, x, 0.15, z, g);
    box(0.9, 0.04, 0.7, C.canvas, 0.25, 0.62, 0.55, g, 0.15); for (const [x, z] of [[-0.18, 0.25], [0.68, 0.25], [-0.18, 0.85], [0.68, 0.85]]) box(0.03, 0.6, 0.03, C.wood, x, 0.3, z, g);
  },
  trucks(g) { for (const [x, z] of [[-0.75, -0.3], [-0.25, -0.3], [0.25, -0.3], [0.75, -0.3]]) truck(g, x, z, 0, OLIVE); for (const x of [-0.5, 0, 0.5]) cyl(0.09, 0.09, 0.28, 8, 0x4E5A3A, x, 0.14, 0.75, g); },
  convoy(g) { truck(g, 0, -0.6, 0, OLIVE); truck(g, 0, 0.6, 0, KHAKI); },
  rail(g) { track(g, 2.6); box(0.5, 0.42, 1.05, 0x6E3A2A, 0, 0.42, -0.55, g); box(0.5, 0.05, 1.1, C.tar, 0, 0.66, -0.55, g); box(0.5, 0.28, 1.0, C.steel, 0, 0.34, 0.65, g); for (const z of [0.35, 0.65, 0.95]) cyl(0.12, 0.12, 0.08, 8, C.sand, 0, 0.54, z, g, Math.PI / 2); },
  hospital(g) {
    for (const [x, z] of [[-0.45, -0.2], [0.45, 0.2]]) { tent(g, x, z, 0.8, 0.6, C.white); box(0.06, 0.02, 0.26, 0xC8202A, x, 0.62, z, g); box(0.26, 0.02, 0.06, 0xC8202A, x, 0.62, z, g); }
    truck(g, 0.2, -0.7, 1.57, C.white, true);
  },
  roadblock(g) {
    box(0.06, 0.3, 0.06, C.steel, -0.7, 0.15, 0, g); for (let i = 0; i < 6; i++) box(0.24, 0.06, 0.06, i % 2 ? C.white : 0xC23A2E, -0.55 + i * 0.24, 0.28, 0, g);
    box(0.32, 0.6, 0.32, C.wood, 0.95, 0.3, 0.3, g); box(0.38, 0.05, 0.38, C.roof, 0.95, 0.62, 0.3, g);
    for (let i = 0; i < 4; i++) box(0.24, 0.12, 0.2, C.sand, -0.8 + i * 0.24, 0.06, -0.4, g); person(g, 0.6, 0.35, OLIVE); person(g, -0.9, 0.3, OLIVE);
  },
  bombers(g, st, em, f) {
    const c = hexOf(POWERS[f.owner]?.color || '#888888'); for (const [x, y, z] of [[0, 1.9, -0.4], [-0.8, 1.75, 0.35], [0.8, 1.75, 0.35]]) { const b = bomber(f.owner, c); b.scale.setScalar(0.5); b.position.set(x, y, z); g.add(b); }
  },
  paratroopers(g) {
    for (const [x, y, z] of [[-0.6, 1.9, 0], [0.1, 2.3, -0.4], [0.6, 1.6, 0.4], [-0.1, 1.3, 0.6]]) {
      const c = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xD8D2C0)); c.position.set(x, y, z); g.add(c);
      for (const a of [0.8, 2.3, 3.9, 5.4]) box(0.008, 0.5, 0.008, C.steel, x + Math.cos(a) * 0.13, y - 0.22, z + Math.sin(a) * 0.13, g, Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45);
      person(g, x, z, OLIVE, 0.75, y - 0.62);
    }
    person(g, 0.3, -0.1, OLIVE, 0.75); const cc = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xD8D2C0)); cc.scale.set(1, 0.25, 1); cc.position.set(0.5, 0, 0.0); g.add(cc);
  },
  cavalry(g) { for (const [x, z] of [[-0.55, 0.2], [0, -0.25], [0.55, 0.25]]) horse(g, x, z, KHAKI); },
  uboat(g) {
    sph(0.22, 0x50565C, 0, 0.02, 0, g, 1, 0.55, 6.5); cyl(0.13, 0.17, 0.32, 8, 0x50565C, 0, 0.24, -0.15, g); box(0.24, 0.05, 0.3, 0x50565C, 0, 0.42, -0.15, g);
    cyl(0.015, 0.015, 0.4, 4, C.steel, 0.03, 0.6, -0.2, g); cyl(0.025, 0.025, 0.4, 5, C.steel, 0, 0.17, 0.45, g, Math.PI / 2 - 0.15);
    box(0.14, 0.01, 1.2, 0xCFE0EE, 0, 0.005, -1.7, g);
  },
  navalmines(g) { for (const [x, z] of [[-0.6, -0.4], [0.1, -0.7], [0.6, -0.1], [-0.2, 0.3], [0.45, 0.65], [-0.7, 0.6]]) { sph(0.13, 0x30343A, x, 0.08, z, g); for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0, 0]]) cyl(0.015, 0.015, 0.1, 4, 0x30343A, x + a * 0.13, b || a ? 0.08 : 0.24, z + b * 0.13, g, b ? Math.PI / 2 : 0, 0, a ? Math.PI / 2 : 0); } },
  blockade(g, st, em, f) { const s1 = ship(f.owner, hexOf(POWERS[f.owner]?.color || '#888888')); s1.scale.setScalar(0.42); s1.rotation.y = Math.PI / 2; g.add(s1); },
  shipyard(g, st, em, f) {
    box(0.9, 0.06, 2.4, C.conc2, 0, 0.03, 0, g); for (let i = 0; i < 7; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 4, 10, Math.PI), mat(C.steel)); r.rotation.set(0, Math.PI / 2, Math.PI); r.position.set(0, 0.36, -0.9 + i * 0.3); g.add(r); }
    box(0.04, 0.04, 1.9, C.steel, 0, 0.06, 0, g);
    box(0.08, 1.7, 0.08, 0xC8A030, 0.75, 0.85, 0.6, g); box(0.07, 0.07, 1.3, 0xC8A030, 0.75, 1.68, 0.1, g); box(0.02, 0.6, 0.02, C.steel, 0.75, 1.35, -0.5, g);
    box(0.6, 0.5, 0.7, C.brick, -0.9, 0.25, -0.6, g);
  },
  radio(g) {
    for (let y = 0; y < 2.4; y += 0.3) { const s = 0.24 - y * 0.08; for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(0.03, 0.32, 0.03, C.steel, a * s, y + 0.15, b * s, g); box(s * 2, 0.02, 0.02, 0xC23A2E, 0, y + 0.3, -s, g); }
    sph(0.06, 0xFF3020, 0, 2.5, 0, g); box(0.6, 0.35, 0.5, C.conc, 0.75, 0.17, 0.5, g);
  },
  embassy(g, st, em, f) {
    box(1.6, 0.12, 1.0, C.conc, 0, 0.06, 0, g); box(1.4, 0.6, 0.6, 0xD8D0BC, 0, 0.42, -0.1, g);
    for (let i = 0; i < 6; i++) cyl(0.05, 0.05, 0.58, 8, C.white, -0.6 + i * 0.24, 0.41, 0.3, g);
    box(1.5, 0.08, 0.95, C.white, 0, 0.75, 0.05, g); const p = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.75, 0.3, 3, 1), mat(C.white)); p.rotation.set(Math.PI / 2, 0, 0); p.scale.set(1, 1, 0.5); p.position.set(0, 0.86, 0.48); g.add(p);
    flagpole(g, 0, -0.1, f, 1.2);
  },
  pow(g) {
    for (let i = 0; i <= 8; i++) { const t = i / 8; for (const [x, z] of [[-1 + 2 * t, -1], [-1 + 2 * t, 1], [-1, -1 + 2 * t], [1, -1 + 2 * t]]) box(0.03, 0.4, 0.03, C.wood, x, 0.2, z, g); }
    for (const z of [-1, 1]) for (const y of [0.15, 0.32]) box(2, 0.01, 0.01, C.steel, 0, y, z, g); for (const x of [-1, 1]) for (const y of [0.15, 0.32]) box(0.01, 0.01, 2, C.steel, x, y, 0, g);
    for (const z of [-0.45, 0.3]) box(1.2, 0.3, 0.38, C.wood, -0.15, 0.15, z, g);
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(0.03, 0.9, 0.03, C.wood, 0.75 + a * 0.1, 0.45, 0.75 + b * 0.1, g); box(0.3, 0.2, 0.3, C.wood, 0.75, 1.0, 0.75, g); box(0.36, 0.04, 0.36, C.roof, 0.75, 1.13, 0.75, g);
  },
  riot(g, st, em) {
    const shirts = [0x6A4E3A, 0x3A4A6A, 0x7A6A4A, 0x4A4A4A, 0x8A3A2E, 0x5A6A5A];
    for (let i = 0; i < 11; i++) { const a = i * 2.4, r = 0.25 + (i % 4) * 0.18; person(g, Math.cos(a) * r, Math.sin(a) * r, shirts[i % shirts.length], 0.75); if (i % 3 === 0) { box(0.015, 0.4, 0.015, C.wood, Math.cos(a) * r + 0.08, 0.55, Math.sin(a) * r, g); box(0.22, 0.14, 0.02, C.white, Math.cos(a) * r + 0.08, 0.78, Math.sin(a) * r, g); } }
    box(0.5, 0.25, 0.28, C.tar, 0.75, 0.13, 0.55, g, 0, 0.4, 0.3); em.push({ x: 0.75, y: 0.25, z: 0.55, type: 'fire' }, { x: 0.75, y: 0.5, z: 0.55, type: 'black' });
  },
  strike(g) {
    box(1.4, 0.55, 0.9, C.brick, 0, 0.27, -0.35, g); for (let i = 0; i < 2; i++) box(0.7, 0.06, 0.5, C.roof, -0.35 + i * 0.7, 0.66, -0.35, g, 0, 0, 0.5); cyl(0.1, 0.13, 1.1, 8, C.brick, 0.5, 0.55, -0.6, g);
    for (let i = 0; i < 6; i++) { const x = -0.75 + i * 0.3; person(g, x, 0.55 + (i % 2) * 0.12, i % 2 ? 0x3A4A6A : 0x5A4A3A, 0.75); if (i % 2 === 0) { box(0.015, 0.4, 0.015, C.wood, x + 0.08, 0.55, 0.6, g); box(0.24, 0.14, 0.02, C.white, x + 0.08, 0.78, 0.6, g); } }
  },
  refugees(g) { for (let i = 0; i < 5; i++) person(g, (i % 2) * 0.18 - 0.09, -1.0 + i * 0.32, [0x5A4A3A, 0x4A4A4A, 0x6A5A40, 0x3A3A4A][i % 4], 0.7); cart(g, 0, 0.75); },
  scorched(g, st, em) {
    const d = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.2, 0.03, 16), mat(0x241E18)); d.position.y = 0.015; g.add(d);
    for (const [x, z, h] of [[-0.5, -0.3, 0.5], [0.3, -0.6, 0.35], [0.6, 0.3, 0.55], [-0.2, 0.5, 0.3], [0.1, 0.05, 0.45]]) { cyl(0.04, 0.06, h, 5, 0x1A1612, x, h / 2, z, g, 0.2, 0, 0.15); box(0.18, 0.02, 0.02, 0x1A1612, x + 0.06, h * 0.8, z, g, 0, 0, 0.6); }
    em.push({ x: -0.3, y: 0.1, z: -0.2, type: 'black' }, { x: 0.4, y: 0.1, z: 0.3, type: 'black' }, { x: 0.1, y: 0.05, z: 0.1, type: 'camp' }, { x: 0.5, y: 0.05, z: -0.4, type: 'camp' });
  },
  rubble(g, st, em) {
    for (const [x, z, w, h, r] of [[-0.5, -0.3, 0.6, 0.55, 0.1], [0.4, -0.4, 0.5, 0.35, -0.2], [0.1, 0.45, 0.7, 0.25, 0.3], [-0.6, 0.5, 0.3, 0.45, -0.1]]) { box(w, h, 0.12, C.brick, x, h / 2, z, g, 0, r, (x > 0 ? 0.12 : -0.08)); box(0.12, h * 0.7, w * 0.6, C.brick, x + w / 2 - 0.06, h * 0.35, z + 0.15, g); }
    for (const [x, z] of [[0, 0], [0.55, 0.2], [-0.3, -0.7]]) cone(0.28, 0.2, 6, 0x6E6258, x, 0.1, z, g);
    em.push({ x: 0, y: 0.2, z: 0, type: 'black' }, { x: 0.5, y: 0.2, z: -0.3, type: 'smoke' });
  },
  flood(g) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.04, 20), WATER); w.position.y = 0.06; g.add(w);
    for (const [x, z] of [[-0.4, -0.2], [0.45, 0.35]]) { box(0.4, 0.15, 0.4, C.brick, x, 0.1, z, g); box(0.46, 0.05, 0.46, C.roof, x - 0.12, 0.2, z, g, 0, 0, 0.5); box(0.46, 0.05, 0.46, C.roof, x + 0.12, 0.2, z, g, 0, 0, -0.5); }
    for (const [x, z] of [[0.3, -0.6], [-0.6, 0.55], [0.8, -0.1]]) cone(0.16, 0.36, 6, 0x3E5A34, x, 0.24, z, g);
  },
};
// Shared pieces for the figurines above.
const OLIVE = 0x5A5E44, KHAKI = 0x8A7E58;
const BEAM = new THREE.MeshBasicMaterial({ color: 0xFFF2B0, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
const WATER = new THREE.MeshStandardMaterial({ color: 0x3E6A8E, transparent: true, opacity: 0.8, roughness: 0.2, metalness: 0.1, flatShading: true });
function rod(a, b, t, hex, g) { const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A); const m = new THREE.Mesh(new THREE.BoxGeometry(t, d.length(), t), mat(hex)); m.position.copy(A).add(B).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); g.add(m); return m; }
function sph(r, hex, x, y, z, parent, sx = 1, sy = 1, sz = 1) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 7), mat(hex)); m.position.set(x, y, z); m.scale.set(sx, sy, sz); parent.add(m); return m; }
function person(g, x, z, shirt, s = 1, y = 0) { box(0.16 * s, 0.24 * s, 0.12 * s, 0x3A342C, x, y + 0.12 * s, z, g); box(0.2 * s, 0.24 * s, 0.14 * s, shirt, x, y + 0.36 * s, z, g); box(0.12 * s, 0.12 * s, 0.12 * s, 0xD8B08A, x, y + 0.54 * s, z, g); }
function gun(g, x, z, k = 0.35) {
  box(0.12, 0.08, 0.7, OLIVE, x, 0.12, z + 0.2, g); for (const s of [-1, 1]) cyl(0.13, 0.13, 0.05, 10, C.tar, x + s * 0.17, 0.13, z, g, 0, 0, Math.PI / 2);
  box(0.3, 0.22, 0.04, OLIVE, x, 0.28, z - 0.05, g); cyl(0.035, 0.045, 0.9, 6, C.steel, x, 0.42, z - 0.4, g, -Math.PI / 2 + k);
}
function track(g, len) { for (const x of [-0.22, 0.22]) box(0.04, 0.05, len, C.steel, x, 0.06, 0, g); for (let i = 0; i < Math.round(len / 0.25); i++) box(0.62, 0.04, 0.1, C.wood, 0, 0.02, -len / 2 + 0.12 + i * 0.25, g); }
function truck(g, x, z, r, hex, red) {
  const t = new THREE.Group(); t.position.set(x, 0, z); t.rotation.y = r; g.add(t);
  box(0.3, 0.22, 0.24, hex, 0, 0.22, 0.32, t); box(0.32, 0.3, 0.55, red ? hex : C.canvas, 0, 0.3, -0.12, t); box(0.34, 0.06, 0.95, C.tar, 0, 0.1, 0.05, t);
  for (const zz of [0.32, -0.25]) for (const s of [-1, 1]) cyl(0.08, 0.08, 0.05, 8, C.tar, s * 0.17, 0.08, zz, t, 0, 0, Math.PI / 2);
  if (red) { box(0.02, 0.06, 0.2, 0xC8202A, 0.17, 0.32, -0.12, t); box(0.02, 0.2, 0.06, 0xC8202A, 0.17, 0.32, -0.12, t); }
}
function car(g, x, z, r, hex) { const t = new THREE.Group(); t.position.set(x, 0, z); t.rotation.y = r; g.add(t); box(0.26, 0.12, 0.5, hex, 0, 0.12, 0, t); box(0.24, 0.1, 0.24, hex, 0, 0.23, -0.03, t); for (const zz of [0.16, -0.16]) for (const s of [-1, 1]) cyl(0.06, 0.06, 0.04, 8, C.tar, s * 0.14, 0.06, zz, t, 0, 0, Math.PI / 2); }
function cart(g, x, z) { box(0.36, 0.08, 0.5, C.wood, x, 0.2, z, g); for (const s of [-1, 1]) cyl(0.13, 0.13, 0.03, 10, C.wood, x + s * 0.2, 0.13, z, g, 0, 0, Math.PI / 2); for (const [a, b] of [[-0.08, -0.1], [0.08, 0.1], [0, 0]]) box(0.14, 0.12, 0.14, C.canvas, x + a, 0.3, z + b, g); box(0.03, 0.03, 0.5, C.wood, x, 0.18, z + 0.45, g); }
function tent(g, x, z, w, d, hex) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.01, w / 2, 0.5, 4, 1), mat(hex)); p.rotation.y = Math.PI / 4; p.scale.set(1, 1, d / w); p.position.set(x, 0.25, z); g.add(p); box(w * 0.7, 0.25, d * 0.7, hex, x, 0.12, z, g); }
function flagpole(g, x, z, f, h = 1.1) { const c = hexOf(POWERS[f?.owner]?.color || '#C8A030'); cyl(0.015, 0.02, h, 5, C.steel, x, h / 2, z, g); box(0.02, 0.18, 0.3, c, x, h - 0.1, z + 0.15, g); }
function horse(g, x, z, rider) {
  const brown = 0x5A3A24; box(0.16, 0.18, 0.5, brown, x, 0.32, z, g); for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(0.04, 0.24, 0.04, brown, x + a * 0.05, 0.12, z + b * 0.19, g);
  box(0.08, 0.22, 0.1, brown, x, 0.46, z + 0.26, g, 0.5); box(0.08, 0.08, 0.16, brown, x, 0.56, z + 0.34, g);
  box(0.12, 0.2, 0.12, rider, x, 0.52, z - 0.03, g); box(0.09, 0.09, 0.09, 0xD8B08A, x, 0.67, z - 0.03, g); box(0.11, 0.04, 0.11, OLIVE, x, 0.73, z - 0.03, g); box(0.012, 0.012, 0.5, C.steel, x + 0.08, 0.6, z + 0.15, g, 0.4);
}
function bomber(owner, flagHex) {
  const g = new THREE.Group(); const c = AIR[owner] || 0x7A7E6A, dark = 0x222428, glass = 0x6E8EA8, prop = 0x1A1A1A;
  cyl(0.15, 0.2, 2.2, 10, c, 0, 0, 0, g, Math.PI / 2); cyl(0.05, 0.15, 0.4, 10, glass, 0, 0, 1.2, g, Math.PI / 2); box(0.16, 0.12, 0.3, glass, 0, 0.17, 0.75, g);
  cyl(0.07, 0.07, 0.1, 8, glass, 0, 0.2, -0.2, g); cyl(0.01, 0.01, 0.2, 4, dark, 0.03, 0.27, -0.25, g, Math.PI / 2 - 0.2);
  box(3.0, 0.06, 0.5, c, 0, 0, 0.15, g); box(3.0, 0.012, 0.08, dark, 0, 0.03, -0.07, g);
  for (const x of [-1.0, -0.5, 0.5, 1.0]) { cyl(0.08, 0.1, 0.45, 8, dark, x, -0.02, 0.38, g, Math.PI / 2); cyl(0.02, 0.05, 0.08, 6, 0xB0B0A8, x, -0.02, 0.63, g, Math.PI / 2); box(0.44, 0.03, 0.05, prop, x, -0.02, 0.66, g, 0, 0, 0.6); box(0.44, 0.03, 0.05, prop, x, -0.02, 0.66, g, 0, 0, 2.17); }
  box(1.0, 0.05, 0.3, c, 0, 0.02, -1.0, g); for (const x of [-0.45, 0.45]) { box(0.05, 0.36, 0.26, c, x, 0.18, -1.02, g); box(0.055, 0.12, 0.27, flagHex, x, 0.22, -1.02, g); }
  box(0.3, 0.065, 0.3, flagHex, -1.2, 0.01, 0.15, g); box(0.3, 0.065, 0.3, flagHex, 1.2, 0.01, 0.15, g);
  box(0.2, 0.04, 0.5, dark, 0, -0.18, 0.1, g); cyl(0.05, 0.05, 0.12, 6, glass, 0, 0, -1.15, g, Math.PI / 2);
  return g;
}
// Spies: a figure in a trench coat and hat, for the agent owner and crisis staff.
function spyFigure() {
  const g = new THREE.Group(); const coat = 0x4A4038, hat = 0x2A2622;
  const c = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.32, 0.9, 8), mat(coat)); c.position.y = 0.45; g.add(c);
  box(0.22, 0.24, 0.22, 0xD8B08A, 0, 1.02, 0, g); cyl(0.26, 0.26, 0.03, 12, hat, 0, 1.15, 0, g); cyl(0.13, 0.15, 0.14, 12, hat, 0, 1.23, 0, g);
  box(0.24, 0.18, 0.06, 0x3A2A1E, 0.3, 0.35, 0.05, g); box(0.42, 0.12, 0.1, coat, 0.08, 0.72, 0.18, g, 0, 0, -0.4);
  return g;
}

function scaffold(g) {
  const b = new THREE.Box3().setFromObject(g); if (b.isEmpty()) return; const s = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3()); const h = s.y + 0.25;
  for (const [a, d] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(0.05, h, 0.05, 0xC9A060, c.x + a * s.x / 2, h / 2, c.z + d * s.z / 2, g);
  for (const d of [-1, 1]) { box(s.x, 0.04, 0.04, 0xC9A060, c.x, h, c.z + d * s.z / 2, g); box(0.04, 0.04, s.z, 0xC9A060, c.x + d * s.x / 2, h, c.z, g); }
}
const featState = (f) => f.ruined ? 'ruined' : f.ready > (STATE?.update?.no ?? 0) ? 'building' : 'ready';
function makeProp(f, emitters) {
  const st = featState(f); const root = new THREE.Group(); const em = [];
  PROP[f.kind]?.(root, st, em, f);
  if (st === 'building') scaffold(root);
  if (st === 'ruined') { root.children.forEach((c, i) => { c.rotation.z += (i % 3 - 1) * 0.35; c.position.y -= 0.05; }); if (!em.some((e) => e.type === 'black')) em.push({ x: 0, y: 0.4, z: 0, type: 'black' }, { x: 0.1, y: 0.15, z: 0, type: 'fire' }); }
  if (st === 'building') em.length = 0;
  bakeFigure(root, null);
  root.traverse((o) => { if (o.isMesh) { o.material = st === 'building' ? ghost(o.material) : st === 'ruined' ? ruin(o.material) : o.material; o.userData.featId = f.id; } });
  root.userData.em = em;
  return root;
}
const FICON = {
  trench: '<path d="M3 15l4-5 4 5 4-5 4 5"/>', fort: '<path d="M4 17h14v-6l-3-3H7l-3 3z"/><path d="M8 13h6"/>', wire: '<path d="M4 6l14 10M4 16L18 6M3 11h16"/>',
  mines: '<circle cx="11" cy="12" r="4"/><path d="M11 4v3M11 17v3M3 12h3M16 12h3"/>', flak: '<path d="M5 18h12M8 18l2-5 6-8"/>', factory: '<path d="M3 18V9l5 3V9l5 3V5h3v13z"/>',
  airfield: '<path d="M11 3v16M4 11l7 2 7-2M8 18h6"/>', oil: '<path d="M7 19l4-15 4 15M8 14h6M9 9h4"/>', port: '<circle cx="11" cy="5" r="2"/><path d="M11 7v12M5 13a6 6 0 0 0 12 0M8 10h6"/>',
  bridge: '<path d="M2 9h18M4 9v8M18 9v8M6 17a5 5 0 0 1 10 0"/>', camp: '<path d="M3 18L11 5l8 13zM11 18v-5"/>', fire: '<path d="M11 3c4 4 6 7 6 10a6 6 0 0 1-12 0c0-2 1-4 3-5 0 2 1 3 2 3 0-3 0-5 1-8z"/>',
};
Object.assign(FICON, {
  artillery: '<path d="M3 16h8M5 16l3-4 10-6M7 18a2 2 0 1 0 0-.1"/>', railgun: '<path d="M2 18h18M4 15h12l2-9"/>', pillbox: '<path d="M4 17h14v-5l-3-3H7l-3 3z"/>', tanktrap: '<path d="M3 17l3-6 3 6zM10 17l3-6 3 6z"/>',
  sandbags: '<path d="M3 17h16M4 13h14M6 9h10"/>', searchlight: '<path d="M7 18l4-5M11 13l7-9M13 3l7 6"/>', balloon: '<ellipse cx="11" cy="8" rx="6" ry="3.5"/><path d="M11 12v8"/>', radar: '<path d="M6 19V5M11 19V5M16 19V5M4 9h14"/>',
  hq: '<path d="M3 18l8-12 8 12zM11 6V2l4 1.5L11 5"/>', barracks: '<path d="M3 18V10l8-5 8 5v8zM8 18v-4h6v4"/>', depot: '<path d="M4 10h6v8H4zM12 6h6v12h-6z"/>', trucks: '<path d="M2 15V8h11v7M13 11h4l3 3v1M5 18a1.5 1.5 0 1 0 0-.1M16 18a1.5 1.5 0 1 0 0-.1"/>',
  convoy: '<path d="M2 14V9h8v5M10 11h3l2 2M13 14V9h7v5"/>', rail: '<path d="M7 3l-2 16M15 3l2 16M6 7h10M5.5 12h11M5 17h12"/>', hospital: '<path d="M11 5v12M5 11h12"/>', roadblock: '<path d="M3 11h16M5 11v7M17 11v7"/>',
  bombers: '<path d="M11 4v14M3 10l8 3 8-3M8 18h6"/>', paratroopers: '<path d="M4 10a7 7 0 0 1 14 0zM4 10l7 8 7-8"/>', cavalry: '<path d="M4 16l2-6h8l3-3 2 1-2 4v4M7 16v3M14 16v3"/>', uboat: '<path d="M2 14h18l-3 3H5zM10 14V9h4v5M12 9V5"/>',
  navalmines: '<circle cx="11" cy="12" r="4"/><path d="M11 4v4M11 16v4M3 12h4M15 12h4"/>', blockade: '<path d="M2 15h7l-1 3H3zM13 15h7l-1 3h-5zM2 10h18"/>', shipyard: '<path d="M4 18h14M6 18l2-6h8l2 6M15 3v9M10 3h8"/>', radio: '<path d="M11 20V6M7 20l4-14 4 14M6 4a7 7 0 0 1 10 0"/>',
  embassy: '<path d="M3 18h16M4 9h14l-7-5zM6 9v9M11 9v9M16 9v9"/>', pow: '<path d="M3 5h16v14H3zM8 5v14M14 5v14"/>', riot: '<path d="M6 19v-6M11 19v-8M16 19v-6M8 9l3-5 3 5"/>', strike: '<path d="M4 18V8h14v10M8 5h6v3M9 12h4"/>',
  refugees: '<path d="M5 19l2-7M12 19l2-7M7 9a2 2 0 1 0 0-.1M14 9a2 2 0 1 0 0-.1"/>', scorched: '<path d="M3 18h16M6 18v-5M11 18v-8M16 18v-4"/>', rubble: '<path d="M3 18l3-6 4 3 3-7 6 10z"/>', flood: '<path d="M2 12c3-2 5 2 8 0s5 2 8 0M2 17c3-2 5 2 8 0s5 2 8 0"/>',
});
const fIcon = (k) => `<svg viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${FICON[k] || '<path d="M11 3l8 8-8 8-8-8z"/>'}</svg>`;
const modText = (m) => m ? ` · ${m > 0 ? '+' : ''}${m} defense` : '';
function featTitle(f) {
  const st = featState(f);
  return `${f.label} · ${POWERS[f.owner]?.label || f.owner}${modText(f.ruined ? 0 : f.mod)}${st === 'building' ? ` · being built, ready after Update ${f.ready}` : st === 'ruined' ? ' · destroyed' : ''}${f.public ? '' : ' · secret'}`;
}
// Smoke and fire: one point cloud each, animated a few times a second while visible.
const SMOKE_VS = 'attribute float aSize; attribute float aAlpha; varying float vA; varying vec3 vC; attribute vec3 color; uniform float uScale; void main(){ vA = aAlpha; vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }';
const SMOKE_FS = 'varying float vA; varying vec3 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard; float a = vA * smoothstep(0.5, 0.1, r); gl_FragColor = vec4(vC, a); }';

/* ---------- Flags (simplified, 1939) ---------- */
const STAR = (cx, cy, r, fill) => { let d = ''; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.42 : r; d += (i ? 'L' : 'M') + (cx + rr * Math.cos(a)).toFixed(2) + ',' + (cy + rr * Math.sin(a)).toFixed(2); } return `<path d="${d}Z" fill="${fill}"/>`; };
const FLAG_SVG = {
  'United Kingdom': '<rect width="30" height="20" fill="#012169"/><path d="M0,0L30,20M30,0L0,20" stroke="#fff" stroke-width="4"/><path d="M0,0L30,20M30,0L0,20" stroke="#C8102E" stroke-width="1.6"/><path d="M15,0V20M0,10H30" stroke="#fff" stroke-width="6"/><path d="M15,0V20M0,10H30" stroke="#C8102E" stroke-width="3.4"/>',
  'France': '<rect width="10" height="20" fill="#0055A4"/><rect x="10" width="10" height="20" fill="#fff"/><rect x="20" width="10" height="20" fill="#EF4135"/>',
  'Germany': '<rect width="30" height="20" fill="#D0141C"/><circle cx="15" cy="10" r="6.6" fill="#fff"/><path d="M11.6,6.6L18.4,13.4M18.4,6.6L11.6,13.4" stroke="#111" stroke-width="2.2" stroke-linecap="square"/>',
  'Poland': '<rect width="30" height="10" fill="#fff"/><rect y="10" width="30" height="10" fill="#DC143C"/>',
  'Italy': '<rect width="10" height="20" fill="#009246"/><rect x="10" width="10" height="20" fill="#fff"/><rect x="20" width="10" height="20" fill="#CE2B37"/><path d="M12.4,6.5H17.6V11.5Q17.6,14 15,15Q12.4,14 12.4,11.5Z" fill="#CE2B37" stroke="#1F4FA0" stroke-width=".8"/><path d="M15,7.5V13.5M13.2,10H16.8" stroke="#fff" stroke-width="1.2"/>',
  'USSR': '<rect width="30" height="20" fill="#CC0000"/>' + STAR(6, 3.6, 1.5, '#FFD700') + '<path d="M4.2,9.6A3,3 0 1 0 8.6,6.6" fill="none" stroke="#FFD700" stroke-width="1.1"/><path d="M4.4,6.4L8.2,10.2M3.7,7.1L5.1,5.7" stroke="#FFD700" stroke-width="1.1"/>',
  'Finland': '<rect width="30" height="20" fill="#fff"/><path d="M11,0V20M0,10H30" stroke="#002F6C" stroke-width="5"/>',
  'United States': '<rect width="30" height="20" fill="#fff"/>' + [0, 2, 4, 6, 8, 10, 12].map(i => `<rect y="${i * 1.54}" width="30" height="1.54" fill="#B22234"/>`).join('') + '<rect width="13" height="10.8" fill="#3C3B6E"/>' + [2, 5, 8, 11].flatMap(x => [2.2, 5.4, 8.6].map(y => `<circle cx="${x}" cy="${y}" r=".75" fill="#fff"/>`)).join(''),
  'Japan': '<rect width="30" height="20" fill="#fff"/><circle cx="15" cy="10" r="6" fill="#BC002D"/>',
};
// Flags for every other country on the map in 1939 (simplified, same 30 x 20 frame as above).
const H3 = (a, b, c) => `<rect width="30" height="20" fill="${a}"/><rect y="6.67" width="30" height="6.67" fill="${b}"/><rect y="13.33" width="30" height="6.67" fill="${c}"/>`;
const V3 = (a, b, c) => `<rect width="10" height="20" fill="${a}"/><rect x="10" width="10" height="20" fill="${b}"/><rect x="20" width="10" height="20" fill="${c}"/>`;
const NORDIC = (bg, cross, edge) => `<rect width="30" height="20" fill="${bg}"/>${edge ? `<path d="M11,0V20M0,10H30" stroke="${edge}" stroke-width="5"/>` : ''}<path d="M11,0V20M0,10H30" stroke="${cross}" stroke-width="${edge ? 2.6 : 3.4}"/>`;
const UNION = '<rect width="15" height="10" fill="#012169"/><path d="M0,0L15,10M15,0L0,10" stroke="#fff" stroke-width="2"/><path d="M0,0L15,10M15,0L0,10" stroke="#C8102E" stroke-width=".8"/><path d="M7.5,0V10M0,5H15" stroke="#fff" stroke-width="3"/><path d="M7.5,0V10M0,5H15" stroke="#C8102E" stroke-width="1.7"/>';
const STRIPES = (n, a, b) => Array.from({ length: n }, (_, i) => `<rect y="${(i * 20 / n).toFixed(2)}" width="30" height="${(20 / n + 0.05).toFixed(2)}" fill="${i % 2 ? b : a}"/>`).join('');
const FLAG_X = {
  'Afghanistan': V3('#111', '#C8102E', '#007A3D'), 'Albania': '<rect width="30" height="20" fill="#E41E20"/><path d="M15,4l4,3-1,4 3,2-3,2-3-2-3,2-3-2 3-2-1-4z" fill="#111"/>',
  'Andorra': V3('#10069F', '#FEDD00', '#D50032'), 'Argentina': H3('#74ACDF', '#fff', '#74ACDF') + '<circle cx="15" cy="10" r="2" fill="#F6B40E"/>',
  'Australia': '<rect width="30" height="20" fill="#012169"/>' + UNION + STAR(7.5, 15, 2.2, '#fff') + STAR(23, 5, 1.2, '#fff') + STAR(20, 10, 1.2, '#fff') + STAR(25, 12, 1.2, '#fff') + STAR(23, 17, 1.2, '#fff'),
  'Belgium': V3('#111', '#FDDA24', '#EF3340'), 'Bhutan': '<path d="M0,20L30,0V20z" fill="#FF4E12"/><path d="M0,0H30L0,20z" fill="#FFD520"/>',
  'Bolivia': H3('#D52B1E', '#F9E300', '#007934'), 'Brazil': '<rect width="30" height="20" fill="#009C3B"/><path d="M15,2L28,10L15,18L2,10z" fill="#FFDF00"/><circle cx="15" cy="10" r="4.2" fill="#002776"/>',
  'Brunei': '<rect width="30" height="20" fill="#F7E017"/><path d="M0,3L30,11V17L0,9z" fill="#fff"/><path d="M0,9L30,17V20H28L0,13z" fill="#111"/>',
  'Bulgaria': H3('#fff', '#00966E', '#D62612'), 'Canada': '<rect width="30" height="20" fill="#C8102E"/>' + UNION + '<rect x="20" y="9" width="4" height="5" fill="#E6D5A8"/>',
  'Chile': '<rect width="30" height="20" fill="#fff"/><rect y="10" width="30" height="10" fill="#D52B1E"/><rect width="10" height="10" fill="#0039A6"/>' + STAR(5, 5, 2.2, '#fff'),
  'China': '<rect width="30" height="20" fill="#FE0000"/><rect width="15" height="10" fill="#000095"/><circle cx="7.5" cy="5" r="2.6" fill="#fff"/><circle cx="7.5" cy="5" r="1.6" fill="#000095"/><circle cx="7.5" cy="5" r="1.2" fill="#fff"/>',
  'Colombia': '<rect width="30" height="20" fill="#FCD116"/><rect y="10" width="30" height="5" fill="#003893"/><rect y="15" width="30" height="5" fill="#CE1126"/>',
  'Costa Rica': '<rect width="30" height="20" fill="#002B7F"/><rect y="3.3" width="30" height="13.4" fill="#fff"/><rect y="6.7" width="30" height="6.6" fill="#CE1126"/>',
  'Cuba': STRIPES(5, '#002A8F', '#fff') + '<path d="M0,0L12,10L0,20z" fill="#CF142B"/>' + STAR(4, 10, 2.4, '#fff'),
  'Denmark': NORDIC('#C8102E', '#fff'), 'Dominican Republic': '<rect width="30" height="20" fill="#fff"/><rect width="13" height="8.5" fill="#002D62"/><rect x="17" width="13" height="8.5" fill="#CE1126"/><rect y="11.5" width="13" height="8.5" fill="#CE1126"/><rect x="17" y="11.5" width="13" height="8.5" fill="#002D62"/>',
  'Ecuador': '<rect width="30" height="20" fill="#FFD100"/><rect y="10" width="30" height="5" fill="#0072CE"/><rect y="15" width="30" height="5" fill="#EF3340"/>',
  'Egypt': '<rect width="30" height="20" fill="#0B8F3A"/><circle cx="14" cy="10" r="5" fill="#fff"/><circle cx="15.6" cy="10" r="4.2" fill="#0B8F3A"/>' + STAR(17.5, 7, 1, '#fff') + STAR(19, 10, 1, '#fff') + STAR(17.5, 13, 1, '#fff'),
  'El Salvador': H3('#0F47AF', '#fff', '#0F47AF'), 'Estonia': H3('#0072CE', '#111', '#fff'),
  'Greece': STRIPES(9, '#0D5EAF', '#fff') + '<rect width="11" height="11.1" fill="#0D5EAF"/><path d="M5.5,0V11.1M0,5.55H11" stroke="#fff" stroke-width="2.2"/>',
  'Guatemala': V3('#4997D0', '#fff', '#4997D0'), 'Haiti': '<rect width="30" height="10" fill="#00209F"/><rect y="10" width="30" height="10" fill="#D21034"/>',
  'Honduras': H3('#0073CF', '#fff', '#0073CF'), 'Hungary': H3('#CE2939', '#fff', '#477050'),
  'Iran': H3('#239F40', '#fff', '#DA0000') + '<circle cx="15" cy="10" r="1.8" fill="#E8B23A"/>', 'Iraq': '<rect width="30" height="20" fill="#fff"/><rect width="30" height="6.67" fill="#111"/><rect y="13.33" width="30" height="6.67" fill="#007A3D"/><path d="M0,0L9,10L0,20z" fill="#CE1126"/>',
  'Ireland': V3('#169B62', '#fff', '#FF883E'), 'Latvia': '<rect width="30" height="20" fill="#9E3039"/><rect y="8" width="30" height="4" fill="#fff"/>',
  'Liberia': STRIPES(11, '#BF0A30', '#fff') + '<rect width="10" height="9.1" fill="#002868"/>' + STAR(5, 4.5, 2.4, '#fff'),
  'Lithuania': H3('#FDB913', '#006A44', '#C1272D'), 'Luxembourg': H3('#EF3340', '#fff', '#00A3E0'),
  'Mexico': V3('#006847', '#fff', '#CE1126') + '<circle cx="15" cy="10" r="2" fill="#8C5A2B"/>', 'Mongolia': '<rect width="30" height="20" fill="#C4272F"/><path d="M6,5h2v10h-2z M5,3h4v1.5h-4z" fill="#F9CF02"/>',
  'Nepal': '<rect width="30" height="20" fill="#DC143C"/><path d="M8,3l8,7h-8l8,7" fill="none" stroke="#003893" stroke-width="1.5"/><circle cx="11" cy="7.5" r="1.4" fill="#fff"/><circle cx="11" cy="14" r="1.6" fill="#fff"/>',
  'Netherlands': H3('#AE1C28', '#fff', '#21468B'), 'New Zealand': '<rect width="30" height="20" fill="#012169"/>' + UNION + STAR(22, 5, 1.3, '#C8102E') + STAR(20, 10, 1.3, '#C8102E') + STAR(25, 9, 1.3, '#C8102E') + STAR(22, 16, 1.4, '#C8102E'),
  'Nicaragua': H3('#0067C6', '#fff', '#0067C6'), 'Norway': NORDIC('#BA0C2F', '#00205B', '#fff'),
  'Panama': '<rect width="30" height="20" fill="#fff"/><rect x="15" width="15" height="10" fill="#DA121A"/><rect y="10" width="15" height="10" fill="#072357"/>' + STAR(7.5, 5, 2, '#072357') + STAR(22.5, 15, 2, '#DA121A'),
  'Paraguay': H3('#D52B1E', '#fff', '#0038A8'), 'Peru': V3('#D91023', '#fff', '#D91023'),
  'Philippines': '<rect width="30" height="10" fill="#0038A8"/><rect y="10" width="30" height="10" fill="#CE1126"/><path d="M0,0L13,10L0,20z" fill="#fff"/><circle cx="4.5" cy="10" r="1.8" fill="#FCD116"/>',
  'Portugal': '<rect width="30" height="20" fill="#DA291C"/><rect width="12" height="20" fill="#046A38"/><circle cx="12" cy="10" r="3.4" fill="#FFE900"/><circle cx="12" cy="10" r="2" fill="#DA291C"/>',
  'Romania': V3('#002B7F', '#FCD116', '#CE1126'), 'Saudi Arabia': '<rect width="30" height="20" fill="#006C35"/><path d="M8,8h14M9,13h12" stroke="#fff" stroke-width="1.2"/>',
  'Siam': '<rect width="30" height="20" fill="#A51931"/><rect y="3.33" width="30" height="13.34" fill="#F4F5F8"/><rect y="6.67" width="30" height="6.66" fill="#2D2A4A"/>',
  'Spain': '<rect width="30" height="20" fill="#AA151B"/><rect y="5" width="30" height="10" fill="#F1BF00"/>', 'Sweden': NORDIC('#006AA7', '#FECC00'),
  'Switzerland': '<rect width="30" height="20" fill="#DA291C"/><path d="M15,5V15M10,10H20" stroke="#fff" stroke-width="3"/>',
  'Tibet': '<rect width="30" height="20" fill="#C8102E"/><path d="M15,13L0,0H8zM15,13L22,0H30zM15,13L30,10V20zM15,13L0,10V20z" fill="#00349C"/><path d="M8,20L15,10L22,20z" fill="#fff"/><circle cx="15" cy="8" r="2.6" fill="#FFD100"/>',
  'Turkey': '<rect width="30" height="20" fill="#E30A17"/><circle cx="11" cy="10" r="5" fill="#fff"/><circle cx="12.3" cy="10" r="4" fill="#E30A17"/>' + STAR(17, 10, 2.2, '#fff'),
  'Union of South Africa': H3('#E77817', '#fff', '#00247D'), 'Uruguay': STRIPES(9, '#fff', '#0038A8') + '<rect width="11" height="11.1" fill="#fff"/><circle cx="5.5" cy="5.5" r="3" fill="#FCD116"/>',
  'Venezuela': H3('#FFCC00', '#00247D', '#CF142B'), 'Yemen': '<rect width="30" height="20" fill="#C8102E"/><path d="M8,10h14" stroke="#fff" stroke-width="1.5"/>',
  'Yugoslavia': H3('#0C4076', '#fff', '#C6363C'),
};
// Map names that fly another country's flag (colonies, mandates, puppet or renamed states).
const FLAG_ALIAS = {
  'Belgian Congo': 'Belgium', 'Burundi': 'Belgium', 'Rwanda': 'Belgium', 'Chinese warlords': 'China', 'Xinjiang': 'China', 'Dutch East Indies': 'Netherlands', 'Suriname': 'Netherlands',
  'Cambodia': 'France', 'French Somaliland': 'France', 'Laos': 'France', 'Cochin China': 'France', 'Togo': 'France', 'French Guiana': 'France', 'Guadeloupe': 'France',
  'Equatorial Guinea': 'Spain', 'Rio De Oro': 'Spain', 'Spanish Sahara': 'Spain', 'Guinea-Bissau': 'Portugal', 'Angola': 'Portugal', 'Mozambique': 'Portugal',
  'Puerto Rico': 'United States', 'Hejaz': 'Saudi Arabia', 'Hail': 'Saudi Arabia', "Emirate of Bin Shal'an": 'Saudi Arabia', 'Samoa': 'New Zealand',
  'Bahamas': 'United Kingdom', 'Belize': 'United Kingdom', 'Ceylon': 'United Kingdom', 'Fiji': 'United Kingdom', 'Gambia, The': 'United Kingdom', 'Guyana': 'United Kingdom', 'Jamaica': 'United Kingdom',
  'Malawi': 'United Kingdom', 'Sudan': 'United Kingdom', 'Trinidad': 'United Kingdom', 'Dominion of Newfoundland': 'United Kingdom', 'India': 'United Kingdom', 'Israel': 'United Kingdom',
  'Mesopotamia': 'Iraq', 'Libya': 'Italy',
};
function flagKeyOf(name) { const o = ownerOf(name); if (FLAG_SVG[o]) return o; const a = FLAG_ALIAS[name]; if (a) return FLAG_SVG[a] ? a : FLAG_X[a] ? a : null; return FLAG_X[name] ? name : null; }
// Flags drawn straight onto the map canvases (parsed once from the SVG above; drawing SVG images would block WebGL in some browsers).
const FLAG_OPS = {};
function flagOps(owner) {
  if (FLAG_OPS[owner]) return FLAG_OPS[owner];
  const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${FLAG_SVG[owner] || FLAG_X[owner] || ''}</svg>`, 'image/svg+xml');
  return (FLAG_OPS[owner] = [...doc.documentElement.children].map((e) => { const a = (k, d) => e.getAttribute(k) ?? d; const t = e.tagName;
    const path = t === 'rect' ? (() => { const p = new Path2D(); p.rect(+a('x', 0), +a('y', 0), +a('width', 0), +a('height', 0)); return p; })() : t === 'circle' ? (() => { const p = new Path2D(); p.arc(+a('cx', 0), +a('cy', 0), +a('r', 0), 0, Math.PI * 2); return p; })() : new Path2D(a('d', ''));
    return { path, fill: a('fill', t === 'path' ? null : '#000'), stroke: a('stroke', null), sw: +a('stroke-width', 1), cap: a('stroke-linecap', 'butt') }; }));
}
function drawFlag(ctx, owner, x, y, w, h) {
  ctx.save(); ctx.translate(x, y); ctx.scale(w / 30, h / 20);
  for (const o of flagOps(owner)) { if (o.fill && o.fill !== 'none') { ctx.fillStyle = o.fill; ctx.fill(o.path); } if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = o.sw; ctx.lineCap = o.cap; ctx.stroke(o.path); } }
  ctx.restore();
}
// One flag for each piece of land, clipped to the country's outline. The width is corrected for latitude, since
// the map is stretched sideways toward the poles, so every flag keeps its real 3:2 shape on the globe.
function flagFill(ctx, owner, rings, X, Y, alpha) {
  const all = () => { ctx.beginPath(); for (const r of rings) { r.forEach(([lo, la], i) => (i ? ctx.lineTo(X(lo), Y(la)) : ctx.moveTo(X(lo), Y(la)))); ctx.closePath(); } };
  const cosAt = (la) => Math.max(0.25, Math.cos(la * Math.PI / 180));
  for (const ring of rings) {
    let lo0 = 1e9, la0 = 1e9, lo1 = -1e9, la1 = -1e9; for (const [lo, la] of ring) { if (lo < lo0) lo0 = lo; if (lo > lo1) lo1 = lo; if (la < la0) la0 = la; if (la > la1) la1 = la; }
    const bw = lo1 - lo0, bh = la1 - la0; if (bw <= 0 || bh <= 0) continue; const mid = (la0 + la1) / 2, c = cosAt(mid);
    const h = Math.max(bh, bw * c / 1.5), w = h * 1.5 / c; const x0 = lo0 + (bw - w) / 2, top = mid + h / 2;
    ctx.save(); all(); ctx.clip('evenodd'); ctx.beginPath(); ring.forEach(([lo, la], i) => (i ? ctx.lineTo(X(lo), Y(la)) : ctx.moveTo(X(lo), Y(la)))); ctx.closePath(); ctx.clip();
    ctx.globalAlpha = alpha; drawFlag(ctx, owner, X(x0), Y(top), X(x0 + w) - X(x0), Y(top - h) - Y(top)); ctx.restore();
  }
}
const flag = (owner, cls = 'fl') => `<svg class="${cls}" viewBox="0 0 30 20" preserveAspectRatio="none" aria-hidden="true">${FLAG_SVG[ownerOf(owner)] || `<rect width="30" height="20" fill="${colorOf(owner)}"/>`}</svg>`;
const D2R = Math.PI / 180;
const UNIT_SCALE = 0.00357; // size of the 3D unit figures on the globe
const PROP_K = UNIT_SCALE / 0.0105; // trenches, forts, factories and their smoke shrink with the units
const toVec = (lon, lat, r = 1) => new THREE.Vector3(r * Math.cos(lat * D2R) * Math.cos(lon * D2R), r * Math.sin(lat * D2R), -r * Math.cos(lat * D2R) * Math.sin(lon * D2R));

function inRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function regionAt(lon, lat) { for (const [id, g] of Object.entries(RSHAPE)) { let c = 0; for (const r of g.r) if (inRing(lon, lat, r)) c++; if (c % 2) return id; } return null; }
function countryAt(lon, lat) {
  for (const [n, g] of Object.entries(A.geo)) { let c = 0; for (const r of g.r) if (inRing(lon, lat, r)) c++; if (c % 2) return n; }
  for (const [n, rings] of Object.entries(A.wgeo)) for (const r of rings) if (inRing(lon, lat, r)) return n;
  return null;
}

class Globe {
  constructor(stage, overlay, opts) {
    this.stage = stage; this.ov = overlay; this.opts = opts;
    this.view = { lon: opts.lon ?? 15, lat: (opts.lat ?? 49) + 2.5, dist: opts.dist ?? 1.42, heading: 0, tilt: 0.42 }; this.home = { ...this.view };
    if (process.env.NODE_ENV !== 'production') window.__globe = this; // lets local tests aim the camera
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x05070d);
    stage.prepend(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.002, 50);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6)); this.scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a3020, 0.45));
    const sun = new THREE.DirectionalLight(0xfff4e0, 0.75); sun.position.copy(toVec(0, 62, 5)); this.scene.add(sun);
    this.addStars(); this.addAtmosphere();
    this.dirty = true; this.selected = null;
    new ResizeObserver(() => this.resize()).observe(stage); this.resize();
    this.bindInput();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Draw only when something changed. The clouds drift too slowly to need more than a few frames a second,
    // and on-map labels only need repositioning when the camera or units move.
    let lastCloud = -1e9, lastFx = -1e9;
    const loop = (t = 0) => {
      let cloudOnly = false;
      // Glide toward the zoom target: eases in quickly, then settles a moment after the wheel stops.
      if (this.zt != null) {
        const dt = Math.min(64, Math.max(0, t - (this._zl ?? t))); const d = this.zt - this.view.dist;
        if (reduce || Math.abs(d) < 0.0003) { this.view.dist = this.zt; this.zt = null; } else this.view.dist += d * (1 - Math.exp(-dt / 130));
        this.dirty = true;
      }
      this._zl = t;
      if (this.clouds && !reduce && t - lastCloud > 200) { this.clouds.rotation.y = t * 0.000004; lastCloud = t; cloudOnly = !this.dirty; }
      if (this.fx && SHOW_FEAT && !reduce && this.view.dist < 2.4 && t - lastFx > 66 && !document.hidden) { this.stepFx(t); lastFx = t; cloudOnly = cloudOnly || !this.dirty; }
      if (this.dirty || cloudOnly) { this.render(!cloudOnly); this.dirty = false; }
      this.raf = requestAnimationFrame(loop);
    }; loop();
  }
  addStars() {
    const g = new THREE.BufferGeometry(); const n = 1800; const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(20 + Math.random() * 10); p.set([v.x, v.y, v.z], i * 3); }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    this.scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xbfcbe6, size: 0.05, sizeAttenuation: true, transparent: true, opacity: 0.8 })));
  }
  addAtmosphere() {
    const mat = new THREE.ShaderMaterial({
      transparent: true, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec3 vN; void main(){ float i = pow(clamp(0.78 - dot(vN, vec3(0.0,0.0,1.0)), 0.0, 1.0), 2.2); gl_FragColor = vec4(0.55,0.75,1.0,1.0) * i * 1.4; }',
    });
    this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.028, 128, 96), mat));
  }
  setTextures(world, patchCanvas, topo) {
    const wt = new THREE.CanvasTexture(worldBase()); this.worldTex = wt; wt.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const wspec = new THREE.Texture(imgs.wwater); wspec.needsUpdate = true;
    const base = new THREE.Mesh(new THREE.SphereGeometry(1, 192, 144), new THREE.MeshPhongMaterial({ map: wt, specularMap: wspec, shininess: 18, specular: 0x1c2638 }));
    this.scene.add(base); this.base = base;
    this.patchTex = new THREE.CanvasTexture(patchCanvas); this.patchTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const bump = new THREE.Texture(topo); bump.needsUpdate = true;
    const pspec = new THREE.Texture(imgs.water); pspec.needsUpdate = true;
    const geo = new THREE.SphereGeometry(1.0008, 360, 220, (LON0 + 180) * D2R, (LON1 - LON0) * D2R, (90 - LAT1) * D2R, (LAT1 - LAT0) * D2R);
    this.patch = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ map: this.patchTex, bumpMap: bump, bumpScale: 0.02, specularMap: pspec, shininess: 18, specular: 0x1c2638, transparent: true }));
    this.scene.add(this.patch);
    // Light layers: occupation and selection over Europe, fog over the world (delegates only).
    this.occCanvas = document.createElement('canvas'); this.occCanvas.width = OW; this.occCanvas.height = OH; paintOccupation(this.occCanvas, null);
    this.occTex = new THREE.CanvasTexture(this.occCanvas); this.occTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const ogeo = new THREE.SphereGeometry(1.0012, 360, 220, (LON0 + 180) * D2R, (LON1 - LON0) * D2R, (90 - LAT1) * D2R, (LAT1 - LAT0) * D2R);
    this.scene.add(new THREE.Mesh(ogeo, new THREE.MeshLambertMaterial({ map: this.occTex, transparent: true, depthWrite: false })));
    if (this.opts.fog) {
      this.fogCanvas = document.createElement('canvas'); this.fogCanvas.width = FW; this.fogCanvas.height = FH; paintFogLayer(this.fogCanvas);
      this.fogTex = new THREE.CanvasTexture(this.fogCanvas);
      this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.0018, 192, 144), new THREE.MeshBasicMaterial({ map: this.fogTex, transparent: true, depthWrite: false })));
    }
    const ca = new THREE.Texture(imgs.clouds); ca.needsUpdate = true;
    this.clouds = new THREE.Mesh(new THREE.SphereGeometry(1.012, 128, 96), new THREE.MeshLambertMaterial({ color: 0xffffff, alphaMap: ca, transparent: true, opacity: 0.32, depthWrite: false }));
    this.scene.add(this.clouds);
    this.stage.querySelector('.loading')?.remove();
    this.addUnits(); this.addLights(); this.buildOverlay(); this.addPins(); this.addProps(); this.dirty = true;
  }
  addProps() {
    if (this.propGroup) { this.scene.remove(this.propGroup); this.propGroup.traverse((o) => o.isMesh && o.geometry.dispose()); }
    this.propGroup = new THREE.Group(); this.propGroup.visible = SHOW_FEAT; this.scene.add(this.propGroup);
    const emit = []; const SPACING = 0.85 * PROP_K;
    for (const f of FEATS) {
      const line = f.to && FEAT[f.kind]?.line; const pts = [];
      if (line) { const d = Math.hypot(f.to[0] - f.at[0], f.to[1] - f.at[1]); const n = Math.max(1, Math.min(40, Math.round(d / SPACING))); for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; pts.push([f.at[0] + (f.to[0] - f.at[0]) * t, f.at[1] + (f.to[1] - f.at[1]) * t]); } }
      else pts.push(f.at);
      for (const [lo, la] of pts) {
        const pr = makeProp(f); pr.userData.heading = line ? 0 : 0.6; this.place(pr, lo, la); pr.scale.setScalar((line ? 0.0078 : 0.0095) * PROP_K);
        if (line) { const n = pr.position.clone().normalize(); const d = toVec(f.to[0], f.to[1], 1).sub(toVec(f.at[0], f.at[1], 1)); d.addScaledVector(n, -d.dot(n)).normalize(); const vz = new THREE.Vector3(0, 0, 1).applyQuaternion(pr.quaternion); pr.rotateY(Math.atan2(n.dot(vz.clone().cross(d)), vz.dot(d))); }
        this.propGroup.add(pr); pr.updateMatrixWorld(true);
        const east = new THREE.Vector3(-Math.sin(lo * D2R), 0, -Math.cos(lo * D2R));
        for (const e of pr.userData.em) emit.push({ type: e.type, pos: new THREE.Vector3(e.x, e.y, e.z).applyMatrix4(pr.matrixWorld), n: pr.position.clone().normalize(), east });
      }
    }
    this.setEmitters(emit); this.addFeatTags(); this.dirty = true;
  }
  setEmitters(list) {
    if (this.fx) { this.scene.remove(this.fx.pts); this.fx.pts.geometry.dispose(); this.fx = null; }
    if (!list.length) return;
    const PER = 10, N = list.length * PER; const g = new THREE.BufferGeometry();
    for (const [k, n] of [['position', 3], ['color', 3], ['aSize', 1], ['aAlpha', 1]]) g.setAttribute(k, new THREE.BufferAttribute(new Float32Array(N * n), n));
    const m = new THREE.ShaderMaterial({ uniforms: { uScale: { value: this.fxScale || 600 } }, vertexShader: SMOKE_VS, fragmentShader: SMOKE_FS, transparent: true, depthWrite: false });
    const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.visible = SHOW_FEAT; pts.renderOrder = 2; this.scene.add(pts);
    this.fx = { pts, list, PER }; this.stepFx(performance.now());
  }
  stepFx(t) {
    const { pts, list, PER } = this.fx; const A = pts.geometry.attributes; const T = t / 1000, k = 0.0095 * PROP_K; const v = new THREE.Vector3();
    pts.material.uniforms.uScale.value = this.fxScale || 600;
    list.forEach((e, i) => {
      const fire = e.type === 'fire' || e.type === 'camp', small = e.type === 'camp';
      for (let j = 0; j < PER; j++) {
        const ix = i * PER + j; const ph = (T * (fire ? 0.9 : 0.28) + j / PER + i * 0.137) % 1; const wob = Math.sin((j + 1) * 12.9898 + i) * 0.35;
        const rise = fire ? (small ? 0.35 : 0.8) * ph : 3.2 * ph, drift = ph * ph * (fire ? 0.2 : 1.6);
        v.copy(e.pos).addScaledVector(e.n, rise * k).addScaledVector(e.east, (drift + wob * ph) * k);
        A.position.setXYZ(ix, v.x, v.y, v.z);
        if (fire) { A.aSize.setX(ix, (small ? 0.25 : 0.6) * (1.1 - ph) * k); A.aAlpha.setX(ix, 0.95 * (1 - ph)); A.color.setXYZ(ix, 1, 0.85 - ph * 0.6, 0.35 - ph * 0.3); }
        else { const black = e.type === 'black'; A.aSize.setX(ix, (0.45 + ph * 1.7) * k); A.aAlpha.setX(ix, (black ? 0.7 : 0.5) * (1 - ph) * Math.min(1, ph * 5)); const c = black ? 0.13 + ph * 0.2 : 0.78 + ph * 0.1; A.color.setXYZ(ix, c, c, c * 1.02); }
      }
    });
    A.position.needsUpdate = A.aSize.needsUpdate = A.aAlpha.needsUpdate = A.color.needsUpdate = true;
  }
  addFeatTags() {
    if (!this.ov) return;
    this.items = (this.items || []).filter((it) => { if (it.kind === 'feat') { it.el.remove(); return false; } return true; });
    return; // map objects are figurines only; click the model to see what it is
    for (const f of FEATS) {
      const st = featState(f); const d = document.createElement('button'); d.type = 'button'; d.className = `feat ${st}${f.public ? '' : ' secret'}`; d.hidden = !SHOW_FEAT;
      d.title = featTitle(f); d.setAttribute('aria-label', featTitle(f)); d.style.setProperty('--fc', POWERS[f.owner]?.color || '#999');
      d.innerHTML = `${fIcon(f.kind)}<span>${esc(f.label)}${st === 'building' ? ` · Update ${f.ready}` : ''}</span>`;
      d.addEventListener('click', (e) => { e.stopPropagation(); if (this.opts.onFeature) this.opts.onFeature(f.id); else toast(featTitle(f)); });
      const at = f.to && FEAT[f.kind]?.line ? [(f.at[0] + f.to[0]) / 2, (f.at[1] + f.to[1]) / 2] : f.at;
      this.ov.appendChild(d); this.items.push({ el: d, lon: at[0], lat: at[1], kind: 'feat' });
    }
    this.dirty = true;
  }
  setFeatVisible(on) {
    if (this.propGroup) this.propGroup.visible = on; if (this.fx) this.fx.pts.visible = on;
    (this.items || []).forEach((it) => { if (it.kind === 'feat') it.el.hidden = !on; }); this.dirty = true;
  }
  // Draw the room's eye to something new: a pulse, and a short glide if it is off screen.
  pulse(at, label) {
    const d = document.createElement('div'); d.className = 'pulse'; d.innerHTML = `<i></i>${label ? `<b>${esc(label)}</b>` : ''}`; this.ov.appendChild(d);
    const it = { el: d, lon: at[0], lat: at[1], kind: 'pulse' }; this.items.push(it); this.dirty = true;
    setTimeout(() => { d.remove(); this.items = this.items.filter((x) => x !== it); }, 6000);
    const p = this.project(at[0], at[1]); const off = !p.ok || p.x < 60 || p.y < 60 || p.x > this._w - 60 || p.y > this._h - 60;
    if (off && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const v = this.view, from = { lon: v.lon, lat: v.lat }, to = { lon: at[0], lat: at[1] + 2.5 }; let dl = to.lon - from.lon; if (dl > 180) dl -= 360; if (dl < -180) dl += 360; const t0 = performance.now();
      const step = (now) => { let k = Math.min(1, (now - t0) / 1600); k = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; v.lon = from.lon + dl * k; v.lat = from.lat + (to.lat - from.lat) * k; this.dirty = true; if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }
  }
  addLights() {
    // Glowing city lights: additive sprites in each country's color, with a white-hot core.
    const tex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const core = g.createRadialGradient(32, 32, 0, 32, 32, 11); core.addColorStop(0, '#fff'); core.addColorStop(0.6, 'rgba(255,255,255,0.9)'); core.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = core; g.beginPath(); g.arc(32, 32, 11, 0, Math.PI * 2); g.fill(); return new THREE.CanvasTexture(c); })();
    const seen = (lo, la, o) => !this.opts.fog || ALLIES.includes(ownerOf(o)) || AGENTS.some(a => { const c = a.at || CAPITAL[a.target]; return c && Math.hypot(c[0] - lo, c[1] - la) < 2.4; });
    const make = (pts, size) => {
      const pos = [], col = []; const c = new THREE.Color();
      for (const [lo, la, w, o] of pts) { if (!seen(lo, la, o)) continue; const v = toVec(lo, la, 1.0025); pos.push(v.x, v.y, v.z); c.set(worldColor(o || '')).lerp(new THREE.Color(0xffffff), 0.15).multiplyScalar(w); col.push(c.r, c.g, c.b); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      return new THREE.Points(g, new THREE.PointsMaterial({ size, map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: false }));
    };
    if (this.lights) this.lights.forEach(l => { this.scene.remove(l); l.geometry.dispose(); });
    const towns = A.towns.concat(A.wtowns).map(([lo, la, v, o]) => [lo, la, 0.8 + (v - 70) / 185 * 0.7, o]);
    const caps = Object.values(CITIES).map(([lo, la]) => [lo, la, 1.6, countryAt(lo, la)]);
    const pr = this.renderer.getPixelRatio(); this.lights = [make(towns, 13 * pr), make(caps, 30 * pr)]; this.lights.forEach(l => this.scene.add(l));
  }
  addUnits() {
    this.unitGroup = new THREE.Group(); this.scene.add(this.unitGroup); this.figs = {};
    const Y = new THREE.Vector3(0, 1, 0);
    for (const u of UNITS) {
      const f = makeFigure(u); const [lo, la] = this.posOf(u); this.place(f, lo, la);
      f.scale.setScalar(UNIT_SCALE); this.unitGroup.add(f); this.figs[u.id] = f;
    }
  }
  // The projector shows where the room believes units are; delegate laptops show true positions.
  posOf(u) { return u.at; }
  place(f, lon, lat) {
    const Y = new THREE.Vector3(0, 1, 0); const n = toVec(lon, lat, 1).normalize();
    f.position.copy(n).multiplyScalar(1.0015); f.quaternion.setFromUnitVectors(Y, n);
    const north = new THREE.Vector3(0, 1, 0).sub(n.clone().multiplyScalar(n.y)).normalize();
    const localNorth = north.clone().applyQuaternion(f.quaternion.clone().invert());
    f.rotateY(Math.atan2(localNorth.x, localNorth.z) + Math.PI + (f.userData.heading || 0));
  }
  animateUnit(id, from, to, ms = 3200) {
    const f = this.figs?.[id]; if (!f) return; const it = this.items?.find(x => x.kind === 'tok' && x.id === id);
    let dlon = to[0] - from[0]; if (dlon > 180) dlon -= 360; if (dlon < -180) dlon += 360;
    const t0 = performance.now(); const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const step = (now) => {
      let k = reduce ? 1 : Math.min(1, (now - t0) / ms); k = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const lo = from[0] + dlon * k, la = from[1] + (to[1] - from[1]) * k;
      this.place(f, lo, la); if (it) { it.lon = lo; it.lat = la; } this.dirty = true;
      if (k < 1) requestAnimationFrame(step); else this.onMoved?.(id);
    };
    requestAnimationFrame(step);
  }
  // Follow new server state: rebuild figures when units change, glide them when they move.
  sync(prev) {
    if (!this.figs) return;
    const ids = UNITS.map((u) => u.id).sort().join(), old = Object.keys(this.figs).sort().join();
    const changed = !prev || ids !== old || UNITS.some((u) => prev[u.id] && (prev[u.id].str !== u.str || prev[u.id].spotted !== u.spotted));
    // Units that vanished were destroyed: sink or burst them before the rebuild drops them.
    if (prev) for (const id of Object.keys(this.figs)) if (!UNITS.some((u) => u.id === id)) this.killFigure(id, prev[id]);
    if (changed) { this.rebuild(); this.markSelected(this.selectedUnit); }
    if (prev) for (const u of UNITS) { const p = prev[u.id]; if (p && (p.at[0] !== u.at[0] || p.at[1] !== u.at[1])) this.animateUnit(u.id, p.at, u.at); }
  }
  killFigure(id, u) {
    const f = this.figs[id]; if (!f) return; this.unitGroup.remove(f); this.scene.add(f); delete this.figs[id];
    if (u) {
      const p = this.project(u.at[0], u.at[1], 0.01);
      if (p.ok) { const b = document.createElement('div'); b.className = 'boom' + (u.kind === 'fleet' ? ' sink' : ''); b.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`; b.innerHTML = `<i></i><span>${u.kind === 'fleet' ? 'Sunk' : u.kind === 'air' ? 'Shot down' : 'Destroyed'}</span>`; this.ov.appendChild(b); setTimeout(() => b.remove(), 2600); }
    }
    const t0 = performance.now(), s0 = f.scale.x, n = f.position.clone().normalize(), p0 = f.position.clone();
    const step = (now) => { const k = Math.min(1, (now - t0) / 1400); f.scale.setScalar(s0 * (1 - k)); f.position.copy(p0).addScaledVector(n, -0.004 * k); this.dirty = true; if (k < 1) requestAnimationFrame(step); else this.scene.remove(f); };
    requestAnimationFrame(step);
  }
  rebuild() {
    if (this.unitGroup) this.scene.remove(this.unitGroup);
    this.addUnits(); this.buildOverlay(); this.addPins(); this.dirty = true;
  }
  addPins() {
    if (!this.ov) return;
    this.items = (this.items || []).filter(it => { if (it.kind === 'pin') { it.el.remove(); return false; } return true; });
    for (const m of MARKERS) {
      const d = document.createElement('div'); d.className = 'pin opmark' + (m.public ? '' : ' secret');
      d.innerHTML = `${flag(m.owner)}<b>${String(m.label).replace(/[<>&]/g, '')}</b>`; d.title = m.public ? 'Operation' : 'Secret operation (only your side sees this)';
      this.ov.appendChild(d); this.items.push({ el: d, lon: m.at[0], lat: m.at[1], kind: 'pin' });
    }
    if (this.pick) { const d = document.createElement('div'); d.className = 'pin pickpin'; d.innerHTML = `<b>${this.pick.label}</b>`; this.ov.appendChild(d); this.items.push({ el: d, lon: this.pick.at[0], lat: this.pick.at[1], kind: 'pin' }); }
    if (!this.opts.pins) { this.dirty = true; return; }
    if (this.spyGroup) { this.scene.remove(this.spyGroup); this.spyGroup.traverse((o) => o.isMesh && o.geometry.dispose()); }
    this.spyGroup = new THREE.Group(); this.scene.add(this.spyGroup);
    AGENTS.forEach((a, i) => {
      const c = a.at || CAPITAL[a.target]; if (!c) return; const fig = spyFigure(); bakeFigure(fig, null);
      const text = `${a.owner ? a.owner + "'s agent" : 'Your agent'} in ${POWERS[a.target]?.label || a.target}${a.mission ? ': ' + a.mission : ''}. Reveals forces nearby and can intercept notes.`;
      fig.traverse((o) => { if (o.isMesh) o.userData.spy = text; });
      this.place(fig, c[0] + 0.35 + (i % 3) * 0.25, c[1] - 0.25 - Math.floor(i / 3) * 0.25); fig.scale.setScalar(UNIT_SCALE * 1.1); this.spyGroup.add(fig);
    });
    this.dirty = true;
  }
  markSelected(id) {
    for (const [k, f] of Object.entries(this.figs || {})) f.traverse(o => { if (o.name === 'sel') o.visible = k === id; });
    this.dirty = true;
  }
  refreshTexture() { if (this.patchTex) { this.patchTex.needsUpdate = true; this.dirty = true; } }
  repaintOcc(sel) { if (!this.occCanvas) return; paintOccupation(this.occCanvas, sel); this.occTex.needsUpdate = true; this.dirty = true; }
  repaintFog() { if (!this.fogCanvas) return; paintFogLayer(this.fogCanvas); this.fogTex.needsUpdate = true; this.dirty = true; }
  resize() {
    const w = this.stage.clientWidth, h = this.stage.clientHeight; if (!w || !h) return;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.dirty = true;
    this.fxScale = h * this.renderer.getPixelRatio() / (2 * Math.tan(this.camera.fov * D2R / 2));
  }
  placeCamera() {
    // Orbit camera: look at a point on the surface from a set height, heading and tilt.
    const v = this.view; const h = v.dist - 1; const T = toVec(v.lon, v.lat, 1); const n = T.clone().normalize();
    const north = new THREE.Vector3(0, 1, 0).addScaledVector(n, -n.y).normalize();
    const east = new THREE.Vector3(-Math.sin(v.lon * D2R), 0, -Math.cos(v.lon * D2R));
    const fwd = north.clone().multiplyScalar(Math.cos(v.heading)).addScaledVector(east, Math.sin(v.heading));
    const t = Math.min(1.3, v.tilt + (h < 0.25 ? (0.25 - h) * 3.2 : 0)); const r = h * 1.05;
    const eye = T.clone().addScaledVector(n, r * Math.cos(t)).addScaledVector(fwd, -r * Math.sin(t));
    this.camera.position.copy(eye); this.camera.up.copy(n); this.camera.lookAt(T);
  }
  render(full = true) {
    if (this.clouds) this.clouds.material.opacity = Math.max(0, Math.min(0.32, (this.view.dist - 1.25) * 0.5));
    if (full) this.placeCamera();
    this.renderer.render(this.scene, this.camera);
    if (full) this.layout();
  }
  project(lon, lat, lift = 0) {
    const r = 1.001 + lift, cl = Math.cos(lat * D2R);
    const p = (this._pv = this._pv || new THREE.Vector3()).set(r * cl * Math.cos(lon * D2R), r * Math.sin(lat * D2R), -r * cl * Math.sin(lon * D2R));
    const n = (this._nv = this._nv || new THREE.Vector3()).copy(p).normalize();
    const facing = n.dot((this._dv = this._dv || new THREE.Vector3()).copy(this.camera.position).sub(p).normalize());
    p.project(this.camera);
    return { x: (p.x + 1) / 2 * this._w, y: (1 - p.y) / 2 * this._h, ok: facing > 0.12 && p.z < 1 };
  }
  buildOverlay() {
    this.ov.innerHTML = ''; this.items = [];
    const scale = (base) => base;
    const WL = { ...Object.fromEntries(Object.entries(A.wlabels).filter(([n]) => !LABELS[n] && !SKIP_WORLD.has(n))), ...LABELS };
    for (const [n, [lo, la, s]] of Object.entries(WL)) {
      if (!A.geo[n] && !A.wgeo[n]) continue; const d = document.createElement('div'); d.className = 'lbl'; d.textContent = LABEL_TEXT[n] || n; d.dataset.size = s;
      this.ov.appendChild(d); this.items.push({ el: d, lon: lo, lat: la, size: s, kind: 'lbl' });
    }
    for (const c of Object.values(S.CITY)) {
      const d = document.createElement('button'); d.type = 'button'; d.className = 'city' + (c.capital ? ' cap' : '') + (c.port ? ' port' : ''); d.textContent = c.name; d.title = `${c.name}: click for details`;
      d.addEventListener('click', (e) => { e.stopPropagation(); showCity(c.name); });
      this.ov.appendChild(d); this.items.push({ el: d, lon: c.at[0], lat: c.at[1], kind: 'city', major: c.major });
    }
    for (const u of UNITS) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'tok'; b.dataset.id = u.id;
      b.setAttribute('aria-label', `${u.name}, ${POWERS[u.owner].label}, ${S.realText(u)}`);
      const est = this.opts.fog && !ALLIES.includes(u.owner);
      if (est) { b.classList.add('spotted'); b.title = u.spotted || 'Spotted'; b.setAttribute('aria-label', `${u.name}, ${POWERS[u.owner].label}, estimated ${S.realText(u)}. ${u.spotted || ''}`); }
      b.innerHTML = `${flag(u.owner)}<b class="num">${est ? '~' : ''}${S.realShort(u)}</b>`;
      if (this.opts.onUnit) b.addEventListener('click', (e) => { e.stopPropagation(); this.opts.onUnit(u.id); });
      this.ov.appendChild(b); const [plo, pla] = this.posOf(u); this.items.push({ el: b, lon: plo, lat: pla, kind: 'tok', id: u.id, air: u.kind === 'air' });
    }
  }
  layout() {
    if (!this.items) return;
    this._w = this.stage.clientWidth; this._h = this.stage.clientHeight;
    const zoom = Math.min(2.2, 0.42 / Math.max(0.04, this.view.dist - 1) ); const w = this._w; const k = Math.max(0.7, Math.min(1.6, w / 1200)) * zoom;
    const SHIFT = { lbl: 'translate(-50%, -50%)', city: 'translate(6px, -100%)', tok: 'translate(-50%, -50%)', pin: 'translate(-50%, -100%)', feat: 'translate(-50%, -50%)', pulse: 'translate(-50%, -50%)' };
    const bigFeat = zoom > 1.05; if (bigFeat !== this._bigFeat) { this._bigFeat = bigFeat; this.ov.classList.toggle('feat-big', bigFeat); }
    for (const it of this.items) {
      const p = this.project(it.lon, it.lat, it.kind === 'tok' ? (it.air ? 0.026 : 0.019) * UNIT_SCALE / 0.0105 : it.kind === 'feat' ? 0.012 * PROP_K : 0);
      let show = p.ok;
      if (show && it.kind === 'city' && !it.major && zoom < 1.0) show = false;
      if (show !== it._show) { it.el.style.display = show ? '' : 'none'; it._show = show; }
      if (!show) continue;
      const x = Math.round(p.x * 2) / 2, y = Math.round(p.y * 2) / 2;
      if (x !== it._x || y !== it._y) { it.el.style.transform = `translate3d(${x}px, ${y}px, 0) ${SHIFT[it.kind]}`; it._x = x; it._y = y; }
      if (it.kind === 'lbl') { const fs = Math.max(9, it.size * k).toFixed(1); if (fs !== it._fs) { it.el.style.fontSize = fs + 'px'; it._fs = fs; } }
      if (it.kind === 'tok') { const sel = this.selectedUnit === it.id; if (sel !== it._sel) { it.el.classList.toggle('sel', sel); it._sel = sel; } }
    }
  }
  bindInput() {
    const c = this.renderer.domElement; let drag = null;
    // Left drag turns and tilts the camera. Right drag (or one finger on touch) moves across the map.
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => {
      const pan = e.button === 2 || e.pointerType === 'touch' || e.shiftKey;
      drag = { x: e.clientX, y: e.clientY, lon: this.view.lon, lat: this.view.lat, heading: this.view.heading, tilt: this.view.tilt, pan, button: e.button, moved: false };
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', (e) => {
      if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      const v = this.view;
      if (drag.pan) {
        const k = 52 * (v.dist - 0.98) / 0.62 / Math.max(300, this.stage.clientWidth);
        const s = Math.sin(v.heading), co = Math.cos(v.heading);
        const dN = (dx * s + dy * co) * k, dE = (-dx * co + dy * s) * k;
        v.lat = Math.max(-65, Math.min(72, drag.lat + dN)); v.lon = ((drag.lon + dE / Math.max(0.25, Math.cos(v.lat * D2R)) + 540) % 360) - 180;
      } else {
        v.heading = drag.heading - dx * 0.004; v.tilt = Math.max(0, Math.min(1.15, drag.tilt + dy * 0.004));
      }
      this.dirty = true;
    });
    c.addEventListener('pointerup', (e) => {
      if (drag && !drag.moved && drag.button === 0 && (this.opts.onCountry || this.opts.onUnit)) {
        const r = c.getBoundingClientRect(); const m = new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        const ray = new THREE.Raycaster(); ray.setFromCamera(m, this.camera);
        const uh = this.unitGroup && ray.intersectObject(this.unitGroup, true)[0];
        if (uh && this.opts.onUnit) { this.opts.onUnit(uh.object.userData.unitId); drag = null; return; }
        const fh = this.propGroup?.visible && ray.intersectObject(this.propGroup, true)[0];
        if (fh?.object.userData.featId) { const id = fh.object.userData.featId; if (this.opts.onFeature) this.opts.onFeature(id); else { const f = FEATS.find((x) => x.id === id); if (f) toast(featTitle(f)); } drag = null; return; }
        const sh = this.spyGroup && ray.intersectObject(this.spyGroup, true)[0];
        if (sh?.object.userData.spy) { toast(sh.object.userData.spy); drag = null; return; }
        const hit = ray.intersectObjects([this.patch, this.base])[0];
        if (hit) { const p = hit.point.clone().normalize(); const lat = Math.asin(p.y) / D2R, lon = Math.atan2(-p.z, p.x) / D2R; if (this.opts.onGround && this.opts.onGround(lon, lat)) { drag = null; return; } const n = countryAt(lon, lat); if (n && this.opts.onCountry) this.opts.onCountry(n, lon, lat); else if (!n && this.opts.onSea) this.opts.onSea(lon, lat); }
      }
      drag = null;
    });
    c.addEventListener('wheel', (e) => {
      e.preventDefault(); const dy = Math.max(-240, Math.min(240, e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1)));
      this.zoomTo(1 + ((this.zt ?? this.view.dist) - 1) * Math.exp(dy * 0.0016));
    }, { passive: false });
  }
  zoomTo(dist) { this.zt = Math.max(1.05, Math.min(3.6, dist)); this.dirty = true;
  }
}
/* ====================================================================== */
/* App shell: screens, live state from the server, and actions            */
/* ====================================================================== */
const SPY_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M3 11h18M6 11l2-6h8l2 6"/><circle cx="8" cy="16" r="3"/><circle cx="16" cy="16" r="3"/><path d="M11 16h2"/></svg>';
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const $ = (id) => document.getElementById(id);
let EDIT = false, STAFFMAP = false, placing = null, VIEW, ROLE, AS, STATE = null, VER = 0, SKEW = 0, lastFlashId, MEE = null, ME = null;
let selected = { type: 'country', id: 'Poland' };
/* ---------- Pop-up notices and the crisis staff verdict card ---------- */
const NI = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const NICON = {
  sent: NI('<path d="M21 3 3 10.5l7 2.5 2.5 7z"/><path d="m21 3-11 10"/>'),
  approved: NI('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  rejected: NI('<path d="M6 6l12 12M18 6 6 18"/>'),
  note: NI('<rect x="3" y="5" width="18" height="14" rx="1"/><path d="m3 7 9 6 9-6"/>'),
  intel: NI('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  sign: NI('<path d="M4 20h16"/><path d="M15.5 4.5l4 4L9 19H5v-4z"/>'),
  error: NI('<path d="M12 8v5M12 16.5v.5"/><path d="M10.3 3.9 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>'),
  info: NI('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.5"/>'),
};
const CALM = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function notify({ kind = 'info', title, body = '', action, ms = 5200 }) {
  const box = $('notices'); if (!box || !title) return;
  const n = document.createElement('div'); n.className = `notice ${kind}`; n.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  n.innerHTML = `<span class="ni">${NICON[kind] || NICON.info}</span><div class="nt"><b>${esc(title)}</b>${body ? `<small>${esc(body)}</small>` : ''}${action ? `<button type="button" class="nlink">${esc(action.label)} →</button>` : ''}</div><button type="button" class="nx" aria-label="Dismiss">✕</button><i class="nbar" style="animation-duration:${ms}ms"></i>`;
  const close = () => { if (n.classList.contains('out')) return; n.classList.add('out'); setTimeout(() => n.remove(), CALM() ? 0 : 280); };
  n.querySelector('.nx').addEventListener('click', close);
  n.querySelector('.nbar').addEventListener('animationend', close); // pauses while hovered
  if (CALM()) setTimeout(close, ms);
  if (action) n.querySelector('.nlink').addEventListener('click', () => { action.run(); close(); });
  box.prepend(n); while (box.children.length > 4) box.lastChild.remove();
}
function toast(msg, kind = 'info') { notify({ kind, title: msg }); }
// A paper plane that lifts off a button after something is sent.
function flyFrom(el) {
  if (!el || CALM()) return; const r = el.getBoundingClientRect(); const p = document.createElement('span'); p.className = 'plane'; p.innerHTML = NICON.sent;
  p.style.left = r.left + r.width / 2 - 11 + 'px'; p.style.top = r.top + r.height / 2 - 11 + 'px'; document.body.appendChild(p); setTimeout(() => p.remove(), 1100);
  el.classList.add('did'); setTimeout(() => el.classList.remove('did'), 1400);
}
// Crisis staff answered a note: a sealed letter waits on the map until the delegate opens it.
let OPENED = null, LETTER = null, letterTimer = [];
const LKEY = () => 'crisis-opened-' + (MEE?.name || '');
const unreadLetters = () => (STATE.queue || []).filter((q) => q.status !== 'pending' && !OPENED.has(q.id)).reverse(); // oldest first
function saveOpened() { try { localStorage.setItem(LKEY(), JSON.stringify([...OPENED].slice(-400))); } catch {} }
let MAILQ = []; // new notes and intel waiting to be opened, oldest first
function mailItems() { return [...unreadLetters().map((q) => ({ kind: 'reply', key: 'q:' + q.id, q })), ...MAILQ]; }
function renderMailbox() {
  const mb = $('mailbox'); if (!mb || !MEE) return;
  if (!OPENED) { try { const v = localStorage.getItem(LKEY()); if (v) OPENED = new Set(JSON.parse(v)); } catch {} }
  if (!OPENED) { OPENED = new Set((STATE.queue || []).filter((q) => q.status !== 'pending').map((q) => q.id)); saveOpened(); } // first visit: no backlog
  const items = mailItems(); const n = items.length; const top = items[0]; const was = +mb.dataset.n || 0; mb.dataset.n = n;
  mb.hidden = !n || !!LETTER;
  if (top) {
    mb.className = 'mailbox ' + top.kind + (mb.classList.contains('arrive') ? ' arrive' : '');
    $('mb-title').textContent = top.kind === 'reply' ? 'Crisis staff replied' : top.kind === 'note' ? `Note from ${top.m.from}` : top.kind === 'bloc' ? top.b.name : 'New intel';
    $('mb-sub').textContent = top.kind === 'intel' ? top.r.from : top.kind === 'note' && top.m.intercepted ? 'Intercepted by your agent' : top.kind === 'bloc' ? `New note from ${top.m.from}` : 'Click to open';
    if (top.kind === 'bloc') mb.classList.replace('bloc', 'note');
  }
  $('mb-n').textContent = n; $('mb-n').hidden = n < 2;
  if (n > was && !mb.hidden && !CALM()) { mb.classList.remove('arrive'); void mb.offsetWidth; mb.classList.add('arrive'); }
}
function openMail() {
  const top = mailItems()[0]; if (!top) return;
  if (top.kind === 'reply') return openLetter();
  MAILQ = MAILQ.filter((x) => x !== top);
  if (top.kind === 'note') openMsg(top.m); else if (top.kind === 'bloc') openBloc(top.b.id); else openIntel(top.r);
  renderMailbox();
}
function openIntel(r) {
  const k = 'i:' + r.from + '|' + r.text; READ.add(k); MAILQ = MAILQ.filter((x) => x.key !== k); renderIntel(); renderMailbox();
  const i = (STATE.intel || []).indexOf(r);
  openReader({ theme: 'dossier', kicker: 'Intelligence report', title: r.from, rel: r.rel, body: r.text, file: `File ${String((STATE.intel || []).length - Math.max(0, i)).padStart(3, '0')} · ${STATE.update?.date || ''}` });
}
function openMsg(m) {
  const me = MEE.name; READ.add('m:' + m.id); MAILQ = MAILQ.filter((x) => x.key !== 'm:' + m.id); renderMessages(); renderMailbox();
  const to = (m.to || []).map((n) => (n === me ? 'you' : n)).join(', ');
  openReader({ theme: 'note', title: m.from === me ? `To ${to},` : `From ${m.from}${m.intercepted ? ' to ' + to : ''}`, body: m.text, time: `${m.time}${m.from === me ? ' · You passed this note' : ''}`, stamp: m.intercepted ? 'Intercepted' : '' });
}
function openLetter() {
  const q = unreadLetters()[0]; if (!q) return; LETTER = q; OPENED.add(q.id); saveOpened();
  const ok = q.status === 'approved'; const el = $('letterpop');
  $('lt-title').textContent = q.title.replace(/^(Crisis note|Follow-up|Note to [^:]+): /, '');
  $('lt-kind').textContent = q.detail?.to ? `Reply from ${q.detail.to}` : q.detail?.parent ? 'Your follow-up' : { fleet: 'Your orders', build: 'Your build order', money: 'Your transfer', spy: 'Your spy mission' }[q.type] || 'Your crisis note';
  $('lt-verdict').textContent = ok ? 'Approved' : 'Denied';
  $('lt-reply').textContent = q.reply || (ok ? 'Crisis staff approved your plan.' : 'Crisis staff turned this one down.');
  $('lt-out').textContent = q.outcome && q.outcome !== q.status ? 'Result: ' + q.outcome : ''; $('lt-out').hidden = !$('lt-out').textContent;
  const more = unreadLetters().length; $('lt-next').hidden = !more; $('lt-next').textContent = `Next reply (${more})`;
  el.className = 'letterpop ' + (ok ? 'ok' : 'no'); el.hidden = false; void el.offsetWidth; el.classList.add('opening');
  letterTimer.forEach(clearTimeout); letterTimer = [setTimeout(() => el.classList.add('open'), CALM() ? 0 : 1050)];
  renderMailbox(); setTimeout(() => $('lt-close').focus({ preventScroll: true }), CALM() ? 0 : 1100);
}
function closeLetter(next) {
  const el = $('letterpop'); if (!el || el.hidden) return; letterTimer.forEach(clearTimeout);
  el.classList.add('closing');
  setTimeout(() => { el.hidden = true; el.className = 'letterpop'; LETTER = null; renderMailbox(); if (next) openLetter(); }, CALM() ? 0 : 220);
}
// Count badges pop when their number goes up.
function setCount(el, n) { if (!el) return; const was = +el.textContent || 0; el.textContent = n || ''; if (n > was && !CALM()) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); } }
function initials(name) { return name.replace(/"[^"]*"/g, '').split(/\s+/).filter((w) => /^[A-ZÉÓŁ]/.test(w)).map((w) => w[0]).join('').slice(0, 2); }
const opt = (arr, sel) => arr.map((d) => `<option${d === sel ? ' selected' : ''}>${esc(d)}</option>`).join('');
const PEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>';
const PLANE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 3 3 10.5l7 2.5 2.5 7z"/><path d="m21 3-11 10"/></svg>';
const CASE_SVG = '<svg class="case" viewBox="0 0 32 28" aria-hidden="true"><rect x="2" y="8" width="28" height="18" rx="2.5" fill="#7A4A2A"/><rect x="2" y="8" width="28" height="7" rx="2.5" fill="#8E5A34"/><path d="M11 8V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v3" fill="none" stroke="#3A2414" stroke-width="2.2"/><rect x="7" y="13" width="4" height="4" rx="1" fill="#D8B24A"/><rect x="21" y="13" width="4" height="4" rx="1" fill="#D8B24A"/></svg>';
const GROUP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.6"/><path d="M15.5 14.2A5 5 0 0 1 21 19"/></svg>';
const OVERLAYS = () => ['letterpop', 'reader', 'brief', 'compose', 'mcompose', 'lap', 'chat', 'bcompose'].map($).filter(Boolean);
const ZOOM = (g) => `<div class="zoom glass" data-g="${g}"><button type="button" data-z="feat" class="featbtn" aria-pressed="${SHOW_FEAT}" aria-label="Show map features" title="Show map features (trenches, bunkers, factories)">${fIcon('fort')}</button><button type="button" data-z="in" aria-label="Zoom in">+</button><button type="button" data-z="out" aria-label="Zoom out">−</button><button type="button" data-z="reset" aria-label="Reset view">FIT</button></div>`;
const DATECARD = `<div class="date glass num"><span class="date-line"></span><small class="countdown">Next crisis update in <b>15:00</b></small></div>`;

/* ---------- Staff screen: the map plus a request drawer and pop-ups ---------- */
const MODALS = [['dir', 'Directives'], ['cu', 'Crisis update'], ['ev', 'Make something happen'], ['battle', 'Battle'], ['rels', 'Wars and treaties'], ['feat', 'Features and spies'], ['gallery', 'Figurines'], ['msgs', 'Messages'], ['clock', 'Clock'], ['proj', 'Projector'], ['codes', 'Access codes'], ['game', 'Game']];
function staffBar() {
  return `<div class="undobar" id="undobar" hidden></div><nav class="stoolbar" aria-label="Staff tools">${MODALS.map(([k, l]) => `<button type="button" class="dbtn" data-modal="${k}">${l}<span class="count num" id="stc-${k}" hidden></span></button>`).join('')}</nav>`;
}
function staffDrawer() {
  return `<aside class="sdrawer" id="sdrawer"><div class="shead"><button type="button" class="dbtn" id="sd-toggle" aria-expanded="true" aria-label="Hide requests">‹</button><h2>Requests</h2><span class="pill pending num" id="q-count"></span>
      <div class="seg small" role="group" aria-label="Filter requests"><button type="button" data-qf="pending" aria-pressed="true">Waiting</button><button type="button" data-qf="all" aria-pressed="false">All</button></div>
      <select id="q-country" aria-label="Filter by country"><option value="">All</option>${ORDER.map((k) => `<option value="${k}">${POWERS[k].short}</option>`).join('')}</select></div>
    <div class="sdbody"><p class="formnote" id="ai-mode"></p><div id="queue" class="queue-list"></div></div></aside>`;
}
const modal = (k, title, body, wide) => `<div class="smodal" id="m-${k}" hidden role="dialog" aria-modal="true" aria-labelledby="mt-${k}"><div class="mbox${wide ? ' wide' : ''}"><header><h2 id="mt-${k}">${title}</h2><button type="button" class="dbtn" data-close aria-label="Close">✕</button></header><div class="mbody">${body}</div></div></div>`;
function staffModals(p) {
  return modal('dir', 'Directives', '<div id="chair"></div>', true)
    + modal('cu', 'Publish a crisis update', `<div class="update-now" id="cu-now"></div><form id="cu-form" class="dform" novalidate>
            <label for="cu-title">Headline<input type="text" id="cu-title" maxlength="140" placeholder="For example: Soviet troops cross into eastern Poland"></label>
            <label for="cu-text">What happened<textarea id="cu-text" maxlength="900" placeholder="Two or three sentences for the room."></textarea></label>
            <label for="cu-date">Game date and time<input type="text" id="cu-date" maxlength="60"></label>
            <label class="check"><input type="checkbox" id="cu-flash" checked> Breaking news flash on every screen</label>
            <label class="check"><input type="checkbox" id="cu-reset" checked> Restart the countdown at <input type="number" id="cu-min" min="1" max="60" value="15" style="width:56px"> minutes</label>
            <button type="submit" class="dbtn gold">Publish to the room</button></form>`)
    + modal('ev', 'Make something happen', `<p class="formnote">Describe any event in plain words. To place units, pins or buildings yourself, just click the map instead.</p>
          <textarea id="ev-text" maxlength="1500" placeholder="For example: Hitler orders Rundstedt's panzers to take Warsaw within ten days, and rations fuel for the Luftwaffe."></textarea>
          <div class="row"><button type="button" class="dbtn gold" id="ev-preview">Preview</button></div><div id="ev-result"></div>
          <div id="free-fx">${fxEditor('free', false, 'Or build the effects by hand')}</div><button type="button" class="dbtn" id="free-apply">Apply the hand-made effects</button>`, true)
    + modal('battle', 'Battle calculator', '<p class="formnote">Tip: click units on the map and choose "Attacker" or "Defender". Battles in approved crisis notes roll by themselves.</p><div id="battle"></div>', true)
    + modal('rels', 'Wars, treaties and conditions', '<div id="rels"></div>')
    + modal('feat', 'Map features, spies and scheduled events', '<p class="formnote">Click any feature on the map to change it, or click the map to build one. Spies show on the map as dark pins.</p><div id="featlist"></div>', true)
    + modal('gallery', 'Figurine gallery', `<div class="row"><p class="formnote" style="flex:1">Every model the map can show. Units and spies are figures; everything else can be placed from the map or comes from approved notes.</p><label class="formnote">Country colors <select id="gal-owner">${ORDER.map((k) => `<option value="${k}"${k === 'Germany' ? ' selected' : ''}>${POWERS[k].label}</option>`).join('')}</select></label></div><div class="fgrid" id="fgrid"></div>`, true)
    + modal('msgs', 'Messages between delegates', '<div class="reqs" id="staff-msgs"></div>')
    + modal('clock', 'Game clock', `<p class="formnote">The date runs on its own. At normal speed, 12 real hours take the war from 3 September 1939 to about 1 December 1941 (a game day every 53 seconds). Pause it for breaks and lunch.</p>
          <div class="clocknow"><b id="clk-now"></b><span id="clk-state"></span></div>
          <div class="row"><button type="button" class="dbtn gold" id="clk-toggle">Pause</button>
            <label class="formnote">Speed <select id="clk-speed"><option value="0.5">Half (late 1940 after 12 hours)</option><option value="1" selected>Normal (late 1941 after 12 hours)</option><option value="2">Double</option><option value="4">Four times</option></select></label></div>
          <div class="row"><label class="formnote">Jump to <input type="date" id="clk-date" min="1930-01-01" max="1949-12-31"></label><input type="time" id="clk-time" value="12:00" step="3600" aria-label="Time of day"><button type="button" class="dbtn" id="clk-set">Set the date</button></div>`)
    + modal('proj', 'Projector', `<div id="proj"></div><div class="row"><button type="button" class="dbtn" id="replay-flash">Replay the last update as a flash</button><button type="button" class="dbtn" id="cd-restart">Restart countdown (15 min)</button><button type="button" class="dbtn" id="clear-arrows">Clear map pins</button></div>`)
    + modal('codes', 'Access codes', `<p class="formnote">Print these and hand one to each delegate. The staff and projector codes are set in the Vercel project settings.</p><div class="row"><button type="button" class="dbtn" onclick="window.print()">Print</button></div>
          <div class="codes-wrap"><table class="codes"><thead><tr><th>Delegate</th><th>Country</th><th>Code</th></tr></thead><tbody>${(p.codes || []).map((c) => `<tr><td>${esc(c.name)}</td><td>${esc(POWERS[c.country].label)}</td><td class="code">${esc(c.code)}</td></tr>`).join('')}</tbody></table></div>`)
    + modal('game', 'Game', `<p class="storage">Storage: ${p.storage === 'supabase' ? 'Supabase database. The game survives restarts.' : '<b>Server memory only.</b> Fine for testing, but the game resets whenever the server restarts. Connect Supabase before the conference.'}</p>
          <p class="storage">Assistant: ${p.ai === 'claude' ? 'Claude is reading notes and suggesting effects.' : '<b>Keyword matching only.</b> Add ANTHROPIC_API_KEY in Vercel to have Claude suggest effects for every note.'}</p>
          <div class="row"><button type="button" class="dbtn" id="load-demo">Load demo requests</button></div>
          <div class="row"><input type="text" id="reset-confirm" placeholder="Type RESET" aria-label="Type RESET to confirm"><button type="button" class="dbtn red" id="reset-game">Reset the whole game</button></div>`);
}
function openModal(k) { document.querySelectorAll('.smodal').forEach((m) => (m.hidden = m.id !== 'm-' + k)); if (k === 'battle') syncBattleSelects(); if (k === 'gallery') startGallery(); if (k === 'cu' && $('cu-date')) $('cu-date').value = S.gameDateText(gameNow()); if (k === 'clock') syncClockUI(true); }
const gameNow = () => S.gameTime(STATE?.clock, Date.now() + SKEW);
function syncClockUI(fill) {
  if (!$('clk-now') || !STATE?.clock) return; const c = STATE.clock;
  $('clk-now').textContent = S.gameDateText(gameNow()); $('clk-state').textContent = c.running ? (Math.abs(c.rate / S.CLOCK_RATE - 1) < 0.01 ? 'Running' : `Running at ${+(c.rate / S.CLOCK_RATE).toFixed(2)}x`) : 'Paused';
  $('clk-state').className = c.running ? 'on' : 'off'; $('clk-toggle').textContent = c.running ? 'Pause the clock' : 'Start the clock';
  if (fill) { $('clk-date').value = new Date(gameNow()).toISOString().slice(0, 10); const sp = $('clk-speed'); const k = String(+(c.rate / S.CLOCK_RATE).toFixed(2)); if ([...sp.options].some((o) => o.value === k)) sp.value = k; }
}
/* ---------- Figurine gallery: every model turning slowly, drawn by one small offscreen renderer ---------- */
let GAL = null;
function galleryItems(owner) {
  return [
    ...KINDS.map((k) => ({ name: KIND_NAME[k], sub: 'Unit', make: () => makeFigure({ id: 'gal-' + k, kind: k, owner, str: k === 'air' ? 8 : 6, at: [0, 0] }) })),
    { name: 'Spy', sub: 'Agent, seen by its own side and staff', make: () => { const f = spyFigure(); bakeFigure(f, null); return f; } },
    ...Object.entries(FEAT).map(([k, v]) => ({ name: v.name, sub: [v.mod ? `${v.mod > 0 ? '+' : ''}${v.mod} defense` : 'No battle bonus', v.line ? 'can run as a line' : ''].filter(Boolean).join(' · '), make: () => makeProp({ id: 'gal', kind: k, owner, at: [0, 0], ready: 0, ruined: false }) })),
  ];
}
function startGallery() {
  if (!GAL) {
    const W = 220, H = 165, pr = Math.min(2, window.devicePixelRatio || 1);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); renderer.setPixelRatio(pr); renderer.setSize(W, H);
    const scene = new THREE.Scene(); scene.add(new THREE.AmbientLight(0xffffff, 0.75), new THREE.HemisphereLight(0xdfe8ff, 0x3a3020, 0.6));
    const sun = new THREE.DirectionalLight(0xfff4e0, 1.1); sun.position.set(3, 6, 4); scene.add(sun);
    const cam = new THREE.PerspectiveCamera(30, W / H, 0.1, 100); cam.position.set(0, 2.3, 4.6); cam.lookAt(0, 0.05, 0);
    GAL = { renderer, scene, cam, W, H, pr, tiles: [], raf: 0 };
    $('gal-owner').addEventListener('change', () => buildGallery());
    buildGallery();
  }
  cancelAnimationFrame(GAL.raf); let last = 0;
  const loop = (t) => {
    if ($('m-gallery').hidden) return; GAL.raf = requestAnimationFrame(loop); if (t - last < 33) return; last = t;
    const box = $('m-gallery').querySelector('.mbody').getBoundingClientRect();
    GAL.tiles.forEach((tl, i) => {
      const r = tl.cv.getBoundingClientRect(); if (r.bottom < box.top || r.top > box.bottom) return;
      tl.pivot.rotation.y = (CALM() ? 0.6 : t * 0.0005) + i * 0.4; GAL.scene.add(tl.pivot); GAL.renderer.render(GAL.scene, GAL.cam); GAL.scene.remove(tl.pivot);
      tl.ctx.clearRect(0, 0, tl.cv.width, tl.cv.height); tl.ctx.drawImage(GAL.renderer.domElement, 0, 0);
    });
  };
  GAL.raf = requestAnimationFrame(loop);
}
function buildGallery() {
  GAL.tiles.forEach((tl) => tl.pivot.traverse((o) => o.isMesh && o.geometry.dispose()));
  const grid = $('fgrid'); grid.innerHTML = ''; GAL.tiles = [];
  for (const it of galleryItems($('gal-owner').value)) {
    const model = it.make(); const b = new THREE.Box3().setFromObject(model); const size = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
    const k = 2.3 / Math.max(size.x, size.y * 1.15, size.z, 0.001); model.position.set(-c.x * k, -c.y * k, -c.z * k); model.scale.multiplyScalar(k);
    const pivot = new THREE.Group(); pivot.add(model);
    const fig = document.createElement('figure'); fig.className = 'ftile';
    const cv = document.createElement('canvas'); cv.width = GAL.W * GAL.pr; cv.height = GAL.H * GAL.pr;
    const cap = document.createElement('figcaption'); cap.innerHTML = `<b>${esc(it.name)}</b><small>${esc(it.sub)}</small>`;
    fig.append(cv, cap); grid.appendChild(fig); GAL.tiles.push({ pivot, cv, ctx: cv.getContext('2d') });
  }
}
function skeleton(p) {
  const nav = ROLE === 'staff'
    ? `<a class="navlink${STAFFMAP ? ' on' : ''}" href="/crisis/staff">Staff map</a><a class="navlink${VIEW === 'map' && !EDIT ? ' on' : ''}" href="/crisis/map" target="_blank" rel="noopener">Projector</a>
       <select class="navlink" id="view-as" aria-label="Act as a delegate"><option value="">Act as a delegate…</option>${ROSTER.map((r) => `<option${r.name === AS ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</select>`
    : ROLE === 'projector' ? `<button type="button" class="navlink" id="fs-btn">Full screen</button>` : '';
  const sub = STAFFMAP ? 'Crisis staff · true positions' : VIEW === 'map' ? 'SLOMUN II crisis' : AS ? `Staff acting as ${esc(AS)}` : 'Delegate laptop';
  const top = `<header class="topbar">
    <div class="brand"><img src="/images/crest.png" alt="SLOMUN crest"><div><b>Early WWII</b><span>${sub}</span></div></div>
    <div class="hud num" id="treasuries" aria-label="Treasuries"></div>
    <div class="topnav">${nav}<span class="conn" id="conn"><i></i><span>Live</span></span><button type="button" class="navlink" id="logout">Log out</button></div>
  </header>`;
  let body = '';
  if (VIEW === 'map') body = `<section class="view map-view${STAFFMAP ? ' staffmap' : ''}" id="view-staff-root">${STAFFMAP ? staffBar() : ''}
    <div class="stage" id="stage-map">${STAFFMAP ? staffDrawer() : ''}<div class="loading">Loading the map…</div><div class="overlay" id="ov-map"></div>
      ${DATECARD}
      <div class="queuecard glass"><b class="num" id="pend-count">0</b><span>Requests waiting<br>for crisis staff</span></div>
      <div class="floorcard glass" id="floorcard" hidden></div>
      <div class="update glass" id="update-card"></div>
      <div class="selcard glass" id="selpanel" aria-live="polite"></div>${EDIT ? '<div class="editcard" id="editcard" hidden></div><div class="placebar" id="placebar" hidden></div><div class="btray glass" id="btray" hidden></div>' : ''}
      <div class="hint glass">Left-drag to turn · right-drag to move · scroll to zoom</div>${ZOOM('map')}
    </div>
    <div class="bottom"><div class="ticker" aria-label="News wire"><div class="tag">Wire</div><div class="feed"><div class="track" id="track"></div></div></div></div>
  ${STAFFMAP ? staffModals(p) : ''}</section>`;
  if (VIEW === 'delegate') body = `<section class="view dview"><div class="dlayout">
    <div class="stage" id="stage-del"><div class="loading">Loading the map…</div><div class="overlay" id="ov-del"></div>${DATECARD}
      <button type="button" class="briefbtn glass" id="brief-btn" aria-haspopup="dialog">${CASE_SVG}<span><b>Portfolio</b><small>Your powers, assets and secret file</small></span></button>
      <div class="fognote glass"><i></i><span>Fog of war. You see your own and allied forces, plus whatever your patrols and spies have found.</span></div>${ZOOM('del')}</div>
    <aside class="side">
      <div class="who"><div class="badge flagbadge" id="who-flag"></div><div><b id="who-name"></b><span id="who-role"></span></div></div>
      <div class="myres num"><div><b id="my-money"></b><span>Treasury</span></div><div><b id="my-forces"></b><span>Forces</span></div><div><b id="my-update"></b><span>Crisis update</span></div></div>
      <div class="tabs" role="tablist" aria-label="Delegate panels">
        <button type="button" role="tab" id="t-act" aria-selected="true" aria-controls="p-act" title="Act (key 1)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg><span class="tl">Act</span></button>
        <button type="button" role="tab" id="t-dir" aria-selected="false" aria-controls="p-dir" title="Directives (key 2)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h8l4 4v14H7z"/><path d="M10 11h6M10 15h6"/></svg><span class="tl">Directives</span><span class="count num" id="c-dir" hidden></span></button>
        <button type="button" role="tab" id="t-intel" aria-selected="false" aria-controls="p-intel" title="Intel (key 3)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg><span class="tl">Intel</span><span class="count num" id="c-intel"></span></button>
        <button type="button" role="tab" id="t-msg" aria-selected="false" aria-controls="p-msg" title="Messages (key 4)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="1"/><path d="m3 7 9 6 9-6"/></svg><span class="tl">Messages</span><span class="count num" id="c-msg"></span></button>
      </div>
      <div id="p-act" role="tabpanel" aria-labelledby="t-act"><div class="tiles" id="tiles"></div><form class="form" id="form" novalidate></form></div>
      <div id="p-dir" role="tabpanel" aria-labelledby="t-dir" hidden></div>
      <div id="p-intel" role="tabpanel" aria-labelledby="t-intel" hidden><div class="reqs" id="intel"></div></div>
      <div id="p-msg" role="tabpanel" aria-labelledby="t-msg" hidden>
        <div class="launchrow"><button type="button" class="send launch" id="open-msg">${PEN}Pass a note</button><button type="button" class="send launch alt" id="open-bloc">${GROUP}New bloc</button></div>
        <div class="reqs" id="blocs"></div>
        <div class="reqs" id="msgs"></div></div>
    </aside></div>
    <div class="dock"><div class="warbar" id="warbar" aria-live="polite"></div>
    <div class="bottom"><div class="ticker" aria-label="News wire"><div class="tag">Wire</div><div class="feed"><div class="track" id="track"></div></div></div></div></div>
  </section>`;
  return top + body + `<aside class="citycard" id="citycard" hidden aria-live="polite"></aside><div class="notices" id="notices" aria-live="polite"></div>
  <button type="button" class="mailbox" id="mailbox" hidden><span class="mb-env" aria-hidden="true"><i></i></span><span class="mb-txt"><b id="mb-title">Crisis staff replied</b><small id="mb-sub">Click to open</small></span><span class="mb-n num" id="mb-n" hidden></span></button>
  <div class="brief" id="brief" hidden><div class="bstage">
    <div class="bcase" aria-hidden="true"><div class="bhandle"></div><div class="blid"><i></i><i></i></div><div class="bbox"></div></div>
    <section class="bpapers" role="dialog" aria-modal="true" aria-labelledby="brief-title"><header><h2 id="brief-title">Portfolio</h2><button type="button" class="lbtn" id="brief-close">Close</button></header><div id="brief-body"></div></section></div></div>
  <div class="compose" id="compose" hidden><div class="cpaper lined"><header class="chead"><p class="ck">Crisis note</p><p class="cto"><label for="c-to">To:</label> <select id="c-to"></select><span id="c-from"></span></p></header><form id="cform" novalidate></form></div>
    <button type="button" class="cmin" id="c-restore" hidden>${PEN}<span><b>Crisis note</b><small id="c-minsub">Click the map to mark the spot, then click here</small></span></button></div>
  <div class="compose" id="mcompose" hidden><div class="cpaper lined torn"><header class="chead"><p class="ck">Pass a note</p></header><form class="mform" id="msg-form" novalidate><fieldset class="notepick"><legend>Pass a note to</legend>${ORDER.map((c) => { const rs = ROSTER.filter((r) => r.country === c && r.name !== (AS || p.session?.name)); return rs.length ? `<div class="npc">${flag(c)}${rs.map((r) => `<label><input type="checkbox" value="${esc(r.name)}"><span>${esc(r.name)}</span></label>`).join('')}</div>` : ''; }).join('')}</fieldset>
          <label for="msg-text" class="sr">Note</label><textarea id="msg-text" maxlength="1200" placeholder="Private note. Crisis staff read every note, and enemy spies in your country or theirs may intercept it."></textarea>
          <div class="cbtns"><button type="button" class="lbtn" data-cclose>Cancel</button><button type="submit" class="lbtn main">${PLANE}Pass the note</button></div></form></div></div>
  <div class="compose" id="bcompose" hidden><div class="cpaper"><header class="chead"><p class="cto">New bloc</p><p class="formnote">A standing group for passing notes. Everyone in it sees every note. Crisis staff read everything, and spies can intercept.</p></header>
    <form class="mform" id="bloc-form" novalidate><label class="formnote" for="bloc-name">Name<input type="text" id="bloc-name" maxlength="50" placeholder="For example: Western Allies war council"></label>
      <fieldset class="notepick"><legend>Invite</legend>${ORDER.map((c) => { const rs = ROSTER.filter((r) => r.country === c && r.name !== (AS || p.session?.name)); return rs.length ? `<div class="npc">${flag(c)}${rs.map((r) => `<label><input type="checkbox" value="${esc(r.name)}"><span>${esc(r.name)}</span></label>`).join('')}</div>` : ''; }).join('')}</fieldset>
      <div class="cbtns"><button type="button" class="lbtn" data-cclose>Cancel</button><button type="submit" class="lbtn main">Create bloc</button></div></form></div></div>
  <div class="chat" id="chat" hidden><section class="chatwin" role="dialog" aria-modal="true" aria-labelledby="ch-name">
    <header class="chhead"><span class="chicon">${GROUP}</span><div class="chtitle"><b id="ch-name"></b><span id="ch-members"></span></div><button type="button" class="dbtn" id="ch-invite">Invite</button><button type="button" class="dbtn" id="ch-leave">Leave</button><button type="button" class="dx" id="ch-close" aria-label="Close">✕</button></header>
    <div class="chinv" id="ch-inv" hidden><div class="npc" id="ch-invlist"></div><div class="row"><button type="button" class="dbtn gold" id="ch-invgo">Invite</button></div></div>
    <div class="chlog" id="ch-log" aria-live="polite"></div>
    <form class="chform" id="ch-form" novalidate><textarea id="ch-text" rows="2" maxlength="1200" placeholder="Write to the bloc. Enter sends, Shift+Enter for a new line."></textarea><button type="submit" class="lbtn main">${PLANE}Send</button></form></section></div>
  <div class="lap" id="lap" hidden><div class="laptop"><div class="lscreen"><div class="docs" id="docs"></div></div><div class="lbase"><i></i></div></div></div>
  <div class="reader" id="reader" hidden><article class="rcard" id="rd-card" role="dialog" aria-modal="true" aria-labelledby="rd-title"><div class="rpaper" id="rd-paper"></div>
    <div class="rbtns"><button type="button" class="lbtn main" id="rd-close">Close</button></div></article></div>
  <div class="letterpop" id="letterpop" hidden><div class="lstage">
    <div class="lenv" aria-hidden="true"><div class="lback"></div><div class="lflap"></div><div class="lfront"></div><div class="lseal">S</div></div>
    <article class="letter" role="dialog" aria-modal="true" aria-labelledby="lt-title">
      <p class="lk">Reply from crisis staff</p>
      <p class="lkind" id="lt-kind">Your crisis note</p>
      <h3 id="lt-title"></h3>
      <p class="lverdict" id="lt-verdict"></p>
      <p class="lreply" id="lt-reply"></p>
      <p class="lout" id="lt-out" hidden></p>
      <div class="lbtns"><button type="button" class="lbtn" id="lt-follow">Follow up</button><button type="button" class="lbtn" id="lt-next" hidden></button><button type="button" class="lbtn main" id="lt-close">Close</button></div>
    </article></div></div>
  <div class="breaking" id="breaking" hidden role="dialog" aria-modal="true" aria-labelledby="bn-head"><article class="paper">
    <div class="mast"><span id="bn-date"></span><b>The SLOMUN Dispatch</b><span>Special Edition</span></div>
    <span class="extra">Breaking News</span><h2 class="headline" id="bn-head"></h2><p class="deck" id="bn-deck"></p>
    <div class="dismiss">Click anywhere or press Esc to close</div></article></div>`;
}

/* ---------- Server ---------- */
async function fetchState() {
  const q = new URLSearchParams(); if (VER) q.set('v', VER);
  if (AS) q.set('as', AS); else if (VIEW === 'map' && ROLE === 'staff' && !EDIT) q.set('as', '@projector');
  const r = await fetch('/api/crisis/state?' + q, { cache: 'no-store' });
  if (r.status === 401) { location.href = '/crisis'; return; }
  const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Server error');
  SKEW = j.now - Date.now(); if (!j.unchanged) applyState(j);
}
async function act(payload, opt = {}) {
  try {
    const r = await fetch('/api/crisis/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(AS ? { ...payload, as: AS } : payload) });
    if (r.status === 401) { location.href = '/crisis'; return false; }
    const j = await r.json();
    if (!r.ok) { toast(j.error || 'That did not work. Try again.', 'error'); return false; }
    if (j.view) { SKEW = j.view.now - Date.now(); applyState(VIEW === 'map' && !EDIT ? null : j.view); }
    if (j.message && !opt.quiet) toast(j.message, /^(Sent|Note passed|You signed)/.test(j.message) ? 'sent' : 'info');
    return true;
  } catch { toast('Could not reach the server. Check the Wi-Fi and try again.', 'error'); return false; }
}

function applyState(v) {
  if (!v) return;
  const first = !STATE; const prev = STATE ? Object.fromEntries(UNITS.map((u) => [u.id, u])) : null;
  STATE = v; VER = v.version; UNITS = v.units || [];
  const arrowSig = JSON.stringify([v.arrows || [], v.control || {}]); const arrowsChanged = arrowSig !== JSON.stringify([LIVE_ARROWS, CONTROL]); LIVE_ARROWS = v.arrows || []; CONTROL = v.control || {};
  const markSig = JSON.stringify(v.markers || []); const marksChanged = markSig !== JSON.stringify(MARKERS); MARKERS = v.markers || []; RECON = v.recon || [];
  const fsig = JSON.stringify([v.features || [], v.update?.no]); const featsChanged = fsig !== featSig; featSig = fsig;
  const prevFeat = new Set(FEATS.map((f) => f.id)); FEATS = v.features || [];
  ORDER.forEach((c) => { if (v.treasury?.[c] != null) POWERS[c].treasury = v.treasury[c]; });
  if (VIEW === 'delegate' && v.me) { MEE = v.me; ME = v.me.country; ALLIES = v.allies; AGENTS = v.agents || []; }
  if (STAFFMAP) { const all = Object.entries(v.agents || {}).flatMap(([owner, l]) => l.map((g) => ({ ...g, owner }))); if (JSON.stringify(all) !== JSON.stringify(AGENTS)) { AGENTS = all; if (!first) mapGlobe?.addPins(); } }
  renderCommon(first);
  if (marksChanged && !first) [mapGlobe, delGlobe].forEach((g) => g && g.addPins());
  if (featsChanged && !first) {
    [mapGlobe, delGlobe].forEach((g) => g && g.addProps());
    const fresh = FEATS.filter((f) => !prevFeat.has(f.id)).slice(0, 2);
    if (mapGlobe && !EDIT) fresh.forEach((f) => mapGlobe.pulse(f.at, '')); if (delGlobe) fresh.forEach((f) => delGlobe.pulse(f.at, ''));
  }
  if (VIEW === 'map') { renderSel(); if (EDIT) renderEdit(); $('pend-count').textContent = v.pending ?? (v.queue || []).filter((q) => q.status === 'pending').length; renderFloor(); mapGlobe?.sync(prev); if (arrowsChanged && mapGlobe && !first) mapGlobe.repaintOcc(selected.type === 'country' ? selected.id : null); }
  if (VIEW === 'delegate') renderDelegate(first, prev);
  if (STAFFMAP) renderStaff();
}

/* ---------- Shared pieces ---------- */
let wireSig = '', featSig = '';
function renderCommon(first) {
  const s = STATE;
  $('treasuries').innerHTML = ORDER.map((n) => { const p = POWERS[n]; return `<button type="button" class="chip num" data-c="${n}">${flag(n)}<b>$${p.treasury}M</b><small>${p.short}</small></button>`; }).join('');
  if (VIEW === 'map') document.querySelectorAll('#treasuries .chip').forEach((b) => b.addEventListener('click', () => select('country', b.dataset.c)));
  paintDate();
  const sig = (s.wire || []).join('|');
  if ($('track') && sig !== wireSig) { wireSig = sig; const items = s.wire.map((w) => `<span>${esc(w)}</span>`).join(''); $('track').innerHTML = items + items; }
  if ($('update-card')) $('update-card').innerHTML = `<span class="card-title">Crisis Update ${s.update.no}</span><b style="display:block;color:var(--text);margin-bottom:2px">${esc(s.update.title)}</b>${esc(s.update.text)}`;
  if ((VIEW === 'map' || VIEW === 'delegate') && s.flash && s.flash.id !== lastFlashId) { if (!first) showFlash(s.flash); lastFlashId = s.flash.id; }
  if (VIEW === 'delegate') renderWarbar();
  if (first && s.flash) lastFlashId = s.flash.id;
}
// Bottom bar on delegate screens: who you are at war with, your allies and treaties, and your country's conditions.
let warSig = '';
function renderWarbar() {
  const el = $('warbar'); if (!el || !ME) return; const R = (STATE.relations || []).filter((r) => r.a === ME || r.b === ME); const st = (STATE.status || {})[ME] || [];
  const sig = JSON.stringify([R, st]); if (sig === warSig) return; warSig = sig;
  const group = (k, title) => { const l = R.filter((r) => r.status === k).map((r) => (r.a === ME ? r.b : r.a)); return l.length ? `<div class="wgroup ${k}"><span>${title}</span>${l.map((c) => `<b>${flag(c)}${esc(POWERS[c]?.label || c)}</b>`).join('')}</div>` : ''; };
  el.innerHTML = group('war', 'At war with') + group('alliance', 'Allied with') + group('pact', 'Pact with') + group('trade', 'Trade deal') + group('tension', 'Tension with')
    + (st.length ? `<div class="wgroup"><span>${esc(POWERS[ME].label)}</span>${st.map((x) => `<b class="schip ${x.tone}">${esc(x.label)}</b>`).join('')}</div>` : '') || '<div class="wgroup"><span>At peace with everyone</span></div>';
}
// The game date on every screen, recomputed each second from the shared clock.
function paintDate() {
  if (!STATE) return; const txt = STATE.clock ? S.gameDateText(gameNow()) + (ROLE === 'staff' && !STATE.clock.running ? ' · paused' : '') : STATE.update?.date || '';
  document.querySelectorAll('.date-line').forEach((e) => { if (e.textContent !== txt) e.textContent = txt; });
  if (!$('m-clock')?.hidden) syncClockUI(false);
}
function tickCountdown() {
  paintDate();
  if (!STATE) return; const left = Math.max(0, Math.round((STATE.countdownEnd - (Date.now() + SKEW)) / 1000));
  const txt = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`; document.querySelectorAll('.countdown b').forEach((e) => (e.textContent = txt));
  document.querySelectorAll('.date').forEach((e) => e.classList.toggle('urgent', left > 0 && left <= 60));
}
function showFlash(f) {
  $('bn-date').textContent = STATE?.update?.date || ''; $('bn-head').textContent = f.head; $('bn-deck').textContent = f.deck;
  const el = $('breaking'); el.hidden = true; void el.offsetWidth; el.hidden = false;
}

/* ---------- Projector ---------- */
const traitText = (u) => (u.traits || []).map((t) => `${esc(t.label)} ${t.mod >= 0 ? '+' : ''}${t.mod}`).join(', ');
function renderSel() {
  const box = $('selpanel'); if (!box || STAFFMAP) return;
  if (selected.type === 'feature') {
    const f = FEATS.find((x) => x.id === selected.id); if (!f) { selected = { type: 'country', id: 'Poland' }; return renderSel(); }
    const st = featState(f);
    box.innerHTML = `<div class="badge flagbadge featbadge" style="--fc:${POWERS[f.owner]?.color || '#999'}">${fIcon(f.kind)}</div><div><div class="sel-title">${esc(f.label)}</div><div class="sel-sub">${esc(POWERS[f.owner]?.label || f.owner)} · ${FEAT[f.kind]?.name || ''}</div><div class="stats"><div><span>Status</span> ${st === 'building' ? `Being built, ready after Update ${f.ready}` : st === 'ruined' ? 'Destroyed' : 'Ready'}</div>${f.mod && !f.ruined ? `<div><span>In battle</span> <b class="num">${f.mod > 0 ? '+' : ''}${Math.round(f.mod * S.MOD_STEP * 100)}%</b> for ${esc(POWERS[f.owner]?.label || f.owner)} defending here</div>` : ''}</div></div>`;
    return;
  }
  if (selected.type === 'unit') {
    const u = UNITS.find((x) => x.id === selected.id); if (!u) { selected = { type: 'country', id: 'Poland' }; return renderSel(); }
    const p = POWERS[u.owner]; const K = { fleet: ['NAV', 'Naval force', 'capital ships'], army: ['INF', 'Infantry', 'divisions'], armor: ['TNK', 'Tanks', u.owner === 'USSR' || u.owner === 'Poland' ? 'brigades' : 'divisions'], air: ['AIR', 'Air force', 'squadrons'] }[u.kind];
    box.innerHTML = `<div class="badge flagbadge">${flag(u.owner)}<em>${K[0]}</em></div><div><div class="sel-title">${esc(u.name)}</div><div class="sel-sub">${p.label} · ${K[1]}</div><div class="stats"><div><span>Strength</span> <b class="num">${S.realText(u)}</b>${u.kind === 'air' ? '' : ` <small class="formnote">(${u.str} ${u.kind === 'fleet' ? 'capital ships with escorts' : K[2]})</small>`}</div>${u.traits?.length ? `<div><span>Traits</span> ${traitText(u)}</div>` : ''}<div><span>Orders</span> ${esc(u.note)}</div></div></div>`;
    return;
  }
  const name = selected.id; const owner = ownerOf(name); const p = POWERS[owner];
  const title = name === 'Czechoslovakia' ? 'Bohemia, Moravia and Slovakia' : (p && name === owner ? p.label : LABEL_TEXT[name] || name);
  if (!p) { const rg = selected.region && REGION[selected.region]; const rc = rg && ctrlOf(rg); box.innerHTML = `<div class="badge" style="background:${colorOf(name)}">${initials(title)}</div><div><div class="sel-title">${esc(title)}</div><div class="sel-sub"><span class="pill neutral">Neutral</span></div><div class="stats"><div><span>Controlled by</span> Crisis staff</div>${rg ? `<div><span>Region</span> ${esc(rg.name)}${rc !== baseOwner(rg) ? ` · <b>held by ${POWERS[rc]?.label || rc}</b>` : ''}</div>` : ''}</div></div>`; return; }
  const rg = selected.region && REGION[selected.region]; const rc = rg && ctrlOf(rg);
  const regionLine = rg ? `<div><span>Region</span> ${esc(rg.name)} (${rg.zone.toLowerCase()})${rc !== baseOwner(rg) ? ` · <b>held by ${POWERS[rc]?.label || rc}</b>` : ''}</div>` : '';
  const sub = name !== owner ? `Controlled by ${p.label}` : '';
  box.innerHTML = `<div class="badge flagbadge">${flag(name)}</div><div><div class="sel-title">${esc(title)}</div><div class="sel-sub"><span class="pill ${p.side}">${p.side === 'war' ? 'At war' : 'Neutral'}</span>${sub ? ' · ' + sub : ''}</div><div class="stats"><div><span>Treasury</span> <b class="num">$${p.treasury}M</b></div><div><span>Forces</span> <b class="num">${UNITS.filter((u) => u.owner === owner).length}</b></div><div><span>Commanders</span> ${p.delegates.map(esc).join(', ') || 'Crisis staff'}</div>${regionLine}</div></div>`;
}
function select(type, id, region, at) {
  selected = { type, id, region, at: at ? [+at[0].toFixed(3), +at[1].toFixed(3)] : null }; confirmKill = null; if (EDIT) setTimeout(renderEdit, 0);
  if (mapGlobe) { mapGlobe.selectedUnit = type === 'unit' ? id : null; mapGlobe.markSelected(mapGlobe.selectedUnit); mapGlobe.repaintOcc(type === 'country' ? id : null); }
  renderSel();
}
function renderFloor() {
  const el = $('floorcard'); if (!el) return; const d = (STATE.directives || []).find((x) => x.status === 'floor');
  el.hidden = !d; if (!d) return;
  el.innerHTML = `<span class="card-title">On the floor</span><b>Directive ${esc(d.no)}: ${esc(d.title)}</b><ol>${d.clauses.map((c) => `<li>${esc(c)}</li>`).join('')}</ol><small>Sponsors: ${d.sponsors.map(esc).join(', ')} · Vote by placard</small>`;
}

/* ---------- Delegate laptop ---------- */
const ICON = {
  fleet: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M4 19h24l-4 7H8z"/><path d="M13 19v-7h7v7M16 12V6"/></svg>',
  money: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.2"><ellipse cx="16" cy="9" rx="10" ry="4"/><path d="M6 9v7c0 2.2 4.5 4 10 4s10-1.8 10-4V9M6 16v7c0 2.2 4.5 4 10 4s10-1.8 10-4v-7"/></svg>',
  op: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="16" cy="16" r="10"/><circle cx="16" cy="16" r="4"/><path d="M16 2v6M16 24v6M2 16h6M24 16h6"/></svg>',
  secret: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><rect x="5" y="8" width="22" height="16" rx="2"/><path d="M5 10l11 8 11-8"/></svg>',
  press: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M5 7h18v19H8a3 3 0 0 1-3-3z"/><path d="M23 12h4v11a3 3 0 0 1-3 3M9 12h10M9 17h10M9 21h6"/></svg>',
  treaty: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M8 4h12l5 5v19H8z"/><path d="M12 14h9M12 18h9M12 22h5"/></svg>',
  spy: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M4 14h24M8 14l3-8h10l3 8"/><circle cx="10.5" cy="21" r="4"/><circle cx="21.5" cy="21" r="4"/><path d="M14.5 21h3"/></svg>',
  build: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M4 27V14l7 4v-4l7 4v-4l7 4v9z"/><path d="M24 14V5h3v9"/></svg>',
  propaganda: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M5 13v6h4l10 6V7L9 13z"/><path d="M23 11c2 1.5 2 8.5 0 10M26 8c3.5 3 3.5 13 0 16"/></svg>',
};
// One open box for any plan, plus quick forms for the common moves the app can carry out by itself.
const ACTIONS = [{ id: 'secret', label: 'Crisis note' }, { id: 'fleet', label: 'Move forces' }, { id: 'build', label: 'Build forces' }, { id: 'money', label: 'Send money' }];
let action = 'secret', visibility = 'private', pickedForce = null, drafting = false, fogSig = '', pickLoc = null, followParent = null;
const myUnits = () => UNITS.filter((x) => x.owner === ME && MEE.commands.includes(x.kind));
const TO = () => ORDER.filter((n) => n !== ME).map((n) => POWERS[n].label).concat(['Romania', 'Turkey', 'Belgium', 'Netherlands']);

let seenReq = null, seenIntel = null, seenMsg = null, seenSign = null, seenDraft = null, seenBlocs = null;
function notifyDelegate() {
  const Q = STATE.queue || [], I = STATE.intel || [];
  if (seenIntel != null && I.length > seenIntel) { I.slice(0, I.length - seenIntel).reverse().forEach((r) => MAILQ.push({ kind: 'intel', key: 'i:' + r.from + '|' + r.text, r })); $('t-intel').classList.add('ping'); }
  const inbox = (STATE.messages || []).filter((m) => m.from !== MEE.name);
  if (seenMsg != null && inbox.length > seenMsg) { inbox.slice(seenMsg).forEach((m) => {
    const b = m.bloc && !m.intercepted && (STATE.blocs || []).find((x) => x.id === m.bloc);
    if (b) { if (CHAT === b.id) return; MAILQ = MAILQ.filter((x) => x.key !== 'b:' + b.id); MAILQ.push({ kind: 'bloc', key: 'b:' + b.id, b, m }); }
    else MAILQ.push({ kind: 'note', key: 'm:' + m.id, m });
  }); $('t-msg').classList.add('ping'); }
  const blocIds = new Set((STATE.blocs || []).map((b) => b.id));
  if (seenBlocs) for (const b of STATE.blocs || []) if (!seenBlocs.has(b.id) && b.owner !== MEE.name) notify({ kind: 'note', title: `You were added to ${b.name}`, body: `${b.owner} started a bloc with ${b.members.length - 1} others.`, action: { label: 'Open it', run: () => openBloc(b.id) }, ms: 7000 });
  seenBlocs = blocIds;
  seenMsg = inbox.length;
  const askSign = (STATE.directives || []).filter((d) => d.status === 'signing' && d.requested.includes(MEE.name) && !d.signed.includes(MEE.name));
  if (seenSign) for (const d of askSign) if (!seenSign.has(d.id)) notify({ kind: 'sign', title: 'You were asked to sign a directive', body: d.title, action: { label: 'Open Directives', run: () => showTab('dir') }, ms: 7000 });
  seenSign = new Set(askSign.map((d) => d.id));
  const shared = (STATE.directives || []).filter((d) => d.status === 'drafting' && d.owner !== MEE.name && d.authors?.includes(MEE.name));
  if (seenDraft) for (const d of shared) if (!seenDraft.has(d.id)) notify({ kind: 'sign', title: `${d.owner} invited you to write a directive`, body: d.title || 'Untitled directive', action: { label: 'Open it', run: () => openLaptop(d.id) }, ms: 8000 });
  seenDraft = new Set(shared.map((d) => d.id));
  seenIntel = I.length; renderMailbox();
}
function renderDelegate(first, prev) {
  const r = MEE; if (!r) return; notifyDelegate(); renderMessages();
  if (first) {
    $('who-flag').innerHTML = flag(ME) + `<em>${initials(r.name)}</em>`; $('who-name').textContent = r.name;
    $('who-role').textContent = r.political ? `${r.role} · ${POWERS[ME].label} · diplomacy, war and peace` : `${r.role} · ${POWERS[ME].label} · commands ${r.commands.map((k) => KIND_NAME[k].toLowerCase()).join(', ')}`;
    const own = S.BACKROOM.filter((b) => b.country === ME), other = S.BACKROOM.filter((b) => b.country !== ME);
    $('c-to').innerHTML = `<option value="">Crisis staff</option>${own.length ? `<optgroup label="Your government (backroom)">${own.map((b) => `<option value="${esc(b.name)}">${esc(b.name)}, ${esc(b.title)}</option>`).join('')}</optgroup>` : ''}<optgroup label="Foreign leaders (backroom)">${other.map((b) => `<option value="${esc(b.name)}">${esc(b.name)}, ${esc(b.title)}</option>`).join('')}</optgroup>`;
    renderTiles(); renderForm(); renderPortfolio();
  }
  $('my-money').textContent = `$${POWERS[ME].treasury}M`; $('my-forces').textContent = myUnits().length; $('my-update').textContent = STATE.update.no;
  if (pickedForce && !myUnits().some((u) => u.id === pickedForce)) { pickedForce = null; renderForm(); }
  renderIntel(); renderDirectives(); if (LAPID) syncDocs();
  if (!first) renderPortfolio();
  if (delGlobe) {
    delGlobe.sync(prev);
    const sig = JSON.stringify([UNITS.map((u) => [u.id, u.at]), AGENTS, LIVE_ARROWS, CONTROL, RECON]);
    if (sig !== fogSig) { fogSig = sig; repaintFog(); }
  }
}
function repaintFog() {
  if (!delGlobe) return;
  delGlobe.repaintFog(); delGlobe.repaintOcc(null); delGlobe.addLights(); delGlobe.addPins();
}
function setPick(loc) { pickLoc = loc; if (delGlobe) { delGlobe.pick = loc ? { at: loc.at, label: 'Crisis note here' } : null; delGlobe.addPins(); } }
function pickGround(lon, lat) {
  if (action !== 'secret' || !$('compose')?.classList.contains('min')) return false;
  const rid = regionAt(lon, lat); const rg = rid && REGION[rid]; const country = countryAt(lon, lat);
  const holder = rg ? ctrlOf(rg) : country ? (OWNER[country] || A.wsub?.[country] || country) : null;
  const kind = action === 'build' ? BUILD_KIND[$('f-btype')?.value] : null;

  const where = rg ? rg.name : country ? (LABEL_TEXT[country] || country) : 'open sea';
  setPick({ at: [+lon.toFixed(3), +lat.toFixed(3)], where }); renderLoc(); if ($('compose').classList.contains('min')) minCompose(false); return true;
}
function pickForce(id) {
  const u = UNITS.find((x) => x.id === id); if (!u) return;
  if (u.owner === ME && !MEE.commands.includes(u.kind)) { const boss = ROSTER.find((x) => x.country === ME && x.commands.includes(u.kind)); toast(`${u.name} is under ${boss ? boss.name + "'s" : "another commander's"} command. You control ${MEE.commands.map((k) => KIND_NAME[k].toLowerCase()).join(' and ')}.`); return; }
  if (u.owner !== ME) { toast(`${u.name} belongs to ${POWERS[u.owner].label}. You can only command ${POWERS[ME].label} forces.`); return; }
  pickedForce = id; action = 'fleet'; delGlobe.selectedUnit = id; delGlobe.markSelected(id);
  showTab('act'); renderTiles(); renderForm();
}
/* ---------- Cities: who holds them, what is there, and building ---------- */
function cityHold(c) { const rid = regionAt(c.at[0], c.at[1]); const rg = rid && REGION[rid]; return rg ? ctrlOf(rg) : OWNER[c.country] || c.country; }
const canBuildIn = (c, kind) => ME && cityHold(c) === ME && (kind !== 'fleet' || c.port);
function showCity(name) {
  const c = S.CITY[name]; const el = $('citycard'); if (!c || !el) return;
  const holder = cityHold(c), base = OWNER[c.country] || c.country; const near = (at, r) => Math.hypot(at[0] - c.at[0], at[1] - c.at[1]) < r;
  const units = UNITS.filter((u) => near(u.at, 1.1)); const feats = FEATS.filter((f) => near(f.at, 0.6));
  const hl = POWERS[holder]?.label || holder, bl = POWERS[base]?.label || base;
  const status = holder !== base ? `<b class="occ">Occupied by ${esc(hl)}</b> (part of ${esc(bl)} before the war)` : POWERS[holder] ? `Held by ${esc(hl)}` : `Neutral: ${esc(c.country)}`;
  const kind = VIEW === 'delegate' && action === 'build' ? BUILD_KIND[$('f-btype')?.value] : null;
  const build = VIEW === 'delegate' && ME ? (canBuildIn(c, kind) ? `<button type="button" class="dbtn gold" id="cc-build">Build here</button>` : `<p class="formnote">${holder !== ME ? `${POWERS[ME].label} cannot build here.` : 'No shipyard here. Ships need a port city.'}</p>`) : '';
  el.innerHTML = `<button type="button" class="ecard-x" id="cc-x" aria-label="Close">✕</button>
    <div class="cchead">${POWERS[holder] ? flag(holder) : ''}<div><b>${esc(c.name)}</b><span>${c.capital ? 'Capital · ' : ''}${c.port ? 'Port · ' : ''}${esc(c.country)}</span></div></div>
    <p class="ccstat">${status}</p><p class="ccnote">${esc(c.note)}</p>
    <dl class="ccdl"><div><dt>Forces nearby</dt><dd>${units.length ? units.map((u) => `${flag(u.owner)} ${esc(u.name)} · ${S.realText(u)}`).join('<br>') : 'None you can see'}</dd></div>
    ${feats.length ? `<div><dt>Here</dt><dd>${feats.map((f) => `${esc(f.label)}${featState(f) === 'building' ? ' (being built)' : featState(f) === 'ruined' ? ' (destroyed)' : ''}`).join('<br>')}</dd></div>` : ''}
    <div><dt>Builds here</dt><dd>${c.port ? 'Infantry, tanks, aircraft and ships' : 'Infantry, tanks and aircraft (no shipyard)'}</dd></div></dl>${build}`;
  el.hidden = false; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  $('cc-x').addEventListener('click', () => (el.hidden = true));
  $('cc-build')?.addEventListener('click', () => { action = 'build'; showTab('act'); renderTiles(); renderForm(); const sel = $('f-city'); if (sel) { sel.value = c.name; sel.dispatchEvent(new Event('change')); } el.hidden = true; });
}
/* Pop-up paper for writing, and the portfolio briefcase */
function openCompose(id = 'compose') {
  const el = $(id); el.classList.remove('min', 'closing', 'sent'); $('c-restore').hidden = true;
  if (id === 'compose') $('c-from').textContent = ` · From: ${MEE.name}`;
  el.hidden = true; void el.offsetWidth; el.hidden = false;
  setTimeout(() => (id === 'compose' ? $('f-text') : $('msg-text'))?.focus({ preventScroll: true }), CALM() ? 0 : 320);
}
function closeCompose(id = 'compose', sent) {
  const el = $(id); if (!el || el.hidden) return; el.classList.add(sent ? 'sent' : 'closing'); $('c-restore').hidden = true;
  if (sent) { const pl = document.createElement('span'); pl.className = 'plane big'; pl.innerHTML = NICON.sent; pl.style.left = '50%'; pl.style.top = '55%'; if (!CALM()) document.body.appendChild(pl); setTimeout(() => pl.remove(), 1200); }
  setTimeout(() => { el.hidden = true; el.classList.remove('closing', 'sent', 'min'); }, CALM() ? 0 : sent ? 520 : 220);
}
function minCompose(on) { const el = $('compose'); el.classList.toggle('min', on); $('c-restore').hidden = !on; if (!on) setTimeout(() => $('f-text')?.focus({ preventScroll: true }), 250); }
function openBrief() {
  renderPortfolio(); const el = $('brief'); el.className = 'brief'; el.hidden = true; void el.offsetWidth; el.hidden = false; el.classList.add('opening');
  setTimeout(() => el.classList.add('open'), CALM() ? 0 : 900); setTimeout(() => $('brief-close').focus({ preventScroll: true }), CALM() ? 0 : 950);
}
function closeBrief() { const el = $('brief'); if (!el || el.hidden) return; el.classList.add('closing'); setTimeout(() => { el.hidden = true; el.className = 'brief'; }, CALM() ? 0 : 240); }
function renderTiles() {
  $('tiles').innerHTML = `<div class="quick" role="group" aria-label="Kind of request">${ACTIONS.map((a) => `<button type="button" class="qchip${a.id === 'secret' ? ' main' : ''}" data-a="${a.id}" aria-pressed="${a.id === action}">${a.label}</button>`).join('')}</div>`;
  $('tiles').querySelectorAll('.qchip').forEach((b) => b.addEventListener('click', () => { action = b.dataset.a; setPick(null); renderTiles(); renderForm(); }));
  if (action !== 'build' && delGlobe?.pick && !pickLoc) { delGlobe.pick = null; delGlobe.addPins(); }
}
const locBlock = (required, note) => `<div class="${pickLoc ? 'picked' : 'pickprompt'}">${pickLoc ? `<div style="grid-column:1/3"><b>${esc(pickLoc.where)}</b><span>Location chosen. Click the map again to change it.</span></div><button type="button" class="unpick" aria-label="Clear location">✕</button>` : `${required ? 'Click your own territory on the map to choose where to build.' : (note ? 'Optional: use "Mark a spot on the map" if your plan happens somewhere specific.' : 'Optional: mark where the operation happens.')}<span>${required ? 'Ships must be built on a coast. Crisis staff check the location.' : (note ? 'Crisis staff will see the spot you mark.' : 'Air reconnaissance reveals enemy units around the spot you pick.')}</span>`}</div>`;
// Update only the location box so the rest of the form keeps what the delegate already chose.
function renderLoc() {
  const box = $('f-loc'); if (!box) return renderForm();
  box.innerHTML = locBlock(action === 'build', action === 'secret');
  box.querySelector('.unpick')?.addEventListener('click', () => { setPick(null); renderLoc(); });
}
function renderForm() {
  const paper = action === 'secret'; const f = paper ? $('cform') : $('form'); let body = '';
  if (paper) { $('form').innerHTML = `<button type="button" class="send launch" id="open-note">${PEN}${followParent ? 'Write your follow-up' : 'Write a crisis note'}</button><p class="formnote">Your note opens on paper. Anything your character could really do: attack, spy, sabotage, build, propaganda, a treaty, a press release, declaring war.</p>`; $('open-note').addEventListener('click', () => openCompose()); }
  else $('cform').innerHTML = '';
  if (action === 'fleet') {
    const u = UNITS.find((x) => x.id === pickedForce);
    body = u ? `<div class="picked">${flag(u.owner)}<div><b>${esc(u.name)}</b><span>${KIND_NAME[u.kind]} · ${S.realText(u)}</span></div><button type="button" class="unpick" aria-label="Clear selected force">✕</button></div>
      <label for="f-dest">Destination<select id="f-dest">${opt(DEST_BY_KIND[u.kind])}</select></label>`
      : `<div class="pickprompt">Click one of your forces on the map to select it.<span>${myUnits().length ? 'Your forces: ' + myUnits().map((x) => esc(x.name)).join(', ') : 'You have no forces on the map. Use other actions instead.'}</span></div>`;
  }
  if (action === 'spy') body = `<label for="f-target">Target country<select id="f-target">${Object.keys(CAPITAL).filter((k) => k !== POWERS[ME].label && k !== ME).map((k) => `<option>${esc(k)}</option>`).join('')}</select></label>
    <label for="f-mission">Mission<select id="f-mission">${opt(['Gather intelligence', 'Steal war plans', 'Sabotage rail lines', 'Sabotage factories', 'Spread false information', 'Recruit an informant'])}</select></label>
    <label for="f-cover">Agent's cover<select id="f-cover">${opt(['Diplomat', 'Journalist', 'Businessman', 'Refugee'])}</select></label>
    <label for="f-spycost">Budget ($ millions)<input id="f-spycost" type="number" min="1" max="9999" value="3"></label>
    <label for="f-text">Plan (optional)<textarea id="f-text" maxlength="1200" placeholder="Anything specific your agent should do."></textarea></label>
    <p class="formnote">Spy missions are always private. Crisis staff decide if your agent succeeds, fails, or gets caught.</p>`;
  if (action === 'money') body = `<label for="f-to">Send to<select id="f-to">${opt(TO())}</select></label><label for="f-amt">Amount ($ millions)<input id="f-amt" type="number" min="1" max="9999" value="10"></label><label for="f-text">Purpose (optional)<textarea id="f-text" maxlength="1200"></textarea></label>`;
  const LOC = locBlock;
  if (action === 'build') body = `<label for="f-btype">What to build<select id="f-btype">${opt(Object.keys(BUILD))}</select></label><label for="f-city">Where<select id="f-city"></select></label><p class="formnote">Forces can only be built in cities ${POWERS[ME].label} holds. Ships need a port city. You can also click a city on the map.</p><label for="f-bqty">How many<input id="f-bqty" type="number" min="1" max="10" value="1"></label><p class="formnote" id="f-bcost"></p>`;
  if (action === 'op') body = `<div id="f-loc">${LOC(false)}</div><label for="f-op">Operation<select id="f-op">${opt(['Naval blockade', 'Escort convoys', 'Air reconnaissance', 'Evacuate civilians', 'Other (describe below)'])}</select></label><label for="f-cost">Budget ($ millions)<input id="f-cost" type="number" min="1" max="9999" value="20"></label><label for="f-text">Details<textarea id="f-text" maxlength="1200" placeholder="Where, when and how."></textarea></label>`;
  if (action === 'propaganda') body = `<label for="f-aud">Audience<select id="f-aud">${opt(['People at home', 'Neutral countries', 'People in Germany', 'People in Britain', 'People in France', 'People in Italy', 'People in the Soviet Union', 'The United States', 'Japan'])}</select></label><label for="f-text">Message<textarea id="f-text" maxlength="1200" placeholder="What do you want them to believe?"></textarea></label>`;
  if (action === 'treaty') body = `<label for="f-with">Treaty with<select id="f-with">${ORDER.filter((k) => k !== ME).map((k) => `<option value="${k}">${POWERS[k].label}</option>`).join('')}</select></label>`;
  if (action === 'secret') body = `${followParent ? `<div class="picked"><div style="grid-column:1/3"><b>Follow-up</b><span>${esc((STATE.queue.find((q) => q.id === followParent) || {}).title || '')}</span></div><button type="button" class="unfollow unpick" aria-label="Stop following up">✕</button></div>` : ''}`;
  if (['secret', 'press', 'treaty'].includes(action)) body += `<label for="f-text" class="${action === 'secret' ? 'bigask' : ''}">${{ secret: 'What do you want to do?', press: 'Statement', treaty: 'Terms' }[action]}<textarea id="f-text" maxlength="1200"${action === 'secret' ? ' rows="6"' : ''} placeholder="${{ secret: 'Anything your character could really do: attack, spy, sabotage, build defenses, propaganda, a treaty, a press release, declaring war. For example: Attack the French forces on the Saar front with Army Group C at dawn.', press: 'What do you want to announce?', treaty: 'Who is the treaty with, and what does each side agree to?' }[action]}"></textarea></label>`;
  if (action === 'secret') body += `<p class="formnote">Say who does it, where, how and with what. Public notes are announced to the room, like a press release. Private notes stay between you and crisis staff.</p><label for="f-cost">Budget, if any ($ millions)<input id="f-cost" type="number" min="0" max="9999" value="0"></label><div id="f-loc">${locBlock(false, true)}</div>`;
  const forced = action === 'spy' ? 'private' : action === 'press' ? 'public' : null; const vis = forced || visibility;
  const visRow = forced ? '' : `<div class="vis" role="group" aria-label="Who can see this"><button type="button" data-v="private" aria-pressed="${vis === 'private'}">Private</button><button type="button" data-v="public" aria-pressed="${vis === 'public'}">Public</button></div>`;
  f.innerHTML = paper ? body + `<div class="cfoot">${visRow}<button type="button" class="lbtn" id="c-mark">Mark a spot on the map</button></div><div class="cbtns"><button type="button" class="lbtn" data-cclose>Close</button><button class="lbtn main send" type="submit">${PLANE}Send to crisis staff</button></div>`
    : body + visRow + `<button class="send" type="submit">${action === 'spy' ? 'Send agent' : 'Send to crisis staff'}</button>`;
  f.querySelector('#c-mark')?.addEventListener('click', () => minCompose(true));
  f.querySelectorAll('.vis button').forEach((b) => b.addEventListener('click', () => { visibility = b.dataset.v; f.querySelectorAll('.vis button').forEach((x) => x.setAttribute('aria-pressed', x === b)); }));
  f.querySelector('#f-loc .unpick')?.addEventListener('click', () => { setPick(null); renderLoc(); });
  f.querySelector('.unfollow')?.addEventListener('click', () => { followParent = null; renderForm(); });
  f.querySelector('.picked:not(#f-loc .picked) .unpick')?.addEventListener('click', () => { pickedForce = null; if (delGlobe) { delGlobe.selectedUnit = null; delGlobe.markSelected(null); } renderForm(); });
  if (action === 'build') {
    const fillCities = () => { const kind = BUILD_KIND[f.querySelector('#f-btype').value]; const sel = f.querySelector('#f-city'); const was = sel.value; const ok = Object.values(S.CITY).filter((c) => canBuildIn(c, kind)).sort((a, b) => b.capital - a.capital || a.name.localeCompare(b.name)); sel.innerHTML = ok.length ? ok.map((c) => `<option${c.name === was ? ' selected' : ''}>${esc(c.name)}</option>`).join('') : '<option value="">No city you hold can build this</option>'; };
    f.querySelector('#f-btype').addEventListener('change', fillCities); fillCities();
    f.querySelector('#f-city').addEventListener('change', () => { const c = S.CITY[f.querySelector('#f-city').value]; if (c && delGlobe) { delGlobe.pick = { at: c.at, label: 'Build in ' + c.name }; delGlobe.addPins(); } });
    f.querySelector('#f-city').dispatchEvent(new Event('change'));
    const upd = () => { const c = BUILD[f.querySelector('#f-btype').value] * (+f.querySelector('#f-bqty').value || 0); f.querySelector('#f-bcost').textContent = `Cost: $${c}M of your $${POWERS[ME].treasury}M treasury. Adds about ${S.realText({ kind: BUILD_KIND[f.querySelector('#f-btype').value], owner: ME }, +f.querySelector('#f-bqty').value || 0)}.`; }; f.querySelector('#f-btype').addEventListener('change', upd); f.querySelector('#f-bqty').addEventListener('input', upd); upd(); }
}
function summary() {
  const v = (id) => $(id)?.value;
  if (action === 'fleet') { const u = UNITS.find((x) => x.id === pickedForce); return u ? `Move ${u.name}: ${v('f-dest')}` : ''; }
  if (action === 'spy') return `Spy to ${CITY_OF[v('f-target')] || v('f-target')}: ${v('f-mission').toLowerCase()}`;
  if (action === 'money') return `Send $${v('f-amt')}M to ${v('f-to')}`;
  if (action === 'build') return `Build ${v('f-bqty')} × ${v('f-btype').toLowerCase()}${v('f-city') ? ' in ' + v('f-city') : ''}`;
  if (action === 'op') return `Fund ${v('f-op').toLowerCase()} with $${v('f-cost')}M${pickLoc ? ' near ' + pickLoc.where : ''}`;
  if (action === 'treaty') { const t = (v('f-text') || '').trim(); return t ? `Treaty with ${POWERS[v('f-with')].label}: ${t.length > 50 ? t.slice(0, 47) + '...' : t}` : ''; }
  const t = (v('f-text') || '').trim(); const kind = { secret: followParent ? 'Follow-up' : v('c-to') ? `Note to ${v('c-to')}` : 'Crisis note', press: 'Press release', treaty: 'Treaty proposal', propaganda: `Propaganda to ${(v('f-aud') || '').replace(/^People/, 'people')}` }[action];
  return t ? `${kind}: ${t.length > 60 ? t.slice(0, 57) + '...' : t}` : '';
}
async function submitAction(e) {
  e.preventDefault(); const s = summary();
  if (!s) { toast(action === 'fleet' ? 'Click one of your forces on the map first.' : 'Write your request before sending it.'); return; }
  const v = (id) => $(id)?.value; const detail = {};
  if (action === 'fleet') Object.assign(detail, { unit: pickedForce, dest: v('f-dest') });
  if (action === 'spy') Object.assign(detail, { target: v('f-target'), mission: v('f-mission'), cover: v('f-cover'), cost: +v('f-spycost') });
  if (action === 'money') Object.assign(detail, { to: v('f-to'), amount: +v('f-amt') });
  if (action === 'build') { if (!v('f-city')) { toast('Pick a city you hold to build in.'); return; } Object.assign(detail, { btype: v('f-btype'), qty: +v('f-bqty'), city: v('f-city') }); }
  if (action === 'op') Object.assign(detail, { op: v('f-op'), cost: +v('f-cost'), ...(pickLoc ? { at: pickLoc.at, where: pickLoc.where } : {}) });
  if (action === 'treaty') detail.with = v('f-with');
  if (action === 'secret') Object.assign(detail, { ...(v('c-to') ? { to: v('c-to') } : {}), cost: +v('f-cost') || 0, ...(pickLoc ? { at: pickLoc.at, where: pickLoc.where } : {}), ...(followParent ? { parent: followParent } : {}) });
  const btn = e.target.querySelector('.send'); btn.disabled = true;
  const ok = await act({ type: 'request', kind: action, title: s, vis: visibility, detail, text: v('f-text') }, { quiet: true });
  btn.disabled = false;
  if (ok) {
    if (action === 'secret') closeCompose('compose', true); else flyFrom(btn);
    notify({ kind: 'sent', title: { fleet: 'Orders sent!', build: 'Build order sent!', money: 'Transfer sent!', spy: 'Agent sent!' }[action] || (followParent ? 'Follow-up sent!' : 'Crisis note sent!'), body: `${s}. A letter will appear on your map when crisis staff answer.` }); if (action === 'fleet') { pickedForce = null; delGlobe?.markSelected(null); } if (['build', 'op', 'secret'].includes(action)) setPick(null); followParent = null; renderForm(); }
}
// Items seen for the first time get a slide-in; the first render of each list never animates.
const SEEN = {};
function freshKeys(list, keys) { const had = SEEN[list]; SEEN[list] = new Set(keys); return had ? new Set(keys.filter((k) => !had.has(k))) : new Set(); }
// Long reports open full screen; the lists only show a one-line summary.
let INTEL_LIST = [], MSG_LIST = []; const READ = new Set();
// Each kind of document gets its own paper: notes on torn lined paper, intel in a typed secret file, directives as official documents.
const rnd = (a, b) => a + Math.random() * (b - a);
function tornClip() {
  const top = [], bot = []; for (let x = 0; x <= 100; x += 2.5) { top.push(`${x}% ${rnd(0, 9).toFixed(1)}px`); bot.unshift(`${x}% calc(100% - ${rnd(0, 9).toFixed(1)}px)`); }
  return `polygon(${top.join(',')},${bot.join(',')})`;
}
function paperHTML(o) {
  const P = (t) => esc(t).replace(/\n/g, '<br>');
  if (o.theme === 'note') return `<span class="tape" aria-hidden="true"></span><p class="nmeta">${esc(o.time || '')}</p>
    <h3 id="rd-title" class="hand">${esc(o.title)}</h3><p class="hand nbody">${P(o.body)}</p>${o.stamp ? `<span class="stamp red">${esc(o.stamp)}</span>` : ''}`;
  if (o.theme === 'dossier') return `<span class="ftab">${esc(o.kicker)}</span><p class="type tsmall">${esc(o.file || '')}</p>
    <h3 id="rd-title" class="type">${esc(o.title)}</h3>${o.rel ? `<p class="type tsmall">Reliability: <b class="rel-${esc(String(o.rel).toLowerCase())}">${esc(o.rel)}</b></p>` : ''}
    <p class="type tbody">${P(o.body)}</p><span class="stamp red">${esc(o.stamp || 'Secret')}</span>`;
  if (o.theme === 'directive') { const d = o.d; return `<p class="dhead">San Luis Obispo Model United Nations II<br>Crisis Committee</p><p class="dno">${d.no ? 'Directive ' + esc(d.no) : 'Draft directive'}</p>
    <h3 id="rd-title" class="dtitle">${esc(d.title)}</h3><ol class="dclauses">${d.clauses.map((c) => `<li>${esc(c)}</li>`).join('')}</ol>
    <div class="dsig"><div><span>Sponsors</span><b class="hand">${d.sponsors.map(esc).join(', ')}</b></div><div><span>Signatories</span><b class="hand">${d.signed.filter((n) => !d.sponsors.includes(n)).map(esc).join(', ') || '—'}</b></div></div>
    ${d.vote ? `<p class="dvote">${esc(d.vote)}</p>` : ''}<span class="stamp ${{ passed: 'green', failed: 'red' }[d.status] || 'blue'}">${esc(DSTATUS[d.status])}</span>`; }
  return `<p class="rkick">${esc(o.kicker || '')}</p><h3 id="rd-title">${esc(o.title)}</h3><p class="rbody">${P(o.body || '')}</p>`;
}
function openReader(o) {
  const el = $('reader'), card = $('rd-card'), paper = $('rd-paper');
  card.className = 'rcard ' + (o.theme || 'plain'); paper.innerHTML = paperHTML(o); paper.style.clipPath = o.theme === 'note' ? tornClip() : '';
  card.style.setProperty('--tilt', '0deg');
  el.className = 'reader'; el.hidden = true; void el.offsetWidth; el.hidden = false; paper.scrollTop = 0;
  setTimeout(() => $('rd-close').focus({ preventScroll: true }), CALM() ? 0 : 500);
}
function closeReader() { const el = $('reader'); if (!el || el.hidden) return; el.classList.add('closing'); setTimeout(() => { el.hidden = true; el.className = 'reader'; }, CALM() ? 0 : 240); }
/* ---------- Blocs: group chats for passing notes ---------- */
let CHAT = null; const BLOC_SEEN = {};
const blocMsgs = (id) => (STATE.messages || []).filter((m) => m.bloc === id && !m.intercepted);
function renderBlocs() {
  const box = $('blocs'); if (!box) return; const me = MEE.name;
  if (!renderBlocs.ready) { for (const b of STATE.blocs || []) BLOC_SEEN[b.id] = blocMsgs(b.id).filter((m) => m.from !== me).length; renderBlocs.ready = true; }
  for (const b of STATE.blocs || []) if (!(b.id in BLOC_SEEN) && b.owner === me) BLOC_SEEN[b.id] = 0;
  box.innerHTML = (STATE.blocs || []).map((b) => { const ms = blocMsgs(b.id); const last = ms[ms.length - 1]; const unread = ms.filter((m) => m.from !== me).length > (BLOC_SEEN[b.id] ?? 0);
    return `<button type="button" class="req tap blocrow${unread ? ' unread' : ''}" data-bloc="${b.id}"><b>${esc(b.name)}</b><span class="formnote">${b.members.length} members</span><small>${last ? `${last.from === me ? 'You' : esc(last.from.split(' ').slice(-1)[0])}: ${esc(last.text)}` : 'No notes yet'}</small><i class="chev" aria-hidden="true">›</i></button>`; }).join('');
}
function openBloc(id) {
  CHAT = id; MAILQ = MAILQ.filter((x) => x.key !== 'b:' + id); renderMailbox(); $('ch-inv').hidden = true;
  const el = $('chat'); el.className = 'chat'; el.hidden = true; void el.offsetWidth; el.hidden = false; renderChat(true);
  setTimeout(() => $('ch-text').focus({ preventScroll: true }), CALM() ? 0 : 300);
}
function closeBloc() { const el = $('chat'); if (!el || el.hidden) return; el.classList.add('closing'); setTimeout(() => { el.hidden = true; el.className = 'chat'; CHAT = null; renderBlocs(); }, CALM() ? 0 : 220); }
function renderChat(jump) {
  const b = (STATE.blocs || []).find((x) => x.id === CHAT); if (!b) { if (CHAT) { notify({ title: 'You are no longer in that bloc' }); closeBloc(); } return; }
  const me = MEE.name; const ms = blocMsgs(b.id); BLOC_SEEN[b.id] = ms.filter((m) => m.from !== me).length;
  $('ch-name').textContent = b.name; $('ch-members').textContent = b.members.map((n) => (n === me ? 'you' : n)).join(', ');
  const log = $('ch-log'); const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
  const sig = ms.map((m) => m.id).join(); if (log.dataset.sig !== sig) {
    log.dataset.sig = sig;
    log.innerHTML = ms.map((m, i) => { const mine = m.from === me; const first = i === 0 || ms[i - 1].from !== m.from;
      return `<div class="chmsg${mine ? ' mine' : ''}${first ? ' first' : ''}">${first && !mine ? `<span class="chwho" style="color:${authCol(m.from)}">${esc(m.from)} <small>${esc(POWERS[S.rosterEntry(m.from)?.country]?.label || '')}</small></span>` : ''}<p>${esc(m.text)}</p><time>${esc(m.time)}</time></div>`; }).join('') || '<p class="formnote chempty">No notes yet. Say hello to the bloc.</p>';
    if (jump || atBottom) log.scrollTop = log.scrollHeight;
  }
  $('ch-invlist').innerHTML = ROSTER.filter((r) => !b.members.includes(r.name)).map((r) => `<label><input type="checkbox" value="${esc(r.name)}"><span>${esc(r.name)}</span></label>`).join('') || '<span class="formnote">Everyone is already in this bloc.</span>';
  renderBlocs();
}
async function sendChat(e) {
  e?.preventDefault(); const t = $('ch-text'); const text = t.value.trim(); if (!text || !CHAT) return;
  t.value = ''; if (!(await act({ type: 'msg.send', bloc: CHAT, text }, { quiet: true }))) t.value = text; else { renderChat(true); $('ch-log').scrollTop = $('ch-log').scrollHeight; }
}
function renderIntel() {
  const I = STATE.intel || []; setCount($('c-intel'), I.length);
  const fresh = freshKeys('intel', I.map((r) => r.from + '|' + r.text));
  INTEL_LIST = I;
  $('intel').innerHTML = I.map((r, i) => { const k = 'i:' + r.from + '|' + r.text; return `<button type="button" class="req tap${fresh.has(r.from + '|' + r.text) ? ' new' : ''}${READ.has(k) ? '' : ' unread'}" data-intel="${i}"><b>${esc(r.from)}</b><span class="pill rel-${esc(r.rel).toLowerCase()}">${esc(r.rel)}</span><small>${esc(r.text)}</small><i class="chev" aria-hidden="true">›</i></button>`; }).join('') || '<p class="formnote">No intelligence yet. Send spies to learn more.</p>';
}
function renderMessages() {
  const myBlocs = STATE.blocs || []; const inBloc = (m) => m.bloc && myBlocs.some((b) => b.id === m.bloc) && !m.intercepted;
  const M = (STATE.messages || []).filter((m) => !inBloc(m)).slice().reverse(); const me = MEE.name; setCount($('c-msg'), (STATE.messages || []).filter((m) => m.from !== me).length);
  renderBlocs(); if (CHAT) renderChat();
  const fresh = freshKeys('msg', M.map((m) => m.id));
  MSG_LIST = M;
  $('msgs').innerHTML = M.map((m, i) => `<button type="button" class="req tap msg${fresh.has(m.id) ? ' new' : ''}${m.from === me ? ' mine' : ''}${m.intercepted ? ' intercepted' : ''}${m.from === me || READ.has('m:' + m.id) ? '' : ' unread'}" data-msg="${i}"><b>${m.intercepted ? 'Intercepted: ' : ''}${m.from === me ? 'You' : esc(m.from)} → ${(m.to || []).map((n) => n === me ? 'you' : esc(n)).join(', ')}</b><span class="formnote">${esc(m.time)}</span><small>${esc(m.text)}</small><i class="chev" aria-hidden="true">›</i></button>`).join('') || '<p class="formnote">No notes yet. Pass private notes to other delegates to plan together. Crisis staff read everything, and spies can intercept notes.</p>';
}
// Small still pictures of the 3D models, drawn once by a shared offscreen renderer and reused.
let THR = null; const THUMBS = {};
function thumbOf(key, make) {
  if (key in THUMBS) return THUMBS[key];
  try {
    if (!THR) {
      const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); r.setPixelRatio(2); r.setSize(96, 72);
      const sc = new THREE.Scene(); sc.add(new THREE.AmbientLight(0xffffff, 0.8), new THREE.HemisphereLight(0xdfe8ff, 0x3a3020, 0.6));
      const sun = new THREE.DirectionalLight(0xfff4e0, 1.1); sun.position.set(3, 6, 4); sc.add(sun);
      const cam = new THREE.PerspectiveCamera(30, 96 / 72, 0.1, 100); cam.position.set(0, 2.3, 4.6); cam.lookAt(0, 0.05, 0); THR = { r, sc, cam };
    }
    const model = make(); const bb = new THREE.Box3().setFromObject(model); const sz = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
    const k = 2.4 / Math.max(sz.x, sz.y * 1.15, sz.z, 0.001); model.position.set(-c.x * k, -c.y * k, -c.z * k); model.scale.multiplyScalar(k);
    const pivot = new THREE.Group(); pivot.add(model); pivot.rotation.y = 0.7; THR.sc.add(pivot); THR.r.render(THR.sc, THR.cam);
    const url = THR.r.domElement.toDataURL('image/png'); THR.sc.remove(pivot); pivot.traverse((o) => o.isMesh && o.geometry.dispose());
    return (THUMBS[key] = url);
  } catch { return (THUMBS[key] = ''); }
}
const unitThumb = (kind, owner) => thumbOf(`u-${kind}-${owner}`, () => makeFigure({ id: 'th-' + kind, kind, owner, str: kind === 'air' ? 8 : 6, at: [0, 0] }));
const featThumb = (kind, owner) => thumbOf(`f-${kind}-${owner}`, () => makeProp({ id: 'th', kind, owner, at: [0, 0], ready: 0, ruined: false }));
const spyThumb = () => thumbOf('spy', () => { const f = spyFigure(); bakeFigure(f, null); return f; });
const pic = (url, dim) => url ? `<img class="pthumb${dim ? ' dim' : ''}" src="${url}" alt="" aria-hidden="true">` : '<span class="pthumb none" aria-hidden="true"></span>';
const ALWAYS_PIC = [() => spyThumb(), () => featThumb('depot', ME), () => featThumb('radio', ME), () => featThumb('hq', ME)];
function renderPortfolio() {
  const r = MEE; const units = myUnits(); const missing = KINDS.filter((k) => !r.commands.includes(k));
  const boss = (k) => ROSTER.find((x) => x.country === ME && x.commands.includes(k));
  const li = (img, html) => `<li class="pli">${img}<div>${html}</div></li>`;
  $('brief-body').innerHTML = `
    <div class="sec"><h3>Your powers</h3><ul class="plist">${r.political ? S.POLITICAL_POWERS.map((t, i) => li(pic([featThumb('embassy', ME), featThumb('hq', ME), featThumb('depot', ME), featThumb('radio', ME)][i]), t)).join('') : ''}${r.commands.map((k) => li(pic(unitThumb(k, ME)), POWER_TEXT[k])).join('')}${ALWAYS.map((a, i) => li(pic(ALWAYS_PIC[i]?.()), a)).join('')}</ul></div>
    <div class="sec"><h3>Your assets</h3><ul class="plist">
      ${units.length ? units.map((u) => li(pic(unitThumb(u.kind, u.owner)), `${esc(u.name)}<small>${KIND_NAME[u.kind]} · ${S.realText(u)}${u.traits?.length ? ' · ' + traitText(u) : ''} · ${esc(u.note)}</small>`)).join('') : '<li>No forces on the map</li>'}
      ${FEATS.filter((f) => f.owner === ME).map((f) => li(pic(featThumb(f.kind, f.owner)), `${esc(f.label)}<small>${esc(featTitle(f).split(' · ').slice(2).join(' · ') || 'Ready')}</small>`)).join('')}
      ${li(pic(featThumb('depot', ME)), `$${POWERS[ME].treasury}M national treasury<small>Shared with the other ${POWERS[ME].label} commanders</small>`)}
      ${AGENTS.map((g) => li(pic(spyThumb()), `Agent in ${esc(POWERS[g.target]?.label || g.target)}<small>${esc(g.mission || '')} · reveals forces nearby and can intercept notes</small>`)).join('')}
      <li>${SPECIAL[ME] || "Your government's contacts"}</li>${(STATE.assets || []).map((x) => `<li>${esc(x.text)}<small>Granted by crisis staff after update ${x.update}</small></li>`).join('')}</ul></div>
    <div class="sec"><h3>Not in your portfolio</h3><ul class="plist no">
      ${missing.map((k) => li(pic(unitThumb(k, ME), true), `${KIND_NAME[k]}${boss(k) ? ` (ask ${esc(boss(k).name)})` : ''}`)).join('')}${r.political ? '' : `<li>${esc(S.MILITARY_LIMIT(r))}</li>`}${LIMITS_ALWAYS.map((l) => `<li>${l}</li>`).join('')}<li>Backroom: write to leaders who are not delegates (Hitler, Stalin, Mussolini, Chiang Kai-shek and others) by picking them in "To:" on a crisis note</li></ul></div>
    <button type="button" class="secret secretbtn" data-secret><b>Secret objective</b><span>Open your sealed file</span><small class="formnote" style="display:block;margin-top:6px">Only you and crisis staff can see this.</small></button>`;
}
function updateDirCount() {
  const me = MEE.name; const n = (STATE.directives || []).filter((d) => d.status === 'signing' && d.requested.includes(me) && !d.signed.includes(me)).length;
  const cd = $('c-dir'); setCount(cd, n); cd.hidden = !n;
}
function renderDirectives() {
  const me = MEE.name; const box = $('p-dir'); const D = STATE.directives || [];
  const toSign = D.filter((d) => d.status === 'signing' && d.requested.includes(me) && !d.signed.includes(me));
  const drafts = D.filter((d) => d.status === 'drafting');
  const mine = D.filter((d) => d.status !== 'drafting' && (d.sponsors.includes(me) || d.signed.includes(me)));
  const floor = D.filter((d) => ['floor', 'chair', 'passed', 'failed'].includes(d.status) && !mine.includes(d));
  updateDirCount();
  const card = (d, extra = '') => `<div class="dir tapdir" data-dir="${d.id}" title="Click to read the full directive"><div class="dir-top"><b>${d.no ? 'Directive ' + esc(d.no) + ': ' : ''}${esc(d.title)}</b><span class="pill ${d.status}">${DSTATUS[d.status]}</span></div>
    <ol>${d.clauses.map((c) => `<li>${esc(c)}</li>`).join('')}</ol>
    <small>Sponsors: ${d.sponsors.map(esc).join(', ')}${d.status === 'signing' ? ` · Signatures ${d.signed.length} of ${SIGS_NEEDED}` : ` · Signed by ${d.signed.length}`}${d.vote ? ' · ' + esc(d.vote) : ''}</small>
    ${d.status === 'signing' ? `<div class="sigbar"><i style="width:${Math.min(100, (d.signed.length / SIGS_NEEDED) * 100)}%"></i></div>` : ''}${extra}</div>`;
  box.innerHTML = `
    ${toSign.length ? `<div class="sec"><h3>Asked to sign</h3>${toSign.map((d) => card(d, `<div class="row"><button type="button" class="dbtn gold" data-sign="${d.id}">Sign</button><button type="button" class="dbtn" data-decline="${d.id}">Decline</button></div>`)).join('')}</div>` : ''}
    <div class="sec"><h3>Your directives</h3>
      <button type="button" class="send launch" id="new-dir">${PEN}Write a new directive</button>
      ${drafts.map((d) => `<button type="button" class="req tap draftrow" data-open-draft="${d.id}"><b>${esc(d.title || 'Untitled directive')}</b><span class="pill drafting">Draft</span><small>${d.authors.length > 1 ? 'With ' + d.authors.filter((n) => n !== me).map(esc).join(', ') : 'Only you so far'} · ${d.clauses.filter((c) => c.trim()).length} clause${d.clauses.filter((c) => c.trim()).length === 1 ? '' : 's'}</small><i class="chev" aria-hidden="true">›</i></button>`).join('')}
      ${mine.map((d) => card(d, d.status === 'signing' && d.sponsors.includes(me) && d.signed.length >= SIGS_NEEDED ? `<button type="button" class="dbtn gold" data-submit="${d.id}">Submit to the chair</button>` : '')).join('') || '<p class="formnote">You have not sponsored or signed any directives yet.</p>'}
    </div>
    <div class="sec"><h3>Committee floor</h3>${floor.map((d) => card(d)).join('') || '<p class="formnote">Nothing on the floor right now.</p>'}</div>
    <p class="formnote">Directives need ${SIGS_NEEDED} signatures, including sponsors. The chair approves the format, then the committee votes out loud by placard.</p>`;
  box.querySelector('#new-dir')?.addEventListener('click', newDraft);
  box.querySelectorAll('[data-open-draft]').forEach((b) => b.addEventListener('click', () => openLaptop(b.dataset.openDraft)));
  box.querySelectorAll('[data-sign]').forEach((b) => b.addEventListener('click', () => act({ type: 'dir.sign', id: b.dataset.sign })));
  box.querySelectorAll('[data-decline]').forEach((b) => b.addEventListener('click', () => act({ type: 'dir.decline', id: b.dataset.decline })));
  box.querySelectorAll('[data-submit]').forEach((b) => b.addEventListener('click', () => act({ type: 'dir.submit', id: b.dataset.submit })));
}
/* ---------- Directive editor: a shared document on a laptop ---------- */
let LAPID = null; const docTimers = {}, docPending = {};
const AUTH_COL = ['#1A73E8', '#D93025', '#188038', '#E37400', '#9334E6', '#007B83', '#C5221F', '#5F6368'];
const authCol = (n) => { let h = 0; for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return AUTH_COL[h % AUTH_COL.length]; };
async function newDraft() {
  if (!(await act({ type: 'dir.draft' }, { quiet: true }))) return;
  const d = (STATE.directives || []).find((x) => x.status === 'drafting' && x.owner === MEE.name); if (d) openLaptop(d.id);
}
function openLaptop(id) {
  LAPID = id; const el = $('lap'); buildDocs(); el.className = 'lap'; el.hidden = true; void el.offsetWidth; el.hidden = false;
  setTimeout(() => { const d = curDraft(); (d && !d.title ? $('dc-title') : $('dc-c0'))?.focus({ preventScroll: true }); }, CALM() ? 0 : 650);
}
function closeLaptop() { flushDoc(); const el = $('lap'); if (!el || el.hidden) return; el.classList.add('closing'); setTimeout(() => { el.hidden = true; el.className = 'lap'; LAPID = null; }, CALM() ? 0 : 260); }
const curDraft = () => (STATE.directives || []).find((d) => d.id === LAPID);
function grow(t) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }
function buildDocs() {
  const d = curDraft(); if (!d) return; const me = MEE.name;
  const others = ROSTER.filter((r) => r.name !== me);
  $('docs').innerHTML = `<div class="dbar"><span class="dlogo" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 2h9l5 5v15H6z" fill="#1A73E8"/><path d="M15 2v5h5" fill="#8AB4F8"/><path d="M9 12h8M9 15h8M9 18h5" stroke="#fff" stroke-width="1.6"/></svg></span>
      <div class="dname"><b id="dc-name">${esc(d.title || 'Untitled directive')}</b><span id="dc-save">All changes saved</span></div>
      <div class="davs" id="dc-avs"></div><button type="button" class="dshare" id="dc-share">Share</button><button type="button" class="dx" id="dc-close" aria-label="Close the laptop">✕</button></div>
    <div class="dmenu" aria-hidden="true"><span>File</span><span>Edit</span><span>View</span><span>Insert</span><span>Format</span><span>Tools</span></div>
    <div class="dtool"><button type="button" id="dc-add">+ Add clause</button><span class="dsep"></span><span class="dhint">Everyone on this draft can type at once. Changes save by themselves.</span></div>
    <div class="dsharep" id="dc-sharep" hidden><b>Invite co-authors</b><p>Co-authors can edit with you and become sponsors.</p><div class="npc">${others.map((r) => `<label><input type="checkbox" value="${esc(r.name)}"${d.authors.includes(r.name) ? ' checked disabled' : ''}><span>${esc(r.name)}</span></label>`).join('')}</div><div class="row"><button type="button" class="dbtn gold" id="dc-invite">Invite</button><button type="button" class="dbtn" id="dc-sharex">Done</button></div></div>
    <div class="dcanvas"><div class="dpage">
      <p class="dp-head">San Luis Obispo Model United Nations II · Crisis Committee · Draft directive</p>
      <textarea id="dc-title" class="dp-title" rows="1" maxlength="120" placeholder="Directive title"></textarea>
      <p class="dp-lead">The committee directs that:</p>
      <ol class="dp-clauses" id="dc-clauses"></ol>
    </div></div>
    <div class="dfoot"><span>Ask to sign <small id="dc-need"></small></span><div class="npc" id="dc-signers">${others.map((r) => `<label${d.authors.includes(r.name) ? ' hidden' : ''}><input type="checkbox" value="${esc(r.name)}"><span>${esc(r.name)}</span></label>`).join('')}</div>
      <div class="row"><button type="button" class="dbtn gold" id="dc-send">Send for signatures</button><button type="button" class="dbtn" id="dc-discard">${d.owner === me ? 'Discard draft' : 'Leave draft'}</button></div></div>`;
  const T = $('dc-title'); T.value = d.title; T.addEventListener('input', () => { editDoc('title', T.value); grow(T); }); grow(T);
  $('dc-close').addEventListener('click', closeLaptop);
  $('dc-add').addEventListener('click', () => { flushDoc(); act({ type: 'dir.clause.add', id: LAPID }, { quiet: true }).then((ok) => ok && setTimeout(() => { const n = curDraft()?.clauses.length; $('dc-c' + (n - 1))?.focus(); }, 50)); });
  $('dc-share').addEventListener('click', () => ($('dc-sharep').hidden = !$('dc-sharep').hidden));
  $('dc-sharex').addEventListener('click', () => ($('dc-sharep').hidden = true));
  $('dc-invite').addEventListener('click', async () => { const names = [...$('dc-sharep').querySelectorAll('input:checked:not(:disabled)')].map((i) => i.value); if (await act({ type: 'dir.invite', id: LAPID, names })) { buildDocs(); } });
  $('dc-send').addEventListener('click', async () => { flushDoc(); const asked = [...$('dc-signers').querySelectorAll('input:checked')].map((i) => i.value); if (await act({ type: 'dir.send', id: LAPID, asked }, { quiet: true })) { notify({ kind: 'sent', title: 'Sent for signatures!', body: 'The people you asked will see it in their Directives tab.' }); closeLaptop(); } });
  $('dc-discard').addEventListener('click', async (e) => { const b = e.currentTarget; if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Click again to confirm'; setTimeout(() => { b.dataset.sure = ''; b.textContent = d.owner === me ? 'Discard draft' : 'Leave draft'; }, 4000); return; } if (await act({ type: 'dir.discard', id: LAPID })) closeLaptop(); });
  $('dc-signers').addEventListener('change', syncNeed);
  buildClauses(); syncDocs();
}
function buildClauses() {
  const d = curDraft(); if (!d) return; const box = $('dc-clauses'); const act0 = document.activeElement; const fk = act0?.dataset?.k; const sel = fk != null ? [act0.selectionStart, act0.selectionEnd] : null;
  box.innerHTML = d.clauses.map((c, i) => `<li><div class="dcl"><textarea id="dc-c${i}" data-k="${i}" rows="1" maxlength="600" placeholder="Who does what, where, and with what forces or money."></textarea><span class="typer" id="dc-w${i}" hidden></span>${d.clauses.length > 1 ? `<button type="button" class="dclx" data-rm="${i}" aria-label="Remove clause ${i + 1}">✕</button>` : ''}</div></li>`).join('');
  box.querySelectorAll('textarea').forEach((t) => { t.value = docPending[t.dataset.k] ?? d.clauses[+t.dataset.k] ?? ''; t.addEventListener('input', () => { editDoc(t.dataset.k, t.value); grow(t); }); grow(t); });
  box.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => { flushDoc(); act({ type: 'dir.clause.remove', id: LAPID, i: +b.dataset.rm }, { quiet: true }); }));
  if (fk != null) { const t = $('dc-c' + fk); if (t) { t.focus({ preventScroll: true }); if (sel) t.setSelectionRange(sel[0], sel[1]); } }
  box.dataset.n = d.clauses.length;
}
function editDoc(k, text) {
  docPending[k] = text; $('dc-save').textContent = 'Saving…'; if (k === 'title') $('dc-name').textContent = text || 'Untitled directive';
  clearTimeout(docTimers[k]); docTimers[k] = setTimeout(() => sendDoc(k), 450);
}
async function sendDoc(k) {
  if (!(k in docPending) || !LAPID) return; const text = docPending[k]; delete docPending[k];
  const ok = await act({ type: 'dir.edit', id: LAPID, key: k, text }, { quiet: true });
  if ($('dc-save')) $('dc-save').textContent = ok ? (Object.keys(docPending).length ? 'Saving…' : 'All changes saved') : 'Could not save. Check the Wi-Fi.';
}
function flushDoc() { for (const k of Object.keys(docTimers)) { clearTimeout(docTimers[k]); sendDoc(k); } }
function syncNeed() { const d = curDraft(); if (!d || !$('dc-need')) return; const asked = $('dc-signers').querySelectorAll('input:checked').length; const left = Math.max(0, SIGS_NEEDED - d.authors.length - asked); $('dc-need').textContent = left ? `(pick ${left} more to reach ${SIGS_NEEDED} names)` : '(enough names)'; }
// Live updates from co-authors: refresh every field that is not being typed in, and show who is typing where.
function syncDocs() {
  if (!LAPID || $('lap').hidden && !$('docs').innerHTML) return; const d = curDraft();
  if (!d || d.status !== 'drafting') { if (!$('lap').hidden) { notify({ title: d ? 'This draft was sent for signatures' : 'This draft was discarded' }); closeLaptop(); } return; }
  const me = MEE.name;
  if (+$('dc-clauses').dataset.n !== d.clauses.length) buildClauses();
  const T = $('dc-title'); if (document.activeElement !== T && !('title' in docPending) && T.value !== d.title) { T.value = d.title; grow(T); $('dc-name').textContent = d.title || 'Untitled directive'; }
  d.clauses.forEach((c, i) => { const t = $('dc-c' + i); if (t && document.activeElement !== t && !(String(i) in docPending) && t.value !== c) { t.value = c; grow(t); } });
  const now = Date.now() + SKEW;
  d.clauses.forEach((_, i) => { const w = $('dc-w' + i), ty = d.typing?.[i]; const on = ty && ty.by !== me && now - ty.at < 7000; w.hidden = !on; if (on) { w.textContent = ty.by.split(' ').slice(-1)[0]; w.style.setProperty('--c', authCol(ty.by)); } });
  const ty = d.typing?.title; T.classList.toggle('others', !!(ty && ty.by !== me && now - ty.at < 7000)); if (ty) T.style.setProperty('--c', authCol(ty.by));
  $('dc-avs').innerHTML = d.authors.map((n) => `<span style="--c:${authCol(n)}" title="${esc(n)}${n === me ? ' (you)' : ''}">${esc(initials(n))}</span>`).join('');
  $('dc-signers').querySelectorAll('label').forEach((l) => { l.hidden = d.authors.includes(l.querySelector('input').value); });
  syncNeed();
}
function showTab(t) { $('t-' + t).classList.remove('ping'); ['act', 'dir', 'intel', 'msg'].forEach((o) => { $('t-' + o).setAttribute('aria-selected', o === t); $('p-' + o).hidden = o !== t; }); }


/* ---------- Map editor (staff) ---------- */
let confirmKill = null;
function placeAt(lon, lat) {
  if (!placing) return false;
  if (placing.mode === 'feat') {
    const at = [+lon.toFixed(3), +lat.toFixed(3)];
    if (FEAT[placing.data.kind]?.line && !placing.at) { placing.at = at; renderPlacebar(); return true; }
    const d = placing.data, a0 = placing.at || at, a2 = placing.at ? at : null; placing = null; renderPlacebar();
    act({ type: 'feature.add', ...d, at: a0, ...(a2 ? { at2: a2 } : {}) }); return true;
  }
  const pl = placing; placing = null; renderPlacebar();
  if (pl.mode === 'move') act({ type: 'unit.move', id: pl.id, at: [lon, lat], public: pl.public });
  if (pl.mode === 'add') act({ type: 'unit.add', ...pl.data, at: [lon, lat], public: pl.public });
  return true;
}
function renderPlacebar() {
  const b = $('placebar'); if (!b) return; b.hidden = !placing;
  if (placing?.mode === 'feat') {
    const line = FEAT[placing.data.kind]?.line;
    b.innerHTML = `${!line ? 'Click the map where it goes.' : placing.at ? 'Now click where the line ends.' : 'Click where the line starts.'} <button type="button" class="dbtn" id="place-cancel">Cancel</button>${line && placing.at ? ' <button type="button" class="dbtn" id="place-one">Just that one spot</button>' : ''}`;
  } else if (placing) b.innerHTML = `Click the map where ${placing.mode === 'add' ? 'the new unit should go' : 'the unit should move'} (${placing.public ? 'shown on the projector' : 'secret'}). <button type="button" class="dbtn" id="place-cancel">Cancel</button>`;
  $('place-cancel')?.addEventListener('click', () => { placing = null; renderPlacebar(); });
  $('place-one')?.addEventListener('click', () => { const d = placing.data, at = placing.at; placing = null; renderPlacebar(); act({ type: 'feature.add', ...d, at }); });
}
function renderEdit() {
  const box = $('editcard'); if (!box || !STATE) return;
  if (box.contains(document.activeElement) && document.activeElement.tagName !== 'BUTTON' && document.activeElement.tagName !== 'SUMMARY') return; // don't wipe what staff are typing
  const ctry = (sel) => ORDER.map((k) => `<option value="${k}"${k === sel ? ' selected' : ''}>${POWERS[k].label}</option>`).join('');
  let html = '';
  const spawnForm = (owner, sea) => `<details class="addunit" data-sec="spawn"><summary>Spawn forces here</summary>
    <div class="row"><select id="a-owner">${ctry(owner)}</select><select id="a-kind">${KINDS.map((k) => `<option value="${k}"${k === (sea ? 'fleet' : 'army') ? ' selected' : ''}>${KIND_NAME[k]}</option>`).join('')}</select></div>
    <div class="row"><label class="formnote">Strength <input type="number" id="a-str" min="1" max="99" value="3" style="width:64px"></label><input type="text" id="a-name" placeholder="Name (optional)" maxlength="60"></div>
    <div class="row"><input type="text" id="a-tlabel" placeholder="Quality (optional), e.g. Elite" maxlength="40"><label class="formnote">Bonus <input type="number" id="a-tmod" min="-4" max="4" value="0" style="width:56px"></label></div>
    <div class="row"><input type="text" id="a-head" placeholder="Headline (optional)" maxlength="160"></div>
    <div class="row"><button type="button" class="dbtn gold" data-e="spawn-pub">Spawn on projector</button><button type="button" class="dbtn green" data-e="spawn-sec">Spawn secretly</button></div></details>`;
  const buildForm = (owner) => `<details class="addfeat" data-sec="build"><summary>Build or place something here</summary>${featForm('n', owner)}
    <div class="row"><button type="button" class="dbtn gold" data-e="feat-pub">Place on projector</button><button type="button" class="dbtn green" data-e="feat-sec">Place secretly</button></div>
    <p class="formnote">Trenches, bunkers and wire can run as a line: you will be asked to click where it ends.</p></details>
    <details data-sec="pin"><summary>Drop a labelled pin here</summary><div class="row"><input type="text" id="p-label" maxlength="40" placeholder="e.g. Oil fields sabotaged"><select id="p-owner">${ctry(owner)}</select></div>
    <div class="row"><button type="button" class="dbtn gold" data-e="pin-pub">On projector</button><button type="button" class="dbtn green" data-e="pin-sec">Secret</button></div></details>`;
  if (selected.type === 'unit') {
    const u = UNITS.find((x) => x.id === selected.id);
    if (u) {
      const secret = !u.shown || u.shown[0] !== u.at[0] || u.shown[1] !== u.at[1]; const inA = battleSel.att.has(u.id), inD = battleSel.def.has(u.id);
      html += `<h3>${flag(u.owner)} ${esc(u.name)}</h3><p class="formnote">${POWERS[u.owner].label} · ${KIND_NAME[u.kind]}${secret ? ' · <b style="color:var(--warn)">projector shows an old position</b>' : ''}</p>${u.basis ? `<p class="formnote" style="color:var(--warn)">Staff note: ${esc(u.basis)}</p>` : ''}
      <div class="row"><label class="formnote" for="e-str">Strength</label><input type="number" id="e-str" min="1" max="99" value="${u.str}" style="width:70px"><span class="formnote">= ${S.realText(u)}</span><button type="button" class="dbtn" data-e="str">Save</button></div>
      <div class="row">${(u.traits || []).map((t) => `<span class="schip ${t.mod > 0 ? 'good' : t.mod < 0 ? 'bad' : ''}">${esc(t.label)} ${t.mod >= 0 ? '+' : ''}${t.mod} <button type="button" data-untrait="${esc(t.label)}" aria-label="Remove">✕</button></span>`).join('') || '<span class="formnote">No traits</span>'}</div>
      <div class="row"><input type="text" id="e-tlabel" maxlength="40" placeholder="Add a trait, e.g. Low on fuel"><input type="number" id="e-tmod" min="-4" max="4" value="1" style="width:56px" aria-label="Battle bonus"><button type="button" class="dbtn" data-e="trait">Add</button></div>
      <div class="row"><button type="button" class="dbtn gold" data-e="move-pub">Move on projector</button><button type="button" class="dbtn green" data-e="move-sec">Move secretly</button>${secret ? '<button type="button" class="dbtn" data-e="reveal">Reveal</button>' : ''}</div>
      <div class="row"><button type="button" class="dbtn${inA ? ' gold' : ''}" data-e="att">${inA ? 'Attacking ✓' : 'Attacker in a battle'}</button><button type="button" class="dbtn${inD ? ' gold' : ''}" data-e="def">${inD ? 'Defending ✓' : 'Defender in a battle'}</button></div>
      <div class="row"><button type="button" class="dbtn red" data-e="kill">${confirmKill === u.id ? 'Click again to confirm' : u.kind === 'fleet' ? 'Sink' : u.kind === 'air' ? 'Shoot down' : 'Destroy'}</button></div>`;
    }
  } else if (selected.type === 'feature') {
    const f = FEATS.find((x) => x.id === selected.id);
    if (f) html += `<h3>${fIcon(f.kind)} ${esc(f.label)}</h3><p class="formnote">${esc(featTitle(f))}</p>
      <div class="row">${f.ruined ? '<button type="button" class="dbtn green" data-fe="repair">Repair</button>' : '<button type="button" class="dbtn red" data-fe="ruin">Destroy</button>'}${featState(f) === 'building' ? '<button type="button" class="dbtn gold" data-fe="finish">Finish now</button>' : ''}<button type="button" class="dbtn" data-fe="remove">Remove from map</button></div>`;
  } else if (selected.region && REGION[selected.region]) {
    const r = REGION[selected.region]; const c = ctrlOf(r); const zone = REGIONS.filter((x) => x.country === r.country && x.zone === r.zone);
    html += `<h3>${esc(r.name)}</h3><p class="formnote">${esc(r.country)} · ${r.zone.toLowerCase()} zone (${zone.length} regions) · held by <b>${esc(POWERS[c]?.label || c)}</b></p>
      <div class="row"><span class="formnote">Give to</span><select id="e-owner">${ownerOptions(c)}</select></div>
      <div class="row"><button type="button" class="dbtn gold" data-e="region">This region</button>${zone.length > 1 ? `<button type="button" class="dbtn" data-e="zone">The whole ${esc(r.zone.toLowerCase())} zone</button>` : ''}<label class="check"><input type="checkbox" id="e-announce" checked> Announce</label></div>
      ${spawnForm(POWERS[c] ? c : 'Germany')}${buildForm(POWERS[c] ? c : 'Germany')}`;
  } else if (selected.type === 'sea' || selected.type === 'country') {
    const owner = selected.type === 'country' && POWERS[ownerOf(selected.id)] ? ownerOf(selected.id) : 'United Kingdom';
    html += `<h3>${selected.type === 'sea' ? 'Open sea' : esc(LABEL_TEXT[selected.id] || selected.id)}</h3><p class="formnote">${selected.at ? `${selected.at[1].toFixed(1)}°, ${selected.at[0].toFixed(1)}°` : 'Click anywhere on the map.'}</p>${selected.at ? spawnForm(owner, selected.type === 'sea') + buildForm(owner) : ''}`;
  } else html += `<p class="formnote">Click a unit, a map feature, land or sea.</p>`;
  if (!selected.at && selected.type !== 'unit' && selected.type !== 'feature') html = html || '<p class="formnote">Click the map.</p>';
  // Rebuild only when something changed, so a click is never lost to a refresh.
  if (box._html === html && !box.hidden) return; box._html = html;
  const open = Object.fromEntries([...box.querySelectorAll('details[data-sec]')].map((d) => [d.dataset.sec, d.open])); box.innerHTML = `<button type="button" class="ecard-x" data-e="close" aria-label="Close">✕</button>` + html; box.querySelectorAll('details[data-sec]').forEach((d) => { if (open[d.dataset.sec]) d.open = true; });
  box.hidden = false;
}
// Shared feature fields for the map editor.
function featForm(p, owner) {
  return `<div class="row"><select id="${p}-fkind">${Object.entries(FEAT).map(([k, v]) => `<option value="${k}">${v.name}${v.line ? ' (line)' : ''}</option>`).join('')}</select><select id="${p}-fowner">${ORDER.map((k) => `<option value="${k}"${k === owner ? ' selected' : ''}>${POWERS[k].label}</option>`).join('')}</select></div>
    <div class="row"><input type="text" id="${p}-flabel" maxlength="50" placeholder="Name, e.g. Siegfried Line trenches"><label class="formnote">Defense <input type="number" id="${p}-fmod" min="-4" max="4" placeholder="auto" style="width:64px"></label></div>
    <div class="row"><label class="formnote">Ready <select id="${p}-fturns"><option value="0">Now</option><option value="1">After the next update</option><option value="2">In 2 updates</option><option value="3">In 3 updates</option></select></label></div>`;
}
const readFeat = (p) => ({ kind: $(p + '-fkind').value, owner: $(p + '-fowner').value, label: $(p + '-flabel').value, mod: $(p + '-fmod').value, turns: $(p + '-fturns').value });
function ownerOptions(sel) {
  const minor = [...new Set(REGIONS.map((r) => r.country))].filter((c) => !POWERS[c] && !OWNER[c]);
  return ORDER.map((k) => `<option value="${k}"${k === sel ? ' selected' : ''}>${POWERS[k].label}</option>`).join('') + minor.map((c) => `<option value="${esc(c)}"${c === sel ? ' selected' : ''}>${esc(c)}</option>`).join('');
}
// Units staff have picked for a battle from the map.
const battleSel = { att: new Set(), def: new Set() };
function renderBattleTray() {
  const t = $('btray'); if (!t) return; const n = battleSel.att.size + battleSel.def.size; t.hidden = !n; if (!n) return;
  const names = (set) => [...set].map((id) => { const u = STATE.units.find((x) => x.id === id); return u ? `${flag(u.owner)} ${esc(u.name)} (${S.realShort(u)})` : ''; }).join(', ') || '<i>pick on the map</i>';
  t.innerHTML = `<b>Battle</b><span>${names(battleSel.att)}</span><b>vs</b><span>${names(battleSel.def)}</span><button type="button" class="dbtn gold" id="bt-open"${battleSel.att.size && battleSel.def.size ? '' : ' disabled'}>Work it out</button><button type="button" class="dbtn" id="bt-clear">Clear</button>`;
}
function syncBattleSelects() {
  for (const [id, set] of [['b-att', battleSel.att], ['b-def', battleSel.def]]) { const el = $(id); if (el) [...el.options].forEach((o) => (o.selected = set.has(o.value))); }
  if ($('b-result')) renderBattleResult(); renderBattleTray();
}
function bindEdit() {
  $('editcard').addEventListener('click', (e) => {
    const fe = e.target.closest('[data-fe]'); if (fe) { act({ type: 'feature.edit', id: selected.id, action: fe.dataset.fe }); if (fe.dataset.fe === 'remove') { selected = { type: 'none' }; $('editcard').hidden = true; } return; }
    const ut = e.target.closest('[data-untrait]'); if (ut) { const u = UNITS.find((x) => x.id === selected.id); act({ type: 'effects.apply', effects: [{ type: 'trait', unit: u.id, action: 'clear' }, ...(u.traits || []).filter((t) => t.label !== ut.dataset.untrait).map((t) => ({ type: 'trait', unit: u.id, label: t.label, mod: t.mod }))] }); return; }
    const b = e.target.closest('[data-e]'); if (!b) return; const k = b.dataset.e; const at = selected.at;
    if (k === 'close') { selected = { type: 'none' }; $('editcard').hidden = true; mapGlobe?.markSelected(null); return; }
    if (['str', 'move-pub', 'move-sec', 'kill', 'reveal', 'trait', 'att', 'def'].includes(k)) {
      const id = selected.id;
      if (k === 'str') act({ type: 'unit.edit', id, str: $('e-str').value });
      if (k === 'trait') { const l = $('e-tlabel').value.trim(); if (!l) { toast('Name the trait first.'); return; } act({ type: 'effects.apply', effects: [{ type: 'trait', unit: id, label: l, mod: $('e-tmod').value }] }); $('e-tlabel').value = ''; }
      if (k === 'move-pub' || k === 'move-sec') { placing = { mode: 'move', id, public: k === 'move-pub' }; renderPlacebar(); }
      if (k === 'reveal') act({ type: 'reveal', unitId: id });
      if (k === 'att' || k === 'def') { const mine = k === 'att' ? battleSel.att : battleSel.def, other = k === 'att' ? battleSel.def : battleSel.att; other.delete(id); mine.has(id) ? mine.delete(id) : mine.add(id); syncBattleSelects(); renderEdit(); }
      if (k === 'kill') { if (confirmKill === id) { confirmKill = null; act({ type: 'unit.destroy', id }); selected = { type: 'none' }; $('editcard').hidden = true; } else { confirmKill = id; renderEdit(); setTimeout(() => { if (confirmKill === id) { confirmKill = null; renderEdit(); } }, 6000); } }
      return;
    }
    if (k === 'region' || k === 'zone') {
      const r = REGION[selected.region]; const ids = k === 'zone' ? REGIONS.filter((x) => x.country === r.country && x.zone === r.zone).map((x) => x.id) : [r.id];
      act({ type: 'region.set', ids, owner: $('e-owner').value, announce: $('e-announce')?.checked });
    }
    if ((k === 'spawn-pub' || k === 'spawn-sec') && at) {
      const pub = k === 'spawn-pub'; const owner = $('a-owner').value, kind = $('a-kind').value; const tl = $('a-tlabel').value.trim();
      act({ type: 'effects.apply', effects: [{ type: 'unit', owner, kind, str: $('a-str').value, name: $('a-name').value, to: at, public: pub, ...(tl ? { traitLabel: tl, traitMod: $('a-tmod').value } : {}) }], headline: $('a-head').value.trim() })
        .then((ok) => { if (ok) { $('a-name').value = ''; $('a-head').value = ''; } });
    }
    if ((k === 'feat-pub' || k === 'feat-sec') && at) {
      const data = { ...readFeat('n'), public: k === 'feat-pub' };
      if (FEAT[data.kind]?.line) { placing = { mode: 'feat', data, at: [+at[0].toFixed(3), +at[1].toFixed(3)] }; renderPlacebar(); }
      else act({ type: 'feature.add', ...data, at });
    }
    if ((k === 'pin-pub' || k === 'pin-sec') && at) { const l = $('p-label').value.trim(); if (!l) { toast('Write the label first.'); return; } act({ type: 'effects.apply', effects: [{ type: 'marker', label: l, owner: $('p-owner').value, to: at, public: k === 'pin-pub' }] }).then((ok) => ok && ($('p-label').value = '')); }
  });
}


/* ---------- Effects toolkit (staff): make anything happen ---------- */
const FX_TYPES = { agent: 'Place or remove a spy', reveal: "Let a country see another's forces", feature: 'Build or place a map feature (trenches, bunkers, factory…)', 'feature.edit': 'Destroy, repair or remove a map feature', trait: 'Give a unit a trait (veteran, low on fuel…)', money: 'Change money', strength: 'Change unit strength', destroy: 'Destroy a unit', move: 'Move a unit', unit: 'Create a unit', region: 'Change who holds regions', intel: 'Send an intel report', wire: 'Post a news headline', marker: 'Place a map marker', asset: 'Grant a new asset or power', message: 'Message delegates as a character' };
const countrySel = (cls, sel) => `<select data-f="${cls}">${ORDER.map((k) => `<option value="${k}"${k === sel ? ' selected' : ''}>${POWERS[k].label}</option>`).join('')}</select>`;
const unitSel = () => `<select data-f="unit">${unitOptions()}</select>`;
const placeSel = (key = 'to', first = '') => `<select data-f="${key}">${first}${[...new Set(REGIONS.map((r) => r.country))].map((c) => `<optgroup label="${esc(c)}">${REGIONS.filter((r) => r.country === c).map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join('')}</optgroup>`).join('')}<optgroup label="Seas">${Object.keys(S.SEAS).map((k) => `<option>${esc(k)}</option>`).join('')}</optgroup></select>`;
const pubBox = (on = true) => `<label class="check"><input type="checkbox" data-f="public"${on ? ' checked' : ''}> Public</label>`;
const delegateSel = (multi) => `<select data-f="${multi ? 'to' : 'name'}"${multi ? ' multiple size="4"' : ''}>${ROSTER.map((r) => `<option>${esc(r.name)}</option>`).join('')}</select>`;
function fxRow(t, ctx = {}) {
  const f = {
    money: () => `${countrySel('country', ctx.country)}<input type="number" data-f="amount" placeholder="+ or − $M" style="width:110px">`,
    strength: () => `${unitSel()}<input type="number" data-f="delta" placeholder="+ or −" style="width:80px">`,
    destroy: () => `${unitSel()}${pubBox()}`,
    move: () => `${unitSel()}<span class="formnote">to</span>${placeSel()}${pubBox()}`,
    unit: () => `${countrySel('owner', ctx.country)}<select data-f="kind">${KINDS.map((k) => `<option value="${k}">${KIND_NAME[k]}</option>`).join('')}</select><input type="number" data-f="str" value="1" min="1" max="99" style="width:60px" aria-label="Strength"><input type="text" data-f="name" placeholder="Name"><span class="formnote">at</span>${placeSel()}${pubBox(false)}`,
    region: () => `<select data-f="ids" multiple size="5">${[...new Set(REGIONS.map((r) => r.country))].map((c) => `<optgroup label="${esc(c)}">${REGIONS.filter((r) => r.country === c).map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join('')}</optgroup>`).join('')}</select><span class="formnote">to</span>${countrySel('owner', ctx.country)}${pubBox()}`,
    intel: () => `${countrySel('country', ctx.country)}<input type="text" data-f="from" placeholder="From, e.g. Agent in Rome"><select data-f="rel"><option>High</option><option selected>Medium</option><option>Low</option></select><textarea data-f="text" placeholder="What they learn"></textarea>`,
    wire: () => `<input type="text" data-f="text" placeholder="Headline the whole room sees" style="flex:1">`,
    marker: () => `<input type="text" data-f="label" placeholder="Label, e.g. Oil fields sabotaged">${countrySel('owner', ctx.country)}<span class="formnote">at</span>${placeSel()}${pubBox()}`,
    asset: () => `${delegateSel(false)}<input type="text" data-f="text" placeholder="e.g. Controls a network of agents in Bucharest" style="flex:1">`,
    message: () => `<input type="text" data-f="from" placeholder="From, e.g. Adolf Hitler">${delegateSel(true)}<textarea data-f="text" placeholder="Message"></textarea>`,
    feature: () => `<select data-f="kind">${Object.entries(FEAT).map(([k, v]) => `<option value="${k}">${v.name}${v.line ? ' (line)' : ''}</option>`).join('')}</select><input type="text" data-f="label" maxlength="50" placeholder="Name, e.g. Westwall trenches">${countrySel('owner', ctx.country)}
      <span class="formnote">at</span>${placeSel('to', ctx.here ? '<option value="@here" selected>Where the delegate marked</option>' : '')}<span class="formnote">line to</span>${placeSel('to2', '<option value="" selected>No line (one spot)</option>')}
      <label class="formnote">Defense <input type="number" data-f="mod" min="-4" max="4" placeholder="auto" style="width:60px"></label><label class="formnote">Ready <select data-f="turns"><option value="0">Now</option><option value="1">After next update</option><option value="2">In 2 updates</option><option value="3">In 3 updates</option></select></label>${pubBox(ctx.vis !== 'private')}`,
    'feature.edit': () => `<select data-f="id">${FEATS.map((f) => `<option value="${f.id}">${esc(f.label)} · ${esc(POWERS[f.owner]?.short || f.owner)}${f.ruined ? ' (destroyed)' : ''}</option>`).join('') || '<option value="">No features on the map yet</option>'}</select><select data-f="action"><option value="ruin">Destroy</option><option value="repair">Repair</option><option value="finish">Finish building now</option><option value="remove">Remove from map</option></select>${pubBox()}`,
    reveal: () => `${countrySel('country', ctx.country)}<span class="formnote">can see all forces of</span>${countrySel('other')}<input type="text" data-f="text" maxlength="80" placeholder="How, e.g. Reported by agents in London">`,
    agent: () => `${delegateSel(false)}<select data-f="action"><option value="add">places an agent in</option><option value="remove">loses their agent in</option></select><select data-f="target">${Object.keys(CAPITAL).map((k) => `<option value="${esc(k)}">${esc(k)}</option>`).join('')}</select><input type="text" data-f="mission" maxlength="80" placeholder="Mission, e.g. Watch the navy at Kiel">`,
    trait: () => `${unitSel()}<select data-f="action"><option value="add">Add trait</option><option value="clear">Clear all traits</option></select><input type="text" data-f="label" maxlength="40" placeholder="e.g. Winter gear, Low on fuel, Veteran"><label class="formnote">Battle bonus <input type="number" data-f="mod" min="-4" max="4" value="1" style="width:60px"></label>`,
  }[t];
  return `<div class="fx-row" data-t="${t}"><b>${FX_TYPES[t]}</b><div class="row">${f()}</div><button type="button" class="dbtn fx-del" aria-label="Remove this effect">✕</button></div>`;
}
function fxEditor(key, open = false, label = 'Add effects (optional)') {
  return `<details class="fx" data-fx="${key}"${open ? ' open' : ''}><summary>${label}</summary><div class="fx-rows"></div>
    <div class="row"><select class="fx-type" aria-label="Effect type">${Object.entries(FX_TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select><button type="button" class="dbtn fx-add">Add effect</button>
    <label class="formnote fx-whenl">Effects happen <select class="fx-when"><option value="0">now</option><option value="1">at the next crisis update</option><option value="2">in 2 updates</option><option value="3">in 3 updates</option></select></label></div>
    <p class="formnote">Each +1 defense or battle bonus is worth +${Math.round(S.MOD_STEP * 100)}% in the battle calculator.</p></details>`;
}
const readWhen = (box) => +(box?.querySelector('.fx-when')?.value || 0);
// Re-rendering a list must not wipe effects staff are halfway through writing.
function keepFx(root, fn) {
  const saved = {}; root.querySelectorAll('.fx[data-fx]').forEach((n) => { if (n.querySelector('.fx-row') || n.open) saved[n.dataset.fx] = n; });
  fn(); root.querySelectorAll('.fx[data-fx]').forEach((n) => { const o = saved[n.dataset.fx]; if (o) n.replaceWith(o); });
}
function readFx(box) {
  if (!box) return [];
  return [...box.querySelectorAll('.fx-row')].map((row) => {
    const e = { type: row.dataset.t };
    row.querySelectorAll('[data-f]').forEach((el) => {
      const k = el.dataset.f;
      if (el.type === 'checkbox') e[k] = el.checked;
      else if (el.multiple) e[k] = [...el.selectedOptions].map((o) => o.value);
      else e[k] = el.value;
    });
    if (e.type === 'move' || e.type === 'destroy' || e.type === 'strength') { /* unit already set */ }
    return e;
  });
}
function bindFx(root) {
  root.addEventListener('click', (e) => {
    const add = e.target.closest('.fx-add'), del = e.target.closest('.fx-del');
    if (add) { const box = add.closest('.fx'); const { country, here, vis } = box.dataset; box.querySelector('.fx-rows').insertAdjacentHTML('beforeend', fxRow(box.querySelector('.fx-type').value, { country, here: here === '1', vis })); }
    if (del) del.closest('.fx-row').remove();
  });
}

/* ---------- Staff: territory, forces, battles ---------- */
let tCountry = null, fCountry = '';
function renderTerritory() {
  const box = $('territory'); if (!box) return; tCountry = tCountry || $('t-country').value;
  const list = REGIONS.filter((r) => r.country === tCountry); const zones = [...new Set(list.map((r) => r.zone))];
  const checked = new Set([...box.querySelectorAll('input[data-r]:checked')].map((i) => i.dataset.r));
  box.innerHTML = zones.map((z) => `<div class="zone"><label class="check zhead"><input type="checkbox" data-z="${esc(z)}"> <b>${esc(z)}</b></label>
    ${list.filter((r) => r.zone === z).map((r) => { const c = ctrlOf(r); const occ = c !== baseOwner(r); return `<label class="check"><input type="checkbox" data-r="${r.id}"${checked.has(r.id) ? ' checked' : ''}> ${esc(r.name)} <span class="pill ${occ ? 'war' : 'neutral'}">${POWERS[c]?.short || c}</span></label>`; }).join('')}</div>`).join('') +
    `<div class="row"><span class="formnote">Give selected to</span><select id="t-owner">${ownerOptions(POWERS[tCountry] ? tCountry : OWNER[tCountry] || tCountry)}</select><label class="check"><input type="checkbox" id="t-announce" checked> Announce on the wire</label><button type="button" class="dbtn gold" id="t-apply">Apply</button></div>`;
}
function bindTerritory() {
  $('t-country').addEventListener('change', (e) => { tCountry = e.target.value; $('territory').innerHTML = ''; renderTerritory(); });
  $('territory').addEventListener('change', (e) => { const z = e.target.dataset.z; if (z) $('territory').querySelectorAll('input[data-r]').forEach((i) => { if (REGION[i.dataset.r].zone === z) i.checked = e.target.checked; }); });
  $('territory').addEventListener('click', async (e) => {
    if (e.target.id !== 't-apply') return; const ids = [...$('territory').querySelectorAll('input[data-r]:checked')].map((i) => i.dataset.r);
    if (!ids.length) { toast('Tick at least one region.'); return; }
    if (await act({ type: 'region.set', ids, owner: $('t-owner').value, announce: $('t-announce').checked })) { $('territory').querySelectorAll('input:checked').forEach((i) => (i.checked = false)); }
  });
}
function renderForces() {
  const box = $('forces'); if (!box) return;
  const list = STATE.units.filter((u) => !fCountry || u.owner === fCountry);
  keepInputs(box, () => {
    box.innerHTML = `<div class="codes-wrap"><table class="codes"><thead><tr><th>Unit</th><th>Type</th><th>Strength</th><th></th></tr></thead><tbody>${list.map((u) => `<tr><td>${flag(u.owner)} ${esc(u.name)}${!u.shown ? ' <span class="pill private">hidden</span>' : ''}${u.traits?.length ? `<br><small class="formnote">Traits: ${traitText(u)}</small>` : ''}${u.basis ? `<br><small class="formnote" style="color:var(--warn)">${esc(u.basis)}</small>` : ''}</td><td>${KIND_NAME[u.kind]}</td>
      <td><input type="number" id="fs-${u.id}" min="1" max="99" value="${u.str}" style="width:60px"> <button type="button" class="dbtn" data-fs="${u.id}">Save</button></td>
      <td><button type="button" class="dbtn red" data-fk="${u.id}">${confirmKill === u.id ? 'Confirm' : u.kind === 'fleet' ? 'Sink' : u.kind === 'air' ? 'Shoot down' : 'Destroy'}</button></td></tr>`).join('')}</tbody></table></div>`;
  });
}
function bindForces() {
  $('f-country').addEventListener('change', (e) => { fCountry = e.target.value; $('forces').innerHTML = ''; renderForces(); });
  $('forces').addEventListener('click', (e) => {
    const s1 = e.target.closest('[data-fs]'), k = e.target.closest('[data-fk]');
    if (s1) act({ type: 'unit.edit', id: s1.dataset.fs, str: $('fs-' + s1.dataset.fs).value });
    if (k) { const id = k.dataset.fk; if (confirmKill === id) { confirmKill = null; act({ type: 'unit.destroy', id }); } else { confirmKill = id; renderForces(); setTimeout(() => { if (confirmKill === id) { confirmKill = null; renderForces(); } }, 4000); } }
  });
}
// Battle calculator: strength times modifiers, compared as a ratio, read off a results table.
const TIERS = [
  { min: 3, name: 'Decisive attacker victory', win: true, att: 0.1, def: 0.6 },
  { min: 2, name: 'Attacker victory', win: true, att: 0.15, def: 0.4 },
  { min: 1.5, name: 'Costly attacker victory', win: true, att: 0.25, def: 0.35 },
  { min: 0.8, name: 'Stalemate', win: false, att: 0.2, def: 0.2 },
  { min: 0, name: 'Attack fails', win: false, att: 0.35, def: 0.1 },
];
let battleRoll = null, battleBound = false; const battleOff = new Set();
// Distance in degrees from a unit to a feature (a point, or a line between two points).
function featDist(f, at) {
  if (!f.to) return Math.hypot(f.at[0] - at[0], f.at[1] - at[1]);
  const [x1, y1] = f.at, [x2, y2] = f.to, dx = x2 - x1, dy = y2 - y1; const t = Math.max(0, Math.min(1, ((at[0] - x1) * dx + (at[1] - y1) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x1 + t * dx - at[0], y1 + t * dy - at[1]);
}
const traitMul = (u) => Math.max(0.25, 1 + S.MOD_STEP * (u.traits || []).reduce((a, t) => a + (+t.mod || 0), 0));
function unitOptions() { if (!STATE) return ''; return ORDER.map((c) => { const us = STATE.units.filter((u) => u.owner === c); return us.length ? `<optgroup label="${POWERS[c].label}">${us.map((u) => `<option value="${u.id}">${esc(u.name)} (${u.str})</option>`).join('')}</optgroup>` : ''; }).join(''); }
function renderBattleShell() {
  $('battle').innerHTML = `<div class="bgrid">
    <label>Attackers<select id="b-att" multiple size="7">${unitOptions()}</select></label>
    <label>Defenders<select id="b-def" multiple size="7">${unitOptions()}</select></label></div>
    <div class="bgrid"><div class="mods"><b>Attacker bonuses</b>
      <label class="check"><input type="checkbox" id="m-surprise"> Surprise attack +25%</label>
      <label class="check"><input type="checkbox" id="m-aair"> Air or naval support +25%</label>
      <label class="check"><input type="checkbox" id="m-asup"> Good supply plan +25%</label>
      <label>Plan quality <input type="range" id="m-aplan" min="0" max="50" step="5" value="0"> <span id="m-aplan-v">+0%</span></label></div>
    <div class="mods"><b>Defender bonuses</b>
      <label class="check"><input type="checkbox" id="m-fort"> Rough terrain or river +50%</label>
      <label class="check"><input type="checkbox" id="m-dair"> Air or naval support +25%</label>
      <label class="check"><input type="checkbox" id="m-dsup"> Good supply plan +25%</label>
      <label>Plan quality <input type="range" id="m-dplan" min="0" max="50" step="5" value="0"> <span id="m-dplan-v">+0%</span></label></div></div>
    <div class="row"><label class="check"><input type="checkbox" id="m-roll"> Roll a die for luck (1 = one result worse, 6 = one result better)</label><button type="button" class="dbtn" id="b-reroll">Roll again</button></div>
    <div id="b-result"></div>`;
  if (battleBound) return; battleBound = true;
  const recompute = () => { $('m-aplan-v').textContent = `+${$('m-aplan').value}%`; $('m-dplan-v').textContent = `+${$('m-dplan').value}%`; renderBattleResult(); };
  $('battle').addEventListener('input', recompute); $('battle').addEventListener('change', (e) => { if (e.target.id === 'b-att' || e.target.id === 'b-def') { const set = e.target.id === 'b-att' ? battleSel.att : battleSel.def; set.clear(); [...e.target.selectedOptions].forEach((o) => set.add(o.value)); renderBattleTray(); } }); $('battle').addEventListener('change', (e) => { const id = e.target.dataset?.bf; if (id) { if (e.target.checked) battleOff.delete(id); else battleOff.add(id); } recompute(); });
  $('battle').addEventListener('click', (e) => { if (e.target.id === 'b-reroll') { battleRoll = 1 + Math.floor(Math.random() * 6); $('m-roll').checked = true; renderBattleResult(); } });
}
function renderBattleResult() {
  const pick = (id) => [...$(id).selectedOptions].map((o) => STATE.units.find((u) => u.id === o.value)).filter(Boolean);
  const att = pick('b-att'), def = pick('b-def'); const box = $('b-result');
  if (!att.length || !def.length) { box.innerHTML = '<p class="formnote">Pick at least one attacking and one defending unit. Hold Ctrl (or Cmd) to pick several.</p>'; return; }
  const on = (id) => $(id).checked; const sum = (l) => l.reduce((a, u) => a + u.str * traitMul(u), 0);
  const aOwner0 = att[0].owner, dOwner0 = def[0].owner; const dSide = S.alliesOf(dOwner0);
  // Map features near the defenders count for them automatically (staff can untick any).
  const feats = FEATS.filter((f) => featState(f) === 'ready' && f.mod && f.owner !== aOwner0 && (f.owner === dOwner0 || dSide.includes(f.owner)) && def.some((u) => featDist(f, u.at) < 1.4));
  const featMod = feats.filter((f) => !battleOff.has(f.id)).reduce((a, f) => a + f.mod, 0);
  const aMul = 1 + (on('m-surprise') ? 0.25 : 0) + (on('m-aair') ? 0.25 : 0) + (on('m-asup') ? 0.25 : 0) + +$('m-aplan').value / 100;
  const dMul = Math.max(0.25, 1 + (on('m-fort') ? 0.5 : 0) + (on('m-dair') ? 0.25 : 0) + (on('m-dsup') ? 0.25 : 0) + +$('m-dplan').value / 100 + featMod * S.MOD_STEP);
  const traitsUsed = [...att, ...def].filter((u) => u.traits?.length);
  const A = sum(att) * aMul, D = sum(def) * dMul, ratio = A / Math.max(0.1, D);
  let ti = TIERS.findIndex((t) => ratio >= t.min);
  if (on('m-roll')) { if (battleRoll == null) battleRoll = 1 + Math.floor(Math.random() * 6); if (battleRoll === 1) ti = Math.min(TIERS.length - 1, ti + 1); if (battleRoll === 6) ti = Math.max(0, ti - 1); }
  const t = TIERS[ti]; const after = (u, frac) => Math.round(u.str * (1 - frac));
  const row = (u, frac) => { const n = after(u, frac); return `<tr><td>${flag(u.owner)} ${esc(u.name)}</td><td class="num">${u.str} →</td><td><input type="number" min="1" max="99" data-bs="${u.id}" value="${Math.max(1, n)}" style="width:60px"></td><td><label class="check"><input type="checkbox" data-bk="${u.id}"${n < 2 ? ' checked' : ''}> ${u.kind === 'fleet' ? 'Sunk' : u.kind === 'air' ? 'Shot down' : 'Destroyed'}</label></td></tr>`; };
  const aOwner = att[0].owner, dOwner = def[0].owner;
  const head = `${POWERS[aOwner].label} attack on ${def.map((u) => u.name).join(' and ')}: ${t.name.toLowerCase().replace('attacker', POWERS[aOwner].label)}`;
  box.innerHTML = `<div class="verdict ${t.win ? 'win' : ti === 3 ? 'draw' : 'loss'}"><b>${t.name}</b><span>Attack ${A.toFixed(1)} vs defense ${D.toFixed(1)} · ratio ${ratio.toFixed(2)} : 1${on('m-roll') ? ` · die rolled ${battleRoll}` : ''}</span></div>
    ${feats.length ? `<div class="mods"><b>Map features defending this area</b>${feats.map((f) => `<label class="check"><input type="checkbox" data-bf="${f.id}"${battleOff.has(f.id) ? '' : ' checked'}> ${esc(f.label)} ${f.mod > 0 ? '+' : ''}${Math.round(f.mod * S.MOD_STEP * 100)}%</label>`).join('')}</div>` : ''}
    ${traitsUsed.length ? `<p class="formnote">Unit traits counted: ${traitsUsed.map((u) => `${esc(u.name)} (${traitText(u)})`).join('; ')}</p>` : ''}
    <p class="formnote">Suggested losses: attackers ${Math.round(t.att * 100)}%, defenders ${Math.round(t.def * 100)}%. Change any number before applying.</p>
    <table class="codes"><tbody>${att.map((u) => row(u, t.att)).join('')}${def.map((u) => row(u, t.def)).join('')}</tbody></table>
    ${t.win ? `<label class="formnote" for="b-regions">Regions the attacker takes (optional)</label><select id="b-regions" multiple size="5">${[...new Set(REGIONS.map((r) => r.country))].map((c) => `<optgroup label="${esc(c)}">${REGIONS.filter((r) => r.country === c).map((r) => `<option value="${r.id}">${esc(r.name)} (${r.zone.toLowerCase()})</option>`).join('')}</optgroup>`).join('')}</select>` : ''}
    ${t.win && feats.length ? `<label class="check"><input type="checkbox" id="b-ruin" checked> Destroy the defenses the attacker overran (${feats.map((f) => esc(f.label)).join(', ')})</label>` : ''}
    <label class="formnote" for="b-head">Headline for the news wire</label><input type="text" id="b-head" maxlength="160" value="${esc(head)}" style="width:100%">
    <div class="row"><button type="button" class="dbtn gold" id="b-apply">Apply result to the map</button></div>`;
  $('b-apply').addEventListener('click', async () => {
    const results = [...box.querySelectorAll('[data-bs]')].map((i) => ({ id: i.dataset.bs, str: i.value, destroy: box.querySelector(`[data-bk="${i.dataset.bs}"]`).checked }));
    const regions = $('b-regions') ? [...$('b-regions').selectedOptions].map((o) => o.value) : [];
    const ruin = $('b-ruin')?.checked ? feats.map((f) => f.id) : [];
    if (await act({ type: 'battle.resolve', results, regions, regionOwner: aOwner, headline: $('b-head').value, ruin })) { battleSel.att.clear(); battleSel.def.clear(); renderBattleTray(); $('m-battle').hidden = true; battleRoll = null; renderBattleShell(); renderBattleResult(); }
  });
}

/* ---------- Crisis assistant (staff) ---------- */
let PROPS_AI = 'rules';
const aiOff = {}, aiAsked = {}, aiErr = {}; let aiBusy = 0;
async function assist(body) {
  const r = await fetch('/api/crisis/assist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (r.status === 401) { location.href = '/crisis'; return {}; }
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'The assistant is unavailable right now.'); return j;
}
// Ask for suggestions on anything new, two at a time. Results are saved on the server, so every staff screen shares them.
function pumpAssistant() {
  if (!STATE) return;
  const want = [...STATE.queue.filter((q) => q.status === 'pending' && (!q.ai || q.ai.v !== S.AI_VERSION)).map((q) => ({ kind: 'request', id: q.id })),
    ...(STATE.directives || []).filter((d) => d.status === 'passed' && !d.carried && !d.ai).map((d) => ({ kind: 'directive', id: d.id }))];
  for (const w of want) {
    if (aiBusy >= 2) break; if (aiAsked[w.id] && Date.now() - aiAsked[w.id] < 50000) continue;
    aiAsked[w.id] = Date.now(); aiBusy++; delete aiErr[w.id];
    assist(w).catch((e) => { aiErr[w.id] = e.message; queueSig = ''; chairSig = ''; renderStaff(); }).finally(() => { aiBusy--; });
  }
}
const uName = (id) => STATE.units.find((u) => u.id === id)?.name || id;
const pl = (c) => POWERS[c]?.label || c || '?';
const whereTxt = (to) => (to === '@here' ? 'the marked spot' : REGION[to]?.name || to || 'the map');
function effText(e) {
  switch (e.type) {
    case 'money': return `${+e.amount >= 0 ? '+' : ''}$${e.amount}M for ${pl(e.country)}`;
    case 'strength': return `${uName(e.unit)} ${+e.delta >= 0 ? '+' : ''}${e.delta} strength`;
    case 'destroy': return `${uName(e.unit)} destroyed`;
    case 'move': return `${uName(e.unit)} moves to ${whereTxt(e.to)}${e.public ? '' : ' (secret)'}`;
    case 'unit': return `New ${(KIND_NAME[e.kind] || 'unit').toLowerCase()} for ${pl(e.owner)}, ${S.realText({ kind: e.kind, owner: e.owner }, +e.str || 1)}, at ${whereTxt(e.to)}${e.public ? '' : ' (secret)'}`;
    case 'region': return `${pl(e.owner)} takes ${(e.ids || []).map((id) => REGION[id]?.name || id).join(', ')}`;
    case 'intel': return `Intel to ${pl(e.country)}: ${e.text}`;
    case 'wire': return `Extra headline: ${e.text}`;
    case 'marker': return `Map pin: ${e.label}`;
    case 'asset': return `New power for ${e.name}: ${e.text}`;
    case 'message': return `Letter from ${e.from || 'staff'} to ${(e.to || []).join(', ')}: ${e.text}`;
    case 'feature': return `${+e.turns > 0 ? 'Start building' : 'Place'} ${e.label || FEAT[e.kind]?.name} for ${pl(e.owner)}${+e.turns > 0 ? `, ready in ${e.turns} update${e.turns > 1 ? 's' : ''}` : ''}${e.public ? '' : ' (secret)'}`;
    case 'feature.edit': return `${{ ruin: 'Destroy', repair: 'Repair', finish: 'Finish', remove: 'Remove' }[e.action] || 'Change'} ${FEATS.find((f) => f.id === e.id)?.label || 'a map feature'}`;
    case 'trait': return e.action === 'clear' ? `${uName(e.unit)}: traits cleared` : `${uName(e.unit)}: ${e.label} ${+e.mod >= 0 ? '+' : ''}${e.mod}`;
    case 'relation': return `${pl(e.country)} and ${pl(e.other)}: ${e.status === 'peace' || e.status === 'none' ? 'peace' : (S.RELATION_NAME[e.status] || e.status).toLowerCase()}`;
    case 'status': return `${pl(e.country)}: ${e.action === 'clear' ? 'no longer ' : ''}${e.label}`;
    case 'reveal': return `${pl(e.country)} can see ${e.ids?.length ? e.ids.map(uName).join(', ') : `all ${pl(e.other)} forces`}`;
    case 'agent': return e.action === 'remove' ? `${e.name || 'The sender'}'s agent in ${pl(e.target)} removed` : `Agent for ${e.name || 'the sender'} in ${pl(e.target)}: ${e.mission || ''}`;
    case 'battle': return `Battle (rolled): ${(e.attackers || []).map(uName).join(', ')} attack ${(e.defenders || []).map(uName).join(', ')}${e.ids?.length ? `, taking ${e.ids.map((id) => REGION[id]?.name || id).join(', ')} if they win` : ''}`;
  }
  return e.type;
}
// A plan's outcome as a short list. Effects in the approve list can be dropped with ✕.
function planList(key, b, editable) {
  const off = aiOff[key] || new Set();
  const items = (b?.effects || []).map((e, i) => `<li class="${off.has(i) ? 'off' : ''}">${esc(effText(e))}${editable ? `<button type="button" class="x" data-off="${key}:${i}" aria-label="${off.has(i) ? 'Keep' : 'Drop'} this effect" title="${off.has(i) ? 'Keep' : 'Drop'} this effect">${off.has(i) ? '↺' : '✕'}</button>` : ''}</li>`).join('')
    + (b?.headline ? `<li class="head">Headline: ${esc(b.headline)}</li>` : '') + (b?.flash ? `<li class="head flash">Breaking news: ${esc(b.flash.head)}</li>` : '');
  return items;
}
const keptEffects = (key, b) => (b?.effects || []).filter((_, i) => !(aiOff[key] || new Set()).has(i));
function aiBlock(q) {
  if (!q.ai || q.ai.v !== S.AI_VERSION) return `<div class="aibox wait">${aiErr[q.id] ? `${esc(aiErr[q.id])} <button type="button" class="dbtn" data-retry="${q.id}">Try again</button>` : '<i class="spin"></i> The assistant is reading this request…'}</div>`;
  const A = planList(q.id, q.ai.approve, true), R = planList('r' + q.id, q.ai.reject, false);
  return `<div class="aibox"><div><b>If approved</b><ul>${A || `<li class="none">${PROPS_AI === 'claude' ? 'Reply only, nothing changes on the map.' : '<b class="warn">Nothing will change.</b> Keyword mode only understands spies, sharing intel, wars and treaties. Add effects below, or set ANTHROPIC_API_KEY so Claude handles any plan.'}</li>`}</ul></div><div><b>If rejected</b><ul>${R || '<li class="none">Nothing happens.</li>'}</ul></div>${q.ai.approve?.staff_note ? `<small>${esc(q.ai.approve.staff_note)}</small>` : ''}</div>`;
}
let qFilter = 'pending', qCountry = '';
function qDetail(q) {
  const d = q.detail || {}; let s = '';
  if (q.type === 'fleet') { const u = STATE.units.find((x) => x.id === d.unit); s = u ? `${esc(u.name)} (${KIND_NAME[u.kind].toLowerCase()}, ${S.realText(u)}) to <b>${esc(d.dest)}</b>` : ''; }
  if (q.type === 'spy') s = `Target ${esc(d.target)} · mission: ${esc(d.mission)} · budget $${d.cost}M`;
  if (q.type === 'money') s = `$${d.amount}M from ${POWERS[q.country].label} to ${esc(d.to)} · treasury now $${STATE.treasury[q.country]}M`;
  if (q.type === 'build') s = `${d.qty} × ${esc(d.btype)} · cost $${(BUILD[d.btype] || 0) * d.qty}M${d.where ? ` · in <b>${esc(d.where)}</b>` : ''}`;
  if (q.type === 'op') s = `${esc(d.op || '')} · budget $${d.cost}M${d.where ? ` · at <b>${esc(d.where)}</b>` : ''}`;
  if (q.type === 'secret') s = [d.cost ? `Budget $${d.cost}M` : '', d.where ? `Marked: <b>${esc(d.where)}</b>` : ''].filter(Boolean).join(' · ');
  if (q.type === 'treaty' && d.with) s = `With <b>${POWERS[d.with].label}</b>`;
  return [s, q.text ? `“${esc(q.text)}”` : ''].filter(Boolean).join('<br>');
}
const TYPE_PILL = { fleet: 'move', secret: 'crisis note', build: 'build', money: 'money', spy: 'spy', op: 'operation', press: 'press', treaty: 'treaty', propaganda: 'propaganda' };
function keepInputs(root, fn) {
  const vals = {}; root.querySelectorAll('textarea[id], input[id]').forEach((t) => (vals[t.id] = t.type === 'checkbox' ? t.checked : t.value));
  const act = document.activeElement; const focusId = root.contains(act) ? act.id : null; const sel = focusId && 'selectionStart' in act ? [act.selectionStart, act.selectionEnd] : null;
  fn();
  for (const [id, v] of Object.entries(vals)) { const t = document.getElementById(id); if (!t) continue; if (t.type === 'checkbox') t.checked = v; else if (v) t.value = v; }
  if (focusId) { const t = document.getElementById(focusId); if (t) { t.focus(); if (sel) try { t.setSelectionRange(...sel); } catch {} } }
}
let unitSig = '';
function refreshBattleLists() {
  const sig = STATE.units.map((u) => u.id + ':' + u.str).join(); if (sig === unitSig || !$('b-att')) return; unitSig = sig;
  for (const [id, sel] of [['b-att', battleSel.att], ['b-def', battleSel.def]]) { $(id).innerHTML = unitOptions(); [...$(id).options].forEach((o) => (o.selected = sel.has(o.value))); }
  renderBattleResult();
}
let queueSig = '', chairSig = '', undoSig = '';
function renderStaff() {
  const Q = STATE.queue || []; const pending = Q.filter((q) => q.status === 'pending').length;
  $('q-count').textContent = `${pending} waiting`; $('sdrawer').classList.toggle('has', pending > 0);
  if ($('cu-now')) $('cu-now').innerHTML = `<span class="card-title">Now showing: Crisis Update ${STATE.update.no}</span><b>${esc(STATE.update.title)}</b> ${esc(STATE.update.text)}`;
  const dn = (STATE.directives || []).filter((d) => d.status === 'chair' || (d.status === 'passed' && !d.carried)).length; $('stc-dir').textContent = dn; $('stc-dir').hidden = !dn;
  $('ai-mode').textContent = PROPS_AI === 'claude' ? 'Claude suggests what each request does. Drop any effect with ✕, write a reply to change the outcome, or add your own effects. You can undo the last decision for 10 minutes.' : 'Keyword matching only (no ANTHROPIC_API_KEY). Wars, peace and alliances are detected; add other effects by hand.';
  const list = Q.filter((q) => (qFilter === 'all' || q.status === 'pending') && (!qCountry || q.country === qCountry));
  const qsig = JSON.stringify([qFilter, qCountry, list.map((q) => [q.id, q.status, q.ai?.v || 0, aiErr[q.id] || '', [...(aiOff[q.id] || [])]])]);
  if (qsig !== queueSig) { queueSig = qsig; keepFx($('queue'), () => keepInputs($('queue'), () => {
    $('queue').innerHTML = list.map((q) => `<div class="qcard${q.status !== 'pending' ? ' done' : ''}" data-q="${q.id}">
      <div class="qtop">${flag(q.country)}<b>${esc(q.from)}</b>${POWERS[q.country].label} · ${esc(q.time)}<span class="pill type">${TYPE_PILL[q.type] || q.type}</span><span class="pill ${q.vis}">${q.vis}</span>${q.status !== 'pending' ? `<span class="pill ${q.status}">${esc(q.outcome || q.status)}</span>` : ''}</div>
      ${q.detail?.to ? `<div class="qto">To <b>${esc(q.detail.to)}</b> (backroom) · ${esc(S.backroomNamed(q.detail.to)?.title || '')}. Reply as them.</div>` : ''}<div class="qtitle">${esc(q.title)}</div>${qDetail(q) ? `<div class="qdetail">${qDetail(q)}</div>` : ''}${qSpot(q) ? `<button type="button" class="dbtn small" data-show="${q.id}">Show on map</button>` : ''}
      ${q.status === 'pending' ? `${aiBlock(q)}
        <textarea id="r-${q.id}" maxlength="800" aria-label="Reply to ${esc(q.from)}" placeholder="Reply (optional). Describe what happens and the effects are matched to your reply."></textarea>
        ${fxEditor(q.id, false, 'Add your own effects').replace('class="fx"', `class="fx" data-country="${q.country}" data-vis="${q.vis}" data-here="${q.detail?.at ? 1 : 0}"`)}
        <div class="qbtns"><button type="button" class="dbtn green" data-dec="approve" data-q="${q.id}">Approve</button><button type="button" class="dbtn red" data-dec="reject" data-q="${q.id}">Reject</button>${q.type === 'fleet' ? `<label class="check"><input type="checkbox" id="sec-${q.id}"${q.vis === 'private' ? ' checked' : ''}> Keep the move off the projector</label>` : ''}</div>`
      : `<div class="qresult">Reply: <b>${esc(q.reply || '')}</b>${q.effects ? `<br>Effects: ${q.effects.map(esc).join(', ')}` : ''}</div>`}
    </div>`).join('') || '<p class="formnote">Nothing waiting. New requests appear here a second or two after delegates send them.</p>';
  })); }
  const csig = JSON.stringify([(STATE.directives || []).map((d) => [d.id, d.status, d.signed.length, (d.carried || []).length, !!d.ai, aiErr[d.id] || '', [...(aiOff['d' + d.id] || [])]])]);
  if (csig !== chairSig) { chairSig = csig; keepFx($('chair'), () => keepInputs($('chair'), renderChair)); }
  const u = STATE.undo; const live = u && Date.now() + SKEW - u.at < 600000; const us = live ? u.label + u.at : '';
  if (us !== undoSig) { undoSig = us; $('undobar').hidden = !live; if (live) $('undobar').innerHTML = `<span>Last decision: <b>${esc(u.label)}</b></span><button type="button" class="dbtn" id="undo-btn">Undo it</button>`; }
  renderProj(); renderStaffMessages(); refreshBattleLists(); renderFeatList(); renderRels(); renderBattleTray();
  const mc = (STATE.messages || []).length; $('stc-msgs').textContent = mc; $('stc-msgs').hidden = !mc;
  const cd = $('cu-date'); if (cd && !cd.value && document.activeElement !== cd) cd.value = STATE.update?.date || '';
  pumpAssistant();
}
function renderChair() {
  const rows = (STATE.directives || []).filter((d) => d.status !== 'drafting');
  $('chair').innerHTML = rows.map((d) => `<div class="chair-row"><div class="dir-top"><b>${d.no ? esc(d.no) + ': ' : ''}${esc(d.title)}</b><span class="pill ${d.status}">${DSTATUS[d.status]}</span></div>
    <ol class="formnote" style="margin:0;padding-left:18px">${d.clauses.map((c) => `<li>${esc(c)}</li>`).join('')}</ol>
    <small class="formnote">Sponsors ${d.sponsors.map(esc).join(', ')} · ${d.signed.length} signatures${d.vote ? ' · ' + esc(d.vote) : ''}</small>
    ${d.status === 'chair' ? `<div class="qbtns"><button type="button" class="dbtn gold" data-ch="floor" data-d="${d.id}">Put it on the floor</button><button type="button" class="dbtn" data-ch="back" data-d="${d.id}">Send back</button></div>` : ''}
    ${d.status === 'floor' ? `<div class="votes"><label>For <input type="number" min="0" id="vf-${d.id}" value="0"></label><label>Against <input type="number" min="0" id="va-${d.id}" value="0"></label><button type="button" class="dbtn gold" data-ch="vote" data-d="${d.id}">Record placard vote</button></div>` : ''}
    ${d.status === 'passed' && !d.carried ? `${d.ai ? `<div class="aibox"><div><b>Carrying it out will</b><ul>${planList('d' + d.id, d.ai, true) || '<li class="none">Nothing on the map. Add effects by hand if needed.</li>'}</ul></div>${d.ai.staff_note ? `<small>${esc(d.ai.staff_note)}</small>` : ''}</div>` : `<div class="aibox wait">${aiErr[d.id] ? `${esc(aiErr[d.id])} <button type="button" class="dbtn" data-retry="${d.id}">Try again</button>` : '<i class="spin"></i> The assistant is reading the clauses…'}</div>`}
      ${fxEditor('dir-' + d.id, false, 'Add your own effects')}<div class="qbtns"><button type="button" class="dbtn gold" data-ch="carry" data-d="${d.id}">Carry out the directive</button></div>` : ''}
    ${d.carried ? `<small class="formnote">Carried out: ${d.carried.map(esc).join(', ') || 'no map changes'}</small>` : ''}
  </div>`).join('') || '<p class="formnote">No directives yet. They appear here once delegates send them for signatures.</p>';
}
let relSig = '';
function renderRels() {
  const sig = JSON.stringify([STATE.relations, STATE.status]); if (sig === relSig) return; relSig = sig;
  const opts = ORDER.map((k) => `<option value="${k}">${POWERS[k].label}</option>`).join('');
  $('rels').innerHTML = `<ul class="plist">${(STATE.relations || []).map((r) => `<li>${flag(r.a)} ${esc(pl(r.a))} and ${flag(r.b)} ${esc(pl(r.b))}: <b>${esc(S.RELATION_NAME[r.status] || r.status)}</b> <button type="button" class="dbtn" data-unrel="${r.a}|${r.b}">End</button></li>`).join('')}</ul>
    <div class="row"><select id="rl-a">${opts}</select><select id="rl-s"><option value="war">at war with</option><option value="alliance">allied with</option><option value="pact">non-aggression pact with</option><option value="trade">trade deal with</option><option value="tension">tension with</option></select><select id="rl-b">${opts}</select><button type="button" class="dbtn gold" id="rl-add">Set</button></div>
    <h3 class="formnote" style="margin-top:10px">Country conditions</h3>${Object.entries(STATE.status || {}).flatMap(([c, l]) => l.map((x) => `<span class="schip ${x.tone}">${flag(c)} ${esc(x.label)} <button type="button" data-unstat="${c}|${esc(x.label)}" aria-label="Clear">✕</button></span>`)).join('') || '<p class="formnote">None yet. Notes like "start rationing" add them.</p>'}`;
}
const qSpot = (q) => q.detail?.at || (q.type === 'fleet' && STATE.units.find((u) => u.id === q.detail?.unit)?.at) || null;
async function decideQ(q, ok, btn) {
  const card = btn.closest('.qcard'); const reply = ($('r-' + q.id)?.value || '').trim(); const box = card.querySelector('.fx');
  const manual = readFx(box); const key = ok ? q.id : 'r' + q.id;
  // Don't approve on an empty plan just because the assistant hasn't answered yet.
  if ((!q.ai || q.ai.v !== S.AI_VERSION) && !manual.length && !reply && !aiErr[q.id]) { toast('The assistant is still reading this request. Give it a few seconds, or add effects by hand.'); return; }
  let b = (ok ? q.ai?.approve : q.ai?.reject) || { effects: [], headline: null, flash: null, reply: '' };
  b = { ...b, effects: keptEffects(key, b) };
  card.querySelectorAll('[data-dec]').forEach((x) => (x.disabled = true));
  if (reply && PROPS_AI === 'claude') {
    btn.textContent = 'Matching effects to your reply…';
    try { const j = await assist({ kind: 'request', id: q.id, decision: ok ? 'approve' : 'reject', reply }); if (j.result) b = j.result; } catch (e) { toast(e.message + ' Using the earlier suggestion.'); }
  }
  const dec = !ok ? (q.type === 'spy' ? 'spy-fail' : 'reject') : q.type === 'fleet' ? ($('sec-' + q.id)?.checked ? 'move-secret' : 'move-public') : q.type === 'spy' ? 'spy-ok' : 'approve';
  const done = await act({ type: 'decide', id: q.id, dec, reply: reply || b.reply || '', effects: [...(b.effects || []), ...manual], headline: b.headline, flash: b.flash, when: readWhen(box) }, { quiet: true });
  if (done) notify({ kind: ok ? 'approved' : 'rejected', title: ok ? 'Approved and sent back' : 'Rejected and sent back', body: `${q.from}: ${q.title}` });
  if (!done) { card.querySelectorAll('[data-dec]').forEach((x) => (x.disabled = false)); btn.textContent = ok ? 'Approve' : 'Reject'; }
}
let evPlan = null;
function renderEvPlan() {
  $('ev-result').innerHTML = evPlan ? `<div class="aibox"><div><b>This will</b><ul>${planList('ev', evPlan, true) || '<li class="none">The assistant found nothing to change. Try describing it differently.</li>'}</ul></div>${evPlan.staff_note ? `<small>${esc(evPlan.staff_note)}</small>` : ''}</div><div class="row"><button type="button" class="dbtn gold" id="ev-go">Make it happen</button><button type="button" class="dbtn" id="ev-cancel">Cancel</button></div>` : '';
}

function bindStaff() {
  $('clk-toggle')?.addEventListener('click', () => act({ type: 'clock', do: STATE.clock?.running ? 'pause' : 'run' }).then(() => syncClockUI(true)));
  $('clk-speed')?.addEventListener('change', (e) => act({ type: 'clock', do: 'speed', k: +e.target.value }));
  $('clk-set')?.addEventListener('click', () => act({ type: 'clock', do: 'set', date: $('clk-date').value, time: $('clk-time').value }).then(() => syncClockUI(true)));
  document.querySelectorAll('[data-modal]').forEach((b) => b.addEventListener('click', () => openModal(b.dataset.modal)));
  document.querySelectorAll('.smodal').forEach((m) => m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-close]')) m.hidden = true; }));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelectorAll('.smodal').forEach((m) => (m.hidden = true)); });
  $('sd-toggle').addEventListener('click', () => { const d = $('sdrawer'); const shut = d.classList.toggle('shut'); $('sd-toggle').textContent = shut ? '›' : '‹'; $('sd-toggle').setAttribute('aria-expanded', !shut); });
  $('btray').addEventListener('click', (e) => { if (e.target.id === 'bt-open') openModal('battle'); if (e.target.id === 'bt-clear') { battleSel.att.clear(); battleSel.def.clear(); syncBattleSelects(); renderEdit(); } });
  $('queue').addEventListener('click', (e) => {
    const off = e.target.closest('[data-off]'); if (off) { const [k, i] = off.dataset.off.split(':'); const set = (aiOff[k] = aiOff[k] || new Set()); set.has(+i) ? set.delete(+i) : set.add(+i); queueSig = ''; renderStaff(); return; }
    const re = e.target.closest('[data-retry]'); if (re) { delete aiAsked[re.dataset.retry]; delete aiErr[re.dataset.retry]; queueSig = ''; renderStaff(); return; }
    const sh = e.target.closest('[data-show]'); if (sh) { const q = STATE.queue.find((x) => x.id === sh.dataset.show); const at = q && qSpot(q); if (at && mapGlobe) mapGlobe.pulse(at, q.from); return; }
    const b = e.target.closest('[data-dec]'); if (!b) return; const q = STATE.queue.find((x) => x.id === b.dataset.q); if (q) decideQ(q, b.dataset.dec === 'approve', b);
  });
  bindFx($('view-staff-root'));
  $('undobar').addEventListener('click', (e) => { if (e.target.id === 'undo-btn') act({ type: 'undo' }).then(() => { queueSig = ''; chairSig = ''; }); });
  $('chair').addEventListener('click', (e) => {
    const off = e.target.closest('[data-off]'); if (off) { const [k, i] = off.dataset.off.split(':'); const set = (aiOff[k] = aiOff[k] || new Set()); set.has(+i) ? set.delete(+i) : set.add(+i); chairSig = ''; renderStaff(); return; }
    const re = e.target.closest('[data-retry]'); if (re) { delete aiAsked[re.dataset.retry]; delete aiErr[re.dataset.retry]; chairSig = ''; renderStaff(); return; }
    const b = e.target.closest('[data-ch]'); if (!b) return; const id = b.dataset.d;
    if (b.dataset.ch === 'floor') act({ type: 'chair.floor', id });
    if (b.dataset.ch === 'back') act({ type: 'chair.back', id });
    if (b.dataset.ch === 'carry') {
      const d = STATE.directives.find((x) => x.id === id); const box = b.closest('.chair-row').querySelector('.fx');
      const fx = [...keptEffects('d' + id, d.ai), ...readFx(box)];
      b.disabled = true; act({ type: 'effects.apply', directive: id, effects: fx, headline: d.ai?.headline, flash: d.ai?.flash, when: readWhen(box), empty: true }).then((ok) => { b.disabled = false; if (ok) chairSig = ''; });
    }
    if (b.dataset.ch === 'vote') act({ type: 'chair.vote', id, for: $('vf-' + id).value, against: $('va-' + id).value });
  });
  $('ev-preview').addEventListener('click', async (e) => {
    const t = $('ev-text').value.trim(); if (!t) { toast('Describe what happens first.'); return; }
    e.target.disabled = true; e.target.textContent = 'Reading…';
    try { const j = await assist({ kind: 'event', text: t }); evPlan = j.result; aiOff.ev = new Set(); renderEvPlan(); } catch (err) { toast(err.message); }
    e.target.disabled = false; e.target.textContent = 'Preview';
  });
  $('ev-result').addEventListener('click', async (e) => {
    const off = e.target.closest('[data-off]'); if (off) { const i = +off.dataset.off.split(':')[1]; const set = (aiOff.ev = aiOff.ev || new Set()); set.has(i) ? set.delete(i) : set.add(i); renderEvPlan(); return; }
    if (e.target.id === 'ev-cancel') { evPlan = null; renderEvPlan(); }
    if (e.target.id === 'ev-go') { if (await act({ type: 'effects.apply', effects: keptEffects('ev', evPlan), headline: evPlan.headline, flash: evPlan.flash })) { evPlan = null; $('ev-text').value = ''; renderEvPlan(); } }
  });
  $('rels').addEventListener('click', (e) => {
    const u = e.target.closest('[data-unrel]'), us = e.target.closest('[data-unstat]');
    if (u) { const [a, b] = u.dataset.unrel.split('|'); act({ type: 'effects.apply', effects: [{ type: 'relation', country: a, other: b, status: 'none' }] }); }
    if (us) { const [c, l] = us.dataset.unstat.split('|'); act({ type: 'effects.apply', effects: [{ type: 'status', country: c, label: l, action: 'clear' }] }); }
    if (e.target.id === 'rl-add') act({ type: 'effects.apply', effects: [{ type: 'relation', country: $('rl-a').value, other: $('rl-b').value, status: $('rl-s').value }], headline: $('rl-s').value === 'war' ? `${pl($('rl-a').value).toUpperCase()} · ${pl($('rl-a').value)} declares war on ${pl($('rl-b').value)}` : '' });
  });
  $('proj').addEventListener('click', (e) => { const b = e.target.closest('[data-reveal]'); if (b) act({ type: 'reveal', unitId: b.dataset.reveal }); });
  $('featlist').addEventListener('click', (e) => {
    const ua = e.target.closest('[data-unagent],[data-caught]');
    if (ua) { const caught = !!ua.dataset.caught; const [name, id] = (ua.dataset.unagent || ua.dataset.caught).split('|'); const g = AGENTS.find((x) => x.id === id); const r = ROSTER.find((x) => x.name === name);
      act({ type: 'effects.apply', effects: [{ type: 'agent', name, id, action: 'remove' }], headline: caught && g ? `${(POWERS[g.target]?.label || g.target).toUpperCase()} · ${POWERS[r?.country]?.label || 'Foreign'} spy arrested` : '' }); return; } const b = e.target.closest('[data-fl]'), c = e.target.closest('[data-cancel]'); if (b) act({ type: 'feature.edit', id: b.dataset.id, action: b.dataset.fl }); if (c) act({ type: 'schedule.cancel', id: c.dataset.cancel }); });
  document.querySelectorAll('[data-qf]').forEach((b) => b.addEventListener('click', () => { qFilter = b.dataset.qf; document.querySelectorAll('[data-qf]').forEach((x) => x.setAttribute('aria-pressed', x === b)); renderStaff(); }));
  $('q-country').addEventListener('change', (e) => { qCountry = e.target.value; renderStaff(); });
  $('cu-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const ok = await act({ type: 'publish', title: $('cu-title').value, text: $('cu-text').value, date: $('cu-date').value, flash: $('cu-flash').checked, reset: $('cu-reset').checked, minutes: $('cu-min').value });
    if (ok) { $('cu-title').value = ''; $('cu-text').value = ''; }
  });
  $('replay-flash').addEventListener('click', () => act({ type: 'flash' }));
  $('cd-restart').addEventListener('click', () => act({ type: 'countdown', minutes: 15 }));
  $('clear-arrows').addEventListener('click', () => act({ type: 'arrows.clear' }));
  $('free-apply').addEventListener('click', async () => { const box = $('free-fx').querySelector('.fx'); const fx = readFx(box); if (!fx.length) { toast('Add at least one effect first.'); return; } if (await act({ type: 'effects.apply', effects: fx, when: readWhen(box) })) box.querySelector('.fx-rows').innerHTML = ''; });
  $('load-demo').addEventListener('click', () => act({ type: 'game.demo' }));
  $('reset-game').addEventListener('click', () => act({ type: 'game.reset', confirm: $('reset-confirm').value.trim().toUpperCase() }));
}
let flSig = '';
function renderFeatList() {
  const sc = STATE.scheduled || []; const sig = JSON.stringify([FEATS, sc, STATE.update.no, AGENTS]); if (sig === flSig) return; flSig = sig;
  $('featlist').innerHTML = (FEATS.length ? `<div class="codes-wrap"><table class="codes"><tbody>${FEATS.slice().reverse().map((f) => { const st = featState(f); return `<tr><td>${flag(f.owner)} <b>${esc(f.label)}</b><br><small class="formnote">${FEAT[f.kind]?.name}${modText(f.ruined ? 0 : f.mod)} · ${st === 'building' ? `ready after Update ${f.ready}` : st}${f.public ? '' : ' · secret'}</small></td>
    <td class="qbtns">${f.ruined ? `<button type="button" class="dbtn green" data-fl="repair" data-id="${f.id}">Repair</button>` : `<button type="button" class="dbtn red" data-fl="ruin" data-id="${f.id}">Destroy</button>`}${st === 'building' ? `<button type="button" class="dbtn gold" data-fl="finish" data-id="${f.id}">Finish now</button>` : ''}<button type="button" class="dbtn" data-fl="remove" data-id="${f.id}">Remove</button></td></tr>`; }).join('')}</tbody></table></div>` : '<p class="formnote">No map features yet. Add them as effects when approving a plan, or place them in the map editor.</p>')
    + `<h3 class="formnote" style="margin-top:10px">Spies</h3>` + (AGENTS.length ? AGENTS.map((g) => `<div class="projrow"><div><b>${esc(g.owner)}</b> agent in ${esc(POWERS[g.target]?.label || g.target)}<br><small class="formnote">${esc(g.mission || '')}</small></div><div class="qbtns"><button type="button" class="dbtn" data-unagent="${esc(g.owner)}|${g.id}">Recall</button><button type="button" class="dbtn red" data-caught="${esc(g.owner)}|${g.id}">Caught</button></div></div>`).join('') : '<p class="formnote">No spies placed. They appear when a spy plan is approved.</p>')
    + (sc.length ? `<h3 class="formnote" style="margin-top:10px">Scheduled</h3>${sc.map((x) => `<div class="projrow"><div><b>Update ${x.due}</b> ${esc(x.note || 'Staff event')}<br><small class="formnote">${x.effects.map((e) => esc(FX_TYPES[e.type] || e.type)).join(', ')}</small></div><button type="button" class="dbtn red" data-cancel="${x.id}">Cancel</button></div>`).join('')}` : '');
}

let msgSig = '';
function renderStaffMessages() {
  const M = STATE.messages || []; const sig = M.length + ':' + (M[M.length - 1]?.id || ''); if (sig === msgSig) return; msgSig = sig;
  $('staff-msgs').innerHTML = M.slice().reverse().map((m) => `<div class="req msg"><b>${esc(m.from)} → ${(m.to || []).map(esc).join(', ')}</b><span class="formnote">${esc(m.time)}</span><small>${esc(m.text)}</small>${m.intercepted ? `<span class="pill rejected">Intercepted by ${m.intercepted.map(esc).join(', ')}</span>` : ''}</div>`).join('') || '<p class="formnote">No notes yet.</p>';
}
function renderProj() {
  const hidden = (STATE.hiddenMoves || []).map((id) => STATE.units.find((u) => u.id === id)).filter(Boolean);
  $('proj').innerHTML = `<p class="formnote">The projector shows what the whole room knows. Secret moves stay at their old position on the big screen until you reveal them.</p>
    ${hidden.map((u) => `<div class="projrow"><div><b>${esc(u.name)}</b>${POWERS[u.owner].label} · moved secretly</div><button type="button" class="dbtn gold" data-reveal="${u.id}">Reveal on projector</button></div>`).join('') || '<p class="formnote">No hidden moves right now.</p>'}`;
}

/* ---------- Boot ---------- */
export function start(root, props) {
  VIEW = props.view; ROLE = props.session.role; AS = props.as || null; PROPS_AI = props.ai || 'rules';
  // The old map editor now lives on the staff screen.
  if (VIEW === 'map' && ROLE === 'staff' && new URLSearchParams(location.search).get('edit') === '1') { location.replace('/crisis/staff'); return () => {}; }
  if (VIEW === 'staff') { VIEW = 'map'; EDIT = true; STAFFMAP = true; selected = { type: 'none' }; }
  root.innerHTML = skeleton(props);
  // Floating panels sit between the top bar and the bottom dock; keep their heights in CSS variables.
  const measure = () => { const t = root.querySelector('.topbar'), d = root.querySelector('.dock') || root.querySelector('.map-view > .bottom'); document.documentElement.style.setProperty('--topH', (t?.offsetHeight || 0) + 'px'); document.documentElement.style.setProperty('--botH', (d?.offsetHeight || 0) + 'px'); };
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null; root.querySelectorAll('.topbar, .dock, .map-view > .bottom').forEach((e) => ro?.observe(e)); measure();
  if (STAFFMAP) renderBattleShell();
  if (EDIT) bindEdit();
  let stopped = false, timer, failures = 0;
  $('logout').addEventListener('click', async () => { await fetch('/api/crisis/logout', { method: 'POST' }); location.href = '/crisis'; });
  $('view-as')?.addEventListener('change', (e) => { if (e.target.value) location.href = '/crisis/delegate?as=' + encodeURIComponent(e.target.value); });
  $('fs-btn')?.addEventListener('click', () => { document.documentElement.requestFullscreen?.().catch(() => toast('Full screen is not available here. Use the browser menu instead.')); });
  $('breaking').addEventListener('click', () => ($('breaking').hidden = true));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('breaking').hidden = true; });
  document.querySelectorAll('.zoom').forEach((z) => z.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return; const g = z.dataset.g === 'map' ? mapGlobe : delGlobe; if (!g) return;
    if (b.dataset.z === 'feat') { SHOW_FEAT = !SHOW_FEAT; try { localStorage.setItem('crisis-feat', SHOW_FEAT ? 'on' : 'off'); } catch {} b.setAttribute('aria-pressed', SHOW_FEAT); g.setFeatVisible(SHOW_FEAT); return; }
    if (b.dataset.z === 'in') g.zoomTo(1 + ((g.zt ?? g.view.dist) - 1) * 0.72);
    if (b.dataset.z === 'out') g.zoomTo(1 + ((g.zt ?? g.view.dist) - 1) * 1.38);
    if (b.dataset.z === 'reset') { Object.assign(g.view, { ...g.home, dist: g.view.dist }); g.zoomTo(g.home.dist); }
    g.dirty = true;
  }));
  if (VIEW === 'delegate') {
    const TABS = ['act', 'dir', 'intel', 'msg'];
    TABS.forEach((t) => $('t-' + t).addEventListener('click', () => showTab(t)));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('reader').hidden) { closeReader(); return; }
      if (e.key === 'Escape' && !$('brief').hidden) { closeBrief(); return; }
      if (e.key === 'Escape' && !$('lap').hidden) { closeLaptop(); return; }
      if (e.key === 'Escape' && !$('chat').hidden) { closeBloc(); return; }
      if (e.key === 'Escape' && !$('bcompose').hidden) { closeCompose('bcompose'); return; }
      if (e.key === 'Escape' && !$('compose').hidden && !$('compose').classList.contains('min')) { closeCompose(); return; }
      if (e.key === 'Escape' && !$('mcompose').hidden) { closeCompose('mcompose'); return; }
      if (e.key === 'Escape' && !$('letterpop').hidden) { closeLetter(); return; }
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
      if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey && /^[1-4]$/.test(e.key) && OVERLAYS().every((x) => x.hidden)) showTab(TABS[+e.key - 1]);
    });
    $('mailbox').addEventListener('click', openMail);
    $('intel').addEventListener('click', (e) => { const b = e.target.closest('[data-intel]'); const r = b && INTEL_LIST[+b.dataset.intel]; if (r) openIntel(r); });
    $('msgs').addEventListener('click', (e) => { const b = e.target.closest('[data-msg]'); const m = b && MSG_LIST[+b.dataset.msg]; if (m) openMsg(m); });
    $('lap').addEventListener('click', (e) => { if (e.target.id === 'lap') closeLaptop(); });
    $('p-dir').addEventListener('click', (e) => { if (e.target.closest('button, input, textarea, label, form')) return; const c = e.target.closest('[data-dir]'); if (!c) return; const d = (STATE.directives || []).find((x) => x.id === c.dataset.dir); if (d) openReader({ theme: 'directive', d }); });
    $('brief-body').addEventListener('click', (e) => { if (!e.target.closest('[data-secret]')) return; openReader({ theme: 'dossier', kicker: 'Eyes only', title: MEE.name, body: SECRET[MEE.name] || 'Crisis staff will give you a secret objective.', file: `Personal file · ${POWERS[ME].label}`, stamp: 'Top secret' }); });
    $('rd-close').addEventListener('click', closeReader);
    $('brief-btn').addEventListener('click', openBrief); $('brief-close').addEventListener('click', closeBrief);
    $('brief').addEventListener('click', (e) => { if (e.target.id === 'brief' || e.target.classList.contains('bstage')) closeBrief(); });
    $('open-msg').addEventListener('click', () => openCompose('mcompose'));
    $('open-bloc').addEventListener('click', () => openCompose('bcompose'));
    $('blocs').addEventListener('click', (e) => { const b = e.target.closest('[data-bloc]'); if (b) openBloc(b.dataset.bloc); });
    $('bloc-form').addEventListener('submit', async (e) => { e.preventDefault(); const boxes = [...$('bloc-form').querySelectorAll('input:checked')]; const before = new Set((STATE.blocs || []).map((b) => b.id));
      if (await act({ type: 'bloc.create', name: $('bloc-name').value, members: boxes.map((o) => o.value) })) { closeCompose('bcompose'); $('bloc-name').value = ''; boxes.forEach((o) => (o.checked = false)); const nb = (STATE.blocs || []).find((b) => !before.has(b.id)); if (nb) setTimeout(() => openBloc(nb.id), 250); } });
    $('ch-form').addEventListener('submit', sendChat);
    $('ch-text').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } });
    $('ch-close').addEventListener('click', closeBloc);
    $('chat').addEventListener('click', (e) => { if (e.target.id === 'chat') closeBloc(); });
    $('ch-invite').addEventListener('click', () => ($('ch-inv').hidden = !$('ch-inv').hidden));
    $('ch-invgo').addEventListener('click', async () => { const names = [...$('ch-invlist').querySelectorAll('input:checked')].map((i) => i.value); if (await act({ type: 'bloc.invite', id: CHAT, names })) $('ch-inv').hidden = true; });
    $('ch-leave').addEventListener('click', async (e) => { const b = e.currentTarget; if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Click again to leave'; setTimeout(() => { b.dataset.sure = ''; b.textContent = 'Leave'; }, 4000); return; } if (await act({ type: 'bloc.leave', id: CHAT })) closeBloc(); });
    $('c-restore').addEventListener('click', () => minCompose(false));
    ['compose', 'mcompose', 'bcompose'].forEach((id) => $(id).addEventListener('click', (e) => { if (e.target.closest('[data-cclose]') || (e.target.id === id && !$(id).classList.contains('min'))) closeCompose(id); }));
    $('cform').addEventListener('submit', submitAction);
    $('reader').addEventListener('click', (e) => { if (e.target.id === 'reader') closeReader(); });
    $('lt-close').addEventListener('click', () => closeLetter());
    $('lt-next').addEventListener('click', () => closeLetter(true));
    $('lt-follow').addEventListener('click', () => { const id = LETTER?.id; closeLetter(); followParent = id; action = 'secret'; setPick(null); showTab('act'); renderTiles(); renderForm(); setTimeout(() => openCompose(), 250); });
    $('letterpop').addEventListener('click', (e) => { if (e.target === e.currentTarget || e.target.classList.contains('lstage')) closeLetter(); });
    $('form').addEventListener('submit', submitAction);
    $('msg-form').addEventListener('submit', async (e) => {
      e.preventDefault(); const boxes = [...document.querySelectorAll('.notepick input:checked')]; const to = boxes.map((o) => o.value);
      if (await act({ type: 'msg.send', to, text: $('msg-text').value }, { quiet: true })) { closeCompose('mcompose', true); notify({ kind: 'note', title: 'Note passed!', body: `To ${to.join(', ')}. Crisis staff can read every note.` }); $('msg-text').value = ''; boxes.forEach((o) => (o.checked = false)); }
    });
  }
  if (STAFFMAP) bindStaff();
  const cd = setInterval(tickCountdown, 1000);

  const poll = async () => {
    if (stopped) return;
    try { await fetchState(); failures = 0; $('conn').className = 'conn'; $('conn').lastChild.textContent = 'Live'; }
    catch (e) { failures++; if (failures > 1) { $('conn').className = 'conn bad'; $('conn').lastChild.textContent = 'Reconnecting'; $('conn').title = e.message; if (failures === 3 && ROLE === 'staff') toast('Server problem: ' + e.message); } }
    timer = setTimeout(poll, document.hidden ? 4000 : 1500);
  };
  const first = poll();

  if (VIEW !== 'staff') (async () => {
    try {
      const [geo, marble, water, topo, world, wwater, clouds] = await Promise.all([
        fetch('/crisis/geo.json').then((r) => r.json()).then(async (g) => { RSHAPE = await fetch('/crisis/regions.json').then((r) => r.json()); return g; }),
        ...['marble.webp', 'water.png', 'topo.jpg', TEXK > 1 ? 'world8k.webp' : 'world.webp', TEXK > 1 ? 'wwater8k.png' : 'wwater.png', 'clouds.jpg'].map((f) => loadImg('/crisis/' + f)),
      ]);
      A = geo; imgs = { marble, water, topo, world, wwater, clouds }; await first;
      if (stopped) return;
      if (VIEW === 'map') {
        patchCanvas = document.createElement('canvas'); patchCanvas.width = TW * TEXK; patchCanvas.height = TH * TEXK; paintTexture(patchCanvas, imgs);
        mapGlobe = new Globe($('stage-map'), $('ov-map'), { onCountry: (n, lon, lat) => select('country', n, regionAt(lon, lat), [lon, lat]), onUnit: (id) => select('unit', id), onFeature: (id) => select('feature', id), onGround: EDIT ? placeAt : null, pins: STAFFMAP, onSea: EDIT ? (lon, lat) => select('sea', null, null, [lon, lat]) : null });
        mapGlobe.setTextures(world, patchCanvas, topo); mapGlobe.repaintOcc(selected.type === 'country' ? selected.id : null);
      } else {
        fogCanvas = document.createElement('canvas'); fogCanvas.width = TW * TEXK; fogCanvas.height = TH * TEXK; paintTexture(fogCanvas, imgs);
        const cap = { 'United Kingdom': [-0.13, 51.5], France: [2.35, 48.86], Poland: [21, 52.2], Germany: [13.4, 52.5], USSR: [37.6, 55.75], Italy: [12.5, 41.9], Finland: [24.9, 60.2] }[ME] || [15, 50];
        const home = ME === 'United States' ? { lon: -70, lat: 34.5, dist: 2.9 } : ME === 'Japan' ? { lon: 128, lat: 38.5, dist: 2.1 } : { lon: cap[0], lat: cap[1] + 1.5, dist: 1.75 };
        delGlobe = new Globe($('stage-del'), $('ov-del'), { fog: true, pins: true, onGround: pickGround, lon: home.lon, lat: home.lat - 2.5, dist: home.dist, onUnit: (id) => pickForce(id) });
        delGlobe.setTextures(world, fogCanvas, topo); delGlobe.repaintOcc(null); fogSig = JSON.stringify([UNITS.map((u) => [u.id, u.at]), AGENTS, LIVE_ARROWS, CONTROL, RECON]);
      }
    } catch (e) {
      document.querySelectorAll('.loading').forEach((l) => (l.textContent = 'The 3D map could not load. Reload the page, or try another browser.'));
      console.error(e);
    }
  })();
  return () => { stopped = true; ro?.disconnect(); clearTimeout(timer); clearInterval(cd); [mapGlobe, delGlobe].forEach((g) => g && cancelAnimationFrame(g.raf)); };
}
