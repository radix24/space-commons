// Procedural spacecraft for missions without a public NASA model.
// Each builder works in metres with +Z pointing at Earth (high-gain antenna side); app.js rescales to true size.
// Dimensions follow published mission figures (array spans, bus sizes, boom lengths) to within a few tens of percent.
import * as THREE from 'three';

const std = (color, metalness = 0.5, roughness = 0.45, extra = {}) => new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });
let crinkle = null;
function crinkleTex() { // crumpled-foil bump map: many short random creases
  if (crinkle) return crinkle;
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const c = cv.getContext('2d');
  c.fillStyle = '#808080'; c.fillRect(0, 0, 256, 256);
  let seed = 7; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 900; i++) {
    const x = r() * 256, y = r() * 256, a = r() * Math.PI, l = 6 + r() * 26, v = 90 + r() * 90;
    c.strokeStyle = `rgba(${v},${v},${v},0.55)`; c.lineWidth = 0.6 + r() * 1.6;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
  }
  crinkle = new THREE.CanvasTexture(cv); crinkle.wrapS = crinkle.wrapT = THREE.RepeatWrapping; crinkle.repeat.set(3, 3);
  return crinkle;
}
const foil = (color, rough) => std(color, 0.85, rough * 0.8, { bumpMap: crinkleTex(), bumpScale: 0.6, roughnessMap: crinkleTex(), envMapIntensity: 2.2 }); // bright, crinkled MLI: it mostly shows what it reflects
const M = {
  gold: () => foil(0xd6a843, 0.38),               // multi-layer insulation, gold foil (crinkled)
  silver: () => foil(0xc7cbd3, 0.32),             // silver MLI
  white: () => std(0xeeeeea, 0.05, 0.6),          // radiators / thermal paint
  dark: () => std(0x22252b, 0.3, 0.6),
  frame: () => std(0x9aa0a8, 0.8, 0.4),
};
let cellTex = null;
function solarMat() { // dark blue cells with a silver grid
  if (!cellTex) {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256; const c = cv.getContext('2d');
    c.fillStyle = '#26324f'; c.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const g = c.createLinearGradient(x * 32, y * 32, x * 32 + 32, y * 32 + 32);
      g.addColorStop(0, '#3554a8'); g.addColorStop(1, '#1b2a5e'); c.fillStyle = g; c.fillRect(x * 32 + 1.5, y * 32 + 1.5, 29, 29);
    }
    c.strokeStyle = 'rgba(200,210,230,.55)'; c.lineWidth = 1;
    for (let i = 0; i <= 256; i += 32) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, 256); c.stroke(); c.beginPath(); c.moveTo(0, i); c.lineTo(256, i); c.stroke(); }
    cellTex = new THREE.CanvasTexture(cv); cellTex.colorSpace = THREE.SRGBColorSpace; cellTex.wrapS = cellTex.wrapT = THREE.RepeatWrapping; cellTex.anisotropy = 4;
  }
  return std(0xffffff, 0.5, 0.25, { map: cellTex });
}

function box(g, w, h, d, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); g.add(m); return m; }
function cyl(g, r, len, mat, axis = 'y', x = 0, y = 0, z = 0, seg = 16) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat); m.position.set(x, y, z);
  if (axis === 'x') m.rotation.z = Math.PI / 2; if (axis === 'z') m.rotation.x = Math.PI / 2; g.add(m); return m;
}
function dish(g, diameter, depth, mat, x = 0, y = 0, z = 0, dir = new THREE.Vector3(0, 0, 1)) {
  // parabolic reflector from a lathe profile, opening along `dir`, plus a feed on struts
  const r = diameter / 2, pts = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector2(r * t, depth * t * t)); }
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 40), mat); m.material.side = THREE.DoubleSide;
  const holder = new THREE.Group(); holder.add(m);
  const feed = new THREE.Mesh(new THREE.ConeGeometry(r * 0.08, r * 0.3, 10), M.white()); feed.position.y = depth + r * 0.45; feed.rotation.x = Math.PI; holder.add(feed);
  for (let k = 0; k < 3; k++) { const a = k * 2.094; const s = new THREE.Mesh(new THREE.CylinderGeometry(0.012 * diameter, 0.012 * diameter, r * 0.75, 4), M.frame());
    s.position.set(Math.cos(a) * r * 0.45, depth + r * 0.15, Math.sin(a) * r * 0.45); s.lookAt(0, depth + r * 0.6, 0); s.rotateX(Math.PI / 2); holder.add(s); }
  holder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()); holder.position.set(x, y, z); g.add(holder); return holder;
}
function wing(g, panels, pw, ph, side, x0, y = 0, z = 0, gap = 0.08, axis = 'x') {
  // a row of solar panels hinged along one axis, with a yoke to the bus
  const mat = solarMat(), w = new THREE.Group();
  for (let i = 0; i < panels; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(pw, 0.035, ph), [M.frame(), M.frame(), mat, M.dark(), M.frame(), M.frame()]);
    p.material[2].map = cellTex.clone(); p.material[2].map.repeat.set(pw / 1.2, ph / 1.2); p.material[2].map.needsUpdate = true;
    p.position.x = side * (i * (pw + gap) + pw / 2); w.add(p);
  }
  const yoke = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, x0 + 0.3, 6), M.frame()); yoke.rotation.z = Math.PI / 2; yoke.position.x = -side * (x0 / 2 + 0.15); w.add(yoke);
  w.position.set(side * x0, y, z); if (axis === 'z') w.rotation.y = Math.PI / 2; g.add(w); return w;
}
function boom(g, len, dirVec, from = new THREE.Vector3(), r = 0.025) {
  const d = dirVec.clone().normalize(), m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), M.frame());
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d); m.position.copy(from).addScaledVector(d, len / 2); g.add(m);
  const tip = new THREE.Mesh(new THREE.BoxGeometry(r * 6, r * 6, r * 6), M.dark()); tip.position.copy(from).addScaledVector(d, len); g.add(tip);
  return m;
}
function thrusters(g, w, h, d) { for (const sx of [-1, 1]) for (const sy of [-1, 1]) { const n = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 8), M.dark()); n.position.set(sx * w / 2, sy * h / 2, -d / 2); n.rotation.x = -Math.PI / 2; g.add(n); } }


