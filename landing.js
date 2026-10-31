// Surface landing on the Moon and Mars: a local 3D terrain built from the real elevation maps (LRO LOLA, MGS MOLA),
// textured with the 8k colour maps plus procedural detail up close, under the sky of that body for the app's date and time.
// Loaded on first use from app.js (landAt). Everything here is built on entry and disposed on exit.
import * as THREE from 'three';

const D2R = Math.PI / 180, EYE = 1.7, SKY_R = 20000;
const DEM = { Moon: { file: 'textures/disp_moon.png', lo: 0, range: 20000 }, Mars: { file: 'textures/disp_mars.png', lo: -8200, range: 29500 } };
const COLOR = { Moon: 'textures/8k_moon.jpg', Mars: 'textures/8k_mars.jpg' };
const SOL_DAYS = { Moon: 29.530588, Mars: 1.0274912 };
// level of detail: square grids around the walker, each a coarser copy of the one inside it (cells, spacing in metres)
const LEVELS = [[160, 4], [160, 20], [128, 125], [128, 640]];

let api = null, L = null; // L: everything that exists only while landed
export const isActive = () => !!L?.ready;

// ---------- elevation ----------
async function loadDem(body) {
  const im = new Image(); im.src = DEM[body].file; await im.decode();
  const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height;
  const x = cv.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0);
  const rgba = x.getImageData(0, 0, im.width, im.height).data, d = new Uint8Array(im.width * im.height);
  for (let i = 0; i < d.length; i++) d[i] = rgba[i * 4];
  return { w: im.width, h: im.height, d, ...DEM[body] };
}
// cubic B-spline over the 8-bit map: smooth enough that its 80-120 m steps do not show as terraces
function demAt(D, px, py) {
  const ix = Math.floor(px), iy = Math.floor(py), fx = px - ix, fy = py - iy;
  const wts = (t) => [(1 - t) ** 3 / 6, (3 * t ** 3 - 6 * t * t + 4) / 6, (-3 * t ** 3 + 3 * t * t + 3 * t + 1) / 6, t ** 3 / 6];
  const wx = wts(fx), wy = wts(fy); let s = 0;
  for (let j = 0; j < 4; j++) { const y = Math.min(D.h - 1, Math.max(0, iy + j - 1)) * D.w; let r = 0;
    for (let i = 0; i < 4; i++) r += wx[i] * D.d[y + (((ix + i - 1) % D.w) + D.w) % D.w];
    s += wy[j] * r; }
  return D.lo + s / 255 * D.range;
}
// value noise and crater fields for the detail below the map's resolution (a few km down to a few metres)
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function vnoise(x, y) { const ix = Math.floor(x), iy = Math.floor(y); let fx = x - ix, fy = y - iy; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1); return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy; }
function craters(x, z, C, prob, depthK) {
  const cx = Math.floor(x / C), cz = Math.floor(z / C); let h = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const a = cx + i, b = cz + j, r0 = hash(a * 3 + 1, b * 7 + 2); if (r0 > prob) continue;
    const r = C * (0.12 + 0.3 * hash(a + 11, b - 5)), px = (a + 0.2 + 0.6 * hash(a - 3, b + 9)) * C, pz = (b + 0.2 + 0.6 * hash(a + 17, b + 1)) * C;
    const q = Math.hypot(x - px, z - pz) / r; if (q > 1.6) continue;
    const d = r * depthK; h += q < 1 ? d * (q * q - 1) + d * 0.15 : d * 0.15 * (1 - (q - 1) / 0.6) ** 2; }
  return h;
}
function detail(body, x, z, minWave) {
  const moon = body === 'Moon'; let h = 0, amp = moon ? 22 : 16, wave = 2000;
  for (let k = 0; wave >= minWave && k < 12; k++, wave /= 2, amp *= moon ? 0.5 : 0.47) h += (vnoise(x / wave + k * 17.3, z / wave - k * 9.1) - 0.5) * 2 * amp;
  if (moon) { if (minWave < 300) h += craters(x, z, 900, 0.35, 0.18); if (minWave < 60) h += craters(x, z, 160, 0.4, 0.18); if (minWave < 12) h += craters(x, z, 30, 0.45, 0.15); }
  else { if (minWave < 300) h += craters(x, z, 1400, 0.12, 0.12); if (minWave < 12) h += craters(x, z, 40, 0.15, 0.1); }
  return h;
}

