// Browser side of the crisis app: the 3D globe, figurines and all three screens.
// Loaded only in the browser by components/crisis/CrisisClient.js.
import * as THREE from 'three';
import { mergeBufferGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as S from '@/lib/crisis/scenario';

const { LON0, LON1, LAT0, LAT1, OWNER, NEUTRALS, LABELS, SKIP_WORLD, LABEL_TEXT, CITIES, CAPITAL, CITY_OF, BUILD,
  KIND_NAME, DEST_BY_KIND, ROSTER, POWER_TEXT, ALWAYS, LIMITS_ALWAYS, SECRET, SPECIAL, SIGS_NEEDED, DSTATUS, ORDER, KINDS } = S;
const POWERS = JSON.parse(JSON.stringify(S.POWERS));
Object.values(POWERS).forEach((p) => (p.delegates = []));
ROSTER.forEach((r) => POWERS[r.country]?.delegates.push(r.name));
let A = { geo: {}, wgeo: {}, towns: [], wtowns: [], wsub: {}, wlabels: {} };
let UNITS = [], ALLIES = [], AGENTS = [], LIVE_ARROWS = [];
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
const WW = 4096, WH = 2048;
const PAL = ['#C9A44A', '#5FAE6A', '#B06A9E', '#5E8FC9', '#C97A4A', '#7FA84A', '#9A6FC0', '#4FA6A0', '#C05A5A', '#8E9A4A'];
function worldColor(n) { if (POWERS[ownerOf(n)] || NEUTRALS[n]) return colorOf(n); let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) >>> 0; return PAL[h % PAL.length]; }
function paintWorld(canvas, dark) {
  const ctx = canvas.getContext('2d'); const X = (lon) => (lon + 180) / 360 * WW, Y = (lat) => (90 - lat) / 180 * WH;
  ctx.filter = 'saturate(1.6) contrast(1.12)'; ctx.drawImage(imgs.world, 0, 0, WW, WH); ctx.filter = 'none';
  const sea = document.createElement('canvas'); sea.width = WW; sea.height = WH; const s = sea.getContext('2d');
  s.fillStyle = '#0D1A3E'; s.fillRect(0, 0, WW, WH); s.globalCompositeOperation = 'destination-in'; s.drawImage(imgs.wwater, 0, 0, WW, WH);
  ctx.globalAlpha = 0.95; ctx.drawImage(sea, 0, 0); ctx.globalAlpha = 1;
  const path = (rings) => { ctx.beginPath(); for (const r of rings) { r.forEach(([x, y], i) => i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))); ctx.closePath(); } };
  for (const [n, rings] of Object.entries(A.wgeo)) {
    path(rings); ctx.save(); ctx.clip('evenodd'); ctx.fillStyle = worldColor(n);
    ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = 0.3; ctx.fillRect(0, 0, WW, WH);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.24; ctx.fillRect(0, 0, WW, WH); ctx.restore();
  }
  ctx.globalAlpha = 1; ctx.lineJoin = 'round';
  for (const rings of Object.values(A.wgeo)) { path(rings); ctx.strokeStyle = 'rgba(10,20,40,0.35)'; ctx.lineWidth = 1.8; ctx.stroke(); ctx.strokeStyle = 'rgba(225,240,255,0.45)'; ctx.lineWidth = 0.7; ctx.stroke(); }
  if (dark) {
    const fog = document.createElement('canvas'); fog.width = WW; fog.height = WH; const f = fog.getContext('2d');
    f.fillStyle = 'rgba(28,33,44,0.8)'; f.fillRect(0, 0, WW, WH); f.globalCompositeOperation = 'destination-out'; f.fillStyle = '#000';
    for (const [n, rings] of Object.entries(A.wgeo)) { if (!ALLIES.includes(ownerOf(n))) continue; f.beginPath(); for (const r of rings) { r.forEach(([x, y], i) => i ? f.lineTo(X(x), Y(y)) : f.moveTo(X(x), Y(y))); f.closePath(); } f.fill('evenodd'); }
    const circ = (lo, la, d) => { const x = X(lo), y = Y(la), r = d / 360 * WW; const g = f.createRadialGradient(x, y, r * 0.35, x, y, r); g.addColorStop(0, '#000'); g.addColorStop(1, 'rgba(0,0,0,0)'); f.fillStyle = g; f.beginPath(); f.arc(x, y, r, 0, Math.PI * 2); f.fill(); };
    for (const u of UNITS) { if (ALLIES.includes(u.owner)) circ(u.at[0], u.at[1], u.kind === 'fleet' || u.kind === 'air' ? 6 : 4); else circ(u.at[0], u.at[1], 2.5); }
    ctx.drawImage(fog, 0, 0);
  }
}

