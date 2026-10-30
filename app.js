import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildCraft } from './craft.js';

// ---------- constants & helpers ----------
const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const R_MW = 1050, R_SKY = 1000, R_DSO = 980, R_PLANET = 900;
const CDN = 'https://cdn.jsdelivr.net/gh/';
const URLS = {
  stars: CDN + 'ofrohn/d3-celestial@master/data/stars.8.json',
  starnames: CDN + 'ofrohn/d3-celestial@master/data/starnames.json',
  lines: CDN + 'ofrohn/d3-celestial@master/data/constellations.lines.json',
  consts: CDN + 'ofrohn/d3-celestial@master/data/constellations.json',
  ngc: CDN + 'mattiaverga/OpenNGC@master/database_files/NGC.csv',
};
const $ = (id) => document.getElementById(id);

function eqVec(raDeg, decDeg, r = 1) {
  const a = raDeg * D2R, d = decDeg * D2R;
  return new THREE.Vector3(r * Math.cos(d) * Math.cos(a), r * Math.cos(d) * Math.sin(a), r * Math.sin(d));
}
function vecToRaDec(v) {
  const r = v.length();
  let ra = Math.atan2(v.y, v.x) * R2D; if (ra < 0) ra += 360;
  return { ra, dec: Math.asin(v.z / r) * R2D };
}
const fmtRA = (ra) => { const h = ra / 15; const H = Math.floor(h), m = (h - H) * 60, M = Math.floor(m), s = (m - M) * 60;
  return `${H}h ${String(M).padStart(2, '0')}m ${s.toFixed(1).padStart(4, '0')}s`; };
const fmtDec = (d) => { const s = d < 0 ? '−' : '+'; d = Math.abs(d); const D = Math.floor(d), m = (d - D) * 60, M = Math.floor(m);
  return `${s}${D}° ${String(M).padStart(2, '0')}′ ${((m - M) * 60).toFixed(0).padStart(2, '0')}″`; };
const fmtAng = (deg) => deg >= 1 ? deg.toFixed(2) + '°' : deg * 60 >= 1 ? (deg * 60).toFixed(1) + '′' : (deg * 3600).toFixed(1) + '″';

function bvToRGB(bv) {
  bv = Math.max(-0.4, Math.min(2.0, isNaN(bv) ? 0.6 : bv));
  // rough black-body-ish mapping
  const t = (bv + 0.4) / 2.4;
  const r = t < 0.3 ? 0.62 + t * 1.2 : 1.0;
  const g = t < 0.3 ? 0.75 + t * 0.8 : 0.98 - (t - 0.3) * 0.55;
  const b = t < 0.25 ? 1.0 : Math.max(0.35, 1.0 - (t - 0.25) * 1.1);
  return [r, g, b];
}

// ---------- renderer / scene ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, preserveDrawingBuffer: true }); // preserve: screenshot button
renderer.autoClear = false;
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, 1, 600, 1200) // tight near/far: planets are tiny at r=900 and need depth precision;
const planetScene = new THREE.Scene(); // solar-system bodies, drawn after the sky with their own camera
const pcam = new THREE.PerspectiveCamera(70, 1, 1e-7, 1e6);
const mode = { space: false };
const sky = new THREE.Group(); // equatorial frame -> horizontal frame
sky.matrixAutoUpdate = false;
scene.add(sky);

const view = { az: 180, alt: 30, fov: 70 };
let tracking = null; // object to keep centered

// ---------- time & location ----------
const state = { time: Date.now(), speed: 1, lat: 37.57, lon: 126.98, lastReal: performance.now() };
const jd = (ms) => ms / 86400000 + 2440587.5;
function lstDeg(ms, lon) {
  const d = jd(ms) - 2451545.0;
  return (((280.46061837 + 360.98564736629 * d + lon) % 360) + 360) % 360;
}
function updateSkyMatrix() {
  if (mode.space) { sky.matrix.identity(); sky.matrixWorldNeedsUpdate = true; sky.updateMatrixWorld(true); return; }
  const L = lstDeg(state.time, state.lon) * D2R, p = state.lat * D2R;
  const rz = new THREE.Matrix4().set(
    Math.cos(L), Math.sin(L), 0, 0,
    -Math.sin(L), Math.cos(L), 0, 0,
    0, 0, 1, 0, 0, 0, 0, 1);
  // a.x = toward meridian on equator, a.y = -east..., a.z = pole  ->  X=east, Y=up, Z=south
  const a = new THREE.Matrix4().set(
    0, 1, 0, 0,
    Math.cos(p), 0, Math.sin(p), 0,
    Math.sin(p), 0, -Math.cos(p), 0,
    0, 0, 0, 1);
  sky.matrix.multiplyMatrices(a, rz);
  sky.matrixWorldNeedsUpdate = true;
  sky.updateMatrixWorld(true);
}

// ---------- stars ----------
const starData = { pos: [], mag: [], name: [], id: [], bv: [] };
let starPoints = null;
const starMat = new THREE.ShaderMaterial({
  uniforms: { limit: { value: 6.5 }, pr: { value: 1 }, dim: { value: 1 } },
  vertexShader: `
    attribute float mag; attribute vec3 color; varying vec3 vC; varying float vA;
    uniform float limit, pr, dim;
    void main(){
      vec4 mv = modelViewMatrix * vec4(position,1.0);
      gl_Position = projectionMatrix * mv;
      float d = limit - mag;
      vA = clamp(d * 0.6 + 0.25, 0.0, 1.0) * dim;
      if (d < 0.0) vA = 0.0;
      gl_PointSize = clamp(2.0 + d * 1.25, 1.5, 16.0) * pr;
      vC = color;
    }`,
  fragmentShader: `
    varying vec3 vC; varying float vA;
    void main(){
      vec2 p = gl_PointCoord * 2.0 - 1.0; float r2 = dot(p,p);
      if (r2 > 1.0 || vA <= 0.0) discard;
      float core = exp(-r2 * 9.0), halo = exp(-r2 * 2.5) * 0.35;
      gl_FragColor = vec4(mix(vC, vec3(1.0), core*0.6) * (core + halo), 1.0) * vA;
    }`,
  transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
});