// ---------- terrain mesh ----------
const NOISE = `float h1(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h1(i), h1(i + vec2(1, 0)), f.x), mix(h1(i + vec2(0, 1)), h1(i + vec2(1, 1)), f.x), f.y); }`;
function terrainMaterial(map, mars) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunI: { value: 1 }, amb: { value: new THREE.Vector3() }, haze: { value: new THREE.Vector3() },
      hazeK: { value: 0 }, camPos: { value: new THREE.Vector3() }, target: { value: mars ? 0.2 : 0.17 } },
    vertexShader: `#include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec2 vUv; varying vec3 vN, vW;
      void main() { vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `#include <common>
      #include <logdepthbuf_pars_fragment>
      uniform sampler2D map; uniform vec3 sunDir, amb, haze, camPos; uniform float sunI, hazeK, target; varying vec2 vUv; varying vec3 vN, vW; ${NOISE}
      void main() {
        #include <logdepthbuf_fragment>
        vec3 t = texture2D(map, vUv).rgb; float lum = dot(t, vec3(0.3, 0.59, 0.11));
        vec3 base = t / max(lum, 0.02) * mix(lum, target, 0.6);        // keep the map's colour and albedo, drop most of its baked-in shading
        float dist = length(vW - camPos), fine = 1.0 - smoothstep(25.0, 160.0, dist);
        float d = n2(vW.xz / 0.3) * 0.2 + n2(vW.xz / 2.2) * 0.35 + n2(vW.xz / 17.0) * 0.45; // grains, ripples, patches
        vec2 cell = floor(vW.xz / 0.6), f = fract(vW.xz / 0.6) - 0.5 + (vec2(h1(cell + 7.0), h1(cell + 3.0)) - 0.5) * 0.5;
        float rock = step(0.955, h1(cell)) * (1.0 - smoothstep(0.08, 0.15 + 0.12 * h1(cell + 11.0), length(f)));
        vec3 col = base * mix(1.0, 0.72 + 0.56 * d, 0.15 + 0.85 * fine) * (1.0 - rock * fine * 0.5);
        float lam = max(dot(normalize(vN), sunDir), 0.0);
        col = col * (lam * sunI + amb);
        col = mix(col, haze, 1.0 - exp(-dist * hazeK));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}
// one level: an n x n grid of spacing s centred on (cx, cz); a hole where the next finer level lies (minus one cell of overlap)
function buildLevel(n, s, cx, cz, hole) {
  const N1 = n + 1, pos = new Float32Array(N1 * N1 * 3), uv = new Float32Array(N1 * N1 * 2), x0 = cx - n * s / 2, z0 = cz - n * s / 2;
  const { R, lat0, lon0, h0, body, ex } = L, cosl = Math.cos(lat0), D = L.dem, sink = s > 10 ? s * 0.012 : 0;
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const x = x0 + i * s, z = z0 + j * s, k = j * N1 + i, lat = lat0 - z / R, lon = lon0 + x / (R * cosl);
    const u = lon / (2 * Math.PI) + 0.5, v = 0.5 + lat / Math.PI; // u is not wrapped (RepeatWrapping): no seam at 180 degrees
    pos[k * 3] = x; pos[k * 3 + 2] = z;
    pos[k * 3 + 1] = (demAt(D, u * D.w - 0.5, (1 - v) * D.h - 0.5) + detail(body, x, z, s * 2)) * ex - h0 - (x * x + z * z) / (2 * R) - sink;
    uv[k * 2] = u; uv[k * 2 + 1] = v;
  }
  const idx = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    if (hole) { const xa = x0 + i * s, za = z0 + j * s; if (xa > hole[0] + s && xa + s < hole[1] - s && za > hole[2] + s && za + s < hole[3] - s) continue; }
    const a = j * N1 + i; idx.push(a, a + N1, a + 1, a + 1, a + N1, a + N1 + 1);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere(); return g;
}
function heightAt(x, z) { // ground under the walker: the same function as the finest level
  const { R, lat0, lon0, h0, body, ex } = L, D = L.dem, lat = lat0 - z / R, lon = lon0 + x / (R * Math.cos(lat0));
  return (demAt(D, (lon / (2 * Math.PI) + 0.5) * D.w - 0.5, (0.5 - lat / Math.PI) * D.h - 0.5) + detail(body, x, z, LEVELS[0][1] * 2)) * ex - h0 - (x * x + z * z) / (2 * R);
}
function updateLevels(force) {
  const p = L.rig.position;
  let inner = null;
  for (let li = 0; li < LEVELS.length; li++) {
    const [n, s] = LEVELS[li], lv = L.levels[li], snap = s * 8, cx = Math.round(p.x / snap) * snap, cz = Math.round(p.z / snap) * snap;
    const half = n * s / 2, box = [cx - half, cx + half, cz - half, cz + half];
    if (force || !lv.mesh || lv.cx !== cx || lv.cz !== cz || (inner && inner.changed)) {
      const g = buildLevel(n, s, cx, cz, inner && inner.box);
      if (lv.mesh) { lv.mesh.geometry.dispose(); lv.mesh.geometry = g; } else { lv.mesh = new THREE.Mesh(g, L.terrainMat); lv.mesh.frustumCulled = false; L.scene.add(lv.mesh); }
      Object.assign(lv, { cx, cz, changed: true });
    } else lv.changed = false;
    lv.box = box; inner = lv;
  }
}

