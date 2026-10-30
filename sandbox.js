// Space Commons sandbox: an N-body copy of the solar system to experiment with, and orbital-mechanics labs
// (circular and escape speed, Hohmann transfer, porkchop plots, flyby design, multi-flyby mission design, Lagrange points).
// Units inside: AU, day, solar mass, ecliptic J2000 axes (z = ecliptic north). Opened from app.js with a small context.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as O from './orbits.js';
import { openCards } from './cards.js';
import * as L2 from './labs2.js';

const { dot, cross, norm, add, scale } = O.vec;
const PL = ['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];
const KO = { Sun: '태양', Mercury: '수성', Venus: '금성', Earth: '지구', Mars: '화성', Jupiter: '목성', Saturn: '토성', Uranus: '천왕성', Neptune: '해왕성' };
const COL = { Sun: 0xffe6a6, Mercury: 0xb5aa9c, Venus: 0xe9d29a, Earth: 0x6fa8ff, Mars: 0xe0724a, Jupiter: 0xd9b48a, Saturn: 0xe6d29c, Uranus: 0x9fe0e6, Neptune: 0x6f8dff };
const MASS = { Sun: 1 }; for (const n of PL) MASS[n] = O.BODY[n].mu / O.MU_SUN_KM;
const RADIUS_KM = { Sun: 696000 }; for (const n of PL) RADIUS_KM[n] = O.BODY[n].R;
const fmt = (x, d = 2) => Number.isFinite(x) ? x.toLocaleString('ko-KR', { maximumFractionDigits: d, minimumFractionDigits: d }) : '–';
const fmtDate = (jd) => new Date((jd - 2440587.5) * 864e5).toISOString().slice(0, 10);
const jdOf = (s) => Date.parse(s + 'T12:00:00Z') / 864e5 + 2440587.5;
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

let ctx = null, root = null, renderer, scene, camera, controls, raf = 0, lastNow = 0;
const sim = { t: 0, bodies: [], speed: 10, playing: true, t0: 0, snapshot: null, E0: 0, slow: false };
const view = { focus: null, labels: new Map(), tool: null, preview: null, extras: new THREE.Group() };

// ---------------- ephemeris for the starting state ----------------
const planetState = (name, jd) => { // heliocentric ecliptic position (AU) and velocity (AU/day) from the app's Kepler elements
  if (name === 'Sun') return { r: [0, 0, 0], v: [0, 0, 0] };
  const T = (j) => (j - 2451545.0) / 36525, p = (j) => { const v = ctx.helio(name, T(j)); return [v.x, v.y, v.z]; };
  const a = p(jd - 0.5), b = p(jd + 0.5); return { r: p(jd), v: scale(add(b, a, -1), 1) };
};

// ---------------- N-body engine (kick-drift-kick with an adaptive step) ----------------
function makeBody(name, r, v, opts = {}) {
  const b = { name, ko: opts.ko || KO[name] || name, m: opts.m ?? MASS[name] ?? 0, r: [...r], v: [...v], color: opts.color ?? COL[name] ?? 0xffb454,
    Rkm: opts.Rkm ?? RADIUS_KM[name] ?? 0, test: !(opts.m ?? MASS[name]), ignore: opts.ignore || null, ignoreUntil: opts.ignoreUntil || 0, minD: {}, crashed: false,
    trail: new Float32Array(3 * 2400), tn: 0, lastRec: -1e9 };
  b.kind = opts.kind || (name === 'Sun' ? 'star' : b.test ? 'test' : 'planet');
  if (b.kind === 'star' && !opts.Rkm && name !== 'Sun') b.Rkm = starRadiusKm(b.m);
  if (b.kind === 'star' && opts.color == null && name !== 'Sun') b.color = starColor(b.m);
  return b;
}
function resetSolarSystem(jd, names = ['Sun', ...PL]) {
  view.ref = null; root?.querySelector('.sb-center') && (root.querySelector('.sb-center').textContent = '천체를 두 번 누르면 그 천체가 중심이 됩니다');
  clearScene(); sim.t = jd; sim.bodies = names.map(n => { const s = planetState(n, jd); return makeBody(n, s.r, s.v); });
  // put the Sun so that the barycentre is at rest at the origin
  const P = [0, 0, 0], M = sim.bodies.reduce((a, b) => a + b.m, 0); let C = [0, 0, 0];
  for (const b of sim.bodies) { for (let k = 0; k < 3; k++) { P[k] += b.m * b.v[k]; C[k] += b.m * b.r[k]; } }
  for (const b of sim.bodies) for (let k = 0; k < 3; k++) { b.v[k] -= P[k] / M; b.r[k] -= C[k] / M; }
  sim.t0 = jd; sim.E0 = energy(); snapshot(); buildMeshes();
}
const massive = () => sim.bodies.filter(b => !b.test);
function accel(b, out, list) {
  out[0] = out[1] = out[2] = 0;
  for (const o of list) { if (o === b || (b.ignore === o.name && sim.t < b.ignoreUntil)) continue;
    const dx = o.r[0] - b.r[0], dy = o.r[1] - b.r[1], dz = o.r[2] - b.r[2], d2 = dx * dx + dy * dy + dz * dz, k = O.MU_SUN * o.m / (d2 * Math.sqrt(d2));
    out[0] += k * dx; out[1] += k * dy; out[2] += k * dz; }
}
function stepDt() { // shortest dynamical time between any body and a massive one
  let tmin = 50; const ms = massive();
  for (const b of sim.bodies) { if (b.crashed) continue; for (const o of ms) { if (o === b || (b.ignore === o.name && sim.t < b.ignoreUntil)) continue;
    const d = Math.hypot(o.r[0] - b.r[0], o.r[1] - b.r[1], o.r[2] - b.r[2]), v = Math.hypot(o.v[0] - b.v[0], o.v[1] - b.v[1], o.v[2] - b.v[2]);
    const t = Math.min(Math.sqrt(d * d * d / (O.MU_SUN * (o.m + b.m))), d / Math.max(v, 1e-9)); if (t < tmin) tmin = t; } }
  return 0.015 * tmin;
}
const _a = [0, 0, 0];
function step(dt) {
  const ms = massive(), live = sim.bodies.filter(b => !b.crashed);
  for (const b of live) { accel(b, _a, ms); for (let k = 0; k < 3; k++) b.v[k] += _a[k] * dt / 2; }
  for (const b of live) for (let k = 0; k < 3; k++) b.r[k] += b.v[k] * dt;
  sim.t += dt;
  for (const b of live) { accel(b, _a, ms); for (let k = 0; k < 3; k++) b.v[k] += _a[k] * dt / 2; }
  for (const b of live) if (b.test) for (const o of ms) { // closest approaches and impacts, for the labs
    const d = Math.hypot(o.r[0] - b.r[0], o.r[1] - b.r[1], o.r[2] - b.r[2]) * O.AU_KM;
    if (!(o.name in b.minD) || d < b.minD[o.name].d) b.minD[o.name] = { d, t: sim.t };
    if (o.Rkm && d < captureKm(o) && !(b.ignore === o.name && sim.t < b.ignoreUntil)) { b.crashed = true; b.v = [...o.v]; toast(o.kind === 'bh' ? `${b.ko}이(가) ${o.ko}의 사건의 지평선 안으로 떨어졌습니다` : `${b.ko}이(가) ${o.ko}에 충돌했습니다`); } }
  if (ms.length > 1) encounters(ms);
}
function advance(days) {
  let left = Math.abs(days), n = 0; const dir = Math.sign(days); sim.slow = false;
  while (left > 0 && n < 4000) { const dt = Math.min(stepDt(), left); step(dir * dt); left -= dt; n++; }
  if (left > 0) sim.slow = true; // too many steps for one frame (a close pass): the clock falls behind on purpose
}
function energy() {
  const ms = massive(); let E = 0;
  for (let i = 0; i < ms.length; i++) { const a = ms[i]; E += 0.5 * a.m * dot(a.v, a.v);
    for (let j = i + 1; j < ms.length; j++) { const b = ms[j]; E -= O.MU_SUN * a.m * b.m / Math.hypot(a.r[0] - b.r[0], a.r[1] - b.r[1], a.r[2] - b.r[2]); } }
  return E;
}
function snapshot() { sim.snapshot = { t: sim.t, bodies: sim.bodies.map(b => ({ ...b, r: [...b.r], v: [...b.v], minD: {}, trail: new Float32Array(b.trail.length), tn: 0 })) }; }
function restore() { if (!sim.snapshot) return; clearScene(); sim.t = sim.snapshot.t; sim.bodies = sim.snapshot.bodies.map(b => ({ ...b, r: [...b.r], v: [...b.v], minD: {}, trail: new Float32Array(b.trail.length), tn: 0, lastRec: -1e9 })); sim.E0 = energy(); buildMeshes(); }
const byName = (n) => sim.bodies.find(b => b.name === n);
function addProbe(r, v, opts = {}) { const b = makeBody(opts.name || 'probe' + Date.now(), r, v, { m: 0, ko: opts.ko || '탐사선', color: opts.color ?? 0x4fe3c1, ...opts }); sim.bodies.push(b); buildMesh(b); return b; }

// ---------------- drawing ----------------
const dotTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.9)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
function buildMesh(b) {
  const g = new THREE.Group();
  const bh = b.kind === 'bh', dot = new THREE.Sprite(new THREE.SpriteMaterial({ map: bh ? bhTex : dotTex, color: bh ? 0xffffff : b.color, sizeAttenuation: false, depthTest: false, transparent: true }));
  dot.scale.setScalar(bh ? 0.05 : b.kind === 'star' ? 0.022 + 0.012 * Math.min(2, Math.cbrt(b.m)) : b.test ? (b.frag ? 0.007 : 0.012) : 0.018); dot.renderOrder = 3; g.add(dot);
  if (b.Rkm && !bh) { const s = new THREE.Mesh(new THREE.SphereGeometry(b.Rkm / O.AU_KM, 32, 16), new THREE.MeshBasicMaterial({ color: b.color })); g.add(s); }
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(b.trail, 3)); tg.setDrawRange(0, 0);
  const line = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: b.color, transparent: true, opacity: b.test ? 0.85 : 0.45 })); line.frustumCulled = false;
  scene.add(g, line); b.mesh = g; b.line = line;
  const lb = el('div', 'sb-label' + (b.test ? ' probe' : ''), b.ko); root.querySelector('.sb-labels').append(lb); view.labels.set(b, lb);
}
function buildMeshes() { for (const b of sim.bodies) buildMesh(b); }
function rebuild(b) { scene.remove(b.mesh, b.line); view.labels.get(b)?.remove(); view.labels.delete(b); buildMesh(b); }
const bhTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 10, 64, 64, 64); r.addColorStop(0, 'rgba(0,0,0,1)'); r.addColorStop(0.3, 'rgba(0,0,0,1)'); r.addColorStop(0.36, 'rgba(255,190,110,1)');
  r.addColorStop(0.5, 'rgba(255,120,40,.55)'); r.addColorStop(1, 'rgba(255,90,20,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();

// ---------------- stars, black holes, encounters (Universe-Sandbox style) ----------------
const MSUN_KG = 1.98847e30;
const RS_KM = (m) => 2.9532 * m;                              // Schwarzschild radius, km, m in solar masses
const starRadiusKm = (m) => 696000 * Math.pow(Math.max(m, 0.08), m > 1 ? 0.57 : 0.8); // main-sequence mass-radius
const lum = (b) => b.kind !== 'star' ? 0 : b.m < 0.43 ? 0.23 * Math.pow(b.m, 2.3) : b.m < 2 ? Math.pow(b.m, 4) : 1.4 * Math.pow(b.m, 3.5); // L in suns
function starColor(m) { const T = 5772 * Math.pow(Math.max(m, 0.08), 0.54); return T > 9000 ? 0xaabfff : T > 7000 ? 0xd8e2ff : T > 5500 ? 0xffe6a6 : T > 4000 ? 0xffc27a : 0xff8a5c; }
const captureKm = (o) => o.kind === 'bh' ? 3 * RS_KM(o.m) : o.Rkm; // inside 3 r_s (the innermost stable orbit) material plunges
function encounters(ms) {
  for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) {
    const a = ms[i], b = ms[j]; if (a.dead || b.dead) continue;
    const d = Math.hypot(a.r[0] - b.r[0], a.r[1] - b.r[1], a.r[2] - b.r[2]) * O.AU_KM, big = a.m >= b.m ? a : b, small = big === a ? b : a;
    if (d < captureKm(big) + (small.kind === 'bh' ? captureKm(small) : small.Rkm)) { merge(big, small); continue; }
    // tidal disruption: inside r_t = R (M/m)^(1/3) the bigger body's tide beats the smaller one's self-gravity
    if (small.kind !== 'bh' && small.Rkm && small.m < big.m * 0.5 && d < small.Rkm * Math.cbrt(big.m / small.m) * (big.kind === 'bh' ? 1 : 1.26)) disrupt(small, big);
  }
  if (ms.some(b => b.dead)) { sim.bodies = sim.bodies.filter(b => !b.dead); sim.E0 = energy(); }
}
function merge(big, small) {
  const M = big.m + small.m, vrel = Math.hypot(big.v[0] - small.v[0], big.v[1] - small.v[1], big.v[2] - small.v[2]) * O.KMS * 1e3;
  const E = 0.5 * (big.m * small.m / M) * MSUN_KG * vrel * vrel; // J, in the centre-of-mass frame
  for (let k = 0; k < 3; k++) { big.v[k] = (big.m * big.v[k] + small.m * small.v[k]) / M; big.r[k] = (big.m * big.r[k] + small.m * small.r[k]) / M; }
  big.m = M; if (big.kind === 'bh') big.Rkm = RS_KM(M); else if (big.kind === 'star') { big.Rkm = starRadiusKm(M); } else big.Rkm = Math.cbrt(big.Rkm ** 3 + small.Rkm ** 3);
  if (big.kind === 'planet' && M > 0.08) { big.kind = 'star'; big.Rkm = starRadiusKm(M); big.color = starColor(M); }
  small.dead = true; scene.remove(small.mesh, small.line); view.labels.get(small)?.remove(); view.labels.delete(small); if (selected === small) select(null); rebuild(big);
  if (big.kind === 'planet' && small.kind === 'planet' && small.m > big.m * 0.02) debrisDisk(big, small);
  flash(big.r, 0.08 + 0.05 * Math.log10(1 + E / 1e30)); const mt = E / 4.184e15; toast(`${small.ko}이(가) ${big.ko}와 합쳐졌습니다 · 충돌 에너지 ${E.toExponential(1)} J (TNT ${mt >= 1e6 ? (mt / 1e6).toExponential(1) + '조' : mt.toExponential(1) + '메가'}톤)`);
}
function disrupt(small, big) {
  const N = 90, u = scale(add(small.r, big.r, -1), 1 / norm(add(small.r, big.r, -1))), spread = small.Rkm * 4 / O.AU_KM, vesc = Math.sqrt(2 * O.MU_SUN * small.m / (small.Rkm / O.AU_KM));
  for (let i = 0; i < N; i++) { const t = (i / (N - 1) - 0.5) * 2, j = () => (Math.random() - 0.5);
    const b = makeBody(`${small.name}-f${i}`, add(small.r, add(scale(u, t * spread), [j() * spread * 0.3, j() * spread * 0.3, j() * spread * 0.1])), add(small.v, add(scale(u, t * vesc * 0.5), [j() * vesc * 0.2, j() * vesc * 0.2, 0])), { m: 0, ko: '', color: small.color });
    b.frag = true; sim.bodies.push(b); buildMesh(b); }
  small.dead = true; scene.remove(small.mesh, small.line); view.labels.get(small)?.remove(); view.labels.delete(small); if (selected === small) select(null);
  flash(small.r, 0.06, 0xffb0b0); toast(`${small.ko}이(가) ${big.ko}의 조석력에 부서졌습니다 (로슈 한계 안)`);
}
function debrisDisk(p, imp) { // vaporised mantle flung into orbit: a disk between ~1.5 and 6 planet radii (most falls back, some outside the Roche limit gathers into a moon)
  const R = p.Rkm / O.AU_KM, mu = O.MU_SUN * p.m, n = 160, hdir = Math.sign(cross(add(imp.r, p.r, -1), add(imp.v, p.v, -1))[2] || 1);
  for (let i = 0; i < n; i++) { const r = R * (1.4 + Math.pow(Math.random(), 1.6) * 5), th = Math.random() * 2 * Math.PI, vc = Math.sqrt(mu / r) * (0.92 + Math.random() * 0.1);
    const b = makeBody(`${p.name}-d${i}`, add(p.r, [r * Math.cos(th), r * Math.sin(th), (Math.random() - 0.5) * R * 0.2]), add(p.v, [-Math.sin(th) * vc * hdir, Math.cos(th) * vc * hdir, 0]), { m: 0, ko: '', color: 0xd9c9b0 });
    b.frag = true; sim.bodies.push(b); buildMesh(b); }
}
function toBlackHole(b) {
  b.kind = 'bh'; b.Rkm = RS_KM(b.m); b.color = 0x000000; rebuild(b); sim.E0 = energy();
  toast(`${b.ko}을(를) 같은 질량의 블랙홀로 바꿨습니다 · 사건의 지평선 반지름 ${fmt(b.Rkm, 1)} km. 멀리 있는 행성의 궤도는 그대로입니다 (빛과 열만 사라짐)`);
}
function dominant(r) { let best = null, bs = 0; for (const o of massive()) { const d2 = (o.r[0] - r[0]) ** 2 + (o.r[1] - r[1]) ** 2 + (o.r[2] - r[2]) ** 2, s = o.m / d2; if (s > bs) { bs = s; best = o; } } return best; }
const ADD = { asteroid: { ko: '소행성', m: 0 }, earth: { ko: '새 지구', m: MASS.Earth, Rkm: 6371, color: 0x6fa8ff }, jupiter: { ko: '새 목성', m: MASS.Jupiter, Rkm: 71492, color: 0xd9b48a },
  star: { ko: '새 별', m: 1, kind: 'star' }, reddwarf: { ko: '적색왜성', m: 0.2, kind: 'star' }, bh: { ko: '블랙홀', m: 10, kind: 'bh' } };