async function loadStars() {
  const [js, names] = await Promise.all([fetch(URLS.stars).then(r => r.json()), fetch(URLS.starnames).then(r => r.json()).catch(() => ({}))]);
  const pos = [], mags = [], cols = [];
  for (const f of js.features) {
    let [ra, dec] = f.geometry.coordinates; if (ra < 0) ra += 360;
    const m = f.properties.mag, bv = parseFloat(f.properties.bv);
    const v = eqVec(ra, dec, R_SKY);
    pos.push(v.x, v.y, v.z); mags.push(m); cols.push(...bvToRGB(bv));
    const n = names[f.id];
    const nm = n ? (n.name || (n.bayer ? `${n.bayer} ${n.c}` : (n.flam ? `${n.flam} ${n.c}` : ''))) : '';
    starData.pos.push(v.clone().divideScalar(R_SKY)); starData.mag.push(m); starData.bv.push(bv);
    starData.name.push(nm); starData.id.push(f.id);
    starData.proper = starData.proper || []; starData.proper.push(n && n.name ? n.name : '');
    starData.desig = starData.desig || []; starData.desig.push(n ? [n.desig && n.c ? `${n.desig} ${n.c}` : '', n.hd || ''].filter(Boolean).join(' · ') : '');
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('mag', new THREE.Float32BufferAttribute(mags, 1));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  starPoints = new THREE.Points(g, starMat); starPoints.frustumCulled = false; starPoints.renderOrder = 2;
  sky.add(starPoints);
  return js.features.length;
}

// ---------- Milky Way (galactic-coordinate panorama mapped onto the equatorial sphere) ----------
const mwMat = new THREE.ShaderMaterial({
  uniforms: { map: { value: null }, gain: { value: 1 } },
  vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D map; uniform float gain; varying vec3 vP;
    const mat3 EQ2GAL = mat3(-0.0548755604, 0.4941094279, -0.8676661490,
                             -0.8734370902, -0.4448296300, -0.1980763734,
                             -0.4838350155, 0.7469822445, 0.4559837762);
    void main(){ vec3 g = EQ2GAL * normalize(vP);
      float l = atan(g.y, g.x), b = asin(clamp(g.z, -1.0, 1.0));
      vec2 uv = vec2(0.5 - l / 6.2831853, 0.5 + b / 3.1415927);
      vec3 c = texture2D(map, uv).rgb;
      gl_FragColor = vec4(pow(c, vec3(0.85)) * gain, 1.0); }`,
  side: THREE.BackSide, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, transparent: true,
});
const milkyWay = new THREE.Mesh(new THREE.SphereGeometry(R_MW, 96, 48), mwMat);
milkyWay.renderOrder = 0; milkyWay.visible = false; sky.add(milkyWay);
new THREE.TextureLoader().load('textures/4k_milky_way.jpg', (t) => { t.colorSpace = THREE.SRGBColorSpace; mwMat.uniforms.map.value = t; milkyWay.visible = $('t-mw').checked; });

// ---------- constellation lines & grid ----------
const linesGroup = new THREE.Group(); sky.add(linesGroup);
const constLabels = [];
async function loadLines() {
  const [js, cj] = await Promise.all([fetch(URLS.lines).then(r => r.json()), fetch(URLS.consts).then(r => r.json()).catch(() => null)]);
  const pts = [];
  for (const f of js.features) for (const line of f.geometry.coordinates)
    for (let i = 0; i < line.length - 1; i++) {
      const a = eqVec(line[i][0], line[i][1], R_SKY), b = eqVec(line[i + 1][0], line[i + 1][1], R_SKY);
      pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x3a5a92, transparent: true, opacity: 0.55, depthTest: false }));
  l.frustumCulled = false; l.renderOrder = 1; linesGroup.add(l);
  if (cj) for (const f of cj.features) {
    let [ra, dec] = f.geometry.coordinates; if (ra < 0) ra += 360;
    constLabels.push({ v: eqVec(ra, dec), name: f.properties.name });
  }
}
const gridGroup = new THREE.Group(); gridGroup.visible = false; sky.add(gridGroup);
(function buildGrid() {
  const pts = [];
  for (let dec = -80; dec <= 80; dec += 10) for (let ra = 0; ra < 360; ra += 2) {
    const a = eqVec(ra, dec, R_SKY), b = eqVec(ra + 2, dec, R_SKY); pts.push(a.x, a.y, a.z, b.x, b.y, b.z); }
  for (let ra = 0; ra < 360; ra += 15) for (let dec = -88; dec < 88; dec += 2) {
    const a = eqVec(ra, dec, R_SKY), b = eqVec(ra, dec + 2, R_SKY); pts.push(a.x, a.y, a.z, b.x, b.y, b.z); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x2a5560, transparent: true, opacity: 0.5, depthTest: false }));
  l.frustumCulled = false; gridGroup.add(l);
})();

// ---------- NGC / IC deep-sky objects (OpenNGC) ----------
const TYPE = { G: 0, GPair: 0, GTrpl: 0, GGroup: 0, OCl: 1, GCl: 2, EmN: 3, HII: 3, Neb: 3, RfN: 3, SNR: 3, 'Cl+N': 3, PN: 4, '*Ass': 5, Other: 5, Nova: 5 };
const TYPE_KO = ['은하', '산개성단', '구상성단', '성운', '행성상성운', '기타'];
const TYPE_RAW_KO = { G: '은하', GPair: '은하 쌍', GTrpl: '은하 삼중', GGroup: '은하군', OCl: '산개성단', GCl: '구상성단', EmN: '발광성운',
  HII: 'HII 영역', Neb: '성운', RfN: '반사성운', SNR: '초신성 잔해', 'Cl+N': '성단+성운', PN: '행성상성운', '*Ass': '성협', Other: '기타' };
const dsos = [];
const dsoMat = new THREE.ShaderMaterial({
  uniforms: { pxPerDeg: { value: 10 }, pr: { value: 1 }, limit: { value: 10 }, dim: { value: 1 } },
  vertexShader: `
    attribute float size, ratio, pa, kind, mag; attribute vec3 north;
    uniform float pxPerDeg, pr, limit, dim;
    varying float vKind, vRatio, vAng, vA, vSeed;
    void main(){
      vec4 c0 = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      vec4 c1 = projectionMatrix * modelViewMatrix * vec4(position + north * 2.0, 1.0);
      gl_Position = c0;
      vec2 s0 = c0.xy / c0.w, s1 = c1.xy / c1.w;
      vec2 nd = s1 - s0; nd.x *= projectionMatrix[1][1] / projectionMatrix[0][0];
      vAng = atan(nd.y, nd.x) + pa;          // PA measured N -> E (CCW on screen)
      float px = size / 60.0 * pxPerDeg;      // size in arcmin
      float bright = clamp((limit - mag) / 3.0 + 0.35, 0.2, 1.0);
      vA = smoothstep(2.0, 9.0, px) * bright * dim;
      gl_PointSize = clamp(px, 0.0, 2048.0) * pr;
      vKind = kind; vRatio = max(ratio, 0.08); vSeed = fract(sin(dot(position.xy, vec2(12.9898,78.233))) * 43758.5453);
    }`,
  fragmentShader: `
    varying float vKind, vRatio, vAng, vA, vSeed;
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)) + vSeed*91.0) * 43758.5453); }
    void main(){
      if (vA <= 0.002) discard;
      vec2 p = gl_PointCoord * 2.0 - 1.0; p.y = -p.y;
      vec2 u = vec2(cos(vAng), sin(vAng)), w = vec2(-u.y, u.x);
      float along = dot(p,u), across = dot(p,w);
      float r = length(vec2(across, along * vRatio) / vRatio);
      float rr = length(p);
      vec3 col; float I;
      int k = int(vKind + 0.5);
      if (k == 0) { // galaxy: exponential disk + bulge
        I = exp(-r*4.0)*0.75 + exp(-r*r*40.0)*0.8; col = vec3(1.0,0.88,0.72);
      } else if (k == 1) { // open cluster: sprinkled stars
        vec2 g = floor(p*7.0); vec2 f = fract(p*7.0)-0.5;
        float s = step(0.72, h(g)) * exp(-dot(f,f)*40.0);
        I = s*1.2 + 0.05*(1.0-rr); col = vec3(0.75,0.85,1.0); r = rr;
      } else if (k == 2) { // globular
        vec2 g = floor(p*18.0); vec2 f = fract(p*18.0)-0.5;
        float s = step(0.6, h(g)) * exp(-dot(f,f)*30.0) * exp(-rr*2.5);
        I = exp(-rr*rr*9.0)*0.9 + s*0.8; col = vec3(1.0,0.95,0.8); r = rr;
      } else if (k == 3) { // nebula: soft lumpy glow
        float n = h(floor(p*4.0))*0.5 + h(floor(p*9.0))*0.3;
        I = exp(-r*r*2.5) * (0.35 + n*0.5); col = vec3(1.0,0.35,0.45);
      } else if (k == 4) { // planetary nebula: ring
        I = exp(-pow((r-0.55)*5.0,2.0))*0.9 + exp(-r*r*60.0)*0.6; col = vec3(0.45,1.0,0.85);
      } else { I = exp(-rr*rr*6.0)*0.4; col = vec3(0.8); r = rr; }
      I *= smoothstep(1.0, 0.85, r);
      gl_FragColor = vec4(col * I * vA, 1.0);
    }`,
  transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
});
let dsoPoints = null;
function parseHMS(s) { const [h, m, x] = s.split(':').map(Number); return (h + m / 60 + x / 3600) * 15; }
function parseDMS(s) { const sg = s[0] === '-' ? -1 : 1; const [d, m, x] = s.replace(/^[+-]/, '').split(':').map(Number); return sg * (d + m / 60 + x / 3600); }
async function loadNGC() {
  const txt = await fetch(URLS.ngc).then(r => r.text());
  const lines = txt.split('\n'); const hd = lines[0].split(';'); const ix = (n) => hd.indexOf(n);
  const I = { name: ix('Name'), type: ix('Type'), ra: ix('RA'), dec: ix('Dec'), con: ix('Const'), maj: ix('MajAx'), min: ix('MinAx'),
    pa: ix('PosAng'), b: ix('B-Mag'), v: ix('V-Mag'), hub: ix('Hubble'), m: ix('M'), common: ix('Common names'), sb: ix('SurfBr'), z: ix('Redshift') };
  const pos = [], size = [], ratio = [], pa = [], kind = [], mag = [], north = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(';'); if (c.length < 10) continue;
    const t = c[I.type]; if (!(t in TYPE) || !c[I.ra]) continue;
    const ra = parseHMS(c[I.ra]), dec = parseDMS(c[I.dec]);
    const maj = parseFloat(c[I.maj]) || 0.4, mn = parseFloat(c[I.min]) || maj;
    const vm = parseFloat(c[I.v]), bm = parseFloat(c[I.b]);
    const m = !isNaN(vm) ? vm : !isNaN(bm) ? bm : NaN;
    const raw = c[I.name];
    const pretty = raw.replace(/^(NGC|IC)0*(\d+)(.*)$/, '$1 $2$3');
    const messier = c[I.m] ? 'M' + parseInt(c[I.m], 10) : '';
    const v = eqVec(ra, dec);
    const o = { name: pretty, messier, common: (c[I.common] || '').split(',')[0], type: t, kind: TYPE[t], ra, dec, v, maj, min: mn,
      pa: parseFloat(c[I.pa]) || 0, mag: m, con: c[I.con], hubble: c[I.hub], z: c[I.z] };
    dsos.push(o);
    const p = v.clone().multiplyScalar(R_DSO); pos.push(p.x, p.y, p.z);
    size.push(maj); ratio.push(Math.min(1, mn / maj)); pa.push(o.pa * D2R); kind.push(o.kind); mag.push(isNaN(m) ? 13 : m);
    const a = ra * D2R, d = dec * D2R;
    north.push(-Math.sin(d) * Math.cos(a), -Math.sin(d) * Math.sin(a), Math.cos(d));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  for (const [k, arr, n] of [['size', size, 1], ['ratio', ratio, 1], ['pa', pa, 1], ['kind', kind, 1], ['mag', mag, 1], ['north', north, 3]])
    g.setAttribute(k, new THREE.Float32BufferAttribute(arr, n));
  dsoPoints = new THREE.Points(g, dsoMat); dsoPoints.frustumCulled = false; dsoPoints.renderOrder = 3;
  sky.add(dsoPoints);
  return dsos.length;
}

// ---------- exoplanets: NASA Exoplanet Archive (data/exoplanets.json, built by tools/fetch_exoplanets.py) ----------
const exo = { hosts: [], methods: [] };
const EXO_FAMOUS = new Set(['TRAPPIST-1', 'Proxima Cen', '51 Peg', 'Kepler-452', 'TOI-700', 'HD 209458', 'Kepler-186', 'K2-18', 'LHS 1140', 'tau Cet', 'eps Eri', 'HR 8799', 'Kepler-90', 'WASP-12', 'Barnard\'s star', '55 Cnc', 'Gliese 581', 'Kepler-22', 'TOI-270', 'beta Pic', 'Fomalhaut', 'PSR B1257+12', 'Kepler-16']);
const exoMat = new THREE.ShaderMaterial({
  uniforms: { pr: { value: 1 }, alpha: { value: 1 } },
  vertexShader: `attribute float n; uniform float pr; varying float vN;
    void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); vN = n; gl_PointSize = (7.0 + min(n, 7.0)) * pr; }`,
  fragmentShader: `uniform float alpha; varying float vN;
    void main(){ vec2 p = gl_PointCoord * 2.0 - 1.0; float r = length(p);
      float ring = smoothstep(0.62, 0.72, r) * (1.0 - smoothstep(0.86, 0.98, r));
      if (ring <= 0.01) discard; gl_FragColor = vec4(vec3(0.31, 0.89, 0.76) * ring * alpha, 1.0); }`,
  transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
});
let exoPoints = null;
async function loadExo() {
  const js = await fetch('data/exoplanets.json').then(r => r.json());
  exo.methods = js.methods;
  const pos = [], n = [];
  for (const h of js.hosts) {
    if (h[1] == null || h[2] == null) continue;
    const o = { kindName: 'exo', name: h[0], ra: h[1], dec: h[2], dist: h[3], vmag: h[4], teff: h[5], srad: h[6], slum: h[7], planets: h[8], v: eqVec(h[1], h[2]) };
    exo.hosts.push(o);
    const p = o.v.clone().multiplyScalar(R_SKY - 3); pos.push(p.x, p.y, p.z); n.push(o.planets.length);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('n', new THREE.Float32BufferAttribute(n, 1));
  exoPoints = new THREE.Points(g, exoMat); exoPoints.frustumCulled = false; exoPoints.renderOrder = 3; sky.add(exoPoints);
  return exo.hosts.reduce((a, h) => a + h.planets.length, 0);
}
const lumOf = (h) => h.slum != null ? Math.pow(10, h.slum) : (h.srad && h.teff ? h.srad * h.srad * Math.pow(h.teff / 5772, 4) : null);
function systemSVG(h) { // orbits on a log AU axis, with the conservative habitable zone (Kopparapu-like flux limits 1.1 .. 0.36 S_earth)
  const L = lumOf(h), W = 280, H = 120, x0 = 12, x1 = W - 10, lo = -2.3, hi = 2.3;
  const X = (a) => x0 + (Math.log10(Math.max(1e-3, a)) - lo) / (hi - lo) * (x1 - x0);
  const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'sysmap');
  const el = (t, a, txt) => { const e = document.createElementNS(ns, t); for (const k in a) e.setAttribute(k, a[k]); if (txt) e.textContent = txt; svg.appendChild(e); return e; };
  if (L) { const a = X(Math.sqrt(L / 1.1)), b = X(Math.sqrt(L / 0.36)); el('rect', { x: a, y: 14, width: Math.max(2, b - a), height: H - 40, fill: 'rgba(79,227,193,.16)', rx: 4 }); el('text', { x: (a + b) / 2, y: 26, 'text-anchor': 'middle', class: 'hz' }, '생명 가능 지대'); }
  el('line', { x1: x0, x2: x1, y1: H - 26, y2: H - 26, stroke: '#3a4070' });
  for (const t of [0.01, 0.1, 1, 10, 100]) { el('line', { x1: X(t), x2: X(t), y1: H - 29, y2: H - 23, stroke: '#5a6090' }); el('text', { x: X(t), y: H - 10, 'text-anchor': 'middle', class: 'tick' }, `${t} AU`); }
  el('line', { x1: X(1), x2: X(1), y1: 14, y2: H - 26, stroke: 'rgba(142,162,255,.5)', 'stroke-dasharray': '2 3' }); el('text', { x: X(1) + 3, y: H - 32, class: 'tick' }, '지구');
  h.planets.forEach((p, i) => {
    const a = p[1] ?? (p[2] ? Math.pow(p[2] / 365.25, 2 / 3) * Math.pow(L ? Math.pow(L, 0.25) : 1, 1 / 3) : null); if (!a) return;
    const r = Math.max(2.5, Math.min(9, 2.2 * Math.sqrt(p[3] || (p[4] ? Math.pow(p[4], 0.4) : 1.5))));
    const y = 46 + (i % 3) * 16;
    el('circle', { cx: X(a), cy: y, r, fill: p[5] && p[5] < 330 && p[5] > 180 ? '#4FE3C1' : '#F3E2A6' });
    el('text', { x: X(a), y: y - r - 2, 'text-anchor': 'middle', class: 'pl' }, p[0]);
  });
  return svg;
}

// ---------- real imagery (DSS2 color via CDS hips2fits) for selected DSO ----------
let photo = null;
function showPhoto(o) {
  if (photo) { scene.remove(photo); photo.geometry.dispose(); photo.material.map?.dispose(); photo.material.dispose(); photo = null; }
  const img = $('info-img');
  if (!o) { img.hidden = true; return; }
  const fovDeg = Math.min(4, Math.max(0.12, (o.maj || 1) / 60 * 2.2));
  const url = `https://alasky.cds.unistra.fr/hips-image-services/hips2fits?hips=CDS%2FP%2FDSS2%2Fcolor&width=600&height=600&fov=${fovDeg.toFixed(4)}&projection=TAN&coordsys=icrs&ra=${o.ra.toFixed(5)}&dec=${o.dec.toFixed(5)}&format=jpg`;
  img.hidden = false; img.src = url;
  const loader = new THREE.TextureLoader(); loader.setCrossOrigin('anonymous');
  loader.load(url, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = 2 * (R_DSO - 5) * Math.tan(fovDeg / 2 * D2R);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.ShaderMaterial({
      uniforms: { map: { value: tex } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform sampler2D map; varying vec2 vUv; void main(){
        vec2 q = abs(vUv-0.5)*2.0; float e = smoothstep(1.0, 0.8, max(q.x,q.y));
        gl_FragColor = vec4(texture2D(map, vUv).rgb * e, 1.0); }`,
      transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    m.renderOrder = 4; m.userData = { o, fovDeg };
    photo = m; scene.add(m); placePhoto();
  }, undefined, () => {});
}
function placePhoto() {
  if (!photo) return;
  const o = photo.userData.o;
  const p = o.v.clone().applyMatrix4(sky.matrixWorld).normalize().multiplyScalar(R_DSO - 5);
  const a = o.ra * D2R, d = o.dec * D2R;
  const north = new THREE.Vector3(-Math.sin(d) * Math.cos(a), -Math.sin(d) * Math.sin(a), Math.cos(d)).transformDirection(sky.matrixWorld);
  photo.position.copy(p); photo.up.copy(north); photo.lookAt(0, 0, 0);
}

// ---------- solar system ----------
const ELEM = { // JPL approximate elements (J2000 + per-century rates): a e I L varpi Omega
  Mercury: [0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593, 0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
  Venus: [0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255, 0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418],
  Earth: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0, 0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0],
  Mars: [1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891, 0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
  Jupiter: [5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909, -0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
  Saturn: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448, -0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
  Uranus: [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503, -0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589],
  Neptune: [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574, 0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.01262724],
};
function sbHelio(el, jdNow, Mdeg) { // heliocentric ecliptic J2000 (AU) from osculating elements
  const M = (Mdeg ?? (el.ma + el.n * (jdNow - el.epoch))) * D2R, e = el.e;
  let E = e > 0.8 ? Math.PI : M; for (let k = 0; k < 50; k++) { const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E)); E -= dE; if (Math.abs(dE) < 1e-12) break; }
  const xp = el.a * (Math.cos(E) - e), yp = el.a * Math.sqrt(1 - e * e) * Math.sin(E);
  const O = el.om * D2R, I = el.i * D2R, w = el.w * D2R;
  const cO = Math.cos(O), sO = Math.sin(O), ci = Math.cos(I), si = Math.sin(I), cw = Math.cos(w), sw = Math.sin(w);
  return new THREE.Vector3(
    (cw * cO - sw * sO * ci) * xp + (-sw * cO - cw * sO * ci) * yp,
    (cw * sO + sw * cO * ci) * xp + (-sw * sO + cw * cO * ci) * yp,
    (sw * si) * xp + (cw * si) * yp);
}
function helio(name, T, Mdeg) {
  const E0 = ELEM[name];
  const [a, e, I, L, wb, O] = E0.slice(0, 6).map((v, i) => v + E0[i + 6] * T);
  const w = (wb - O) * D2R, M = Mdeg ?? (((L - wb) % 360) + 540) % 360 - 180;
  let E = M * D2R; for (let k = 0; k < 8; k++) E -= (E - e * Math.sin(E) - M * D2R) / (1 - e * Math.cos(E));
  const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cO = Math.cos(O * D2R), sO = Math.sin(O * D2R), ci = Math.cos(I * D2R), si = Math.sin(I * D2R), cw = Math.cos(w), sw = Math.sin(w);
  return new THREE.Vector3(
    (cw * cO - sw * sO * ci) * xp + (-sw * cO - cw * sO * ci) * yp,
    (cw * sO + sw * cO * ci) * xp + (-sw * sO + cw * cO * ci) * yp,
    (sw * si) * xp + (cw * si) * yp);
}
const OBL = 23.43928 * D2R;
const ecl2eq = (v) => new THREE.Vector3(v.x, v.y * Math.cos(OBL) - v.z * Math.sin(OBL), v.y * Math.sin(OBL) + v.z * Math.cos(OBL));
function moonGeo(T) {
  const s = (a, b) => Math.sin((a + b * T) * D2R), c = (a, b) => Math.cos((a + b * T) * D2R);
  const lam = 218.32 + 481267.881 * T + 6.29 * s(135.0, 477198.87) - 1.27 * s(259.3, -413335.36) + 0.66 * s(235.7, 890534.22)
    + 0.21 * s(269.9, 954397.74) - 0.19 * s(357.5, 35999.05) - 0.11 * s(186.5, 966404.03);
  const bet = 5.13 * s(93.3, 483202.02) + 0.28 * s(228.2, 960400.89) - 0.28 * s(318.3, 6003.15) - 0.17 * s(217.6, -407332.21);
  const par = 0.9508 + 0.0518 * c(135.0, 477198.87) + 0.0095 * c(259.3, -413335.36) + 0.0078 * c(235.7, 890534.22) + 0.0028 * c(269.9, 954397.74);
  const r = 6378.14 / Math.sin(par * D2R) / 149597870.7;
  const l = lam * D2R, b = bet * D2R;
  return new THREE.Vector3(r * Math.cos(b) * Math.cos(l), r * Math.cos(b) * Math.sin(l), r * Math.sin(b));
}

// procedural textures
function noiseTex(w, h, paint) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d'); paint(ctx, w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function rnd(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
function banded(colors, seed, turb = 6) {
  return noiseTex(1024, 512, (ctx, w, h) => {
    const r = rnd(seed);
    for (let y = 0; y < h; y++) {
      const t = y / h; const k = Math.floor((Math.sin(t * Math.PI * turb + r() * 0.3) * 0.5 + 0.5) * (colors.length - 1) + r() * 0.6);
      ctx.fillStyle = colors[Math.min(colors.length - 1, k)]; ctx.fillRect(0, y, w, 1);
    }
    ctx.globalAlpha = 0.08;
    for (let i = 0; i < 900; i++) { ctx.fillStyle = colors[Math.floor(r() * colors.length)];
      ctx.beginPath(); ctx.ellipse(r() * w, r() * h, 20 + r() * 80, 2 + r() * 6, 0, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
  });
}
function rocky(base, spots, seed, craters = 0) {
  return noiseTex(1024, 512, (ctx, w, h) => {
    const r = rnd(seed); ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 2500; i++) { ctx.globalAlpha = 0.05 + r() * 0.12; ctx.fillStyle = spots[Math.floor(r() * spots.length)];
      ctx.beginPath(); ctx.arc(r() * w, r() * h, 3 + r() * 40, 0, 7); ctx.fill(); }
    for (let i = 0; i < craters; i++) { const x = r() * w, y = h * 0.1 + r() * h * 0.8, s = 2 + r() * r() * 22;
      ctx.globalAlpha = 0.35; ctx.strokeStyle = '#000'; ctx.lineWidth = 1 + s * 0.15; ctx.beginPath(); ctx.arc(x, y, s, 0, 7); ctx.stroke();
      ctx.globalAlpha = 0.25; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(x - s * 0.15, y - s * 0.15, s, 0, 7); ctx.stroke(); }
    ctx.globalAlpha = 1;
  });
}
const PLANETS = [
  { name: 'Sun', img: 'textures/2k_sun.jpg', ko: '태양', R: 696000, pole: [286.13, 63.87], tex: () => noiseTex(512, 256, (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#ffcf6a'); g.addColorStop(.5, '#fff1b0'); g.addColorStop(1, '#ffcf6a'); c.fillStyle = g; c.fillRect(0, 0, w, h); const r = rnd(3); for (let i = 0; i < 40; i++) { c.fillStyle = 'rgba(120,60,0,.5)'; c.beginPath(); c.arc(r() * w, h * (.35 + r() * .3), 1 + r() * 3, 0, 7); c.fill(); } }), emissive: true, period: 25.4 },
  { name: 'Earth', img: 'textures/2k_earth_daymap.jpg', ko: '지구', R: 6371, pole: [0, 90], tex: () => rocky('#2a4f7a', ['#3d6b3a', '#c9b98c', '#ffffff'], 3), period: 0.99727 },
  { name: 'Moon', img: 'textures/2k_moon.jpg', ko: '달', R: 1737, pole: [270, 66.5], tex: () => rocky('#9a9a98', ['#5d5d5d', '#bdbdb8', '#4a4a4a'], 7, 500), period: 27.32 },
  { name: 'Mercury', img: 'textures/2k_mercury.jpg', ko: '수성', R: 2440, pole: [281.01, 61.41], tex: () => rocky('#8d8378', ['#5a524a', '#b0a798'], 11, 300), period: 58.6 },
  { name: 'Venus', img: 'textures/2k_venus_atmosphere.jpg', ko: '금성', R: 6052, pole: [272.76, 67.16], tex: () => banded(['#e8d29c', '#f1e1b5', '#d9bd80', '#f6ebc9'], 13, 3), period: -243 },
  { name: 'Mars', img: 'textures/2k_mars.jpg', ko: '화성', R: 3390, pole: [317.68, 52.89], tex: () => noiseTex(1024, 512, (c, w, h) => { const r = rnd(17); c.fillStyle = '#b5532c'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 1800; i++) { c.globalAlpha = .08 + r() * .15; c.fillStyle = r() < .5 ? '#5e2a17' : '#d27a4a'; c.beginPath(); c.ellipse(r() * w, h * (.2 + r() * .6), 10 + r() * 60, 5 + r() * 25, r() * 3, 0, 7); c.fill(); }
      c.globalAlpha = .9; c.fillStyle = '#f4efe8'; c.fillRect(0, 0, w, h * .05); c.fillRect(0, h * .95, w, h * .05); c.globalAlpha = 1; }), period: 1.026 },
  { name: 'Jupiter', img: 'textures/2k_jupiter.jpg', ko: '목성', R: 71492, pole: [268.06, 64.5], tex: () => { const t = banded(['#c99e74', '#efe2c8', '#a8724c', '#e3cfae', '#8c5a3c', '#f2e7d2'], 19, 14);
      const c = t.image.getContext('2d'); c.fillStyle = '#b5532c'; c.globalAlpha = .8; c.beginPath(); c.ellipse(620, 330, 40, 18, 0, 0, 7); c.fill(); t.needsUpdate = true; return t; }, period: 0.41 },
  { name: 'Saturn', img: 'textures/2k_saturn.jpg', ko: '토성', R: 60268, pole: [40.59, 83.54], tex: () => banded(['#d9c08c', '#e9d9b0', '#c4a56e', '#f0e4c4'], 23, 10), ring: true, period: 0.44 },
  { name: 'Uranus', img: 'textures/2k_uranus.jpg', ko: '천왕성', R: 25559, pole: [257.31, -15.18], tex: () => banded(['#a6dbe0', '#b5e4e8', '#9ad0d6'], 29, 4), period: -0.72 },
  { name: 'Neptune', img: 'textures/2k_neptune.jpg', ko: '해왕성', R: 24764, pole: [299.36, 43.46], tex: () => banded(['#3f66c8', '#5379d6', '#3456b0', '#6a8fe0'], 31, 6), period: 0.67 },
  // major moons (approximate: Meeus low-accuracy theory for the Galilean moons, circular orbit for Titan)
  { name: 'Io', ko: '이오', parent: 'Jupiter', R: 1822, pole: [268.06, 64.5], tex: () => rocky('#d8c45a', ['#b0742a', '#f1e7a0', '#7a4a1c'], 41), period: 1.769 },
  { name: 'Europa', ko: '유로파', parent: 'Jupiter', R: 1561, pole: [268.06, 64.5], tex: () => rocky('#d9cfbf', ['#a0785a', '#f4efe6'], 43), period: 3.551 },
  { name: 'Ganymede', ko: '가니메데', parent: 'Jupiter', R: 2634, pole: [268.06, 64.5], tex: () => rocky('#8f8578', ['#5d544a', '#c9c2b5'], 47, 120), period: 7.155 },
  { name: 'Callisto', ko: '칼리스토', parent: 'Jupiter', R: 2410, pole: [268.06, 64.5], tex: () => rocky('#5e554b', ['#3b342d', '#a59c8f'], 53, 400), period: 16.689 },
  { name: 'Ceres', ko: '세레스', img: 'textures/2k_ceres_fictional.jpg', R: 470, pole: [291.4, 66.8], period: 0.378, small: '왜행성',
    sb: { epoch: 2461200.5, a: 2.765552595034094, e: .07969229514816586, i: 10.58802780183462, om: 80.24862682043221, w: 73.29421453021587, ma: 274.4193463761342, n: .21430445064843 } },
  { name: 'Vesta', ko: '베스타', R: 263, pole: [309, 42], period: 0.223, small: '소행성', tex: () => rocky('#8f8a80', ['#5f5a52', '#b8b2a6'], 61, 200),
    sb: { epoch: 2461200.5, a: 2.361365965127599, e: .09020374382834395, i: 7.143925545058711, om: 103.701293265032, w: 151.4686478221564, ma: 81.19015607686903, n: .2716183613599909 } },
  { name: 'Pluto', ko: '명왕성', R: 1188, pole: [132.99, -6.16], period: -6.387, small: '왜행성', tex: () => rocky('#c9a982', ['#6b4a35', '#efe2cf', '#8a6a52'], 67),
    sb: { epoch: 2457588.5, a: 39.58862938517124, e: .2518378778576892, i: 17.14771140999114, om: 110.2923840543057, w: 113.7090015158565, ma: 38.68366347318184, n: .003956838955553025 } },
  { name: 'Eris', ko: '에리스', img: 'textures/2k_eris_fictional.jpg', R: 1163, pole: [0, 90], period: 15.8, small: '왜행성',
    sb: { epoch: 2461200.5, a: 67.93394687853566, e: .4382385347971672, i: 43.9258279471791, om: 36.00477044417249, w: 150.7949235840312, ma: 211.774434275007, n: .001760247770619088 } },
  { name: 'Haumea', ko: '하우메아', img: 'textures/2k_haumea_fictional.jpg', R: 780, pole: [0, 90], period: 0.163, small: '왜행성',
    sb: { epoch: 2461200.5, a: 43.06029023650952, e: .1944430148898797, i: 28.20847393040364, om: 121.7860561329425, w: 240.6905472508661, ma: 223.2104118812299, n: .003488097731816818 } },
  { name: 'Makemake', ko: '마케마케', img: 'textures/2k_makemake_fictional.jpg', R: 715, pole: [0, 90], period: 0.95, small: '왜행성',
    sb: { epoch: 2461200.5, a: 45.57093317300052, e: .1588889953992523, i: 29.02785603743067, om: 79.2948338209406, w: 297.0922733397207, ma: 169.9379962048232, n: .003203850120050116 } },
  { name: 'Halley', ko: '핼리 혜성', R: 5.5, pole: [0, 90], period: 2.2, small: '혜성 (1P)', tex: () => rocky('#3a342e', ['#1e1a17', '#5a5048'], 71, 60),
    sb: { epoch: 2439875.5, a: 17.92863504856923, e: .9679359956953211, i: 162.1905300439129, om: 59.09894720612437, w: 112.2414314637764, ma: 274.3823371366792, n: .01298324443268444 } },
  { name: 'Titan', ko: '타이탄', parent: 'Saturn', R: 2575, pole: [40.59, 83.54], tex: () => banded(['#d29a4a', '#c88c3c', '#ddb070'], 59, 3), period: 15.945 },
];
const KM_AU = 149597870.7;
const planetMat = (tex, emissive) => new THREE.ShaderMaterial({
  uniforms: { map: { value: tex }, night: { value: null }, hasNight: { value: 0 }, sunDir: { value: new THREE.Vector3(1, 0, 0) }, emissive: { value: emissive ? 1 : 0 } },
  vertexShader: `#include <common>
    #include <logdepthbuf_pars_vertex>
    varying vec2 vUv; varying vec3 vN; void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
    #include <logdepthbuf_vertex>
    }`,
  fragmentShader: `#include <logdepthbuf_pars_fragment>
    uniform sampler2D map, night; uniform float hasNight; uniform vec3 sunDir; uniform float emissive; varying vec2 vUv; varying vec3 vN;
    void main(){
      #include <logdepthbuf_fragment>
      float ndl = dot(normalize(vN), sunDir);
      vec3 c = texture2D(map, vUv).rgb; float l = emissive > 0.5 ? 1.2 : max(ndl, 0.0) * 1.15 + 0.025;
      // the Sun map is a filtered (orange) image; to the eye the photosphere is near-white, keep only a hint of granulation
      if (emissive > 0.5) { c = mix(vec3(1.0, 0.97, 0.9), c, 0.18); l = 1.25; }
      vec3 col = c * l;
      if (hasNight > 0.5) col += texture2D(night, vUv).rgb * (1.0 - smoothstep(-0.12, 0.08, ndl)) * 1.3; // city lights on the night side
      gl_FragColor = vec4(col, 1.0); }`,
  depthTest: true, depthWrite: true,
});
const texLoader = new THREE.TextureLoader();
const planetGroup = new THREE.Group(); planetScene.add(planetGroup);
for (const p of PLANETS) {
  p.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), planetMat(p.tex ? p.tex() : rocky('#8a8580', ['#5a5650', '#b0aaa0'], 5), p.emissive));
  p.mesh.renderOrder = 5;
  // real texture maps (Solar System Scope, CC BY 4.0); procedural map stays as fallback
  if (p.name === 'Earth') texLoader.load('textures/2k_earth_nightmap.jpg', (t) => { t.colorSpace = THREE.SRGBColorSpace; p.mesh.material.uniforms.night.value = t; p.mesh.material.uniforms.hasNight.value = 1; });
  if (p.img) texLoader.load(p.img, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; p.mesh.material.uniforms.map.value = t; });
  if (p.ring) {
    const rg = new THREE.RingGeometry(1.11, 2.33, 128, 1);
    const pos = rg.attributes.position, uv = rg.attributes.uv;
    for (let i = 0; i < pos.count; i++) { const r = Math.hypot(pos.getX(i), pos.getY(i)); uv.setXY(i, (r - 1.11) / 1.22, 0.5); }
    const rt = noiseTex(512, 4, (c, w) => { const r = rnd(5); for (let x = 0; x < w; x++) { const t = x / w;
      const a = (t > 0.52 && t < 0.57) ? 0.05 : (0.35 + r() * 0.5) * (t < 0.15 ? 0.4 : 1); c.fillStyle = `rgba(${215 + r() * 30},${190 + r() * 30},${150 + r() * 30},${a})`; c.fillRect(x, 0, 1, 4); } });
    const ringMat = new THREE.ShaderMaterial({ uniforms: { map: { value: rt }, sunDir: { value: new THREE.Vector3() } },
      vertexShader: `#include <common>
        #include <logdepthbuf_pars_vertex>
        varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        #include <logdepthbuf_vertex>
        }`,
      fragmentShader: `#include <logdepthbuf_pars_fragment>
        uniform sampler2D map; varying vec2 vUv; void main(){
        #include <logdepthbuf_fragment>
        vec4 t = texture2D(map, vUv); gl_FragColor = vec4(t.rgb*0.9, t.a); }`,
      side: THREE.DoubleSide, transparent: true, depthWrite: false });
    texLoader.load('textures/2k_saturn_ring_alpha.png', (t) => { t.colorSpace = THREE.SRGBColorSpace; ringMat.uniforms.map.value = t; });
    const ring = new THREE.Mesh(rg, ringMat); ring.rotation.x = -Math.PI / 2; ring.renderOrder = 6; p.mesh.add(ring);
  }
  if (p.emissive) {
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: noiseTex(256, 256, (c, w, h) => { const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,252,240,1)'); g.addColorStop(.2, 'rgba(255,244,220,.45)'); g.addColorStop(1, 'rgba(255,236,200,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); }),
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    glow.scale.setScalar(8); p.mesh.add(glow); p.glow = glow;
  }
  planetGroup.add(p.mesh);
}
function moonOffsets(T, geo) { // equatorial offsets (AU) from the parent planet
  const JD = T * 36525 + 2451545.0, d = JD - 2451545.0, sd = (x) => Math.sin(x * D2R), cd = (x) => Math.cos(x * D2R);
  const V = 172.74 + 0.00111588 * d, M = 357.529 + 0.9856003 * d;
  const N = 20.020 + 0.0830853 * d + 0.329 * sd(V), J = 66.115 + 0.9025179 * d - 0.329 * sd(V);
  const A = 1.915 * sd(M) + 0.020 * sd(2 * M), B = 5.555 * sd(N) + 0.168 * sd(2 * N), K = J + A - B;
  const R = 1.00014 - 0.01671 * cd(M) - 0.00014 * cd(2 * M), r = 5.20872 - 0.25208 * cd(N) - 0.00611 * cd(2 * N);
  const Dl = Math.sqrt(r * r + R * R - 2 * r * R * cd(K)), psi = Math.asin(R / Dl * sd(K)) * R2D, t = d - Dl / 173;
  const u = [163.8069 + 203.4058646 * t, 358.4140 + 101.2916335 * t, 5.7176 + 50.2345180 * t, 224.8092 + 21.4879800 * t].map(x => x + psi - B);
  const rad = [5.9057, 9.3966, 14.9883, 26.3627].map(x => x * 71492 / KM_AU);
  const out = {};
  // e_away: Earth->Jupiter projected on Jupiter's equator; e_side: toward celestial west (Meeus X > 0)
  const Pj = eqVec(268.06, 64.5), away = ecl2eq(geo.Jupiter).normalize();
  const ea = away.clone().addScaledVector(Pj, -away.dot(Pj)).normalize();
  const { ra } = vecToRaDec(away); const west = new THREE.Vector3(Math.sin(ra * D2R), -Math.cos(ra * D2R), 0);
  const es = west.addScaledVector(Pj, -west.dot(Pj)).addScaledVector(ea, -west.dot(ea)).normalize();
  ['Io', 'Europa', 'Ganymede', 'Callisto'].forEach((n, i) => out[n] = ea.clone().multiplyScalar(rad[i] * cd(u[i])).addScaledVector(es, rad[i] * sd(u[i])));
  const P = eqVec(40.59, 83.54), n1 = new THREE.Vector3(0, 0, 1).cross(P).normalize(), n2 = P.clone().cross(n1);
  const ut = 261.1582 + 22.57697855 * (JD - 2411093.0), rt = 1221870 / KM_AU;
  out.Titan = n1.multiplyScalar(rt * cd(ut)).addScaledVector(n2, rt * sd(ut));
  return out;
}
const rotOnly = new THREE.Matrix3();
function orientBody(p) {
  if (p.name === 'Earth') { // texture longitude 0 (u = 0.5) faces the Greenwich meridian: sidereal time sets the spin
    const g = lstDeg(state.time, 0) * D2R;
    const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(Math.cos(g), Math.sin(g), 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(Math.sin(g), -Math.cos(g), 0));
    p.mesh.quaternion.setFromRotationMatrix(m.premultiply(new THREE.Matrix4().extractRotation(sky.matrixWorld))); return;
  }
  const pole = eqVec(p.pole[0], p.pole[1]).transformDirection(sky.matrixWorld);
  p.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pole);
  p.mesh.rotateY(((jd(state.time) / p.period) % 1) * Math.PI * 2);
}
// ---------- spacecraft ----------
// Positions come from JPL Horizons (data/probes.json, built by tools/fetch_probes.py): Sun-centred ICRF vectors
// sampled every few hours to days, linearly interpolated. Models are drawn at true size (half-extent in metres).
const PROBES = [
  { name: 'Voyager 1', ko: '보이저 1호', model: 'voyager', size: 9, launch: 1977, note: '2012년 태양권을 벗어나 성간 공간에 들어간 첫 탐사선' },
  { name: 'Voyager 2', ko: '보이저 2호', model: 'voyager', size: 9, launch: 1977, note: '천왕성과 해왕성을 방문한 유일한 탐사선' },
  { name: 'New Horizons', ko: '뉴호라이즌스', model: 'nh', size: 2.5, launch: 2006, note: '2015년 명왕성, 2019년 아로코스 근접 통과' },
  { name: 'Pioneer 10', ko: '파이어니어 10호', model: 'pioneer', size: 5, launch: 1972, note: '목성을 처음 근접 관측. 2003년 교신 종료' },
  { name: 'Pioneer 11', ko: '파이어니어 11호', model: 'pioneer', size: 5, launch: 1973, note: '토성을 처음 근접 관측. 1995년 교신 종료' },
  { name: 'JWST', ko: '제임스 웹 우주망원경', model: 'jwst', size: 11, launch: 2021, note: '태양-지구 L2 점 주변 헤일로 궤도의 적외선 우주망원경' },
  { name: 'Juno', ko: '주노', model: 'juno', size: 10, launch: 2011, note: '목성 극궤도 탐사선' },
  { name: 'Parker Solar Probe', ko: '파커 태양 탐사선', model: 'parker', size: 1.5, launch: 2018, note: '태양에 가장 가까이 다가간 인공물. 근일점 속도 약 190 km/s' },
  { name: 'Solar Orbiter', ko: '솔라 오비터', model: null, size: 9, launch: 2020, note: 'ESA·NASA 태양 극지방 관측선' },
  { name: 'BepiColombo', ko: '베피콜롬보', model: null, size: 15, launch: 2018, note: 'ESA·JAXA 수성 탐사선. 2026년 수성 궤도 진입 예정' },
  { name: 'Juice', ko: '주스', model: null, size: 13, launch: 2023, note: 'ESA 목성 얼음 위성 탐사선. 2031년 목성 도착 예정' },
  { name: 'Europa Clipper', ko: '유로파 클리퍼', model: null, size: 15, launch: 2024, note: '목성 위성 유로파 탐사선. 2030년 목성 도착 예정' },
  { name: 'Lucy', ko: '루시', model: null, size: 7.5, launch: 2021, note: '목성 트로이 소행성군 탐사선' },
  { name: 'Psyche', ko: '프시케', model: null, size: 12, launch: 2023, note: '금속 소행성 프시케 탐사선. 2029년 도착 예정' },
];
function probeModel() { // placeholder for craft without a NASA model: bus, dish and two solar wings, unit radius
  const g = new THREE.Group();
  const mat = (c, m = 0.4) => new THREE.MeshStandardMaterial({ color: c, metalness: m, roughness: 0.5 });
  const bus = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.34), mat(0xc8a24a, 0.7)); g.add(bus);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 6, 0, Math.PI * 2, 0, 0.6), mat(0xeeeeee, 0.1));
  dish.material.side = THREE.DoubleSide; dish.rotation.x = -Math.PI / 2; dish.position.z = 0.3; g.add(dish);
  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.01, 0.26), mat(0x1d2b5c, 0.6));
    wing.position.x = s * 0.55; g.add(wing);
  }
  return g;
}
const probeSun = new THREE.DirectionalLight(0xffffff, 3.2); planetScene.add(probeSun, probeSun.target, new THREE.AmbientLight(0xaab2d0, 0.5));
// metal foil and panels need something to reflect; a soft studio environment stands in for sunlit space + Earth/planet glow
planetScene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
planetScene.environmentIntensity = 0.55;
const trails = new THREE.Group(); planetScene.add(trails); // flown path, drawn in absolute coordinates like the orbit lines
for (const d of PROBES) {
  const p = Object.assign(d, { probe: true, R: d.size / 1000, pole: [0, 90], period: 1, active: false });
  p.mesh = probeModel(); planetGroup.add(p.mesh); PLANETS.push(p);
}
// NASA 3D Resources models (public domain, github.com/nasa/NASA-3D-Resources) replace the placeholder once loaded
function fitUnit(obj) { // center the model and scale it to a unit bounding sphere
  obj.traverse((m) => { if (m.isMesh) for (const mt of [].concat(m.material)) { mt.side = THREE.DoubleSide; mt.transparent = false; mt.depthWrite = true; mt.alphaTest = mt.alphaTest || 0; } });
  const box = new THREE.Box3().setFromObject(obj), c = box.getCenter(new THREE.Vector3()), r = box.getSize(new THREE.Vector3()).length() / 2;
  const g = new THREE.Group(); obj.position.sub(c); g.add(obj); g.scale.setScalar(1 / r); return g;
}
function swapModel(model, obj) {
  const ps = PROBES.filter(p => p.model === model);
  ps.forEach((p, i) => { p.mesh.clear(); p.mesh.add(i ? obj.clone(true) : obj); });
}
const gltfLoader = new GLTFLoader(); // NASA's .glb files are Draco-compressed
gltfLoader.setDRACOLoader(new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/gltf/'));
for (const p of PROBES) if (!p.model) { const c = buildCraft(p.name); if (c) { p.mesh.clear(); p.mesh.add(fitUnit(c)); } }
for (const m of ['voyager', 'pioneer', 'jwst', 'juno', 'parker']) gltfLoader.load(`models/${m}.glb`, (g) => swapModel(m, fitUnit(g.scene)), undefined, (e) => console.warn('model', m, e.message));
(async () => { // New Horizons ships as 3D-printing STL parts; assemble them with flight-like materials
  const stl = new STLLoader(), parts = { antenna: 0xe8e6e0, body: 0xd8b25a, body_l: 0xd8b25a, body_r: 0xd8b25a, rtg: 0x4c4f57 };
  const g = new THREE.Group();
  try {
    await Promise.all(Object.entries(parts).map(async ([n, c]) => {
      const geo = await stl.loadAsync(`models/nh_${n}.stl`); geo.computeVertexNormals();
      g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: c, metalness: n === 'antenna' ? 0.1 : 0.6, roughness: 0.45 })));
    }));
    swapModel('nh', fitUnit(g));
  } catch (e) { /* keep placeholder */ }
})();
// ephemerides
const probeEph = {};
fetch('data/probes.json').then(r => r.json()).then(js => {
  for (const [n, e] of Object.entries(js)) {
    probeEph[n] = { jd0: e.jd0, step: e.step, xyz: Float64Array.from(e.xyz) };
    const pts = new Float32Array(e.xyz); // absolute Mkm
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pts, 3)); geo.setDrawRange(0, 0);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x4fe3c1, transparent: true, opacity: 0.45 }));
    line.frustumCulled = false; line.userData.name = n; trails.add(line);
  }
}).catch(() => {});
function probeHelio(p, jdNow) { // equatorial, 10^6 km, or null outside the ephemeris span
  const e = probeEph[p.name]; if (!e) return null;
  const n = e.xyz.length / 3, f = (jdNow - e.jd0) / e.step;
  if (f < 0 || f > n - 1) return null;
  const i = Math.min(n - 2, Math.floor(f)), t = f - i, a = i * 3, b = a + 3, x = e.xyz;
  return new THREE.Vector3(x[a] + (x[b] - x[a]) * t, x[a + 1] + (x[b + 1] - x[a + 1]) * t, x[a + 2] + (x[b + 2] - x[a + 2]) * t);
}
function probeSpeed(p, jdNow) { // km/s, heliocentric
  const a = probeHelio(p, jdNow - 0.5), b = probeHelio(p, jdNow + 0.5);
  return a && b ? a.distanceTo(b) * 1e6 / 86400 : NaN;
}
function updateTrails(jdNow) {
  for (const l of trails.children) {
    const e = probeEph[l.userData.name], n = e.xyz.length / 3;
    l.geometry.setDrawRange(0, Math.max(0, Math.min(n, Math.floor((jdNow - e.jd0) / e.step) + 1)));
  }
}
function placeProbe(p, rel, earthRel, sunRel, minScale) { // rel: camera->probe in world units
  const d = rel.length();
  p.world = rel.clone().divideScalar(d); p.camDist = d;
  p.mesh.position.copy(rel);
  p.mesh.scale.setScalar(Math.max(p.R / 1e6, minScale)); // true size: invisible until you are close
  p.mesh.lookAt(earthRel); // high-gain antenna side toward Earth
  if (sunRel && (sp.target === p || sp.flight?.p === p)) { probeSun.position.copy(rel).add(sunRel.clone().sub(rel).normalize()); probeSun.target.position.copy(rel); probeSun.target.updateMatrixWorld(); }
  p.rpx = Math.atan(p.mesh.scale.x / d) / (view.fov / 2 * D2R) * innerHeight / 2;
}

// Absolute magnitudes H (V band). Planets: Mallama & Hilton 2018, simplified to a linear phase term; moons and small bodies: JPL.
const HMAG = { Mercury: [-0.6, 0.038], Venus: [-4.4, 0.012], Mars: [-1.6, 0.016], Jupiter: [-9.4, 0.005], Saturn: [-8.9, 0.044], Uranus: [-7.1, 0.002], Neptune: [-7.0, 0.0],
  Moon: [0.21, 0.026], Io: [-1.7, 0.02], Europa: [-1.4, 0.02], Ganymede: [-2.1, 0.02], Callisto: [-1.1, 0.02], Titan: [-1.2, 0.02],
  Ceres: [3.33, 0.03], Vesta: [3.2, 0.03], Pluto: [-0.4, 0.04], Eris: [-1.1, 0.0], Haumea: [0.2, 0.0], Makemake: [-0.2, 0.0] };
function apparentMag(p, r, delta, alphaDeg) { // r: Sun distance, delta: observer distance (AU)
  if (p.name === 'Sun') return -26.74 + 5 * Math.log10(delta);
  if (p.name === 'Halley') return 5.5 + 5 * Math.log10(delta) + 10 * Math.log10(r); // total (coma) magnitude, comet law
  if (p.probe) return 30;
  const base = 5 * Math.log10(r * delta), A = alphaDeg;
  if (p.name === 'Venus' && A > 163.7) return 236.05828 + base - 2.81914 * A + 8.39034e-3 * A ** 2; // near inferior conjunction
  if (p.name === 'Venus') return -4.384 + base - 0.01044 * A + 3.687e-4 * A ** 2 - 2.814e-6 * A ** 3 + 8.938e-9 * A ** 4; // Mallama & Hilton 2018 (A < 163.7)
  if (p.name === 'Mercury') return -0.613 + base + 6.328e-2 * A - 1.6336e-3 * A ** 2 + 3.3644e-5 * A ** 3 - 3.4265e-7 * A ** 4 + 1.6893e-9 * A ** 5 - 3.0334e-12 * A ** 6;
  const h = HMAG[p.name]; if (!h) return 99;
  return h[0] + 5 * Math.log10(r * delta) + h[1] * alphaDeg;
}

function updatePlanets() {
  if (mode.space) return updateSpace();
  const T = (jd(state.time) - 2451545.0) / 36525;
  const earth = helio('Earth', T);
  const geo = {}; // geocentric ecliptic AU
  geo.Sun = earth.clone().negate();
  geo.Moon = moonGeo(T);
  for (const n of ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune']) geo[n] = helio(n, T).sub(earth);
  for (const p of PLANETS) if (p.sb) geo[p.name] = sbHelio(p.sb, jd(state.time)).sub(earth);
  const minAng0 = view.fov * D2R * 0.0045;
  let minAng = minAng0;
  const mo = moonOffsets(T, geo); rotOnly.setFromMatrix4(sky.matrixWorld);
  for (const p of PLANETS) {
    if (p.name === 'Earth') { p.mesh.visible = false; p.world = null; continue; }
    if (p.probe) {
      const hp = probeHelio(p, jd(state.time)); p.active = !!hp;
      if (!hp) { p.mesh.visible = false; p.world = null; continue; }
      const earthEq = ecl2eq(earth).multiplyScalar(MKM_AU), gq = hp.clone().sub(earthEq);
      p.dist = gq.length() / MKM_AU; p.helioAU = hp.length() / MKM_AU;
      const rd = vecToRaDec(gq); p.ra = rd.ra; p.dec = rd.dec;
      const w = eqVec(rd.ra, rd.dec).applyMatrix4(sky.matrixWorld).normalize();
      placeProbe(p, w.clone().multiplyScalar(R_PLANET), new THREE.Vector3(), null, R_PLANET * Math.tan(minAng * 0.4));
      p.mag = 30; p.mesh.visible = $('t-probes').checked && !(groundOn() && w.y < -0.003); continue; // ~30 mag: only as a position marker
    }
    let g = geo[p.name];
    if (p.parent) { // offset is equatorial; rotate back to ecliptic to share the geo[] frame
      const o = mo[p.name];
      g = geo[p.name] = geo[p.parent].clone().add(new THREE.Vector3(o.x, o.y * Math.cos(OBL) + o.z * Math.sin(OBL), -o.y * Math.sin(OBL) + o.z * Math.cos(OBL)));
    }
    const eq = ecl2eq(g), dist = g.length();
    { const r0 = geo.Sun.clone().sub(g).length(), a0 = 0; const m0 = apparentMag(p, r0, dist, a0); minAng = minAng0 * Math.max(0.35, Math.min(1.6, 0.25 * (starMat.uniforms.limit.value - m0) + 0.3)); }
    const sunEq = ecl2eq(geo.Sun.clone().sub(g)).normalize();
    p.eq = eq.clone().normalize(); const rd = vecToRaDec(p.eq); p.ra = rd.ra; p.dec = rd.dec; p.dist = dist;
    p.angR = Math.atan(p.R / KM_AU / dist); // true angular radius (rad)
    const world = p.eq.clone().applyMatrix4(sky.matrixWorld).normalize();
    const R = R_PLANET * (p.name === 'Moon' ? 0.9 : p.name === 'Sun' ? 0.95 : 1); // keep Moon in front of Sun for eclipses
    p.world = world;
    p.phase = (1 + sunEq.dot(p.eq.clone().negate())) / 2; // illuminated fraction
    p.mag = apparentMag(p, geo.Sun.clone().sub(g).length(), dist, Math.acos(Math.max(-1, Math.min(1, sunEq.dot(p.eq.clone().negate())))) * R2D);
    p.mesh.position.copy(world).multiplyScalar(R);
    p.mesh.scale.setScalar(R * Math.tan(Math.max(p.angR, minAng)));
    if (p.parent) { // true 3D placement around the parent so moons pass in front of / behind it
      const par = PLANETS.find(q => q.name === p.parent), k = R_PLANET / par.dist;
      p.mesh.position.copy(par.mesh.position).add(ecl2eq(g.clone().sub(geo[p.parent])).applyMatrix3(rotOnly).multiplyScalar(k));
      p.mesh.scale.setScalar(Math.max(k * p.R / KM_AU, R * Math.tan(minAng * 0.5)));
      p.mesh.visible = view.fov < 3;
    } else p.mesh.visible = true;
    if (groundOn() && world.y < -0.003) p.mesh.visible = false;
    if (p.mag > starMat.uniforms.limit.value + 0.3) p.mesh.visible = false; // fainter than anything visible at this zoom
    p.rpx = Math.atan(p.mesh.scale.x / p.mesh.position.length()) / (view.fov / 2 * D2R) * innerHeight / 2;
    orientBody(p);
    p.mesh.material.uniforms.sunDir.value.copy(sunEq.transformDirection(sky.matrixWorld));
    if (p.glow) p.glow.scale.setScalar(Math.max(8, 0.15 * view.fov * D2R * R / p.mesh.scale.x));
  }
}

// ---------- ground & horizon ----------
const groundMat = new THREE.ShaderMaterial({
  uniforms: { light: { value: 0.5 } },
  vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform float light; varying vec3 vP;
    float h1(float x){ return fract(sin(x * 127.1) * 43758.5453); }
    float n1(float x){ float i = floor(x), f = fract(x); return mix(h1(i), h1(i + 1.0), f * f * (3.0 - 2.0 * f)); }
    float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
    float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * n2(p); p *= 2.03; a *= 0.5; } return v; }
    void main(){
      vec3 d = normalize(vP); float alt = asin(d.y); float az = atan(d.x, -d.z);
      // distant hills + tree line silhouette (radians above the horizon)
      float hills = 0.018 + 0.016 * sin(az * 2.0 + 0.7) + 0.010 * sin(az * 5.0 + 2.1) + 0.005 * sin(az * 13.0 + 0.3) + 0.008 * n1(az * 9.0);
      float grove = smoothstep(0.45, 0.75, n1(az * 6.0 + 3.0));
      float trees = grove * (0.010 + 0.014 * n1(az * 70.0)) * (0.55 + 0.45 * pow(abs(sin(az * 160.0)), 0.6));
      float top = hills + trees;
      if (alt > top) discard;
      vec3 col;
      if (alt > 0.0) col = vec3(0.025, 0.032, 0.03);       // silhouette above the horizon line
      else {
        vec2 uv = d.xz / (0.03 - d.y);                     // project onto the ground plane
        float detail = 1.0 - smoothstep(-0.12, 0.0, alt);  // fade texture detail toward the horizon (avoids shimmer)
        float g = mix(0.5, fbm(uv * 6.0), detail), dirt = smoothstep(0.55, 0.75, fbm(uv * 0.8 + 7.0));
        vec3 grass = mix(vec3(0.09, 0.12, 0.06), vec3(0.19, 0.22, 0.10), g);
        col = mix(grass, vec3(0.20, 0.16, 0.11) * (0.7 + 0.6 * g), dirt * detail);
        col = mix(col, vec3(0.05, 0.06, 0.07), smoothstep(-0.05, 0.0, alt) * 0.7); // horizon haze
      }
      gl_FragColor = vec4(col * light, 1.0);
    }`,
  side: THREE.BackSide, depthTest: false, depthWrite: false, transparent: true, // transparent: sorted after the (transparent) stars so it covers them
});
const ground = new THREE.Mesh(new THREE.SphereGeometry(800, 96, 48), groundMat);
ground.renderOrder = 10; scene.add(ground);
const groundOn = () => !mode.space && $('t-ground').checked;
const cardinals = [['N', 0], ['NE', 45], ['E', 90], ['SE', 135], ['S', 180], ['SW', 225], ['W', 270], ['NW', 315]]
  .map(([n, az]) => ({ name: n, w: new THREE.Vector3(Math.sin(az * D2R), 0.005, -Math.cos(az * D2R)) }));