let grainPat = null;
let BASE_CACHE = null; // set to a canvas on the projector, where countries are clicked often
function paintTexture(canvas, imgs, sel) {
  const ctx = canvas.getContext('2d');
  if (BASE_CACHE && BASE_CACHE.ready) {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'copy'; ctx.globalAlpha = 1; ctx.drawImage(BASE_CACHE, 0, 0); ctx.globalCompositeOperation = 'source-over';
    ctx.setTransform(TEXK, 0, 0, TEXK, 0, 0); return paintOverlays(ctx, canvas, sel);
  }
  ctx.setTransform(TEXK, 0, 0, TEXK, 0, 0);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.imageSmoothingQuality = 'high';
  // Bright daytime ground.
  ctx.filter = 'saturate(1.6) contrast(1.12)';
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
  if (BASE_CACHE && !BASE_CACHE.ready) {
    BASE_CACHE.width = canvas.width; BASE_CACHE.height = canvas.height; const b = BASE_CACHE.getContext('2d'); b.drawImage(canvas, 0, 0); BASE_CACHE.ready = true;
  }
  paintOverlays(ctx, canvas, sel);
}
function paintOverlays(ctx, canvas, sel) {
  ctx.globalAlpha = 1; ctx.lineJoin = 'round';
  if (sel && A.geo[sel]) {
    ringPath(ctx, A.geo[sel].r);
    ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fill('evenodd');
    ctx.strokeStyle = '#F5C21B'; ctx.lineWidth = 5; ctx.stroke();
  }
  // Offensive arrows.
  // Movement arrows from the server: in the moving side's color, dashed when only that side can see them.
  for (const a of LIVE_ARROWS) {
    const p = a.pts.map(([lo, la]) => [tx(lo), ty(la)]); const col = a.owner === 'Germany' ? '#FF5A46' : (POWERS[a.owner]?.color || '#FF5A46');
    ctx.lineCap = 'round'; ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(15,15,10,0.7)'; ctx.lineWidth = 24; ctx.beginPath(); ctx.moveTo(...p[0]); ctx.quadraticCurveTo(...p[1], ...p[2]); ctx.stroke();
    if (!a.public) ctx.setLineDash([22, 16]);
    ctx.strokeStyle = col; ctx.lineWidth = 9; ctx.stroke(); ctx.setLineDash([]);
    const ang = Math.atan2(p[2][1] - p[1][1], p[2][0] - p[1][0]);
    ctx.save(); ctx.translate(...p[2]); ctx.rotate(ang); ctx.beginPath(); ctx.moveTo(30, 0); ctx.lineTo(-8, -24); ctx.lineTo(-8, 24); ctx.closePath();
    ctx.fillStyle = col; ctx.strokeStyle = 'rgba(15,15,10,0.8)'; ctx.lineWidth = 5; ctx.stroke(); ctx.fill(); ctx.restore();
  }
  feather(canvas);
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
  const g = new THREE.Group(); const hull = 0x5E636B, deck = 0x8B7E66, sup = 0x767C85, dark = 0x2C3036;
  const s = new THREE.Shape(); s.moveTo(-1.6, -0.32); s.lineTo(0.9, -0.36); s.quadraticCurveTo(1.5, -0.28, 1.9, 0); s.quadraticCurveTo(1.5, 0.28, 0.9, 0.36); s.lineTo(-1.6, 0.32); s.quadraticCurveTo(-1.8, 0, -1.6, -0.32);
  const hg = new THREE.ExtrudeGeometry(s, { depth: 0.36, bevelEnabled: false }); hg.rotateX(-Math.PI / 2);
  const h = new THREE.Mesh(hg, mat(hull)); g.add(h);
  const dg = new THREE.ShapeGeometry(s); dg.rotateX(-Math.PI / 2); const d = new THREE.Mesh(dg, mat(deck)); d.position.y = 0.361; g.add(d);
  box(0.9, 0.3, 0.42, sup, -0.1, 0.52, 0, g); box(0.5, 0.32, 0.34, sup, 0.1, 0.82, 0, g); box(0.3, 0.2, 0.3, dark, 0.15, 1.08, 0, g);
  cyl(0.11, 0.13, 0.62, 8, sup, -0.45, 0.88, 0, g); cyl(0.115, 0.115, 0.1, 8, flagHex, -0.45, 1.12, 0, g);
  cyl(0.025, 0.03, 0.95, 5, dark, 0.28, 1.4, 0, g); box(0.02, 0.02, 0.5, dark, 0.28, 1.65, 0, g);
  for (const [x, dir] of [[0.95, 1], [0.58, 1], [-1.05, -1]]) {
    const t = new THREE.Group(); t.position.set(x, 0.48, 0); g.add(t);
    box(0.34, 0.18, 0.3, sup, 0, 0, 0, t);
    for (const z of [-0.07, 0.07]) cyl(0.025, 0.025, 0.5, 5, dark, dir * 0.38, 0.02, z, t, 0, 0, Math.PI / 2);
  }
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
  return g;
}
function plane(owner, flagHex) {
  const g = new THREE.Group(); const c = AIR[owner], dark = 0x222428, glass = 0x2E4A66;
  const body = cyl(0.13, 0.17, 1.7, 6, c, 0, 0, 0, g, Math.PI / 2); body.scale.set(1, 1, 0.9);
  cyl(0.03, 0.16, 0.3, 6, c, 0, 0, -0.98, g, -Math.PI / 2);
  cyl(0.05, 0.13, 0.18, 6, dark, 0, 0, 0.94, g, Math.PI / 2);
  box(0.6, 0.04, 0.05, dark, 0, 0, 1.03, g, 0, 0, 0.5);
  box(2.3, 0.06, 0.44, c, 0, -0.04, 0.18, g);
  box(0.3, 0.065, 0.3, flagHex, -0.95, -0.03, 0.18, g); box(0.3, 0.065, 0.3, flagHex, 0.95, -0.03, 0.18, g);
  box(0.82, 0.05, 0.28, c, 0, 0.02, -0.82, g);
  box(0.05, 0.36, 0.3, c, 0, 0.2, -0.86, g);
  box(0.2, 0.14, 0.34, glass, 0, 0.18, 0.18, g);
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
const flag = (owner, cls = 'fl') => `<svg class="${cls}" viewBox="0 0 30 20" preserveAspectRatio="none" aria-hidden="true">${FLAG_SVG[ownerOf(owner)] || `<rect width="30" height="20" fill="${colorOf(owner)}"/>`}</svg>`;
function paintFog(canvas) {
  paintTexture(canvas, imgs, null);
  const ctx = canvas.getContext('2d');
  const fog = document.createElement('canvas'); fog.width = TW; fog.height = TH; const f = fog.getContext('2d');
  f.fillStyle = 'rgba(28,33,44,0.8)'; f.fillRect(0, 0, TW, TH);
  // Cloudy texture so the fog reads as fog, not a flat tint.
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 260; i++) {
    const x = rnd() * TW, y = rnd() * TH, r = 60 + rnd() * 260; const g = f.createRadialGradient(x, y, 0, x, y, r);
    const light = rnd() > 0.5; g.addColorStop(0, light ? 'rgba(120,130,150,0.22)' : 'rgba(5,8,14,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    f.fillStyle = g; f.beginPath(); f.arc(x, y, r, 0, Math.PI * 2); f.fill();
  }
  // Clear the fog where this delegate can see.
  f.globalCompositeOperation = 'destination-out';
  for (const n of ALLIES) { const g = A.geo[n]; if (!g) continue; ringPath(f, g.r); f.fillStyle = '#000'; f.fill('evenodd'); f.lineWidth = 60; f.strokeStyle = 'rgba(0,0,0,.6)'; f.stroke(); }
  const deg = TW / (LON1 - LON0);
  const clear = (lon, lat, rDeg) => { const x = tx(lon), y = ty(lat), r = rDeg * deg; const g = f.createRadialGradient(x, y, r * 0.35, x, y, r); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)'); f.fillStyle = g; f.beginPath(); f.arc(x, y, r, 0, Math.PI * 2); f.fill(); };
  for (const u of UNITS) { if (ALLIES.includes(u.owner)) clear(u.at[0], u.at[1], u.kind === 'air' ? 5 : u.kind === 'fleet' ? 4 : 3); else clear(u.at[0], u.at[1], 2.2); }
  for (const a of AGENTS) { const c = CAPITAL[a.target]; if (c) clear(c[0], c[1], 2.6); }
  ctx.drawImage(fog, 0, 0);
  feather(canvas);
}
const D2R = Math.PI / 180;
const toVec = (lon, lat, r = 1) => new THREE.Vector3(r * Math.cos(lat * D2R) * Math.cos(lon * D2R), r * Math.sin(lat * D2R), -r * Math.cos(lat * D2R) * Math.sin(lon * D2R));

function inRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function countryAt(lon, lat) {
  for (const [n, g] of Object.entries(A.geo)) { let c = 0; for (const r of g.r) if (inRing(lon, lat, r)) c++; if (c % 2) return n; }
  for (const [n, rings] of Object.entries(A.wgeo)) for (const r of rings) if (inRing(lon, lat, r)) return n;
  return null;
}

class Globe {
  constructor(stage, overlay, opts) {
    this.stage = stage; this.ov = overlay; this.opts = opts;
    this.view = { lon: opts.lon ?? 15, lat: (opts.lat ?? 49) + 2.5, dist: opts.dist ?? 1.42, heading: 0, tilt: 0.42 }; this.home = { ...this.view };
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
    let lastCloud = -1e9;
    const loop = (t = 0) => {
      let cloudOnly = false;
      if (this.clouds && !reduce && t - lastCloud > 200) { this.clouds.rotation.y = t * 0.000004; lastCloud = t; cloudOnly = !this.dirty; }
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
    const wc = document.createElement('canvas'); wc.width = WW; wc.height = WH; paintWorld(wc, this.opts.fog); this.worldCanvas = wc;
    const wt = new THREE.CanvasTexture(wc); this.worldTex = wt; wt.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const wspec = new THREE.Texture(imgs.wwater); wspec.needsUpdate = true;
    const base = new THREE.Mesh(new THREE.SphereGeometry(1, 192, 144), new THREE.MeshPhongMaterial({ map: wt, specularMap: wspec, shininess: 18, specular: 0x1c2638 }));
    this.scene.add(base); this.base = base;
    this.patchTex = new THREE.CanvasTexture(patchCanvas); this.patchTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const bump = new THREE.Texture(topo); bump.needsUpdate = true;
    const pspec = new THREE.Texture(imgs.water); pspec.needsUpdate = true;
    const geo = new THREE.SphereGeometry(1.0008, 360, 220, (LON0 + 180) * D2R, (LON1 - LON0) * D2R, (90 - LAT1) * D2R, (LAT1 - LAT0) * D2R);
    this.patch = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ map: this.patchTex, bumpMap: bump, bumpScale: 0.02, specularMap: pspec, shininess: 18, specular: 0x1c2638, transparent: true }));
    this.scene.add(this.patch);
    const ca = new THREE.Texture(imgs.clouds); ca.needsUpdate = true;
    this.clouds = new THREE.Mesh(new THREE.SphereGeometry(1.012, 128, 96), new THREE.MeshLambertMaterial({ color: 0xffffff, alphaMap: ca, transparent: true, opacity: 0.32, depthWrite: false }));
    this.scene.add(this.clouds);
    this.stage.querySelector('.loading')?.remove();
    this.addUnits(); this.addLights(); this.buildOverlay(); this.addPins(); this.dirty = true;
  }
  addLights() {
    // Glowing city lights: additive sprites in each country's color, with a white-hot core.
    const tex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64); g.fillStyle = '#fff'; g.fillRect(22, 22, 20, 20); return new THREE.CanvasTexture(c); })();
    const seen = (lo, la, o) => !this.opts.fog || ALLIES.includes(ownerOf(o)) || AGENTS.some(a => { const c = CAPITAL[a.target]; return c && Math.hypot(c[0] - lo, c[1] - la) < 2.4; });
    const make = (pts, size) => {
      const pos = [], col = []; const c = new THREE.Color();
      for (const [lo, la, w, o] of pts) { if (!seen(lo, la, o)) continue; const v = toVec(lo, la, 1.0025); pos.push(v.x, v.y, v.z); c.set(worldColor(o || '')).lerp(new THREE.Color(0xffffff), 0.15).multiplyScalar(w); col.push(c.r, c.g, c.b); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      return new THREE.Points(g, new THREE.PointsMaterial({ size, map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: false }));
    };
    if (this.lights) this.lights.forEach(l => this.scene.remove(l));
    const towns = A.towns.concat(A.wtowns).map(([lo, la, v, o]) => [lo, la, 0.8 + (v - 70) / 185 * 0.7, o]);
    const caps = Object.values(CITIES).map(([lo, la]) => [lo, la, 1.6, countryAt(lo, la)]);
    const pr = this.renderer.getPixelRatio(); this.lights = [make(towns, 13 * pr), make(caps, 30 * pr)]; this.lights.forEach(l => this.scene.add(l));
  }
  addUnits() {
    this.unitGroup = new THREE.Group(); this.scene.add(this.unitGroup); this.figs = {};
    const Y = new THREE.Vector3(0, 1, 0);
    for (const u of UNITS) {
      const f = makeFigure(u); const [lo, la] = this.posOf(u); this.place(f, lo, la);
      f.scale.setScalar(0.0105); this.unitGroup.add(f); this.figs[u.id] = f;
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
    if (changed) { this.rebuild(); this.markSelected(this.selectedUnit); }
    if (prev) for (const u of UNITS) { const p = prev[u.id]; if (p && (p.at[0] !== u.at[0] || p.at[1] !== u.at[1])) this.animateUnit(u.id, p.at, u.at); }
  }
  rebuild() {
    if (this.unitGroup) this.scene.remove(this.unitGroup);
    this.addUnits(); this.buildOverlay(); this.addPins(); this.dirty = true;
  }
  addPins() {
    if (!this.opts.pins || !this.ov) return;
    this.items = (this.items || []).filter(it => { if (it.kind === 'pin') { it.el.remove(); return false; } return true; });
    for (const a of AGENTS) {
      const c = CAPITAL[a.target]; if (!c) continue; const [lo, la] = c; const d = document.createElement('div'); d.className = 'pin';
      d.innerHTML = `<b>Agent</b> ${String(a.mission).replace(/[<>&]/g, '')}`; this.ov.appendChild(d); this.items.push({ el: d, lon: lo, lat: la, kind: 'pin' });
    }
    this.dirty = true;
  }
  markSelected(id) {
    for (const [k, f] of Object.entries(this.figs || {})) f.traverse(o => { if (o.name === 'sel') o.visible = k === id; });
    this.dirty = true;
  }
  refreshTexture() { if (this.patchTex) { this.patchTex.needsUpdate = true; this.dirty = true; } }
  resize() {
    const w = this.stage.clientWidth, h = this.stage.clientHeight; if (!w || !h) return;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.dirty = true;
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
    for (const [n, [lo, la]] of Object.entries(CITIES)) {
      const d = document.createElement('div'); d.className = 'city'; d.textContent = n; this.ov.appendChild(d); this.items.push({ el: d, lon: lo, lat: la, kind: 'city' });
    }
    for (const u of UNITS) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'tok'; b.dataset.id = u.id;
      b.setAttribute('aria-label', `${u.name}, ${POWERS[u.owner].label}, strength ${u.str}`);
      const est = this.opts.fog && !ALLIES.includes(u.owner);
      if (est) { b.classList.add('spotted'); b.title = u.spotted || 'Spotted'; b.setAttribute('aria-label', `${u.name}, ${POWERS[u.owner].label}, estimated strength ${u.str}. ${u.spotted || ''}`); }
      b.innerHTML = `${flag(u.owner)}<b class="num">${est ? '~' : ''}${u.str}</b>`;
      if (this.opts.onUnit) b.addEventListener('click', (e) => { e.stopPropagation(); this.opts.onUnit(u.id); });
      this.ov.appendChild(b); const [plo, pla] = this.posOf(u); this.items.push({ el: b, lon: plo, lat: pla, kind: 'tok', id: u.id, air: u.kind === 'air' });
    }
  }
  layout() {
    if (!this.items) return;
    this._w = this.stage.clientWidth; this._h = this.stage.clientHeight;
    const zoom = Math.min(2.2, 0.42 / Math.max(0.04, this.view.dist - 1) ); const w = this._w; const k = Math.max(0.7, Math.min(1.6, w / 1200)) * zoom;
    const SHIFT = { lbl: 'translate(-50%, -50%)', city: 'translate(6px, -100%)', tok: 'translate(-50%, -50%)', pin: 'translate(-50%, -100%)' };
    for (const it of this.items) {
      const p = this.project(it.lon, it.lat, it.kind === 'tok' ? (it.air ? 0.026 : 0.019) : 0);
      let show = p.ok;
      if (show && it.kind === 'city' && zoom < 0.85 && !['London', 'Paris', 'Berlin', 'Warsaw', 'Rome', 'Moscow'].includes(it.el.textContent)) show = false;
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
        const hit = ray.intersectObjects([this.patch, this.base])[0];
        if (hit && this.opts.onCountry) { const p = hit.point.clone().normalize(); const lat = Math.asin(p.y) / D2R, lon = Math.atan2(-p.z, p.x) / D2R; const n = countryAt(lon, lat); if (n) this.opts.onCountry(n); }
      }
      drag = null;
    });
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.view.dist = Math.max(1.05, Math.min(3.6, 1 + (this.view.dist - 1) * (1 + e.deltaY * 0.0015))); this.dirty = true; }, { passive: false });
  }
}
/* ====================================================================== */
/* App shell: screens, live state from the server, and actions            */
/* ====================================================================== */
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const $ = (id) => document.getElementById(id);
let VIEW, ROLE, AS, STATE = null, VER = 0, SKEW = 0, lastFlashId, MEE = null, ME = null;
let selected = { type: 'country', id: 'Poland' };
let toastTimer;
function toast(msg) { const t = $('toast'); if (!t) return; t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 3200); }
function initials(name) { return name.replace(/"[^"]*"/g, '').split(/\s+/).filter((w) => /^[A-ZÉÓŁ]/.test(w)).map((w) => w[0]).join('').slice(0, 2); }
const opt = (arr, sel) => arr.map((d) => `<option${d === sel ? ' selected' : ''}>${esc(d)}</option>`).join('');
const ZOOM = (g) => `<div class="zoom glass" data-g="${g}"><button type="button" data-z="in" aria-label="Zoom in">+</button><button type="button" data-z="out" aria-label="Zoom out">−</button><button type="button" data-z="reset" aria-label="Reset view">FIT</button></div>`;
const DATECARD = `<div class="date glass num"><span class="date-line"></span><small class="countdown">Next crisis update in <b>15:00</b></small></div>`;

function skeleton(p) {
  const nav = ROLE === 'staff'
    ? `<a class="navlink${VIEW === 'staff' ? ' on' : ''}" href="/crisis/staff">Staff</a><a class="navlink${VIEW === 'map' ? ' on' : ''}" href="/crisis/map" target="_blank" rel="noopener">Projector</a>
       <select class="navlink" id="view-as" aria-label="Preview a delegate's laptop"><option value="">Preview a delegate…</option>${ROSTER.map((r) => `<option${r.name === AS ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</select>`
    : ROLE === 'projector' ? `<button type="button" class="navlink" id="fs-btn">Full screen</button>` : '';
  const sub = VIEW === 'staff' ? 'Crisis staff' : VIEW === 'map' ? 'SLOMUN II crisis' : AS ? `Preview: ${esc(AS)} (read only)` : 'Delegate laptop';
  const top = `<header class="topbar">
    <div class="brand"><img src="/images/crest.png" alt="SLOMUN crest"><div><b>Early WWII</b><span>${sub}</span></div></div>
    <div class="hud num" id="treasuries" aria-label="Treasuries"></div>
    <div class="topnav">${nav}<span class="conn" id="conn"><i></i><span>Live</span></span><button type="button" class="navlink" id="logout">Log out</button></div>
  </header>`;
  let body = '';
  if (VIEW === 'map') body = `<section class="view map-view">
    <div class="stage" id="stage-map"><div class="loading">Loading the map…</div><div class="overlay" id="ov-map"></div>
      ${DATECARD}
      <div class="queuecard glass"><b class="num" id="pend-count">0</b><span>Requests waiting<br>for crisis staff</span></div>
      <div class="floorcard glass" id="floorcard" hidden></div>
      <div class="update glass" id="update-card"></div>
      <div class="selcard glass" id="selpanel" aria-live="polite"></div>
      <div class="hint glass">Left-drag to turn · right-drag to move · scroll to zoom</div>${ZOOM('map')}
    </div>
    <div class="bottom"><div class="ticker" aria-label="News wire"><div class="tag">Wire</div><div class="feed"><div class="track" id="track"></div></div></div></div>
  </section>`;
  if (VIEW === 'delegate') body = `<section class="view"><div class="dlayout">
    <div class="stage" id="stage-del"><div class="loading">Loading the map…</div><div class="overlay" id="ov-del"></div>${DATECARD}
      <div class="fognote glass"><i></i><span>Fog of war. You see your own and allied forces, plus whatever your patrols and spies have found.</span></div>${ZOOM('del')}</div>
    <aside class="side">
      <div class="who"><div class="badge flagbadge" id="who-flag"></div><div><b id="who-name"></b><span id="who-role"></span></div></div>
      <div class="myres num"><div><b id="my-money"></b><span>Treasury</span></div><div><b id="my-forces"></b><span>Forces</span></div><div><b id="my-update"></b><span>Crisis update</span></div></div>
      <div class="tabs" role="tablist" aria-label="Delegate panels">
        <button type="button" role="tab" id="t-act" aria-selected="true" aria-controls="p-act">Actions</button>
        <button type="button" role="tab" id="t-dir" aria-selected="false" aria-controls="p-dir">Directives<span class="count num" id="c-dir" hidden></span></button>
        <button type="button" role="tab" id="t-port" aria-selected="false" aria-controls="p-port">Portfolio</button>
        <button type="button" role="tab" id="t-intel" aria-selected="false" aria-controls="p-intel">Intel<span class="count num" id="c-intel"></span></button>
        <button type="button" role="tab" id="t-req" aria-selected="false" aria-controls="p-req">Requests<span class="count num" id="c-req"></span></button>
      </div>
      <div id="p-act" role="tabpanel" aria-labelledby="t-act"><div class="tiles" id="tiles"></div><form class="form" id="form" novalidate></form></div>
      <div id="p-dir" role="tabpanel" aria-labelledby="t-dir" hidden></div>
      <div id="p-port" role="tabpanel" aria-labelledby="t-port" hidden></div>
      <div id="p-intel" role="tabpanel" aria-labelledby="t-intel" hidden><div class="reqs" id="intel"></div></div>
      <div id="p-req" role="tabpanel" aria-labelledby="t-req" hidden><div class="reqs" id="reqs"></div></div>
    </aside></div>
    <div class="bottom"><div class="ticker" aria-label="News wire"><div class="tag">Wire</div><div class="feed"><div class="track" id="track"></div></div></div></div>
  </section>`;
  if (VIEW === 'staff') body = `<section class="view staff">
    <div class="sgrid">
      <div class="scol">
        <div class="spanel"><div class="shead"><h2>Request queue</h2><span class="pill pending num" id="q-count"></span>
          <div class="seg small" role="group" aria-label="Filter requests"><button type="button" data-qf="pending" aria-pressed="true">Pending</button><button type="button" data-qf="all" aria-pressed="false">All</button></div>
          <select id="q-country" aria-label="Filter by country"><option value="">All countries</option>${ORDER.map((k) => `<option value="${k}">${POWERS[k].label}</option>`).join('')}</select></div>
          <div id="queue" class="queue-list"></div></div>
      </div>
      <div class="scol">
        <div class="spanel"><h2>Directives (chair)</h2><div id="chair"></div></div>
        <div class="spanel"><h2>Publish crisis update</h2>
          <form id="cu-form" class="dform" novalidate>
            <label for="cu-title">Headline<input type="text" id="cu-title" maxlength="140" placeholder="For example: Soviet troops cross into eastern Poland"></label>
            <label for="cu-text">What happened<textarea id="cu-text" maxlength="900" placeholder="Two or three sentences for the room."></textarea></label>
            <label for="cu-date">Game date and time<input type="text" id="cu-date" maxlength="60"></label>
            <label class="check"><input type="checkbox" id="cu-flash" checked> Show as a breaking news flash on the projector</label>
            <label class="check"><input type="checkbox" id="cu-reset" checked> Restart the countdown at <input type="number" id="cu-min" min="1" max="60" value="15" style="width:56px"> minutes</label>
            <button type="submit" class="dbtn gold">Publish to the room</button>
          </form></div>
        <div class="spanel"><h2>Projector</h2><div id="proj"></div>
          <div class="row"><button type="button" class="dbtn" id="replay-flash">Replay the last update as a flash</button><button type="button" class="dbtn" id="cd-restart">Restart countdown (15 min)</button><button type="button" class="dbtn" id="clear-arrows">Clear all arrows</button></div>
          <p class="formnote">Approved moves draw an arrow automatically. Arrows fade after the next crisis update. Secret moves show as dashed arrows to that side only.</p></div>
        <div class="spanel"><h2>Access codes</h2>
          <p class="formnote">Print these and hand one to each delegate. The staff and projector codes are set in the Vercel project settings.</p>
          <div class="codes-wrap"><table class="codes"><thead><tr><th>Delegate</th><th>Country</th><th>Code</th></tr></thead><tbody>${(p.codes || []).map((c) => `<tr><td>${esc(c.name)}</td><td>${esc(POWERS[c.country].label)}</td><td class="code">${esc(c.code)}</td></tr>`).join('')}</tbody></table></div></div>
        <div class="spanel"><h2>Game</h2>
          <p class="storage">Storage: ${p.storage === 'supabase' ? 'Supabase database. The game survives restarts.' : '<b>Server memory only.</b> Fine for testing, but the game resets whenever the server restarts. Connect Supabase before the conference.'}</p>
          <div class="row"><button type="button" class="dbtn" id="load-demo">Load demo requests</button></div>
          <div class="row"><input type="text" id="reset-confirm" placeholder="Type RESET" aria-label="Type RESET to confirm"><button type="button" class="dbtn red" id="reset-game">Reset the whole game</button></div></div>
      </div>
    </div>
  </section>`;
  return top + body + `<div class="toast glass" id="toast" role="status" hidden></div>
  <div class="breaking" id="breaking" hidden role="dialog" aria-modal="true" aria-labelledby="bn-head"><article class="paper">
    <div class="mast"><span id="bn-date"></span><b>The SLOMUN Dispatch</b><span>Special Edition</span></div>
    <span class="extra">Breaking News</span><h2 class="headline" id="bn-head"></h2><p class="deck" id="bn-deck"></p>
    <div class="dismiss">Click anywhere or press Esc to close</div></article></div>`;
}

/* ---------- Server ---------- */
async function fetchState() {
  const q = new URLSearchParams(); if (VER) q.set('v', VER);
  if (AS) q.set('as', AS); else if (VIEW === 'map' && ROLE === 'staff') q.set('as', '@projector');
  const r = await fetch('/api/crisis/state?' + q, { cache: 'no-store' });
  if (r.status === 401) { location.href = '/crisis'; return; }
  const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Server error');
  SKEW = j.now - Date.now(); if (!j.unchanged) applyState(j);
}
async function act(payload) {
  if (AS) { toast('This is a read-only preview. Delegates act from their own laptops.'); return false; }
  try {
    const r = await fetch('/api/crisis/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (r.status === 401) { location.href = '/crisis'; return false; }
    const j = await r.json();
    if (!r.ok) { toast(j.error || 'That did not work. Try again.'); return false; }
    if (j.view) { SKEW = j.view.now - Date.now(); applyState(VIEW === 'map' ? null : j.view); }
    if (j.message) toast(j.message);
    return true;
  } catch { toast('Could not reach the server. Check the Wi-Fi and try again.'); return false; }
}

function applyState(v) {
  if (!v) return;
  const first = !STATE; const prev = STATE ? Object.fromEntries(UNITS.map((u) => [u.id, u])) : null;
  STATE = v; VER = v.version; UNITS = v.units || [];
  const arrowSig = JSON.stringify(v.arrows || []); const arrowsChanged = arrowSig !== JSON.stringify(LIVE_ARROWS); LIVE_ARROWS = v.arrows || [];
  ORDER.forEach((c) => { if (v.treasury?.[c] != null) POWERS[c].treasury = v.treasury[c]; });
  if (VIEW === 'delegate' && v.me) { MEE = v.me; ME = v.me.country; ALLIES = v.allies; AGENTS = v.agents || []; }
  renderCommon(first);
  if (VIEW === 'map') { renderSel(); $('pend-count').textContent = v.pending ?? 0; renderFloor(); mapGlobe?.sync(prev); if (arrowsChanged && mapGlobe && !first) { paintTexture(patchCanvas, imgs, selected.type === 'country' ? selected.id : null); mapGlobe.refreshTexture(); } }
  if (VIEW === 'delegate') renderDelegate(first, prev);
  if (VIEW === 'staff') renderStaff();
}

/* ---------- Shared pieces ---------- */
let wireSig = '';
function renderCommon(first) {
  const s = STATE;
  $('treasuries').innerHTML = ORDER.map((n) => { const p = POWERS[n]; return `<button type="button" class="chip num" data-c="${n}">${flag(n)}<b>$${p.treasury}M</b><small>${p.short}</small></button>`; }).join('');
  if (VIEW === 'map') document.querySelectorAll('#treasuries .chip').forEach((b) => b.addEventListener('click', () => select('country', b.dataset.c)));
  document.querySelectorAll('.date-line').forEach((e) => (e.textContent = s.update?.date || ''));
  const sig = (s.wire || []).join('|');
  if ($('track') && sig !== wireSig) { wireSig = sig; const items = s.wire.map((w) => `<span>${esc(w)}</span>`).join(''); $('track').innerHTML = items + items; }
  if ($('update-card')) $('update-card').innerHTML = `<span class="card-title">Crisis Update ${s.update.no}</span><b style="display:block;color:var(--text);margin-bottom:2px">${esc(s.update.title)}</b>${esc(s.update.text)}`;
  if (VIEW === 'map' && s.flash && s.flash.id !== lastFlashId) { if (!first) showFlash(s.flash); lastFlashId = s.flash.id; }
  if (first && s.flash) lastFlashId = s.flash.id;
}
function tickCountdown() {
  if (!STATE) return; const left = Math.max(0, Math.round((STATE.countdownEnd - (Date.now() + SKEW)) / 1000));
  const txt = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`; document.querySelectorAll('.countdown b').forEach((e) => (e.textContent = txt));
}
function showFlash(f) {
  $('bn-date').textContent = STATE?.update?.date || ''; $('bn-head').textContent = f.head; $('bn-deck').textContent = f.deck;
  const el = $('breaking'); el.hidden = true; void el.offsetWidth; el.hidden = false;
}

/* ---------- Projector ---------- */
function renderSel() {
  const box = $('selpanel'); if (!box) return;
  if (selected.type === 'unit') {
    const u = UNITS.find((x) => x.id === selected.id); if (!u) { selected = { type: 'country', id: 'Poland' }; return renderSel(); }
    const p = POWERS[u.owner]; const K = { fleet: ['NAV', 'Naval force', 'squadrons'], army: ['INF', 'Infantry', 'divisions'], armor: ['ARM', 'Armor', 'divisions'], air: ['AIR', 'Air force', 'air groups'] }[u.kind];
    box.innerHTML = `<div class="badge flagbadge">${flag(u.owner)}<em>${K[0]}</em></div><div><div class="sel-title">${esc(u.name)}</div><div class="sel-sub">${p.label} · ${K[1]}</div><div class="stats"><div><span>Strength</span> <b class="num">${u.str} ${K[2]}</b></div><div><span>Orders</span> ${esc(u.note)}</div></div></div>`;
    return;
  }
  const name = selected.id; const owner = ownerOf(name); const p = POWERS[owner];
  const title = name === 'Czechoslovakia' ? 'Bohemia, Moravia and Slovakia' : (p && name === owner ? p.label : LABEL_TEXT[name] || name);
  if (!p) { box.innerHTML = `<div class="badge" style="background:${colorOf(name)}">${initials(title)}</div><div><div class="sel-title">${esc(title)}</div><div class="sel-sub"><span class="pill neutral">Neutral</span></div><div class="stats"><div><span>Controlled by</span> Crisis staff</div></div></div>`; return; }
  const sub = name !== owner ? `Controlled by ${p.label}` : '';
  box.innerHTML = `<div class="badge flagbadge">${flag(name)}</div><div><div class="sel-title">${esc(title)}</div><div class="sel-sub"><span class="pill ${p.side}">${p.side === 'war' ? 'At war' : 'Neutral'}</span>${sub ? ' · ' + sub : ''}</div><div class="stats"><div><span>Treasury</span> <b class="num">$${p.treasury}M</b></div><div><span>Forces</span> <b class="num">${UNITS.filter((u) => u.owner === owner).length}</b></div><div><span>Commanders</span> ${p.delegates.map(esc).join(', ') || 'Crisis staff'}</div></div></div>`;
}
function select(type, id) {
  selected = { type, id };
  if (mapGlobe) { mapGlobe.selectedUnit = type === 'unit' ? id : null; mapGlobe.markSelected(mapGlobe.selectedUnit); paintTexture(patchCanvas, imgs, type === 'country' ? id : null); mapGlobe.refreshTexture(); }
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
const ACTIONS = [
  { id: 'fleet', label: 'Move forces' }, { id: 'spy', label: 'Send spy' }, { id: 'money', label: 'Send money' },
  { id: 'build', label: 'Build forces' }, { id: 'op', label: 'Fund operation' }, { id: 'propaganda', label: 'Propaganda' },
  { id: 'secret', label: 'Secret directive' }, { id: 'press', label: 'Press release' }, { id: 'treaty', label: 'Propose treaty' },
];
let action = 'fleet', visibility = 'private', pickedForce = null, drafting = false, fogSig = '';
const myUnits = () => UNITS.filter((x) => x.owner === ME && MEE.commands.includes(x.kind));
const TO = () => ORDER.filter((n) => n !== ME).map((n) => POWERS[n].label).concat(['Romania', 'Turkey', 'Belgium', 'Netherlands']);

function renderDelegate(first, prev) {
  const r = MEE; if (!r) return;
  if (first) {
    $('who-flag').innerHTML = flag(ME) + `<em>${initials(r.name)}</em>`; $('who-name').textContent = r.name;
    $('who-role').textContent = `${r.role} · ${POWERS[ME].label} · commands ${r.commands.map((k) => KIND_NAME[k].toLowerCase()).join(', ')}`;
    renderTiles(); renderForm(); renderPortfolio();
  }
  $('my-money').textContent = `$${POWERS[ME].treasury}M`; $('my-forces').textContent = myUnits().length; $('my-update').textContent = STATE.update.no;
  if (pickedForce && !myUnits().some((u) => u.id === pickedForce)) { pickedForce = null; renderForm(); }
  renderIntel(); renderReqs(); if (!drafting) renderDirectives(); else updateDirCount();
  if (!first) renderPortfolio();
  if (delGlobe) {
    delGlobe.sync(prev);
    const sig = JSON.stringify([UNITS.map((u) => [u.id, u.at]), AGENTS, LIVE_ARROWS]);
    if (sig !== fogSig) { fogSig = sig; repaintFog(); }
  }
}
function repaintFog() {
  if (!delGlobe || !fogCanvas) return;
  paintFog(fogCanvas); paintWorld(delGlobe.worldCanvas, true); delGlobe.worldTex.needsUpdate = true; delGlobe.refreshTexture(); delGlobe.addLights(); delGlobe.addPins();
}
function pickForce(id) {
  const u = UNITS.find((x) => x.id === id); if (!u) return;
  if (u.owner === ME && !MEE.commands.includes(u.kind)) { const boss = ROSTER.find((x) => x.country === ME && x.commands.includes(u.kind)); toast(`${u.name} is under ${boss ? boss.name + "'s" : "another commander's"} command. You control ${MEE.commands.map((k) => KIND_NAME[k].toLowerCase()).join(' and ')}.`); return; }
  if (u.owner !== ME) { toast(`${u.name} belongs to ${POWERS[u.owner].label}. You can only command ${POWERS[ME].label} forces.`); return; }
  pickedForce = id; action = 'fleet'; delGlobe.selectedUnit = id; delGlobe.markSelected(id);
  showTab('act'); renderTiles(); renderForm();
}
function renderTiles() {
  $('tiles').innerHTML = ACTIONS.map((a) => `<button type="button" class="tile" data-a="${a.id}" aria-pressed="${a.id === action}">${ICON[a.id]}<span>${a.label}</span></button>`).join('');
  document.querySelectorAll('.tile').forEach((b) => b.addEventListener('click', () => { action = b.dataset.a; renderTiles(); renderForm(); }));
}
function renderForm() {
  const f = $('form'); let body = '';
  if (action === 'fleet') {
    const u = UNITS.find((x) => x.id === pickedForce);
    body = u ? `<div class="picked">${flag(u.owner)}<div><b>${esc(u.name)}</b><span>${KIND_NAME[u.kind]} · strength ${u.str}</span></div><button type="button" class="unpick" aria-label="Clear selected force">✕</button></div>
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
  if (action === 'build') body = `<label for="f-btype">What to build<select id="f-btype">${opt(Object.keys(BUILD))}</select></label><label for="f-bqty">How many<input id="f-bqty" type="number" min="1" max="10" value="1"></label><p class="formnote" id="f-bcost"></p>`;
  if (action === 'op') body = `<label for="f-op">Operation<select id="f-op">${opt(['Naval blockade', 'Escort convoys', 'Air reconnaissance', 'Evacuate civilians', 'Other (describe below)'])}</select></label><label for="f-cost">Budget ($ millions)<input id="f-cost" type="number" min="1" max="9999" value="20"></label><label for="f-text">Details<textarea id="f-text" maxlength="1200" placeholder="Where, when and how."></textarea></label>`;
  if (action === 'propaganda') body = `<label for="f-aud">Audience<select id="f-aud">${opt(['People at home', 'Neutral countries', 'People in Germany', 'People in Britain', 'People in France', 'People in Italy', 'People in the Soviet Union', 'The United States', 'Japan'])}</select></label><label for="f-text">Message<textarea id="f-text" maxlength="1200" placeholder="What do you want them to believe?"></textarea></label>`;
  if (['secret', 'press', 'treaty'].includes(action)) body = `<label for="f-text">${{ secret: 'Directive', press: 'Statement', treaty: 'Terms' }[action]}<textarea id="f-text" maxlength="1200" placeholder="${{ secret: 'Describe what you want to happen and how.', press: 'What do you want to announce?', treaty: 'Who is the treaty with, and what does each side agree to?' }[action]}"></textarea></label>`;
  const forced = action === 'spy' ? 'private' : action === 'press' ? 'public' : null; const vis = forced || visibility;
  f.innerHTML = body + (forced ? '' : `<div class="vis" role="group" aria-label="Who can see this"><button type="button" data-v="private" aria-pressed="${vis === 'private'}">Private</button><button type="button" data-v="public" aria-pressed="${vis === 'public'}">Public</button></div>`) + `<button class="send" type="submit">${action === 'spy' ? 'Send agent' : 'Send to crisis staff'}</button>`;
  f.querySelectorAll('.vis button').forEach((b) => b.addEventListener('click', () => { visibility = b.dataset.v; f.querySelectorAll('.vis button').forEach((x) => x.setAttribute('aria-pressed', x === b)); }));
  f.querySelector('.unpick')?.addEventListener('click', () => { pickedForce = null; if (delGlobe) { delGlobe.selectedUnit = null; delGlobe.markSelected(null); } renderForm(); });
  if (action === 'build') { const upd = () => { const c = BUILD[f.querySelector('#f-btype').value] * (+f.querySelector('#f-bqty').value || 0); f.querySelector('#f-bcost').textContent = `Estimated cost: $${c}M of your $${POWERS[ME].treasury}M treasury.`; }; f.querySelector('#f-btype').addEventListener('change', upd); f.querySelector('#f-bqty').addEventListener('input', upd); upd(); }
}
function summary() {
  const v = (id) => $(id)?.value;
  if (action === 'fleet') { const u = UNITS.find((x) => x.id === pickedForce); return u ? `Move ${u.name}: ${v('f-dest')}` : ''; }
  if (action === 'spy') return `Spy to ${CITY_OF[v('f-target')] || v('f-target')}: ${v('f-mission').toLowerCase()}`;
  if (action === 'money') return `Send $${v('f-amt')}M to ${v('f-to')}`;
  if (action === 'build') return `Build ${v('f-bqty')} × ${v('f-btype').toLowerCase()}`;
  if (action === 'op') return `Fund ${v('f-op').toLowerCase()} with $${v('f-cost')}M`;
  const t = (v('f-text') || '').trim(); const kind = { secret: 'Secret directive', press: 'Press release', treaty: 'Treaty proposal', propaganda: `Propaganda to ${(v('f-aud') || '').replace(/^People/, 'people')}` }[action];
  return t ? `${kind}: ${t.length > 60 ? t.slice(0, 57) + '...' : t}` : '';
}
async function submitAction(e) {
  e.preventDefault(); const s = summary();
  if (!s) { toast(action === 'fleet' ? 'Click one of your forces on the map first.' : 'Write your request before sending it.'); return; }
  const v = (id) => $(id)?.value; const detail = {};
  if (action === 'fleet') Object.assign(detail, { unit: pickedForce, dest: v('f-dest') });
  if (action === 'spy') Object.assign(detail, { target: v('f-target'), mission: v('f-mission'), cover: v('f-cover'), cost: +v('f-spycost') });
  if (action === 'money') Object.assign(detail, { to: v('f-to'), amount: +v('f-amt') });
  if (action === 'build') Object.assign(detail, { btype: v('f-btype'), qty: +v('f-bqty') });
  if (action === 'op') Object.assign(detail, { op: v('f-op'), cost: +v('f-cost') });
  const btn = e.target.querySelector('.send'); btn.disabled = true;
  const ok = await act({ type: 'request', kind: action, title: s, vis: visibility, detail, text: v('f-text') });
  btn.disabled = false;
  if (ok) { if (action === 'fleet') { pickedForce = null; delGlobe?.markSelected(null); } renderForm(); }
}
function renderIntel() {
  const I = STATE.intel || []; $('c-intel').textContent = I.length || '';
  $('intel').innerHTML = I.map((r) => `<div class="req"><b>${esc(r.from)}</b><span class="pill rel-${esc(r.rel).toLowerCase()}">${esc(r.rel)}</span><small>${esc(r.text)}</small></div>`).join('') || '<p class="formnote">No intelligence yet. Send spies to learn more.</p>';
}
function renderReqs() {
  const R = STATE.queue || []; $('c-req').textContent = R.length || '';
  $('reqs').innerHTML = R.map((r) => `<div class="req"><b>${esc(r.title)}</b><span class="pill ${r.status}">${esc(r.outcome || r.status)}</span><small>${r.vis === 'public' ? 'Public' : 'Private'} · Sent ${esc(r.time)}${r.reply ? ' · Crisis staff: ' + esc(r.reply) : ''}</small></div>`).join('') || '<p class="formnote">No requests yet. Pick an action to send your first one.</p>';
}
function renderPortfolio() {
  const r = MEE; const units = myUnits(); const missing = KINDS.filter((k) => !r.commands.includes(k));
  const boss = (k) => ROSTER.find((x) => x.country === ME && x.commands.includes(k));
  $('p-port').innerHTML = `
    <div class="sec"><h3>Your powers</h3><ul class="plist">${r.commands.map((k) => `<li>${POWER_TEXT[k]}</li>`).join('')}${ALWAYS.map((a) => `<li>${a}</li>`).join('')}</ul></div>
    <div class="sec"><h3>Your assets</h3><ul class="plist">
      ${units.length ? units.map((u) => `<li>${esc(u.name)}<small>${KIND_NAME[u.kind]} · strength ${u.str} · ${esc(u.note)}</small></li>`).join('') : '<li>No forces on the map</li>'}
      <li>$${POWERS[ME].treasury}M national treasury<small>Shared with the other ${POWERS[ME].label} commanders</small></li>
      <li>${SPECIAL[ME] || "Your government's contacts"}</li></ul></div>
    <div class="sec"><h3>Not in your portfolio</h3><ul class="plist no">
      ${missing.map((k) => `<li>${KIND_NAME[k]}${boss(k) ? ` (ask ${esc(boss(k).name)})` : ''}</li>`).join('')}${LIMITS_ALWAYS.map((l) => `<li>${l}</li>`).join('')}</ul></div>
    <div class="secret"><b>Secret objective</b>${esc(SECRET[r.name] || 'Crisis staff will give you a secret objective.')}<small class="formnote" style="display:block;margin-top:6px">Only you and crisis staff can see this.</small></div>`;
}
function updateDirCount() {
  const me = MEE.name; const n = (STATE.directives || []).filter((d) => d.status === 'signing' && d.requested.includes(me) && !d.signed.includes(me)).length;
  const cd = $('c-dir'); cd.textContent = n; cd.hidden = !n;
}
function renderDirectives() {
  const me = MEE.name; const box = $('p-dir'); const D = STATE.directives || [];
  const toSign = D.filter((d) => d.status === 'signing' && d.requested.includes(me) && !d.signed.includes(me));
  const mine = D.filter((d) => d.sponsors.includes(me) || d.signed.includes(me));
  const floor = D.filter((d) => ['floor', 'chair', 'passed', 'failed'].includes(d.status) && !mine.includes(d));
  updateDirCount();
  const card = (d, extra = '') => `<div class="dir"><div class="dir-top"><b>${d.no ? 'Directive ' + esc(d.no) + ': ' : ''}${esc(d.title)}</b><span class="pill ${d.status}">${DSTATUS[d.status]}</span></div>
    <ol>${d.clauses.map((c) => `<li>${esc(c)}</li>`).join('')}</ol>
    <small>Sponsors: ${d.sponsors.map(esc).join(', ')}${d.status === 'signing' ? ` · Signatures ${d.signed.length} of ${SIGS_NEEDED}` : ` · Signed by ${d.signed.length}`}${d.vote ? ' · ' + esc(d.vote) : ''}</small>
    ${d.status === 'signing' ? `<div class="sigbar"><i style="width:${Math.min(100, (d.signed.length / SIGS_NEEDED) * 100)}%"></i></div>` : ''}${extra}</div>`;
  box.innerHTML = `
    ${toSign.length ? `<div class="sec"><h3>Asked to sign</h3>${toSign.map((d) => card(d, `<div class="row"><button type="button" class="dbtn gold" data-sign="${d.id}">Sign</button><button type="button" class="dbtn" data-decline="${d.id}">Decline</button></div>`)).join('')}</div>` : ''}
    <div class="sec"><h3>Your directives</h3>
      ${drafting ? draftForm() : `<button type="button" class="send" id="new-dir">Write a new directive</button>`}
      ${mine.map((d) => card(d, d.status === 'signing' && d.sponsors.includes(me) && d.signed.length >= SIGS_NEEDED ? `<button type="button" class="dbtn gold" data-submit="${d.id}">Submit to the chair</button>` : '')).join('') || '<p class="formnote">You have not sponsored or signed any directives yet.</p>'}
    </div>
    <div class="sec"><h3>Committee floor</h3>${floor.map((d) => card(d)).join('') || '<p class="formnote">Nothing on the floor right now.</p>'}</div>
    <p class="formnote">Directives need ${SIGS_NEEDED} signatures, including sponsors. The chair approves the format, then the committee votes out loud by placard.</p>`;
  box.querySelector('#new-dir')?.addEventListener('click', () => { drafting = true; renderDirectives(); });
  box.querySelectorAll('[data-sign]').forEach((b) => b.addEventListener('click', () => act({ type: 'dir.sign', id: b.dataset.sign })));
  box.querySelectorAll('[data-decline]').forEach((b) => b.addEventListener('click', () => act({ type: 'dir.decline', id: b.dataset.decline })));
  box.querySelectorAll('[data-submit]').forEach((b) => b.addEventListener('click', () => act({ type: 'dir.submit', id: b.dataset.submit })));
  if (drafting) bindDraft();
}
function draftForm() {
  const me = MEE.name;
  return `<form class="dform" id="dform" novalidate>
    <label for="d-title">Title<input type="text" id="d-title" maxlength="120" placeholder="For example: Defense of the Polish Corridor"></label>
    <div id="d-clauses"><label for="d-c0">Clause 1<textarea id="d-c0" maxlength="500" placeholder="Who does what, where, and with what forces or money."></textarea></label></div>
    <button type="button" class="dbtn" id="d-add">Add a clause</button>
    <label>Ask for signatures (you need ${SIGS_NEEDED - 1} more)<div class="signers">${ROSTER.filter((r) => r.name !== me).map((r) => `<label><input type="checkbox" value="${esc(r.name)}">${esc(r.name)}</label>`).join('')}</div></label>
    <div class="row"><button type="submit" class="dbtn gold">Send for signatures</button><button type="button" class="dbtn" id="d-cancel">Cancel</button></div>
  </form>`;
}
function bindDraft() {
  const f = $('dform'); let n = 1;
  f.querySelector('#d-add').addEventListener('click', () => { if (n >= 8) return; f.querySelector('#d-clauses').insertAdjacentHTML('beforeend', `<label for="d-c${n}">Clause ${n + 1}<textarea id="d-c${n}" maxlength="500"></textarea></label>`); n++; });
  f.querySelector('#d-cancel').addEventListener('click', () => { drafting = false; renderDirectives(); });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = f.querySelector('#d-title').value.trim(); const clauses = [...f.querySelectorAll('textarea')].map((t) => t.value.trim()).filter(Boolean);
    const asked = [...f.querySelectorAll('.signers input:checked')].map((i) => i.value);
    if (!title || !clauses.length) { toast('Add a title and at least one clause.'); return; }
    if (asked.length < SIGS_NEEDED - 1) { toast(`Ask at least ${SIGS_NEEDED - 1} people to sign.`); return; }
    drafting = false; const ok = await act({ type: 'dir.create', title, clauses, asked });
    if (!ok) { drafting = true; } renderDirectives();
  });
}
function showTab(t) { ['act', 'dir', 'port', 'intel', 'req'].forEach((o) => { $('t-' + o).setAttribute('aria-selected', o === t); $('p-' + o).hidden = o !== t; }); }

/* ---------- Crisis staff ---------- */
let qFilter = 'pending', qCountry = '';
function qDetail(q) {
  const d = q.detail || {}; let s = '';
  if (q.type === 'fleet') { const u = STATE.units.find((x) => x.id === d.unit); s = u ? `${esc(u.name)} (${KIND_NAME[u.kind].toLowerCase()}, strength ${u.str}) to <b>${esc(d.dest)}</b>` : ''; }
  if (q.type === 'spy') s = `Target ${esc(d.target)} · mission: ${esc(d.mission)} · cover: ${esc(d.cover)} · budget $${d.cost}M`;
  if (q.type === 'money') s = `$${d.amount}M from ${POWERS[q.country].label} to ${esc(d.to)} · treasury now $${STATE.treasury[q.country]}M`;
  if (q.type === 'build') s = `${d.qty} × ${esc(d.btype)} · cost $${(BUILD[d.btype] || 0) * d.qty}M`;
  if (q.type === 'op') s = `${esc(d.op || '')} · budget $${d.cost}M`;
  return [s, q.text ? `“${esc(q.text)}”` : ''].filter(Boolean).join('<br>');
}
function qButtons(q) {
  const b = (dec, label, cls = '') => `<button type="button" class="dbtn ${cls}" data-q="${q.id}" data-dec="${dec}">${label}</button>`;
  if (q.type === 'fleet') return b('move-public', 'Move on projector', 'gold') + b('move-secret', 'Move secretly', 'green') + b('reject', 'Reject', 'red');
  if (q.type === 'spy') return b('spy-ok', 'Succeeds', 'green') + b('spy-fail', 'Fails') + b('spy-caught', 'Caught', 'red');
  return b('approve', 'Approve', 'green') + b('reject', 'Reject', 'red');
}
function keepInputs(root, fn) {
  const vals = {}; root.querySelectorAll('textarea[id], input[id]').forEach((t) => (vals[t.id] = t.value));
  const act = document.activeElement; const focusId = root.contains(act) ? act.id : null; const sel = focusId && 'selectionStart' in act ? [act.selectionStart, act.selectionEnd] : null;
  fn();
  for (const [id, v] of Object.entries(vals)) { const t = document.getElementById(id); if (t && v) t.value = v; }
  if (focusId) { const t = document.getElementById(focusId); if (t) { t.focus(); if (sel) try { t.setSelectionRange(...sel); } catch {} } }
}
function renderStaff() {
  const Q = STATE.queue || []; const pending = Q.filter((q) => q.status === 'pending').length;
  $('q-count').textContent = `${pending} pending`;
  const list = Q.filter((q) => (qFilter === 'all' || q.status === 'pending') && (!qCountry || q.country === qCountry));
  keepInputs($('queue'), () => {
    $('queue').innerHTML = list.map((q) => `<div class="qcard${q.status !== 'pending' ? ' done' : ''}">
      <div class="qtop">${flag(q.country)}<b>${esc(q.from)}</b>${POWERS[q.country].label} · ${esc(q.time)}<span class="pill type">${q.type === 'fleet' ? 'move' : q.type}</span><span class="pill ${q.vis}">${q.vis}</span>${q.status !== 'pending' ? `<span class="pill ${q.status}">${esc(q.outcome || q.status)}</span>` : ''}</div>
      <div class="qtitle">${esc(q.title)}</div>${qDetail(q) ? `<div class="qdetail">${qDetail(q)}</div>` : ''}
      ${q.status === 'pending' ? `<textarea id="r-${q.id}" maxlength="500" aria-label="Reply to ${esc(q.from)}" placeholder="Reply to the delegate (optional). A default reply is used if empty."></textarea><div class="qbtns">${qButtons(q)}</div>` : `<div class="qresult">Reply: <b>${esc(q.reply || '')}</b></div>`}
    </div>`).join('') || '<p class="formnote">Nothing waiting. New requests appear here a second or two after delegates send them.</p>';
  });
  keepInputs($('chair'), renderChair); renderProj();
  const cd = $('cu-date'); if (cd && !cd.value && document.activeElement !== cd) cd.value = STATE.update?.date || '';
}
function renderChair() {
  const rows = (STATE.directives || []).filter((d) => d.status !== 'drafting');
  $('chair').innerHTML = rows.map((d) => `<div class="chair-row"><div class="dir-top"><b>${d.no ? esc(d.no) + ': ' : ''}${esc(d.title)}</b><span class="pill ${d.status}">${DSTATUS[d.status]}</span></div>
    <ol class="formnote" style="margin:0;padding-left:18px">${d.clauses.map((c) => `<li>${esc(c)}</li>`).join('')}</ol>
    <small class="formnote">Sponsors ${d.sponsors.map(esc).join(', ')} · ${d.signed.length} signatures${d.vote ? ' · ' + esc(d.vote) : ''}</small>
    ${d.status === 'chair' ? `<div class="qbtns"><button type="button" class="dbtn gold" data-ch="floor" data-d="${d.id}">Approve and put on the floor</button><button type="button" class="dbtn" data-ch="back" data-d="${d.id}">Send back</button></div>` : ''}
    ${d.status === 'floor' ? `<div class="votes"><label>For <input type="number" min="0" id="vf-${d.id}" value="0"></label><label>Against <input type="number" min="0" id="va-${d.id}" value="0"></label><button type="button" class="dbtn gold" data-ch="vote" data-d="${d.id}">Record placard vote</button></div>` : ''}
  </div>`).join('') || '<p class="formnote">No directives yet. They appear here once delegates send them for signatures.</p>';
}
function renderProj() {
  const hidden = (STATE.hiddenMoves || []).map((id) => STATE.units.find((u) => u.id === id)).filter(Boolean);
  $('proj').innerHTML = `<p class="formnote">The projector shows what the whole room knows. Secret moves stay at their old position on the big screen until you reveal them.</p>
    ${hidden.map((u) => `<div class="projrow"><div><b>${esc(u.name)}</b>${POWERS[u.owner].label} · moved secretly</div><button type="button" class="dbtn gold" data-reveal="${u.id}">Reveal on projector</button></div>`).join('') || '<p class="formnote">No hidden moves right now.</p>'}`;
}
function bindStaff() {
  $('queue').addEventListener('click', (e) => { const b = e.target.closest('[data-dec]'); if (!b) return; b.disabled = true; act({ type: 'decide', id: b.dataset.q, dec: b.dataset.dec, reply: $('r-' + b.dataset.q)?.value || '' }); });
  $('chair').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ch]'); if (!b) return; const id = b.dataset.d;
    if (b.dataset.ch === 'floor') act({ type: 'chair.floor', id });
    if (b.dataset.ch === 'back') act({ type: 'chair.back', id });
    if (b.dataset.ch === 'vote') act({ type: 'chair.vote', id, for: $('vf-' + id).value, against: $('va-' + id).value });
  });
  $('proj').addEventListener('click', (e) => { const b = e.target.closest('[data-reveal]'); if (b) act({ type: 'reveal', unitId: b.dataset.reveal }); });
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
  $('load-demo').addEventListener('click', () => act({ type: 'game.demo' }));
  $('reset-game').addEventListener('click', () => act({ type: 'game.reset', confirm: $('reset-confirm').value.trim().toUpperCase() }));
}

/* ---------- Boot ---------- */
export function start(root, props) {
  VIEW = props.view; ROLE = props.session.role; AS = props.as || null;
  root.innerHTML = skeleton(props);
  let stopped = false, timer, failures = 0;
  $('logout').addEventListener('click', async () => { await fetch('/api/crisis/logout', { method: 'POST' }); location.href = '/crisis'; });
  $('view-as')?.addEventListener('change', (e) => { if (e.target.value) location.href = '/crisis/delegate?as=' + encodeURIComponent(e.target.value); });
  $('fs-btn')?.addEventListener('click', () => { document.documentElement.requestFullscreen?.().catch(() => toast('Full screen is not available here. Use the browser menu instead.')); });
  $('breaking').addEventListener('click', () => ($('breaking').hidden = true));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('breaking').hidden = true; });
  document.querySelectorAll('.zoom').forEach((z) => z.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return; const g = z.dataset.g === 'map' ? mapGlobe : delGlobe; if (!g) return;
    if (b.dataset.z === 'in') g.view.dist = Math.max(1.05, 1 + (g.view.dist - 1) * 0.72);
    if (b.dataset.z === 'out') g.view.dist = Math.min(3.6, 1 + (g.view.dist - 1) * 1.38);
    if (b.dataset.z === 'reset') Object.assign(g.view, g.home);
    g.dirty = true;
  }));
  if (VIEW === 'delegate') {
    ['act', 'dir', 'port', 'intel', 'req'].forEach((t) => $('t-' + t).addEventListener('click', () => showTab(t)));
    $('form').addEventListener('submit', submitAction);
  }
  if (VIEW === 'staff') bindStaff();
  const cd = setInterval(tickCountdown, 1000);

  const poll = async () => {
    if (stopped) return;
    try { await fetchState(); failures = 0; $('conn').className = 'conn'; $('conn').lastChild.textContent = 'Live'; }
    catch { failures++; if (failures > 1) { $('conn').className = 'conn bad'; $('conn').lastChild.textContent = 'Reconnecting'; } }
    timer = setTimeout(poll, document.hidden ? 4000 : 1500);
  };
  const first = poll();

  if (VIEW !== 'staff') (async () => {
    try {
      const [geo, marble, water, topo, world, wwater, clouds] = await Promise.all([
        fetch('/crisis/geo.json').then((r) => r.json()),
        ...['marble.jpg', 'water.png', 'topo.jpg', 'world.jpg', 'wwater.png', 'clouds.jpg'].map((f) => loadImg('/crisis/' + f)),
      ]);
      A = geo; imgs = { marble, water, topo, world, wwater, clouds }; await first;
      if (stopped) return;
      if (VIEW === 'map') {
        BASE_CACHE = document.createElement('canvas'); BASE_CACHE.ready = false;
        patchCanvas = document.createElement('canvas'); patchCanvas.width = TW * TEXK; patchCanvas.height = TH * TEXK; paintTexture(patchCanvas, imgs, selected.id);
        mapGlobe = new Globe($('stage-map'), $('ov-map'), { onCountry: (n) => select('country', n), onUnit: (id) => select('unit', id) });
        mapGlobe.setTextures(world, patchCanvas, topo);
      } else {
        fogCanvas = document.createElement('canvas'); fogCanvas.width = TW * TEXK; fogCanvas.height = TH * TEXK; paintFog(fogCanvas);
        const cap = { 'United Kingdom': [-0.13, 51.5], France: [2.35, 48.86], Poland: [21, 52.2], Germany: [13.4, 52.5], USSR: [37.6, 55.75], Italy: [12.5, 41.9], Finland: [24.9, 60.2] }[ME] || [15, 50];
        const home = ME === 'United States' ? { lon: -70, lat: 34.5, dist: 2.9 } : ME === 'Japan' ? { lon: 128, lat: 38.5, dist: 2.1 } : { lon: cap[0], lat: cap[1] + 1.5, dist: 1.75 };
        delGlobe = new Globe($('stage-del'), $('ov-del'), { fog: true, pins: true, lon: home.lon, lat: home.lat - 2.5, dist: home.dist, onUnit: (id) => pickForce(id) });
        delGlobe.setTextures(world, fogCanvas, topo); fogSig = JSON.stringify([UNITS.map((u) => [u.id, u.at]), AGENTS, LIVE_ARROWS]);
      }
    } catch (e) {
      document.querySelectorAll('.loading').forEach((l) => (l.textContent = 'The 3D map could not load. Reload the page, or try another browser.'));
      console.error(e);
    }
  })();
  return () => { stopped = true; clearTimeout(timer); clearInterval(cd); [mapGlobe, delGlobe].forEach((g) => g && cancelAnimationFrame(g.raf)); };
}