function addBody(kind, r, v) {
  const t = ADD[kind], b = makeBody(`${kind}${Date.now()}`, r, v, { ko: t.ko, m: t.m, Rkm: t.kind === 'bh' ? RS_KM(t.m) : t.Rkm, color: t.color, kind: t.kind });
  sim.bodies.push(b); buildMesh(b); sim.E0 = energy(); return b;
}
function circularAt(r) { const o = dominant(r); if (!o) return [0, 0, 0]; const d = add(r, o.r, -1), dn = norm(d), vc = Math.sqrt(O.MU_SUN * o.m / dn); return add(o.v, [-d[1] / dn, d[0] / dn, 0], vc); }

// habitable zones: Kopparapu-style bounds 0.95 and 1.37 sqrt(L) AU
const hzGroup = new THREE.Group();
function updateHZ() {
  hzGroup.visible = root.querySelector('.sb-hz').checked; if (!hzGroup.visible) return;
  const stars = sim.bodies.filter(b => b.kind === 'star' && lum(b) > 1e-4);
  while (hzGroup.children.length < stars.length) { const g = new THREE.RingGeometry(0.95, 1.37, 96); hzGroup.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x4fe3c1, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }))); }
  hzGroup.children.forEach((m, i) => { const s = stars[i]; m.visible = !!s; if (s) { m.position.set(...s.r); m.scale.setScalar(Math.sqrt(lum(s))); } });
}
// Roche limits around the selected body (fluid satellite): d = 2.44 R (rho_primary / rho_satellite)^(1/3)
const rocheGroup = new THREE.Group(); for (const c of [0xff7aa2, 0x9fe0e6]) { const pts = []; for (let i = 0; i <= 128; i++) pts.push(new THREE.Vector3(Math.cos(i / 64 * Math.PI), Math.sin(i / 64 * Math.PI), 0));
  rocheGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: c, dashSize: 0.05, gapSize: 0.04 }))); }
const density = (b) => b.m * MSUN_KG / (4 / 3 * Math.PI * (b.Rkm * 1e3) ** 3); // kg/m^3
const rocheKm = (b, rhoSat) => 2.44 * b.Rkm * Math.cbrt(density(b) / rhoSat);
function updateRoche() {
  const b = selected; rocheGroup.visible = !!b && !b.test && b.kind !== 'bh' && b.Rkm > 0; if (!rocheGroup.visible) return;
  rocheGroup.position.set(...b.r); [3000, 900].forEach((rho, i) => { const l = rocheGroup.children[i]; l.scale.setScalar(rocheKm(b, rho) / O.AU_KM); l.computeLineDistances(); l.material.dashSize = l.material.gapSize = 0.25 * l.scale.x; });
}
const teq = (b) => { let F = 0; for (const s of sim.bodies) if (s.kind === 'star') { const d2 = (s.r[0] - b.r[0]) ** 2 + (s.r[1] - b.r[1]) ** 2 + (s.r[2] - b.r[2]) ** 2; F += lum(s) / d2; } return 255 * Math.pow(F, 0.25); }; // K, albedo 0.3

// ---- seeing more: orbit predictions, velocity arrows, the gravity well, flashes ----
const predGroup = new THREE.Group(), velGroup = new THREE.Group(), flashGroup = new THREE.Group();
const wellGeo = new THREE.PlaneGeometry(1, 1, 90, 90), wellMesh = new THREE.Mesh(wellGeo, new THREE.MeshBasicMaterial({ color: 0x2f4a7a, wireframe: true, transparent: true, opacity: 0.35 })); wellMesh.visible = false; wellMesh.frustumCulled = false;
let predAt = 0;
function updatePredictions(now) {
  predGroup.visible = root.querySelector('.sb-pred').checked; if (!predGroup.visible || now - predAt < 400) return; predAt = now;
  for (const c of predGroup.children) c.geometry.dispose(); predGroup.clear();
  const list = sim.bodies.filter(b => !b.frag && !b.crashed && b.kind !== 'star' && b.kind !== 'bh' || b === selected).slice(0, 40);
  for (const b of list) { const o = dominant(b.r) === b ? null : dominantOther(b); if (!o) continue;
    const r0 = add(b.r, o.r, -1), v0 = add(b.v, o.v, -1), mu = O.MU_SUN * (o.m + b.m), e = O.elements(r0, v0, mu), T = e.e < 1 ? e.period : 3 * norm(r0) / Math.max(norm(v0), 1e-9), pts = [];
    if (!isFinite(T) || T <= 0) continue;
    for (let k = 0; k <= 160; k++) { const st = O.propagate(r0, v0, T * k / 160, mu); pts.push(new THREE.Vector3(...add(st.r, o.r))); }
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: e.e < 1 ? 0x9aa5c0 : 0xff7aa2, transparent: true, opacity: 0.6, dashSize: norm(r0) * 0.04, gapSize: norm(r0) * 0.03 }));
    l.computeLineDistances(); l.frustumCulled = false; predGroup.add(l); }
}
function dominantOther(b) { let best = null, bs = 0; for (const o of massive()) { if (o === b || o.m <= b.m) continue; const d2 = (o.r[0] - b.r[0]) ** 2 + (o.r[1] - b.r[1]) ** 2 + (o.r[2] - b.r[2]) ** 2, s2 = o.m / d2; if (s2 > bs) { bs = s2; best = o; } } return best; }
function updateVelocities() {
  velGroup.visible = root.querySelector('.sb-vel').checked; if (!velGroup.visible) return;
  const list = sim.bodies.filter(b => !b.frag && !b.crashed).slice(0, 40);
  while (velGroup.children.length < list.length) velGroup.add(new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, 0xffb454, 0.25, 0.12));
  velGroup.children.forEach((a, i) => { const b = list[i]; a.visible = !!b; if (!b) return; const o = dominantOther(b), v = o ? add(b.v, o.v, -1) : b.v, sp = norm(v); if (sp < 1e-12) { a.visible = false; return; }
    const d = camera.position.distanceTo(_v.set(...b.r)), len = d * 0.06 * Math.sqrt(sp * O.KMS / 30); a.position.set(...b.r); a.setDirection(new THREE.Vector3(...v).normalize()); a.setLength(len, len * 0.25, len * 0.12); });
}
function updateWell() {
  wellMesh.visible = root.querySelector('.sb-well').checked; if (!wellMesh.visible) return;
  const c = controls.target, span = camera.position.distanceTo(c) * 1.6, pos = wellGeo.attributes.position, ms = massive().filter(b => b.m > 1e-9), soft = span * 0.02;
  wellMesh.position.set(c.x, c.y, 0); wellMesh.scale.set(span, span, 1);
  let ref = 0; for (const b of ms) ref = Math.max(ref, b.m / soft);
  for (let i = 0; i < pos.count; i++) { const x = c.x + pos.getX(i) * span, y = c.y + pos.getY(i) * span; let phi = 0;
    for (const b of ms) phi += b.m / Math.sqrt((x - b.r[0]) ** 2 + (y - b.r[1]) ** 2 + soft * soft);
    pos.setZ(i, -0.25 * Math.sqrt(phi / ref)); }
  pos.needsUpdate = true;
}
function flash(r, size, color = 0xffd27a) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color, transparent: true, blending: THREE.AdditiveBlending, depthTest: false })); sp.position.set(...r); sp.userData = { t: 0, size }; flashGroup.add(sp);
}
function updateFlashes(dt) { for (const f of [...flashGroup.children]) { f.userData.t += dt; const k = f.userData.t / 1.6; f.scale.setScalar(f.userData.size * (0.3 + 2.5 * k)); f.material.opacity = Math.max(0, 1 - k); if (k >= 1) { flashGroup.remove(f); f.material.dispose(); } } }

// ---- making things: an asteroid belt, rings ----
function makeBelt() {
  const star = sim.bodies.filter(b => b.kind === 'star').sort((a, b) => b.m - a.m)[0]; if (!star) return toast('별이 있어야 소행성대를 만들 수 있습니다');
  const N = MOBILE_SB ? 250 : 600, mu = O.MU_SUN * star.m;
  for (let i = 0; i < N; i++) { const a = 1.9 + Math.random() * 1.6, e = Math.random() * 0.12, M = Math.random() * 2 * Math.PI, w = Math.random() * 2 * Math.PI, inc = (Math.random() - 0.5) * 0.15;
    const rr = a * (1 - e * e) / (1 + e * Math.cos(M)), th = M + w, vr = Math.sqrt(mu / (a * (1 - e * e))) * e * Math.sin(M), vt = Math.sqrt(mu / (a * (1 - e * e))) * (1 + e * Math.cos(M));
    const b = makeBody(`ast${Date.now()}-${i}`, add(star.r, [rr * Math.cos(th), rr * Math.sin(th) * Math.cos(inc), rr * Math.sin(th) * Math.sin(inc)]),
      add(star.v, [vr * Math.cos(th) - vt * Math.sin(th), (vr * Math.sin(th) + vt * Math.cos(th)) * Math.cos(inc), (vr * Math.sin(th) + vt * Math.cos(th)) * Math.sin(inc)]), { m: 0, ko: '', color: 0xb5aa9c });
    b.frag = true; b.trail = new Float32Array(3); sim.bodies.push(b); buildMesh(b); b.line.visible = false; }
  toast(`소행성 ${N}개를 2~3.5 AU에 뿌렸습니다. 목성과 공명하는 거리(2.5, 2.82, 2.95, 3.27 AU)에서 수천 년 뒤 틈(커크우드 간극)이 생기는지 보세요`);
}
function makeRing(p) {
  if (p.test || !p.Rkm || p.kind === 'bh' || p.kind === 'star') return toast('행성을 골라 주세요');
  const N = 240, mu = O.MU_SUN * p.m, R = p.Rkm / O.AU_KM, rIn = 1.3 * R, rOut = Math.max(2.6 * R, rocheKm(p, 900) / O.AU_KM * 1.4);
  for (let i = 0; i < N; i++) { const r = rIn + (rOut - rIn) * Math.random(), th = Math.random() * 2 * Math.PI, vc = Math.sqrt(mu / r);
    const b = makeBody(`${p.name}-r${Date.now()}-${i}`, add(p.r, [r * Math.cos(th), r * Math.sin(th), 0]), add(p.v, [-Math.sin(th) * vc, Math.cos(th) * vc, 0]), { m: 0, ko: '', color: 0xe6d29c });
    b.frag = true; b.trail = new Float32Array(3); sim.bodies.push(b); buildMesh(b); b.line.visible = false; }
  focus(p.name, rOut * 6); sim.speed = Math.min(Math.abs(sim.speed), 0.25); toast(`${p.ko} 둘레에 고리 입자 ${N}개. 점선(로슈 한계) 안쪽은 위성으로 뭉치지 못하는 영역입니다`);
}
const MOBILE_SB = matchMedia('(max-width: 640px)').matches;