// ---------- camera ----------
function viewDir(az = view.az, alt = view.alt) {
  const a = az * D2R, h = alt * D2R;
  return new THREE.Vector3(Math.sin(a) * Math.cos(h), Math.sin(h), -Math.cos(a) * Math.cos(h));
}
const camFwd = () => new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
function dirToAzAlt(v) { return { az: ((Math.atan2(v.x, -v.z) * R2D) + 360) % 360, alt: Math.asin(Math.max(-1, Math.min(1, v.y))) * R2D }; }
function updateCamera() {
  if (mode.space) { camera.fov = view.fov; camera.updateProjectionMatrix(); camera.position.set(0, 0, 0); camera.quaternion.copy(sp.quat); camera.updateMatrixWorld(); return; }
  camera.fov = view.fov; camera.updateProjectionMatrix();
  camera.position.set(0, 0, 0); camera.up.set(0, 1, 0);
  camera.lookAt(viewDir());
  camera.updateMatrixWorld();
}
function resize() {
  const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = pcam.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

// ---------- interaction ----------
const pointers = new Map(); let dragMoved = 0, pinchDist = 0;
canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, [e.clientX, e.clientY]); dragMoved = 0; canvas.classList.add('drag');
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinchDist = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
canvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  const [px, py] = pointers.get(e.pointerId); const dx = e.clientX - px, dy = e.clientY - py;
  pointers.set(e.pointerId, [e.clientX, e.clientY]);
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (pinchDist) zoomBy(pinchDist / d); pinchDist = d; return; }
  dragMoved += Math.abs(dx) + Math.abs(dy);
  if (dragMoved < 3) return;
  if (mode.space) return spaceDrag(dx, dy);
  tracking = null; flight = null;
  const dpp = view.fov / innerHeight;
  view.az = (view.az - dx * dpp / Math.max(0.15, Math.cos(view.alt * D2R)) + 360) % 360;
  view.alt = Math.max(-89.9, Math.min(89.9, view.alt + dy * dpp));
});
canvas.addEventListener('pointerup', (e) => { pointers.delete(e.pointerId); pinchDist = 0; canvas.classList.remove('drag');
  if (dragMoved < 4 && pointers.size === 0) select(pick(e.clientX, e.clientY)); });