// ---------- sky ----------
function discTexture(stops) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [o, c] of stops) g.addColorStop(o, c); x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function litSphere(map, color, isEarth) {
  return new THREE.ShaderMaterial({ uniforms: { map: { value: map }, color: { value: new THREE.Color(color) }, sunDir: { value: new THREE.Vector3(1, 0, 0) }, hasMap: { value: map ? 1 : 0 } },
    vertexShader: `varying vec3 vN; varying vec2 vUv; void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D map; uniform vec3 color, sunDir; uniform float hasMap; varying vec3 vN; varying vec2 vUv;
      void main(){ vec3 c = hasMap > 0.5 ? texture2D(map, vUv).rgb : color; float l = max(dot(normalize(vN), sunDir), 0.0);
        ${isEarth ? 'c += vec3(0.05, 0.09, 0.2) * smoothstep(0.55, 1.0, 1.0 - abs(dot(normalize(vN), normalize(cameraPosition)))) * l;' : ''}
        gl_FragColor = vec4(c * (l * 1.15 + 0.004), 1.0);
        #include <colorspace_fragment>
      }`, depthTest: false, depthWrite: false });
}
function makeStars() {
  const S = api.starData, pos = [], mag = [], col = [];
  for (let i = 0; i < S.pos.length; i++) { if (!(S.mag[i] < 6.8)) continue; const v = S.pos[i]; pos.push(v.x * SKY_R, v.y * SKY_R, v.z * SKY_R); mag.push(S.mag[i]);
    const bv = S.bv[i] ?? 0.6; col.push(Math.min(1, 0.75 + 0.25 * (bv - 0.2)), 0.9, Math.min(1, 1.05 - 0.3 * bv)); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('mag', new THREE.Float32BufferAttribute(mag, 1)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const m = new THREE.ShaderMaterial({ uniforms: { vis: { value: 1 }, pr: { value: 1 } },
    vertexShader: `attribute float mag; attribute vec3 color; uniform float vis, pr; varying vec4 vC;
      void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = clamp((7.0 - mag) * 0.9, 1.2, 6.5) * pr; vC = vec4(color, clamp((7.2 - mag) / 4.0, 0.12, 1.0) * vis); }`,
    fragmentShader: `varying vec4 vC; void main(){ float r = length(gl_PointCoord - 0.5); if (r > 0.5) discard; gl_FragColor = vec4(vC.rgb, vC.a * smoothstep(0.5, 0.15, r)); }`,
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending });
  const p = new THREE.Points(g, m); p.renderOrder = -40; p.frustumCulled = false; return p;
}

// ---------- entering and leaving ----------
// target: { body: 'Moon' | 'Mars', lat, lon, ko?, name? }; opts: { lt: 'noon' | 'sunset' | 'sunrise', look: 'earth' | 'sun' | name, instant }
export async function enter(appApi, target, opts = {}) {
  if (L) exit(true);
  api = appApi; const body = target.body, b = api.PLANETS.find(p => p.name === body), R = b.R * 1000;
  api.status(`${target.ko || b.ko}에 내려가는 중 · ${body === 'Moon' ? 'LRO LOLA' : 'MGS MOLA'} 고도 자료로 지형을 만드는 중`);
  const dem = await loadDem(body);
  L = { body, b, R, lat0: target.lat * D2R, lon0: target.lon * D2R, target, dem, ex: 1, levels: LEVELS.map(() => ({})), keys: new Set(), yaw: 0, pitch: 0.05, owned: [] };
  L.h0 = 0; L.h0 = (demAt(dem, (L.lon0 / (2 * Math.PI) + 0.5) * dem.w - 0.5, (0.5 - L.lat0 / Math.PI) * dem.h - 0.5));
  // colour: reuse the 8k map if the planet already has it, otherwise load it now (and free it on exit)
  const have = b.mesh.material.uniforms?.map?.value;
  let map = have?.image?.width >= 8192 ? have : null;
  if (!map) { map = await new THREE.TextureLoader().loadAsync(COLOR[body]).catch(() => have); if (map !== have) L.owned.push(map); }
  if (!L) return; // left while loading
  map.colorSpace = THREE.SRGBColorSpace; map.wrapS = THREE.RepeatWrapping; map.anisotropy = api.renderer.capabilities.getMaxAnisotropy(); map.needsUpdate = true;
  const scene = L.scene = new THREE.Scene();
  L.terrainMat = terrainMaterial(map, body === 'Mars');
  L.rig = new THREE.Group(); scene.add(L.rig);
  L.cam = new THREE.PerspectiveCamera(60, 1, 0.05, 3e5); L.cam.rotation.order = 'YXZ'; L.cam.position.y = EYE; L.rig.add(L.cam);
  updateLevels(true);
  // sky: an equatorial group (stars, Sun, planets, moons) turned into the local east-up-south frame every frame, following the eye
  L.skyEq = new THREE.Group(); L.skyLocal = new THREE.Group(); scene.add(L.skyLocal); L.skyLocal.add(L.skyEq);
  L.stars = makeStars(); L.skyEq.add(L.stars);
  if (body === 'Mars') { const m = api.marsSkyMat.clone(); m.uniforms.up.value = new THREE.Vector3(0, 1, 0); m.uniforms.sunDir.value = new THREE.Vector3(1, 0, 0);
    L.dome = new THREE.Mesh(new THREE.SphereGeometry(SKY_R * 0.95, 48, 24), m); L.dome.renderOrder = -30; L.dome.frustumCulled = false; L.skyLocal.add(L.dome); }
  L.sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTexture([[0, 'rgba(255,250,235,1)'], [0.12, 'rgba(255,240,210,0.9)'], [0.3, 'rgba(255,225,180,0.25)'], [1, 'rgba(255,220,170,0)']]), blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true }));
  L.sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTexture([[0, '#fffdf6'], [0.9, '#fff6e0'], [1, 'rgba(255,240,210,0)']]), depthTest: false, depthWrite: false, transparent: true }));
  L.sunGlow.renderOrder = -20; L.sunDisc.renderOrder = -19; L.skyEq.add(L.sunGlow, L.sunDisc);
  // bodies in the sky: a lit sphere sized to its true angular size (Earth from the Moon, Phobos and Deimos from Mars), others as bright points
  L.bodies = [];
  const tl = new THREE.TextureLoader();
  const addBody = (name, ko, color, img) => { const p = api.PLANETS.find(q => q.name === name); if (!p) return;
    let map = null; if (img) { map = tl.load(img); map.colorSpace = THREE.SRGBColorSpace; L.owned.push(map); }
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), litSphere(map, color, name === 'Earth')); m.renderOrder = -15; m.frustumCulled = false;
    const dot = new THREE.Sprite(new THREE.SpriteMaterial({ map: L.dotTex, color, depthTest: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending })); dot.renderOrder = -14;
    L.skyEq.add(m, dot); L.bodies.push({ name, ko, p, mesh: m, dot }); };
  L.dotTex = discTexture([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.7)'], [1, 'rgba(255,255,255,0)']]); L.owned.push(L.dotTex);
  if (body === 'Moon') addBody('Earth', '지구', '#8fb4ff', 'textures/2k_earth_daymap.jpg');
  if (body === 'Mars') { addBody('Phobos', '포보스', '#8a8178'); addBody('Deimos', '데이모스', '#9a9088'); addBody('Earth', '지구', '#a8c4ff'); }
  for (const [n, ko, c] of [['Venus', '금성', '#fff4dc'], ['Jupiter', '목성', '#ffe8c8'], ['Saturn', '토성', '#f0dcae'], ...(body === 'Moon' ? [['Mars', '화성', '#ffb08a']] : [['Mercury', '수성', '#e8dccc']])]) addBody(n, ko, c);
  // DOM: controls, a surface that takes the pointer (so the space-mode handlers underneath stay still) and labels
  buildUI();
  document.body.classList.add('landing');
  if (opts.lt) setLocalTime(opts.lt);
  L.look = opts.look || (body === 'Moon' ? 'earth' : 'sun');
  L.descent = opts.instant || document.body.classList.contains('calm') ? null : { t0: performance.now(), dur: 4500, from: 2500 };
  aimAt(L.look, true); L.ready = true;
  api.status(`${target.ko || b.ko}에 내렸습니다 · 끌어서 둘러보고 W A S D로 걷습니다`);
}
export function exit(silent) {
  if (!L?.ready) return;
  const s = L.scene;
  s.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) { m.map?.dispose?.(); m.dispose(); } } });
  for (const t of L.owned) t.dispose();
  L.ui.remove(); L.cap.remove(); L.labels.remove();
  removeEventListener('keydown', L.onKey, true); removeEventListener('keyup', L.onKeyUp, true);
  const body = L.b; L = null;
  document.body.classList.remove('landing');
  if (!silent) api.onExit(body);
}

