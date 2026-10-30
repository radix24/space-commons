import * as THREE from 'three';

// ---------- constants & helpers ----------
const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const R_SKY = 1000, R_DSO = 980, R_PLANET = 900;
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
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 5000);
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
function helio(name, T) {
  const E0 = ELEM[name];
  const [a, e, I, L, wb, O] = E0.slice(0, 6).map((v, i) => v + E0[i + 6] * T);
  const w = (wb - O) * D2R, M = (((L - wb) % 360) + 540) % 360 - 180;
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
];
const KM_AU = 149597870.7;
const planetMat = (tex, emissive) => new THREE.ShaderMaterial({
  uniforms: { map: { value: tex }, sunDir: { value: new THREE.Vector3(1, 0, 0) }, emissive: { value: emissive ? 1 : 0 } },
  vertexShader: `varying vec2 vUv; varying vec3 vN; void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D map; uniform vec3 sunDir; uniform float emissive; varying vec2 vUv; varying vec3 vN;
    void main(){ vec3 c = texture2D(map, vUv).rgb; float l = emissive > 0.5 ? 1.2 : max(dot(normalize(vN), sunDir), 0.0) * 1.15 + 0.025;
      gl_FragColor = vec4(c * l, 1.0); }`,
  depthTest: true, depthWrite: true,
});
const texLoader = new THREE.TextureLoader();
const planetGroup = new THREE.Group(); scene.add(planetGroup);
for (const p of PLANETS) {
  p.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), planetMat(p.tex(), p.emissive));
  p.mesh.renderOrder = 5;
  // real texture maps (Solar System Scope, CC BY 4.0); procedural map stays as fallback
  texLoader.load(p.img, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; p.mesh.material.uniforms.map.value = t; });
  if (p.ring) {
    const rg = new THREE.RingGeometry(1.11, 2.33, 128, 1);
    const pos = rg.attributes.position, uv = rg.attributes.uv;
    for (let i = 0; i < pos.count; i++) { const r = Math.hypot(pos.getX(i), pos.getY(i)); uv.setXY(i, (r - 1.11) / 1.22, 0.5); }
    const rt = noiseTex(512, 4, (c, w) => { const r = rnd(5); for (let x = 0; x < w; x++) { const t = x / w;
      const a = (t > 0.52 && t < 0.57) ? 0.05 : (0.35 + r() * 0.5) * (t < 0.15 ? 0.4 : 1); c.fillStyle = `rgba(${215 + r() * 30},${190 + r() * 30},${150 + r() * 30},${a})`; c.fillRect(x, 0, 1, 4); } });
    const ringMat = new THREE.ShaderMaterial({ uniforms: { map: { value: rt }, sunDir: { value: new THREE.Vector3() } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform sampler2D map; varying vec2 vUv; void main(){ vec4 t = texture2D(map, vUv); gl_FragColor = vec4(t.rgb*0.9, t.a); }`,
      side: THREE.DoubleSide, transparent: true, depthWrite: false });
    texLoader.load('textures/2k_saturn_ring_alpha.png', (t) => { t.colorSpace = THREE.SRGBColorSpace; ringMat.uniforms.map.value = t; });
    const ring = new THREE.Mesh(rg, ringMat); ring.rotation.x = -Math.PI / 2; ring.renderOrder = 6; p.mesh.add(ring);
  }
  if (p.emissive) {
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: noiseTex(256, 256, (c, w, h) => { const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,240,200,1)'); g.addColorStop(.2, 'rgba(255,210,120,.5)'); g.addColorStop(1, 'rgba(255,180,80,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); }),
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    glow.scale.setScalar(8); p.mesh.add(glow); p.glow = glow;
  }
  planetGroup.add(p.mesh);
}
function updatePlanets() {
  const T = (jd(state.time) - 2451545.0) / 36525;
  const earth = helio('Earth', T);
  const geo = {}; // geocentric ecliptic AU
  geo.Sun = earth.clone().negate();
  geo.Moon = moonGeo(T);
  for (const n of ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune']) geo[n] = helio(n, T).sub(earth);
  const minAng = view.fov * D2R * 0.0045;
  for (const p of PLANETS) {
    const g = geo[p.name], eq = ecl2eq(g), dist = g.length();
    const sunEq = ecl2eq(geo.Sun.clone().sub(g)).normalize();
    p.eq = eq.clone().normalize(); const rd = vecToRaDec(p.eq); p.ra = rd.ra; p.dec = rd.dec; p.dist = dist;
    p.angR = Math.atan(p.R / KM_AU / dist); // true angular radius (rad)
    const world = p.eq.clone().applyMatrix4(sky.matrixWorld).normalize();
    const R = R_PLANET * (p.name === 'Moon' ? 0.9 : p.name === 'Sun' ? 0.95 : 1); // keep Moon in front of Sun for eclipses
    p.world = world;
    p.phase = (1 + sunEq.dot(p.eq.clone().negate())) / 2; // illuminated fraction
    p.mesh.position.copy(world).multiplyScalar(R);
    p.mesh.scale.setScalar(R * Math.tan(Math.max(p.angR, minAng)));
    const pole = eqVec(p.pole[0], p.pole[1]).transformDirection(sky.matrixWorld);
    p.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pole);
    p.mesh.rotateY(((jd(state.time) / p.period) % 1) * Math.PI * 2);
    p.mesh.material.uniforms.sunDir.value.copy(sunEq.transformDirection(sky.matrixWorld));
    if (p.glow) p.glow.scale.setScalar(Math.max(8, 0.15 * view.fov * D2R * R / p.mesh.scale.x));
  }
}

// ---------- ground & horizon ----------
const ground = new THREE.Mesh(new THREE.SphereGeometry(800, 64, 32, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
  new THREE.ShaderMaterial({
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vP; void main(){ float t = clamp(-vP.y/800.0, 0.0, 1.0);
      vec3 c = mix(vec3(0.07,0.10,0.06), vec3(0.015,0.02,0.015), pow(t,0.4));
      float edge = exp(-t*80.0)*0.25; gl_FragColor = vec4(c + vec3(0.25,0.3,0.4)*edge, 1.0); }`,
    side: THREE.BackSide, depthTest: false, depthWrite: false,
  }));
ground.renderOrder = 10; scene.add(ground);
const cardinals = [['N', 0], ['NE', 45], ['E', 90], ['SE', 135], ['S', 180], ['SW', 225], ['W', 270], ['NW', 315]]
  .map(([n, az]) => ({ name: n, w: new THREE.Vector3(Math.sin(az * D2R), 0.005, -Math.cos(az * D2R)) }));

// ---------- camera ----------
function viewDir(az = view.az, alt = view.alt) {
  const a = az * D2R, h = alt * D2R;
  return new THREE.Vector3(Math.sin(a) * Math.cos(h), Math.sin(h), -Math.cos(a) * Math.cos(h));
}
function dirToAzAlt(v) { return { az: ((Math.atan2(v.x, -v.z) * R2D) + 360) % 360, alt: Math.asin(Math.max(-1, Math.min(1, v.y))) * R2D }; }
function updateCamera() {
  camera.fov = view.fov; camera.updateProjectionMatrix();
  camera.position.set(0, 0, 0); camera.up.set(0, 1, 0);
  camera.lookAt(viewDir());
  camera.updateMatrixWorld();
}
function resize() {
  const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
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
  tracking = null; flight = null;
  const dpp = view.fov / innerHeight;
  view.az = (view.az - dx * dpp / Math.max(0.15, Math.cos(view.alt * D2R)) + 360) % 360;
  view.alt = Math.max(-89.9, Math.min(89.9, view.alt + dy * dpp));
});
canvas.addEventListener('pointerup', (e) => { pointers.delete(e.pointerId); pinchDist = 0; canvas.classList.remove('drag');
  if (dragMoved < 4 && pointers.size === 0) select(pick(e.clientX, e.clientY)); });