canvas.addEventListener('dblclick', (e) => { const o = pick(e.clientX, e.clientY); if (o) { select(o); flyTo(o); } });
const keys = new Set();
addEventListener('keydown', (e) => { if (e.target.tagName !== 'INPUT') keys.add(e.code); });
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoomBy(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
function zoomBy(f) { if (mode.space) return spaceZoom(f);
  view.fov = Math.max(0.0008, Math.min(110, view.fov * f)); }

// ---------- object model / picking ----------
const tmp = new THREE.Vector3();
function worldOf(o) { return o.planet ? o.p.world.clone() : o.v.clone().applyMatrix4(sky.matrixWorld).normalize(); }
function toScreen(w) {
  tmp.copy(w).multiplyScalar(900).project(camera);
  if (tmp.z > 1 || tmp.z < -1) return null;
  return [(tmp.x + 1) / 2 * innerWidth, (1 - tmp.y) / 2 * innerHeight];
}
function starObj(i) { return { kindName: 'star', i, v: starData.pos[i], name: starData.proper[i] || starData.name[i] || `HIP ${starData.id[i]}`, mag: starData.mag[i] }; }
function dsoObj(o) { return Object.assign(o, { kindName: 'dso' }); }
function planetObj(p) { return { kindName: 'planet', planet: true, p, name: p.ko }; }
function pick(x, y) {
  const fwd = camFwd(); const cosLim = Math.cos(Math.min(89, view.fov) * D2R);
  let best = null, bd = 18;
  const test = (w, mk, bonus = 0) => { if (w.dot(fwd) < cosLim) return; const s = toScreen(w); if (!s) return;
    const d = Math.hypot(s[0] - x, s[1] - y) - bonus; if (d < bd) { bd = d; best = mk; } };
  for (const p of PLANETS) if (p.world && p.mesh.visible) {
    const s = toScreen(p.world);
    if (s && Math.hypot(s[0] - x, s[1] - y) < Math.max(14, p.rpx)) return planetObj(p);
  }
  const lim = starMat.uniforms.limit.value;
  for (let i = 0; i < starData.pos.length; i++) { if (starData.mag[i] > lim) continue;
    const w = tmp.copy(starData.pos[i]).applyMatrix4(sky.matrixWorld).normalize().clone(); test(w, i, (lim - starData.mag[i]) * 0.8); }
  if (typeof best === 'number') best = starObj(best);
  if (exoPoints?.visible) for (const h of exo.hosts) {
    const w = h.v.clone().applyMatrix4(sky.matrixWorld); if (w.dot(fwd) < cosLim) continue;
    const s = toScreen(w); if (!s) continue; const d = Math.hypot(s[0] - x, s[1] - y) - 3; if (d < bd) { bd = d; best = h; } }
  if ($('t-dso').checked) {
    const ppd = innerHeight / view.fov;
    for (const o of dsos) { const px = o.maj / 60 * ppd; if (px < 4 && !(o.messier && view.fov < 60)) continue;
      const w = o.v.clone().applyMatrix4(sky.matrixWorld).normalize(); if (w.dot(fwd) < cosLim) continue;
      const s = toScreen(w); if (!s) continue; const d = Math.hypot(s[0] - x, s[1] - y) - Math.min(px / 2, 60) - 4;
      if (d < bd) { bd = d; best = dsoObj(o); } }
  }
  return best;
}

let selected = null, flight = null;
// Wikipedia summary for the selected object (Korean first, English fallback). Titles are candidates; redirects are followed.
const WIKI_KO = { Sun: '태양', Moon: '달', Earth: '지구', Mercury: '수성', Venus: '금성', Mars: '화성', Jupiter: '목성', Saturn: '토성', Uranus: '천왕성', Neptune: '해왕성',
  Io: '이오 (위성)', Europa: '유로파 (위성)', Ganymede: '가니메데 (위성)', Callisto: '칼리스토 (위성)', Titan: '타이탄 (위성)',
  'Voyager 1': '보이저 1호', 'Voyager 2': '보이저 2호', 'New Horizons': '뉴호라이즌스', 'Pioneer 10': '파이어니어 10호', 'Pioneer 11': '파이어니어 11호',
  JWST: '제임스 웹 우주 망원경', Juno: '주노 (탐사선)', 'Parker Solar Probe': '파커 태양 탐사선', 'Solar Orbiter': '솔라 오비터', BepiColombo: '베피콜롬보',
  Ceres: '세레스 (왜행성)', Vesta: '베스타 (소행성)', Pluto: '명왕성', Eris: '에리스 (왜행성)', Haumea: '하우메아 (왜행성)', Makemake: '마케마케 (왜행성)', Halley: '핼리 혜성',
  Juice: '주스 (탐사선)', 'Europa Clipper': '유로파 클리퍼', Lucy: '루시 (탐사선)', Psyche: '프시케 (탐사선)' };
const WIKI_EN = { Ceres: 'Ceres (dwarf planet)', Vesta: '4 Vesta', Pluto: 'Pluto', Eris: 'Eris (dwarf planet)', Haumea: 'Haumea', Makemake: 'Makemake', Halley: "Halley's Comet", Mercury: 'Mercury (planet)', Io: 'Io (moon)', Europa: 'Europa (moon)', Ganymede: 'Ganymede (moon)', Callisto: 'Callisto (moon)', Titan: 'Titan (moon)',
  JWST: 'James Webb Space Telescope', Juno: 'Juno (spacecraft)', Juice: 'Jupiter Icy Moons Explorer', Lucy: 'Lucy (spacecraft)', Psyche: 'Psyche (spacecraft)' };
const wikiCache = new Map(); let wikiSeq = 0;
async function wikiLookup(lang, titles) {
  for (const t of titles) {
    if (!t) continue;
    const key = lang + ':' + t; if (wikiCache.has(key)) { const v = wikiCache.get(key); if (v) return v; continue; }
    const url = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1&prop=extracts|pageimages|info&inprop=url&exintro=1&explaintext=1&exsentences=3&piprop=thumbnail&pithumbsize=480&titles=${encodeURIComponent(t)}`;
    try {
      const js = await fetch(url).then(r => r.json());
      const page = Object.values(js.query?.pages || {})[0];
      const v = page && !('missing' in page) && page.extract && !/동음이의|may refer to/.test(page.extract) ? { text: page.extract, url: page.fullurl, img: page.thumbnail?.source, lang } : null;
      wikiCache.set(key, v); if (v) return v;
    } catch { wikiCache.set(key, null); }
  }
  return null;
}
async function showWiki(o) {
  const box = $('info-wiki'), seq = ++wikiSeq; box.hidden = true;
  let ko = [], en = [];
  if (o.planet) { ko = [WIKI_KO[o.p.name]]; en = [WIKI_EN[o.p.name] || o.p.name]; }
  else if (o.kindName === 'dso') { const n = o.name.replace(' ', ' '); ko = [o.messier && `메시에 ${o.messier.slice(1)}`, o.messier, n]; en = [o.messier && `Messier ${o.messier.slice(1)}`, o.common, n]; }
  else if (o.kindName === 'exo') { ko = [o.name, `${o.name} ${o.planets[0][0]}`]; en = [o.name, `${o.name} ${o.planets[0][0]}`, `${o.name} (star)`]; }
  else if (o.kindName === 'star') { const n = starData.proper[o.i]; en = [n && `${n} (star)`, n]; ko = []; }
  const r = (await wikiLookup('ko', ko)) || (await wikiLookup('en', en));
  if (seq !== wikiSeq || !r) return;
  $('wiki-text').textContent = r.text;
  $('wiki-link').href = r.url; $('wiki-link').textContent = r.lang === 'ko' ? '위키백과에서 더 보기' : '영어 위키백과에서 더 보기';
  const im = $('wiki-img'); im.hidden = !r.img || o.kindName === 'dso'; if (r.img) im.src = r.img;
  box.hidden = false;
}

let prevSelected = null;
function select(o) {
  if (selected && o && selected !== o) prevSelected = selected;
  selected = o; $('info').hidden = !o; if (!o) { showPhoto(null); exoDetail(null); writeHash(); return; }
  const t = $('info-table'); t.innerHTML = '';
  const row = (k, v) => { if (v === undefined || v === '' || (typeof v === 'number' && isNaN(v))) return; const tr = t.insertRow(); tr.insertCell().textContent = k; tr.insertCell().textContent = v; };
  let ra, dec;
  if (o.planet && o.p.probe) {
    const p = o.p; ra = p.ra; dec = p.dec;
    $('info-title').textContent = `${p.ko} (${p.name})`; $('info-sub').textContent = '탐사선 · 위치: JPL Horizons';
    row('발사', `${p.launch}년`); row('태양으로부터', `${p.helioAU.toFixed(p.helioAU < 2 ? 4 : 1)} AU`);
    row('지구로부터', p.dist < 0.05 ? fmtDist(p.dist * MKM_AU) : `${p.dist.toFixed(p.dist < 10 ? 3 : 1)} AU`);
    const lt = p.dist * 499.0; row('신호가 닿는 시간', lt > 3600 ? `${(lt / 3600).toFixed(1)}시간` : lt > 60 ? `${(lt / 60).toFixed(1)}분` : `${lt.toFixed(1)}초`);
    row('태양 기준 속도', `${probeSpeed(p, jd(state.time)).toFixed(1)} km/s`);
    row('설명', p.note);
  } else if (o.planet) {
    const p = o.p; ra = p.ra; dec = p.dec;
    $('info-title').textContent = `${p.ko} (${p.name})`; $('info-sub').textContent = p.small ? `${p.small} · 궤도: JPL SBDB` : p.name === 'Sun' ? '항성' : p.name === 'Moon' ? '위성' : p.parent ? `${PLANETS.find(q => q.name === p.parent).ko}의 위성 · 위치 근사` : '행성';
    if (p.name !== 'Earth') row('지구로부터 거리', p.name === 'Moon' ? `${(p.dist * KM_AU).toFixed(0)} km` : `${p.dist.toFixed(3)} AU`);
    if (!mode.space && isFinite(p.mag) && p.mag < 90) row('겉보기 등급', `${p.mag.toFixed(1)}${p.mag > 6.5 ? ' (맨눈으로 안 보임)' : ''}`);
    if (p.name !== 'Earth') row('시직경', fmtAng(p.angR * 2 * R2D)); if (p.name !== 'Sun' && p.name !== 'Earth') row('위상 (밝은 면)', (p.phase * 100).toFixed(1) + '%'); row('반지름', `${p.R.toLocaleString()} km`);
  } else if (o.kindName === 'exo') {
    ra = o.ra; dec = o.dec;
    $('info-title').textContent = o.name; $('info-sub').textContent = `외계행성계 · 행성 ${o.planets.length}개 · NASA Exoplanet Archive`;
    if (o.dist) row('거리', `${(o.dist * 3.2616).toFixed(o.dist < 10 ? 2 : 0)} 광년`);
    if (o.vmag != null) row('별의 겉보기 등급', o.vmag.toFixed(2) + (o.vmag > 6.5 ? ' (맨눈으로 안 보임)' : ''));
    if (o.teff) row('별의 표면 온도', `${o.teff.toLocaleString()} K`); const L = lumOf(o); if (L) row('별의 밝기 (태양=1)', L < 0.01 ? L.toExponential(1) : L.toFixed(3));
    exoDetail(o);
  } else if (o.kindName === 'star') {
    ({ ra, dec } = vecToRaDec(o.v));
    $('info-title').textContent = o.name; $('info-sub').textContent = '항성 · ' + (starData.desig[o.i] || `HIP ${starData.id[o.i]}`);
    row('겉보기 등급', o.mag.toFixed(2)); row('B−V 색지수', isNaN(starData.bv[o.i]) ? '' : starData.bv[o.i].toFixed(2)); row('HIP', starData.id[o.i]);
  } else {
    ra = o.ra; dec = o.dec;
    $('info-title').textContent = [o.messier, o.name].filter(Boolean).join(' · ') + (o.common ? ` — ${o.common}` : '');
    $('info-sub').textContent = TYPE_RAW_KO[o.type] || o.type;
    row('별자리', o.con); row('등급', isNaN(o.mag) ? '' : o.mag.toFixed(1)); row('크기', `${o.maj.toFixed(1)}′ × ${o.min.toFixed(1)}′`);
    row('위치각', o.pa ? o.pa + '°' : ''); row('허블 분류', o.hubble); row('적색편이 z', o.z);
  }
  row('적경 (J2000)', fmtRA(ra)); row('적위 (J2000)', fmtDec(dec));
  if (!mode.space) { const aa = dirToAzAlt(worldOf(o)); row('방위 / 고도', `${aa.az.toFixed(1)}° / ${aa.alt.toFixed(1)}°`); }
  else if (o.planet && isFinite(o.p.camDist)) row('현재 위치에서', fmtDist(o.p.camDist));
  if (prevSelected && !mode.space && (!prevSelected.planet || prevSelected.p.world) && (!o.planet || o.p.world)) {
    const a = Math.acos(Math.max(-1, Math.min(1, worldOf(prevSelected).dot(worldOf(o))))) * R2D;
    row(`${prevSelected.planet ? prevSelected.p.ko : prevSelected.messier || prevSelected.name}까지 각거리`, fmtAng(a));
  }
  if (o.kindName !== 'exo') exoDetail(null);
  showPhoto(o.kindName === 'dso' ? o : null);
  showWiki(o); writeHash();
  if (o.planet && o.p.probe) $('info-goto').textContent = mode.space ? '탐사선으로 비행' : '이동 · 확대'; else $('info-goto').textContent = '이동 · 확대';
}
function exoDetail(o) { // system map + planet table, appended under the info table
  const box = $('info-exo'); box.innerHTML = ''; box.hidden = !o;
  if (!o) return;
  box.appendChild(systemSVG(o));
  const tb = document.createElement('table'); tb.className = 'pltable';
  tb.innerHTML = '<tr><th>행성</th><th>반지름</th><th>공전 주기</th><th>온도</th><th>발견</th></tr>';
  for (const p of o.planets) {
    const tr = tb.insertRow();
    for (const v of [p[0], p[3] ? `${p[3]} R⊕` : p[4] ? `${p[4]} M⊕` : '', p[2] ? (p[2] < 2 ? `${(p[2] * 24).toFixed(1)}시간` : p[2] < 1000 ? `${p[2].toFixed(1)}일` : `${(p[2] / 365.25).toFixed(1)}년`) : '',
      p[5] ? `${p[5]} K` : '', `${p[6] ?? ''} ${p[7] >= 0 ? EXO_METHOD_KO[p[7]] : ''}`]) tr.insertCell().textContent = v;
  }
  box.appendChild(tb);
}
const EXO_METHOD_KO = ['횡단', '시선속도', '미세중력렌즈', '직접 촬영', '횡단 시각 변화', '식 시각 변화', '밝기 변조', '펄서 시각', '위치 측정', '맥동 시각', '원반 운동'];
$('info-close').onclick = () => select(null);
$('info-goto').onclick = () => selected && flyTo(selected);

function targetFov(o) {
  if (o.planet && o.p.probe) return 1;
  if (o.planet) return Math.max(0.0015, o.p.angR * R2D * 2 * 5);
  if (o.kindName === 'dso') return Math.min(30, Math.max(0.08, o.maj / 60 * 3));
  if (o.kindName === 'exo') return 4;
  return 2;
}
function flyTo(o) {
  if (mode.space) return spaceFlyTo(o);
  const w = worldOf(o); const t = dirToAzAlt(w);
  flight = { o, t0: performance.now(), dur: 1800, az0: view.az, alt0: view.alt, fov0: view.fov, fov1: targetFov(o) };
  if (groundOn() && t.alt < -2) $('t-ground').checked = false;
}
function stepFlight(now) {
  if (mode.space) return;
  if (!flight) { if (tracking) { const t = dirToAzAlt(worldOf(tracking)); view.az = t.az; view.alt = t.alt; } return; }
  const k = Math.min(1, (now - flight.t0) / flight.dur), e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  const t = dirToAzAlt(worldOf(flight.o));
  let daz = ((t.az - flight.az0 + 540) % 360) - 180;
  view.az = (flight.az0 + daz * e + 360) % 360; view.alt = flight.alt0 + (t.alt - flight.alt0) * e;
  // zoom out a bit in the middle for a smoother sweep, log-interpolate fov
  const mid = Math.max(flight.fov0, flight.fov1, Math.min(70, Math.abs(daz) + Math.abs(t.alt - flight.alt0)));
  const lf = (a, b, s) => Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * s);
  view.fov = k < .5 ? lf(flight.fov0, mid, e * 2) : lf(mid, flight.fov1, (e - .5) * 2);
  if (k >= 1) { tracking = flight.o; flight = null; }
}

// ---------- space mode: free flight through the solar system (units: 10^6 km, equatorial J2000, Sun at origin) ----------
const MKM_AU = KM_AU / 1e6;
const ECL_N = new THREE.Vector3(0, -Math.sin(OBL), Math.cos(OBL)); // ecliptic north in equatorial coords
const sp = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), target: null, dist: 0, flight: null, saved: null, speed: 0 };
const helioPos = {}; // Mkm
function lookQuat(fwd, up = ECL_N) {
  const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), fwd, up);
  return new THREE.Quaternion().setFromRotationMatrix(m);
}
function computeHelio() {
  const T = (jd(state.time) - 2451545.0) / 36525;
  computeHelio.T = T;
  const toEq = (v) => ecl2eq(v).multiplyScalar(MKM_AU);
  helioPos.Sun = new THREE.Vector3();
  const earthEcl = helio('Earth', T);
  for (const n of ['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune']) helioPos[n] = toEq(n === 'Earth' ? earthEcl : helio(n, T));
  helioPos.Moon = helioPos.Earth.clone().add(toEq(moonGeo(T)));
  const geo = { Jupiter: helio('Jupiter', T).sub(earthEcl) };
  const mo = moonOffsets(T, geo);
  for (const n of ['Io', 'Europa', 'Ganymede', 'Callisto']) helioPos[n] = helioPos.Jupiter.clone().add(mo[n].clone().multiplyScalar(MKM_AU));
  helioPos.Titan = helioPos.Saturn.clone().add(mo.Titan.clone().multiplyScalar(MKM_AU));
  for (const p of PLANETS) if (p.sb) helioPos[p.name] = toEq(sbHelio(p.sb, jd(state.time)));
  for (const p of PROBES) { const h = probeHelio(p, jd(state.time)); p.active = !!h; if (h) helioPos[p.name] = h; }
}
const bodyR = (p) => p.R / 1e6;
function updateSpace() {
  computeHelio();
  const earth = helioPos.Earth;
  if (sp.target && !sp.flight) sp.pos.copy(helioPos[sp.target.name]).addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(sp.quat), -sp.dist);
  const minAng = view.fov * D2R * 0.0035;
  let nearest = Infinity, nearestAll = Infinity;
  for (const p of PLANETS) {
    const hp = helioPos[p.name] || new THREE.Vector3(), rel = hp.clone().sub(sp.pos), d = rel.length();
    if (p.probe) {
      if (!p.active) { p.mesh.visible = false; p.world = null; continue; }
      nearestAll = Math.min(nearestAll, d - bodyR(p));
      const gq = hp.clone().sub(earth); p.dist = gq.length() / MKM_AU; const rd = vecToRaDec(gq); p.ra = rd.ra; p.dec = rd.dec; p.helioAU = hp.length() / MKM_AU;
      placeProbe(p, rel, earth.clone().sub(sp.pos), sp.pos.clone().negate(), 0); p.mesh.visible = true; continue;
    }
    nearest = Math.min(nearest, d - bodyR(p));
    p.camDist = d; p.world = rel.clone().divideScalar(d);
    const g = hp.clone().sub(earth); // geocentric, for the info panel
    if (p.name !== 'Earth') { p.dist = g.length() / MKM_AU; p.angR = Math.atan(bodyR(p) / g.length()); const rd = vecToRaDec(g); p.ra = rd.ra; p.dec = rd.dec; p.eq = g.normalize(); }
    p.mesh.position.copy(rel);
    p.mesh.scale.setScalar(Math.max(bodyR(p), d * Math.tan(minAng)));
    const sun = hp.clone().negate().normalize();
    p.phase = p.name === 'Sun' ? 1 : (1 + sun.dot(rel.clone().negate().normalize())) / 2;
    p.mesh.material.uniforms.sunDir.value.copy(sun);
    orientBody(p);
    p.mesh.visible = true;
    if (p.parent) { // hide moons that would sit on top of their (inflated) parent
      const par = PLANETS.find(q => q.name === p.parent);
      const sepPx = Math.atan(hp.distanceTo(helioPos[p.parent]) / d) / (view.fov * D2R) * innerHeight;
      p.mesh.visible = sepPx > 8 && (p.mesh.scale.x < par.mesh.scale.x * 0.5 || d < par.camDist);
    }
    if (p.glow) p.glow.scale.setScalar(Math.max(8, 0.15 * view.fov * D2R * d / p.mesh.scale.x));
    p.rpx = Math.atan(p.mesh.scale.x / d) / (view.fov / 2 * D2R) * innerHeight / 2;
  }
  orbits.position.copy(sp.pos).negate(); trails.position.copy(orbits.position); updateTrails(jd(state.time));
  orbits.visible = $('t-orbits').checked && nearest > 2; trails.visible = orbits.visible; // orbit lines only clutter close-ups
  sp.nearest = nearest; sp.nearestAll = Math.min(nearest, nearestAll);
  updateTail();
}
// orbit lines (Kepler ellipses, drawn in absolute coordinates and shifted by the camera position)
const orbits = new THREE.Group(); orbits.visible = false; planetScene.add(orbits);
(function buildOrbits() {
  const T = (jd(Date.now()) - 2451545.0) / 36525;
  for (const n of ['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune']) {
    const pts = []; for (let i = 0; i <= 360; i++) pts.push(ecl2eq(helio(n, T, i - 180)).multiplyScalar(MKM_AU));
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: n === 'Earth' ? 0x8ea2ff : 0x4a5a82, transparent: true, opacity: 0.55 }));
    l.frustumCulled = false; orbits.add(l);
  }
  for (const p of PLANETS) if (p.sb) {
    const pts = []; for (let i = 0; i <= 720; i++) pts.push(ecl2eq(sbHelio(p.sb, 0, i / 2)).multiplyScalar(MKM_AU));
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: p.name === 'Halley' ? 0x7fd8ff : 0x8a6f9e, transparent: true, opacity: 0.45 }));
    l.frustumCulled = false; orbits.add(l);
  }
})();
// Halley's tail: a soft additive cone pointing away from the Sun, growing as the comet nears perihelion
const tailMat = new THREE.ShaderMaterial({
  uniforms: { strength: { value: 0 } },
  vertexShader: `#include <common>
    #include <logdepthbuf_pars_vertex>
    varying float vY; varying vec2 vXZ; void main(){ vY = position.y; vXZ = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
    #include <logdepthbuf_vertex>
    }`,
  fragmentShader: `#include <logdepthbuf_pars_fragment>
    uniform float strength; varying float vY; void main(){
    #include <logdepthbuf_fragment>
    float a = strength * pow(1.0 - clamp(vY, 0.0, 1.0), 1.6);
    gl_FragColor = vec4(vec3(0.75, 0.88, 1.0) * a, 1.0); }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
});
const tailGeo = new THREE.ConeGeometry(0.12, 1, 32, 1, true); tailGeo.rotateX(Math.PI); tailGeo.translate(0, 0.5, 0); // apex at the nucleus, opening along +Y
const halleyTail = new THREE.Mesh(tailGeo, tailMat); halleyTail.frustumCulled = false; halleyTail.visible = false; planetScene.add(halleyTail);
function updateTail() {
  const h = PLANETS.find(p => p.name === 'Halley'); const hp = helioPos.Halley;
  if (!mode.space || !hp) { halleyTail.visible = false; return; }
  const r = hp.length() / MKM_AU; halleyTail.visible = r < 6;
  if (!halleyTail.visible) return;
  const len = Math.min(60, 12 / (r * r)); // 10^6 km
  halleyTail.position.copy(h.mesh.position);
  halleyTail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), hp.clone().normalize());
  halleyTail.scale.set(len, len, len);
  tailMat.uniforms.strength.value = Math.min(0.9, 0.9 / r);
}
function spaceDrag(dx, dy) {
  sp.flight = null;
  const k = (sp.target ? 0.3 : view.fov / innerHeight) * D2R;
  const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (sp.target ? -1 : 1) * dx * k);
  const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (sp.target ? -1 : 1) * dy * k);
  sp.quat.multiply(qy).multiply(qx).normalize();
}
function spaceZoom(f) {
  if (sp.target) sp.dist = Math.max(sp.target.probe ? bodyR(sp.target) * 1.6 : bodyR(sp.target) * 1.15, Math.min(2e4, sp.dist * f));
  else sp.pos.addScaledVector(camFwd(), (1 - f) * Math.max(0.05, sp.nearest) * 2);
}
function spaceKeys(dt) {
  const v = new THREE.Vector3();
  if (keys.has('KeyW')) v.z -= 1; if (keys.has('KeyS')) v.z += 1;
  if (keys.has('KeyA')) v.x -= 1; if (keys.has('KeyD')) v.x += 1;
  if (keys.has('KeyE') || keys.has('Space')) v.y += 1; if (keys.has('KeyQ')) v.y -= 1;
  if (!v.lengthSq()) { sp.speed = 0; return; }
  if (sp.target) { sp.target = null; $('sp-target').textContent = '자유 비행'; }
  sp.flight = null;
  const speed = Math.max(0.002, sp.nearest) * (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 8 : 1); // Mkm per second
  sp.speed = speed;
  sp.pos.add(v.normalize().applyQuaternion(sp.quat).multiplyScalar(speed * dt / 1000));
}
function spaceFlyTo(o) {
  if (!o.planet) { // a star or deep-sky object: just turn to face it
    sp.flight = { turnOnly: true, t0: performance.now(), dur: 1200, q0: sp.quat.clone(), q1: lookQuat(o.v.clone().normalize(), new THREE.Vector3(0, 1, 0).applyQuaternion(sp.quat)) };
    return;
  }
  const p = o.p, R = bodyR(p), d1 = p.probe ? bodyR(p) * 5 : p.name === 'Sun' ? R * 6 : R * 4;
  const from = sp.pos.clone(), q0 = sp.quat.clone();
  sp.flight = { p, from, q0, d1, t0: performance.now(), dur: Math.min(4500, 1800 + 400 * Math.log10(1 + from.distanceTo(helioPos[p.name]) / d1)) };
}
function stepSpaceFlight(now) {
  const f = sp.flight; if (!f) return;
  const k = Math.min(1, (now - f.t0) / f.dur), e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  if (f.turnOnly) { sp.quat.slerpQuaternions(f.q0, f.q1, e); if (k >= 1) sp.flight = null; return; }
  const tp = helioPos[f.p.name];
  // approach from the lit side, slightly above the ecliptic
  const sunward = tp.lengthSq() ? tp.clone().negate().normalize() : new THREE.Vector3(1, 0, 0);
  const side = sunward.clone().cross(ECL_N).normalize();
  const dir = sunward.multiplyScalar(0.8).addScaledVector(side, 0.5).addScaledVector(ECL_N, 0.3).normalize();
  const end = tp.clone().addScaledVector(dir, f.d1);
  const turn = Math.min(1, k * 2.5), te = 1 - Math.pow(1 - turn, 3);
  // move along a log-distance path so long trips don't crawl at the end
  const d0 = f.from.distanceTo(tp), dd = Math.exp(Math.log(d0) + (Math.log(f.d1) - Math.log(d0)) * e);
  const startDir = f.from.clone().sub(tp).normalize();
  const curDir = startDir.lerp(dir, e).normalize();
  sp.pos.copy(tp).addScaledVector(curDir, dd);
  sp.quat.slerpQuaternions(f.q0, lookQuat(tp.clone().sub(sp.pos).normalize()), te);
  if (k >= 1) { sp.flight = null; sp.target = f.p; sp.dist = f.d1; $('sp-target').textContent = `${f.p.ko} 주위 공전`; writeHash(); }
}
function fmtDist(mkm) {
  const km = mkm * 1e6;
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 1e5) return `${Math.round(km).toLocaleString()} km`;
  if (mkm < 0.05 * MKM_AU) return `${(km / 1e4).toFixed(0)}만 km`;
  return `${(mkm / MKM_AU).toFixed(3)} AU`;
}
function setMode(space) {
  if (mode.space === space) return;
  mode.space = space; document.body.classList.toggle('space', space);
  document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', (b.dataset.mode === 'space') === space));
  flight = null; tracking = null; showPhoto(null); select(null);
  orbits.visible = space && $('t-orbits').checked;
  if (space) {
    sp.saved = { ...view }; view.fov = 60;
    updateSkyMatrix(); computeHelio();
    const earth = PLANETS.find(p => p.name === 'Earth');
    sp.target = earth; sp.dist = bodyR(earth) * 5;
    const sunward = helioPos.Earth.clone().negate().normalize();
    const dir = sunward.clone().multiplyScalar(0.7).addScaledVector(sunward.clone().cross(ECL_N).normalize(), 0.7).normalize();
    sp.quat.copy(lookQuat(dir.negate()));
    $('sp-target').textContent = '지구 주위 공전';
  } else {
    Object.assign(view, sp.saved || {}); sp.flight = null;
    for (const p of PLANETS) p.mesh.visible = true;
  }
}
document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { setMode(b.dataset.mode === 'space'); $('tonight').hidden = true; });
$('t-orbits').onchange = (e) => orbits.visible = mode.space && e.target.checked;
$('sp-free').onclick = () => { sp.target = null; sp.flight = null; $('sp-target').textContent = '자유 비행'; };