// ---------- sky positions for a time ----------
function frameAt(t) { // east, up, south (equatorial) and the Sun's direction for time t
  return api.withTime(t, () => {
    const q = api.bodyQuat(L.body), la = L.lat0, lo = L.lon0;
    const up = new THREE.Vector3(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo)).applyQuaternion(q);
    const eL = new THREE.Vector3(-Math.sin(lo), 0, -Math.cos(lo)).applyQuaternion(q), east = eL.addScaledVector(up, -eL.dot(up)).normalize(), south = east.clone().cross(up);
    const obs = api.helioPos[L.body].clone().addScaledVector(up, L.b.R / 1e6);
    const sun = obs.clone().negate().normalize();
    return { up, east, south, obs, sun, alt: Math.asin(sun.dot(up)), q, earthQ: api.bodyQuat('Earth'), helio: api.helioPos };
  });
}
function localHours(f) { // local solar time, 24 hours per local day: 12 when the Sun crosses the meridian
  // hour angle from the meridian, measured in the body's equatorial plane
  const pole = new THREE.Vector3(0, 1, 0).applyQuaternion(f.q), sEq = f.sun.clone().addScaledVector(pole, -f.sun.dot(pole)).normalize(), uEq = f.up.clone().addScaledVector(pole, -f.up.dot(pole)).normalize();
  const h = Math.atan2(sEq.clone().cross(uEq).dot(pole), sEq.dot(uEq));
  return ((h / Math.PI * 12 + 12) % 24 + 24) % 24;
}
// move the clock to the next local noon / sunset / sunrise (searched over one local day, refined by bisection)
export function setLocalTime(kind) {
  if (!L) return;
  const day = SOL_DAYS[L.body] * 864e5, t0 = api.state.time, N = 120;
  const val = (t) => { const f = frameAt(t); return kind === 'noon' ? Math.sin((localHours(f) - 12) / 24 * 2 * Math.PI) : f.alt + (kind === 'sunset' ? 0.5 * D2R : 0); };
  // noon: local time crosses 12 going up; sunset: altitude (-0.5 deg) crosses going down; sunrise: going up
  const want = kind === 'sunset' ? -1 : 1;
  let a = t0, va = val(a);
  for (let i = 1; i <= N; i++) { const b = t0 + day * i / N, vb = val(b);
    if (Math.sign(va) !== Math.sign(vb) && Math.sign(vb - va) === want) {
      let lo = a, hi = b; for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (Math.sign(val(m)) === Math.sign(va)) lo = m; else hi = m; }
      api.state.time = (lo + hi) / 2; api.refresh(); return; }
    a = b; va = vb; }
}
function aimAt(name, snap) {
  const f = frameAt(api.state.time), d = dirOf(name, f); if (!d) return;
  const loc = toLocal(d, f); L.yaw = Math.atan2(-loc.x, -loc.z); L.pitch = Math.max(-1.4, Math.min(1.45, Math.asin(loc.y) + (name === 'sun' && loc.y < 0.1 ? 0.12 : 0)));
  if (snap) L.pitch0 = L.pitch;
}
function dirOf(name, f) {
  if (name === 'sun') return f.sun.clone();
  const p = api.PLANETS.find(q => q.name.toLowerCase() === String(name).toLowerCase()); if (!p || !f.helio[p.name]) return null;
  return f.helio[p.name].clone().sub(f.obs).normalize();
}
const toLocal = (v, f) => new THREE.Vector3(v.dot(f.east), v.dot(f.up), v.dot(f.south));