// ===================================================================================================
// Korean satellite kit. These are the app's signature models, so they are built in more detail:
// chamfered buses, MLI blankets with seams and tint variation, OSR radiator tiles, cell-level solar panels with hinges,
// yokes and drives, reflectors with ribs, feeds and struts, baffled star trackers, thruster clusters, adapter rings and
// black-lined instrument apertures. All textures are drawn on canvases here (no image files).
// Parts are modelled one by one and then merged per material by bake(), so a model of a few hundred parts costs
// only a couple of dozen draw calls. Axes for the Korean models: -Y is nadir (Earth / Moon), +X flight or south.
// ===================================================================================================
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const rnd = (seed) => { let s = (seed | 0) % 2147483647 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
const TX = {};
function ctex(key, size, draw) { // cached canvas texture, wrapping, sRGB
  if (TX[key]) return TX[key];
  const cv = document.createElement('canvas'); cv.width = cv.height = size; draw(cv.getContext('2d'), size);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return (TX[key] = t);
}
const line = (c, x0, y0, x1, y1) => { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); };
function mliTex(kind) { // MLI blankets: patches of slightly different tint, taped seams, tie-tack stitches, crease glints (1 tile = 1.5 m)
  const base = { gold: [226, 178, 80], amber: [196, 128, 50], silver: [206, 210, 218], black: [36, 36, 40] }[kind], dark = kind === 'black';
  return ctex('mli-' + kind, 512, (c, S) => {
    const r = rnd(kind.charCodeAt(0) * 131 + kind.length * 7);
    const col = (k, a = 1) => `rgba(${base.map((v) => Math.max(0, Math.min(255, Math.round(v * k + (dark ? (k - 1) * 70 : 0))))).join(',')},${a})`;
    const cuts = (lo, hi) => { const a = [0]; for (let p = lo + r() * (hi - lo); p < S - lo * 0.6; p += lo + r() * (hi - lo)) a.push(Math.round(p)); a.push(S); return a; };
    const xs = cuts(110, 240), ys = cuts(100, 230);
    for (let i = 0; i + 1 < xs.length; i++) for (let j = 0; j + 1 < ys.length; j++) {
      const k = 0.93 + r() * 0.14, x0 = xs[i], y0 = ys[j], w = xs[i + 1] - x0, h = ys[j + 1] - y0;
      const gr = c.createLinearGradient(x0, y0, x0 + w * (0.3 + r()), y0 + h);
      gr.addColorStop(0, col(k * 1.06)); gr.addColorStop(0.45 + r() * 0.2, col(k * 0.92)); gr.addColorStop(1, col(k * 1.03));
      c.fillStyle = gr; c.fillRect(x0, y0, w, h);
      c.fillStyle = col(0.45, 0.85);
      for (let sx = x0 + 28; sx < x0 + w - 14; sx += 56) for (let sy = y0 + 28; sy < y0 + h - 14; sy += 56) c.fillRect(sx - 1.5, sy - 1.5, 3, 3);
    }
    for (let i = 0; i < 1200; i++) {
      const x = r() * S, y = r() * S, a = r() * Math.PI, l = 4 + r() * 24;
      c.strokeStyle = col(r() < 0.5 ? 1.4 : 0.6, 0.1 + r() * 0.2); c.lineWidth = 0.5 + r() * 1.6; line(c, x, y, x + Math.cos(a) * l, y + Math.sin(a) * l);
    }
    c.lineWidth = 8; c.strokeStyle = col(1.16, 0.5); for (const x of xs) line(c, x, 0, x, S); for (const y of ys) line(c, 0, y, S, y);
    c.lineWidth = 1.4; c.strokeStyle = col(0.4, 0.9);
    for (const x of xs) { line(c, x - 4, 0, x - 4, S); line(c, x + 4, 0, x + 4, S); }
    for (const y of ys) { line(c, 0, y - 4, S, y - 4); line(c, 0, y + 4, S, y + 4); }
  });
}
function osrTex() { // optical solar reflector mirror tiles, 4 cm, each a slightly different grey (1 tile = 0.8 m)
  return ctex('osr', 512, (c, S) => {
    const r = rnd(91), n = 20, p = S / n; c.fillStyle = '#3c4148'; c.fillRect(0, 0, S, S);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const k = 196 + r() * 40 | 0; c.fillStyle = `rgb(${k - 8},${k},${k + 10})`; c.fillRect(i * p + 1.3, j * p + 1.3, p - 2.6, p - 2.6); }
  });
}
function cellTexK(kind) { // solar cells 4 x 7.5 cm with busbars and fingers; 'gaas' triple junction (violet-blue) or 'si' (blue) (1 tile = 0.6 m)
  return ctex('cell-' + kind, 512, (c, S) => {
    const r = rnd(kind === 'si' ? 5 : 3), nx = 15, ny = 8, cw = S / nx, ch = S / ny;
    const top = kind === 'si' ? [44, 74, 150] : [40, 44, 100], bot = kind === 'si' ? [20, 40, 96] : [16, 18, 48];
    c.fillStyle = '#0a0c12'; c.fillRect(0, 0, S, S);
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const k = 0.9 + r() * 0.2, x = i * cw, y = j * ch, gr = c.createLinearGradient(x, y, x + cw, y + ch);
      gr.addColorStop(0, `rgb(${top.map((v) => v * k | 0)})`); gr.addColorStop(1, `rgb(${bot.map((v) => v * k | 0)})`);
      c.fillStyle = gr; c.fillRect(x + 1.5, y + 1.5, cw - 3, ch - 3);
      c.fillStyle = 'rgba(200,204,214,.75)'; c.fillRect(x + 1.5, y + 1.5, cw - 3, 2.4);
      c.strokeStyle = 'rgba(170,180,205,.2)'; c.lineWidth = 0.6;
      for (let f = 1; f < 6; f++) { const fx = x + 1.5 + f * (cw - 3) / 6; line(c, fx, y + 4, fx, y + ch - 2); }
    }
  });
}
function sarTex() { // active phased-array face: tiles of radiating patches (1 tile = 0.6 m)
  return ctex('sar', 256, (c, S) => {
    c.fillStyle = '#c9ccd1'; c.fillRect(0, 0, S, S); const n = 16, p = S / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { c.fillStyle = (i + j) % 2 ? '#a7adb6' : '#aeb3bb'; c.fillRect(i * p + 3, j * p + 3, p - 6, p - 6); }
    c.strokeStyle = '#6c727c'; c.lineWidth = 2; c.strokeRect(1, 1, S - 2, S - 2); line(c, S / 2, 0, S / 2, S);
  });
}
let KM = null;
function kmat() {
  if (KM) return KM;
  const crk = crinkleTex(), T = (m, tile) => { m.userData.tile = tile; return m; };
  const mli = (kind, metal, rough, ei) => T(std(0xffffff, metal, rough, { map: mliTex(kind), bumpMap: crk, bumpScale: 0.45, envMapIntensity: ei }), 1.5);
  KM = {
    gold: mli('gold', 0.9, 0.32, 2.0), amber: mli('amber', 0.85, 0.36, 1.8), silver: mli('silver', 0.9, 0.28, 2.0), black: mli('black', 0.35, 0.5, 1.0),
    osr: T(std(0xffffff, 0.8, 0.1, { map: osrTex(), envMapIntensity: 1.6 }), 0.8),
    cells: T(std(0xffffff, 0.35, 0.16, { map: cellTexK('gaas'), envMapIntensity: 1.3 }), 0.6),
    si: T(std(0xffffff, 0.35, 0.18, { map: cellTexK('si'), envMapIntensity: 1.3 }), 0.6),
    sar: T(std(0xffffff, 0.25, 0.5, { map: sarTex() }), 0.6),
    cfrp: std(0x2b2e33, 0.35, 0.55), tube: std(0x202226, 0.45, 0.45),
    alu: std(0xc4c8ce, 0.95, 0.3), metal: std(0x8d929a, 0.9, 0.38), paint: std(0xe9e9e4, 0.0, 0.62), beta: std(0xf3f1ea, 0.0, 0.92),
    refl: std(0xecebe6, 0.05, 0.5), dark: std(0x2c2f35, 0.5, 0.5), anod: std(0x141518, 0.45, 0.5), void: std(0x010101, 0, 1, { envMapIntensity: 0 }),
    glass: std(0x0d1a33, 1.0, 0.04, { envMapIntensity: 2.5 }), nozzle: std(0x5d5a66, 0.95, 0.32), cable: std(0x3a3a3a, 0.2, 0.7),
  };
  for (const m of Object.values(KM)) m.side = THREE.DoubleSide;
  return KM;
}
// ---- cached geometry ----
const GC = new Map();
const gget = (k, f) => { let g = GC.get(k); if (!g) GC.set(k, (g = f())); return g; };
const gBox = (w, h, d) => gget(`B${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d));
const gCyl = (rt, rb, h, s = 12, open = false) => gget(`C${rt}|${rb}|${h}|${s}|${open}`, () => new THREE.CylinderGeometry(rt, rb, h, s, 1, open));
const gTor = (R, r, s = 24, t = 4) => gget(`T${R}|${r}|${s}|${t}`, () => new THREE.TorusGeometry(R, r, t, s));
function extr(pts, depth, c) { // extruded outline with a one-step bevel = chamfered edges; centred on z
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))),
    { depth: Math.max(1e-4, depth - 2 * c), bevelEnabled: c > 0, bevelThickness: c, bevelSize: c, bevelSegments: 1, curveSegments: 1 });
  g.translate(0, 0, -(depth - 2 * c) / 2); return g;
}
const gCBox = (w, h, d, c = Math.min(w, h, d) * 0.08) => gget(`X${w}|${h}|${d}|${c}`, () => extr([[-w / 2 + c, -h / 2 + c], [w / 2 - c, -h / 2 + c], [w / 2 - c, h / 2 - c], [-w / 2 + c, h / 2 - c]], d, c));
const gPrism = (n, R, h, c, rot = 0) => gget(`P${n}|${R}|${h}|${c}|${rot}`, () => { // n-gon prism along Y with chamfered rims, vertices at rot + k*360/n in XZ
  const Ri = R - c / Math.cos(Math.PI / n), pts = [];
  for (let k = 0; k < n; k++) { const a = rot + k * 2 * Math.PI / n; pts.push([Math.cos(a) * Ri, Math.sin(a) * Ri]); }
  return extr(pts, h, c).rotateX(-Math.PI / 2);
});
const gDish = (D, depth, seg = 32) => gget(`D${D}|${depth}|${seg}`, () => { const p = []; for (let i = 0; i <= 8; i++) { const t = i / 8; p.push(new THREE.Vector2(D / 2 * t, depth * t * t)); } return new THREE.LatheGeometry(p, seg); });
const gBell = (r0, r1, len, seg = 12) => gget(`N${r0}|${r1}|${len}|${seg}`, () => { const p = []; for (let i = 0; i <= 6; i++) { const t = i / 6; p.push(new THREE.Vector2(r0 + (r1 - r0) * Math.sqrt(t), len * t)); } return new THREE.LatheGeometry(p, seg); });
// ---- placement ----
function add(p, geo, mat, pos, rot) { const m = new THREE.Mesh(geo, mat); if (pos) m.position.set(pos[0], pos[1], pos[2]); if (rot) m.rotation.set(rot[0], rot[1], rot[2]); p.add(m); return m; }
function grp(p, pos, rot) { const g = new THREE.Group(); if (pos) pos.isVector3 ? g.position.copy(pos) : g.position.set(pos[0], pos[1], pos[2]); if (rot) g.rotation.set(rot[0], rot[1], rot[2]); p.add(g); return g; }
const aim = (o, dir) => { o.quaternion.setFromUnitVectors(UP, dir.clone().normalize()); return o; }; // local +Y -> dir
const basis = (o, x, y, z) => { o.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)); return o; };
function beam(p, a, b, r, mat, s = 6) { // strut from a to b
  const d = V().subVectors(b, a), m = add(p, gCyl(r, r, 1, s, true), mat);
  m.scale.y = d.length(); m.position.copy(a).addScaledVector(d, 0.5); aim(m, d); return m;
}
function cable(p, pts, r = 0.008) { return add(p, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, r, 4), kmat().cable); }
function bake(root) { // merge every part into one mesh per material (positions, normals and UVs written straight into flat arrays)
  root.updateMatrixWorld(true);
  const bins = new Map(); let parts = 0;
  root.traverse((m) => {
    if (!m.isMesh) return; parts++;
    let b = bins.get(m.material); if (!b) bins.set(m.material, (b = { items: [], n: 0 }));
    b.items.push(m); b.n += m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count;
  });
  const out = new THREE.Group(), nm = new THREE.Matrix3(), tp = V(), tq = new THREE.Quaternion(), ts = V(), lp = new Float32Array(9);
  for (const [mat, b] of bins) {
    const pos = new Float32Array(b.n * 3), nor = new Float32Array(b.n * 3), uv = new Float32Array(b.n * 2), tile = mat.userData.tile; let o = 0;
    for (const m of b.items) {
      const G = m.geometry, P = G.attributes.position.array, N = G.attributes.normal.array, U = G.attributes.uv && G.attributes.uv.array, I = G.index && G.index.array;
      const n = I ? I.length : P.length / 3, e = m.matrixWorld.elements, ne = nm.getNormalMatrix(m.matrixWorld).elements;
      for (let k = 0; k < n; k++) {
        const i = I ? I[k] : k, x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2], j = 3 * (o + k);
        pos[j] = e[0] * x + e[4] * y + e[8] * z + e[12]; pos[j + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; pos[j + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        const a = N[3 * i], c = N[3 * i + 1], d = N[3 * i + 2], nx = ne[0] * a + ne[3] * c + ne[6] * d, ny = ne[1] * a + ne[4] * c + ne[7] * d, nz = ne[2] * a + ne[5] * c + ne[8] * d, l = Math.hypot(nx, ny, nz) || 1;
        nor[j] = nx / l; nor[j + 1] = ny / l; nor[j + 2] = nz / l;
        if (!tile && U) { uv[2 * (o + k)] = U[2 * i]; uv[2 * (o + k) + 1] = U[2 * i + 1]; }
      }
      if (tile) { // box projection in the part's own (scaled) frame, so textures keep real-world scale and follow the part's edges
        m.matrixWorld.decompose(tp, tq, ts);
        for (let k = 0; k + 2 < n; k += 3) {
          for (let v = 0; v < 3; v++) { const i = I ? I[k + v] : k + v; lp[3 * v] = P[3 * i] * ts.x; lp[3 * v + 1] = P[3 * i + 1] * ts.y; lp[3 * v + 2] = P[3 * i + 2] * ts.z; }
          const ux = lp[3] - lp[0], uy = lp[4] - lp[1], uz = lp[5] - lp[2], vx = lp[6] - lp[0], vy = lp[7] - lp[1], vz = lp[8] - lp[2];
          const ax = Math.abs(uy * vz - uz * vy), ay = Math.abs(uz * vx - ux * vz), az = Math.abs(ux * vy - uy * vx);
          const [cu, cv] = ax >= ay && ax >= az ? [2, 1] : ay >= az ? [0, 2] : [0, 1];
          for (let v = 0; v < 3; v++) { uv[2 * (o + k + v)] = lp[3 * v + cu] / tile; uv[2 * (o + k + v) + 1] = lp[3 * v + cv] / tile; }
        }
      }
      o += n;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.add(new THREE.Mesh(geo, mat));
  }
  out.userData.parts = parts; return out;
}
// ---- hardware ----
function solarPanel(p, w, l, cells, t = 0.03) { // panel in local XZ, cells on +Y; w along X, l along Z
  const K = kmat(), e = Math.min(0.018, w * 0.04);
  add(p, gBox(w, t, l), K.cfrp);
  add(p, gBox(w - 2 * e, 0.002 + t * 0.05, l - 2 * e), cells, [0, t / 2 + 0.001 + t * 0.025, 0]);
  for (const s of [-1, 1]) { add(p, gBox(w, t * 0.4, e), K.alu, [0, t * 0.6, s * (l / 2 - e / 2)]); add(p, gBox(e, t * 0.4, l), K.alu, [s * (w / 2 - e / 2), t * 0.6, 0]); }
  if (t > 0.01) for (const s of [-0.25, 0.25]) add(p, gBox(w * 0.96, 0.02, 0.03), K.dark, [0, -t / 2 - 0.01, s * l]); // stiffeners on the back
}
function solarWing(parent, o) { // drive + yoke + n panels (x cols) growing along o.dir; cells face o.up
  const K = kmat(), g = new THREE.Group(), { n, w, l, gap = 0.04, yoke = 0.8, cols = 1, cells = K.cells, s = 1 } = o;
  const cw = cols * l + (cols - 1) * gap, x0 = 0.3 * s;
  add(g, gCyl(0.13 * s, 0.15 * s, 0.06 * s, 18), K.alu, [0.03 * s, 0, 0], [0, 0, Math.PI / 2]);           // drive flange
  add(g, gCyl(0.09 * s, 0.09 * s, 0.16 * s, 16), K.dark, [0.14 * s, 0, 0], [0, 0, Math.PI / 2]);          // SADM housing
  add(g, gCyl(0.05 * s, 0.05 * s, 0.1 * s, 10), K.alu, [0.25 * s, 0, 0], [0, 0, Math.PI / 2]);           // output shaft
  add(g, gBox(0.09 * s, 0.08 * s, 0.24 * s), K.alu, [x0, 0, 0]);                                         // yoke root fitting
  for (const sz of [-1, 1]) beam(g, V(x0, 0, sz * 0.1 * s), V(yoke, 0, sz * cw * 0.36), 0.022 * s, K.tube);
  beam(g, V(yoke, 0, -cw * 0.42), V(yoke, 0, cw * 0.42), 0.02 * s, K.tube);
  cable(g, [V(x0, 0.03 * s, 0.05 * s), V((x0 + yoke) / 2, 0.035 * s, cw * 0.19), V(yoke, 0.03 * s, cw * 0.36)], 0.008 * s);
  const hx = (i) => yoke + i * (w + gap);
  for (let i = 0; i < n; i++) for (let j = 0; j < cols; j++) {
    const zc = (j - (cols - 1) / 2) * (l + gap);
    solarPanel(grp(g, [hx(i) + gap / 2 + w / 2, 0, zc]), w, l, cells);
    for (const hz of [-0.32 * l, 0.32 * l]) {
      add(g, gCyl(0.016 * s, 0.016 * s, 0.09 * s, 8), K.alu, [hx(i), 0, zc + hz], [Math.PI / 2, 0, 0]);
      for (const sx of [-1, 1]) add(g, gBox(0.04 * s, 0.012, 0.06 * s), K.metal, [hx(i) + sx * 0.025 * s, 0, zc + hz]);
    }
  }
  if (cols > 1) beam(g, V(yoke, -0.03, 0), V(hx(n) - gap, -0.03, 0), 0.025 * s, K.tube);
  const x = o.dir.clone().normalize(), y = o.up.clone().addScaledVector(x, -o.up.dot(x)).normalize();
  basis(g, x, y, V().crossVectors(x, y)); g.position.copy(o.pos); parent.add(g); return g;
}
function reflector(parent, o) { // parabolic reflector opening toward o.dir, rim, back ribs and hub; optional prime-focus feed on struts
  const K = kmat(), g = new THREE.Group(), { D, depth } = o, r = D / 2, nR = o.ribs ?? 6;
  add(g, gDish(D, depth), o.mat || K.refl);
  add(g, gTor(r, 0.006 + D * 0.006, 40, 4), K.paint, [0, depth, 0], [Math.PI / 2, 0, 0]);
  add(g, gCyl(r * 0.16, r * 0.2, 0.03 + D * 0.03, 12), K.dark, [0, -0.02 - D * 0.012, 0]);
  for (let k = 0; k < nR; k++) {
    const a = k * 2 * Math.PI / nR, P = (t) => V(Math.cos(a) * r * t, depth * t * t - 0.01 - 0.012 * D, Math.sin(a) * r * t);
    beam(g, P(0.15), P(0.55), 0.006 + 0.006 * D, K.metal, 4); beam(g, P(0.55), P(0.97), 0.006 + 0.006 * D, K.metal, 4);
  }
  if (o.feed === 'prime') {
    const f = r * r / (4 * depth), hl = D * 0.13;
    add(g, gCyl(D * 0.025, D * 0.055, hl, 12, true), K.alu, [0, f, 0]); add(g, gCyl(D * 0.022, D * 0.05, hl * 0.98, 12, true), K.void, [0, f, 0]);
    add(g, gCyl(D * 0.03, D * 0.03, hl * 0.6, 10), K.paint, [0, f + hl * 0.75, 0]);
    for (let k = 0; k < 3; k++) { const a = k * 2.094 + 0.5; beam(g, V(Math.cos(a) * r * 0.97, depth, Math.sin(a) * r * 0.97), V(0, f + hl * 0.6, 0), 0.004 + 0.005 * D, K.tube, 4); }
  }
  g.position.copy(o.pos); aim(g, o.dir); parent.add(g); return g;
}
function horn(p, r, len, pos, dir, mat) { // feed horn opening toward dir
  const K = kmat(), g = grp(p, pos); aim(g, dir);
  add(g, gCyl(r, r * 0.35, len, 12, true), mat || K.alu, [0, len / 2, 0]); add(g, gCyl(r * 0.92, r * 0.3, len * 0.98, 12, true), K.void, [0, len / 2, 0]);
  add(g, gTor(r, r * 0.08, 12, 3), K.alu, [0, len, 0], [Math.PI / 2, 0, 0]); add(g, gCyl(r * 0.4, r * 0.4, len * 0.6, 8), K.metal, [0, -len * 0.25, 0]);
  return g;
}
function starTracker(p, pos, dir, s = 1) { // camera head + flared black baffle with vanes, looking along dir
  const K = kmat(), g = grp(p, pos); aim(g, dir);
  add(g, gBox(0.17 * s, 0.015 * s, 0.17 * s), K.alu, [0, 0.008 * s, 0]);
  add(g, gCBox(0.12 * s, 0.11 * s, 0.12 * s, 0.01 * s), K.anod, [0, 0.07 * s, 0]);
  add(g, gCyl(0.085 * s, 0.05 * s, 0.22 * s, 16, true), K.anod, [0, 0.235 * s, 0]);
  add(g, gCyl(0.079 * s, 0.045 * s, 0.218 * s, 16, true), K.void, [0, 0.235 * s, 0]);
  add(g, gCyl(0.044 * s, 0.044 * s, 0.006 * s, 16), K.glass, [0, 0.13 * s, 0]);
  for (const t of [0.2, 0.27]) add(g, gTor((0.046 + (t - 0.125) * 0.155) * s, 0.004 * s, 16, 3), K.void, [0, t * s, 0], [Math.PI / 2, 0, 0]);
  add(g, gTor(0.085 * s, 0.006 * s, 20, 4), K.alu, [0, 0.345 * s, 0], [Math.PI / 2, 0, 0]);
  return g;
}
function thruster(p, pos, dir, s = 1) { // hydrazine thruster: valve, flange, bell; exhaust along dir
  const K = kmat(), g = grp(p, pos); aim(g, dir);
  add(g, gCyl(0.022 * s, 0.022 * s, 0.05 * s, 8), K.metal, [0, -0.03 * s, 0]);
  add(g, gCyl(0.032 * s, 0.032 * s, 0.006 * s, 10), K.alu, [0, -0.004 * s, 0]);
  add(g, gBell(0.008 * s, 0.025 * s, 0.065 * s, 12), K.nozzle);
  return g;
}
function engine(p, pos, dir, s = 1) { // apogee / orbit engine: chamber, injector, large bell
  const K = kmat(), g = grp(p, pos); aim(g, dir);
  add(g, gCyl(0.06 * s, 0.07 * s, 0.14 * s, 14), K.metal, [0, -0.05 * s, 0]); add(g, gCyl(0.05 * s, 0.05 * s, 0.1 * s, 14), K.nozzle, [0, 0.06 * s, 0]);
  add(g, gBell(0.045 * s, 0.17 * s, 0.42 * s, 24), K.nozzle, [0, 0.1 * s, 0]); add(g, gTor(0.17 * s, 0.008 * s, 24, 4), K.metal, [0, 0.52 * s, 0], [Math.PI / 2, 0, 0]);
  return g;
}
function adapterRing(p, r, pos, dir, h = 0.12) { // launch adapter: conical ring, clamp-band flange, clamp shoes, separation springs
  const K = kmat(), g = grp(p, pos); aim(g, dir);
  add(g, gCyl(r * 1.06, r, h, 40, true), K.alu, [0, h / 2, 0]);
  add(g, gTor(r * 1.07, 0.02, 48, 6), K.metal, [0, h, 0], [Math.PI / 2, 0, 0]); add(g, gTor(r, 0.014, 40, 4), K.alu, [0, 0.004, 0], [Math.PI / 2, 0, 0]);
  for (let k = 0; k < 24; k++) { const a = k * Math.PI / 12; add(g, gBox(0.03, 0.035, 0.022), K.metal, [Math.cos(a) * r * 1.09, h - 0.005, Math.sin(a) * r * 1.09], [0, -a, 0]); }
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; add(g, gCyl(0.018, 0.018, h * 0.6, 8), K.metal, [Math.cos(a) * r * 0.9, h * 0.3, Math.sin(a) * r * 0.9]); }
  return g;
}
function baffle(p, o) { // instrument aperture: tube open toward o.dir, black lining with vanes, dark floor, rim
  const K = kmat(), g = grp(p, o.pos), { r, len } = o, n = o.seg ?? 28, nv = o.vanes ?? 3; aim(g, o.dir);
  add(g, gCyl(r, r, len, n, true), o.outer || K.black, [0, len / 2, 0]);
  add(g, gCyl(r * 0.965, r * 0.965, len * 0.998, n, true), K.void, [0, len / 2, 0]);
  add(g, gCyl(r * 0.965, r * 0.965, 0.004, n), K.void, [0, 0.004, 0]);
  for (let i = 1; i <= nv; i++) add(g, gTor(r * 0.93, r * 0.035, n, 3), K.void, [0, len * i / (nv + 1), 0], [Math.PI / 2, 0, 0]);
  add(g, gTor(r, Math.max(0.005, r * 0.035), n, 4), o.rim || K.alu, [0, len, 0], [Math.PI / 2, 0, 0]);
  return g;
}
function hood(p, o) { // rectangular aperture shade (white outside, black inside) opening toward o.dir
  const K = kmat(), g = grp(p, o.pos), { w, d, len } = o, t = 0.012; aim(g, o.dir);
  for (const s of [-1, 1]) {
    add(g, gBox(t, len, d), o.outer || K.paint, [s * w / 2, len / 2, 0]); add(g, gBox(w, len, t), o.outer || K.paint, [0, len / 2, s * d / 2]);
    add(g, gBox(0.003, len, d - 0.02), K.void, [s * (w / 2 - t), len / 2, 0]); add(g, gBox(w - 0.02, len, 0.003), K.void, [0, len / 2, s * (d / 2 - t)]);
    add(g, gBox(w + t, 0.012, 0.016), K.alu, [0, len, s * d / 2]); add(g, gBox(0.016, 0.012, d + t), K.alu, [s * w / 2, len, 0]);
  }
  add(g, gBox(w - 0.02, 0.004, d - 0.02), K.void, [0, 0.01, 0]);
  return g;
}
function osrPanel(p, w, h, pos, rot) { // OSR radiator with an aluminium frame, in the local XY plane facing +Z
  const K = kmat(), g = grp(p, pos, rot);
  add(g, gBox(w, h, 0.01), K.osr, [0, 0, 0.005]);
  for (const s of [-1, 1]) { add(g, gBox(w + 0.02, 0.02, 0.014), K.alu, [0, s * h / 2, 0.007]); add(g, gBox(0.02, h, 0.014), K.alu, [s * w / 2, 0, 0.007]); }
  return g;
}
function helix(p, pos, dir, s = 1) { // S-band quadrifilar helix / omni in a white radome
  const K = kmat(), g = grp(p, pos); aim(g, dir);
  add(g, gCyl(0.045 * s, 0.05 * s, 0.03 * s, 12), K.alu, [0, 0.015 * s, 0]); add(g, gCyl(0.03 * s, 0.03 * s, 0.16 * s, 12), K.beta, [0, 0.11 * s, 0]);
  add(g, gCyl(0.012 * s, 0.03 * s, 0.03 * s, 12), K.beta, [0, 0.205 * s, 0]);
  return g;
}
function patch(p, pos, dir, r = 0.06) { // GPS / S-band patch antenna puck
  const K = kmat(), g = grp(p, pos); aim(g, dir);
  add(g, gCyl(r, r * 1.05, 0.02, 16), K.beta, [0, 0.01, 0]); add(g, gBox(r * 0.9, 0.004, r * 0.9), K.dark, [0, 0.022, 0]);
  return g;
}
function sunSensor(p, pos, dir) { const K = kmat(), g = grp(p, pos); aim(g, dir); add(g, gBox(0.07, 0.025, 0.07), K.anod, [0, 0.012, 0]); add(g, gCyl(0.018, 0.018, 0.01, 12), K.glass, [0, 0.03, 0]); return g; }
function tapes(p, n, R, h, y, mat, rot = 0, c = 0.03) { // MLI closeout tape along the vertical edges of an n-gon prism
  for (let k = 0; k < n; k++) { const a = rot + k * 2 * Math.PI / n, rr = R - c * 0.9; add(p, gBox(0.05, h - 0.02, 0.022), mat, [Math.cos(a) * rr, y, -Math.sin(a) * rr], [0, a + Math.PI / 2, 0]); }
}
function boxTapes(p, w, h, d, mat, c = 0.04) { // MLI closeout tape on the 4 vertical edges of a box bus
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(p, gBox(0.05, h - 0.03, 0.022), mat, [sx * (w / 2 - c * 0.3), 0, sz * (d / 2 - c * 0.3)], [0, sx * sz * Math.PI / 4, 0]);
}

// ---- KOMPSAT-3/3A and CAS500 share KARI's optical layout: hexagonal bus on top, telescope module below looking at nadir,
// three panels hinged at the top edge of alternate faces and swung out and down like a skirt ----
function opticalLEO(c) {
  const K = kmat(), g = new THREE.Group();
  const { R, hb, R2, hp, ap, pw, pl, yTop } = c, a = R * Math.cos(Math.PI / 6), a2 = R2 * Math.cos(Math.PI / 6), yMid = yTop - hb, yBot = yMid - 0.04 - hp;
  const face = (phi, y, dist) => grp(g, [Math.cos(phi) * dist, y, Math.sin(phi) * dist], [0, Math.PI / 2 - phi, 0]); // local +Z out, +X along, +Y up
  add(g, gPrism(6, R, hb, 0.035), K.gold, [0, yTop - hb / 2, 0]); tapes(g, 6, R, hb, yTop - hb / 2, K.amber);
  add(g, gPrism(6, R - 0.03, 0.03, 0.01), K.paint, [0, yTop + 0.015, 0]);                                   // top deck
  add(g, gPrism(6, R + 0.006, 0.04, 0.012), K.paint, [0, yMid - 0.02, 0]);                                  // bus / payload interface deck
  add(g, gPrism(6, R2, hp, 0.03), c.payMat || K.black, [0, yMid - 0.04 - hp / 2, 0]); tapes(g, 6, R2, hp, yMid - 0.04 - hp / 2, K.silver);
  add(g, gPrism(6, R2 + 0.004, 0.03, 0.01), K.paint, [0, yBot - 0.015, 0]);                                 // telescope base plate
  for (let k = 0; k < 6; k++) {
    const phi = Math.PI / 6 + k * Math.PI / 3;
    if (k % 2 === 0) { // panel faces: hinge brackets, standoff arms, panel swung out by c.deploy, hold-down cups left on the face
      const F = face(phi, yTop, a);
      for (const sx of [-1, 1]) { add(F, gBox(0.07, 0.07, 0.1), K.alu, [sx * pw * 0.32, -0.03, 0.04]); add(F, gCyl(0.022, 0.022, 0.11, 8), K.metal, [sx * pw * 0.32, 0, 0.08], [0, 0, Math.PI / 2]); }
      const H = grp(F, [0, 0, 0.08], [-c.deploy, 0, 0]);
      for (const sx of [-1, 1]) beam(H, V(sx * pw * 0.32, 0, 0), V(sx * pw * 0.3, -0.17, 0), 0.016, K.alu);
      solarPanel(grp(H, [0, -0.17 - pl / 2, 0], [Math.PI / 2, 0, 0]), pw, pl, K.cells);
      cable(F, [V(0.06, -0.02, 0.01), V(0.09, -0.02, 0.07), V(0.06, -0.06, 0.12)], 0.009);
      const F2 = face(phi, yTop - hb * 0.78, a);
      for (const sx of [-1, 1]) add(F2, gCyl(0.035, 0.035, 0.05, 10), K.metal, [sx * pw * 0.3, 0, 0.025], [Math.PI / 2, 0, 0]);
      const F3 = face(phi, yMid - 0.04 - hp * 0.45, a2); add(F3, gCBox(R2 * 0.55, hp * 0.35, 0.05, 0.01), K.silver, [0, 0, 0.025]); // electronics on the telescope module
    } else { // radiator faces
      const F = face(phi, yTop - hb * 0.5, a + 0.004);
      osrPanel(F, R * 0.74, hb * 0.6, [0, 0.04, 0]);
      if (k === 1) sunSensor(F, [0, -hb * 0.36, 0.01], V(0, 0, 1));
      if (k === 3) add(F, gCBox(0.18, 0.1, 0.05, 0.01), K.dark, [0, -hb * 0.37, 0.025]); // test connector bracket
      if (k === 5) patch(F, [0, -hb * 0.38, 0.01], V(0, 0, 1), 0.05);
    }
  }
  // top deck: launch adapter, star trackers, thrusters, antennas
  adapterRing(g, c.ring, [0, yTop + 0.03, 0], UP);
  const deck = (ang, rr, y = yTop + 0.03) => [Math.cos(ang) * rr, y, Math.sin(ang) * rr], rr = (c.ring + a) / 2 + 0.03;
  for (const da of [-0.22, 0.22]) { const ang = 7 * Math.PI / 6 + da; starTracker(g, deck(ang, rr), V(Math.cos(ang) * 0.45, 1, Math.sin(ang) * 0.45), c.st); }
  helix(g, deck(Math.PI / 2, rr), UP, c.st); patch(g, deck(11 * Math.PI / 6, rr), UP, 0.06 * c.st);
  sunSensor(g, deck(Math.PI / 2 + 0.35, rr), UP); sunSensor(g, deck(11 * Math.PI / 6 - 0.35, rr), V(0.3, 1, 0));
  for (const k of [1, 2, 4, 5]) { const ang = k * Math.PI / 3; thruster(g, deck(-ang, R - 0.13), V(Math.cos(-ang) * 0.3, 1, Math.sin(-ang) * 0.3), c.st * 1.2); }
  // under the bus ledge: X-band antenna on a two-axis pointing mechanism, S-band antennas
  const rl = (a + a2) / 2 + 0.02, xa = grp(g, [0, yMid - 0.04, rl]);
  add(xa, gCyl(0.07 * c.st, 0.08 * c.st, 0.06 * c.st, 14), K.alu, [0, -0.03 * c.st, 0]);
  add(xa, gBox(0.17 * c.st, 0.02, 0.06 * c.st), K.metal, [0, -0.07 * c.st, 0]);
  for (const sx of [-1, 1]) add(xa, gBox(0.02, 0.12 * c.st, 0.06 * c.st), K.metal, [sx * 0.08 * c.st, -0.13 * c.st, 0]);
  const el = grp(xa, [0, -0.17 * c.st, 0], [0.45, 0, 0]); add(el, gCyl(0.015, 0.015, 0.18 * c.st, 8), K.metal, [0, 0, 0], [0, 0, Math.PI / 2]);
  reflector(el, { D: 0.3 * c.st, depth: 0.05 * c.st, pos: V(0, -0.02, 0), dir: V(0, -1, 0), feed: 'prime', ribs: 0 });
  helix(g, [Math.cos(7 * Math.PI / 6) * rl, yMid - 0.04, Math.sin(7 * Math.PI / 6) * rl], V(0, -1, 0), c.st);
  patch(g, [Math.cos(11 * Math.PI / 6) * rl, yMid - 0.04, Math.sin(11 * Math.PI / 6) * rl], V(0, -1, 0), 0.05);
  // telescope aperture: sun baffle, black lining with vanes, secondary-mirror spider just inside
  baffle(g, { r: ap, len: c.baf, pos: V(0, yBot - 0.03, 0), dir: V(0, -1, 0), outer: c.bafMat || K.paint, vanes: 3, seg: 36 });
  const sp = grp(g, [0, yBot - 0.09, 0]);
  for (const ry of [0, Math.PI / 2]) add(sp, gBox(ap * 1.9, 0.008, 0.014), K.anod, [0, 0, 0], [0, ry + Math.PI / 4, 0]);
  add(sp, gCyl(ap * 0.26, ap * 0.26, 0.05, 20), K.anod); add(sp, gCyl(ap * 0.2, ap * 0.2, 0.004, 20), K.glass, [0, -0.027, 0]);
  if (c.ir) { // KOMPSAT-3A mid-wave infrared scanner beside the main telescope
    add(g, gCBox(0.36, 0.26, 0.3, 0.02), K.silver, [0, yBot - 0.16, -a2 + 0.05]);
    baffle(g, { r: 0.065, len: 0.09, pos: V(0, yBot - 0.29, -a2 + 0.05), dir: V(0, -1, 0), outer: K.black, vanes: 1, seg: 16 });
    add(g, gBox(0.3, 0.012, 0.22), K.osr, [0, yBot - 0.03 - 0.006, -a2 + 0.05]);
  }
  return g;
}

// ---- KOMPSAT-5 (Arirang 5): hexagonal KOMPSAT-2-heritage bus (2.6 m across, 3.7 m long) lying along the flight direction (+X),
// the COSI X-band active phased-array antenna fixed along the nadir face, two wings of 2 x 2 silicon panels on booms with drives ----
function kompsat5() {
  const K = kmat(), g = new THREE.Group(), R = 1.3, L = 3.3, a = R * Math.cos(Math.PI / 6);
  const face = (psi, x, d = a) => { const c = Math.cos(psi), s = Math.sin(psi), o = new THREE.Group(); o.position.set(x, c * d, s * d); basis(o, V(0, -s, c), V(1, 0, 0), V(0, c, s)); g.add(o); return o; }; // psi from +Y toward +Z; local X across, Y along the bus, Z out
  add(g, gPrism(6, R, L, 0.04, Math.PI / 6), K.gold, [0, 0, 0], [0, 0, -Math.PI / 2]);
  for (let k = 0; k < 6; k++) { const v = Math.PI / 6 + k * Math.PI / 3, rr = R - 0.03; add(g, gBox(L - 0.02, 0.05, 0.022), K.amber, [0, Math.cos(v) * rr, Math.sin(v) * rr], [v - Math.PI / 2, 0, 0]); }
  for (const sx of [-1, 1]) add(g, gPrism(6, R - 0.03, 0.03, 0.01, Math.PI / 6), sx > 0 ? K.black : K.paint, [sx * (L / 2 + 0.015), 0, 0], [0, 0, -Math.PI / 2]);
  // SAR antenna: standoff brackets, four tiles of radiating panel, edge rails
  const S = face(Math.PI, 0), AW = 1.12, AL = 3.6, AT = 0.12, z0 = 0.14;
  for (const yy of [-1.3, -0.45, 0.45, 1.3]) for (const xx of [-0.42, 0.42]) add(S, gBox(0.08, 0.08, z0), K.alu, [xx, yy, z0 / 2]);
  for (let i = 0; i < 4; i++) { const yy = -AL / 2 + (i + 0.5) * AL / 4; add(S, gBox(AW, AL / 4 - 0.015, AT), K.cfrp, [0, yy, z0 + AT / 2]); add(S, gBox(AW - 0.03, AL / 4 - 0.045, 0.004), K.sar, [0, yy, z0 + AT + 0.002]); }
  for (const sx of [-1, 1]) add(S, gBox(0.02, AL, AT + 0.012), K.alu, [sx * AW / 2, 0, z0 + AT / 2]);
  cable(S, [V(0.3, 1.5, 0.0), V(0.35, 1.7, 0.08), V(0.3, 1.75, 0.16)], 0.02);
  // radiators on the lower side faces, drives on the upper side faces
  for (const psi of [2 * Math.PI / 3, 4 * Math.PI / 3]) { const F = face(psi, 0, a + 0.004); osrPanel(F, R * 0.72, L * 0.36, [0, -0.75, 0]); osrPanel(F, R * 0.72, L * 0.36, [0, 0.75, 0]); }
  for (const sz of [-1, 1]) {
    const psi = sz > 0 ? Math.PI / 3 : 5 * Math.PI / 3, F = face(psi, 0, a + 0.004);
    osrPanel(F, R * 0.7, L * 0.25, [0, -1.05, 0]);
    solarWing(g, { n: 2, cols: 2, w: 1.25, l: 1.45, gap: 0.05, yoke: 0.75, cells: K.si, s: 1.1, pos: V(0, Math.cos(psi) * a, Math.sin(psi) * a), dir: V(0, 0.18, sz), up: V(0, 1, 0) });
  }
  // top face: star trackers, GPS precise-orbit antennas, S-band; front: radio-occultation GPS antenna; aft: adapter ring and thrusters
  const T = face(0, 0, a);
  starTracker(T, [0.25, 0.9, 0], V(0.5, 0.2, 1)); starTracker(T, [-0.25, 0.9, 0], V(-0.5, 0.2, 1));
  patch(T, [0, -0.6, 0], V(0, 0, 1), 0.08); patch(T, [0, 0.2, 0], V(0, 0, 1), 0.08); helix(T, [0.35, -1.3, 0], V(0, 0, 1)); sunSensor(T, [-0.35, -1.3, 0], V(0, 0, 1));
  const fr = grp(g, [L / 2 + 0.03, 0.35, 0]); add(fr, gCBox(0.06, 0.32, 0.5, 0.01), K.beta, [0.03, 0, 0]); for (let i = 0; i < 4; i++) add(fr, gBox(0.008, 0.08, 0.08), K.dark, [0.064, (i % 2 - 0.5) * 0.14, (i - 1.5) * 0.11]);
  helix(g, [L / 2 + 0.03, -0.55, 0.3], V(1, 0, 0)); sunSensor(g, [L / 2 + 0.03, -0.3, -0.5], V(1, 0, 0));
  adapterRing(g, 0.55, [-L / 2 - 0.03, 0, 0], V(-1, 0, 0));
  for (const [y, z] of [[0.75, 0.75], [0.75, -0.75], [-0.75, 0.75], [-0.75, -0.75]]) thruster(g, [-L / 2 - 0.03, y, z], V(-1, y * 0.3, z * 0.3), 1.3);
  // lower faces near the front: gimballed X-band downlink antenna, laser retro-reflector array
  const X = face(2 * Math.PI / 3, 0, a); const xa = grp(X, [0, 1.35, 0]);
  add(xa, gCyl(0.08, 0.09, 0.06, 14), K.alu, [0, 0, 0.03], [Math.PI / 2, 0, 0]); for (const sx of [-1, 1]) add(xa, gBox(0.02, 0.06, 0.14), K.metal, [sx * 0.08, 0, 0.12]);
  horn(xa, 0.07, 0.16, [0, 0, 0.17], V(0, 0, 1));
  const Lr = face(4 * Math.PI / 3, 0, a); const lr = grp(Lr, [0, 1.35, 0]); add(lr, gCBox(0.2, 0.2, 0.05, 0.01), K.alu, [0, 0, 0.025]);
  for (const [u, v] of [[-0.05, -0.05], [0.05, -0.05], [-0.05, 0.05], [0.05, 0.05]]) add(lr, gCyl(0.035, 0.035, 0.02, 10), K.glass, [u, v, 0.06], [Math.PI / 2, 0, 0]);
  return g;
}

// ---- GEO-KOMPSAT-2A/2B: KARI GK2 bus (3.4-3.5 t), box with a single deployable wing on the south (+X) face - KARI chose a
// one-sided array so the north side stays cold for the optical payloads. Earth deck (-Y) carries AMI (2A) or GOCI-II + GEMS (2B) ----
function geoKompsat(v) {
  const K = kmat(), g = new THREE.Group(), W = 2.4, H = 3.3, D = 2.6, yb = -H / 2;
  add(g, gCBox(W, H, D, 0.04), K.gold); boxTapes(g, W, H, D, K.amber);
  for (const sx of [-1, 1]) { const F = grp(g, [sx * (W / 2 + 0.002), 0, 0], [0, sx * Math.PI / 2, 0]); // N/S radiators (the south one split around the drive)
    if (sx > 0) { osrPanel(F, D * 0.8, H * 0.32, [0, 1.0, 0]); osrPanel(F, D * 0.8, H * 0.38, [0, -0.85, 0]); } else osrPanel(F, D * 0.8, H * 0.78, [0, 0.1, 0]); }
  for (const sz of [-1, 1]) { const F = grp(g, [0, 0, sz * (D / 2 + 0.002)], [0, sz > 0 ? 0 : Math.PI, 0]); add(F, gBox(W * 0.7, H * 0.25, 0.01), K.black, [0, 0.9, 0.005]); helix(F, [0.75, -1.2, 0], V(0, 0, 1)); }
  solarWing(g, { n: 3, w: 2.05, l: 2.55, gap: 0.05, yoke: 1.8, s: 1.3, pos: V(W / 2 + 0.012, 0.15, 0), dir: V(1, 0, 0), up: V(0, 0.55, 1) });
  // anti-Earth deck: launch adapter (1194 mm), apogee engine, thruster pairs, magnetometer boom (SOSMAG, 1 m)
  adapterRing(g, 0.6, [0, H / 2, 0], UP, 0.15); engine(g, [0, H / 2 + 0.05, 0], UP, 1.2);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const p = [sx * (W / 2 - 0.12), H / 2 + 0.01, sz * (D / 2 - 0.12)]; thruster(g, p, V(sx * 0.3, 1, sz * 0.3), 1.6); thruster(g, [p[0], p[1] - 0.12, p[2] + sz * 0.13], V(0, 0.2, sz), 1.6); }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) thruster(g, [sx * (W / 2 + 0.01), yb + 0.15, sz * (D / 2 - 0.2)], V(sx, -0.2, 0), 1.6);
  const mb = V(-W / 2 + 0.2, H / 2, -D / 2 + 0.2); add(g, gBox(0.12, 0.08, 0.12), K.alu, [mb.x, mb.y + 0.04, mb.z]);
  const mt = mb.clone().add(V(-0.55, 0.55, -0.55)); beam(g, mb.clone().setY(mb.y + 0.06), mt, 0.018, K.tube); add(g, gCBox(0.09, 0.07, 0.09, 0.01), K.beta, [mt.x, mt.y, mt.z]);
  starTracker(g, [-W / 2 - 0.01, H / 2 - 0.3, 0.55], V(-1, 0.55, 0.15), 1.2); starTracker(g, [-W / 2 - 0.01, H / 2 - 0.3, -0.55], V(-1, 0.55, -0.15), 1.2);
  helix(g, [W / 2 - 0.25, H / 2 + 0.01, 0.8], UP, 1.3);
  // Earth deck
  if (v === 'A') {
    add(g, gCBox(1.1, 0.75, 1.25, 0.04), K.silver, [-0.45, yb - 0.4, 0.2]);                                  // AMI sensor module (338 kg)
    hood(g, { w: 0.6, d: 0.5, len: 0.38, pos: V(-0.4, yb - 0.77, 0.3), dir: V(0, -1, 0) });                // scan-mirror aperture with Earth shade
    add(g, gBox(0.45, 0.004, 0.36), K.glass, [-0.4, yb - 0.775, 0.3]);
    const cr = grp(g, [-1.0, yb - 0.42, 0.2]); add(cr, gBox(0.012, 0.42, 0.62), K.osr, [-0.012, 0, 0]);       // radiative cooler looking north, with shields
    for (const s of [-1, 1]) add(cr, gBox(0.3, 0.44, 0.01), K.silver, [-0.15, 0, s * 0.34], [0, s * 0.35, 0]); add(cr, gBox(0.3, 0.01, 0.66), K.silver, [-0.15, -0.23, 0]);
    add(g, gCBox(0.4, 0.22, 0.35, 0.02), K.silver, [0.25, yb - 0.11, 0.55]); add(g, gCBox(0.3, 0.18, 0.3, 0.02), K.black, [-0.65, yb - 0.09, -0.75]); // AMI electronics
    const pd = grp(g, [0.4, H / 2 - 0.35, D / 2 + 0.01]); add(pd, gCBox(0.3, 0.2, 0.12, 0.01), K.anod, [0, 0, 0.06]);    // KSEM particle detector
    for (let i = 0; i < 3; i++) baffle(pd, { r: 0.025, len: 0.06, pos: V((i - 1) * 0.09, 0.02, 0.12), dir: V(0, 0.3 * (i - 1), 1), outer: K.alu, vanes: 0, seg: 10 });
    reflector(g, { D: 1.0, depth: 0.14, pos: V(0.62, yb - 0.32, -0.7), dir: V(0.1, -1, 0), feed: 'prime', ribs: 6 });          // L-band LRIT/HRIT
    add(g, gCBox(0.3, 0.28, 0.3, 0.02), K.gold, [0.62, yb - 0.15, -0.7]);
  } else {
    add(g, gCBox(1.0, 0.9, 1.5, 0.04), K.silver, [-0.4, yb - 0.47, 0.15]);                                   // GOCI-II sensor unit (1.5 x 1.0 x 0.9 m)
    const gp = grp(g, [-0.4, yb - 0.92, 0.35]); add(gp, gCyl(0.3, 0.32, 0.08, 28), K.alu, [0, -0.04, 0]); add(gp, gTor(0.31, 0.02, 28, 4), K.dark, [0, -0.08, 0], [Math.PI / 2, 0, 0]); // two-axis pointing mechanism
    baffle(gp, { r: 0.22, len: 0.32, pos: V(0, -0.08, 0), dir: V(0.05, -1, 0), outer: K.black, vanes: 3, seg: 28 });
    add(g, gCBox(0.8, 0.6, 0.85, 0.03), K.black, [0.5, yb - 0.31, -0.65]);                                    // GEMS spectrometer
    hood(g, { w: 0.14, d: 0.55, len: 0.2, pos: V(0.55, yb - 0.6, -0.65), dir: V(0, -1, 0), outer: K.silver });
    add(g, gCBox(0.35, 0.2, 0.3, 0.02), K.silver, [0.6, yb - 0.1, 0.2]);
  }
  reflector(g, { D: 0.62, depth: 0.09, pos: V(0.72, yb - 0.2, 0.85), dir: V(0.15, -1, 0.1), feed: 'prime', ribs: 4 });     // X/S data link
  add(g, gCBox(0.2, 0.12, 0.2, 0.02), K.gold, [0.72, yb - 0.06, 0.85]);
  const es = grp(g, [0.05, yb - 0.02, -0.55]); add(es, gCBox(0.24, 0.12, 0.14, 0.01), K.anod, [0, -0.06, 0]); for (const s of [-1, 1]) baffle(es, { r: 0.035, len: 0.06, pos: V(s * 0.06, -0.12, 0), dir: V(0, -1, 0), outer: K.anod, vanes: 0, seg: 12 }); // Earth sensor
  helix(g, [-0.95, yb - 0.02, -1.05], V(0, -1, 0), 1.2);
  return g;
}

// ---- Koreasat (Mugunghwa) 5A/6A/7: Thales Alenia Space Spacebus 4000 class; tall box, N/S faces covered with OSR radiators,
// two 4-panel wings, large deployable reflectors on the east and west faces lit by feed clusters on the Earth-deck edges,
// Ka/Ku antennas on an Earth-deck tower; liquid apogee engine and adapter on the anti-Earth deck ----
function koreasat() {
  const K = kmat(), g = new THREE.Group(), W = 1.9, H = 3.8, D = 2.3, yb = -H / 2;
  add(g, gCBox(W, H, D, 0.04), K.gold); boxTapes(g, W, H, D, K.amber);
  for (const sz of [-1, 1]) add(g, gBox(W - 0.08, H - 0.1, 0.01), K.black, [0, 0, sz * (D / 2 + 0.005)]);
  for (const sx of [-1, 1]) { const F = grp(g, [sx * (W / 2 + 0.002), 0, 0], [0, sx * Math.PI / 2, 0]);
    osrPanel(F, D * 0.86, H * 0.4, [0, 0.95, 0]); osrPanel(F, D * 0.86, H * 0.4, [0, -0.95, 0]);
    for (let i = 0; i < 6; i++) add(F, gBox(0.02, H * 0.86, 0.012), K.metal, [(i - 2.5) * D * 0.16, 0, 0.014]); // heat-pipe closeouts
    solarWing(g, { n: 4, w: 2.3, l: 3.0, gap: 0.05, yoke: 2.0, s: 1.5, pos: V(sx * (W / 2 + 0.014), 0.2, 0), dir: V(sx, 0, 0), up: V(0, 0.55, 1) });
  }
  for (const sz of [-1, 1]) { // east / west deployable reflectors, deployment arms and feed clusters
    const C = V(0, -0.45, sz * 2.75), feed = V(0, yb - 0.08, sz * 0.92), toF = V().subVectors(feed, C).normalize(), dir = toF.clone().add(V(0, -1, 0)).normalize();
    reflector(g, { D: 2.5, depth: 0.3, pos: C, dir, ribs: 8 });
    const back = C.clone().addScaledVector(dir, -0.12);
    for (const sx of [-1, 1]) { const h = V(sx * 0.3, yb + 0.35, sz * (D / 2 + 0.02)); add(g, gBox(0.12, 0.14, 0.08), K.alu, [h.x, h.y, h.z]); beam(g, h, back.clone().add(V(sx * 0.35, 0, 0)), 0.035, K.tube); }
    beam(g, V(-0.3, yb + 0.35, sz * (D / 2 + 0.02)), V(0.3, yb + 0.35, sz * (D / 2 + 0.02)), 0.025, K.tube);
    const fc = grp(g, [feed.x, feed.y, feed.z]); aim(fc, V().subVectors(C, feed)); add(fc, gBox(0.55, 0.05, 0.4), K.alu, [0, -0.03, 0]);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) horn(fc, 0.075, 0.26, [(i - 1) * 0.17, 0, (j - 0.5) * 0.17], UP, K.alu);
    add(g, gBox(0.08, 0.08, 0.5), K.metal, [0.25, yb - 0.04, sz * 0.75]);
  }
  // Earth deck: antenna tower with a Ka-band dish and its subreflector, steerable dish, horns, TT&C omni, Earth sensor
  add(g, gCBox(0.7, 0.55, 0.7, 0.03), K.gold, [0.3, yb - 0.28, 0.0]);
  reflector(g, { D: 1.25, depth: 0.16, pos: V(0.3, yb - 0.62, 0), dir: V(0.25, -1, 0), feed: 'prime', ribs: 6 });
  const st = grp(g, [-0.5, yb - 0.02, -0.5]); add(st, gCyl(0.08, 0.1, 0.12, 14), K.alu, [0, -0.06, 0]); for (const s of [-1, 1]) add(st, gBox(0.02, 0.18, 0.06), K.metal, [s * 0.1, -0.2, 0]);
  reflector(st, { D: 0.8, depth: 0.11, pos: V(0, -0.3, 0), dir: V(-0.2, -1, 0.15), feed: 'prime', ribs: 4 });
  for (let i = 0; i < 3; i++) horn(g, 0.07, 0.24, [-0.65 + i * 0.18, yb - 0.02, 0.6], V(0, -1, 0.15), K.gold);
  const om = grp(g, [0.75, yb - 0.02, 0.9]); add(om, gCyl(0.015, 0.015, 0.35, 6), K.alu, [0, -0.17, 0]); add(om, gCyl(0.07, 0.0, 0.08, 12), K.alu, [0, -0.38, 0]); add(om, gCyl(0.0, 0.07, 0.08, 12), K.alu, [0, -0.3, 0]);
  const es = grp(g, [-0.55, yb - 0.02, 0.2]); add(es, gCBox(0.25, 0.12, 0.15, 0.01), K.anod, [0, -0.06, 0]); for (const s of [-1, 1]) baffle(es, { r: 0.035, len: 0.06, pos: V(s * 0.06, -0.12, 0), dir: V(0, -1, 0), outer: K.anod, vanes: 0, seg: 12 });
  // anti-Earth deck
  adapterRing(g, 0.6, [0, H / 2, 0], UP, 0.15); engine(g, [0, H / 2 + 0.05, 0], UP, 1.3);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const p = [sx * (W / 2 - 0.12), H / 2 + 0.01, sz * (D / 2 - 0.12)]; thruster(g, p, V(sx * 0.3, 1, sz * 0.3), 1.6); thruster(g, [p[0], p[1] - 0.14, p[2] + sz * 0.13], V(0, 0.2, sz), 1.6); }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) thruster(g, [sx * (W / 2 + 0.01), yb + 0.2, sz * (D / 2 - 0.25)], V(sx, -0.2, 0), 1.6);
  starTracker(g, [-W / 2 + 0.3, H / 2 + 0.01, -D / 2 + 0.3], V(-0.4, 1, -0.3), 1.2); starTracker(g, [W / 2 - 0.3, H / 2 + 0.01, -D / 2 + 0.3], V(0.4, 1, -0.3), 1.2);
  const ot = grp(g, [-0.6, H / 2, 0.8]); add(ot, gCyl(0.015, 0.015, 0.45, 6), K.alu, [0, 0.22, 0]); add(ot, gCyl(0.07, 0.0, 0.08, 12), K.alu, [0, 0.5, 0]); add(ot, gCyl(0.0, 0.07, 0.08, 12), K.alu, [0, 0.42, 0]);
  return g;
}

// ---- Danuri (KPLO): bus 2.14 x 2.19 x 1.82 m, 6.3 x 3.18 x 2.67 m deployed; two one-panel wings on drives, high-gain dish on a boom
// with a two-axis gimbal; Moon deck (-Y) with LUTI (twin cameras), PolCam (two cameras tilted 45 deg cross-track), KGRS; NASA ShadowCam
// (27 cm x 1.18 m tube) on the side; KMAG fluxgates on a 1.2 m boom raised at 135 deg from the top floor; four 30 N orbit thrusters ----
function danuri() {
  const K = kmat(), g = new THREE.Group(), W = 2.14, H = 2.19, D = 1.82, yb = -H / 2;
  add(g, gCBox(W, H, D, 0.035), K.gold); boxTapes(g, W, H, D, K.amber);
  add(g, gBox(W - 0.08, 0.02, D - 0.08), K.black, [0, yb - 0.01, 0]); add(g, gBox(W - 0.08, 0.02, D - 0.08), K.silver, [0, H / 2 + 0.01, 0]);
  osrPanel(g, 1.0, 0.9, [-0.45, 0.45, D / 2 + 0.002]); osrPanel(g, 1.4, 0.7, [0, 0.6, -D / 2 - 0.002], [0, Math.PI, 0]);
  for (const sx of [-1, 1]) {
    solarWing(g, { n: 1, w: 1.68, l: 1.75, gap: 0.05, yoke: 0.42, s: 0.85, pos: V(sx * (W / 2 + 0.01), 0.3, 0), dir: V(sx, 0, 0), up: V(0, 1, 0.3) });
    const F = grp(g, [sx * (W / 2 + 0.002), 0, 0], [0, sx * Math.PI / 2, 0]); osrPanel(F, 1.2, 0.55, [0, -0.55, 0]);
  }
  // high-gain antenna: root hinge, boom, azimuth/elevation gimbal, 0.9 m dish with feed
  const hb = V(-0.6, H / 2 + 0.02, D / 2 - 0.2), ht = V(-0.6, H / 2 + 0.35, D / 2 + 0.95);
  add(g, gBox(0.16, 0.08, 0.16), K.alu, [hb.x, hb.y + 0.03, hb.z]); beam(g, hb, ht, 0.035, K.tube, 8);
  const gm = grp(g, [ht.x, ht.y, ht.z]); add(gm, gCyl(0.07, 0.07, 0.1, 12), K.alu); for (const s of [-1, 1]) add(gm, gBox(0.02, 0.18, 0.06), K.metal, [s * 0.09, 0.12, 0]);
  reflector(gm, { D: 0.9, depth: 0.13, pos: V(0, 0.22, 0), dir: V(0, 0.5, 1), feed: 'prime', ribs: 6 });
  // Moon deck
  for (const x of [-0.6, -0.36]) { add(g, gCyl(0.09, 0.09, 0.42, 20), K.paint, [x, yb - 0.1, 0.4]); baffle(g, { r: 0.085, len: 0.12, pos: V(x, yb - 0.31, 0.4), dir: V(0, -1, 0), outer: K.black, vanes: 1, seg: 20 }); } // LUTI
  add(g, gCBox(0.5, 0.06, 0.25, 0.01), K.alu, [-0.48, yb - 0.04, 0.4]);
  const pc = grp(g, [0.05, yb - 0.08, -0.45]); add(pc, gCBox(0.24, 0.16, 0.2, 0.01), K.dark); for (const s of [-1, 1]) baffle(pc, { r: 0.04, len: 0.1, pos: V(0, -0.06, s * 0.06), dir: V(0, -1, s), outer: K.anod, vanes: 1, seg: 14 }); // PolCam
  add(g, gCyl(0.15, 0.15, 0.3, 24), K.paint, [0.6, yb - 0.17, -0.35]); add(g, gCyl(0.155, 0.155, 0.04, 24), K.alu, [0.6, yb - 0.03, -0.35]); add(g, gCyl(0.12, 0.12, 0.01, 24), K.dark, [0.6, yb - 0.325, -0.35]); // KGRS
  helix(g, [-0.85, yb - 0.02, -0.6], V(0, -1, 0)); sunSensor(g, [0.85, yb - 0.02, 0.6], V(0, -1, 0));
  // ShadowCam on the +Z side: long tube, sunshade baffle at the Moon end, mounting brackets, electronics box
  const sx = 0.55, sz = D / 2 + 0.18; add(g, gCyl(0.135, 0.135, 0.95, 24), K.silver, [sx, -0.42, sz]);
  baffle(g, { r: 0.14, len: 0.28, pos: V(sx, -0.9, sz), dir: V(0, -1, 0), outer: K.black, vanes: 3, seg: 24 });
  for (const y of [-0.75, -0.1]) add(g, gBox(0.12, 0.08, 0.2), K.alu, [sx, y, D / 2 + 0.06]);
  add(g, gCBox(0.28, 0.2, 0.12, 0.01), K.black, [sx, 0.2, D / 2 + 0.06]);
  // KMAG boom
  const kb = V(0, H / 2 + 0.02, 0), kd = V(-0.55, 0.75, -0.35).normalize(); add(g, gBox(0.12, 0.06, 0.12), K.alu, [0, H / 2 + 0.04, 0]);
  beam(g, kb, kb.clone().addScaledVector(kd, 1.2), 0.016, K.tube); for (const t of [0.45, 0.85, 1.2]) { const p = kb.clone().addScaledVector(kd, t); add(g, gCBox(0.06, 0.06, 0.06, 0.008), K.beta, [p.x, p.y, p.z]); }
  starTracker(g, [0.6, H / 2 + 0.02, -0.55], V(0.25, 1, -0.5)); starTracker(g, [0.85, H / 2 + 0.02, -0.2], V(0.5, 1, -0.2)); helix(g, [0.5, H / 2 + 0.02, 0.6], UP);
  // aft (-Z): adapter ring, four orbit-manoeuvre thrusters, attitude thrusters at the corners
  adapterRing(g, 0.33, [0, -0.2, -D / 2], V(0, 0, -1), 0.1);
  for (const [x, y] of [[0.6, -0.6], [-0.6, -0.6], [0.6, 0.2], [-0.6, 0.2]]) thruster(g, [x, y, -D / 2 - 0.01], V(0, 0, -1), 2.2);
  for (const ax of [-1, 1]) for (const ay of [-1, 1]) { thruster(g, [ax * (W / 2 - 0.1), ay * (H / 2 + 0.01), -D / 2 + 0.12], V(0, ay, 0), 1.3); thruster(g, [ax * (W / 2 + 0.01), ay * (H / 2 - 0.12), -D / 2 + 0.12], V(ax, 0, 0), 1.3); }
  return g;
}

// ---- STSAT / NEXTSAT class microsatellite (100-150 kg): box with body-mounted cells, two hinged panels, camera on the nadir face ----
function microsat() {
  const K = kmat(), g = new THREE.Group(), W = 0.7, H = 0.8, D = 0.6;
  add(g, gCBox(W, H, D, 0.015), K.black);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(g, gBox(0.025, H, 0.025), K.alu, [sx * (W / 2 - 0.008), 0, sz * (D / 2 - 0.008)]);
  for (const sz of [-1, 1]) add(g, gBox(W - 0.06, H - 0.08, 0.006), K.cells, [0, 0, sz * (D / 2 + 0.003)]);
  for (const sx of [-1, 1]) { add(g, gBox(0.006, H * 0.5, D - 0.08), K.gold, [sx * (W / 2 + 0.003), -0.15, 0]);
    solarWing(g, { n: 1, w: 0.62, l: 0.55, gap: 0.02, yoke: 0.12, s: 0.3, pos: V(sx * (W / 2 + 0.006), H / 2 - 0.06, 0), dir: V(sx, 0, 0), up: V(0, 1, 0) }); }
  add(g, gBox(W - 0.03, 0.006, D - 0.03), K.paint, [0, H / 2 + 0.003, 0]); add(g, gBox(W - 0.03, 0.006, D - 0.03), K.gold, [0, -H / 2 - 0.003, 0]);
  baffle(g, { r: 0.075, len: 0.14, pos: V(-0.1, -H / 2, 0), dir: V(0, -1, 0), outer: K.paint, vanes: 2, seg: 20 });
  patch(g, [0.2, -H / 2 - 0.006, 0.15], V(0, -1, 0), 0.05); helix(g, [0.2, -H / 2 - 0.006, -0.15], V(0, -1, 0), 0.7);
  patch(g, [0.15, H / 2 + 0.006, 0.12], UP, 0.05); starTracker(g, [-0.18, H / 2 + 0.006, -0.12], V(-0.3, 1, -0.3), 0.6); sunSensor(g, [0.15, H / 2 + 0.006, -0.15], UP);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) beam(g, V(sx * 0.3, H / 2, sz * 0.25), V(sx * 0.42, H / 2 + 0.38, sz * 0.36), 0.003, K.alu, 4); // UHF monopoles
  const mb = V(W / 2, -H / 2 + 0.05, D / 2); beam(g, mb, mb.clone().add(V(0.3, -0.12, 0.2)), 0.008, K.tube); add(g, gBox(0.04, 0.04, 0.04), K.beta, [mb.x + 0.3, mb.y - 0.12, mb.z + 0.2]);
  return g;
}
// ---- 3U university CubeSat: anodised rails, cells on four faces, two 3U deployable panels, UHF tape antennas, camera ----
function cubesat() {
  const K = kmat(), g = new THREE.Group(), s = 0.1, L = 0.34, h = s / 2 - 0.004;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(g, gBox(0.0085, L, 0.0085), K.alu, [sx * h, 0, sz * h]);
  for (const y of [-1, 1]) add(g, gBox(s - 0.004, 0.004, s - 0.004), K.dark, [0, y * (L / 2 - 0.002), 0]);
  add(g, gBox(s - 0.012, L - 0.01, s - 0.012), K.cfrp);
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; add(g, gBox(0.083, L - 0.02, 0.002), K.cells, [Math.sin(a) * (h + 0.002), 0, Math.cos(a) * (h + 0.002)], [0, a, 0]); }
  for (const sx of [-1, 1]) { const p = grp(g, [sx * (h + 0.004 + 0.16), L / 2 - 0.045, 0]); solarPanel(p, 0.3, 0.083, K.cells, 0.003); add(g, gCyl(0.003, 0.003, 0.06, 6), K.alu, [sx * (h + 0.006), L / 2 - 0.045, 0], [Math.PI / 2, 0, 0]); }
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; beam(g, V(Math.cos(a) * 0.03, -L / 2, Math.sin(a) * 0.03), V(Math.cos(a) * 0.2, -L / 2 - 0.01, Math.sin(a) * 0.2), 0.0015, K.alu, 4); }
  add(g, gCyl(0.02, 0.02, 0.02, 16), K.anod, [0.015, -L / 2 - 0.012, 0.015]); add(g, gCyl(0.013, 0.013, 0.002, 16), K.glass, [0.015, -L / 2 - 0.023, 0.015]);
  add(g, gBox(0.04, 0.004, 0.04), K.beta, [-0.02, L / 2 + 0.002, -0.02]);
  return g;
}

const BUILDERS = {
  // ---- deep-space missions added with their real trajectories (JPL Horizons) ----
  // Cassini: 6.8 m stack - 4 m high-gain dish on top, bus and propulsion module, Huygens probe on the side, three RTGs, 11 m magnetometer boom
  'Cassini'() {
    const g = new THREE.Group();
    dish(g, 4.0, 0.55, M.white(), 0, 0, 2.6, new THREE.Vector3(0, 0, 1));
    cyl(g, 0.85, 1.6, M.gold(), 'z', 0, 0, 1.4, 10);
    cyl(g, 0.65, 3.2, M.gold(), 'z', 0, 0, -0.9, 16);
    cyl(g, 0.35, 0.6, M.dark(), 'z', 0, 0, -2.8, 12);
    const hy = new THREE.Mesh(new THREE.ConeGeometry(1.35, 0.6, 24), std(0xb87a3a, 0.6, 0.5)); hy.rotation.z = -Math.PI / 2; hy.position.set(1.35, 0, -0.3); g.add(hy); // Huygens heat shield
    for (const a of [0.6, 2.6, 4.3]) cyl(g, 0.2, 1.1, M.dark(), 'z', Math.cos(a) * 0.95, Math.sin(a) * 0.95, -2.2, 8); // RTGs
    boom(g, 11, new THREE.Vector3(-1, 0.15, 0), new THREE.Vector3(-0.8, 0, 1.6));
    return g;
  },
  // Rosetta: 2.8 x 2.1 x 2 m box, two 14 m five-panel wings (32 m span), 2.2 m dish, Philae lander on one face
  'Rosetta'() {
    const g = new THREE.Group();
    box(g, 2.8, 2.0, 2.1, M.gold());
    for (const s of [-1, 1]) wing(g, 5, 2.6, 2.25, s, 1.45, 0, 0, 0.1);
    dish(g, 2.2, 0.35, M.white(), 0, 1.4, 0.9, new THREE.Vector3(0, 0.3, 1));
    box(g, 1.0, 0.8, 0.8, M.silver(), 0, -1.4, 0);
    return g;
  },
  // Dawn: 1.6 m bus, two long wings (19.7 m span), three xenon ion engines, 1.5 m dish
  'Dawn'() {
    const g = new THREE.Group();
    box(g, 1.64, 1.27, 1.77, M.gold());
    for (const s of [-1, 1]) wing(g, 5, 1.6, 2.27, s, 0.85, 0, 0, 0.05);
    dish(g, 1.52, 0.22, M.white(), 0, 0, 1.0, new THREE.Vector3(0, 0, 1));
    for (const x of [-0.45, 0, 0.45]) cyl(g, 0.17, 0.25, M.dark(), 'z', x, 0, -1.0, 16);
    return g;
  },
  // MESSENGER: bus behind a 2.5 x 2 m ceramic-cloth sunshade, two 1.5 x 1.65 m wings, 3.6 m magnetometer boom
  'MESSENGER'() {
    const g = new THREE.Group();
    box(g, 1.4, 1.27, 1.85, M.gold());
    box(g, 2.5, 2.05, 0.1, std(0xeeeae0, 0.05, 0.85), 0, 0, -1.15);
    for (const s of [-1, 1]) wing(g, 1, 1.5, 1.65, s, 0.75, 0, 0);
    boom(g, 3.6, new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, -0.65, 0.4));
    return g;
  },
  // OSIRIS-REx: 2.4 m box, two wings (6.2 m span), 2 m dish, TAGSAM sampling arm and the return capsule
  'OSIRIS-REx'() {
    const g = new THREE.Group();
    box(g, 2.4, 2.4, 3.15, M.white());
    for (const s of [-1, 1]) wing(g, 1, 1.8, 1.6, s, 1.25, 0.6, 0);
    dish(g, 2.0, 0.3, M.white(), 0, 0, 1.8, new THREE.Vector3(0, 0, 1));
    boom(g, 3.35, new THREE.Vector3(0.2, -1, -0.4), new THREE.Vector3(0.3, -1.2, -0.6), 0.04);
    cyl(g, 0.4, 0.5, std(0x9a6a40, 0.3, 0.6), 'y', -0.6, 1.4, -0.6, 20);
    return g;
  },
  // Hayabusa2: 1 x 1.6 x 1.25 m box, two wings (6 m span), flat high-gain antenna, sampler horn underneath
  'Hayabusa2'() {
    const g = new THREE.Group();
    box(g, 1.6, 1.25, 1.0, M.gold());
    for (const s of [-1, 1]) wing(g, 3, 0.75, 1.0, s, 0.85, 0, 0, 0.05);
    box(g, 0.9, 0.05, 0.9, M.white(), 0, 0.68, 0.1);
    const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.15, 1.0, 12), M.silver()); horn.position.set(0, -1.1, 0); g.add(horn);
    return g;
  },
  // DART: 1.2 m box, two Roll-Out Solar Arrays (8.5 m each, 19 m span), DRACO camera, LICIACube riding along
  'DART'() {
    const g = new THREE.Group();
    box(g, 1.2, 1.3, 1.3, M.gold());
    for (const s of [-1, 1]) { const arr = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.03, 2.4), [M.frame(), M.frame(), solarMat(), M.dark(), M.frame(), M.frame()]); arr.position.x = s * 4.9; g.add(arr);
      cyl(g, 0.12, 2.4, M.frame(), 'z', s * 9.15, 0, 0, 10); }
    cyl(g, 0.21, 0.6, M.dark(), 'z', 0, 0, 0.95, 16);
    box(g, 0.1, 0.2, 0.3, solarMat(), 0.4, 0.75, -0.4);
    return g;
  },
  // Ulysses: 3.2 x 3.3 x 2.1 m box, 1.65 m dish on top, one RTG on a short arm, 5.6 m radial boom
  'Ulysses'() {
    const g = new THREE.Group();
    box(g, 3.2, 2.1, 3.3, M.white());
    dish(g, 1.65, 0.25, M.white(), 0, 0, 1.75, new THREE.Vector3(0, 0, 1));
    cyl(g, 0.22, 1.2, M.dark(), 'x', 2.4, 0, 0, 8);
    boom(g, 5.6, new THREE.Vector3(-1, 0, 0), new THREE.Vector3(-1.6, 0, 0));
    return g;
  },
  // ---- Korean satellites: built procedurally from published facts and photos (no open 3D models of them exist); see the kit above ----
  // KOMPSAT-3 / 3A (Arirang 3, 3A): 3.5 m tall, 2.0 m across, ~1 t; hexagonal bus with three deployable panels (1.3 kW); AEISS Korsch
  // telescope (80 cm mirror, envelope 1.3 x 2.1 m) in the module below, looking at nadir; 3A adds the IR scanner; X-band antenna on a
  // pointing mechanism; two star trackers. Sources: eoPortal "KOMPSAT-3", Gunter's Space Page "KOMPSAT 3/3A", KARI photos and renders.
  'KOMPSAT'() { return bake(opticalLEO({ R: 1.0, hb: 1.75, R2: 0.72, hp: 1.35, ap: 0.47, baf: 0.32, pw: 0.95, pl: 1.6, yTop: 1.6, ring: 0.47, deploy: 1.05, st: 1.0, ir: true })); },
  // KOMPSAT-5 (Arirang 5): ~1.4 t, 2.6 m across x 3.7 m; modular KOMPSAT-2-heritage hexagonal bus; COSI X-band SAR (active phased array,
  // TAS-I); two wings of four silicon panels on booms with SADA drives (1.4 kW EOL); AOPOD GPS antennas and laser retro-reflector.
  // Sources: eoPortal "KOMPSAT-5", Wikipedia "KOMPSAT-5", Gunter's Space Page, KARI / TAS-I artist's views.
  'KOMPSAT-5'() { return bake(kompsat5()); },
  // GEO-KOMPSAT-2A / 2B (Cheollian 2A/2B): KARI GK2 bus, 3.4-3.5 t; a single south-side wing (KARI: one-wing attitude control from 2A on);
  // 2A: AMI imager (338 kg, 27 cm aperture) with Earth shade and north-facing cooler, KSEM particle detector and SOSMAG 1 m boom, L/S/X links;
  // 2B: GOCI-II (1.5 x 1.0 x 0.9 m sensor, 2-axis pointing) and GEMS. Sources: eoPortal "GEO-KOMPSAT-2", Gunter's Space Page, KARI/KMA
  // fact sheets, Money Today 2020 article on GK2B's single solar wing, KARI photos.
  'GEO-KOMPSAT'(variant = 'A') { return bake(geoKompsat(variant)); },
  'GEO-KOMPSAT-B'() { return bake(geoKompsat('B')); },
  // Koreasat (Mugunghwa) 5A/6A/7 (Thales Alenia Space Spacebus 4000; Koreasat 6 used Orbital's Star-2 bus but the same overall layout of
  // box + two wings + E/W reflectors): sources: Thales Alenia Space Spacebus 4000 descriptions, Gunter's Space Page "Koreasat 5A/7", KT SAT renders.
  'Koreasat'() { return bake(koreasat()); },
  // CAS500-1/2 (next-generation medium satellite): 500-540 kg standard KARI platform, Korsch telescope with a 60 cm primary
  // (0.5 m pan / 2 m MS), modelled on the same KARI optical layout as KOMPSAT-3 at about 3/4 scale.
  // Sources: eoPortal "CAS500", Wikipedia "CAS500", KARI photos. The panel layout is the least certain part of this model.
  'CAS500'() { return bake(opticalLEO({ R: 0.75, hb: 1.2, R2: 0.56, hp: 1.0, ap: 0.33, baf: 0.24, pw: 0.7, pl: 1.1, yTop: 1.1, ring: 0.33, deploy: 1.05, st: 0.8, ir: false, payMat: kmat().silver })); },
  // STSAT / NEXTSAT / KITSAT microsatellites (KAIST SaTReC): 100-150 kg boxes with body cells and small hinged panels.
  'Microsat'() { return bake(microsat()); },
  // university CubeSats: 3U frame
  'CubeSat'() { return bake(cubesat()); },
  // Solar Orbiter: 2.5 x 3.1 x 2.7 m bus behind a 3.1 x 2.4 m titanium heat shield, two 3-panel wings (18 m span), 4.4 m mag boom
  'Solar Orbiter'() {
    const g = new THREE.Group();
    box(g, 2.5, 2.7, 3.1, M.silver());
    const shield = box(g, 3.1, 2.4, 0.25, std(0x1a1a1a, 0.2, 0.8), 0, 0, -1.8); // faces the Sun (anti-Earth side here)
    box(g, 3.2, 2.5, 0.05, M.white(), 0, 0, -1.65);
    for (const s of [-1, 1]) wing(g, 3, 2.1, 1.2, s, 1.6, 0, -0.3);
    dish(g, 1.1, 0.18, M.white(), 0.6, 1.5, 0.6, new THREE.Vector3(0.3, 0.4, 1));
    boom(g, 4.4, new THREE.Vector3(0, -0.2, 1), new THREE.Vector3(0, -1.2, 1.5));
    thrusters(g, 2.4, 2.6, 3.0);
    return g;
  },
  // BepiColombo cruise stack: transfer module (MTM) with two 14 m wings, Mercury Planetary Orbiter with radiator and 1 long wing, sunshield cone on top
  'BepiColombo'() {
    const g = new THREE.Group();
    box(g, 3.6, 1.8, 3.6, M.silver(), 0, -1.6, 0);                 // MTM
    for (const s of [-1, 1]) wing(g, 5, 2.6, 2.0, s, 1.9, -1.6, 0, 0.1);
    box(g, 2.4, 2.2, 3.9, M.white(), 0, 0.4, 0);                   // MPO with radiator face
    box(g, 0.05, 2.0, 3.6, std(0xdfe4ea, 1, 0.12), 1.23, 0.4, 0);  // radiator
    wing(g, 3, 2.5, 1.6, -1, 1.25, 0.6, 0, 0.08);
    dish(g, 1.0, 0.16, M.white(), 0.6, 1.6, 1.4);
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.2, 1.6, 24, 1, true), std(0xd9d9d9, 0.6, 0.5)); cone.position.y = 2.3; cone.material.side = THREE.DoubleSide; g.add(cone); // MOSIF sunshield
    const mmo = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.9, 8), M.dark()); mmo.position.y = 2.4; g.add(mmo); // Mio, octagonal
    return g;
  },
  // Juice: 4.1 x 2.85 x 4.35 m bus, 10 panels in two cross-shaped wings (85 m², ~27 m span), 2.5 m HGA, 10.6 m mag boom, RIME radar
  'Juice'() {
    const g = new THREE.Group();
    box(g, 2.85, 4.1, 4.35, M.gold());
    for (const s of [-1, 1]) {
      const w = wing(g, 5, 2.4, 3.5, s, 1.55, 0, 0, 0.08);
      // two side panels at the third station make the cross shape
      for (const dz of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.035, 2.0), solarMat()); p.position.set(s * (2 * 2.48 + 1.2), 0, dz * 2.8); w.add(p); w.position.x = s * 1.55; }
    }
    dish(g, 2.5, 0.35, M.white(), 0, 1.0, 2.25);
    boom(g, 10.6, new THREE.Vector3(-0.6, 0.15, -1), new THREE.Vector3(-1.2, 1.5, -2));
    boom(g, 16, new THREE.Vector3(0, 0, 1), new THREE.Vector3(1.0, -2.0, -8), 0.03); // RIME dipole
    thrusters(g, 2.7, 4.0, 4.2);
    return g;
  },
  // Europa Clipper: 3 m tall propulsion module, 3 m HGA, two 5-panel wings (30.5 m span), 8.5 m mag boom, REASON HF/VHF radar antennas
  'Europa Clipper'() {
    const g = new THREE.Group();
    cyl(g, 0.8, 3.0, M.silver(), 'z', 0, 0, 0, 20);                    // propulsion module
    box(g, 1.6, 1.6, 1.2, M.gold(), 0, 0, 1.6);                        // electronics vault
    dish(g, 3.0, 0.42, M.white(), 0, 0, 2.3);
    for (const s of [-1, 1]) {
      const w = wing(g, 5, 2.05, 4.1, s, 1.1, 0, 0, 0.1);
      w.rotation.x = 0.0;
    }
    boom(g, 8.5, new THREE.Vector3(0, 1, -0.3), new THREE.Vector3(0, 0.8, -1.2));
    for (const s of [-1, 1]) for (const dz of [-1, 1]) { const r = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.04, 0.06), M.frame()); r.position.set(s * 6.3, 0.06, dz * 2.1); g.add(r); } // REASON HF dipoles along the wing edges
    thrusters(g, 1.4, 1.4, 3.0);
    return g;
  },
  // Lucy: compact bus with two 7.3 m UltraFlex circular arrays, 2 m HGA, instrument pointing platform
  'Lucy'() {
    const g = new THREE.Group();
    box(g, 1.8, 2.2, 1.6, M.gold());
    dish(g, 2.0, 0.28, M.white(), 0, 0.3, 0.95);
    for (const s of [-1, 1]) {
      const fan = new THREE.Group();
      const disc = new THREE.Mesh(new THREE.CircleGeometry(3.65, 10), solarMat()); disc.material.side = THREE.DoubleSide;
      disc.material.map = cellTex.clone(); disc.material.map.repeat.set(5, 5); disc.material.map.needsUpdate = true; disc.rotation.x = -Math.PI / 2; fan.add(disc);
      for (let k = 0; k < 10; k++) { const rib = new THREE.Mesh(new THREE.BoxGeometry(3.65, 0.04, 0.04), M.frame()); const a = k * Math.PI / 5; rib.position.set(Math.cos(a) * 1.82, 0.02, Math.sin(a) * 1.82); rib.rotation.y = -a; fan.add(rib); }
      fan.position.set(s * 4.9, 0, 0); g.add(fan);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.5, 6), M.frame()); arm.rotation.z = Math.PI / 2; arm.position.x = s * 1.6; g.add(arm);
    }
    box(g, 0.9, 0.6, 0.9, M.silver(), 0, -1.4, 0.3);                     // instrument platform
    cyl(g, 0.12, 0.5, M.dark(), 'z', 0.25, -1.4, 0.85); cyl(g, 0.08, 0.4, M.dark(), 'z', -0.25, -1.4, 0.8);
    return g;
  },
  // Psyche: 2.4 x 2.4 x 3.1 m bus, two cross-shaped 5-panel arrays (24.8 m span), HGA, Hall-effect thrusters
  'Psyche'() {
    const g = new THREE.Group();
    box(g, 2.4, 3.1, 2.4, M.silver());
    box(g, 2.45, 1.2, 2.45, M.gold(), 0, 1.0, 0);
    dish(g, 2.0, 0.28, M.white(), 0, 0.2, 1.25);
    for (const s of [-1, 1]) {
      const w = wing(g, 3, 2.3, 2.3, s, 1.4, 0, 0, 0.08);
      for (const dz of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.035, 2.3), solarMat()); p.position.set(s * (1 * 2.38 + 1.15), 0, dz * 2.4); w.add(p); }
    }
    for (const sx of [-0.5, 0.5]) { const t = cyl(g, 0.2, 0.2, M.dark(), 'y', sx, -1.65, 0, 20); const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 6, 20), std(0x6f7cff, 0.2, 0.4, { emissive: 0x3a46ff, emissiveIntensity: 0.6 })); ring.rotation.x = Math.PI / 2; ring.position.set(sx, -1.76, 0); g.add(ring); }
    boom(g, 2.2, new THREE.Vector3(0, 1, 0.2), new THREE.Vector3(0.8, 1.6, 0));
    return g;
  },
  // Danuri (KPLO): sources: eoPortal "KPLO" (payloads, thrusters, KMAG boom), KARI/NASA press kit (2.14 x 1.82 x 2.19 m bus, 6.3 x 3.18 x 2.67 m
  // deployed, 678 kg), NASA ShadowCam pages (118 cm x 27 cm camera), KARI renders and launch photos.
  'Danuri'() { return bake(danuri()); },
  // Tiangong: T-shaped station (Tianhe core with Wentian and Mengtian labs), large solar wings on the labs, ~55 m across
  'Tiangong'() {
    const g = new THREE.Group();
    cyl(g, 2.1, 16.6, M.white(), 'z', 0, 0, 0, 20);                    // Tianhe core
    cyl(g, 2.1, 17.9, M.white(), 'x', 9.5, 0, -8, 20); cyl(g, 2.1, 17.9, M.white(), 'x', -9.5, 0, -8, 20); // Wentian, Mengtian
    cyl(g, 1.5, 3, M.gold(), 'z', 0, 0, -9, 16);                        // node
    for (const s of [-1, 1]) { const w = wing(g, 4, 6.5, 3.2, s, 18.5, 0, -8, 0.15); w.rotation.x = Math.PI / 2; }
    for (const s of [-1, 1]) wing(g, 2, 4.5, 2.5, s, 2.3, 0, 6, 0.1);   // core's own smaller wings
    return g;
  },
  // generic lander for sites without a public model: deck, four legs with pads, antenna mast
  // Nuri (KSLV-II): 47.2 m, three stages (KARI published figures). Stage 1: 3.5 m across, 21.6 m, four clustered 75-tonne KRE-075 engines
  // under a base heat shield; stage 2: 2.9 m, one vacuum 75-tonne engine with a long nozzle; stage 3: 2.6 m, one 7-tonne engine, under a 2.6 m ogive fairing.
  // White painted tanks with panel and weld lines, grey separation rings, two cable raceways, feed and pressurisation lines, umbilical plates,
  // the national flag and "대한민국" written down the first stage. Built along +Y with the base at y = 0; userData.stages lets the launch replay drop each part.
  'Nuri'() {
    const g = new THREE.Group(), SEG = 64;
    const skin = (rows, cols, seed) => { // painted aluminium: faint panel seams, weld rings and a slight mottling, also used as a bump map
      const cv = document.createElement('canvas'); cv.width = 512; cv.height = 1024; const x = cv.getContext('2d');
      x.fillStyle = '#f3f3f0'; x.fillRect(0, 0, 512, 1024); let s = seed; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
      for (let k = 0; k < 2200; k++) { const v = 236 + r() * 14; x.fillStyle = `rgba(${v},${v},${v - 2},0.35)`; x.fillRect(r() * 512, r() * 1024, 2 + r() * 8, 2 + r() * 8); }
      x.strokeStyle = 'rgba(150,152,156,0.55)'; x.lineWidth = 1.2;
      for (let k = 1; k < rows; k++) { x.beginPath(); x.moveTo(0, k * 1024 / rows); x.lineTo(512, k * 1024 / rows); x.stroke(); }
      x.strokeStyle = 'rgba(165,167,170,0.35)'; for (let k = 0; k < cols; k++) { x.beginPath(); x.moveTo(k * 512 / cols, 0); x.lineTo(k * 512 / cols, 1024); x.stroke(); }
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 8; return t; };
    const paint = (rows, cols, seed) => { const t = skin(rows, cols, seed); return std(0xffffff, 0.05, 0.5, { map: t, bumpMap: t, bumpScale: 0.6 }); };
    const grey = std(0x9a9da3, 0.55, 0.45), dark = std(0x2a2c31, 0.4, 0.55), alu = std(0xb9bcc2, 0.85, 0.3), copper = std(0x8a5a3c, 0.8, 0.35);
    const nozzleM = std(0x2e2b2a, 0.75, 0.4, { side: THREE.DoubleSide }), hotM = std(0x6b4a3a, 0.7, 0.45, { side: THREE.DoubleSide });
    const tube = (parent, r, len, mat, x, y, z, seg = SEG) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat); m.position.set(x, y + len / 2, z); parent.add(m); return m; };
    const ring = (parent, r, h, mat, y, r2 = r) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r2, h, SEG), mat); m.position.y = y + h / 2; parent.add(m); return m; };
    const bell = (parent, rt, re, len, x, y, z, mat) => { // a bell nozzle from its throat to the exit, opening downward from y
      const pts = []; for (let k = 0; k <= 18; k++) { const t = k / 18; pts.push(new THREE.Vector2(rt + (re - rt) * Math.pow(t, 0.62), -len * t)); }
      const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 40), mat); m.position.set(x, y, z); parent.add(m);
      for (const t of [0.12, 0.4, 0.75]) { const rr = rt + (re - rt) * Math.pow(t, 0.62), b = new THREE.Mesh(new THREE.TorusGeometry(rr + 0.012, 0.018, 6, 40), dark); b.rotation.x = Math.PI / 2; b.position.set(x, y - len * t, z); parent.add(b); } // cooling-jacket bands
      return m; };
    const engine = (parent, x, y, z, size, vac) => { // combustion chamber, turbopump, gimbal struts, nozzle
      const e = new THREE.Group(); e.position.set(x, y, z); parent.add(e);
      tube(e, 0.2 * size, 0.55 * size, copper, 0, -0.55 * size, 0, 24);
      const tp = new THREE.Mesh(new THREE.CylinderGeometry(0.13 * size, 0.13 * size, 0.42 * size, 16), alu); tp.rotation.z = Math.PI / 2; tp.position.set(0.3 * size, -0.25 * size, 0); e.add(tp); // turbopump
      const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * size, 0.07 * size, 0.7 * size, 10), dark); ex.position.set(0.42 * size, -0.75 * size, 0.1 * size); e.add(ex); // turbine exhaust
      for (const a of [0.5, 2.6, 4.7]) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.025 * size, 0.025 * size, 0.6 * size, 6), alu); s.position.set(Math.cos(a) * 0.17 * size, -0.05 * size, Math.sin(a) * 0.17 * size); s.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35); e.add(s); } // gimbal struts
      bell(e, 0.16 * size, (vac ? 0.82 : 0.58) * size, (vac ? 2.6 : 1.55) * size, 0, -0.55 * size, 0, vac ? hotM : nozzleM);
      return e; };
    const lettering = () => { // the national flag above "대한민국", written top to bottom as on the rocket
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 1280; const x = cv.getContext('2d');
      x.clearRect(0, 0, 256, 1280);
      x.save(); x.translate(128, 120); x.fillStyle = '#ffffff'; x.fillRect(-100, -67, 200, 134); x.strokeStyle = 'rgba(0,0,0,0.25)'; x.lineWidth = 2; x.strokeRect(-100, -67, 200, 134);
      x.rotate(Math.atan2(2, 3)); x.beginPath(); x.arc(0, 0, 33, Math.PI, 0); x.fillStyle = '#cd2e3a'; x.fill(); x.beginPath(); x.arc(0, 0, 33, 0, Math.PI); x.fillStyle = '#0047a0'; x.fill();
      x.beginPath(); x.arc(-16.5, 0, 16.5, 0, Math.PI); x.fillStyle = '#cd2e3a'; x.fill(); x.beginPath(); x.arc(16.5, 0, 16.5, Math.PI, 0); x.fillStyle = '#0047a0'; x.fill(); x.restore();
      x.fillStyle = '#111'; for (const [dx, dy, a] of [[-64, -42, -0.98], [64, -42, 0.98], [-64, 42, 0.98], [64, 42, -0.98]]) { x.save(); x.translate(128 + dx, 120 + dy); x.rotate(a); for (let k = -1; k <= 1; k++) x.fillRect(-16, k * 8 - 2.5, 32, 5); x.restore(); }
      x.fillStyle = '#16181d'; x.font = '900 170px "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", "Pretendard Variable", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      [...'대한민국'].forEach((ch, k) => x.fillText(ch, 128, 360 + k * 220));
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
    // ---- stage 1: 0-21.6 m
    const s1 = new THREE.Group(); g.add(s1);
    ring(s1, 1.82, 1.4, grey, 0, 1.78); // aft skirt
    const shield = new THREE.Mesh(new THREE.CylinderGeometry(1.78, 1.78, 0.12, SEG), dark); shield.position.y = 0.3; s1.add(shield); // base heat shield
    for (const [x, z] of [[0.82, 0.82], [-0.82, 0.82], [0.82, -0.82], [-0.82, -0.82]]) engine(s1, x, 0.32, z, 1.0, false);
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4, f = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.8, 0.35), grey); f.position.set(Math.cos(a) * 1.86, 0.9, Math.sin(a) * 1.86); f.rotation.y = -a; s1.add(f); } // engine-bay fairings
    tube(s1, 1.75, 20.2, paint(6, 12, 3), 0, 1.4, 0);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(1.756, 1.756, 10.5, 32, 1, true, 0.2, 1.0), new THREE.MeshStandardMaterial({ map: lettering(), transparent: true, roughness: 0.5, metalness: 0.05, depthWrite: false })); band.position.y = 15.6; s1.add(band); // above the bulkhead ring at 9.6 m // faces +X+Z
    ring(s1, 1.765, 0.35, grey, 9.6); // LOX/kerosene common bulkhead area
    // ---- interstage and stage 2: 21.6-33.3 m
    const s2 = new THREE.Group(); g.add(s2);
    ring(s2, 1.48, 2.0, grey, 21.6, 1.76); // conical interstage
    engine(s2, 0, 23.0, 0, 0.95, true); // vacuum engine, inside the interstage until stage 1 drops
    tube(s2, 1.45, 9.3, paint(4, 10, 5), 0, 23.6, 0);
    ring(s2, 1.47, 0.4, grey, 32.9);
    // ---- stage 3, payload and fairing: 33.3-47.2 m
    const s3 = new THREE.Group(); g.add(s3);
    ring(s3, 1.3, 0.6, grey, 33.3, 1.45);
    engine(s3, 0, 33.9, 0, 0.42, true);
    tube(s3, 1.3, 3.4, paint(2, 8, 7), 0, 33.9, 0);
    ring(s3, 1.32, 0.25, dark, 37.3); // payload adapter ring
    const payload = new THREE.Group(); payload.position.y = 38.2; payload.visible = false; s3.add(payload); // NEXTSat-2, shown once the fairing opens
    payload.add(new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.2, 1.0), foil(0xd6a843, 0.38)));
    const fairing = new THREE.Group(); s3.add(fairing);
    const fm = paint(3, 8, 9);
    for (const side of [0, 1]) { // two shells with a visible split line
      const h = new THREE.Group(); fairing.add(h);
      const cylH = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 4.5, 32, 1, true, side * Math.PI + 0.004, Math.PI - 0.008), fm); cylH.position.y = 39.85; h.add(cylH);
      const pts = []; for (let k = 0; k <= 24; k++) { const t = k / 24; pts.push(new THREE.Vector2(1.3 * Math.sqrt(Math.max(0, 1 - Math.pow(t, 1.6))) * (1 - 0.05 * t), 5.3 * t)); }
      const nose = new THREE.Mesh(new THREE.LatheGeometry(pts, 32, side * Math.PI + 0.004, Math.PI - 0.008), fm); nose.position.y = 42.1; h.add(nose);
      h.userData.side = side; }
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), grey); cap.position.y = 47.4; fairing.add(cap);
    // ---- along the whole stack: two cable raceways, feed and pressurisation lines, umbilical plates, antennas
    for (const a of [Math.PI * 1.15, Math.PI * 1.85]) for (const [y0, y1, r] of [[1.4, 21.6, 1.75], [23.6, 32.9, 1.45], [33.9, 37.3, 1.3]]) {
      const part = y0 < 21 ? s1 : y0 < 33 ? s2 : s3, race = new THREE.Mesh(new THREE.BoxGeometry(0.26, y1 - y0, 0.14), std(0xe4e4e0, 0.1, 0.55));
      race.position.set(Math.cos(a) * (r + 0.07), (y0 + y1) / 2, Math.sin(a) * (r + 0.07)); race.rotation.y = -a; part.add(race); }
    { const a = Math.PI * 0.55; tube(s1, 0.09, 9.0, alu, Math.cos(a) * 1.86, 1.4, Math.sin(a) * 1.86, 12); // kerosene feed line past the LOX tank
      for (const y of [3, 6, 9]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.22), grey); b.position.set(Math.cos(a) * 1.8, y, Math.sin(a) * 1.8); b.rotation.y = -a; s1.add(b); } }
    for (const [part, y, r] of [[s1, 18.5, 1.75], [s2, 30.5, 1.45], [s3, 35.5, 1.3]]) { const a = Math.PI * 1.5, p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.08), dark); p.position.set(Math.cos(a) * (r + 0.03), y, Math.sin(a) * (r + 0.03)); p.rotation.y = -a + Math.PI / 2; part.add(p); } // umbilical plates
    for (const [part, y, r] of [[s2, 31.5, 1.45], [s3, 36.5, 1.3]]) { const a = Math.PI * 0.3, ant = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.35, 8), dark); ant.position.set(Math.cos(a) * (r + 0.15), y, Math.sin(a) * (r + 0.15)); ant.rotation.z = -Math.PI / 2; ant.rotation.y = -a; part.add(ant); }
    g.userData.stages = { s1, s2, s3, fairing, payload };
    g.userData.length = 47.2;
    return g;
  },
  'lander'() {
    const g = new THREE.Group();
    cyl(g, 0.9, 0.5, M.gold(), 'y', 0, 1.0, 0, 8);
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + 0.785, leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6), M.frame());
      leg.position.set(Math.cos(a) * 0.9, 0.5, Math.sin(a) * 0.9); leg.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); g.add(leg);
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.05, 12), M.frame()); pad.position.set(Math.cos(a) * 1.25, 0.03, Math.sin(a) * 1.25); g.add(pad);
    }
    cyl(g, 0.03, 1.0, M.frame(), 'y', 0.3, 1.75, 0); dish(g, 0.6, 0.1, M.white(), 0.3, 2.25, 0, new THREE.Vector3(0.3, 1, 0.2));
    return g;
  },
};
export function buildCraft(name) { const b = BUILDERS[name]; return b ? b() : null; }