// ---------- search ----------
const searchIndex = new Map();
function buildSearch() {
  const dl = $('search-list'); const opts = [];
  const add = (key, mk, label) => { const k = key.toLowerCase().replace(/\s+/g, ''); if (!k || searchIndex.has(k)) return; searchIndex.set(k, mk); if (label) opts.push(label); };
  for (const p of PLANETS) { add(p.name, () => planetObj(p), p.name); add(p.ko, () => planetObj(p), p.ko); }
  for (const o of dsos) { if (o.messier) add(o.messier, () => dsoObj(o), `${o.messier}${o.common ? ' ' + o.common : ''}`);
    add(o.name, () => dsoObj(o), o.messier || o.common ? `${o.name}` : null); if (o.common) add(o.common, () => dsoObj(o), o.common); }
  for (const h of exo.hosts) { add(h.name, () => h, EXO_FAMOUS.has(h.name) ? h.name : null); for (const p of h.planets) add(`${h.name} ${p[0]}`, () => h); }
  for (let i = 0; i < starData.pos.length; i++) { const n = starData.proper[i]; if (n) add(n, () => starObj(i), n); add('HIP' + starData.id[i], () => starObj(i)); }
  dl.innerHTML = opts.map(s => `<option value="${s.replace(/"/g, '&quot;')}">`).join('');
}
$('search').addEventListener('change', (e) => {
  let q = e.target.value.toLowerCase().replace(/\s+/g, '');
  const m = /^m(\d+)/.exec(q); if (m) q = 'm' + m[1];
  const n = /^(ngc|ic)0*(\d+)$/.exec(q); if (n) q = n[1] + n[2];
  let mk = searchIndex.get(q);
  if (!mk) for (const [k, v] of searchIndex) if (k.startsWith(q)) { mk = v; break; }
  if (mk) { const o = mk(); if (o.planet && (!o.p.world || (o.p.probe && !o.p.active))) { $('status').textContent = o.p.probe ? `${o.name}: 이 시각의 위치 자료가 없습니다` : `${o.name}: 우주 모드에서 볼 수 있습니다`; return; } select(o); flyTo(o); e.target.blur(); } else $('status').textContent = `"${e.target.value}" 를 찾지 못했습니다`;
});