// ---------- per frame (called from app.js in place of the space render) ----------
export function frame(now, dt) {
  if (!L?.ready) return;
  const r = api.renderer, f = frameAt(api.state.time), xr = r.xr.isPresenting;
  const size = r.getSize(new THREE.Vector2()); L.cam.aspect = size.x / Math.max(1, size.y); L.cam.updateProjectionMatrix();
  // walking (keys) and looking (drag); the ground follows the feet
  const run = L.keys.has('ShiftLeft') || L.keys.has('ShiftRight') ? 8 : 1.4, mv = new THREE.Vector2();
  if (L.keys.has('KeyW') || L.keys.has('ArrowUp')) mv.y += 1; if (L.keys.has('KeyS') || L.keys.has('ArrowDown')) mv.y -= 1;
  if (L.keys.has('KeyD') || L.keys.has('ArrowRight')) mv.x += 1; if (L.keys.has('KeyA') || L.keys.has('ArrowLeft')) mv.x -= 1;
  if (mv.lengthSq() && !L.descent) { mv.normalize().multiplyScalar(run * Math.min(dt, 100) / 1000); const yaw = xr ? L.rig.rotation.y + headYaw() : L.yaw;
    L.rig.position.x += -Math.sin(yaw) * mv.y + Math.cos(yaw) * mv.x; L.rig.position.z += -Math.cos(yaw) * mv.y - Math.sin(yaw) * mv.x; }
  const g = heightAt(L.rig.position.x, L.rig.position.z); let lift = 0;
  if (L.descent) { const k = Math.min(1, (now - L.descent.t0) / L.descent.dur), e = 1 - Math.pow(1 - k, 3); lift = L.descent.from * (1 - e);
    if (k >= 1) L.descent = null; }
  L.rig.position.y = g + lift + (xr && api.xrFloorless?.() ? EYE : 0);
  if (!xr) { L.cam.position.set(0, EYE, 0); L.cam.rotation.set(L.descent ? L.pitch - (1 - Math.min(1, (now - L.descent.t0) / L.descent.dur)) * 1.1 : L.pitch, L.yaw, 0); }
  updateLevels(false);
  // sky: equatorial -> east-up-south, centred on the eye
  const B = new THREE.Matrix4().makeBasis(f.east, f.up, f.south); L.skyEq.quaternion.setFromRotationMatrix(B).invert();
  const eye = L.cam.getWorldPosition(new THREE.Vector3()); L.skyLocal.position.copy(eye);
  const sunL = toLocal(f.sun, f), sunAlt = sunL.y, dAU = f.obs.length() / 149.598, mars = L.body === 'Mars';
  const day = mars ? THREE.MathUtils.smoothstep(sunAlt, -0.18, 0.12) : 0;
  const sunR = SKY_R * 0.9, angR = 0.00465 / dAU; // the Sun's angular radius
  L.sunDisc.position.copy(f.sun).multiplyScalar(sunR); L.sunGlow.position.copy(L.sunDisc.position);
  L.sunDisc.scale.setScalar(sunR * angR * 2.2); L.sunGlow.scale.setScalar(sunR * angR * (mars ? 26 : 14));
  L.sunGlow.material.opacity = mars ? 0.55 + 0.45 * day : 0.8;
  L.stars.material.uniforms.vis.value = mars ? 1 - day * 0.97 : 1; L.stars.material.uniforms.pr.value = r.getPixelRatio();
  if (L.dome) { L.dome.material.uniforms.sunDir.value.copy(sunL); }
  for (const o of L.bodies) { const hp = f.helio[o.name]; if (!hp) { o.mesh.visible = o.dot.visible = false; continue; }
    const rel = hp.clone().sub(f.obs), dist = rel.length(), dir = rel.divideScalar(dist), rad = (o.p.R / 1e6) / dist, D = SKY_R * 0.8;
    o.dir = dir; o.mesh.position.copy(dir).multiplyScalar(D); o.mesh.scale.setScalar(D * rad); o.mesh.material.uniforms.sunDir.value.copy(hp.clone().negate().normalize());
    if (o.name === 'Earth' && L.body === 'Moon') o.mesh.quaternion.copy(f.earthQ);
    const big = rad > 0.0006; o.mesh.visible = big; o.dot.visible = !big || rad < 0.002; o.dot.position.copy(o.mesh.position);
    o.dot.scale.setScalar(D * (big ? rad * 3 : 0.0035)); o.dot.material.opacity = (big ? 0.35 : 1) * (mars ? 1 - day * (o.name === 'Phobos' || o.name === 'Deimos' ? 0.6 : 0.95) : 1); }
  // light on the ground: sunlight, plus sky light on Mars and earthshine on the Moon
  const u = L.terrainMat.uniforms; u.sunDir.value.copy(sunL); u.camPos.value.copy(eye);
  const sunVis = THREE.MathUtils.smoothstep(sunAlt, -0.01, 0.02);
  if (mars) { u.sunI.value = 1.0 * sunVis; u.amb.value.set(0.26, 0.17, 0.11).multiplyScalar(0.08 + 0.92 * day); u.haze.value.set(0.55, 0.38, 0.26).multiplyScalar(0.05 + day * 0.95); u.hazeK.value = 1 / 22000; }
  else { const e = L.bodies[0], ph = e && e.dir ? (1 - e.mesh.material.uniforms.sunDir.value.dot(e.dir.clone().negate())) / 2 : 0; // fraction of Earth's lit side facing us
    u.sunI.value = 1.25 * sunVis; const es = 0.012 + 0.05 * ph * Math.max(0, toLocal(e?.dir || f.up, f).y); u.amb.value.set(es, es, es * 1.1); u.haze.value.set(0, 0, 0); u.hazeK.value = 0; }
  r.setClearColor(0x000000, 1);
  if (api.xrTick) api.xrTick(L.scene, L.cam);
  r.clear(); r.render(L.scene, L.cam);
  if (!xr) drawLabels(f); else L.labels.textContent = '';
  updateUI(f);
}
function headYaw() { const e = new THREE.Euler().setFromQuaternion(L.cam.quaternion, 'YXZ'); return e.y; }