canvas.addEventListener('dblclick', (e) => { const o = pick(e.clientX, e.clientY); if (o) { select(o); flyTo(o); } });
canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoomBy(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
function zoomBy(f) { view.fov = Math.max(0.0008, Math.min(110, view.fov * f)); }

// ---------- object model / picking ----------
const tmp = new THREE.Vector3();
function worldOf(o) { return o.planet ? o.p.world.clone() : o.v.clone().applyMatrix4(sky.matrixWorld).normalize(); }
function toScreen(w) {
  tmp.copy(w).multiplyScalar(500).project(camera);
  if (tmp.z > 1 || tmp.z < -1) return null;
  return [(tmp.x + 1) / 2 * innerWidth, (1 - tmp.y) / 2 * innerHeight];
}
function starObj(i) { return { kindName: 'star', i, v: starData.pos[i], name: starData.proper[i] || starData.name[i] || `HIP ${starData.id[i]}`, mag: starData.mag[i] }; }
function dsoObj(o) { return Object.assign(o, { kindName: 'dso' }); }
function planetObj(p) { return { kindName: 'planet', planet: true, p, name: p.ko }; }
function pick(x, y) {
  const fwd = viewDir(); const cosLim = Math.cos(Math.min(89, view.fov) * D2R);
  let best = null, bd = 18;
  const test = (w, mk, bonus = 0) => { if (w.dot(fwd) < cosLim) return; const s = toScreen(w); if (!s) return;
    const d = Math.hypot(s[0] - x, s[1] - y) - bonus; if (d < bd) { bd = d; best = mk; } };
  for (const p of PLANETS) if (p.world) {
    const s = toScreen(p.world); const rpx = p.mesh.scale.x / R_PLANET / Math.tan(view.fov / 2 * D2R) * innerHeight / 2;
    if (s && Math.hypot(s[0] - x, s[1] - y) < Math.max(14, rpx)) return planetObj(p);
  }
  const lim = starMat.uniforms.limit.value;
  for (let i = 0; i < starData.pos.length; i++) { if (starData.mag[i] > lim) continue;
    const w = tmp.copy(starData.pos[i]).applyMatrix4(sky.matrixWorld).normalize().clone(); test(w, i, (lim - starData.mag[i]) * 0.8); }
  if (typeof best === 'number') best = starObj(best);
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
function select(o) {
  selected = o; $('info').hidden = !o; if (!o) { showPhoto(null); return; }
  const t = $('info-table'); t.innerHTML = '';
  const row = (k, v) => { if (v === undefined || v === '' || (typeof v === 'number' && isNaN(v))) return; const tr = t.insertRow(); tr.insertCell().textContent = k; tr.insertCell().textContent = v; };
  let ra, dec;
  if (o.planet) {
    const p = o.p; ra = p.ra; dec = p.dec;
    $('info-title').textContent = `${p.ko} (${p.name})`; $('info-sub').textContent = p.name === 'Sun' ? '항성' : p.name === 'Moon' ? '위성' : '행성';
    row('지구로부터 거리', p.name === 'Moon' ? `${(p.dist * KM_AU).toFixed(0)} km` : `${p.dist.toFixed(3)} AU`);
    row('시직경', fmtAng(p.angR * 2 * R2D)); if (p.name !== 'Sun') row('위상 (밝은 면)', (p.phase * 100).toFixed(1) + '%'); row('반지름', `${p.R.toLocaleString()} km`);
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
  const aa = dirToAzAlt(worldOf(o)); row('방위 / 고도', `${aa.az.toFixed(1)}° / ${aa.alt.toFixed(1)}°`);
  showPhoto(o.kindName === 'dso' ? o : null);
}
$('info-close').onclick = () => select(null);
$('info-goto').onclick = () => selected && flyTo(selected);

function targetFov(o) {
  if (o.planet) return Math.max(0.0015, o.p.angR * R2D * 2 * 5);
  if (o.kindName === 'dso') return Math.min(30, Math.max(0.08, o.maj / 60 * 3));
  return 2;
}
function flyTo(o) {
  const w = worldOf(o); const t = dirToAzAlt(w);
  flight = { o, t0: performance.now(), dur: 1800, az0: view.az, alt0: view.alt, fov0: view.fov, fov1: targetFov(o) };
  if ($('t-ground').checked && t.alt < -2) $('t-ground').checked = false;
}
function stepFlight(now) {
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

// ---------- search ----------
const searchIndex = new Map();
function buildSearch() {
  const dl = $('search-list'); const opts = [];
  const add = (key, mk, label) => { const k = key.toLowerCase().replace(/\s+/g, ''); if (!k || searchIndex.has(k)) return; searchIndex.set(k, mk); if (label) opts.push(label); };
  for (const p of PLANETS) { add(p.name, () => planetObj(p), p.name); add(p.ko, () => planetObj(p), p.ko); }
  for (const o of dsos) { if (o.messier) add(o.messier, () => dsoObj(o), `${o.messier}${o.common ? ' ' + o.common : ''}`);
    add(o.name, () => dsoObj(o), o.messier || o.common ? `${o.name}` : null); if (o.common) add(o.common, () => dsoObj(o), o.common); }
  for (let i = 0; i < starData.pos.length; i++) { const n = starData.proper[i]; if (n) add(n, () => starObj(i), n); add('HIP' + starData.id[i], () => starObj(i)); }
  dl.innerHTML = opts.map(s => `<option value="${s.replace(/"/g, '&quot;')}">`).join('');
}
$('search').addEventListener('change', (e) => {
  let q = e.target.value.toLowerCase().replace(/\s+/g, '');
  const m = /^m(\d+)/.exec(q); if (m) q = 'm' + m[1];
  const n = /^(ngc|ic)0*(\d+)$/.exec(q); if (n) q = n[1] + n[2];
  let mk = searchIndex.get(q);
  if (!mk) for (const [k, v] of searchIndex) if (k.startsWith(q)) { mk = v; break; }
  if (mk) { const o = mk(); select(o); flyTo(o); e.target.blur(); } else $('status').textContent = `"${e.target.value}" 를 찾지 못했습니다`;
});

// ---------- UI ----------
document.querySelectorAll('[data-speed]').forEach(b => b.onclick = () => { state.speed = +b.dataset.speed;
  document.querySelectorAll('[data-speed]').forEach(x => x.classList.toggle('on', x === b)); });
$('now').onclick = () => { state.time = Date.now(); };
$('lat').onchange = (e) => state.lat = Math.max(-90, Math.min(90, +e.target.value || 0));
$('lon').onchange = (e) => state.lon = +e.target.value || 0;
$('t-lines').onchange = (e) => linesGroup.visible = e.target.checked;
$('t-grid').onchange = (e) => gridGroup.visible = e.target.checked;
$('t-dso').onchange = (e) => { if (dsoPoints) dsoPoints.visible = e.target.checked; };
document.querySelector('[data-speed="1"]').classList.add('on');

// ---------- labels ----------
const labelBox = $('labels'); const pool = []; let used = 0;
function label(x, y, text, cls) {
  let el = pool[used]; if (!el) { el = document.createElement('div'); labelBox.appendChild(el); pool.push(el); }
  used++; el.className = 'lbl ' + cls; if (el.textContent !== text) el.textContent = text;
  el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.display = '';
}
function drawLabels() {
  used = 0;
  const groundOn = $('t-ground').checked;
  if ($('t-labels').checked) {
    const fwd = viewDir(), cosLim = Math.cos(Math.min(85, view.fov * 0.75) * D2R);
    const vis = (w) => w.dot(fwd) > cosLim && !(groundOn && w.y < 0);
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
    for (const p of PLANETS) if (p.world && vis(p.world) || (p.world && !groundOn)) { const s = toScreen(p.world); if (s) {
      const rpx = p.mesh.scale.x / R_PLANET / Math.tan(view.fov / 2 * D2R) * innerHeight / 2; label(s[0] + rpx, s[1], p.ko, 'planet'); } }
  }
  if (groundOn) for (const c of cardinals) { const s = toScreen(c.w); if (s && c.w.dot(viewDir()) > 0) label(s[0], s[1], c.name, 'card'); }
  for (let i = used; i < pool.length; i++) pool[i].style.display = 'none';
  const ring = $('sel-ring');
  if (selected) { const s = toScreen(worldOf(selected)); ring.hidden = !s; if (s) { ring.style.left = s[0] + 'px'; ring.style.top = s[1] + 'px'; } } else ring.hidden = true;
}

// ---------- main loop ----------
const skyNight = new THREE.Color(0x02040a), skyDay = new THREE.Color(0x3d72b8), skyTwi = new THREE.Color(0x1a2a50), bg = new THREE.Color();
function frame(now) {
  const dt = now - state.lastReal; state.lastReal = now;
  state.time += dt * state.speed;
  updateSkyMatrix();
  stepFlight(now);
  updateCamera();
  updatePlanets();
  placePhoto();

  // brightness / limiting magnitudes scale with zoom
  const zoom = Math.log10(70 / view.fov);
  const groundOn = $('t-ground').checked; ground.visible = groundOn;
  let day = 0;
  if ($('t-atm').checked && groundOn) { const sunAlt = Math.asin(PLANETS[0].world.y) * R2D; day = Math.min(1, Math.max(0, (sunAlt + 12) / 14)); }
  bg.copy(skyNight).lerp(skyTwi, Math.min(1, day * 2)).lerp(skyDay, Math.max(0, day * 2 - 1));
  renderer.setClearColor(bg);
  const dim = 1 - day * 0.97;
  starMat.uniforms.limit.value = Math.min(8.5, 6.2 + 2.2 * zoom) - day * 5;
  starMat.uniforms.pr.value = renderer.getPixelRatio(); starMat.uniforms.dim.value = dim;
  dsoMat.uniforms.pxPerDeg.value = innerHeight / view.fov; dsoMat.uniforms.pr.value = renderer.getPixelRatio();
  dsoMat.uniforms.limit.value = 7 + 3.2 * zoom; dsoMat.uniforms.dim.value = Math.max(0.05, dim);

  renderer.render(scene, camera);
  drawLabels();
  $('clock').textContent = new Date(state.time).toLocaleString('ko-KR', { hour12: false }) + (state.speed !== 1 ? `  (×${state.speed})` : '');
  const c = dirToAzAlt(viewDir()); const w = viewDir().applyMatrix4(new THREE.Matrix4().copy(sky.matrixWorld).invert()); const rd = vecToRaDec(w);
  $('fovinfo').textContent = `시야 ${fmtAng(view.fov)} · 방위 ${c.az.toFixed(1)}° 고도 ${c.alt.toFixed(1)}° · RA ${fmtRA(rd.ra)} Dec ${fmtDec(rd.dec)}`;
  requestAnimationFrame(frame);
}

// ---------- boot ----------
updateSkyMatrix(); requestAnimationFrame(frame);
(async () => {
  const st = $('status'); const parts = [];
  const r = await Promise.allSettled([loadStars(), loadNGC(), loadLines()]);
  if (r[0].status === 'fulfilled') parts.push(`별 ${r[0].value.toLocaleString()}개`); else parts.push('별 카탈로그 실패');
  if (r[1].status === 'fulfilled') parts.push(`NGC/IC 천체 ${r[1].value.toLocaleString()}개`); else parts.push('OpenNGC 실패');
  st.textContent = parts.join(' · ');
  buildSearch();
})();