// ---------- UI ----------
document.querySelectorAll('[data-speed]').forEach(b => b.onclick = () => { state.speed = +b.dataset.speed;
  document.querySelectorAll('[data-speed]').forEach(x => x.classList.toggle('on', x === b)); });
$('now').onclick = () => { state.time = Date.now(); $('scrub').value = 0; };
// time slider: drag to move up to ±1 year around the moment the drag started (log-ish response near the middle)
let scrubBase = null;
$('scrub').addEventListener('pointerdown', () => { scrubBase = state.time; });
$('scrub').addEventListener('input', (e) => {
  if (scrubBase === null) scrubBase = state.time;
  const v = +e.target.value / 1000, days = Math.sign(v) * Math.pow(Math.abs(v), 2.2) * 365;
  state.time = scrubBase + days * 86400000;
  $('scrub-label').textContent = Math.abs(days) < 1 ? `${(days * 24).toFixed(1)}시간` : `${days.toFixed(0)}일`;
});
$('scrub').addEventListener('change', (e) => { e.target.value = 0; scrubBase = null; $('scrub-label').textContent = ''; });

// shareable link: mode, time, place, view and selection live in the URL hash
let hashTimer = 0;
function writeHash() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    const q = new URLSearchParams();
    q.set('m', mode.space ? 's' : 'g'); q.set('t', new Date(state.time).toISOString().slice(0, 16));
    if (!mode.space) { q.set('lat', state.lat.toFixed(2)); q.set('lon', state.lon.toFixed(2)); q.set('az', view.az.toFixed(1)); q.set('alt', view.alt.toFixed(1)); q.set('fov', view.fov.toPrecision(3)); }
    else if (sp.target) { q.set('at', sp.target.name); q.set('d', sp.dist.toPrecision(3)); }
    if (selected) q.set('o', selected.planet ? selected.p.name : selected.kindName === 'dso' ? (selected.messier || selected.name) : selected.name);
    history.replaceState(null, '', '#' + q.toString());
  }, 300);
}
function readHash() {
  const q = new URLSearchParams(location.hash.slice(1)); if (![...q.keys()].length) return;
  if (q.get('t')) { const t = Date.parse(q.get('t') + 'Z'); if (!isNaN(t)) { state.time = t; state.speed = 0; document.querySelectorAll('[data-speed]').forEach(x => x.classList.toggle('on', x.dataset.speed === '0')); } }
  if (q.get('lat')) { state.lat = +q.get('lat'); state.lon = +q.get('lon'); $('lat').value = state.lat; $('lon').value = state.lon; }
  if (q.get('az')) { view.az = +q.get('az'); view.alt = +q.get('alt'); view.fov = +q.get('fov') || view.fov; }
  if (q.get('m') === 's') {
    setMode(true);
    const p = PLANETS.find(x => x.name === q.get('at'));
    if (p) { updateSkyMatrix(); computeHelio(); if (helioPos[p.name]) { sp.target = p; sp.dist = +q.get('d') || bodyR(p) * 4; $('sp-target').textContent = `${p.ko} 주위 공전`; } }
  }
  const o = q.get('o');
  if (o) setTimeout(() => { const mk = searchIndex.get(o.toLowerCase().replace(/\s+/g, '')); if (mk) { const x = mk(); if (!x.planet || x.p.world) select(x); } }, 300);
}
$('share').onclick = async () => {
  writeHash(); await new Promise(r => setTimeout(r, 350));
  try { await navigator.clipboard.writeText(location.href); $('status').textContent = '현재 화면 링크를 복사했습니다'; }
  catch { prompt('이 링크를 복사하세요', location.href); }
};
canvas.addEventListener('pointerup', () => writeHash());
canvas.addEventListener('wheel', () => writeHash());
$('lat').onchange = (e) => state.lat = Math.max(-90, Math.min(90, +e.target.value || 0));
$('lon').onchange = (e) => state.lon = +e.target.value || 0;
$('t-lines').onchange = (e) => linesGroup.visible = e.target.checked;
$('t-mw').onchange = (e) => milkyWay.visible = e.target.checked && !!mwMat.uniforms.map.value;
$('t-grid').onchange = (e) => gridGroup.visible = e.target.checked;
$('t-exo').onchange = (e) => { if (exoPoints) exoPoints.visible = e.target.checked; };
$('t-dso').onchange = (e) => { if (dsoPoints) dsoPoints.visible = e.target.checked; };
document.querySelector('[data-speed="1"]').classList.add('on');