// ---- saving and sharing a scene ----
const SAVE_KEY = 'space-commons-sandbox-saves';
const loadSaves = () => { try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || []; } catch { return []; } };
const sceneData = () => ({ t: sim.t, bodies: sim.bodies.filter(b => !b.crashed && !b.frag).map(b => ({ name: b.name, ko: b.ko, m: b.m, r: b.r, v: b.v, Rkm: b.Rkm, color: b.color, kind: b.kind })) });
function loadScene(d) {
  clearScene(); sim.t = d.t; sim.bodies = d.bodies.map(x => makeBody(x.name, x.r, x.v, { ko: x.ko, m: x.m, Rkm: x.Rkm, color: x.color, kind: x.kind }));
  buildMeshes(); sim.E0 = energy(); snapshot(); select(null); focus(sim.bodies.find(b => b.kind === 'star')?.name || sim.bodies[0]?.name, 6); toast('장면을 불러왔습니다');
}
function refreshSaves() { const sel = root.querySelector('.sb-loads'); sel.length = 1; loadSaves().forEach((x, i) => sel.append(new Option(`${x.name} (${x.at.slice(0, 16).replace('T', ' ')})`, i))); }
function saveScene() { const name = prompt('장면 이름', `장면 ${loadSaves().length + 1}`); if (!name) return; const l = loadSaves(); l.push({ name, at: new Date().toISOString(), data: sceneData() });
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(l.slice(-20))); toast('이 브라우저에 저장했습니다'); } catch { toast('저장 공간이 부족합니다'); } refreshSaves(); }
async function shareScene() {
  const bytes = new TextEncoder().encode(JSON.stringify(sceneData())), cs = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const buf = new Uint8Array(await new Response(cs).arrayBuffer()); let bin = ''; buf.forEach(x => bin += String.fromCharCode(x));
  const url = `${location.origin}${location.pathname}#sb=${btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
  try { await navigator.clipboard.writeText(url); toast('장면 링크를 복사했습니다. 링크를 연 사람은 같은 장면에서 시작합니다'); } catch { prompt('이 링크를 복사하세요', url); }
}
export async function sceneFromHash() {
  const m = location.hash.match(/sb=([A-Za-z0-9_-]+)/); if (!m) return false;
  try { const bin = atob(m[1].replace(/-/g, '+').replace(/_/g, '/')), u8 = Uint8Array.from(bin, c => c.charCodeAt(0));
    const txt = await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text(); loadScene(JSON.parse(txt)); return true; } catch { toast('장면 링크를 읽지 못했습니다'); return false; }
}

// ---- a live graph of the selected body: distance from what it orbits, and speed ----
const hist = { b: null, pts: [] };
function updateGraph() {
  const cv = root.querySelector('.sb-graph'); if (!selected || root.querySelector('.sb-sel').hidden) return;
  if (hist.b !== selected) { hist.b = selected; hist.pts = []; }
  const o = dominantOther(selected); if (!o) { cv.hidden = true; return; } cv.hidden = false;
  const d = norm(add(selected.r, o.r, -1)), v = norm(add(selected.v, o.v, -1)) * O.KMS, last = hist.pts[hist.pts.length - 1];
  if (!last || Math.abs(sim.t - last[0]) > Math.abs(sim.speed) / 30 + 1e-9) { hist.pts.push([sim.t, d, v]); if (hist.pts.length > 300) hist.pts.shift(); }
  const g = cv.getContext('2d'), W = cv.width, H = cv.height; g.clearRect(0, 0, W, H); g.fillStyle = '#0a0f1c'; g.fillRect(0, 0, W, H); if (hist.pts.length < 2) return;
  const t0 = hist.pts[0][0], t1 = hist.pts[hist.pts.length - 1][0] || t0 + 1;
  const line = (k, col) => { const vs = hist.pts.map(p => p[k]), lo = Math.min(...vs), hi = Math.max(...vs), rg = hi - lo || 1; g.strokeStyle = col; g.lineWidth = 3; g.beginPath();
    hist.pts.forEach((p, i) => { const x = 8 + (p[0] - t0) / (t1 - t0 || 1) * (W - 16), y = H - 10 - (p[k] - lo) / rg * (H - 30); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); return [lo, hi]; };
  const [d0, d1] = line(1, '#8fb8c9'), [v0, v1] = line(2, '#ffb454');
  g.font = '20px "Pretendard Variable", "Malgun Gothic", sans-serif'; g.fillStyle = '#8fb8c9'; g.fillText(`${o.ko}까지 거리 ${fmt(d0, 3)}~${fmt(d1, 3)} AU`, 10, 22); g.fillStyle = '#ffb454'; g.fillText(`속력 ${fmt(v0, 1)}~${fmt(v1, 1)} km/s`, W / 2 + 20, 22);
}

// scenarios
function scenario(key) {
  const jd = ctx.jdNow(); resetSolarSystem(jd); const sun = byName('Sun'), J = byName('Jupiter'); sim.playing = true; sim.speed = 50; select(null);
  if (key === 'nosun') { sun.m = 1e-12; sun.kind = 'test'; rebuild(sun); toast('태양이 사라졌습니다. 행성들은 그 순간의 속도로 곧게 날아갑니다'); sim.speed = 20; }
  if (key === 'sunbh') { toBlackHole(sun); }
  if (key === 'sun2') { sun.m = 2; sun.Rkm = starRadiusKm(2); sun.color = starColor(2); rebuild(sun); toast('태양 질량 2배: 행성들이 더 빨리, 더 안쪽으로 휘어 돕니다. 밝기는 16배'); }
  if (key === 'sunhalf') { sun.m = 0.5; sun.Rkm = starRadiusKm(0.5); sun.color = starColor(0.5); rebuild(sun); toast('태양 질량 절반: 행성들이 느슨해져 멀어지고, 몇몇은 탈출합니다'); }
  if (key === 'jupstar') { J.m = 0.3; J.kind = 'star'; J.Rkm = starRadiusKm(0.3); J.color = starColor(0.3); J.ko = '목성 (적색왜성)'; rebuild(J); toast('목성을 0.3 태양질량의 적색왜성으로: 안쪽 행성들의 궤도가 흔들립니다'); }
  if (key === 'jupx10') { J.m *= 10; rebuild(J); toast('목성 질량 10배: 토성과 화성의 궤도가 서서히 흐트러지는지 보세요'); sim.speed = 200; }
  if (key === 'rogue') { const r = [-120, 18, 2], v = [26 / O.KMS, 0, 0]; addBody('star', r, v).ko = '떠돌이 별'; rebuild(sim.bodies[sim.bodies.length - 1]); toast('1 태양질량의 떠돌이 별이 26 km/s로 지나갑니다'); sim.speed = 400; focus('Sun', 120); return; }
  if (key === 'roguebh') { const r = [-150, 12, 0], v = [30 / O.KMS, 0, 0]; addBody('bh', r, v); toast('10 태양질량 블랙홀이 30 km/s로 태양계를 스쳐 갑니다'); sim.speed = 400; focus('Sun', 120); return; }
  if (key === 'belt') { makeBelt(); sim.speed = 200; focus('Sun', 9); snapshot(); return; }
  if (key === 'theia') {
    clearScene(); sim.bodies = []; const mE = MASS.Earth * 0.9, mT = MASS.Earth * 0.11, RE2 = 6100 / O.AU_KM, RT = 3390 / O.AU_KM;
    sim.bodies.push(makeBody('Earth', [0, 0, 0], [0, 0, 0], { ko: '원시 지구', m: mE, Rkm: 6100, color: 0xd98a5c }));
    const vimp = 9.3 / O.KMS, d = RE2 * 7; // ~ escape speed, grazing: impact parameter ~0.7 of the summed radii
    sim.bodies.push(makeBody('Theia', [-d, (RE2 + RT) * 0.7, 0], [vimp, 0, 0], { ko: '테이아 (화성 크기)', m: mT, Rkm: 3390, color: 0xb5aa9c }));
    buildMeshes(); sim.E0 = energy(); snapshot(); sim.speed = 0.0035; sim.playing = true; focus('Earth', RE2 * 30);
    toast('약 45억 년 전: 화성만 한 천체 테이아가 원시 지구에 비스듬히 부딪힙니다. 튀어 나간 맨틀 물질이 원반을 이루고, 로슈 한계 밖에서 모여 달이 됩니다'); return; }
  if (key === 'binary') { // Kepler-16-like: two stars and a circumbinary planet
    clearScene(); sim.bodies = []; const mA = 0.69, mB = 0.2, a = 0.224, M = mA + mB, vrel = Math.sqrt(O.MU_SUN * M / a);
    sim.bodies.push(makeBody('Sun', [-a * mB / M, 0, 0], [0, -vrel * mB / M, 0], { ko: '별 A (0.69)', m: mA, kind: 'star', Rkm: starRadiusKm(mA), color: starColor(mA) }));
    sim.bodies.push(makeBody('starB', [a * mA / M, 0, 0], [0, vrel * mA / M, 0], { ko: '별 B (0.20)', m: mB, kind: 'star', color: starColor(mB) }));
    const ap = 0.705; sim.bodies.push(makeBody('tatooine', [ap, 0, 0], [0, Math.sqrt(O.MU_SUN * M / ap), 0], { ko: '쌍성 둘레 행성', m: MASS.Saturn, Rkm: 60000, color: 0xe6d29c }));
    const ai = 0.4; sim.bodies.push(makeBody('inner', [-ai, 0, 0], [0, -Math.sqrt(O.MU_SUN * M / ai), 0], { ko: '너무 가까운 행성', m: MASS.Earth, Rkm: 6371, color: 0x6fa8ff }));
    buildMeshes(); sim.E0 = energy(); snapshot(); sim.speed = 10; focus('Sun', 2.5); toast('케플러-16형 쌍성계: 바깥 행성은 안정하고, 쌍성에 너무 가까운 행성은 튕겨 나가거나 부딪힙니다'); return; }
  focus('Sun', key === 'jupx10' ? 25 : 8); snapshot();
}
function clearScene() {
  for (const b of sim.bodies) { if (b.mesh) scene.remove(b.mesh, b.line); b.line?.geometry.dispose(); }
  root?.querySelectorAll('.sb-label').forEach(e => e.remove()); view.labels.clear();
}
function recordTrails(force) {
  const rec = Math.max(0.02, Math.abs(sim.speed) / 90);
  for (const b of sim.bodies) {
    if (!force && Math.abs(sim.t - b.lastRec) < rec) continue; b.lastRec = sim.t;
    if (b.trail.length < 6) continue; const N = b.trail.length / 3; if (b.tn >= N) { b.trail.copyWithin(0, 3); b.tn = N - 1; }
    const rf = relTrailRef(); b.trail.set(rf ? add(b.r, rf.r, -1) : b.r, b.tn * 3); b.tn++; b.line.geometry.setDrawRange(0, b.tn); b.line.geometry.attributes.position.needsUpdate = true;
  }
}
const _v = new THREE.Vector3();
function draw() {
  const f = view.focus && byName(view.focus);
  if (f) { const dx = f.r[0] - controls.target.x, dy = f.r[1] - controls.target.y, dz = f.r[2] - controls.target.z;
    controls.target.set(f.r[0], f.r[1], f.r[2]); camera.position.x += dx; camera.position.y += dy; camera.position.z += dz; }
  controls.update();
  const W = root.clientWidth, H = root.clientHeight;
  const rf = relTrailRef();
  for (const b of sim.bodies) { if (rf) b.line.position.set(...rf.r); else b.line.position.set(0, 0, 0); b.mesh.position.set(b.r[0], b.r[1], b.r[2]); b.mesh.visible = !b.crashed || b.test;
    const lb = view.labels.get(b); _v.set(b.r[0], b.r[1], b.r[2]).project(camera);
    if (_v.z > 1 || Math.abs(_v.x) > 1.1 || Math.abs(_v.y) > 1.1) lb.style.display = 'none';
    else { lb.style.display = ''; lb.style.transform = `translate(${(_v.x + 1) / 2 * W + 8}px, ${(1 - _v.y) / 2 * H - 8}px)`; } }
  renderer.render(scene, camera);
  // status
  const E = energy(), dE = sim.E0 ? Math.abs((E - sim.E0) / sim.E0) : 0;
  root.querySelector('.sb-date').textContent = `${fmtDate(sim.t)} · ${sim.playing ? (sim.speed < 0 ? '역재생 ' : '') + speedLabel(Math.abs(sim.speed)) : '정지'}${sim.slow ? ' · 근접 통과 계산 중 (느려짐)' : ''}`;
  root.querySelector('.sb-energy').textContent = `에너지 보존 오차 ${dE < 1e-12 ? '0' : dE.toExponential(1)}`;
  updateSelected(); labTick(); updateHZ(); updateRoche(); updatePredictions(performance.now()); updateVelocities(); updateWell(); updateGraph();
}
const speedLabel = (s) => s >= 1 ? `1초에 ${s}일` : s * 24 >= 1 ? `1초에 ${Math.round(s * 24)}시간` : `1초에 ${Math.round(s * 1440)}분`;
function loop(now) {
  const dt = Math.min(0.1, (now - lastNow) / 1000); lastNow = now;
  if (sim.playing) { advance(sim.speed * dt); recordTrails(); } updateFlashes(dt);
  draw(); raf = requestAnimationFrame(loop);
}

// ---------------- selection, editing, throwing ----------------
const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
function screenPick(ev) {
  const rc = renderer.domElement.getBoundingClientRect(), x = ev.clientX - rc.left, y = ev.clientY - rc.top; let best = null, bd = 16;
  for (const b of sim.bodies) { _v.set(b.r[0], b.r[1], b.r[2]).project(camera); if (_v.z > 1) continue;
    const d = Math.hypot((_v.x + 1) / 2 * rc.width - x, (1 - _v.y) / 2 * rc.height - y); if (d < bd) { bd = d; best = b; } }
  return best;
}
function planePoint(ev) {
  const rc = renderer.domElement.getBoundingClientRect(); ray.setFromCamera(new THREE.Vector2((ev.clientX - rc.left) / rc.width * 2 - 1, -((ev.clientY - rc.top) / rc.height) * 2 + 1), camera);
  const p = new THREE.Vector3(); return ray.ray.intersectPlane(plane, p) ? [p.x, p.y, 0] : null;
}
let selected = null, drag = null;
function select(b) { selected = b; root.querySelector('.sb-sel').hidden = !b; if (b) { b.base = b.m; root.querySelector('.sb-mass').value = 0; root.querySelector('.sb-massv').textContent = ''; } }
// the reference body: camera centre, distances, speeds, and (optionally) trails are measured from it
function setCenter(b) {
  view.ref = b; select(b); const d = camera.position.distanceTo(controls.target), want = b.Rkm ? Math.max(b.Rkm / O.AU_KM * 30, Math.min(d, 3)) : Math.min(d, 3);
  focus(b.name, want); resetTrails(); root.querySelector('.sb-center').textContent = `지금 중심: ${b.ko} · 다른 천체를 두 번 누르면 바뀝니다`; toast(`${b.ko}을(를) 중심으로 봅니다`);
}
function resetTrails() { for (const b of sim.bodies) { b.tn = 0; b.lastRec = -1e9; b.line?.geometry.setDrawRange(0, 0); } }
const relTrailRef = () => root?.querySelector('.sb-reltrail')?.checked ? refBody() : null;
const refBody = () => (view.ref && sim.bodies.includes(view.ref) ? view.ref : null) || byName('Sun') || sim.bodies.find(b => b.kind === 'star');
function updateSelected() {
  const box = root.querySelector('.sb-sel'); if (!selected || box.hidden) return;
  const b = selected, sun = refBody(), rel = sun ? add(b.r, sun.r, -1) : b.r, vrel = sun ? add(b.v, sun.v, -1) : b.v;
  const host = dominantOther(b), e = host ? O.elements(add(b.r, host.r, -1), add(b.v, host.v, -1), O.MU_SUN * (host.m + (b.test ? 0 : b.m))) : { e: 2 }; // orbit elements about what it actually orbits
  box.querySelector('.sb-sel-name').textContent = b.ko + (b.crashed ? ' (충돌)' : '');
  box.querySelector('.sb-sel-data').innerHTML = (b === sun ? '지금 중심 천체 (다른 천체의 거리와 속도를 이 천체 기준으로 잽니다)<br>' : `${sun?.ko || '중심'}에서 ${fmt(norm(rel), 3)} AU · 속도 ${fmt(norm(vrel) * O.KMS, 2)} km/s<br>` +
    (!host ? '' : e.e < 1 ? `${host.ko} 둘레 궤도: 긴반지름 ${fmt(e.a, e.a < 0.01 ? 6 : 3)} AU · 이심률 ${fmt(e.e, 3)} · 주기 ${e.period < 30 ? fmt(e.period, 2) + '일' : fmt(e.period / 365.25, 2) + '년'}` : `${host.ko}에 묶이지 않은 궤도 (이심률 ${fmt(e.e, 2)})`)) +
    (b.test ? '' : `<br>질량 ${b.m.toExponential(3)} 태양질량`) +
    (b.kind === 'star' ? `<br>밝기 ${fmt(lum(b), 3)} 태양 · 반지름 ${fmt(b.Rkm / 696000, 2)} 태양 · 생명 가능 지대 ${fmt(0.95 * Math.sqrt(lum(b)), 2)}~${fmt(1.37 * Math.sqrt(lum(b)), 2)} AU` : '') +
    (b.kind === 'bh' ? `<br>사건의 지평선 반지름 ${fmt(RS_KM(b.m), 1)} km · 이 안에서는 빛도 탈출 못 함` : '') +
    (!b.test && b.kind !== 'bh' && b.Rkm ? `<br>로슈 한계 (점선): 암석 위성 ${fmt(rocheKm(b, 3000), 0)} km · 얼음 위성 ${fmt(rocheKm(b, 900), 0)} km (평균 밀도 ${fmt(density(b), 0)} kg/m³)` : '') +
    (b.kind === 'planet' ? `<br>평형 온도 ${fmt(teq(b), 0)} K (${fmt(teq(b) - 273.15, 0)} °C, 반사율 0.3)` : '');
  box.querySelector('.sb-bh').hidden = b.test || b.kind === 'bh';
}
function bindEditing() {
  const cv = renderer.domElement;
  cv.addEventListener('pointerdown', (ev) => {
    if (view.tool === 'add' && root.querySelector('.sb-circ').checked) { const p = planePoint(ev); if (p) { const k = root.querySelector('.sb-addkind').value, b = addBody(k, p, circularAt(p)); toast(`${b.ko}을(를) 원 궤도로 놓았습니다`); } setTool(null); return; }
    if (view.tool === 'throw' || view.tool === 'add') { const p = planePoint(ev); if (!p) return; drag = { p, ev, add: view.tool === 'add' }; controls.enabled = false; ev.preventDefault(); return; }
    drag = { click: [ev.clientX, ev.clientY] };
  });
  cv.addEventListener('pointermove', (ev) => {
    if (!drag?.p) return; const q = planePoint(ev); if (!q) return;
    const v = throwVelocity(drag.p, q); showPreview(drag.p, v);
    toolHint(`속도 ${fmt(norm(v.rel) * O.KMS, 1)} km/s · 이 거리의 원 궤도 ${fmt(v.vc * O.KMS, 1)} km/s, 탈출 ${fmt(v.vc * Math.SQRT2 * O.KMS, 1)} km/s`);
  });
  cv.addEventListener('pointerup', (ev) => {
    if (drag?.p) { const q = planePoint(ev); controls.enabled = true; if (q) { const v = throwVelocity(drag.p, q); if (drag.add) addBody(root.querySelector('.sb-addkind').value, drag.p, v.abs); else addProbe(drag.p, v.abs, { ko: '던진 탐사선' }); } clearPreview(); drag = null; setTool(null); return; }
    if (drag?.click && Math.hypot(ev.clientX - drag.click[0], ev.clientY - drag.click[1]) < 4) select(screenPick(ev)); drag = null;
  });
  cv.addEventListener('dblclick', (ev) => { const b = screenPick(ev); if (b) setCenter(b);
  });
}
function throwVelocity(p, q) { // drag length on screen scales against the local circular speed: one AU of drag = the circular speed
  const sun = byName('Sun'), r = norm(add(p, sun.r, -1)), vc = Math.sqrt(O.MU_SUN / r);
  const d = add(q, p, -1), rel = scale(d, vc / Math.max(0.15, r * 0.5));
  return { rel, abs: add(rel, sun.v), vc };
}
function showPreview(r, v) { // ahead 1.5 orbits (or 3 years) on the Sun alone
  clearPreview(); const sun = byName('Sun'), rel0 = add(r, sun.r, -1), e = O.elements(rel0, add(v.abs, sun.v, -1)), T = e.e < 1 ? Math.min(e.period * 1.2, 4000) : 1500, pts = [];
  for (let i = 0; i <= 200; i++) { const s = O.propagate(rel0, add(v.abs, sun.v, -1), T * i / 200); pts.push(new THREE.Vector3(...add(s.r, sun.r))); }
  view.preview = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0x4fe3c1, dashSize: 0.05, gapSize: 0.04 }));
  view.preview.computeLineDistances(); scene.add(view.preview);
}
function clearPreview() { if (view.preview) { scene.remove(view.preview); view.preview.geometry.dispose(); view.preview = null; } }
function setTool(t) { view.tool = t; root.querySelector('.sb-throw').classList.toggle('on', t === 'throw'); root.querySelector('.sb-add').classList.toggle('on', t === 'add');
  toolHint(t === 'throw' || (t === 'add' && !root.querySelector('.sb-circ').checked) ? '궤도면 위를 눌러 위치를 정하고, 끌어서 속도와 방향을 주세요' : t === 'add' ? '궤도면 위를 누르면 그 자리에서 가장 끌어당기는 천체를 도는 원 궤도로 놓습니다' : ''); }
const toolHint = (s) => { root.querySelector('.sb-hint').textContent = s; };
let toastT = 0; function toast(s) { const t = root.querySelector('.sb-toast'); t.textContent = s; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 4000); }

// ---------------- lab records (this browser; export / import as a file) ----------------
const REC_KEY = 'space-commons-labs';
const loadRecs = () => { try { return JSON.parse(localStorage.getItem(REC_KEY)) || []; } catch { return []; } };
const saveRecs = (l) => { try { localStorage.setItem(REC_KEY, JSON.stringify(l)); } catch {} };
function saveRecord(lab, values) { const note = root.querySelector('.sb-note')?.value || ''; const l = loadRecs(); l.push({ lab, at: new Date().toISOString(), simDate: fmtDate(sim.t), values, note }); saveRecs(l); toast('기록지에 저장했습니다'); }
function showRecords() {
  const box = labBox('실습 기록지', '이 브라우저에 저장됩니다. 파일로 내보내 다른 기기에서 불러올 수 있습니다.');
  const l = loadRecs(), ul = el('ul', 'sb-recs');
  if (!l.length) ul.append(el('li', '', '아직 기록이 없습니다. 실습에서 "기록에 저장"을 누르세요.'));
  for (const r of l.slice().reverse()) ul.append(el('li', '', `<b>${r.lab}</b> <span>${r.at.slice(0, 16).replace('T', ' ')} · 시뮬레이션 날짜 ${r.simDate}</span><div>${Object.entries(r.values).map(([k, v]) => `${k}: ${v}`).join(' · ')}</div>${r.note ? `<div class="note">${r.note.replace(/</g, '&lt;')}</div>` : ''}`));
  const row = el('div', 'sb-row'), ex = el('button', '', '파일로 내보내기'), im = el('button', '', '파일 불러오기'), fi = el('input'); fi.type = 'file'; fi.accept = 'application/json'; fi.hidden = true;
  ex.onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(loadRecs(), null, 1)], { type: 'application/json' })); a.download = 'space-commons-labs.json'; a.click(); };
  im.onclick = () => fi.click(); fi.onchange = async () => { try { const add2 = JSON.parse(await fi.files[0].text()); if (Array.isArray(add2)) { saveRecs([...loadRecs(), ...add2]); toast(`${add2.length}개를 불러왔습니다`); showRecords(); } } catch { toast('불러올 수 없는 파일입니다'); } };
  row.append(ex, im, fi); box.append(ul, row);
}

// ---------------- labs ----------------
let lab = null, labCard = null; // { tick() }; the concept card that goes with the lab being opened
const LABS = [['1단계 · 관찰'], ['행성들의 빠르기 비교', () => labSpeeds(), 'keplerlaws'], ['태양 질량을 바꾸면?', () => labSunMass(), 'gravity'],
  ['2단계 · 측정'], ['케플러 2법칙: 같은 시간, 같은 넓이', () => labKepler2(), 'keplerlaws'], ['케플러 3법칙: 주기와 거리', () => labKepler3(), 'keplerlaws'], ['목성의 질량 재기', () => labJupiterMass(), 'gravity'],
  ['3단계 · 계산'], ['원 궤도와 탈출 속도', () => labCircular(), 'twobody'], ['활력 방정식 (vis-viva)', () => labVisViva(), 'visviva'], ['호만 전이 (지구→화성)', () => labHohmann(), 'hohmann'],
  ['4단계 · 설계'], ['발사 시기와 포크찹', () => labPorkchop(), 'lambert'], ['플라이바이 설계', () => labFlyby(), 'flyby'], ['임무 설계 (여러 행성 경유)', () => labMission(), 'flyby'], ['라그랑주점과 트로이', () => labLagrange(), 'cr3bp'],
  ['5단계 · 더 큰 실험'], ['지구 둘레 궤도 설계', () => L2.labOrbitDesign(H2()), 'j2'], ['로켓 발사부터 궤도까지', () => L2.labLaunch(H2()), 'rocket'], ['태양의 일생', () => L2.labSunLife(H2()), 'stellar'],
  ['블랙홀의 빛 휘어짐', () => L2.labLensing(H2()), 'remnants'], ['은하 충돌', () => L2.labGalaxies(H2()), 'galaxy'], ['충돌 파편의 물리', () => L2.labImpact(H2()), 'moon']];
const H2 = () => ({ labBox, steps, field, num, btn, results, deeper, el, fmt }); // helpers for labs2.js
const SCENS = [['nosun', '태양이 사라진다면', '행성들은 그 순간의 속도로 곧게 날아갑니다'], ['sunbh', '태양이 블랙홀이라면', '같은 질량이면 궤도는 그대로, 빛과 열만 사라집니다'], ['sun2', '태양 질량 2배', '더 빨리, 더 좁게 돕니다'], ['sunhalf', '태양 질량 절반', '바깥 행성은 풀려납니다'],
  ['jupstar', '목성이 별이었다면', '0.3 태양질량 적색왜성과 쌍성계'], ['jupx10', '목성 질량 10배', '이웃 행성 궤도가 흔들립니다'], ['rogue', '떠돌이 별이 지나간다면', '태양계 바깥이 흐트러집니다'], ['roguebh', '블랙홀이 지나간다면', '10 태양질량, 30 km/s'],
  ['binary', '쌍성 둘레 행성', '케플러-16형, 안정한 궤도와 불안정한 궤도'], ['theia', '달의 탄생: 거대 충돌', '테이아가 원시 지구에 부딪혀 파편 원반이 생깁니다'], ['belt', '소행성대와 목성', '1,000년 흘려 보내며 커크우드 간극 찾기']];
// formulas: KaTeX (MIT), loaded on first use from jsDelivr
let katexP = null;
function loadKatex() {
  if (katexP) return katexP;
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css'; document.head.append(css);
  katexP = new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js'; sc.onload = res; sc.onerror = rej; document.head.append(sc); });
  return katexP;
}
function renderTex(box) { loadKatex().then(() => { for (const e of box.querySelectorAll('.tex:not([data-done])')) { katex.render(e.textContent, e, { throwOnError: false }); e.dataset.done = 1; } }).catch(() => {}); }
function labBox(title, sub) {
  const box = root.querySelector('.sb-lab'); box.innerHTML = ''; box.hidden = false; lab = null; view.extras.clear(); // drawings from the previous lab
  const x = el('button', 'x', '×'); x.onclick = () => { box.hidden = true; lab = null; }; box.append(x, el('h2', '', title)); if (sub) box.append(el('div', 'small', sub));
  if (labCard) { const c = labCard; box.append(btn('이 실습의 개념 카드 보기 →', () => openCards({ card: c, openLab: (n) => openLab(n) }), 'sb-concept-wide')); labCard = null; }
  renderTex(box); return box;
}
const labTick = () => lab?.tick?.();
function steps(box, list) { const ol = el('ol', 'sb-steps'); for (const s of list) ol.append(el('li', '', s)); box.append(ol); }
function deeper(box, html) { const d = el('details', 'sb-deep'); d.append(el('summary', '', '더 깊이 (전공 심화)')); d.append(el('div', '', html)); box.append(d); renderTex(box); }
function field(box, label, input) { const l = el('label', 'sb-field'); l.append(el('span', '', label), input); box.append(l); return input; }
const num = (v, step = 'any', min, max) => { const i = el('input'); i.type = 'number'; i.value = v; i.step = step; if (min != null) i.min = min; if (max != null) i.max = max; return i; };
const btn = (t, f, cls) => { const b = el('button', cls || '', t); b.onclick = f; return b; };
function results(box) { const t = el('table', 'sb-res'); box.append(t); return (rows) => { t.innerHTML = rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join(''); }; }
function noteAndSave(box, name, values) { const n = el('textarea', 'sb-note'); n.placeholder = '메모 (선택)'; box.append(n); box.append(btn('기록에 저장', () => saveRecord(name, values()), 'sb-save')); }
function freshSystem(jd = sim.t) { resetSolarSystem(jd); }
function focus(name, distAU) { view.focus = name; const b = byName(name); if (!b) return; controls.target.set(...b.r); camera.position.set(b.r[0] + distAU * 0.25, b.r[1] - distAU * 0.8, b.r[2] + distAU * 0.55); }

// ---------------- step 1 and 2 labs: observe, then measure ----------------
function quiz(box, q, opts, ans, why) { // a small multiple-choice check inside a lab
  const c = el('div', 'sb-check'); c.append(el('b', '', '확인 문제'), el('div', '', q)); const fb = el('div', 'small');
  const row = el('div', 'sb-row'); opts.forEach((o, k) => row.append(btn(o, () => { fb.innerHTML = k === ans ? `<span style="color:var(--orbit)">정답입니다.</span> ${why}` : '<span style="color:#ff7aa2">다시 생각해 보세요.</span>'; }))); c.append(row, fb); box.append(c);
}
function lapCounter(names) { // unwrap each planet's longitude about the Sun to count laps and time one full orbit
  const st = {}; for (const n of names) { const b = byName(n), S = byName('Sun'); st[n] = { a0: Math.atan2(b.r[1] - S.r[1], b.r[0] - S.r[0]), acc: 0, last: null, t0: sim.t, T: null }; }
  return () => { const S = byName('Sun'); for (const n of names) { const b = byName(n), q = st[n]; if (!b) continue; const a = Math.atan2(b.r[1] - S.r[1], b.r[0] - S.r[0]);
    if (q.last != null) { let d = a - q.last; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; q.acc += d; } q.last = a;
    if (q.T == null && q.acc >= 2 * Math.PI) q.T = sim.t - q.t0; } return st; };
}

// step 1: which planet is fastest?
function labSpeeds() {
  freshSystem(); sim.playing = true; sim.speed = 20; focus('Sun', 4); const names = ['Mercury', 'Venus', 'Earth', 'Mars'], laps = lapCounter([...names, 'Jupiter']);
  const box = labBox('행성들의 빠르기 비교', '1단계 · 관찰: 태양에서 가까운 행성과 먼 행성 중 어느 쪽이 더 빨리 돌까요?');
  steps(box, ['그냥 지켜보세요. 시간이 1초에 20일씩 흐릅니다.', '아래 표에 행성마다 지금까지 돈 바퀴 수와, 한 바퀴를 다 돈 행성의 공전 주기가 나옵니다.', '수성이 몇 바퀴 도는 동안 지구는 몇 바퀴 도는지 비교해 보세요.']);
  const set = results(box);
  quiz(box, '태양에서 멀리 있는 행성일수록 한 바퀴 도는 데 걸리는 시간은?', ['짧다', '같다', '길다'], 2, '멀수록 길 자체도 길고 속도도 느려서 주기가 훨씬 길어집니다 (케플러 3법칙).');
  noteAndSave(box, '행성들의 빠르기', () => Object.fromEntries(Object.entries(laps()).map(([n, q]) => [KO[n], q.T ? fmt(q.T, 1) + '일' : fmt(q.acc / (2 * Math.PI), 2) + '바퀴'])));
  lab = { tick() { const st = laps(); set(Object.entries(st).map(([n, q]) => { const b = byName(n), S = byName('Sun'), d = norm(add(b.r, S.r, -1)), v = norm(add(b.v, S.v, -1)) * O.KMS;
    return [`${KO[n]} (${fmt(d, 2)} AU)`, `${fmt(q.acc / (2 * Math.PI), 2)}바퀴 · 속도 ${fmt(v, 1)} km/s · 주기 ${q.T ? fmt(q.T, 1) + '일' : '재는 중'}`]; })); } };
}

// step 1: change the Sun's mass
function labSunMass() {
  freshSystem(); sim.playing = true; sim.speed = 20; focus('Sun', 5);
  const box = labBox('태양 질량을 바꾸면?', '1단계 · 관찰: 태양이 더 무겁거나 가벼워지면 행성들은 어떻게 될까요?');
  steps(box, ['아래 막대로 태양 질량을 바꿔 보세요. 행성들의 속도는 그대로인 채 끄는 힘만 바뀝니다.', '무거워지면 궤도가 안쪽으로 휘고, 가벼워지면 바깥으로 풀려 나가는지 보세요.', '"처음으로"를 누르면 다시 시작합니다.']);
  const m = field(box, '태양 질량 (지금 = 1)', el('input')); m.type = 'range'; m.min = 0.2; m.max = 4; m.step = 0.05; m.value = 1; const out = el('b', '', '1.00'); box.append(out);
  m.oninput = () => { const S = byName('Sun'); S.m = +m.value; out.textContent = (+m.value).toFixed(2); sim.E0 = energy(); };
  const set = results(box);
  quiz(box, '태양 질량이 절반이 되면 지구는?', ['더 안쪽으로 떨어진다', '더 먼 타원 궤도로 나가거나 탈출한다', '그대로 돈다'], 1, '끄는 힘이 줄어 지금 속도가 원 궤도 속도보다 커지므로, 바깥으로 늘어난 타원이 되고 절반 이하면 탈출합니다.');
  noteAndSave(box, '태양 질량', () => ({ '태양 질량': m.value }));
  lab = { tick() { const S = byName('Sun'); set(['Earth', 'Mars', 'Jupiter'].map(n => { const b = byName(n), e = O.elements(add(b.r, S.r, -1), add(b.v, S.v, -1), O.MU_SUN * S.m);
    return [KO[n], e.e < 1 ? `이심률 ${fmt(e.e, 2)} · 근일점 ${fmt(e.rp, 2)} · 원일점 ${fmt(e.ra, 2)} AU` : '태양에서 풀려나 날아감']; })); } };
}

// step 2: Kepler's second law, measured
function labKepler2() {
  clearScene(); sim.bodies = [makeBody('Sun', [0, 0, 0], [0, 0, 0], { m: 1, kind: 'star' })]; sim.t = ctx.jdNow(); const e = 0.6, a = 1.6, rp = a * (1 - e), vp = Math.sqrt(O.MU_SUN * (2 / rp - 1 / a));
  const P = makeBody('comet', [rp, 0, 0], [0, vp, 0], { m: 0, ko: '혜성', color: 0x9fe0e6 }); sim.bodies.push(P); buildMeshes(); sim.E0 = 0; snapshot(); sim.playing = true; sim.speed = 10; focus('Sun', 4.5);
  const T = 2 * Math.PI * Math.sqrt(a ** 3 / O.MU_SUN), N = 12, marks = [], t0 = sim.t; let next = 0;
  const box = labBox('케플러 2법칙: 같은 시간, 같은 넓이', '2단계 · 측정: 이심률 0.6인 혜성이 같은 시간 동안 쓸고 지나가는 넓이를 직접 잽니다.');
  steps(box, [`혜성의 공전 주기 ${fmt(T / 365.25, 2)}년을 12등분해, 같은 시간마다 태양-혜성 선이 쓸고 지나간 부채꼴을 색칠합니다.`, '근일점 근처 부채꼴은 짧고 넓고, 원일점 근처는 길고 좁습니다. 아래 표의 넓이를 비교하세요.']);
  const set = results(box), fan = new THREE.Group(); view.extras.add(fan);
  quiz(box, '근일점 근처에서 혜성의 속도는?', ['가장 느리다', '가장 빠르다', '일정하다'], 1, '같은 시간에 같은 넓이를 쓸려면 태양에 가까울 때 더 빨리 움직여야 합니다. 각운동량 보존입니다.');
  noteAndSave(box, '케플러 2법칙', () => ({ '부채꼴 넓이 (AU²)': marks.slice(1).map((m, k) => fmt(m.area, 4)).join(', ') }));
  let path = [];
  lab = { tick() { path.push([...P.r]); if (path.length > 4000) path.shift();
    if (sim.t - t0 >= next * T / N && marks.length <= N) { const prev = marks[marks.length - 1]; let area = 0;
      if (prev) { const seg = path.slice(prev.k); for (let i = 1; i < seg.length; i++) area += 0.5 * Math.abs(seg[i - 1][0] * seg[i][1] - seg[i - 1][1] * seg[i][0]);
        const pts = [new THREE.Vector3(0, 0, 0), ...seg.map(q => new THREE.Vector3(...q))], idx = []; for (let i = 1; i < pts.length - 1; i++) idx.push(0, i, i + 1);
        const g = new THREE.BufferGeometry().setFromPoints(pts); g.setIndex(idx); fan.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: marks.length % 2 ? 0x4fe3c1 : 0xffb454, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }))); }
      marks.push({ k: path.length - 1, area }); next++; if (marks.length > N) { sim.playing = false; toast('한 바퀴를 다 돌았습니다. 넓이를 비교해 보세요'); } }
    const ar = marks.slice(1).map(m => m.area), avg = ar.reduce((x, y) => x + y, 0) / (ar.length || 1);
    set([['부채꼴 수', `${Math.max(0, marks.length - 1)} / ${N}`], ['넓이 (AU²)', ar.map(x => fmt(x, 3)).join(' · ') || '-'], ['평균과의 최대 차이', ar.length ? `${fmt(Math.max(...ar.map(x => Math.abs(x - avg) / avg)) * 100, 2)}%` : '-'], ['이론값 (타원 넓이 / 12)', `${fmt(Math.PI * a * a * Math.sqrt(1 - e * e) / N, 3)} AU²`]]); } };
}

// step 2: Kepler's third law from measured periods
function labKepler3() {
  freshSystem(); sim.playing = true; sim.speed = 50; focus('Sun', 7); const names = ['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter'], laps = lapCounter(names);
  const box = labBox('케플러 3법칙: 주기와 거리', '2단계 · 측정: 행성마다 한 바퀴 걸리는 시간 T와 평균 거리 a를 재서 T²과 a³을 비교합니다.');
  steps(box, ['시간을 흘려 각 행성이 한 바퀴 도는 시간을 잽니다 (목성은 약 12년이라 오래 걸립니다).', '평균 거리 a는 가장 가까울 때와 가장 멀 때의 평균으로 잽니다.', '단위를 년과 AU로 쓰면 모든 행성에서 T²/a³이 거의 1이 됩니다.']);
  const cv = el('canvas', 'sb-vec'); cv.width = 320; cv.height = 180; box.append(cv); const set = results(box), mm = {}; for (const n of names) mm[n] = [1e9, 0];
  quiz(box, '태양에서 4 AU인 소행성의 공전 주기는?', ['4년', '8년', '16년', '64년'], 1, 'T² = a³ = 64 → T = 8년.');
  noteAndSave(box, '케플러 3법칙', () => Object.fromEntries(names.map(n => { const q = laps()[n], a2 = (mm[n][0] + mm[n][1]) / 2; return [KO[n], q.T ? `T ${fmt(q.T / 365.25, 3)}년, a ${fmt(a2, 3)} AU, T²/a³ ${fmt((q.T / 365.25) ** 2 / a2 ** 3, 3)}` : '재는 중']; })));
  lab = { tick() { const st = laps(), S = byName('Sun'); for (const n of names) { const d = norm(add(byName(n).r, S.r, -1)); mm[n][0] = Math.min(mm[n][0], d); mm[n][1] = Math.max(mm[n][1], d); }
    const rows = names.map(n => { const q = st[n], a2 = (mm[n][0] + mm[n][1]) / 2, T = q.T ? q.T / 365.25 : null; return [KO[n], T ? `T ${fmt(T, 3)}년 · a ${fmt(a2, 3)} AU · T²/a³ = ${fmt(T * T / a2 ** 3, 3)}` : `재는 중 (${fmt(q.acc / (2 * Math.PI) * 100, 0)}%)`]; }); set(rows);
    const g = cv.getContext('2d'), W = cv.width, H = cv.height; g.fillStyle = '#0a0f1c'; g.fillRect(0, 0, W, H); const X = (a2) => 30 + Math.log10(a2 / 0.3) / Math.log10(6 / 0.3) * (W - 40), Y = (T) => H - 20 - Math.log10(T / 0.15) / Math.log10(15 / 0.15) * (H - 30);
    g.strokeStyle = '#8fb8c9'; g.beginPath(); g.moveTo(X(0.3), Y(0.3 ** 1.5)); g.lineTo(X(6), Y(6 ** 1.5)); g.stroke(); g.fillStyle = '#9aa5c0'; g.font = '10px "Pretendard Variable", "Malgun Gothic", sans-serif'; g.fillText('log a (AU) →', W - 70, H - 4); g.fillText('↑ log T (년) · 선: T = a^1.5', 4, 12);
    for (const n of names) { const q = st[n]; if (!q.T) continue; const a2 = (mm[n][0] + mm[n][1]) / 2; g.fillStyle = '#ffb454'; g.beginPath(); g.arc(X(a2), Y(q.T / 365.25), 4, 0, 7); g.fill(); g.fillText(KO[n], X(a2) + 6, Y(q.T / 365.25) + 4); } } };
}

// step 2: weigh Jupiter with its moons
function labJupiterMass() {
  clearScene(); sim.t = ctx.jdNow(); const J = makeBody('Jupiter', [0, 0, 0], [0, 0, 0], { ko: '목성', m: MASS.Jupiter, kind: 'planet' }); sim.bodies = [J];
  const MOONS = [['Io', '이오', 421700], ['Europa', '유로파', 671034], ['Ganymede', '가니메데', 1070412], ['Callisto', '칼리스토', 1882709]];
  MOONS.forEach(([n, ko, akm], k) => { const a = akm / O.AU_KM, th = k * 1.7, v = Math.sqrt(O.MU_SUN * MASS.Jupiter / a); sim.bodies.push(makeBody(n, [a * Math.cos(th), a * Math.sin(th), 0], [-Math.sin(th) * v, Math.cos(th) * v, 0], { m: 0, ko, color: 0xd9c9b0 })); });
  buildMeshes(); sim.E0 = 0; snapshot(); sim.playing = true; sim.speed = 0.25; focus('Jupiter', 0.03);
  const st = {}; for (const [n] of MOONS) st[n] = { last: null, acc: 0, t0: sim.t, T: null, a: 0 };
  const box = labBox('목성의 질량 재기', '2단계 · 측정: 1610년 갈릴레이가 본 네 위성의 주기와 거리로 목성의 무게를 잽니다.');
  steps(box, ['네 위성이 한 바퀴 도는 시간 T와 목성까지 거리 a를 잽니다 (1초에 6시간씩 흐릅니다).', '케플러 3법칙을 뉴턴식으로 쓰면 <span class="tex">M = \\frac{4\\pi^2 a^3}{G T^2}</span>입니다.', '위성 넷에서 구한 질량이 같은지, 실제 값 1.898×10²⁷ kg와 맞는지 보세요.']);
  const set = results(box);
  quiz(box, '위성까지 거리가 같고 주기가 절반이라면 행성의 질량은?', ['절반', '2배', '4배', '같다'], 2, 'M ∝ a³/T²이므로 주기가 절반이면 4배입니다.');
  noteAndSave(box, '목성의 질량', () => Object.fromEntries(MOONS.map(([n, ko]) => { const q = st[n]; return [ko, q.T ? `${fmt(4 * Math.PI ** 2 * (q.a * 1.496e11) ** 3 / (6.674e-11 * (q.T * 86400) ** 2) / 1e27, 3)}×10²⁷ kg` : '-']; })));
  lab = { tick() { for (const [n] of MOONS) { const b = byName(n), q = st[n], d = add(b.r, J.r, -1), an = Math.atan2(d[1], d[0]); q.a = norm(d);
      if (q.last != null) { let x = an - q.last; if (x > Math.PI) x -= 2 * Math.PI; if (x < -Math.PI) x += 2 * Math.PI; q.acc += x; } q.last = an; if (q.T == null && q.acc >= 2 * Math.PI) q.T = sim.t - q.t0; }
    set(MOONS.map(([n, ko]) => { const q = st[n]; if (!q.T) return [ko, `재는 중 (${fmt(q.acc / (2 * Math.PI) * 100, 0)}%) · a ${fmt(q.a * O.AU_KM, 0)} km`];
      const M = 4 * Math.PI ** 2 * (q.a * 1.496e11) ** 3 / (6.674e-11 * (q.T * 86400) ** 2); return [ko, `T ${fmt(q.T, 3)}일 · a ${fmt(q.a * O.AU_KM, 0)} km → M = ${fmt(M / 1e27, 3)}×10²⁷ kg`]; })); } };
}

// O-1 circular and escape speed
function labCircular() {
  freshSystem(); sim.playing = true; sim.speed = 20; focus('Sun', 3.2);
  const box = labBox('원 궤도와 탈출 속도', '같은 자리에서 속도만 바꿔 던지면 궤도 모양이 어떻게 달라질까요?');
  steps(box, ['태양에서 1 AU 떨어진 곳(지구 궤도, 지구와는 떨어진 자리)에서 탐사선을 궤도 방향으로 던집니다.', '속도를 바꿔 가며 여러 번 던져, 원 궤도가 되는 속도와 다시 돌아오지 않는 속도를 찾아보세요.', '아래 표에 마지막으로 던진 탐사선의 궤도가 나옵니다.']);
  const v = field(box, '던지는 속도 (km/s)', num(29.8, 0.1, 5, 60));
  const set = results(box);
  box.append(btn('던지기', () => { const E = byName('Earth'), sun = byName('Sun'), th = Math.atan2(E.r[1] - sun.r[1], E.r[0] - sun.r[0]) + Math.PI / 2;
    const r = [sun.r[0] + Math.cos(th), sun.r[1] + Math.sin(th), 0], dir = [-Math.sin(th), Math.cos(th), 0];
    last = addProbe(r, add(sun.v, dir, +v.value / O.KMS), { ko: `${(+v.value).toFixed(1)} km/s` }); }, 'sb-go'));
  let last = null; const vc = Math.sqrt(O.MU_SUN) * O.KMS, ve = vc * Math.SQRT2;
  const check = el('div', 'sb-check'); const g1 = num('', 0.1), g2 = num('', 0.1);
  check.append(el('b', '', '확인 문제'), el('div', '', '원 궤도 속도와 탈출 속도를 km/s로 적어 보세요.')); field(check, '원 궤도 속도', g1); field(check, '탈출 속도', g2);
  check.append(btn('정답 확인', () => { const ok = (g, t) => Math.abs(+g.value - t) / t < 0.03; toast(`${ok(g1, vc) ? '원 궤도 속도 정답' : `원 궤도 속도는 ${fmt(vc, 1)} km/s`} · ${ok(g2, ve) ? '탈출 속도 정답' : `탈출 속도는 ${fmt(ve, 1)} km/s`}`); }));
  box.append(check);
  deeper(box, `활력 방정식(vis-viva) <span class="tex">v^2 = GM\\left(\\frac{2}{r} - \\frac{1}{a}\\right)</span>에서 원 궤도는 a = r 이므로 <span class="tex">v = \\sqrt{GM/r}</span>, 무한히 멀리(a → ∞) 가려면 <span class="tex">v = \\sqrt{2GM/r}</span>로 √2배입니다.
    태양의 GM = 1.327×10¹¹ km³/s², r = 1 AU를 넣으면 ${fmt(vc, 2)} km/s와 ${fmt(ve, 2)} km/s입니다. 궤도 에너지 <span class="tex">\\varepsilon = \\frac{v^2}{2} - \\frac{GM}{r}</span>가 음수면 타원, 0이면 포물선, 양수면 쌍곡선입니다.
    이 샌드박스는 다른 행성의 중력도 계산하므로, 목성 근처를 지나는 궤도는 조금씩 바뀝니다.`);
  noteAndSave(box, '원 궤도와 탈출 속도', () => { const s = last && O.elements(add(last.r, byName('Sun').r, -1), add(last.v, byName('Sun').v, -1)); return { '던진 속도 km/s': v.value, '이심률': s ? fmt(s.e, 3) : '-', '긴반지름 AU': s && s.e < 1 ? fmt(s.a, 3) : '-' }; });
  lab = { tick() { if (!last) return set([['원 궤도 속도 (1 AU)', `${fmt(vc, 2)} km/s`], ['탈출 속도 (1 AU)', `${fmt(ve, 2)} km/s`]]);
    const s = O.elements(add(last.r, byName('Sun').r, -1), add(last.v, byName('Sun').v, -1));
    set([['원 궤도 속도 (1 AU)', `${fmt(vc, 2)} km/s`], ['탈출 속도 (1 AU)', `${fmt(ve, 2)} km/s`], ['마지막 탐사선 궤도', s.e < 1 ? `타원 · 이심률 ${fmt(s.e, 3)}` : '쌍곡선 (탈출)'],
      ['근일점 / 원일점', s.e < 1 ? `${fmt(s.rp, 2)} / ${fmt(s.ra, 2)} AU` : `${fmt(s.rp, 2)} AU / -`], ['주기', s.e < 1 ? `${fmt(s.period / 365.25, 2)}년` : '-']]); } };
}

// O-1b vis-viva: speed against distance along one orbit
function labVisViva() {
  freshSystem(); sim.playing = true; sim.speed = 20; focus('Sun', 3.5);
  const box = labBox('활력 방정식 (vis-viva)', '궤도 위 어디서든 속도는 거리 r과 궤도 크기 a만으로 정해집니다: <span class="tex">v^2 = GM\\left(\\frac{2}{r} - \\frac{1}{a}\\right)</span>');
  steps(box, ['이심률이 큰 타원 궤도에 탐사선을 놓습니다. 근일점과 원일점을 오가며 속도가 바뀝니다.', '매 순간 잰 속도(N체 계산)와 공식으로 구한 속도를 나란히 보고, 그래프에서 점들이 공식 곡선 위에 놓이는지 확인하세요.', '근일점 거리를 바꿔 다시 놓아 보세요.']);
  const q = field(box, '근일점 거리 (AU)', num(0.6, 0.05, 0.2, 3)), Q = field(box, '원일점 거리 (AU)', num(2.4, 0.1, 0.3, 30));
  const cv = el('canvas', 'sb-vec'); cv.width = 320; cv.height = 200; box.append(cv); const set = results(box); let pr = null, pts = [];
  box.append(btn('탐사선 놓기', () => { const sun = byName('Sun'), rp = Math.min(+q.value, +Q.value), ra = Math.max(+q.value, +Q.value), a = (rp + ra) / 2, E = byName('Earth');
    const th = Math.atan2(E.r[1] - sun.r[1], E.r[0] - sun.r[0]) + 2.2, vpk = Math.sqrt(O.MU_SUN * (2 / rp - 1 / a));
    pr = addProbe([sun.r[0] + rp * Math.cos(th), sun.r[1] + rp * Math.sin(th), 0], add(sun.v, [-Math.sin(th), Math.cos(th), 0], vpk), { ko: 'vis-viva 탐사선' }); pr.a0 = a; pts = []; }, 'sb-go'));
  deeper(box, `에너지 보존 <span class="tex">\\frac{v^2}{2} - \\frac{GM}{r} = \\varepsilon</span>와 타원 궤도의 에너지 <span class="tex">\\varepsilon = -\\frac{GM}{2a}</span>를 합치면 활력 방정식이 나옵니다.
    근일점 속도 <span class="tex">v_p = \\sqrt{GM\\left(\\frac{2}{r_p} - \\frac{1}{a}\\right)}</span>, 원일점 속도 v_a의 비는 <span class="tex">\\frac{v_p}{v_a} = \\frac{r_a}{r_p}</span>(각운동량 보존, 케플러 2법칙)입니다.
    호만 전이, 탈출 속도, 플라이바이의 v∞ 계산이 모두 이 식에서 나옵니다. 시뮬레이션의 점이 곡선에서 살짝 벗어나는 것은 다른 행성(특히 목성)의 섭동 때문입니다.`);
  noteAndSave(box, '활력 방정식', () => ({ '근일점 AU': q.value, '원일점 AU': Q.value, '측정점 수': pts.length, '최대 오차 %': pts.length ? fmt(Math.max(...pts.map(p => Math.abs(p[1] - p[2]) / p[2] * 100)), 2) : '-' }));
  lab = { tick() { if (!pr) return set([['안내', '"탐사선 놓기"를 누르세요']]); const sun = byName('Sun'), r = norm(add(pr.r, sun.r, -1)), v = norm(add(pr.v, sun.v, -1)) * O.KMS, vf = Math.sqrt(O.MU_SUN * (2 / r - 1 / pr.a0)) * O.KMS;
    if (!pts.length || Math.abs(pts[pts.length - 1][0] - r) > 0.01) pts.push([r, v, vf]); if (pts.length > 400) pts.shift();
    set([['거리 r', `${fmt(r, 3)} AU`], ['잰 속도', `${fmt(v, 2)} km/s`], ['공식 √(GM(2/r − 1/a))', `${fmt(vf, 2)} km/s`], ['차이', `${fmt((v - vf) / vf * 100, 2)}%`], ['궤도 에너지 v²/2 − GM/r', `${fmt((v / O.KMS) ** 2 / 2 * 1e4 - O.MU_SUN / r * 1e4, 4)} ×10⁻⁴ AU²/일²`]]);
    const g = cv.getContext('2d'), W = cv.width, H = cv.height, r0 = Math.min(+q.value, +Q.value) * 0.9, r1 = Math.max(+q.value, +Q.value) * 1.05, vmax = Math.sqrt(O.MU_SUN * (2 / r0 - 1 / pr.a0)) * O.KMS * 1.05;
    const X = (x) => 30 + (x - r0) / (r1 - r0) * (W - 40), Y = (y) => H - 20 - y / vmax * (H - 30);
    g.clearRect(0, 0, W, H); g.strokeStyle = '#8fb8c9'; g.lineWidth = 2; g.beginPath(); for (let i = 0; i <= 60; i++) { const x = r0 + (r1 - r0) * i / 60, y = Math.sqrt(Math.max(0, O.MU_SUN * (2 / x - 1 / pr.a0))) * O.KMS; i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)); } g.stroke();
    g.fillStyle = '#ffb454'; for (const p of pts) g.fillRect(X(p[0]) - 1.5, Y(p[1]) - 1.5, 3, 3);
    g.fillStyle = '#c9d1e6'; g.font = '10px "Pretendard Variable", "Malgun Gothic", sans-serif'; g.fillText('속도 km/s ↑', 2, 10); g.fillText('거리 r (AU) →', W - 80, H - 4); g.fillText('초록: 공식 · 주황: 잰 값', 34, 22); } };
}

// O-2 Hohmann transfer Earth -> Mars. Default: the textbook model (circular, coplanar, massless planets) so the
// simulation must reproduce the formulas; the real solar system stays one click away.
function labHohmann() {
  const AE = 1, AM = O.BODY.Mars.a, mu = O.MU_SUN, h = O.hohmann(AE, AM), dv1 = h.dv1 * O.KMS, dv2 = h.dv2 * O.KMS, tof = h.tof;
  const nM = Math.sqrt(mu / AM ** 3), nE = Math.sqrt(mu / AE ** 3), phase = Math.PI - nM * tof; // Mars must lead Earth by this much at launch
  clearScene(); sim.bodies = []; sim.t = ctx.jdNow();
  const circ = (name, a, th, opts) => makeBody(name, [a * Math.cos(th), a * Math.sin(th), 0], [-Math.sin(th) * Math.sqrt(mu / a), Math.cos(th) * Math.sqrt(mu / a), 0], opts);
  sim.bodies.push(makeBody('Sun', [0, 0, 0], [0, 0, 0], { m: 1, kind: 'star' }));
  sim.bodies.push(circ('Earth', AE, 0, { m: 0, ko: '지구', color: COL.Earth, kind: 'planet' }), circ('Mars', AM, phase + 1.1, { m: 0, ko: '화성', color: COL.Mars, kind: 'planet' }));
  buildMeshes(); sim.E0 = energy(); snapshot(); sim.playing = true; sim.speed = 20; focus('Sun', 4.2);
  const box = labBox('호만 전이: 지구에서 화성으로', '교과서 모형: 태양 둘레를 같은 평면에서 원으로 도는 지구(1 AU)와 화성(1.524 AU). 시뮬레이션이 수식과 같은 답을 내는지 확인합니다.');
  steps(box, ['<b>발사 창 기다리기</b>: 화성이 지구보다 정확히 앞선 각도(아래 표의 "필요한 위상각")에 올 때까지 기다립니다. 지구와 화성이 다시 그 배치가 되는 데는 약 2년 2개월(회합 주기)이 걸립니다.',
    `<b>Δv₁ 분사</b>: 지구 궤도 속도 29.78 km/s에 ${fmt(dv1, 2)} km/s를 더해 근일점 1 AU, 원일점 1.524 AU인 전이 타원에 오릅니다.`,
    `<b>도착</b>: ${fmt(tof, 1)}일 뒤 원일점에서 화성을 만납니다. 그때 탐사선은 화성보다 ${fmt(dv2, 2)} km/s 느리므로, 그만큼 더 분사해야 화성 궤도에 머뭅니다.`]);
  const set = results(box); let probe = null, launchT = 0, arrived = null, waiting = false;
  const lon = (b) => Math.atan2(b.r[1], b.r[0]), lead = () => (((lon(byName('Mars')) - lon(byName('Earth'))) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const wait = btn('발사 창까지 기다리기', () => { waiting = true; sim.playing = true; sim.speed = 50; toast('화성이 알맞은 자리에 올 때까지 시간을 돌립니다'); });
  const go = btn('발사 (Δv₁ 분사)', () => { const E = byName('Earth'), r = norm(E.r), t = [-E.r[1] / r, E.r[0] / r, 0];
    probe = addProbe(E.r, scale(t, Math.sqrt(mu / r) + dv1 / O.KMS), { ko: '전이 탐사선' }); launchT = sim.t; arrived = null; sim.playing = true; sim.speed = 20; }, 'sb-go');
  box.append(wait, go, btn('실제 태양계로 해 보기 (타원·기울기·행성 중력)', () => { labCard = 'hohmann'; labHohmannReal(); }));
  deeper(box, `전이 궤도의 긴반지름 <span class="tex">a_t = \\frac{r_1 + r_2}{2}</span>, 분사량은 활력 방정식으로 <span class="tex">\\Delta v_1 = \\sqrt{\\mu\\left(\\frac{2}{r_1} - \\frac{1}{a_t}\\right)} - \\sqrt{\\frac{\\mu}{r_1}}</span>,
    <span class="tex">\\Delta v_2 = \\sqrt{\\frac{\\mu}{r_2}} - \\sqrt{\\mu\\left(\\frac{2}{r_2} - \\frac{1}{a_t}\\right)}</span>, 비행 시간은 전이 타원 주기의 절반 <span class="tex">t = \\pi\\sqrt{a_t^3/\\mu}</span>.
    도착 때 만나려면 출발 순간 화성이 <span class="tex">\\theta = \\pi - n_M t</span> = ${fmt(phase * 180 / Math.PI, 1)}° 앞서 있어야 합니다(<span class="tex">n_M</span>은 화성의 평균 각속도).
    이 모형에서는 지구와 화성의 질량을 0으로 두어 태양만 중력을 냅니다. 그래서 N체 적분 결과가 수식과 소수 둘째 자리까지 같아야 하고, 남는 차이는 적분 오차입니다. 실제 태양계 버튼을 누르면 타원 궤도, 궤도면 기울기, 행성 중력 때문에 답이 달라지는 것을 볼 수 있습니다.`);
  noteAndSave(box, '호만 전이 (교과서 모형)', () => ({ 'Δv₁ 수식': fmt(dv1, 3), 'Δv₂ 수식': fmt(dv2, 3), '비행 시간 수식 (일)': fmt(tof, 1), 'Δv₂ 측정': arrived ? fmt(arrived.dv2, 3) : '-', '비행 시간 측정 (일)': arrived ? fmt(arrived.t, 1) : '-', '화성과 거리 (km)': arrived ? fmt(arrived.miss, 0) : '-' }));
  lab = { tick() {
    const need = phase, now = lead(), diff = ((now - need + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
    if (waiting && Math.abs(diff) < 0.004 * Math.max(1, sim.speed / 20)) { waiting = false; sim.playing = false; toast('발사 창입니다. "발사"를 누르세요'); }
    if (waiting && Math.abs(diff) < 0.15) sim.speed = 5;
    if (probe && !arrived) { const r = norm(probe.r), vr = dot(probe.r, probe.v) / r;
      if (sim.t - launchT > tof * 0.5 && vr <= 0) { // aphelion reached
        const M = byName('Mars'), vM = M.v, dv2m = norm(add(vM, probe.v, -1)) * O.KMS; arrived = { t: sim.t - launchT, dv2: dv2m, miss: norm(add(M.r, probe.r, -1)) * O.AU_KM, r };
        sim.playing = false; toast('원일점에 도착했습니다. 수식과 비교해 보세요'); } }
    const rows = [['', '수식 · 시뮬레이션'], ['Δv₁ (출발)', `${fmt(dv1, 3)} km/s · ${probe ? fmt(dv1, 3) + ' km/s (분사한 값)' : '-'}`],
      ['비행 시간', `${fmt(tof, 1)}일 · ${arrived ? fmt(arrived.t, 1) + '일' : probe ? fmt(sim.t - launchT, 1) + '일째' : '-'}`],
      ['원일점 거리', `${fmt(AM, 3)} AU · ${arrived ? fmt(arrived.r, 4) + ' AU' : '-'}`], ['Δv₂ (도착)', `${fmt(dv2, 3)} km/s · ${arrived ? fmt(arrived.dv2, 3) + ' km/s' : '-'}`],
      ['도착 때 화성과 거리', arrived ? `${fmt(arrived.miss, 0)} km` : '-'], ['필요한 위상각 / 지금', `${fmt(need * 180 / Math.PI, 1)}° / ${fmt(now * 180 / Math.PI, 1)}°`]];
    set(rows); } };
}

// O-2 Hohmann transfer Earth -> Mars
function labHohmannReal() {
  freshSystem(); sim.playing = false; sim.speed = 10; focus('Sun', 4);
  const box = labBox('호만 전이: 지구에서 화성으로', '연료를 가장 적게 쓰는 두 번의 분사로 화성까지 갑니다.');
  const h = O.hohmann(1, O.BODY.Mars.a), dv1 = h.dv1 * O.KMS, dv2 = h.dv2 * O.KMS, tof = h.tof, nM = 360 / (Math.sqrt(O.BODY.Mars.a ** 3) * 365.25), phase = 180 - nM * tof;
  steps(box, [`지구 궤도에서 궤도 방향으로 ${fmt(dv1, 2)} km/s를 더하면, 근일점 1 AU·원일점 ${O.BODY.Mars.a} AU인 전이 궤도에 오릅니다.`,
    `원일점까지 ${fmt(tof, 0)}일이 걸리므로, 출발할 때 화성이 지구보다 ${fmt(phase, 1)}° 앞서 있어야 도착할 때 만납니다.`, '"알맞은 출발일 찾기"로 그날로 가서 발사하고, 화성에 얼마나 가까이 가는지 확인하세요.']);
  const set = results(box); let probe = null, launchT = 0;
  const angle = () => { const E = byName('Earth').r, M = byName('Mars').r; return ((Math.atan2(M[1], M[0]) - Math.atan2(E[1], E[0])) * 180 / Math.PI + 720) % 360; };
  // the real orbits are elliptical: aim the transfer's far end at where Mars will actually be, from where Earth actually is
  const tryDay = (j) => { const E = planetState('Earth', j).r, r1 = Math.hypot(E[0], E[1]), lon = Math.atan2(E[1], E[0]); let rM = O.BODY.Mars.a, t = 0, M;
    for (let k = 0; k < 4; k++) { t = O.hohmann(r1, rM).tof; M = planetState('Mars', j + t).r; rM = Math.hypot(M[0], M[1]); }
    const miss = Math.abs(((Math.atan2(M[1], M[0]) - lon - Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI); return { j, r1, rM, tof: t, miss }; };
  let real = null;
  box.append(btn('알맞은 출발일 찾기', () => { let best = null; for (let d = 0; d < 800; d += 0.5) { const p = tryDay(sim.t + d); if (!best || p.miss < best.miss) best = p; }
    real = best; resetSolarSystem(best.j); focus('Sun', 4); toast(`${fmtDate(best.j)}: 도착할 때 화성이 전이 궤도의 끝(${fmt(best.rM, 3)} AU)에 옵니다`); }));
  box.append(btn('발사 (Δv₁ 분사)', () => { const E = byName('Earth'), sun = byName('Sun'), r = add(E.r, sun.r, -1), r1 = Math.hypot(r[0], r[1]);
    const rM = real && Math.abs(real.j - sim.t) < 1 ? real.rM : O.BODY.Mars.a, t = [-r[1] / r1, r[0] / r1, 0], v = Math.sqrt(O.MU_SUN * (2 / r1 - 2 / (r1 + rM)));
    probe = addProbe(E.r, add(sun.v, t, v), { ko: '전이 탐사선', ignore: 'Earth', ignoreUntil: sim.t + 6 }); probe.dv = (v - norm(add(E.v, sun.v, -1))) * O.KMS; probe.plan = { r1, rM, tof: O.hohmann(r1, rM).tof };
    launchT = sim.t; sim.playing = true; }, 'sb-go'));
  deeper(box, `전이 궤도의 긴반지름 <span class="tex">a_t = \\frac{r_1 + r_2}{2}</span>, 분사량은 활력 방정식으로 <span class="tex">\\Delta v_1 = \\sqrt{GM\\left(\\frac{2}{r_1} - \\frac{1}{a_t}\\right)} - \\sqrt{\\frac{GM}{r_1}}</span>입니다.
    비행 시간은 타원 주기의 절반 <span class="tex">\\pi\\sqrt{a_t^3/GM}</span> = ${fmt(tof, 1)}일. 실제 임무는 지구 저궤도(고도 200 km)에서 출발하므로 지구 탈출까지 포함한 분사량은
    <span class="tex">\\sqrt{v_\\infty^2 + 2\\mu_\\oplus/r} - \\sqrt{\\mu_\\oplus/r}</span> = ${fmt(O.dvDepart(O.BODY.Earth.mu, 6578, dv1), 2)} km/s입니다. 화성 궤도가 타원이고 기울어져 있어서 실제 최적 궤도는 램버트 문제로 구합니다(포크찹 실습).
    시뮬레이션은 지구 탈출 단계를 이미 계산한 것으로 보고, 처음 6일 동안 지구 중력을 빼고 적분합니다(패치드 코닉 근사).`);
  noteAndSave(box, '호만 전이', () => ({ 'Δv₁ km/s': fmt(dv1, 2), 'Δv₂ km/s': fmt(dv2, 2), '비행 시간 일': fmt(tof, 0), '화성 최근접 km': probe?.minD.Mars ? fmt(probe.minD.Mars.d, 0) : '-' }));
  lab = { tick() { const rows = [['Δv₁ (출발)', `${fmt(dv1, 2)} km/s`], ['Δv₂ (도착)', `${fmt(dv2, 2)} km/s`], ['비행 시간', `${fmt(tof, 0)}일`], ['필요한 위상각', `${fmt(phase, 1)}°`], ['지금 위상각', `${fmt(angle(), 1)}°`]];
    if (probe) { const m = probe.minD.Mars; rows.push(['이번 발사 (실제 궤도)', `${fmt(probe.plan.r1, 3)} → ${fmt(probe.plan.rM, 3)} AU · Δv₁ ${fmt(probe.dv, 2)} km/s · ${fmt(probe.plan.tof, 0)}일`], ['발사 후', `${fmt(sim.t - launchT, 0)}일`], ['화성 최근접', m ? `${fmt(m.d / 1e6, 2)}백만 km (${fmt(m.t - launchT, 0)}일째)` : '-']); }
    set(rows); } };
}

// O-3 porkchop plot Earth -> Mars
function labPorkchop() {
  freshSystem(); sim.playing = false; focus('Sun', 4);
  const box = labBox('발사 시기와 포크찹 그림', '언제 출발해서 며칠 만에 도착하느냐에 따라 필요한 에너지가 크게 달라집니다.');
  steps(box, ['가로는 출발일, 세로는 비행 일수입니다. 칸마다 램버트 문제를 풀어 지구를 떠날 때 필요한 에너지 C3(= v∞²)를 색으로 칠했습니다.', '어두운 파란 골짜기가 발사 창입니다. 칸을 눌러 값을 확인하고, 그 궤적으로 발사해 보세요.']);
  const from = field(box, '출발 범위 시작', el('input')); from.type = 'date'; from.value = fmtDate(sim.t);
  const target = field(box, '목적지', el('select')); for (const n of ['Mars', 'Venus', 'Jupiter']) target.append(new Option(KO[n], n));
  const cv = el('canvas', 'sb-pork'); cv.width = 320; cv.height = 220; box.append(cv);
  const info = el('div', 'sb-pinfo', '그림을 계산하는 중…'); box.append(info);
  let grid = null, pick = null;
  const compute = () => {
    const t0 = jdOf(from.value), tgt = target.value, NX = 72, NY = 50, span = tgt === 'Jupiter' ? 1460 : 1100, tofR = tgt === 'Jupiter' ? [500, 1300] : tgt === 'Venus' ? [80, 220] : [120, 420];
    grid = { t0, NX, NY, span, tofR, tgt, c3: new Float32Array(NX * NY), va: new Float32Array(NX * NY) };
    for (let i = 0; i < NX; i++) { const jd = t0 + span * i / (NX - 1), E = planetState('Earth', jd);
      for (let j = 0; j < NY; j++) { const tof = tofR[0] + (tofR[1] - tofR[0]) * j / (NY - 1), M = planetState(tgt, jd + tof), L = O.lambert(E.r, M.r, tof);
        const k = j * NX + i; if (!L) { grid.c3[k] = NaN; continue; } grid.c3[k] = (norm(add(L.v1, E.v, -1)) * O.KMS) ** 2; grid.va[k] = norm(add(L.v2, M.v, -1)) * O.KMS; } }
    const g = cv.getContext('2d'), im = g.createImageData(NX, NY);
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const c = grid.c3[j * NX + i], o = ((NY - 1 - j) * NX + i) * 4;
      const t = isFinite(c) ? Math.min(1, Math.max(0, Math.log(c / 8) / Math.log(120 / 8))) : 1;
      im.data[o] = 20 + 230 * t; im.data[o + 1] = 60 + 140 * (1 - Math.abs(t - 0.45) * 2); im.data[o + 2] = 160 * (1 - t) + 60; im.data[o + 3] = 255; }
    const tmp = document.createElement('canvas'); tmp.width = NX; tmp.height = NY; tmp.getContext('2d').putImageData(im, 0, 0);
    g.imageSmoothingEnabled = true; g.drawImage(tmp, 0, 0, cv.width, cv.height);
    g.fillStyle = '#c9d1e6'; g.font = '10px "Pretendard Variable", "Malgun Gothic", sans-serif'; g.fillText(`${fmtDate(t0)} → ${fmtDate(t0 + span)}`, 4, cv.height - 4); g.fillText(`비행 ${tofR[0]}~${tofR[1]}일 ↑`, 4, 12);
    let bi = 0; grid.c3.forEach((c, k) => { if (c < (grid.c3[bi] || 1e9)) bi = k; });
    info.textContent = `가장 적은 C3: ${fmt(grid.c3[bi], 1)} km²/s² · 출발 ${fmtDate(t0 + span * (bi % NX) / (NX - 1))}, 비행 ${Math.round(tofR[0] + (tofR[1] - tofR[0]) * Math.floor(bi / NX) / (NY - 1))}일. 칸을 눌러 보세요.`;
  };
  cv.onclick = (ev) => { if (!grid) return; const rc = cv.getBoundingClientRect(), i = Math.round((ev.clientX - rc.left) / rc.width * (grid.NX - 1)), j = Math.round((1 - (ev.clientY - rc.top) / rc.height) * (grid.NY - 1));
    const k = j * grid.NX + i, jd = grid.t0 + grid.span * i / (grid.NX - 1), tof = grid.tofR[0] + (grid.tofR[1] - grid.tofR[0]) * j / (grid.NY - 1);
    pick = { jd, tof, c3: grid.c3[k], va: grid.va[k] }; const dv = O.dvDepart(O.BODY.Earth.mu, 6578, Math.sqrt(pick.c3));
    info.innerHTML = `출발 ${fmtDate(jd)} · 비행 ${Math.round(tof)}일 · 도착 ${fmtDate(jd + tof)}<br>C3 ${fmt(pick.c3, 1)} km²/s² · 지구 저궤도에서 Δv ${fmt(dv, 2)} km/s · 도착 v∞ ${fmt(pick.va, 2)} km/s`; };
  box.append(btn('다시 계산', compute), btn('고른 궤적으로 발사', () => { if (!pick) return toast('먼저 그림에서 칸을 고르세요');
    resetSolarSystem(pick.jd); const E = byName('Earth'), sun = byName('Sun'), M = planetState(grid.tgt, pick.jd + pick.tof), L = O.lambert(add(E.r, sun.r, -1), M.r, pick.tof);
    if (!L) return toast('이 칸은 해가 없습니다'); const p = addProbe(E.r, add(L.v1, sun.v), { ko: '발사한 탐사선', ignore: 'Earth', ignoreUntil: sim.t + 6 });
    pork = { p, tgt: grid.tgt, arrive: pick.jd + pick.tof }; sim.speed = 10; sim.playing = true; focus('Sun', grid.tgt === 'Jupiter' ? 12 : 4); }, 'sb-go'));
  let pork = null;
  deeper(box, `램버트 문제: 두 위치 r₁, r₂와 비행 시간 Δt가 주어지면 그 사이를 잇는 케플러 궤도는 (같은 방향으로 한 바퀴 안에서) 하나로 정해집니다.
    여기서는 범용 변수와 스텀프 함수 C(z), S(z)를 쓰는 방법(Curtis 5장, Vallado 알고리즘 58)으로 z를 이분법으로 찾습니다.
    출발 v∞는 탐사선 속도에서 지구 속도를 뺀 크기이고 <span class="tex">C_3 = v_\\infty^2</span>는 발사체가 내야 하는 에너지입니다. 실제 임무는 C3와 도착 v∞를 함께 고려합니다.
    전이각이 180° 근처인 칸은 궤도면이 크게 기울어져야 해서 값이 튑니다(그림의 줄무늬).`);
  noteAndSave(box, '포크찹', () => pick ? { 출발: fmtDate(pick.jd), '비행 일': Math.round(pick.tof), 'C3': fmt(pick.c3, 1), '도착 v∞': fmt(pick.va, 2), '최근접 km': pork?.p.minD[pork.tgt] ? fmt(pork.p.minD[pork.tgt].d, 0) : '-' } : {});
  lab = { tick() { if (pork) { const m = pork.p.minD[pork.tgt]; toolHint(`${KO[pork.tgt]}까지 최근접 ${m ? fmt(m.d / 1e6, 3) + '백만 km' : '-'} · 예정 도착 ${fmtDate(pork.arrive)}`); } } };
  setTimeout(compute, 30);
}

// O-4 flyby design
function labFlyby() {
  freshSystem(); sim.playing = false;
  const box = labBox('플라이바이 설계', '행성 곁을 지나가면 행성 기준 속도는 그대로인데, 태양 기준 속도는 바뀝니다.');
  steps(box, ['행성, 접근 속도 v∞, 최근접 고도, 지나가는 쪽을 정하면 꺾이는 각도와 태양 기준 속도 변화를 계산합니다.', '"샌드박스에서 해 보기"를 누르면 같은 조건으로 탐사선을 실제로 지나가게 해서 계산과 비교합니다.']);
  const planet = field(box, '행성', el('select')); for (const n of ['Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn']) planet.append(new Option(KO[n], n)); planet.value = 'Jupiter';
  const vinf = field(box, '접근 속도 v∞ (km/s)', num(6, 0.1, 0.5, 30)), alt = field(box, '최근접 고도 (km)', num(200000, 100, 100)), ang = field(box, '접근 방향: 행성 진행 방향과의 각도 (°)', num(120, 1, 0, 180));
  const side = field(box, '지나가는 쪽', el('select')); side.append(new Option('반시계 방향으로 꺾임', '1'), new Option('시계 방향으로 꺾임', '-1')); // which way gains depends on the approach: the table says
  const cv = el('canvas', 'sb-vec'); cv.width = 320; cv.height = 200; box.append(cv); const set = results(box);
  let plan = null, test = null;
  const calc = () => {
    const n = planet.value, P = O.BODY[n], Vp = Math.sqrt(O.MU_SUN_KM / (P.a * O.AU_KM)), v = +vinf.value, rp = P.R + +alt.value, f = O.flyby(P.mu, v, rp);
    const th = +ang.value * Math.PI / 180, s = +side.value; // planet frame: planet velocity along +x
    const vin = [v * Math.cos(th), v * Math.sin(th)], rot = s * f.delta, vout = [vin[0] * Math.cos(rot) - vin[1] * Math.sin(rot), vin[0] * Math.sin(rot) + vin[1] * Math.cos(rot)];
    const hin = [Vp + vin[0], vin[1]], hout = [Vp + vout[0], vout[1]], d = Math.hypot(...hout) - Math.hypot(...hin);
    plan = { n, P, Vp, v, rp, f, th, s, vin, vout, hin, hout, d };
    set([['꺾이는 각도 δ', `${fmt(f.delta * 180 / Math.PI, 1)}°`], ['쌍곡선 이심률', fmt(f.e, 3)], ['조준 거리 b', `${fmt(f.b / 1e3, 0)}천 km`], ['최근접 속도', `${fmt(f.vp, 2)} km/s`],
      ['태양 기준 속도', `${fmt(Math.hypot(...hin), 2)} → ${fmt(Math.hypot(...hout), 2)} km/s (${d >= 0 ? '+' : ''}${fmt(d, 2)})`], ['행성 영향권 반지름', `${fmt(P.soi / 1e6, 1)}백만 km`],
      ...(rp < P.R * 1.02 ? [['주의', '최근접 거리가 행성 반지름보다 작습니다 (충돌)']] : [])]);
    // vector diagram: planet velocity, v_inf in/out, heliocentric in/out
    const g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height); const S = 150 / Math.max(Vp + v, 1), ox = 30, oy = 150, L = (x, y, x2, y2, c, w = 2, lab2) => { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.moveTo(ox + x * S, oy - y * S); g.lineTo(ox + x2 * S, oy - y2 * S); g.stroke();
      const a = Math.atan2(-(y2 - y), x2 - x); g.beginPath(); g.moveTo(ox + x2 * S, oy - y2 * S); g.lineTo(ox + x2 * S - 8 * Math.cos(a - 0.4), oy - y2 * S - 8 * Math.sin(a - 0.4)); g.lineTo(ox + x2 * S - 8 * Math.cos(a + 0.4), oy - y2 * S - 8 * Math.sin(a + 0.4)); g.fillStyle = c; g.fill();
      if (lab2) { g.fillStyle = c; g.font = '11px "Pretendard Variable", "Malgun Gothic", sans-serif'; g.fillText(lab2, ox + x2 * S + 4, oy - y2 * S - 4); } };
    L(0, 0, Vp, 0, '#9aa5c0', 2, '행성 속도'); L(Vp, 0, hin[0], hin[1], '#ffb454', 2, 'v∞ 들어옴'); L(Vp, 0, hout[0], hout[1], '#8fb8c9', 2, 'v∞ 나감');
    L(0, 0, hin[0], hin[1], '#ffb454', 1, ''); L(0, 0, hout[0], hout[1], '#8fb8c9', 1, '');
    g.fillStyle = '#c9d1e6'; g.font = '10px "Pretendard Variable", "Malgun Gothic", sans-serif'; g.fillText('가는 선: 태양 기준 속도 (들어옴 · 나감)', 6, 14);
  };
  for (const i of [planet, vinf, alt, ang, side]) i.oninput = i.onchange = calc;
  box.append(btn('샌드박스에서 해 보기', () => { calc(); freshSystem(sim.t); const pl = byName(plan.n), sun = byName('Sun');
    // planet frame axes: x along the planet's heliocentric velocity, y toward the Sun side within the orbit plane, z = orbit normal
    const ex = scale(add(pl.v, sun.v, -1), 1 / norm(add(pl.v, sun.v, -1))), rr = add(pl.r, sun.r, -1), ez = scale(cross(rr, ex), 1 / norm(cross(rr, ex))), ey = cross(ez, ex);
    const vdir = add(scale(ex, Math.cos(plan.th)), ey, Math.sin(plan.th));
    // start exactly on the planned hyperbola, well inside the sphere of influence (incoming leg) so the Sun's tide stays small
    const Dkm = Math.min(plan.P.soi * 0.25, Math.max(plan.rp * 60, plan.P.R * 30)), D = Dkm / O.AU_KM, e = plan.f.e, pp = plan.rp * (1 + e), mu = plan.P.mu, nu = -Math.acos(Math.max(-1, Math.min(1, (pp / Dkm - 1) / e)));
    const ninf = Math.acos(-1 / e), ux = Math.sin(ninf), uy = e - 1 / e, phi = -Math.atan2(uy, ux), nrm = scale(ez, plan.s), e1 = vdir, e2 = cross(nrm, vdir);
    const xh = add(scale(e1, Math.cos(phi)), e2, Math.sin(phi)), yh = cross(nrm, xh), rr2 = pp / (1 + e * Math.cos(nu)), vk = Math.sqrt(mu / pp);
    const start = add(pl.r, add(scale(xh, rr2 * Math.cos(nu)), yh, rr2 * Math.sin(nu)), 1 / O.AU_KM);
    const vin = add(pl.v, add(scale(xh, -vk * Math.sin(nu)), yh, vk * (e + Math.cos(nu))), 1 / O.KMS);
    const Vpv = add(pl.v, sun.v, -1), vi3 = scale(vdir, plan.v / O.KMS), vo3 = add(scale(vi3, Math.cos(plan.f.delta)), cross(nrm, vi3), Math.sin(plan.f.delta));
    test = { p: addProbe(start, vin, { ko: '플라이바이 탐사선' }), pl: plan.n, vdir, D, out: null, t0: sim.t, pin: norm(add(Vpv, vi3)) * O.KMS, pout: norm(add(Vpv, vo3)) * O.KMS };
    sim.speed = plan.n === 'Jupiter' || plan.n === 'Saturn' ? 4 : 0.5; sim.playing = true; focus(plan.n, D * 2.2); }, 'sb-go'));
  deeper(box, `행성 영향권 안에서는 탐사선이 행성 기준 쌍곡선을 그립니다. 이심률 <span class="tex">e = 1 + \\frac{r_p v_\\infty^2}{\\mu}</span>, 꺾이는 각도 <span class="tex">\\delta = 2\\arcsin\\frac{1}{e}</span>입니다.
    행성 기준으로는 들어올 때와 나갈 때 속력 v∞가 같지만 방향이 δ만큼 바뀌고, 태양 기준 속도는 <span class="tex">\\vec v = \\vec V_{\\text{행성}} + \\vec v_\\infty</span>이므로 크기가 달라집니다.
    행성 뒤쪽을 지나면 v∞가 행성 진행 방향으로 꺾여 속도를 얻고, 앞쪽을 지나면 잃습니다. 얻은 에너지는 행성의 공전 에너지에서 나오지만 행성이 너무 무거워 변화는 측정할 수 없을 만큼 작습니다.
    가장 크게 꺾으려면 가까이(r_p 작게), 천천히(v∞ 작게) 지나가야 합니다. 시뮬레이션은 N체 적분이라 태양의 조석력까지 들어가므로 공식과 조금 다릅니다. 탐사선을 영향권 경계(목성은 4,800만 km)에서 출발시키면 지나가는 몇 달 동안 태양 중력이 궤도를 휘게 해서 차이가 커집니다. 그래서 여기서는 행성 중력이 압도적인 거리(영향권의 4분의 1 이내)에서 계획한 쌍곡선 위에 정확히 올려놓고 시작합니다. 이 차이가 바로 패치드 코닉 근사의 한계이고, 실제 임무는 정밀 적분으로 보정합니다.`);
  noteAndSave(box, '플라이바이', () => ({ 행성: KO[plan?.n] || '-', 'v∞ km/s': vinf.value, '고도 km': alt.value, 'δ °': plan ? fmt(plan.f.delta * 180 / Math.PI, 1) : '-', '예측 Δv km/s': plan ? fmt(plan.d, 2) : '-',
    '측정 꺾임 °': test?.out ? fmt(test.out.turn, 1) : '-', '측정 태양 기준 속도 km/s': test?.out ? fmt(test.out.helio, 2) : '-', '측정 최근접 고도 km': test?.out ? fmt(test.out.alt, 0) : '-' }));
  lab = { tick() { if (!test) return; const pl = byName(test.pl), rel = add(test.p.r, pl.r, -1), vrel = add(test.p.v, pl.v, -1), d = norm(rel) * O.AU_KM, m = test.p.minD[test.pl];
    if (!test.out && m && dot(rel, vrel) > 0 && d > test.D * O.AU_KM * 0.85) { // left the planet again: recover v_inf (energy) and its direction
      const vr = norm(vrel) * O.KMS, vi = Math.sqrt(Math.max(0, vr * vr - 2 * O.BODY[test.pl].mu / d)), u = scale(vrel, 1 / norm(vrel));
      const helio = norm(add(add(pl.v, byName('Sun').v, -1), u, vi / O.KMS)) * O.KMS, turn = Math.acos(Math.max(-1, Math.min(1, dot(u, test.vdir)))) * 180 / Math.PI;
      test.out = { vi, helio, turn, alt: m.d - O.BODY[test.pl].R }; sim.playing = false; toast('행성을 지나갔습니다. 계산과 비교해 보세요'); }
    if (test.out) toolHint(`측정: 꺾임 ${fmt(test.out.turn, 1)}° (계산 ${fmt(plan.f.delta * 180 / Math.PI, 1)}°) · 태양 기준 ${fmt(test.pin, 2)} → ${fmt(test.out.helio, 2)} km/s (계산 ${fmt(test.pout, 2)}, 실제 ${KO[test.pl]} 속도 기준) · 최근접 고도 ${fmt(test.out.alt, 0)} km`);
    else toolHint(`행성까지 ${fmt(d / 1e6, 2)}백만 km · 최근접 고도 ${m ? fmt(m.d - O.BODY[test.pl].R, 0) + ' km' : '-'}`); } };
  calc();
}

// O-5 multi-flyby mission design
const MISSIONS = {
  'Voyager 2 (지구-목성-토성-천왕성-해왕성)': [['Earth', '1977-08-20'], ['Jupiter', '1979-07-09'], ['Saturn', '1981-08-26'], ['Uranus', '1986-01-24'], ['Neptune', '1989-08-25']],
  'Voyager 1 (지구-목성-토성)': [['Earth', '1977-09-05'], ['Jupiter', '1979-03-05'], ['Saturn', '1980-11-12']],
  'Galileo VEEGA (지구-금성-지구-지구-목성)': [['Earth', '1989-10-18'], ['Venus', '1990-02-10'], ['Earth', '1990-12-08'], ['Earth', '1992-12-08'], ['Jupiter', '1995-12-07']],
  'Cassini VVEJGA (지구-금성-금성-지구-목성-토성)': [['Earth', '1997-10-15'], ['Venus', '1998-04-26'], ['Venus', '1999-06-24'], ['Earth', '1999-08-18'], ['Jupiter', '2000-12-30'], ['Saturn', '2004-07-01']],
  '직접 설계: 지구-화성-목성': [['Earth', '2030-05-01'], ['Mars', '2031-02-01'], ['Jupiter', '2033-06-01']],
};
function labMission() {
  freshSystem(); sim.playing = false;
  const box = labBox('임무 설계: 여러 행성 경유', '구간마다 램버트 궤적을 잇고, 플라이바이마다 필요한 추가 분사와 꺾임각을 따집니다.');
  steps(box, ['실제 임무로 시작하거나 직접 경로를 고르세요. 날짜를 바꾸면 바로 다시 계산합니다.', '플라이바이에서 들어오는 v∞와 나가는 v∞의 크기가 같고, 필요한 꺾임각을 행성 곁에서 낼 수 있으면 연료 없이 지나갈 수 있습니다.', '"경로 재생"으로 행성들이 움직이는 가운데 탐사선이 각 행성을 만나는 모습을 봅니다.']);
  const pick = field(box, '시작 임무', el('select')); for (const k of Object.keys(MISSIONS)) pick.append(new Option(k, k));
  const legsBox = el('div', 'sb-legs'); box.append(legsBox); const set = results(box);
  let seq = [], path = null;
  const render = () => { legsBox.innerHTML = '';
    seq.forEach((s, i) => { const row = el('div', 'sb-leg'), sel = el('select'); for (const n of PL) sel.append(new Option(KO[n], n)); sel.value = s[0];
      const d = el('input'); d.type = 'date'; d.value = s[1]; sel.onchange = () => { s[0] = sel.value; calc(); }; d.onchange = () => { s[1] = d.value; calc(); };
      const rm = btn('×', () => { seq.splice(i, 1); render(); calc(); }); row.append(el('span', '', `${i + 1}`), sel, d, ...(seq.length > 2 ? [rm] : [])); legsBox.append(row); });
    legsBox.append(btn('경유지 추가', () => { const last = seq[seq.length - 1]; seq.push(['Jupiter', fmtDate(jdOf(last[1]) + 500)]); render(); calc(); })); };
  const calc = () => {
    const legs = [], rows = []; let total = 0, ok = true;
    for (let i = 0; i + 1 < seq.length; i++) { const j1 = jdOf(seq[i][1]), j2 = jdOf(seq[i + 1][1]), A = planetState(seq[i][0], j1), B = planetState(seq[i + 1][0], j2);
      if (j2 <= j1) { rows.push([`구간 ${i + 1}`, '날짜 순서가 맞지 않습니다']); ok = false; break; }
      // back to the same planet after a whole number of its years: a resonant orbit, which a one-revolution Lambert arc cannot describe
      const yr = Math.sqrt(O.BODY[seq[i][0]].a ** 3) * 365.25, nres = Math.round((j2 - j1) / yr);
      if (seq[i][0] === seq[i + 1][0] && nres >= 1 && Math.abs((j2 - j1) / yr - nres) < 0.08) { legs.push({ j1, j2, A, B, from: seq[i][0], to: seq[i + 1][0], resonant: nres }); continue; }
      const L = O.lambert(A.r, B.r, j2 - j1); if (!L) { rows.push([`구간 ${i + 1}`, '한 바퀴 안의 궤적이 없습니다 (여러 바퀴 또는 우주 기동이 필요)']); ok = false; break; }
      legs.push({ j1, j2, A, B, L, from: seq[i][0], to: seq[i + 1][0] }); }
    if (ok && legs.length && legs[0].resonant) { rows.push(['구간 1', '출발 구간은 공명 궤도일 수 없습니다']); ok = false; }
    if (ok && legs.length) {
      const vd = norm(add(legs[0].L.v1, legs[0].A.v, -1)) * O.KMS, dv0 = O.dvDepart(O.BODY.Earth.mu, 6578, vd);
      rows.push(['출발', `${fmtDate(legs[0].j1)} ${KO[legs[0].from]} · C3 ${fmt(vd * vd, 1)} km²/s² · 저궤도에서 Δv ${fmt(dv0, 2)} km/s`]); total += legs[0].from === 'Earth' ? dv0 : vd;
      let carry = null; // v_inf carried through a resonant loop (same size, new direction)
      for (let i = 0; i + 1 < legs.length; i++) { const P = O.BODY[legs[i].to], Vp = legs[i].B.v, nxt = legs[i + 1];
        if (nxt.resonant) { const vi = legs[i].L ? add(legs[i].L.v2, Vp, -1) : carry; carry = vi;
          rows.push([`${i + 1}. ${KO[legs[i].to]} ${fmtDate(legs[i].j2)}`, `v∞ ${fmt(norm(vi) * O.KMS, 2)} km/s 그대로, ${nxt.resonant}년 주기 공명 궤도로 다시 ${KO[nxt.to]}에 돌아옴 (방향만 바뀜)`]); continue; }
        const vi = legs[i].L ? add(legs[i].L.v2, Vp, -1) : scale(carry, 1), vo = add(nxt.L.v1, Vp, -1);
        const ni = norm(vi) * O.KMS, no = norm(vo) * O.KMS, need = Math.abs(no - ni); total += need;
        if (!legs[i].L) { rows.push([`${i + 1}. ${KO[legs[i].to]} ${fmtDate(legs[i].j2)}`, `공명 궤도에서 돌아와 v∞ ${fmt(ni, 2)} → ${fmt(no, 2)} km/s · 추가 분사 ${fmt(need, 2)} km/s (꺾임은 두 번의 지구 근접에 나눠짐)`]); continue; }
        const delta = Math.acos(Math.max(-1, Math.min(1, dot(vi, vo) / (norm(vi) * norm(vo))))), vm = (ni + no) / 2, rp = O.rpForTurn(P.mu, vm, delta), alt = rp - P.R;
        rows.push([`${i + 1}. ${KO[legs[i].to]} ${fmtDate(legs[i].j2)}`, `v∞ ${fmt(ni, 2)} → ${fmt(no, 2)} km/s · 꺾임 ${fmt(delta * 180 / Math.PI, 1)}° · 필요한 최근접 고도 ${alt > 0 ? fmt(alt, 0) + ' km' : '불가능 (행성 속)'} · 추가 분사 ${fmt(need, 2)} km/s`]); }
      const last = legs[legs.length - 1], va = norm(add(last.L.v2, last.B.v, -1)) * O.KMS, P = O.BODY[last.to], cap = Math.sqrt(va * va + 2 * P.mu / (P.R * 1.5)) - Math.sqrt(P.mu * (1 + 0.9) / (P.R * 1.5));
      rows.push(['도착', `${fmtDate(last.j2)} ${KO[last.to]} · v∞ ${fmt(va, 2)} km/s · 포획 Δv ${fmt(cap, 2)} km/s (근점 1.5 R, 이심률 0.9 궤도)`]);
      rows.push(['총 Δv (포획 제외)', `${fmt(total, 2)} km/s · 총 비행 ${fmt((last.j2 - legs[0].j1) / 365.25, 1)}년`]);
    }
    set(rows); path = ok ? legs.filter(l => l.L) : null; drawPath();
  };
  const drawPath = () => { view.extras.clear(); if (!path) return;
    path.forEach((l, i) => { const pts = []; for (let k = 0; k <= 160; k++) { const s = O.propagate(l.A.r, l.L.v1, (l.j2 - l.j1) * k / 160); pts.push(new THREE.Vector3(...s.r)); }
      view.extras.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: [0x4fe3c1, 0xffb454, 0x9fe0e6, 0xff7aa2, 0xe9d29a][i % 5] })));
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: 0xffffff, sizeAttenuation: false, depthTest: false })); m.scale.setScalar(0.014); m.position.set(...l.B.r); view.extras.add(m); }); };
  pick.onchange = () => { seq = MISSIONS[pick.value].map(x => [...x]); render(); calc(); resetSolarSystem(jdOf(seq[0][1])); focus('Sun', seq.some(s => ['Uranus', 'Neptune'].includes(s[0])) ? 40 : seq.some(s => s[0] === 'Saturn') ? 14 : 8); };
  box.append(btn('경로 재생', () => { if (!path) return; resetSolarSystem(path[0].j1); ghost = { legs: path }; sim.speed = 40; sim.playing = true; }, 'sb-go'));
  let ghost = null;
  deeper(box, `패치드 코닉 근사: 행성 사이 구간은 태양만의 케플러 궤도(램버트 해)로, 행성 곁은 순간적인 v∞ 회전으로 봅니다.
    중력 도움이 공짜가 되려면 <span class="tex">|\\vec v_{\\infty,\\text{in}}| = |\\vec v_{\\infty,\\text{out}}|</span>이어야 하고, 필요한 꺾임각 δ에 대한 최근접 거리 <span class="tex">r_p = \\left(\\frac{1}{\\sin(\\delta/2)} - 1\\right)\\frac{\\mu}{v_\\infty^2}</span>가 행성 반지름(과 대기)보다 커야 합니다.
    크기가 다르면 근점에서 분사하는 동력 플라이바이나 구간 중간의 우주 기동(DSM)이 필요합니다. 실제 임무는 이 계산에 최적화(날짜를 바꿔 총 Δv 최소화)와 정밀 궤도 적분을 더합니다.
    갈릴레오의 두 번째 지구 근접(1990→1992)처럼 같은 행성으로 정확히 몇 년 뒤 돌아오는 구간은 공명 궤도입니다. 한 바퀴 안의 램버트 해로는 풀 수 없어서, v∞ 크기는 그대로 두고 방향만 바꾸는 것으로 계산합니다.`);
  noteAndSave(box, '임무 설계', () => ({ 경로: seq.map(s => `${KO[s[0]]} ${s[1]}`).join(' → '), 결과: root.querySelector('.sb-res')?.innerText.replace(/\n/g, ' / ').slice(0, 400) || '' }));
  const ghostDot = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: 0x4fe3c1, sizeAttenuation: false, depthTest: false })); ghostDot.scale.setScalar(0.02);
  lab = { tick() { if (!ghost) return; const l = ghost.legs.find(l => sim.t >= l.j1 && sim.t <= l.j2); if (!l) { view.extras.remove(ghostDot); return; }
    const s = O.propagate(l.A.r, l.L.v1, sim.t - l.j1); ghostDot.position.set(...s.r); if (!ghostDot.parent) view.extras.add(ghostDot); toolHint(`${KO[l.from]} → ${KO[l.to]} 구간 · ${fmtDate(sim.t)} (패치드 코닉 경로)`); } };
  pick.onchange();
}

// O-6 Lagrange points of the Sun-Jupiter system
function labLagrange() {
  resetSolarSystem(sim.t, ['Sun', 'Jupiter']); sim.speed = 200; sim.playing = true; focus('Sun', 14);
  const box = labBox('라그랑주점과 트로이 소행성', '태양과 목성 사이에서 둘과 함께 도는 다섯 자리가 있습니다. 어느 자리가 안정할까요?');
  steps(box, ['태양과 목성만 남긴 샌드박스입니다. L1~L5 다섯 점에 시험 입자를 놓았습니다(살짝 흔들어 둠).', '몇십 년을 돌려 보며 어떤 입자가 제자리를 맴돌고 어떤 입자가 떠나는지 보세요.', '실제 목성 트로이 소행성 1만여 개가 L4, L5 근처에 모여 있습니다.']);
  const J = byName('Jupiter'), S = byName('Sun'), rel = add(J.r, S.r, -1), a = norm(rel), m = J.m / S.m, rH = a * Math.cbrt(m / 3), ang = Math.atan2(rel[1], rel[0]);
  const w = norm(cross(rel, add(J.v, S.v, -1))) / (a * a), pts = { L1: [a - rH, 0], L2: [a + rH, 0], L3: [-a * (1 + 5 * m / 12), 0], L4: [a * Math.cos(Math.PI / 3), a * Math.sin(Math.PI / 3)], L5: [a * Math.cos(Math.PI / 3), -a * Math.sin(Math.PI / 3)] };
  const probes = {}; const cm = (J.m * a) / (J.m + S.m); // barycentre offset along the Sun-Jupiter line
  for (const [k, [x, y]] of Object.entries(pts)) { const c = Math.cos(ang), s = Math.sin(ang), px = x * c - y * s, py = x * s + y * c, jit = 1 + (Math.random() - 0.5) * 2e-4;
    const R = [S.r[0] + px * jit, S.r[1] + py * jit, 0], bx = R[0] - (S.r[0] + cm * c), by = R[1] - (S.r[1] + cm * s);
    probes[k] = addProbe(R, [-w * by, w * bx, 0], // co-rotating with the barycentre at rest
      { ko: k, color: k === 'L4' || k === 'L5' ? 0x4fe3c1 : 0xff7aa2 }); probes[k].home = [px, py]; }
  const set = results(box), t0 = sim.t;
  deeper(box, `원 궤도로 도는 두 천체와 함께 회전하는 좌표계에서 중력과 원심력이 균형을 이루는 점이 다섯 개 있습니다(제한 삼체 문제).
    L1, L2는 목성에서 힐 반지름 <span class="tex">r_H = a\\left(\\frac{m}{3M}\\right)^{1/3}</span> = ${fmt(rH, 3)} AU 떨어져 있고, L3는 태양 반대편, L4와 L5는 태양·목성과 정삼각형을 이룹니다.
    L1~L3는 안장점이라 조금만 벗어나도 멀어지지만, L4와 L5는 질량비가 약 1/25보다 작으면 코리올리 힘 덕분에 올챙이 모양으로 맴돌며 안정합니다(태양-목성은 약 1/1047).`);
  noteAndSave(box, '라그랑주점', () => Object.fromEntries(Object.entries(probes).map(([k, p]) => [k, drift(p)])));
  const drift = (p) => { const S2 = byName('Sun'), J2 = byName('Jupiter'), r = add(J2.r, S2.r, -1), g = Math.atan2(r[1], r[0]) - ang, c = Math.cos(g), s = Math.sin(g), h = [p.home[0] * c - p.home[1] * s, p.home[1] * c + p.home[0] * s];
    return fmt(Math.hypot(p.r[0] - S2.r[0] - h[0], p.r[1] - S2.r[1] - h[1]), 2) + ' AU'; };
  lab = { tick() { set([['경과', `${fmt((sim.t - t0) / 365.25, 1)}년 (목성 ${fmt((sim.t - t0) / 4332.6, 1)}바퀴)`], ...Object.entries(probes).map(([k, p]) => [`${k}: 제자리에서 벗어난 거리`, drift(p)])]); } };
}

// ---------------- UI shell ----------------
function buildUI() {
  root = el('div', 'sb-root'); root.innerHTML = `
    <div class="sb-labels"></div>
    <div class="sb-panel">
      <div class="sb-title"><b>샌드박스</b><span class="small">실제 태양계를 복사한 N체 중력 실험실</span></div>
      <div class="sb-row"><span class="sb-date"></span></div>
      <div class="sb-row">
        <button class="sb-reset" title="처음 상태로">처음으로</button><button class="sb-back" title="역재생">역재생</button><button class="sb-play">정지</button>
        <select class="sb-speed"><option value="0.0007">1초에 1분</option><option value="0.0035">1초에 5분</option><option value="0.0417">1초에 1시간</option><option value="0.25">1초에 6시간</option><option value="1">1초에 1일</option><option value="10" selected>1초에 10일</option><option value="50">1초에 50일</option><option value="200">1초에 200일</option></select>
      </div>
      <div class="sb-row small sb-energy"></div>
      <div class="sb-sel" hidden><b class="sb-sel-name"></b><div class="small sb-sel-data"></div>
        <label class="small">질량 바꾸기 <input class="sb-mass" type="range" min="-3" max="3" step="0.05" value="0"></label><span class="small sb-massv"></span>
        <canvas class="sb-graph" width="560" height="120"></canvas>
        <div class="sb-row"><button class="sb-follow">따라가기</button><button class="sb-del">지우기</button><button class="sb-bh">블랙홀로 바꾸기</button></div></div>
      <div class="sb-tabs"><button data-tab="learn" class="on">우주 더 알아보기</button><button data-tab="make">만들기</button><button data-tab="scen">시나리오</button><button data-tab="view">보기</button></div>
      <div class="sb-tab" data-tab="learn">
        <button class="sb-bigcard"><b>개념으로 배우기</b><span>하늘의 좌표부터 은하 진화까지 46개 개념 · 직접 조작하는 그림과 확인 문제</span></button>
        <div class="small sb-sub">실습: 1단계부터 차례로 해 보세요. 오른쪽 "개념"은 관련 개념 카드를 엽니다</div>
        <div class="sb-labs"></div>
        <button class="sb-recbtn">실습 기록지</button>
      </div>
      <div class="sb-tab" data-tab="make" hidden>
        <div class="sb-row"><button class="sb-throw">탐사선 던지기</button></div>
        <div class="sb-row"><select class="sb-addkind"><option value="asteroid">소행성 (질량 없음)</option><option value="earth">지구</option><option value="jupiter">목성</option><option value="reddwarf">적색왜성 (0.2)</option><option value="star">태양 같은 별</option><option value="bh">블랙홀 (10 태양질량)</option></select>
          <label class="small"><input type="checkbox" class="sb-circ" checked> 원 궤도로</label><button class="sb-add">천체 놓기</button></div>
        <div class="sb-row"><button class="sb-belt">소행성대 만들기</button><button class="sb-ring" title="고른 행성 둘레에 로슈 한계 안팎으로 입자 고리를 만듭니다">고른 행성에 고리 만들기</button></div>
        <div class="sb-row"><button class="sb-save">장면 저장</button><select class="sb-loads"><option value="">저장한 장면…</option></select><button class="sb-share">링크로 공유</button></div>
      </div>
      <div class="sb-tab" data-tab="scen" hidden><div class="sb-scens"></div></div>
      <div class="sb-tab" data-tab="view" hidden>
        <label class="small"><input type="checkbox" class="sb-hz" checked> 생명 가능 지대</label>
        <label class="small"><input type="checkbox" class="sb-pred"> 궤도 예측선 (지금 속도로 계속 간다면)</label>
        <label class="small"><input type="checkbox" class="sb-vel"> 속도 화살표</label>
        <label class="small"><input type="checkbox" class="sb-well"> 중력 우물 (퍼텐셜을 그물로)</label>
        <label class="small"><input type="checkbox" class="sb-trails" checked> 지나온 길</label>
        <label class="small"><input type="checkbox" class="sb-reltrail"> 지나온 길도 중심 천체 기준으로 (예: 지구 중심에서 본 화성의 역행 고리)</label>
        <div class="small sb-center"></div>
        <label class="small"><input type="checkbox" class="sb-names" checked> 이름</label>
        <div class="sb-row"><button class="sb-now">지금 태양계로 새로</button></div>
      </div>
      <div class="small sb-hint"></div>
    </div>
    <div class="sb-lab" hidden></div>
    <div class="sb-toast" hidden></div>`;
  document.body.append(root);
  renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); root.prepend(renderer.domElement);
  scene = new THREE.Scene(); scene.background = new THREE.Color(0x05070d);
  camera = new THREE.PerspectiveCamera(50, 1, 1e-9, 1e4); camera.up.set(0, 0, 1); camera.position.set(1, -5, 3);
  controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.minDistance = 1e-6; controls.maxDistance = 400; controls.zoomSpeed = 1.4;
  // reference: ecliptic grid rings every AU (faint), plus the stars as a backdrop dome
  const grid = new THREE.Group(); for (const r of [1, 2, 5, 10, 20, 30]) { const pts = []; for (let i = 0; i <= 128; i++) pts.push(new THREE.Vector3(r * Math.cos(i / 64 * Math.PI), r * Math.sin(i / 64 * Math.PI), 0));
    grid.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x1c2640 }))); } scene.add(grid, view.extras);
  const sp = []; for (let i = 0; i < 2500; i++) { const u = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u); sp.push(3000 * s * Math.cos(t), 3000 * s * Math.sin(t), 3000 * u); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0x8a93ad, size: 1.2, sizeAttenuation: false })));
  const q = (c) => root.querySelector(c);
  q('.sb-reset').onclick = () => { restore(); };
  q('.sb-back').onclick = () => { sim.speed = -Math.abs(sim.speed); sim.playing = true; };
  q('.sb-play').onclick = () => { sim.playing = !sim.playing; if (sim.speed < 0) sim.speed = -sim.speed; q('.sb-play').textContent = sim.playing ? '정지' : '재생'; };
  q('.sb-speed').onchange = (e) => { sim.speed = +e.target.value * Math.sign(sim.speed || 1); };
  q('.sb-throw').onclick = () => setTool(view.tool === 'throw' ? null : 'throw');
  q('.sb-now').onclick = () => { resetSolarSystem(ctx.jdNow()); focus('Sun', 4); };
  q('.sb-recbtn').onclick = showRecords;
  q('.sb-follow').onclick = () => selected && focus(selected.name, Math.max(selected.Rkm / O.AU_KM * 40, 0.02));
  q('.sb-del').onclick = () => { if (!selected) return; if (selected.name === 'Sun') { selected.m = 1e-12; selected.kind = 'test'; rebuild(selected); select(null); sim.E0 = energy(); return; } sim.bodies = sim.bodies.filter(b => b !== selected); scene.remove(selected.mesh, selected.line); view.labels.get(selected)?.remove(); select(null); sim.E0 = energy(); };
  q('.sb-mass').oninput = (e) => { if (!selected || selected.test) return; const b = selected; b.base ??= b.m; const k = Math.pow(10, +e.target.value); b.m = b.base * k; q('.sb-massv').textContent = `×${fmt(k, 2)} (${b.m.toExponential(2)} 태양질량)`;
    if (b.kind === 'planet' && b.m > 0.08) { b.kind = 'star'; b.Rkm = starRadiusKm(b.m); b.color = starColor(b.m); rebuild(b); toast(`${b.ko}이(가) 0.08 태양질량을 넘어 중심에서 수소 핵융합이 시작됩니다: 별이 되었습니다`); }
    else if (b.kind === 'star') { b.Rkm = starRadiusKm(b.m); b.color = starColor(b.m); if (b.m < 0.08) { b.kind = 'planet'; toast('0.08 태양질량 아래로: 핵융합이 꺼진 갈색왜성·행성이 됩니다'); } rebuild(b); }
    else if (b.kind === 'bh') b.Rkm = RS_KM(b.m);
    sim.E0 = energy(); };
  q('.sb-bh').onclick = () => selected && toBlackHole(selected);
  q('.sb-add').onclick = () => setTool(view.tool === 'add' ? null : 'add');
  scene.add(hzGroup, rocheGroup);
  for (const [t, f, card] of LABS) { if (!f) { q('.sb-labs').append(el('div', 'sb-level', t)); continue; } const row = el('div', 'sb-labrow'), go = btn(t, () => { labCard = card; f(); }), c = btn('개념', () => openCards({ card, openLab: (n) => openLab(n) }), 'sb-concept'); c.title = '관련 개념 카드 열기'; row.append(go, c); q('.sb-labs').append(row); }
  q('.sb-bigcard').onclick = () => openCards({ openLab: (n) => openLab(n) });
  root.querySelectorAll('.sb-tabs button').forEach(b => b.onclick = () => { root.querySelectorAll('.sb-tabs button').forEach(x => x.classList.toggle('on', x === b)); root.querySelectorAll('.sb-tab').forEach(t => t.hidden = t.dataset.tab !== b.dataset.tab); });
  for (const [k, t, d] of SCENS) { const b = el('button', 'sb-scenbtn', `<b>${t}</b><span>${d}</span>`); b.onclick = () => scenario(k); q('.sb-scens').append(b); }
  q('.sb-belt').onclick = makeBelt; q('.sb-ring').onclick = () => selected ? makeRing(selected) : toast('먼저 행성을 하나 누르세요');
  q('.sb-save').onclick = saveScene; q('.sb-loads').onchange = (e) => { if (e.target.value !== '') loadScene(loadSaves()[+e.target.value].data); e.target.value = ''; }; q('.sb-share').onclick = shareScene; refreshSaves();
  q('.sb-reltrail').onchange = resetTrails;
  q('.sb-trails').onchange = (e) => sim.bodies.forEach(b => b.line.visible = e.target.checked); q('.sb-names').onchange = (e) => root.querySelector('.sb-labels').hidden = !e.target.checked;
  scene.add(predGroup, velGroup, wellMesh, flashGroup);
  const rs = () => { const w = root.clientWidth, h = root.clientHeight; renderer.setSize(w, h, false); renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px'; camera.aspect = w / h; camera.updateProjectionMatrix(); };
  addEventListener('resize', () => root && !root.hidden && rs()); root.rs = rs;
  bindEditing();
}

export function openSandbox(context) {
  ctx = context;
  if (!root) { buildUI(); resetSolarSystem(ctx.jdNow()); focus('Sun', 4); }
  root.hidden = false; root.rs(); lastNow = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
}
export function closeSandbox() { if (!root) return; root.hidden = true; cancelAnimationFrame(raf); }
export function openLab(name) { labCard = { speeds: 'keplerlaws', sunmass: 'gravity', kepler2: 'keplerlaws', kepler3: 'keplerlaws', jupiter: 'gravity', circular: 'twobody', visviva: 'visviva', hohmann: 'hohmann', porkchop: 'lambert', flyby: 'flyby', mission: 'flyby', lagrange: 'cr3bp' }[name] || null; ({ speeds: labSpeeds, sunmass: labSunMass, kepler2: labKepler2, kepler3: labKepler3, jupiter: labJupiterMass, circular: labCircular, visviva: labVisViva, hohmann: labHohmann, porkchop: labPorkchop, flyby: labFlyby, mission: labMission, lagrange: labLagrange })[name]?.(); }