// ---------- UI ----------
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function buildUI() {
  const t = L.target, b = L.b, ui = L.ui = el('div', 'land-ui'); ui.id = 'land-ui';
  ui.append(el('div', 'lu-title', t.ko ? `${t.ko} · ${b.ko}` : `${b.ko} 표면`));
  const pos = `${Math.abs(t.lat).toFixed(3)}°${t.lat >= 0 ? 'N' : 'S'}, ${Math.abs(t.lon).toFixed(3)}°${t.lon >= 0 ? 'E' : 'W'}`;
  ui.append(el('div', 'lu-sub', pos)); L.clock = el('div', 'lu-sub'); ui.append(L.clock);
  const row1 = el('div', 'lu-row');
  for (const [k, txt] of [['sunrise', '해 뜰 녘'], ['noon', '한낮'], ['sunset', '해 질 녘']]) { const bt = el('button', '', txt); bt.onclick = () => setLocalTime(k); row1.append(bt); }
  ui.append(row1);
  const row2 = el('label', 'lu-row'), sel = el('select'); row2.append(el('span', '', '높이 과장'), sel);
  for (const [v, txt] of [[1, '실제 높이'], [1.5, '1.5배'], [2, '2배'], [3, '3배']]) { const o = el('option', '', txt); o.value = v; sel.append(o); }
  sel.onchange = () => { L.ex = +sel.value; L.h0 = demAt(L.dem, (L.lon0 / (2 * Math.PI) + 0.5) * L.dem.w - 0.5, (0.5 - L.lat0 / Math.PI) * L.dem.h - 0.5) * L.ex; updateLevels(true); };
  ui.append(row2);
  const row3 = el('div', 'lu-row'), look = el('button', '', b.name === 'Moon' ? '지구 보기' : '해 보기'); look.onclick = () => aimAt(b.name === 'Moon' ? 'earth' : 'sun'); row3.append(look);
  if (api.vrSupported?.()) { const vr = el('button', '', 'VR로 보기'); vr.id = 'land-vr'; vr.onclick = () => api.startVR(); row3.append(vr); }
  const out = el('button', 'lu-exit', '우주로'); out.id = 'land-exit'; out.onclick = () => exit(); row3.append(out); ui.append(row3);
  ui.append(el('div', 'lu-hint', '화면을 끌어서 둘러보고, W A S D나 방향키로 걷습니다. Shift를 누르고 있으면 빨리 걷습니다.'));
  ui.append(el('div', 'lu-credit', `고도: ${b.name === 'Moon' ? 'NASA LRO LOLA' : 'NASA MGS MOLA'} · 표면 사진: Solar System Scope 8k`));
  const cap = L.cap = el('div'); cap.id = 'land-cap'; const labels = L.labels = el('div'); labels.id = 'land-labels';
  document.body.append(cap, labels, ui);
  let drag = null;
  cap.addEventListener('pointerdown', (e) => { cap.setPointerCapture(e.pointerId); drag = [e.clientX, e.clientY]; });
  cap.addEventListener('pointermove', (e) => { if (!drag) return; const k = L.cam.fov * D2R / innerHeight;
    L.yaw += (e.clientX - drag[0]) * k; L.pitch = Math.max(-1.5, Math.min(1.5, L.pitch + (e.clientY - drag[1]) * k)); drag = [e.clientX, e.clientY]; });
  cap.addEventListener('pointerup', () => { drag = null; });
  cap.addEventListener('wheel', (e) => { e.preventDefault(); L.cam.fov = Math.max(5, Math.min(90, L.cam.fov * Math.exp(e.deltaY * 0.001))); }, { passive: false });
  const mine = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'KeyQ', 'KeyE']);
  L.onKey = (e) => { if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return; if (e.code === 'Escape') { exit(); return; } if (!mine.has(e.code) && !/^Key|^Digit|^Space/.test(e.code)) return; e.stopImmediatePropagation(); L.keys.add(e.code); };
  L.onKeyUp = (e) => { L.keys.delete(e.code); if (mine.has(e.code)) e.stopImmediatePropagation(); };
  addEventListener('keydown', L.onKey, true); addEventListener('keyup', L.onKeyUp, true);
}
function updateUI(f) {
  const h = localHours(f), hh = Math.floor(h), mm = Math.floor((h - hh) * 60), alt = f.alt / D2R;
  L.clock.textContent = `현지 태양시 ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} · 해의 높이 ${alt.toFixed(1)}°`;
}
function drawLabels(f) {
  const out = [], v = new THREE.Vector3(), push = (dirEq, text) => { v.copy(toLocal(dirEq, f)); if (v.y < -0.02) return; v.multiplyScalar(1000).add(L.cam.getWorldPosition(new THREE.Vector3())).project(L.cam);
    if (v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) return; out.push([(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight, text]); };
  push(f.sun, '태양'); for (const o of L.bodies) if (o.dir) push(o.dir, o.ko);
  L.labels.textContent = ''; for (const [x, y, t] of out) { const s = el('span', '', t); s.style.transform = `translate(${Math.round(x + 10)}px, ${Math.round(y - 8)}px)`; L.labels.append(s); }
}
// VR pointing: the sky object nearest a direction (in the local frame), within 3 degrees
export function pickDir(dLocal) {
  if (!L) return null; const f = frameAt(api.state.time); let best = null, bd = Math.cos(3 * D2R);
  const test = (dirEq, name) => { const c = toLocal(dirEq, f).dot(dLocal); if (c > bd) { bd = c; best = name; } };
  test(f.sun, '태양'); for (const o of L.bodies) if (o.dir) test(o.dir, o.ko);
  const S = api.starData; for (let i = 0; i < S.pos.length; i++) if (S.mag[i] < 2.5 && (S.proper?.[i] || S.name[i])) { const c = toLocal(S.pos[i], f).dot(dLocal); if (c > bd) { bd = c; best = S.proper?.[i] || S.name[i]; } }
  return best;
}
export const scene = () => L?.scene, camera = () => L?.cam, rig = () => L?.rig, yaw = () => L?.yaw || 0;