// ---------- extra tools: date jump, places, tonight list, screenshot, fullscreen ----------
const pad = (n) => String(n).padStart(2, '0');
const toLocalInput = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
$('dt').onchange = (e) => { const t = new Date(e.target.value).getTime(); if (!isNaN(t)) state.time = t; };
$('dt').onfocus = (e) => { e.target.value = toLocalInput(state.time); };
const PLACES = { seoul: [37.57, 126.98], busan: [35.18, 129.08], jeju: [33.36, 126.53], tokyo: [35.68, 139.69], newyork: [40.71, -74.01],
  london: [51.51, -0.13], sydney: [-33.87, 151.21], atacama: [-24.63, -70.40], maunakea: [19.82, -155.47], northpole: [89.9, 0] };
$('place').onchange = (e) => { const v = PLACES[e.target.value]; if (!v) return; [state.lat, state.lon] = v; $('lat').value = v[0]; $('lon').value = v[1]; };
$('night').onclick = () => { const on = document.body.classList.toggle('red'); $('night').classList.toggle('on', on); $('night').textContent = on ? '야간 시야 끄기' : '야간 시야'; };
// eyepiece: true field of view of common setups, drawn as a circle; picking one also zooms to fit it
$('eyepiece').onchange = (e) => { const f = +e.target.value; eyeFov = f || 0; if (f) { view.fov = Math.max(view.fov > f * 1.4 ? f * 1.25 : view.fov, f * 1.1); } };
let eyeFov = 0;
function drawEyepiece() {
  const el = $('eye-ring'); if (!eyeFov || mode.space) { el.hidden = true; return; }
  const d = Math.tan(eyeFov / 2 * D2R) / Math.tan(view.fov / 2 * D2R) * innerHeight; el.hidden = false; el.style.width = el.style.height = d + 'px';
  $('eye-label').textContent = `${$('eyepiece').selectedOptions[0].text} · 실시야 ${fmtAng(eyeFov)}`;
}
$('shot').onclick = () => {
  const a = document.createElement('a'); a.download = `space-commons-${toLocalInput(state.time).replace(/[:T]/g, '-')}.png`;
  a.href = canvas.toDataURL('image/png'); a.click();
};
$('full').onclick = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();
function tonight() { // what is up right now: planets, the Moon and bright Messier objects above 15 degrees
  const list = [], up = (w) => Math.asin(Math.max(-1, Math.min(1, w.y))) * R2D;
  for (const p of PLANETS) if (!p.probe && !p.parent && p.world && p.name !== 'Sun' && p.name !== 'Earth') { const alt = up(p.world); if (alt > 15) list.push({ o: planetObj(p), alt, kind: p.name === 'Moon' ? '위성' : '행성', rank: -10 }); }
  for (const o of dsos) if (o.messier && o.mag < 7.5) { const w = o.v.clone().applyMatrix4(sky.matrixWorld); const alt = up(w); if (alt > 15) list.push({ o: dsoObj(o), alt, kind: TYPE_RAW_KO[o.type] || '', rank: o.mag }); }
  list.sort((a, b) => a.rank - b.rank);
  const sunAlt = up(PLANETS[0].world);
  $('tonight-sub').textContent = `${state.lat.toFixed(2)}°, ${state.lon.toFixed(2)}° · ${new Date(state.time).toLocaleString('ko-KR', { hour12: false })}` + (sunAlt > -6 ? ' · 지금은 하늘이 밝습니다' : '');
  const ul = $('tonight-list'); ul.innerHTML = '';
  for (const it of list.slice(0, 24)) {
    const li = document.createElement('li'); const b = document.createElement('button');
    b.textContent = it.o.planet ? it.o.p.ko : `${it.o.messier}${it.o.common ? ' ' + it.o.common : ''}`;
    const m = document.createElement('span'); m.textContent = `${it.kind} · 고도 ${it.alt.toFixed(0)}°`;
    b.onclick = () => { select(it.o); flyTo(it.o); };
    li.append(b, m); ul.append(li);
  }
  if (!list.length) ul.innerHTML = '<li><span>지평선 위 15° 이상에 밝은 천체가 없습니다</span></li>';
  $('tonight').hidden = false;
}
$('tonight-btn').onclick = () => $('tonight').hidden ? tonight() : ($('tonight').hidden = true);
$('tonight-close').onclick = () => $('tonight').hidden = true;
addEventListener('keydown', (e) => { if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.code === 'KeyF') $('full').click(); if (e.code === 'KeyN') $('night').click(); if (e.code === 'KeyP') $('shot').click(); if (e.code === 'KeyT' && !mode.space) $('tonight-btn').click(); });

// ---------- guided tour ----------
const TOUR = [
  { space: false, o: 'M31', text: '안드로메다 은하. 250만 광년 떨어져 있으며, 맨눈으로 볼 수 있는 가장 먼 천체입니다.' },
  { space: false, o: 'M42', text: '오리온 대성운. 별이 지금도 태어나고 있는 1,300광년 거리의 가스 구름입니다.' },
  { space: false, o: 'M13', text: '헤르쿨레스 구상성단. 수십만 개의 오래된 별이 지름 150광년 안에 모여 있습니다.' },
  { space: true, o: 'Sun', text: '우주 모드로 나왔습니다. 태양은 태양계 질량의 99.8%를 차지합니다.' },
  { space: true, o: 'Earth', text: '지구. 낮과 밤, 자전 방향이 지금 이 순간과 같습니다. 밤쪽에는 도시 불빛이 보입니다.' },
  { space: true, o: 'JWST', text: '제임스 웹 우주망원경. 지구에서 약 150만 km 떨어진 L2 점 주변을 돕니다.' },
  { space: true, o: 'Mars', text: '화성. 지름은 지구의 절반 정도이고, 하루는 24시간 37분입니다.' },
  { space: true, o: 'Jupiter', text: '목성과 갈릴레이 위성들. 이오, 유로파, 가니메데, 칼리스토가 실제 위치에 있습니다.' },
  { space: true, o: 'Saturn', text: '토성. 고리의 기울기도 지금 지구에서 보이는 모습과 같습니다.' },
  { space: true, o: 'Pluto', text: '명왕성. 2015년 뉴호라이즌스가 처음으로 가까이 지나갔습니다.' },
  { space: true, o: 'Voyager 1', text: '보이저 1호. 사람이 만든 물체 중 가장 멀리 간 탐사선입니다. 신호가 지구에 닿는 데 하루 가까이 걸립니다.' },
];
let tourStep = -1;
function tourGo(i) {
  tourStep = Math.max(0, Math.min(TOUR.length - 1, i)); const st = TOUR[tourStep];
  setMode(st.space); if (!st.space) $('t-ground').checked = false; // keep targets visible even if they are below the horizon
  const mk = searchIndex.get(st.o.toLowerCase().replace(/\s+/g, ''));
  if (mk) { const o = mk(); select(o); flyTo(o); }
  $('tour-text').textContent = st.text; $('tour-step').textContent = `${tourStep + 1} / ${TOUR.length}`;
  $('tour').hidden = false;
}
$('tour-btn').onclick = () => tourGo(0);
$('tour-next').onclick = () => tourGo(tourStep + 1);
$('tour-prev').onclick = () => tourGo(tourStep - 1);
$('tour-close').onclick = () => { $('tour').hidden = true; tourStep = -1; };

// ---------- labels ----------
const labelBox = $('labels'); const pool = []; let used = 0;
let discs = []; // screen disks of solar-system bodies; sky labels behind them are skipped
function label(x, y, text, cls) {
  if (cls !== 'planet' && cls !== 'card' && discs.some(d => Math.hypot(d[0] - x, d[1] - y) < d[2])) return;
  let el = pool[used]; if (!el) { el = document.createElement('div'); labelBox.appendChild(el); pool.push(el); }
  used++; el.className = 'lbl ' + cls; if (el.textContent !== text) el.textContent = text;
  el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.display = '';
}
function drawLabels() {
  used = 0;
  discs = [];
  for (const p of PLANETS) if (p.world && p.mesh.visible && p.rpx > 4 && p.world.dot(camFwd()) > 0) { const s = toScreen(p.world); if (s) discs.push([s[0], s[1], p.rpx]); }
  const gOn = groundOn();
  if ($('t-labels').checked) {
    const fwd = camFwd(), cosLim = Math.cos(Math.min(85, view.fov * 0.75) * D2R);
    const vis = (w) => w.dot(fwd) > cosLim && !(gOn && w.y < 0);
    const lim = starMat.uniforms.limit.value; const starLim = Math.min(lim - 1.2, 1.2 + 2.5 * Math.log10(70 / view.fov) + 1.2);
    let n = 0;
    for (let i = 0; i < starData.pos.length && n < 70; i++) {
      if (starData.mag[i] > starLim || !starData.name[i]) continue;
      if (!starData.proper[i] && starData.mag[i] > starLim - 1.5) continue;
      const w = starData.pos[i].clone().applyMatrix4(sky.matrixWorld); if (!vis(w)) continue;
      const s = toScreen(w); if (s) { label(s[0], s[1], starData.proper[i] || starData.name[i], 'star'); n++; }
    }
    if ($('t-lines').checked && view.fov > 15) for (const c of constLabels) {
      const w = c.v.clone().applyMatrix4(sky.matrixWorld); if (!vis(w)) continue; const s = toScreen(w); if (s) label(s[0], s[1], c.name, 'const'); }
    if ($('t-dso').checked) {
      const ppd = innerHeight / view.fov, dLim = dsoMat.uniforms.limit.value; let m = 0;
      for (const o of dsos) {
        if (m > 80) break;
        const px = o.maj / 60 * ppd;
        const show = (o.messier && view.fov < 75) || (px > 18 && (isNaN(o.mag) ? 13 : o.mag) < dLim + 1);
        if (!show) continue;
        const w = o.v.clone().applyMatrix4(sky.matrixWorld); if (!vis(w)) continue;
        const s = toScreen(w); if (!s) continue;
        label(s[0] + Math.min(px / 2, 80) * 0.7, s[1], o.messier ? (view.fov < 20 && o.common ? `${o.messier} ${o.common}` : o.messier) : o.name, 'dso'); m++;
      }
    }
    for (const p of PLANETS) if (p.world && p.mesh.visible && p.world.dot(fwd) > 0) { const s = toScreen(p.world); if (s) label(s[0] + p.rpx, s[1], p.ko, 'planet'); }
  }
  if ($('t-labels').checked && exoPoints?.visible && view.fov < 40) {
    const fwd = camFwd(), cosLim = Math.cos(Math.min(85, view.fov * 0.75) * D2R); let m = 0;
    for (const h of exo.hosts) {
      if (m > 40) break; if (!(EXO_FAMOUS.has(h.name) || view.fov < 4)) continue;
      const w = h.v.clone().applyMatrix4(sky.matrixWorld); if (w.dot(fwd) < cosLim || (gOn && w.y < 0)) continue;
      const s = toScreen(w); if (s) { label(s[0] + 6, s[1], `${h.name} (${h.planets.length})`, 'exo'); m++; }
    }
  }
  if (gOn) for (const c of cardinals) { const s = toScreen(c.w); if (s && c.w.dot(camFwd()) > 0) label(s[0], s[1], c.name, 'card'); }
  for (let i = used; i < pool.length; i++) pool[i].style.display = 'none';
  const ring = $('sel-ring');
  if (selected && !(selected.planet && !selected.p.world)) { const s = toScreen(worldOf(selected)); ring.hidden = !s; if (s) { ring.style.left = s[0] + 'px'; ring.style.top = s[1] + 'px'; } } else ring.hidden = true;
}

// ---------- main loop ----------
const skyNight = new THREE.Color(0x02040a), skyDay = new THREE.Color(0x3d72b8), skyTwi = new THREE.Color(0x1a2a50), bg = new THREE.Color();
function frame(now) {
  const dt = now - state.lastReal; state.lastReal = now;
  state.time += dt * state.speed;
  updateSkyMatrix();
  if (mode.space) { computeHelio(); stepSpaceFlight(now); spaceKeys(dt); }
  stepFlight(now);
  updateCamera();
  updatePlanets();
  placePhoto();

  // brightness / limiting magnitudes scale with zoom
  const zoom = Math.log10(70 / view.fov);
  const gOn = groundOn(); ground.visible = gOn;
  let day = 0;
  if ($('t-atm').checked && gOn) { const sunAlt = Math.asin(PLANETS[0].world.y) * R2D; day = Math.min(1, Math.max(0, (sunAlt + 12) / 14)); }
  bg.copy(skyNight).lerp(skyTwi, Math.min(1, day * 2)).lerp(skyDay, Math.max(0, day * 2 - 1));
  renderer.setClearColor(bg);
  const dim = 1 - day * 0.97;
  groundMat.uniforms.light.value = $('t-atm').checked ? 0.25 + 0.75 * day : 0.55;
  starMat.uniforms.limit.value = Math.min(8.5, 6.2 + 2.2 * zoom) - day * 5;
  mwMat.uniforms.gain.value = 3.5 * dim / Math.max(1, Math.sqrt(70 / view.fov) * 0.6);
  starMat.uniforms.pr.value = renderer.getPixelRatio(); starMat.uniforms.dim.value = dim;
  exoMat.uniforms.pr.value = renderer.getPixelRatio(); exoMat.uniforms.alpha.value = Math.min(1, Math.max(0, (60 - view.fov) / 40)) * (1 - day * 0.8);
  dsoMat.uniforms.pxPerDeg.value = innerHeight / view.fov; dsoMat.uniforms.pr.value = renderer.getPixelRatio();
  dsoMat.uniforms.limit.value = 7 + 3.2 * zoom; dsoMat.uniforms.dim.value = Math.max(0.05, dim);

  renderer.clear();
  renderer.render(scene, camera);
  pcam.quaternion.copy(camera.quaternion); pcam.fov = camera.fov;
  // log depth spends its precision on distances near 1 unit: rescale the scene so the closest surface sits about 1 unit away,
  // otherwise a 20 m spacecraft seen from 20 m (2e-8 units) collapses into one depth value and its layers z-fight
  if (mode.space) { const k = 1 / Math.max(1e-12, sp.nearestAll || 1); planetScene.scale.setScalar(k); pcam.near = 1e-3; pcam.far = 1e14; }
  else { planetScene.scale.setScalar(1); pcam.near = camera.near; pcam.far = camera.far; }
  pcam.updateProjectionMatrix(); pcam.updateMatrixWorld();
  renderer.clearDepth();
  renderer.render(planetScene, pcam);
  drawLabels(); drawEyepiece();
  $('clock').textContent = new Date(state.time).toLocaleString('ko-KR', { hour12: false }) + (state.speed !== 1 ? `  (×${state.speed})` : '');
  const fw = camFwd(), rd = vecToRaDec(fw.clone().applyMatrix4(new THREE.Matrix4().copy(sky.matrixWorld).invert()));
  if (mode.space) {
    const near = PLANETS.filter(p => p.world).reduce((a, p) => (p.camDist - bodyR(p) < a.camDist - bodyR(a) ? p : a));
    $('fovinfo').textContent = `태양에서 ${fmtDist(sp.pos.length())} · 가장 가까운 천체 ${near.ko} ${fmtDist(near.camDist - bodyR(near))}` + (sp.speed ? ` · 속도 ${fmtDist(sp.speed)}/s` : '');
  } else {
    const c = dirToAzAlt(fw);
    $('fovinfo').textContent = `시야 ${fmtAng(view.fov)} · 방위 ${c.az.toFixed(1)}° 고도 ${c.alt.toFixed(1)}° · RA ${fmtRA(rd.ra)} Dec ${fmtDec(rd.dec)}`;
  }
  requestAnimationFrame(frame);
}

// ---------- boot ----------
updateSkyMatrix(); requestAnimationFrame(frame);
(async () => {
  const st = $('status'); const parts = [];
  const r = await Promise.allSettled([loadStars(), loadNGC(), loadLines(), loadExo()]);
  if (r[0].status === 'fulfilled') parts.push(`별 ${r[0].value.toLocaleString()}개`); else parts.push('별 카탈로그 실패');
  if (r[1].status === 'fulfilled') parts.push(`NGC/IC 천체 ${r[1].value.toLocaleString()}개`); else parts.push('OpenNGC 실패');
  if (r[3].status === 'fulfilled') parts.push(`외계행성 ${r[3].value.toLocaleString()}개`);
  st.textContent = parts.join(' · ');
  document.body.classList.add('ready');
  buildSearch();
  readHash();
})();
