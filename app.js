import * as THREE from 'three';
import { EN, LOCALE, tr, startTranslator, englishBodies, setLang } from './i18n.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildCraft } from './craft.js';
import { moonMeeus } from './moon.js';
import { BODY_INFO } from './bodyinfo.js';
import { SHOWERS, TOURS, MOON_STATES, FLYBY_INFO, ECLIPSES, JOURNEYS } from './content.js';
import { KR_SATS, ORBITERS, SITES } from './content-missions.js';

// ---------- constants & helpers ----------
const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const R_MW = 1050, R_SKY = 1000, R_DSO = 980, R_PLANET = 900;
const CDN = 'data/celestial/'; // d3-celestial (BSD 3-Clause) and OpenNGC (CC BY-SA 4.0), kept here by tools/fetch_vendor.py
const URLS = {
  stars: CDN + 'stars.8.json', starnames: CDN + 'starnames.json', lines: CDN + 'constellations.lines.json',
  consts: CDN + 'constellations.json', bounds: CDN + 'constellations.bounds.json', ngc: CDN + 'NGC.csv',
};
const $ = (id) => document.getElementById(id);
export const VERSION = window.SC_VERSION || ''; // set in version.js
const MOBILE = matchMedia('(max-width: 640px), (pointer: coarse)').matches; // phones get lighter versions of heavy features // bump the letter with every feature batch
for (const el of document.querySelectorAll('[data-version]')) el.textContent = el.dataset.version.replace('{v}', VERSION);

function eqVec(raDeg, decDeg, r = 1) {
  const a = raDeg * D2R, d = decDeg * D2R;
  return new THREE.Vector3(r * Math.cos(d) * Math.cos(a), r * Math.cos(d) * Math.sin(a), r * Math.sin(d));
}
function vecToRaDec(v) {
  const r = v.length();
  let ra = Math.atan2(v.y, v.x) * R2D; if (ra < 0) ra += 360;
  return { ra, dec: Math.asin(v.z / r) * R2D };
}
const fmtRA = (ra) => { const t = Math.round(((ra / 15) % 24 + 24) % 24 * 36000) / 10; // tenths of a second
  const H = Math.floor(t / 3600) % 24, M = Math.floor(t % 3600 / 60), S = t % 60;
  return `${H}h ${String(M).padStart(2, '0')}m ${S.toFixed(1).padStart(4, '0')}s`; };
const fmtDec = (d) => { const sg = d < 0 ? '−' : '+'; const t = Math.round(Math.abs(d) * 3600);
  return `${sg}${Math.floor(t / 3600)}° ${String(Math.floor(t % 3600 / 60)).padStart(2, '0')}′ ${String(t % 60).padStart(2, '0')}″`; };
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
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, preserveDrawingBuffer: true, alpha: true }); // alpha: the camera shows through in AR // preserve: screenshot button
renderer.autoClear = false;
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, 1, 250, 1300) // ground sphere (r=800) must not hit the near plane at wide fields; log depth keeps planets precise;
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
function julianDate(J) { // Julian-calendar Y-M-D for a Julian day number (Meeus ch.7, no Gregorian correction)
  const Z = Math.floor(J + 0.5), B = Z + 1524, C = Math.floor((B - 122.1) / 365.25), D = Math.floor(365.25 * C), E = Math.floor((B - D) / 30.6001);
  const m = E < 14 ? E - 1 : E - 13; return { y: m > 2 ? C - 4716 : C - 4715, m, d: B - D - Math.floor(30.6001 * E) };
}
function clockText(ms) { // before 15 Oct 1582 dates are shown in the Julian calendar, as history books write them
  if (ms >= -12219292800000) return new Date(ms).toLocaleString(LOCALE, { hour12: false });
  const off = -new Date().getTimezoneOffset() * 60000, J = jd(ms + off), j = julianDate(J), f = ((J + 0.5) % 1 + 1) % 1, hh = Math.floor(f * 24), mm = Math.floor(f * 1440) % 60;
  const y = j.y > 0 ? `${j.y}` : `기원전 ${1 - j.y}`; return `${y}. ${j.m}. ${j.d}. ${hh}시 ${String(mm).padStart(2, '0')}분 (율리우스력) · JD ${jd(ms).toFixed(2)} · ΔT ${Math.round(deltaT(ms)).toLocaleString()}초`;
}
function lstDeg(ms, lon) {
  const d = jd(ms) - 2451545.0;
  return (((280.46061837 + 360.98564736629 * d + lon) % 360) + 360) % 360;
}
// delta-T = TT - UT in seconds (Espenak & Meeus polynomials, NASA eclipse site); the clock shows UT, the planets move in TT
function deltaT(ms) {
  const y = 1970 + ms / 31557600000, u = (y - 1820) / 100, t = (a) => y - a;
  if (y < -500) return -20 + 32 * u * u;
  if (y < 500) { const x = y / 100; return 10583.6 - 1014.41 * x + 33.78311 * x ** 2 - 5.952053 * x ** 3 - 0.1798452 * x ** 4 + 0.022174192 * x ** 5 + 0.0090316521 * x ** 6; }
  if (y < 1600) { const x = (y - 1000) / 100; return 1574.2 - 556.01 * x + 71.23472 * x ** 2 + 0.319781 * x ** 3 - 0.8503463 * x ** 4 - 0.005050998 * x ** 5 + 0.0083572073 * x ** 6; }
  if (y < 1700) { const x = t(1600); return 120 - 0.9808 * x - 0.01532 * x ** 2 + x ** 3 / 7129; }
  if (y < 1800) { const x = t(1700); return 8.83 + 0.1603 * x - 0.0059285 * x ** 2 + 0.00013336 * x ** 3 - x ** 4 / 1174000; }
  if (y < 1860) { const x = t(1800); return 13.72 - 0.332447 * x + 0.0068612 * x ** 2 + 0.0041116 * x ** 3 - 0.00037436 * x ** 4 + 0.0000121272 * x ** 5 - 0.0000001699 * x ** 6 + 0.000000000875 * x ** 7; }
  if (y < 1900) { const x = t(1860); return 7.62 + 0.5737 * x - 0.251754 * x ** 2 + 0.01680668 * x ** 3 - 0.0004473624 * x ** 4 + x ** 5 / 233174; }
  if (y < 1920) { const x = t(1900); return -2.79 + 1.494119 * x - 0.0598939 * x ** 2 + 0.0061966 * x ** 3 - 0.000197 * x ** 4; }
  if (y < 1941) { const x = t(1920); return 21.20 + 0.84493 * x - 0.076100 * x ** 2 + 0.0020936 * x ** 3; }
  if (y < 1961) { const x = t(1950); return 29.07 + 0.407 * x - x * x / 233 + x ** 3 / 2547; }
  if (y < 1986) { const x = t(1975); return 45.45 + 1.067 * x - x * x / 260 - x ** 3 / 718; }
  if (y < 2005) { const x = t(2000); return 63.86 + 0.3345 * x - 0.060374 * x ** 2 + 0.0017275 * x ** 3 + 0.000651814 * x ** 4 + 0.00002373599 * x ** 5; }
  if (y < 2050) { const x = t(2000); return 62.92 + 0.32217 * x + 0.005589 * x * x; }
  if (y < 2150) return -20 + 32 * u * u - 0.5628 * (2150 - y);
  return -20 + 32 * u * u;
}
// precession (IAU 1976) and nutation (IAU 1980, the main terms, ~0.5") from J2000 to the true equator and equinox of date
function nutation(T) {
  const om = (125.04452 - 1934.136261 * T) * D2R, Ls = (280.4665 + 36000.7698 * T) * D2R, Lm = (218.3165 + 481267.8813 * T) * D2R;
  const dpsi = (-17.20 * Math.sin(om) - 1.32 * Math.sin(2 * Ls) - 0.23 * Math.sin(2 * Lm) + 0.21 * Math.sin(2 * om)) / 3600 * D2R;
  const deps = (9.20 * Math.cos(om) + 0.57 * Math.cos(2 * Ls) + 0.10 * Math.cos(2 * Lm) - 0.09 * Math.cos(2 * om)) / 3600 * D2R;
  const eps = (23.4392911 - 0.0130042 * T) * D2R; return { dpsi, deps, eps };
}
const rotM = (axis, a) => new THREE.Matrix4()[axis === 'x' ? 'makeRotationX' : axis === 'y' ? 'makeRotationY' : 'makeRotationZ'](a);
function precNutMatrix(ms) { // applied to J2000 vectors -> of-date
  const T = (jd(ms) + deltaT(ms) / 86400 - 2451545) / 36525, as = (x) => x / 3600 * D2R;
  const z = as(2306.2181 * T + 1.09468 * T * T + 0.018203 * T ** 3), ze = as(2306.2181 * T + 0.30188 * T * T + 0.017998 * T ** 3), th = as(2004.3109 * T - 0.42665 * T * T - 0.041833 * T ** 3);
  const P = rotM('z', z).multiply(rotM('y', -th)).multiply(rotM('z', ze)), n = nutation(T);
  const N = rotM('x', n.eps + n.deps).multiply(rotM('z', n.dpsi)).multiply(rotM('x', -n.eps));
  return { M: N.multiply(P), eqeq: n.dpsi * Math.cos(n.eps) };
}
function updateSkyMatrix() {
  if (mode.space) { sky.matrix.identity(); sky.matrixWorldNeedsUpdate = true; sky.updateMatrixWorld(true); return; }
  const pn = precNutMatrix(state.time), L = lstDeg(state.time, state.lon) * D2R + pn.eqeq, p = state.lat * D2R; // apparent sidereal time
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
  sky.matrix.multiplyMatrices(a, rz).multiply(pn.M);
  sky.matrixWorldNeedsUpdate = true;
  sky.updateMatrixWorld(true);
}

// ---------- atmosphere: refraction (Saemundsson) and extinction, shared by the sky shaders ----------
const atmoU = { refractOn: { value: 0 }, extK: { value: 0 } };
const ATMO_GLSL = `
  uniform float refractOn, extK;
  vec3 refractDir(vec3 d) { // lift apparent altitude near the horizon (~0.57 deg at 0 deg)
    float h = degrees(asin(clamp(d.y, -1.0, 1.0)));
    if (refractOn < 0.5 || h < -2.0) return d;
    float R = 1.02 / tan(radians(h + 10.3 / (h + 5.11))) / 60.0;
    float h2 = radians(h + R); vec2 hz = normalize(d.xz + vec2(1e-9));
    return vec3(hz.x * cos(h2), sin(h2), hz.y * cos(h2));
  }
  vec4 skyClip(vec3 p) { vec4 w = modelMatrix * vec4(p, 1.0); float r = length(w.xyz); w.xyz = refractDir(w.xyz / r) * r; return projectionMatrix * viewMatrix * w; }
  float airmass(vec3 p) { float s = max(normalize((modelMatrix * vec4(p, 1.0)).xyz).y, 0.0); return 1.0 / (s + 0.025 * exp(-11.0 * s)); }
`;
// sky lines (constellations, boundaries, grid) bend with the same refraction as the stars, or their corners miss the stars
function skyLineMat(color, opacity) {
  const m = new THREE.ShaderMaterial({ uniforms: { col: { value: new THREE.Color(color) }, ...atmoU },
    vertexShader: `${ATMO_GLSL}
 void main(){ gl_Position = skyClip(position); }`,
    fragmentShader: `uniform vec3 col; uniform float opa; void main(){ gl_FragColor = vec4(col, opa); }`,
    transparent: true, depthTest: false, depthWrite: false });
  m.opacity = opacity; m.uniforms.opa = { get value() { return m.opacity; } }; return m;
}
function refractVec(d) { // JS twin of refractDir, for labels and picking
  const h = Math.asin(Math.max(-1, Math.min(1, d.y))) * R2D; if (h < -2) return d;
  const R = 1.02 / Math.tan((h + 10.3 / (h + 5.11)) * D2R) / 60, h2 = (h + R) * D2R, k = Math.hypot(d.x, d.z) || 1e-9;
  return d.set(d.x / k * Math.cos(h2), Math.sin(h2), d.z / k * Math.cos(h2));
}
const airmassJS = (y) => { const s = Math.max(y, 0); return 1 / (s + 0.025 * Math.exp(-11 * s)); };

// ---------- stars ----------
const starData = { pos: [], mag: [], name: [], id: [], bv: [] };
let starPoints = null;
const starMat = new THREE.ShaderMaterial({
  uniforms: { limit: { value: 6.5 }, pr: { value: 1 }, dim: { value: 1 }, time: { value: 0 }, twinkle: { value: 0 }, ...atmoU },
  vertexShader: `
    attribute float mag; attribute vec3 color; varying vec3 vC; varying float vA;
    uniform float limit, pr, dim, time, twinkle;
    ${ATMO_GLSL}
    void main(){
      gl_Position = skyClip(position);
      float X = airmass(position);
      float d = limit - (mag + extK * (X - 1.0));
      vA = clamp(d * 0.6 + 0.4, 0.0, 1.0) * dim;
      // scintillation: stronger through more air (low altitude); two incommensurate waves per star
      float h = fract(sin(dot(position.xy, vec2(12.9898, 78.233))) * 43758.5453), tw = twinkle * clamp((X - 1.0) / 8.0, 0.1, 0.85);
      vA *= 1.0 + tw * sin(time * 13.0 + h * 60.0) * sin(time * 7.3 + h * 31.0);
      if (d < 0.0) vA = 0.0;
      gl_PointSize = clamp(2.0 + d * 1.25, 1.5, 16.0) * pr;
      vC = mix(color, color * vec3(1.0, 0.72, 0.45), extK > 0.0 ? clamp((X - 1.0) / 12.0, 0.0, 1.0) : 0.0); // reddening near the horizon
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
  uniforms: { map: { value: null }, gain: { value: 1 }, photo: { value: 0 } },
  vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D map; uniform float gain, photo; varying vec3 vP;
    const mat3 EQ2GAL = mat3(-0.0548755604, 0.4941094279, -0.8676661490,
                             -0.8734370902, -0.4448296300, -0.1980763734,
                             -0.4838350155, 0.7469822445, 0.4559837762);
    void main(){ vec3 g = EQ2GAL * normalize(vP);
      float l = atan(g.y, g.x), b = asin(clamp(g.z, -1.0, 1.0));
      vec2 uv = vec2(0.5 - l / 6.2831853, 0.5 + b / 3.1415927);
      vec3 c = texture2D(map, uv).rgb;
      gl_FragColor = vec4((photo > 0.5 ? c * 1.35 : pow(c, vec3(0.85))) * gain, 1.0); }`, // the photograph keeps its own tones
  side: THREE.BackSide, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, transparent: true,
});
const milkyWay = new THREE.Mesh(new THREE.SphereGeometry(R_MW, 96, 48), mwMat);
milkyWay.renderOrder = 0; milkyWay.visible = false; sky.add(milkyWay);
// Milky Way: the real all-sky photograph (ESO/S. Brunier, CC BY 4.0) by default, or the painted map (Solar System Scope)
const mwTex = {};
// A1: the same sphere also carries all-sky maps in other wavelengths (galactic plate carree like the photo); the visible stars dim so that light takes over
const WAVE_INFO = { radio: '전파 21 cm: 별 사이의 차가운 중성 수소 기체. 은하 원반 전체가 두껍게 빛납니다', micro: '마이크로파 (Planck): 띠는 은하의 먼지와 전자, 그 밖의 얼룩은 우주 배경 복사입니다',
  ir: '근적외선 2 μm (2MASS): 먼지를 뚫고 은하 중심의 늙은 별들이 드러납니다', halpha: 'H-알파 656 nm: 뜨거운 별이 이온화한 수소 구름(성운)이 붉게 빛납니다',
  xray: 'X선 (eROSITA, 독일 측 하늘 절반): 수백만 도의 뜨거운 기체, 초신성 잔해, 은하단', gamma: '감마선 (Fermi): 우주선이 기체와 부딪혀 내는 빛, 펄서, 먼 블랙홀 제트' };
function setMilkyWay(style) {
  const wave = $('wavelen')?.value || 'visible';
  const file = wave !== 'visible' ? `textures/allsky_${wave}.jpg` : style === 'photo' ? (matchMedia('(max-width: 640px)').matches ? 'textures/eso_milkyway_2k.jpg' : 'textures/eso_milkyway_4k.jpg') : 'textures/4k_milky_way.jpg';
  if (wave !== 'visible') $('status').textContent = WAVE_INFO[wave];
  const use = (t) => { mwMat.uniforms.map.value = t; mwMat.uniforms.photo.value = style === 'photo' || wave !== 'visible' ? 1 : 0; milkyWay.visible = $('t-mw').checked || wave !== 'visible'; };
  if (mwTex[file]) return use(mwTex[file]);
  new THREE.TextureLoader().load(file, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; mwTex[file] = t; if ($('mwstyle').value === style && file.includes(($('wavelen')?.value || 'visible') === 'visible' ? 'milky' : 'allsky_' + $('wavelen').value)) use(t); });
}
setMilkyWay($('mwstyle').value);
$('mwstyle').onchange = (e) => setMilkyWay(e.target.value);
$('wavelen').onchange = () => setMilkyWay($('mwstyle').value);

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
  const l = new THREE.LineSegments(g, skyLineMat(0x3a5a92, 0.55));
  l.frustumCulled = false; l.renderOrder = 1; linesGroup.add(l);
  if (cj) for (const f of cj.features) {
    let [ra, dec] = f.geometry.coordinates; if (ra < 0) ra += 360;
    const c = { kindName: 'const', v: eqVec(ra, dec), ra, dec, name: EN ? f.properties.name : f.properties.ko || f.properties.name, la: f.properties.name, desig: f.properties.desig || f.id, gen: f.properties.gen, rings: [] };
    constLabels.push(c); constById[c.desig] = c;
  }
  // IAU boundaries: dashed-looking faint lines, and polygons for "which constellation did I click"
  try {
    const bj = await fetch(URLS.bounds).then(r => r.json()), bp = [];
    for (const f of bj.features) {
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const poly of polys) for (const ring of poly) {
        const pts = ring.map(([a, d]) => [a < 0 ? a + 360 : a, d]); (constById[f.id]?.rings || []).push(pts.map(([a, d]) => eqVec(a, d)));
        for (let i = 0; i < pts.length - 1; i++) { const a = eqVec(pts[i][0], pts[i][1], R_SKY), b = eqVec(pts[i + 1][0], pts[i + 1][1], R_SKY); bp.push(a.x, a.y, a.z, b.x, b.y, b.z); }
      }
    }
    const bg2 = new THREE.BufferGeometry(); bg2.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
    const bl = new THREE.LineSegments(bg2, skyLineMat(0x7a6a3a, 0.45));
    bl.frustumCulled = false; bl.renderOrder = 1; boundsGroup.add(bl);
  } catch { /* boundaries are optional */ }
}
const constById = {};
const boundsGroup = new THREE.Group(); boundsGroup.visible = false; sky.add(boundsGroup);
function constAt(dirEq) { // stereographic projection about the click point, then a winding-number test per boundary ring
  const P = dirEq.clone().normalize(), e1 = new THREE.Vector3(0, 0, 1).cross(P); if (e1.lengthSq() < 1e-9) e1.set(1, 0, 0); e1.normalize(); const e2 = P.clone().cross(e1);
  for (const c of constLabels) for (const ring of c.rings) {
    let w = 0, prev = null;
    for (const v of ring) {
      const k = 1 + v.dot(P); if (k < 1e-6) { prev = null; continue; }
      const cur = Math.atan2(v.dot(e2) / k, v.dot(e1) / k);
      if (prev !== null) { let d = cur - prev; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; w += d; }
      prev = cur;
    }
    if (Math.abs(w) > Math.PI) return c;
  }
  return null;
}
const koreanGroup = new THREE.Group(); koreanGroup.visible = false; sky.add(koreanGroup);
const koreanLabels = [];
async function loadKorean() { // 천상열차분야지도 (Stellarium "korean" sky culture, GPL v2.0: data/LICENSE-korean-constellations.txt)
  const js = await fetch('data/korean-constellations.json').then(r => r.json());
  const byHip = new Map(); starData.id.forEach((id, i) => byHip.set(+id, starData.pos[i]));
  const pts = [], mansion = new Set(js.mansions.stars);
  for (const c of js.constellations) {
    const used = [];
    for (const line of c.lines) for (let i = 0; i < line.length - 1; i++) { const a = byHip.get(line[i]), b = byHip.get(line[i + 1]); if (!a || !b) continue;
      pts.push(a.x * R_SKY, a.y * R_SKY, a.z * R_SKY, b.x * R_SKY, b.y * R_SKY, b.z * R_SKY); used.push(a, b); }
    for (const line of c.lines) if (line.length === 1 || line[0] === line[1]) { const a = byHip.get(line[0]); if (a) used.push(a); }
    if (!used.length) continue;
    const v = used.reduce((s, x) => s.add(x), new THREE.Vector3()).normalize();
    const big = c.lines.flat().some(h => mansion.has(h));
    koreanLabels.push({ v, name: EN ? c.en : c.ko.replace(/\(.*\)/, ''), hanja: (c.ko.match(/\((.*)\)/) || [])[1] || '', n: used.length, mansion: big });
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const l = new THREE.LineSegments(g, skyLineMat(0xc9925a, 0.6));
  l.frustumCulled = false; l.renderOrder = 1; koreanGroup.add(l);
  return koreanLabels.length;
}
// other sky cultures (Stellarium data, separate files with their licences: data/LICENSE-skycultures.txt), loaded on first use
const CULTURES = { chinese: { color: 0xd4a35a, group: new THREE.Group(), labels: [], state: 0 }, egyptian: { color: 0xc8b27a, group: new THREE.Group(), labels: [], state: 0 } };
for (const k in CULTURES) { CULTURES[k].group.visible = false; sky.add(CULTURES[k].group); }
async function loadCulture(key) {
  const C = CULTURES[key]; if (C.state) return; C.state = 1;
  const js = await fetch(`data/culture-${key}.json`).then(r => r.json()), byHip = new Map(); starData.id.forEach((id, i) => byHip.set(+id, starData.pos[i]));
  const pts = [];
  for (const cn of js.constellations) { const used = [];
    for (const line of cn.lines) for (let i = 0; i < line.length - 1; i++) { const a = byHip.get(line[i]), b = byHip.get(line[i + 1]); if (!a || !b) continue;
      pts.push(a.x * R_SKY, a.y * R_SKY, a.z * R_SKY, b.x * R_SKY, b.y * R_SKY, b.z * R_SKY); used.push(a, b); }
    if (!used.length) continue;
    // Chinese names are shown in their characters (with the English gloss when zoomed in); Egyptian names in English
    C.labels.push({ v: used.reduce((s, x) => s.add(x), new THREE.Vector3()).normalize(), name: key === 'chinese' && !EN ? cn.native : cn.en || cn.native, gloss: key === 'chinese' ? cn.en : '', n: used.length }); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const l = new THREE.LineSegments(g, skyLineMat(C.color, 0.6)); l.frustumCulled = false; l.renderOrder = 1; C.group.add(l); C.state = 2; applySkyCulture();
}
function applySkyCulture() { const v = $('skyculture').value, on = $('t-lines').checked, k = v === 'korean';
  koreanGroup.visible = k && on; linesGroup.visible = v === 'western' && on;
  for (const key in CULTURES) { CULTURES[key].group.visible = v === key && on; if (v === key && !CULTURES[key].state) loadCulture(key).catch(() => {}); } }
const gridGroup = new THREE.Group(); gridGroup.visible = false; sky.add(gridGroup);
(function buildGrid() {
  const pts = [];
  for (let dec = -80; dec <= 80; dec += 10) for (let ra = 0; ra < 360; ra += 2) {
    const a = eqVec(ra, dec, R_SKY), b = eqVec(ra + 2, dec, R_SKY); pts.push(a.x, a.y, a.z, b.x, b.y, b.z); }
  for (let ra = 0; ra < 360; ra += 15) for (let dec = -88; dec < 88; dec += 2) {
    const a = eqVec(ra, dec, R_SKY), b = eqVec(ra, dec + 2, R_SKY); pts.push(a.x, a.y, a.z, b.x, b.y, b.z); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const l = new THREE.LineSegments(g, skyLineMat(0x5aa7c0, 0.42));
  l.frustumCulled = false; l.renderOrder = 1; gridGroup.add(l);
})();

// ---------- NGC / IC deep-sky objects (OpenNGC) ----------
const TYPE = { G: 0, GPair: 0, GTrpl: 0, GGroup: 0, OCl: 1, GCl: 2, EmN: 3, HII: 3, Neb: 3, RfN: 3, SNR: 3, 'Cl+N': 3, PN: 4, '*Ass': 5, Other: 5, Nova: 5 };
const TYPE_KO = ['은하', '산개성단', '구상성단', '성운', '행성상성운', '기타'];
const TYPE_RAW_KO = { G: '은하', GPair: '은하 쌍', GTrpl: '은하 삼중', GGroup: '은하군', OCl: '산개성단', GCl: '구상성단', EmN: '발광성운',
  HII: 'HII 영역', Neb: '성운', RfN: '반사성운', SNR: '초신성 잔해', 'Cl+N': '성단+성운', PN: '행성상성운', '*Ass': '성협', Other: '기타' };
const dsos = [];
const dsoMat = new THREE.ShaderMaterial({
  uniforms: { pxPerDeg: { value: 10 }, pr: { value: 1 }, limit: { value: 10 }, dim: { value: 1 }, ...atmoU },
  vertexShader: `
    attribute float size, ratio, pa, kind, mag; attribute vec3 north;
    uniform float pxPerDeg, pr, limit, dim;
    ${ATMO_GLSL}
    varying float vKind, vRatio, vAng, vA, vSeed;
    void main(){
      vec4 c0 = skyClip(position);
      vec4 c1 = skyClip(position + north * 2.0);
      gl_Position = c0;
      vec2 s0 = c0.xy / c0.w, s1 = c1.xy / c1.w;
      vec2 nd = s1 - s0; nd.x *= projectionMatrix[1][1] / projectionMatrix[0][0];
      vAng = atan(nd.y, nd.x) + pa;          // PA measured N -> E (CCW on screen)
      float px = size / 60.0 * pxPerDeg;      // size in arcmin
      float bright = clamp((limit - mag - extK * (airmass(position) - 1.0)) / 3.0 + 0.35, 0.0, 1.0);
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
      } else if (k == 1) { // open cluster: its real stars are drawn from Hipparcos / Gaia; here only a faint glow and the chart symbol (dotted circle)
        float a = atan(p.y, p.x), dash = step(0.5, fract(a / 6.2831853 * 28.0));
        I = 0.06 * exp(-rr*rr*3.0) + 0.22 * dash * exp(-pow((rr - 0.9) * 22.0, 2.0)); col = vec3(0.75,0.85,1.0); r = rr * 0.9;
      } else if (k == 2) { // globular: King-like profile (bright core, long halo) with fine unresolved grain
        float rc = 0.12, king = 1.0 / (1.0 + rr*rr/(rc*rc)) - 1.0 / (1.0 + 1.0/(rc*rc));
        float grain = 0.75 + 0.5 * h(floor(gl_FragCoord.xy));
        I = max(king, 0.0) * 0.9 * grain; col = vec3(1.0,0.93,0.78); r = rr;
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
  uniforms: { pr: { value: 1 }, alpha: { value: 1 }, ...atmoU },
  vertexShader: `attribute float n; uniform float pr; varying float vN;
    ${ATMO_GLSL}
    void main(){ gl_Position = skyClip(position); vN = n; gl_PointSize = (7.0 + min(n, 7.0)) * pr; }`,
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
    el('circle', { cx: X(a), cy: y, r, fill: p[5] && p[5] < 330 && p[5] > 180 ? '#8fb8c9' : '#F3E2A6' });
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

// ---------- photo sky: real telescope imagery (CDS hips2fits, DSS2 colour) of whatever you are zoomed into ----------
const skyPhotos = []; let skyReq = null, skyTimer = 0;
function skyPhotoMesh(tex, ra, dec, fovDeg) {
  const sz = 2 * (R_DSO - 8) * Math.tan(fovDeg / 2 * D2R);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(sz, sz), new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, op: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform sampler2D map; uniform float op; varying vec2 vUv; void main(){
      vec2 q = abs(vUv - 0.5) * 2.0; float e = smoothstep(1.0, 0.75, max(q.x, q.y));
      gl_FragColor = vec4(texture2D(map, vUv).rgb * e * op, 1.0); }`,
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.renderOrder = 3; m.userData = { ra, dec, born: performance.now() }; scene.add(m); return m;
}
function updateSkyPhoto() {
  const want = $('t-photo').checked && view.fov < 12 && !(groundOn() && camFwd().y < 0) && ![...hips.tiles.values()].some(m => m.userData.ready && m.material.uniforms.op.value > 0.3);
  const now = performance.now();
  for (const m of skyPhotos) { // keep each image on its patch of sky; fade in new, fade out old
    const a = m.userData.ra * D2R, d = m.userData.dec * D2R;
    m.position.copy(eqVec(m.userData.ra, m.userData.dec).applyMatrix4(sky.matrixWorld).normalize().multiplyScalar(R_DSO - 8));
    m.up.copy(new THREE.Vector3(-Math.sin(d) * Math.cos(a), -Math.sin(d) * Math.sin(a), Math.cos(d)).transformDirection(sky.matrixWorld)); m.lookAt(0, 0, 0);
    const target = want && m === skyPhotos[skyPhotos.length - 1] ? 1 : 0; m.material.uniforms.op.value += (target * 0.85 - m.material.uniforms.op.value) * 0.08;
  }
  while (skyPhotos.length > 1 && skyPhotos[0].material.uniforms.op.value < 0.02) { const m = skyPhotos.shift(); scene.remove(m); m.material.uniforms.map.value?.dispose(); m.geometry.dispose(); }
  if (!want) return;
  const c = vecToRaDec(camFwd().applyMatrix4(new THREE.Matrix4().copy(sky.matrixWorld).invert()));
  const last = skyPhotos[skyPhotos.length - 1]?.userData, fovImg = Math.min(15, view.fov * 1.6);
  const moved = !last || Math.acos(Math.min(1, eqVec(c.ra, c.dec).dot(eqVec(last.ra, last.dec)))) * R2D > view.fov * 0.3 || Math.abs(Math.log(last.fov / fovImg)) > 0.4;
  if (!moved || skyReq) { skyTimer = now; return; }
  if (now - skyTimer < 450) return; // wait until the view settles
  const px = MOBILE ? 512 : 1024;
  const url = `https://alasky.cds.unistra.fr/hips-image-services/hips2fits?hips=CDS%2FP%2FDSS2%2Fcolor&width=${px}&height=${px}&fov=${fovImg.toFixed(5)}&projection=TAN&coordsys=icrs&ra=${c.ra.toFixed(5)}&dec=${c.dec.toFixed(5)}&format=jpg`;
  skyReq = url; const loader = new THREE.TextureLoader(); loader.setCrossOrigin('anonymous');
  loader.load(url, (t) => { t.colorSpace = THREE.SRGBColorSpace; const m = skyPhotoMesh(t, c.ra, c.dec, fovImg); m.userData.fov = fovImg; skyPhotos.push(m); skyReq = null; },
    undefined, () => { skyReq = null; skyTimer = now + 5000; });
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
function moonGeo(T) { // Meeus ch.47 (moon.js); T is UT centuries, so add delta-T (~69 s)
  const { lon, lat, km } = moonMeeus(T + deltaT(T * 3155760000000 + 946728000000) / 86400 / 36525), r = km / 149597870.7;
  return new THREE.Vector3(r * Math.cos(lat) * Math.cos(lon), r * Math.cos(lat) * Math.sin(lon), r * Math.sin(lat));
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
  { name: 'Io', img: 'textures/2k_io.jpg', ko: '이오', parent: 'Jupiter', R: 1822, pole: [268.06, 64.5], tex: () => rocky('#d8c45a', ['#b0742a', '#f1e7a0', '#7a4a1c'], 41), period: 1.769 },
  { name: 'Europa', img: 'textures/2k_europa.jpg', ko: '유로파', parent: 'Jupiter', R: 1561, pole: [268.06, 64.5], tex: () => rocky('#d9cfbf', ['#a0785a', '#f4efe6'], 43), period: 3.551 },
  { name: 'Ganymede', img: 'textures/2k_ganymede.jpg', ko: '가니메데', parent: 'Jupiter', R: 2634, pole: [268.06, 64.5], tex: () => rocky('#8f8578', ['#5d544a', '#c9c2b5'], 47, 120), period: 7.155 },
  { name: 'Callisto', img: 'textures/2k_callisto.jpg', ko: '칼리스토', parent: 'Jupiter', R: 2410, pole: [268.06, 64.5], tex: () => rocky('#5e554b', ['#3b342d', '#a59c8f'], 53, 400), period: 16.689 },
  { name: 'Ceres', img: 'textures/2k_ceres.jpg', ko: '세레스', R: 470, pole: [291.4, 66.8], period: 0.378, small: '왜행성',
    sb: { epoch: 2461200.5, a: 2.765552595034094, e: .07969229514816586, i: 10.58802780183462, om: 80.24862682043221, w: 73.29421453021587, ma: 274.4193463761342, n: .21430445064843 } },
  { name: 'Vesta', img: 'textures/2k_vesta.jpg', ko: '베스타', R: 263, pole: [309, 42], period: 0.223, small: '소행성', tex: () => rocky('#8f8a80', ['#5f5a52', '#b8b2a6'], 61, 200),
    sb: { epoch: 2461200.5, a: 2.361365965127599, e: .09020374382834395, i: 7.143925545058711, om: 103.701293265032, w: 151.4686478221564, ma: 81.19015607686903, n: .2716183613599909 } },
  { name: 'Pluto', img: 'textures/2k_pluto.jpg', ko: '명왕성', R: 1188, pole: [132.99, -6.16], period: -6.387, small: '왜행성', tex: () => rocky('#c9a982', ['#6b4a35', '#efe2cf', '#8a6a52'], 67),
    sb: { epoch: 2457588.5, a: 39.58862938517124, e: .2518378778576892, i: 17.14771140999114, om: 110.2923840543057, w: 113.7090015158565, ma: 38.68366347318184, n: .003956838955553025 } },
  { name: 'Eris', ko: '에리스', img: 'textures/2k_eris_fictional.jpg', R: 1163, pole: [0, 90], period: 15.8, small: '왜행성',
    sb: { epoch: 2461200.5, a: 67.93394687853566, e: .4382385347971672, i: 43.9258279471791, om: 36.00477044417249, w: 150.7949235840312, ma: 211.774434275007, n: .001760247770619088 } },
  { name: 'Haumea', ko: '하우메아', img: 'textures/2k_haumea_fictional.jpg', R: 780, pole: [0, 90], period: 0.163, small: '왜행성',
    sb: { epoch: 2461200.5, a: 43.06029023650952, e: .1944430148898797, i: 28.20847393040364, om: 121.7860561329425, w: 240.6905472508661, ma: 223.2104118812299, n: .003488097731816818 } },
  { name: 'Makemake', ko: '마케마케', img: 'textures/2k_makemake_fictional.jpg', R: 715, pole: [0, 90], period: 0.95, small: '왜행성',
    sb: { epoch: 2461200.5, a: 45.57093317300052, e: .1588889953992523, i: 29.02785603743067, om: 79.2948338209406, w: 297.0922733397207, ma: 169.9379962048232, n: .003203850120050116 } },
  { name: 'Halley', ko: '핼리 혜성', R: 5.5, pole: [0, 90], period: 2.2, small: '혜성 (1P)', tex: () => rocky('#3a342e', ['#1e1a17', '#5a5048'], 71, 60),
    sb: { epoch: 2439875.5, a: 17.92863504856923, e: .9679359956953211, i: 162.1905300439129, om: 59.09894720612437, w: 112.2414314637764, ma: 274.3823371366792, n: .01298324443268444 } },
  ...MOON_STATES.map((m, i) => ({ name: m.name, ko: m.ko, parent: m.parent, R: m.R, pole: { Mars: [317.68, 52.89], Saturn: [40.59, 83.54], Uranus: [257.31, -15.18], Neptune: [299.36, 43.46] }[m.parent],
    period: m.P, orb: m, tex: () => rocky(m.name === 'Triton' ? '#c9b4a6' : m.name === 'Enceladus' ? '#f2f2f0' : '#9d9890', ['#6a655e', '#cfcac2'], 80 + i, 150) })),
  { name: 'Titan', img: 'textures/2k_titan.jpg', ko: '타이탄', parent: 'Saturn', R: 2575, pole: [40.59, 83.54], tex: () => banded(['#d29a4a', '#c88c3c', '#ddb070'], 59, 3), period: 15.945 },
];
const KM_AU = 149597870.7;
const eclU = { on: { value: 0 }, shadowDir: { value: new THREE.Vector3(0, 0, 1) }, umbR: { value: 0.012 }, penR: { value: 0.022 } };
const planetMat = (tex, emissive) => new THREE.ShaderMaterial({
  uniforms: { ...eclU, isMoon: { value: 0 }, occ: { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) }, occN: { value: 0 }, sunAng: { value: 0.005 },
    ringOn: { value: 0 }, ringN: { value: new THREE.Vector3(0, 1, 0) }, ringC: { value: new THREE.Vector3() }, ringR: { value: 1 }, ringMap: { value: null }, map: { value: tex }, ambient: { value: 0.025 }, night: { value: null }, hasNight: { value: 0 }, sunDir: { value: new THREE.Vector3(1, 0, 0) }, emissive: { value: emissive ? 1 : 0 }, bump: { value: null }, hasBump: { value: 0 }, bumpK: { value: 0 } },
  vertexShader: `#include <common>
    #include <logdepthbuf_pars_vertex>
    varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying vec3 vPole; void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vW = (modelMatrix * vec4(position, 1.0)).xyz; vPole = mat3(modelMatrix) * vec3(0.0, 1.0, 0.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
    #include <logdepthbuf_vertex>
    }`,
  fragmentShader: `#include <logdepthbuf_pars_fragment>
    uniform vec4 occ[4]; uniform int occN; uniform float sunAng; uniform float ringOn, ringR; uniform vec3 ringN, ringC; uniform sampler2D ringMap;
    uniform sampler2D map, night; uniform float hasNight, ambient, on, umbR, penR, isMoon; uniform vec3 shadowDir; varying vec3 vW; uniform vec3 sunDir; uniform float emissive; varying vec2 vUv; varying vec3 vN;
    uniform sampler2D bump; uniform float hasBump, bumpK; varying vec3 vPole;
    void main(){
      #include <logdepthbuf_fragment>
      vec3 n = normalize(vN);
      if (hasBump > 0.5) { // relief from a height map (LOLA / MOLA): tilt the normal by the local slope, east and north
        vec3 P = normalize(vPole), e = cross(P, n); float cl = max(0.03, length(e)); e /= cl; vec3 no = cross(n, e);
        float hx = texture2D(bump, vUv + vec2(1.0 / 4096.0, 0.0)).r - texture2D(bump, vUv - vec2(1.0 / 4096.0, 0.0)).r;
        float hy = texture2D(bump, vUv + vec2(0.0, 1.0 / 2048.0)).r - texture2D(bump, vUv - vec2(0.0, 1.0 / 2048.0)).r;
        n = normalize(n - bumpK * (hx / (2.0 * 6.2831853 / 4096.0 * cl) * e + hy / (2.0 * 3.1415927 / 2048.0) * no)); }
      float ndl = dot(n, sunDir);
      vec3 c = texture2D(map, vUv).rgb; float l = emissive > 0.5 ? 1.2 : max(ndl, 0.0) * 1.15 + ambient;
      // the Sun map is a filtered (orange) image; to the eye the photosphere is near-white, keep only a hint of granulation
      if (emissive > 0.5) { c = mix(vec3(1.0, 0.97, 0.9), c, 0.18); l = 1.25; }
      vec3 col = c * l;
      if (on > 0.5 && isMoon > 0.5) { // lunar eclipse: penumbral dimming, then the copper-red umbra
        float sp = acos(clamp(dot(normalize(vW), shadowDir), -1.0, 1.0));
        float um = 1.0 - smoothstep(umbR * 0.985, umbR * 1.015, sp), pe = 1.0 - smoothstep(umbR, penR, sp);
        col *= 1.0 - 0.55 * pe * (1.0 - um);
        float lum = dot(c, vec3(0.3, 0.59, 0.11)); col = mix(col, lum * vec3(0.62, 0.2, 0.09) * 0.55, um);
      }
      // shadows cast on this body: moons (round, soft-edged) and Saturn's rings (their own transparency)
      for (int i = 0; i < 4; i++) { if (i >= occN) break;
        vec3 toC = occ[i].xyz - vW; float t = dot(toC, sunDir);
        // umbra and penumbra from the Sun's real apparent size: the edge is as wide as the Sun's disc projected over the gap
        if (t > 0.0) { float w = max(t * sunAng, 1e-4 * occ[i].w), d = length(toC - sunDir * t), cover = min(1.0, (occ[i].w / w) * (occ[i].w / w));
          col *= 1.0 - 0.97 * cover * (1.0 - smoothstep(abs(occ[i].w - w), occ[i].w + w, d)); } }
      if (ringOn > 0.5) { float dn = dot(sunDir, ringN);
        if (abs(dn) > 1e-4) { float t = dot(ringC - vW, ringN) / dn;
          if (t > 0.0) { float rr = length(vW + sunDir * t - ringC) / ringR;
            if (rr > 1.11 && rr < 2.33) col *= 1.0 - 0.85 * texture2D(ringMap, vec2((rr - 1.11) / 1.22, 0.5)).a; } } }
      if (hasNight > 0.5) col += texture2D(night, vUv).rgb * (1.0 - smoothstep(-0.12, 0.08, ndl)) * 1.3; // city lights on the night side
      gl_FragColor = vec4(col, 1.0); }`,
  depthTest: true, depthWrite: true,
});
const texLoader = new THREE.TextureLoader();
// close to the Moon or Mars (S5): 8k colour and LOLA / MOLA relief. [height range in m, exaggeration]
const HIRES = { Moon: ['8k_moon.jpg', 'disp_moon.png', 20000, 2], Mars: ['8k_mars.jpg', 'disp_mars.png', 29500, 2] };
function loadHires(p) {
  p.hires = true; const [col, disp, range, ex] = HIRES[p.name], u = p.mesh.material.uniforms;
  texLoader.load('textures/' + col, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; u.map.value = t; });
  texLoader.load('textures/' + disp, (t) => { t.anisotropy = 4; u.bump.value = t; u.bumpK.value = range / (p.R * 1000) * ex; u.hasBump.value = 1; });
  $('status').textContent = `${p.ko} 고해상도 표면을 받는 중 (8k 사진, ${p.name === 'Moon' ? 'LRO LOLA' : 'MGS MOLA'} 고도)`;
}
const planetGroup = new THREE.Group(); planetScene.add(planetGroup);
for (const p of PLANETS) {
  p.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), planetMat(p.tex ? p.tex() : rocky('#8a8580', ['#5a5650', '#b0aaa0'], 5), p.emissive));
  p.mesh.renderOrder = 5;
  // real texture maps (Solar System Scope, CC BY 4.0); procedural map stays as fallback
  if (p.name === 'Moon') p.mesh.material.uniforms.isMoon.value = 1;
  if (p.name === 'Earth') texLoader.load('textures/2k_earth_nightmap.jpg', (t) => { t.colorSpace = THREE.SRGBColorSpace; p.mesh.material.uniforms.night.value = t; p.mesh.material.uniforms.hasNight.value = 1; });
  if (p.img) texLoader.load(p.img, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; p.mesh.material.uniforms.map.value = t; });
  if (p.ring) {
    const rg = new THREE.RingGeometry(1.11, 2.33, 128, 1);
    const pos = rg.attributes.position, uv = rg.attributes.uv;
    for (let i = 0; i < pos.count; i++) { const r = Math.hypot(pos.getX(i), pos.getY(i)); uv.setXY(i, (r - 1.11) / 1.22, 0.5); }
    const rt = noiseTex(512, 4, (c, w) => { const r = rnd(5); for (let x = 0; x < w; x++) { const t = x / w;
      const a = (t > 0.52 && t < 0.57) ? 0.05 : (0.35 + r() * 0.5) * (t < 0.15 ? 0.4 : 1); c.fillStyle = `rgba(${215 + r() * 30},${190 + r() * 30},${150 + r() * 30},${a})`; c.fillRect(x, 0, 1, 4); } });
    const ringMat = new THREE.ShaderMaterial({ uniforms: { map: { value: rt }, sunDir: { value: new THREE.Vector3() }, C: { value: new THREE.Vector3() }, R: { value: 1 } },
      vertexShader: `#include <common>
        #include <logdepthbuf_pars_vertex>
        varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        #include <logdepthbuf_vertex>
        }`,
      fragmentShader: `#include <logdepthbuf_pars_fragment>
        uniform sampler2D map; uniform vec3 sunDir, C; uniform float R; varying vec2 vUv; varying vec3 vW; void main(){
        #include <logdepthbuf_fragment>
        vec3 d = vW - C; float along = dot(d, sunDir); // behind the planet as seen from the Sun -> in its shadow
        float lit = along < 0.0 ? smoothstep(R * 0.97, R * 1.03, length(d - sunDir * along)) : 1.0;
        vec4 t = texture2D(map, vUv); gl_FragColor = vec4(t.rgb * 0.9 * mix(0.12, 1.0, lit), t.a); }`,
      side: THREE.DoubleSide, transparent: true, depthWrite: false });
    texLoader.load('textures/2k_saturn_ring_alpha.png', (t) => { t.colorSpace = THREE.SRGBColorSpace; ringMat.uniforms.map.value = t; });
    const ring = new THREE.Mesh(rg, ringMat); ring.rotation.x = -Math.PI / 2; ring.renderOrder = 6; p.mesh.add(ring); p.ringMesh = ring;
  }
  // C4 atmospheres: [shell size, day colour, colour near the terminator, strength, forward scattering when backlit]
  // Earth: blue (Rayleigh) turning red at sunset; Mars: butterscotch dust by day, blue at sunset (dust scatters blue forward); Titan and Pluto: haze that rings the night side
  const ATMO = { Earth: [1.025, [0.35, 0.62, 1.0], [1.0, 0.45, 0.2], 1.2, 0.5], Venus: [1.035, [1.0, 0.92, 0.7], [1.0, 0.7, 0.4], 1.0, 0.6], Mars: [1.012, [0.95, 0.62, 0.42], [0.45, 0.6, 1.0], 0.7, 0.8],
    Titan: [1.12, [1.0, 0.68, 0.3], [0.9, 0.45, 0.15], 1.1, 2.2], Pluto: [1.06, [0.45, 0.62, 1.0], [0.4, 0.55, 1.0], 0.5, 2.5], Jupiter: [1.008, [0.95, 0.88, 0.75], [0.8, 0.55, 0.35], 0.35, 0.3],
    Saturn: [1.01, [0.95, 0.88, 0.7], [0.8, 0.6, 0.35], 0.35, 0.3], Uranus: [1.015, [0.6, 0.9, 0.95], [0.5, 0.75, 0.9], 0.6, 0.4], Neptune: [1.015, [0.4, 0.6, 1.0], [0.35, 0.5, 0.95], 0.6, 0.4] }[p.name];
  if (ATMO) { // a lit rim of atmosphere (Fresnel glow), brightest at the limb on the day side
    const am = new THREE.ShaderMaterial({ uniforms: { sunDir: p.mesh.material.uniforms.sunDir, col: { value: new THREE.Vector3(...ATMO[1]) }, col2: { value: new THREE.Vector3(...ATMO[2]) }, k: { value: ATMO[3] }, fwd: { value: ATMO[4] } },
      vertexShader: `#include <common>
        #include <logdepthbuf_pars_vertex>
        varying vec3 vN, vW; void main(){ vN = normalize(mat3(modelMatrix) * normal); vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
        }`,
      fragmentShader: `#include <logdepthbuf_pars_fragment>
        uniform vec3 sunDir, col, col2; uniform float k, fwd; varying vec3 vN, vW; void main(){
        #include <logdepthbuf_fragment>
        vec3 n = normalize(vN), v = normalize(-vW); float rim = pow(1.0 - abs(dot(n, v)), 3.0), mu = dot(n, sunDir);
        float day = smoothstep(-0.35, 0.45, mu);
        vec3 c = mix(col2, col, smoothstep(-0.05, 0.4, mu));          // colour of light that crossed a long, low path through the air
        float back = pow(max(0.0, -dot(v, sunDir)), 6.0) * smoothstep(-0.6, 0.1, mu); // sunlight scattered forward around the limb when we look toward the Sun
        gl_FragColor = vec4((c * day + col2 * back * fwd) * rim * k, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const atm = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), am); atm.scale.setScalar(ATMO[0]); atm.renderOrder = 7; p.mesh.add(atm);
  }
  if (p.name === 'Earth') { // cloud layer, lit by the Sun, drifting slowly against the surface
    const cm = new THREE.ShaderMaterial({ uniforms: { map: { value: null }, sunDir: p.mesh.material.uniforms.sunDir },
      vertexShader: `#include <common>
        #include <logdepthbuf_pars_vertex>
        varying vec2 vUv; varying vec3 vN; void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
        }`,
      fragmentShader: `#include <logdepthbuf_pars_fragment>
        uniform sampler2D map; uniform vec3 sunDir; varying vec2 vUv; varying vec3 vN; void main(){
        #include <logdepthbuf_fragment>
        float a = texture2D(map, vUv).r; float l = max(dot(normalize(vN), sunDir), 0.0) * 1.1 + 0.015;
        gl_FragColor = vec4(vec3(l), a * 0.9); }`,
      transparent: true, depthWrite: false });
    texLoader.load(MOBILE ? 'textures/2k_earth_clouds.jpg' : 'textures/2k_earth_clouds.jpg', (t) => { cm.uniforms.map.value = t; });
    const clouds = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), cm); clouds.scale.setScalar(1.006); clouds.renderOrder = 6; p.mesh.add(clouds); p.clouds = clouds;
  }
  if (p.emissive) {
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: noiseTex(256, 256, (c, w, h) => { const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,252,240,1)'); g.addColorStop(.2, 'rgba(255,244,220,.45)'); g.addColorStop(1, 'rgba(255,236,200,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); }),
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    glow.scale.setScalar(8); p.mesh.add(glow); p.glow = glow;
  }
  planetGroup.add(p.mesh);
}
function orbOffset(m, jdNow) { // circular orbit through the Horizons state vector; equatorial AU from the parent
  const r = new THREE.Vector3(...m.r), v = new THREE.Vector3(...m.v), a = r.length();
  const e1 = r.clone().normalize(), e2 = r.clone().cross(v).cross(r).normalize(), th = 2 * Math.PI * (jdNow - m.jd) / m.P;
  return e1.multiplyScalar(a * Math.cos(th)).addScaledVector(e2, a * Math.sin(th)).divideScalar(KM_AU);
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
  for (const p of PLANETS) if (p.orb) out[p.name] = orbOffset(p.orb, JD);
  return out;
}
const rotOnly = new THREE.Matrix3();
function orientBody(p) {
  if (p.name === 'Earth') { // texture longitude 0 (u = 0.5) faces the Greenwich meridian: sidereal time sets the spin
    const g = lstDeg(state.time, 0) * D2R;
    const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(Math.cos(g), Math.sin(g), 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(Math.sin(g), -Math.cos(g), 0));
    p.mesh.quaternion.setFromRotationMatrix(m.premultiply(new THREE.Matrix4().extractRotation(sky.matrixWorld))); return;
  }
  const IAU = { Mars: [317.681, 52.887, 176.630, 350.89198226], Venus: [272.76, 67.16, 160.20, -1.4813688], Mercury: [281.0103, 61.4155, 329.5988, 6.1385108] }[p.name];
  if (IAU || p.name === 'Moon') { // map longitude 0 of the texture to the body's real prime meridian (landing sites depend on it)
    const poleEq = IAU ? eqVec(IAU[0], IAU[1]) : eqVec(p.pole[0], p.pole[1]); let X;
    if (IAU) { const N = new THREE.Vector3(0, 0, 1).cross(poleEq).normalize(), W = (IAU[2] + IAU[3] * (jd(state.time) - 2451545.0)) * D2R;
      X = N.clone().multiplyScalar(Math.cos(W)).addScaledVector(poleEq.clone().cross(N), Math.sin(W)); }
    else { const toE = moonToEarthEq(); X = toE.addScaledVector(poleEq, -toE.dot(poleEq)).normalize(); } // mean sub-Earth point = longitude 0
    const m = new THREE.Matrix4().makeBasis(X, poleEq, X.clone().cross(poleEq));
    p.mesh.quaternion.setFromRotationMatrix(m.premultiply(new THREE.Matrix4().extractRotation(sky.matrixWorld))); return;
  }
  const pole = eqVec(p.pole[0], p.pole[1]).transformDirection(sky.matrixWorld);
  p.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pole);
  p.mesh.rotateY(((jd(state.time) / p.period) % 1) * Math.PI * 2);
}
function moonToEarthEq() { const T = (jd(state.time) - 2451545.0) / 36525; return ecl2eq(moonGeo(T)).negate().normalize(); }
// ---------- asteroid belt and Kuiper belt: Kepler orbits solved per vertex on the GPU ----------
const asteroidMat = new THREE.ShaderMaterial({
  uniforms: { tDays: { value: 0 }, camPos: { value: new THREE.Vector3() }, pr: { value: 1 }, beltK: { value: 1 } },
  vertexShader: `#include <common>
    #include <logdepthbuf_pars_vertex>
    attribute vec4 el1; attribute vec3 el2; uniform float tDays, pr, beltK; uniform vec3 camPos; varying float vT;
    void main() {
      float a = el1.x, e = el1.y, I = el1.z, O = el1.w, w = el2.x;
      float n = 0.9856076686 / (a * sqrt(a)), M = radians(mod(el2.y + n * (tDays - el2.z), 360.0));
      float E = M + e * sin(M); for (int k = 0; k < 6; k++) E -= (E - e * sin(E) - M) / (1.0 - e * cos(E));
      float xp = a * (cos(E) - e), yp = a * sqrt(1.0 - e * e) * sin(E);
      float cO = cos(O), sO = sin(O), ci = cos(I), si = sin(I), cw = cos(w), sw = sin(w);
      vec3 ecl = vec3((cw * cO - sw * sO * ci) * xp + (-sw * cO - cw * sO * ci) * yp, (cw * sO + sw * cO * ci) * xp + (-sw * sO + cw * cO * ci) * yp, sw * si * xp + cw * si * yp);
      const float OB = 0.4090928;
      vec3 p = vec3(ecl.x, ecl.y * cos(OB) - ecl.z * sin(OB), ecl.y * sin(OB) + ecl.z * cos(OB)) * 149.5978707 - camPos;
      vT = a > 30.0 ? 1.0 : beltK > 0.0 ? 0.0 : -1.0; // -1: faded out (a zero point size still draws 1 px)
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); gl_PointSize = (vT > 0.5 ? 2.2 : 1.5 * beltK) * pr;
      #include <logdepthbuf_vertex>
    }`,
  fragmentShader: `#include <logdepthbuf_pars_fragment>
    varying float vT; void main() {
    #include <logdepthbuf_fragment>
    vec2 q = gl_PointCoord * 2.0 - 1.0; if (dot(q, q) > 1.0 || vT < -0.5) discard;
    gl_FragColor = vec4(vT > 0.5 ? vec3(0.45, 0.62, 1.0) : vec3(0.62, 0.55, 0.44), 1.0); }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
});
let asteroidPts = null;
fetch('data/asteroids.json').then(r => r.json()).then(js => {
  const rows = MOBILE ? js.rows.filter((_, i) => i % 3 === 0) : js.rows; // phones: every third
  const e1 = new Float32Array(rows.length * 4), e2 = new Float32Array(rows.length * 3), pos = new Float32Array(rows.length * 3);
  rows.forEach((r, i) => { e1.set([r[0], r[1], r[2] * D2R, r[3] * D2R], i * 4); e2.set([r[4] * D2R, r[5], r[6] - 2451545.0], i * 3); });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('el1', new THREE.BufferAttribute(e1, 4)); g.setAttribute('el2', new THREE.BufferAttribute(e2, 3));
  asteroidPts = new THREE.Points(g, asteroidMat); asteroidPts.frustumCulled = false; asteroidPts.renderOrder = 2; planetGroup.add(asteroidPts);
}).catch(() => {});
// named bright asteroids and active comets (JPL SBDB, data/smallbodies.json): placed in the ground sky from their orbits
const smallBodies = []; let smallT = NaN;
fetch('data/smallbodies.json').then(r => r.json()).then(js => {
  const have = new Set(PLANETS.map(p => p.name));  // Ceres, Vesta, Pluto... also exist as full bodies: keep for search, skip their labels
  for (const r of js.ast) smallBodies.push({ kindName: 'small', comet: false, name: r[0], H: r[1], G: r[2], el: r.slice(3), dup: have.has(r[0].replace(/^\d+ /, '')) });
  for (const r of js.com) smallBodies.push({ kindName: 'small', comet: true, name: r[0], M1: r[1], K1: r[2], el: r.slice(3) });
  smallT = NaN; updateSmallBodies();
  if (searchIndex.size) for (const o of smallBodies) searchIndex.set(o.name.toLowerCase().replace(/\s+/g, ''), () => o);
}).catch(() => {});
function smallHelio(o, jdT) { // heliocentric J2000 ecliptic position in AU from elements (ellipse, or hyperbola/near-parabola for comets)
  const k = 0.01720209895; let x, y;
  if (!o.comet) { const [a, e, , , , ma, ep] = o.el, M = (ma * D2R + k / Math.sqrt(a ** 3) * (jdT - ep)) % (2 * Math.PI);
    let E = M; for (let i = 0; i < 12; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E)); x = a * (Math.cos(E) - e); y = a * Math.sqrt(1 - e * e) * Math.sin(E); }
  else { const [q, e, , , , tp] = o.el, dt = jdT - tp;
    if (e < 0.98) { const a = q / (1 - e), M = k / Math.sqrt(a ** 3) * dt; let E = M; for (let i = 0; i < 30; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
      x = a * (Math.cos(E) - e); y = a * Math.sqrt(1 - e * e) * Math.sin(E); }
    else if (e > 1.02) { const a = q / (e - 1), M = k / Math.sqrt(a ** 3) * dt; let F = Math.asinh(M / e); for (let i = 0; i < 40; i++) F -= (e * Math.sinh(F) - F - M) / (e * Math.cosh(F) - 1);
      x = a * (e - Math.cosh(F)); y = a * Math.sqrt(e * e - 1) * Math.sinh(F); }
    else { const W = 3 * k / Math.sqrt(2 * q ** 3) * dt, Y = Math.cbrt(W + Math.sqrt(W * W + 1)), s = Y - 1 / Y; x = q * (1 - s * s); y = 2 * q * s; } } // Barker's equation
  const I = o.el[2], O = o.el[3], w = o.el[4];  // same slots for both kinds
  const cO = Math.cos(O * D2R), sO = Math.sin(O * D2R), ci = Math.cos(I * D2R), si = Math.sin(I * D2R), cw = Math.cos(w * D2R), sw = Math.sin(w * D2R);
  return new THREE.Vector3((cw * cO - sw * sO * ci) * x + (-sw * cO - cw * sO * ci) * y, (cw * sO + sw * cO * ci) * x + (-sw * sO + cw * cO * ci) * y, sw * si * x + cw * si * y);
}
const smallLim = () => Math.min(starMat.uniforms.limit.value + 1, view.fov > 40 ? 7.5 : view.fov > 10 ? 10 : 12.5);
function updateSmallBodies() {
  if (!smallBodies.length || Math.abs(state.time - smallT) < 600e3) return; smallT = state.time;
  const J = jd(state.time), T = (J - 2451545) / 36525, earth = helio('Earth', T);
  for (const o of smallBodies) { const h = smallHelio(o, J), g = h.clone().sub(earth), r = h.length(), d = g.length();
    o.v = ecl2eq(g).normalize(); o.r = r; o.d = d; ({ ra: o.ra, dec: o.dec } = vecToRaDec(o.v));
    if (o.comet) o.mag = o.M1 + 5 * Math.log10(d) + o.K1 * Math.log10(r);
    else { const cosA = Math.max(-1, Math.min(1, (r * r + d * d - earth.lengthSq()) / (2 * r * d))), al = Math.acos(cosA), t = Math.tan(al / 2);
      o.mag = o.H + 5 * Math.log10(r * d) - 2.5 * Math.log10((1 - o.G) * Math.exp(-3.33 * t ** 0.63) + o.G * Math.exp(-1.87 * t ** 1.22)); } }
}
function updateAsteroids() {
  if (!asteroidPts) return;
  asteroidPts.visible = mode.space && $('t-asteroids').checked;
  asteroidMat.uniforms.tDays.value = jd(state.time) - 2451545.0; asteroidMat.uniforms.camPos.value.copy(sp.pos);
  // from the outer solar system the whole main belt shrinks to a white smudge over the Sun: fade it out beyond 30 AU
  asteroidMat.uniforms.beltK.value = Math.max(0, Math.min(1, (50 - sp.pos.length() / MKM_AU) / 20)); asteroidMat.uniforms.pr.value = renderer.getPixelRatio();
}

// ---------- shadows cast between bodies (moons on planets, planets on moons' parents, Saturn's rings) ----------
const _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _s2 = new THREE.Vector3();
function updateShadows() {
  planetScene.updateMatrixWorld();
  const R = (b) => b.mesh.getWorldScale(_s).x;
  for (const p of PLANETS) {
    if (p.probe || !p.mesh.visible) continue;
    const u = p.mesh.material.uniforms; if (!u.occ) continue;
    const occl = PLANETS.filter(m => !m.probe && m.mesh.visible && ((m.parent === p.name) || (p.name === 'Earth' && m.name === 'Moon') || (m.name === p.parent) || (p.name === 'Moon' && m.name === 'Earth')))
      .sort((a, b) => b.R - a.R).slice(0, 4);
    occl.forEach((m, i) => { m.mesh.getWorldPosition(_w); u.occ.value[i].set(_w.x, _w.y, _w.z, R(m)); });
    u.occN.value = occl.length;
    { const sun = PLANETS[0].mesh; sun.getWorldPosition(_s2); p.mesh.getWorldPosition(_w); u.sunAng.value = R(PLANETS[0]) / Math.max(1e-9, _w.distanceTo(_s2)); }
    if (p.ringMesh) {
      p.mesh.getWorldPosition(_w); u.ringOn.value = 1; u.ringC.value.copy(_w); u.ringR.value = R(p); u.ringMap.value = p.ringMesh.material.uniforms.map.value;
      u.ringN.value.set(0, 1, 0).applyQuaternion(p.mesh.getWorldQuaternion(_q));
      const ru = p.ringMesh.material.uniforms; ru.sunDir.value.copy(u.sunDir.value); ru.C.value.copy(_w); ru.R.value = R(p);
    }
    if (p.clouds) p.clouds.rotation.y = ((state.time / 86400000) * 0.35) % (Math.PI * 2); // clouds drift a little against the ground
  }
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
for (const o of ORBITERS) PROBES.push({ ...o, orbiter: true });
englishBodies(PLANETS);
for (const d of PROBES) {
  const p = Object.assign(d, { probe: true, R: d.size / 1000, pole: [0, 90], period: 1, active: false });
  p.mesh = probeModel(); planetGroup.add(p.mesh); PLANETS.push(p);
}
englishBodies(PROBES);
// NASA 3D Resources models (public domain, github.com/nasa/NASA-3D-Resources) replace the placeholder once loaded
function fitUnit(obj) { // center the model and scale it to a unit bounding sphere
  obj.traverse((m) => { if (m.isMesh) for (const mt of [].concat(m.material)) { mt.side = THREE.DoubleSide; mt.transparent = false; mt.depthWrite = true; mt.alphaTest = mt.alphaTest || 0; } });
  const box = new THREE.Box3().setFromObject(obj), c = box.getCenter(new THREE.Vector3()), r = box.getSize(new THREE.Vector3()).length() / 2;
  const g = new THREE.Group(); obj.position.sub(c); g.add(obj); g.scale.setScalar(1 / r); return g;
}
function swapModel(model, obj) {
  const ps = PROBES.filter(p => p.model === model || p.hd === model);
  ps.forEach((p, i) => { p.mesh.clear(); p.mesh.add(i ? obj.clone(true) : obj); });
}
const gltfLoader = new GLTFLoader(); // NASA's .glb files are Draco-compressed
// detailed models, fetched only when you fly close (NASA 3D Resources, NASA Science, ESA SciFleet; converted by tools/convert-models.html)
const HD_MODELS = { juno: ['models/juno-hd.glb'] };
const HD_BY_NAME = { 'Solar Orbiter': 'solar-orbiter', BepiColombo: 'bepicolombo', Juice: 'juice', 'Europa Clipper': 'europa-clipper',
  MAVEN: 'maven', 'Mars Odyssey': 'mars-odyssey', 'Mars Express': 'mars-express', TGO: 'tgo' };
for (const k of Object.values(HD_BY_NAME)) HD_MODELS[k] = [`models/${k}.glb`];
for (const p of PROBES) if (HD_BY_NAME[p.name]) p.hd = HD_BY_NAME[p.name];
const hdState = {}; // model key -> 'loading' | 'done'
function loadHD(model) { // swap in NASA's detailed version (1.7-9 MB) only when someone flies close
  if (!HD_MODELS[model] || hdState[model]) return; hdState[model] = 'loading';
  Promise.all(HD_MODELS[model].map(f => gltfLoader.loadAsync(f))).then(gs => { const g = new THREE.Group(); for (const x of gs) g.add(x.scene); swapModel(model, fitUnit(g)); hdState[model] = 'done'; })
    .catch(e => { console.warn('hd model', model, e.message); hdState[model] = 'failed'; });
}
gltfLoader.setDRACOLoader(new DRACOLoader().setDecoderPath('vendor/draco/'));
for (const p of PROBES) if (!p.model) { const c = buildCraft(p.name); if (c) { p.mesh.clear(); p.mesh.add(fitUnit(c)); } }
for (const m of ['voyager', 'pioneer', 'jwst', 'juno', 'parker', 'lro', 'mro']) gltfLoader.load(`models/${m}.glb`, (g) => swapModel(m, fitUnit(m === 'voyager' ? voyagerBlack(g.scene) : g.scene)), undefined, (e) => console.warn('model', m, e.message));
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
// Voyager's ten-sided bus wears black thermal blankets; the NASA model paints it beige
function voyagerBlack(root) {
  root.traverse(o => { for (const m of [].concat(o.material || [])) {
    if (/^Voyager(Base|Ring|BronzeDetail(-sm)?|DetailGold|MidTriangle)$/.test(m.name)) { m.color.setHex(0x161618); m.roughness = 0.55; m.metalness = 0.05; }
    if (m.name === 'VoyagerDiskEmblem') { m.color.setHex(0xd9a83a); m.metalness = 0.9; m.roughness = 0.3; } } }); // the Golden Record has no colour in the model
  return root;
}
// ephemerides
const probeEph = {};
fetch('data/probes.json').then(r => r.json()).then(js => {
  for (const [n, e] of Object.entries(js)) {
    probeEph[n] = { jd0: e.jd0, step: e.step, xyz: Float64Array.from(e.xyz) };
    const pts = new Float32Array(e.xyz); // absolute Mkm
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pts, 3)); geo.setDrawRange(0, 0);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x4fe3c1, transparent: true, opacity: 0.45 }));
    line.frustumCulled = false; line.userData.name = n; trails.add(line);
    // the rest of the journey (predicted / planned), dashed, shown for the selected craft
    const fut = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: 0xffb454, transparent: true, opacity: 0.4, dashSize: 1, gapSize: 1 }));
    fut.computeLineDistances(); fut.frustumCulled = false; fut.userData = { name: n, future: true }; fut.visible = false; trails.add(fut);
  }
}).catch(() => {});
const flybySegs = {}, flybyData = {};
fetch('data/flybys.json').then(r => r.json()).then(js => { for (const [k, f] of Object.entries(js)) { f.key = k; f.xyzA = Float64Array.from(f.xyz); flybyData[k] = f; (flybySegs[f.craft] ||= []).push(f); } }).catch(() => {});
const GM = { Moon: 4902.800, Mars: 42828.37, Venus: 324858.6, Mercury: 22031.8 }; // km^3/s^2
const orbitStates = {};
fetch('data/orbiters.json').then(r => r.json()).then(js => Object.assign(orbitStates, js)).catch(() => {});
function keplerOffset(st, jdNow) { // two-body propagation of a body-centred state vector; returns km (equatorial)
  const mu = GM[st.center], r = new THREE.Vector3(...st.r), v = new THREE.Vector3(...st.v), rl = r.length(), h = r.clone().cross(v);
  const ev = v.clone().cross(h).divideScalar(mu).sub(r.clone().divideScalar(rl)), e = ev.length();
  const a = 1 / (2 / rl - v.lengthSq() / mu), n = Math.sqrt(mu / (a * a * a)); // rad/s
  const P = e > 1e-7 ? ev.clone().normalize() : r.clone().normalize(), Q = h.clone().normalize().cross(P);
  const nu0 = Math.atan2(r.dot(Q), r.dot(P)), E0 = 2 * Math.atan(Math.sqrt((1 - e) / (1 + e)) * Math.tan(nu0 / 2)), M0 = E0 - e * Math.sin(E0);
  const M = M0 + n * (jdNow - st.jd) * 86400; let E = M; for (let k = 0; k < 30; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  return P.multiplyScalar(a * (Math.cos(E) - e)).addScaledVector(Q, a * Math.sqrt(1 - e * e) * Math.sin(E));
}
function bodyHelioEq(name, jdNow) { // Sun-centred equatorial 10^6 km for a flyby centre body
  const T = (jdNow - 2451545.0) / 36525;
  if (name === 'Moon') return ecl2eq(helio('Earth', T).add(moonGeo(T))).multiplyScalar(MKM_AU);
  if (name === 'Sun') return new THREE.Vector3();
  if (name === 'Pluto') return ecl2eq(sbHelio(PLANETS.find(p => p.name === 'Pluto').sb, jdNow)).multiplyScalar(MKM_AU);
  return ELEM[name] ? ecl2eq(helio(name, T)).multiplyScalar(MKM_AU) : null;
}
function probeHelio(p, jdNow) { // equatorial, 10^6 km, or null outside the ephemeris span
  if (p.orbiter) { const st = orbitStates[p.name]; if (!st) return null; const c = bodyHelioEq(st.center, jdNow); return c && c.add(keplerOffset(st, jdNow).divideScalar(1e6)); }
  for (const f of flybySegs[p.name] || []) { // fine planet-centred track wins near an encounter
    const n = f.xyzA.length / 3, k = (jdNow - f.jd0) / f.step;
    if (k >= 0 && k <= n - 1) { const i = Math.min(n - 2, Math.floor(k)), t = k - i, x = f.xyzA, a = i * 3, b = a + 3, c = bodyHelioEq(f.center, jdNow);
      if (c) return c.add(new THREE.Vector3(x[a] + (x[b] - x[a]) * t, x[a + 1] + (x[b + 1] - x[a + 1]) * t, x[a + 2] + (x[b + 2] - x[a + 2]) * t)); }
  }
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
    const e = probeEph[l.userData.name], n = e.xyz.length / 3, now = Math.max(0, Math.min(n, Math.floor((jdNow - e.jd0) / e.step) + 1));
    const sel = sp.target?.name === l.userData.name || selected?.p?.name === l.userData.name;
    if (l.userData.future) { l.visible = sel && now < n; if (l.visible) { l.geometry.setDrawRange(Math.max(0, now - 1), n - now + 1);
      const m = l.material, d = Math.max(0.05, sp.dist || 1) * 0.6; m.dashSize = m.gapSize = d; } continue; }
    l.geometry.setDrawRange(0, now);
    // a craft circling a planet (Juno) traces loops along the planet's orbit that look like a crumpled orbit line: show only when selected
    // looping trails (Juno around Jupiter, Parker/Solar Orbiter/BepiColombo around the inner planets) look like crumpled orbits:
    // show a trail when its craft is selected, or all of them with the toggle
    l.visible = $('t-trails').checked || sp.target?.name === l.userData.name || selected?.p?.name === l.userData.name;
  }
  localTrail(jdNow);
}
// Up close, absolute float32 vertices (~10^3-10^4 Mkm) jitter by hundreds of km: redraw the nearby stretch of the
// selected craft's path relative to the craft itself (double precision on the CPU) and hide the absolute lines.
const nearTrail = new THREE.Group(); planetScene.add(nearTrail);
const nearPast = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x4fe3c1, transparent: true, opacity: 0.45 }));
const nearFut = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0xffb454, transparent: true, opacity: 0.4 }));
nearPast.frustumCulled = nearFut.frustumCulled = false; nearTrail.add(nearPast, nearFut);
function localTrail(jdNow) {
  const p = sp.target?.probe ? sp.target : null, e = p && probeEph[p.name], cur = e && helioPos[p.name];
  const close = cur && mode.space && sp.dist < 5 && !p.orbiter; nearTrail.visible = !!close; if (!close) return;
  for (const l of trails.children) if (l.userData.name === p.name) l.visible = false;
  const n = e.xyz.length / 3, k = (jdNow - e.jd0) / e.step, i0 = Math.max(0, Math.min(n - 1, Math.floor(k))), K = 60, x = e.xyz;
  const rel = (i) => new THREE.Vector3(x[3 * i] - cur.x, x[3 * i + 1] - cur.y, x[3 * i + 2] - cur.z);
  const past = [], fut = [new THREE.Vector3()];
  for (let i = Math.max(0, i0 - K); i <= i0; i++) past.push(rel(i)); past.push(new THREE.Vector3());
  for (let i = i0 + 1; i < Math.min(n, i0 + 1 + K); i++) fut.push(rel(i));
  nearPast.geometry.setFromPoints(past); nearFut.geometry.setFromPoints(fut); nearFut.computeLineDistances();
  nearFut.material.dashSize = nearFut.material.gapSize = Math.max(1e-6, sp.dist * 0.6); nearFut.visible = fut.length > 1;
  nearTrail.position.set(cur.x - sp.pos.x, cur.y - sp.pos.y, cur.z - sp.pos.z);
}
function placeProbe(p, rel, earthRel, sunRel, minScale) { // rel: camera->probe in world units
  const d = rel.length();
  const hd = p.hd || p.model; if (hd && (sp.target === p || sp.flight?.p === p || d < 2e-6)) loadHD(hd); // within 2 km or on the way there
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
  const h = HMAG[p.name] || (p.orb ? [p.orb.H, 0.02] : null); if (!h) return 99;
  return h[0] + 5 * Math.log10(r * delta) + h[1] * alphaDeg;
}

function observerEcl(ms, lat, lon) { // observer's geocentric position, ecliptic AU (spherical Earth)
  const L = lstDeg(ms, lon) * D2R, la = lat * D2R, re = 6378.14 / KM_AU;
  const q = new THREE.Vector3(re * Math.cos(la) * Math.cos(L), re * Math.cos(la) * Math.sin(L), re * Math.sin(la));
  return new THREE.Vector3(q.x, q.y * Math.cos(OBL) + q.z * Math.sin(OBL), -q.y * Math.sin(OBL) + q.z * Math.cos(OBL));
}
function diskOverlap(d, r1, r2) { // fraction of disk 1 (Sun) covered by disk 2 (Moon)
  if (d >= r1 + r2) return 0; if (d <= Math.abs(r2 - r1)) return r2 >= r1 ? 1 : (r2 * r2) / (r1 * r1);
  const a = r1 * r1 * Math.acos((d * d + r1 * r1 - r2 * r2) / (2 * d * r1)) + r2 * r2 * Math.acos((d * d + r2 * r2 - r1 * r1) / (2 * d * r2))
    - 0.5 * Math.sqrt((-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2));
  return a / (Math.PI * r1 * r1);
}
function solarObscuration() { const s = PLANETS[0], m = PLANETS.find(p => p.name === 'Moon'); if (mode.space || !s.world || !m.world) return 0;
  return diskOverlap(Math.acos(Math.max(-1, Math.min(1, s.world.dot(m.world)))), s.angR, m.angR); }

function updatePlanets() {
  eclU.on.value = 0;
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
  // the Moon is close enough that our position on Earth shifts it by up to ~1 deg (decides where a solar eclipse is total)
  const obsEcl = observerEcl(state.time, state.lat, state.lon), moonGeoc = geo.Moon.clone();
  geo.Moon.sub(obsEcl);
  // Earth's shadow at the Moon's distance, as seen from here, for lunar eclipses
  { const dKm = moonGeoc.length() * KM_AU, pm = Math.asin(6378.14 / dKm), ps = 8.794 / 3600 * D2R, ss = 0.2666 * D2R;
    const shadow = geo.Sun.clone().normalize().multiplyScalar(-moonGeoc.length()).sub(obsEcl);
    eclU.shadowDir.value.copy(ecl2eq(shadow).normalize().applyMatrix4(sky.matrixWorld).normalize()); eclU.umbR.value = 1.02 * (pm + ps - ss); eclU.penR.value = 1.02 * (pm + ps + ss); eclU.on.value = 1; }
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
    if (p.name === 'Moon') p.mesh.material.uniforms.ambient.value = 0.02 + 0.09 * (1 - p.phase); // earthshine: strongest at thin crescent
    p.mag = apparentMag(p, geo.Sun.clone().sub(g).length(), dist, Math.acos(Math.max(-1, Math.min(1, sunEq.dot(p.eq.clone().negate())))) * R2D);
    p.mesh.position.copy(world); if (atmoU.refractOn.value) refractVec(p.mesh.position); p.mesh.position.multiplyScalar(R);
    p.mesh.scale.setScalar(R * Math.tan(Math.max(p.angR, minAng)));
    if (p.parent) { // true 3D placement around the parent so moons pass in front of / behind it
      const par = PLANETS.find(q => q.name === p.parent), k = R_PLANET / par.dist;
      p.mesh.position.copy(par.mesh.position).add(ecl2eq(g.clone().sub(geo[p.parent])).applyMatrix3(rotOnly).multiplyScalar(k));
      p.mesh.scale.setScalar(Math.max(k * p.R / KM_AU, R * Math.tan(minAng * 0.5)));
      p.mesh.visible = view.fov < 3;
    } else p.mesh.visible = true;
    if (groundOn() && world.y < -0.003) p.mesh.visible = false;
    p.magSeen = p.mag + atmoU.extK.value * (airmassJS(world.y) - 1); // after atmospheric extinction
    if (p.magSeen > starMat.uniforms.limit.value + 0.3) p.mesh.visible = false; // fainter than anything visible at this zoom
    p.rpx = Math.atan(p.mesh.scale.x / p.mesh.position.length()) / (view.fov / 2 * D2R) * innerHeight / 2;
    orientBody(p);
    p.mesh.material.uniforms.sunDir.value.copy(sunEq.transformDirection(sky.matrixWorld));
    if (p.glow) p.glow.scale.setScalar(Math.max(8, 0.15 * view.fov * D2R * R / p.mesh.scale.x));
  }
}

// ---------- ground & horizon ----------
const groundMat = new THREE.ShaderMaterial({
  uniforms: { light: { value: 0.5 }, horizon: { value: null }, realH: { value: 0 }, photo: { value: null }, usePhoto: { value: 0 }, north: { value: 0 } },
  vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform float light, realH, usePhoto, north; uniform sampler2D horizon, photo; varying vec3 vP;
    float h1(float x){ return fract(sin(x * 127.1) * 43758.5453); }
    float n1(float x){ float i = floor(x), f = fract(x); return mix(h1(i), h1(i + 1.0), f * f * (3.0 - 2.0 * f)); }
    float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
    float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * n2(p); p *= 2.03; a *= 0.5; } return v; }
    void main(){
      vec3 d = normalize(vP); float alt = asin(d.y); float az = atan(d.x, -d.z);
      if (usePhoto > 0.5) { // a real 360-degree photograph of the place, sky cut away (tools/make_landscapes.py)
        vec4 t = texture2D(photo, vec2(fract(0.5 + (az - north) / 6.2831853), 0.5 + alt / 3.1415927)); if (t.a < 0.5) discard;
        gl_FragColor = vec4(t.rgb * light * 0.95, 1.0); return; }
      // distant hills + tree line silhouette (radians above the horizon)
      float hills = 0.018 + 0.016 * sin(az * 2.0 + 0.7) + 0.010 * sin(az * 5.0 + 2.1) + 0.005 * sin(az * 13.0 + 0.3) + 0.008 * n1(az * 9.0);
      float grove = smoothstep(0.45, 0.75, n1(az * 6.0 + 3.0));
      float trees = grove * (0.010 + 0.014 * n1(az * 70.0)) * (0.55 + 0.45 * pow(abs(sin(az * 160.0)), 0.6));
      float top = hills + trees;
      if (realH > 0.5) top = texture2D(horizon, vec2(fract(az / 6.2831853 + 1.0), 0.5)).r * 0.6 - 0.1 + trees * 0.35; // real terrain (G4) with a few trees
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
// daylight sky: blue gradient from zenith to a paler horizon, twilight glow toward the Sun, and the Sun's aureole
const skyDomeMat = new THREE.ShaderMaterial({
  uniforms: { sunDir: { value: new THREE.Vector3(0, 1, 0) }, k: { value: 0 } },
  vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform vec3 sunDir; uniform float k; varying vec3 vP;
    void main(){
      vec3 d = normalize(vP); float hh = max(d.y, 0.0), sa = sunDir.y, ct = dot(d, sunDir);
      float dayf = smoothstep(-0.10, 0.30, sa);
      vec3 dayc = mix(vec3(0.60, 0.75, 0.93), vec3(0.10, 0.29, 0.70), pow(hh, 0.45));
      float tw = smoothstep(-0.32, -0.02, sa) * (1.0 - smoothstep(0.02, 0.30, sa));
      float side = pow(0.5 + 0.5 * ct, 2.5), low = exp(-hh * 6.0);
      vec3 twc = mix(vec3(0.09, 0.11, 0.27), vec3(1.0, 0.47, 0.17), side) * low + vec3(0.05, 0.07, 0.19) * (1.0 - low);
      vec3 halo = vec3(1.0, 0.95, 0.86) * (exp((ct - 1.0) * 600.0) * 0.8 + (exp((ct - 1.0) * 25.0) * 0.25 + exp((ct - 1.0) * 4.0) * 0.12) * dayf);
      vec3 col = dayc * dayf + twc * tw * (1.0 - dayf * 0.7) + halo * smoothstep(-0.05, 0.02, sa);
      gl_FragColor = vec4(col * k, 1.0);
    }`,
  side: THREE.BackSide, depthTest: false, depthWrite: false,
});
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(1150, 64, 32), skyDomeMat); skyDome.renderOrder = -1; skyDome.visible = false; scene.add(skyDome);
// night sky light: airglow brightening toward the horizon (van Rhijn), the warm light-pollution dome, and zodiacal light
// rising along the ecliptic from the Sun's side after dusk and before dawn
const nightGlowMat = new THREE.ShaderMaterial({
  uniforms: { sunDir: { value: new THREE.Vector3(0, -1, 0) }, eclPole: { value: new THREE.Vector3(0, 1, 0) }, lp: { value: 0 }, k: { value: 1 }, aurK: { value: 0 }, aurDir: { value: new THREE.Vector3(0, 0, -1) }, aurH: { value: 0.1 } },
  vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform vec3 sunDir, eclPole, aurDir; uniform float lp, k, aurK, aurH; varying vec3 vP;
    void main(){
      vec3 d = normalize(vP); float h = max(d.y, 0.0);
      float vr = 1.0 / sqrt(1.0 - 0.96 * (1.0 - h * h));
      vec3 air = vec3(0.020, 0.028, 0.016) * vr;
      vec3 dome = vec3(0.16, 0.11, 0.06) * lp * (exp(-h * 9.0) + 0.18 * exp(-h * 2.0));
      vec3 sp = normalize(sunDir - eclPole * dot(sunDir, eclPole));
      float el = abs(dot(d, eclPole)), along = dot(d, sp);
      float zl = exp(-el * el * 30.0) * pow(max(along, 0.0), 3.0) * smoothstep(-0.38, -0.30, sunDir.y) * (1.0 - smoothstep(-0.22, -0.16, sunDir.y));
      vec3 col = air + dome + vec3(0.07, 0.065, 0.05) * zl * (1.0 - lp);
      // aurora: green oxygen light low toward the oval, red oxygen light above it, with a little curtain ripple
      vec2 hz = normalize(d.xz + 1e-5); float face = pow(max(0.0, dot(hz, normalize(aurDir.xz))), 3.0), rip = 0.75 + 0.25 * sin(atan(d.x, -d.z) * 40.0);
      col += aurK * face * rip * (vec3(0.1, 0.85, 0.35) * exp(-pow((h - aurH * 0.5) / (aurH * 0.6), 2.0)) + vec3(0.6, 0.08, 0.1) * 0.5 * exp(-pow((h - aurH * 1.4) / aurH, 2.0)));
      gl_FragColor = vec4(col * k * step(-0.02, d.y), 1.0);
    }`,
  side: THREE.BackSide, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, transparent: true,
});
const nightGlow = new THREE.Mesh(new THREE.SphereGeometry(1140, 64, 32), nightGlowMat); nightGlow.renderOrder = -1; nightGlow.visible = false; scene.add(nightGlow);
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
  if (dragMoved < 4 && pointers.size === 0) select(pick(e.clientX, e.clientY) || (mode.space ? null : constUnder(e.clientX, e.clientY))); });
function constUnder(x, y) {
  const v = new THREE.Vector3(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1, 0.5).unproject(camera).normalize();
  return constAt(v.applyMatrix4(new THREE.Matrix4().copy(sky.matrixWorld).invert()));
}
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
function worldOf(o) { // a direction in the ground frame; objects without one yet (e.g. right after a mode change) point at the nadir
  const down = () => new THREE.Vector3(0, -1, 0);
  return o.planet ? (o.p.world ? o.p.world.clone() : down()) : o.kindName === 'sat' || o.kindName === 'site' ? (o.world || down()).clone() : o.v ? o.v.clone().applyMatrix4(sky.matrixWorld).normalize() : down(); }
function toScreen(w) {
  tmp.copy(w); if (atmoU.refractOn.value) refractVec(tmp.normalize());
  tmp.multiplyScalar(900).project(camera);
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
  // only stars an eye can see here (and that are drawn) answer a click; fainter ones are found by search
  const lim = Math.min(6.5, starMat.uniforms.limit.value);
  for (let i = 0; i < starData.pos.length; i++) { if (starData.mag[i] > lim) continue;
    const w = tmp.copy(starData.pos[i]).applyMatrix4(sky.matrixWorld).normalize().clone(); test(w, i, Math.max(0, lim - starData.mag[i]) * 0.5 - 6); }
  if (typeof best === 'number') best = starObj(best);
  if (mode.space) for (const st of sites) { if (!st.world) continue; const sc = toScreen(st.world); if (!sc) continue; const d = Math.hypot(sc[0] - x, sc[1] - y) - 6; if (d < bd) { bd = d; best = st; } }
  for (const s of sats) { if (!s.world) continue; const sc = toScreen(s.world); if (!sc) continue; const d = Math.hypot(sc[0] - x, sc[1] - y) - 6; if (d < bd) { bd = d; best = s; } }
  if ($('t-showers').checked && !mode.space) for (const sh of showers) { if (!showerActive(sh)) continue;
    const s = toScreen(sh.v.clone().applyMatrix4(sky.matrixWorld)); if (!s) continue; const d = Math.hypot(s[0] - x, s[1] - y) - 4; if (d < bd) { bd = d; best = sh; } }
  if (exoPoints?.visible) for (const h of exo.hosts) { // like their labels: famous systems, or any when zoomed in; others by search
    if (!(EXO_FAMOUS.has(h.name) && view.fov < 40) && view.fov >= 4 && !(h.vmag != null && h.vmag <= 6.5)) continue;
    const w = h.v.clone().applyMatrix4(sky.matrixWorld); if (w.dot(fwd) < cosLim) continue;
    const s = toScreen(w); if (!s) continue; const d = Math.hypot(s[0] - x, s[1] - y) + 4; if (d < bd) { bd = d; best = h; } }
  if (!mode.space) for (const o of smallBodies) { if (!o.v || o.mag > smallLim()) continue; const w = o.v.clone().applyMatrix4(sky.matrixWorld); if (w.dot(fwd) < cosLim) continue;
    const s = toScreen(w); if (!s) continue; const d = Math.hypot(s[0] - x, s[1] - y) - 3; if (d < bd) { bd = d; best = o; } }
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
  if (o.planet) { ko = [WIKI_KO[o.p.name] || (o.p.parent ? `${o.p.ko} (위성)` : o.p.ko)]; en = [WIKI_EN[o.p.name] || (o.p.parent ? `${o.p.name} (moon)` : o.p.name)]; }
  else if (o.kindName === 'const') { ko = [o.name]; en = [`${o.la} (constellation)`, o.la]; }
  else if (o.kindName === 'sat') { ko = [o.iss ? '국제우주정거장' : o.korea ? o.name.replace(/ \(.*\)/, '') : '']; en = [o.iss ? 'International Space Station' : o.name]; }
  else if (o.kindName === 'site') { ko = [o.ko.split(' · ')[0]]; en = [o.name.replace('Chang-e', "Chang'e")]; }
  else if (o.kindName === 'dso') { const n = o.name.replace(' ', ' '); ko = [o.messier && `메시에 ${o.messier.slice(1)}`, o.messier, n]; en = [o.messier && `Messier ${o.messier.slice(1)}`, o.common, n]; }
  else if (o.kindName === 'shower') { ko = [o.ko]; en = [o.en]; }
  else if (o.kindName === 'exo') { ko = [o.name, `${o.name} ${o.planets[0][0]}`]; en = [o.name, `${o.name} ${o.planets[0][0]}`, `${o.name} (star)`]; }
  else if (o.kindName === 'star') { const n = starData.proper[o.i]; en = [n && `${n} (star)`, n]; ko = []; }
  const r = EN ? (await wikiLookup('en', en)) || (await wikiLookup('ko', ko)) : (await wikiLookup('ko', ko)) || (await wikiLookup('en', en));
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
    $('info-title').textContent = `${p.ko} (${p.name})`; $('info-sub').textContent = p.orbiter ? `${PLANETS.find(q => q.name === p.center).ko} 궤도선 · JPL 궤도로 계산` : '탐사선 · 위치: JPL Horizons';
    row('발사', `${p.launch}년`); if (p.orbiter && helioPos[p.center] && mode.space) row(`${PLANETS.find(q => q.name === p.center).ko} 표면 위 고도`, fmtDist(helioPos[p.name].distanceTo(helioPos[p.center]) - bodyR(PLANETS.find(q => q.name === p.center)))); row('태양으로부터', `${p.helioAU.toFixed(p.helioAU < 2 ? 4 : 1)} AU`);
    row('지구로부터', p.dist < 0.05 ? fmtDist(p.dist * MKM_AU) : `${p.dist.toFixed(p.dist < 10 ? 3 : 1)} AU`);
    const lt = p.dist * 499.0; row('신호가 닿는 시간', lt > 3600 ? `${(lt / 3600).toFixed(1)}시간` : lt > 60 ? `${(lt / 60).toFixed(1)}분` : `${lt.toFixed(1)}초`);
    row('태양 기준 속도', `${probeSpeed(p, jd(state.time)).toFixed(1)} km/s`);
    row('설명', p.note);
    setTimeout(() => { if (selected !== o || !mode.space) return; const b = document.createElement('button'); b.textContent = '이 탐사선 카메라로 보기'; b.onclick = () => probeCamera(p); $('info-exo').hidden = false; $('info-exo').prepend(b); }, 0);
  } else if (o.planet) {
    const p = o.p; ra = p.ra; dec = p.dec;
    $('info-title').textContent = `${p.ko} (${p.name})`; $('info-sub').textContent = p.small ? `${p.small} · 궤도: JPL SBDB` : p.name === 'Sun' ? '항성' : p.name === 'Moon' ? '위성' : p.parent ? `${PLANETS.find(q => q.name === p.parent).ko}의 위성 · 위치 근사` : '행성';
    if (p.name !== 'Earth') row('지구로부터 거리', p.name === 'Moon' ? `${(p.dist * KM_AU).toFixed(0)} km` : `${p.dist.toFixed(3)} AU`);
    if (!mode.space && isFinite(p.mag) && p.mag < 90) row('겉보기 등급', `${p.mag.toFixed(1)}${p.mag > 6.5 ? ' (맨눈으로 안 보임)' : ''}`);
    if (!mode.space && p.magSeen != null && Math.abs(p.magSeen - p.mag) > 0.05) row('대기를 거친 밝기', p.magSeen.toFixed(1));
    if (p.name !== 'Earth') row('시직경', fmtAng(p.angR * 2 * R2D)); if (p.name !== 'Sun' && p.name !== 'Earth') row('위상 (밝은 면)', (p.phase * 100).toFixed(1) + '%'); row('반지름', `${p.R.toLocaleString()} km`);
  } else if (o.kindName === 'site') {
    ra = NaN; $('info-title').textContent = o.ko; $('info-sub').textContent = `${PLANETS.find(p => p.name === o.body).ko} 착륙 지점${o.name === 'MESSENGER' ? ' (충돌)' : ''}`;
    row('도착', o.date); row('위치', `${Math.abs(o.lat).toFixed(2)}°${o.lat >= 0 ? 'N' : 'S'}, ${Math.abs(o.lon).toFixed(2)}°${o.lon >= 0 ? 'E' : 'W'}`); row('설명', o.note);
    setTimeout(() => { if (selected !== o) return; const b = document.createElement('button'); b.textContent = '표면에 서서 하늘 보기'; b.onclick = () => standOn(o); $('info-exo').innerHTML = ''; $('info-exo').hidden = false; $('info-exo').append(b); }, 0);
    if (isFinite(o.camDist)) row('현재 위치에서', fmtDist(o.camDist));
  } else if (o.kindName === 'sat') {
    const st = o.st; ({ ra, dec } = o.world ? vecToRaDec(o.world.clone().applyMatrix4(new THREE.Matrix4().copy(sky.matrixWorld).invert())) : { ra: NaN, dec: NaN });
    $('info-title').textContent = o.name; $('info-sub').textContent = `${o.korea ? '한국 인공위성' : '인공위성'} · NORAD ${o.id} · 궤도: CelesTrak`;
    if (st) { row('고도 (지표면 위)', `${Math.round(st.h).toLocaleString()} km`); row('속도', `${st.v.toFixed(2)} km/s`);
      row('햇빛', st.lit ? (o.visible ? '받는 중 · 지금 맨눈으로 보일 수 있음' : '받는 중') : '지구 그림자 안'); }
    const ps = mode.space ? [] : satPasses(o), tb = document.createElement('table'); tb.className = 'pltable';
    tb.innerHTML = '<tr><th>다음 통과 (10° 이상)</th><th>최고 고도</th><th>보임</th></tr>';
    for (const p of ps) { const tr = tb.insertRow(); const f = (t) => new Date(t).toLocaleString(LOCALE, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
      for (const v of [`${f(p.rise)} ~ ${new Date(p.set).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', hour12: false })}`, `${p.max.toFixed(0)}°`, p.lit && p.dark ? '예' : '아니오']) tr.insertCell().textContent = v; }
    if (!ps.length) tb.insertRow().insertCell().textContent = mode.space ? '통과 예보는 지상 모드에서 볼 수 있습니다' : '3일 안에 10° 위로 지나가지 않습니다';
    $('info-exo').innerHTML = ''; $('info-exo').append(tb); $('info-exo').hidden = false;
    if (ps.length && 'Notification' in window) { const nb = document.createElement('button'); nb.textContent = alerts.has(o.id) ? '통과 알림 끄기' : '다음 통과 5분 전에 알림'; nb.onclick = () => togglePassAlert(o, ps, nb); $('info-exo').append(nb); }
  } else if (o.kindName === 'const') {
    ra = o.ra; dec = o.dec;
    $('info-title').textContent = `${o.name} (${o.la})`; $('info-sub').textContent = `별자리 · IAU 약자 ${o.desig}`;
    row('라틴어 이름', o.la); row('소유격', o.gen); row('약자', o.desig);
  } else if (o.kindName === 'shower') {
    ra = o.ra; dec = o.dec;
    $('info-title').textContent = o.ko; $('info-sub').textContent = `유성우 · ${o.en} · 복사점`;
    const dp = daysToPeak(o);
    row('활동 기간', `${o.start.replace('-', '월 ')}일 ~ ${o.end.replace('-', '월 ')}일`); row('극대', `${o.peak.replace('-', '월 ')}일 (${dp === 0 ? '오늘' : dp > 0 ? dp + '일 뒤' : -dp + '일 지남'})`);
    row('시간당 유성 수 (ZHR)', `약 ${o.zhr}개`); row('모천체', o.parent); row('지금 활동 중', showerActive(o) ? '예' : '아니오');
    row('참고', '복사점이 높이 뜰수록, 하늘이 어두울수록 실제로 보이는 수가 많습니다');
  } else if (o.kindName === 'exo') {
    ra = o.ra; dec = o.dec;
    $('info-title').textContent = o.name; $('info-sub').textContent = `외계행성계 · 행성 ${o.planets.length}개 · NASA Exoplanet Archive`;
    if (o.dist) row('거리', `${(o.dist * 3.2616).toFixed(o.dist < 10 ? 2 : 0)} 광년`);
    if (o.vmag != null) row('별의 겉보기 등급', o.vmag.toFixed(2) + (o.vmag > 6.5 ? ' (맨눈으로 안 보임)' : ''));
    if (o.teff) row('별의 표면 온도', `${o.teff.toLocaleString()} K`); const L = lumOf(o); if (L) row('별의 밝기 (태양=1)', L < 0.01 ? L.toExponential(1) : L.toFixed(3));
    exoDetail(o);
  } else if (o.kindName === 'small') {
    ra = o.ra; dec = o.dec;
    $('info-title').textContent = o.name; $('info-sub').textContent = `${o.comet ? '혜성' : '소행성'} · 궤도: JPL SBDB`;
    row('겉보기 등급 (예상)', `${o.mag.toFixed(1)}${o.mag > 6.5 ? (o.mag > 9.5 ? ' (망원경 필요)' : ' (쌍안경 필요)') : ''}`);
    row('태양으로부터', `${o.r.toFixed(2)} AU`); row('지구로부터', `${o.d.toFixed(2)} AU`);
    if (o.comet) { row('근일점 거리', `${o.el[0].toFixed(2)} AU`); row('근일점 통과', new Date((o.el[5] - 2440587.5) * 86400e3).toLocaleDateString(LOCALE)); row('이심률', o.el[1].toFixed(3) + (o.el[1] >= 1 ? ' (다시 돌아오지 않는 궤도)' : ''));
      row('참고', '혜성 밝기는 예측과 크게 다를 수 있습니다'); }
    else { row('절대 등급 H', o.H.toFixed(1)); row('궤도 긴반지름', `${o.el[0].toFixed(3)} AU`); row('공전 주기', `${(o.el[0] ** 1.5).toFixed(2)}년`); }
  } else if (o.kindName === 'coord') {
    ra = o.ra; dec = o.dec; $('info-title').textContent = '좌표 지점'; $('info-sub').textContent = '검색창에 적은 적경·적위 (J2000)';
    { let near = null, bd = 9; for (let i = 0; i < starData.pos.length; i++) { if (starData.mag[i] > 6 || !starData.name[i]) continue; const d = sepDeg(o.v, starData.pos[i]); if (d < bd) { bd = d; near = i; } }
      if (near != null) row('가까운 밝은 별', `${starData.proper[near] || starData.name[near]} (${bd.toFixed(1)}°)`); }
  } else if (o.kindName === 'hist') {
    ra = o.ra; dec = o.dec; $('info-title').textContent = o.name; $('info-sub').textContent = '역사 기록 속의 천체 · 위치는 지금 남은 잔해';
    row('그때의 밝기 (추정)', `약 ${o.mag}등급`); row('설명', o.note);
  } else if (o.kindName === 'star') {
    ({ ra, dec } = vecToRaDec(o.v));
    $('info-title').textContent = o.name; $('info-sub').textContent = '항성 · ' + (starData.desig[o.i] || `HIP ${starData.id[o.i]}`);
    row('겉보기 등급', o.mag.toFixed(2)); row('B−V 색지수', isNaN(starData.bv[o.i]) ? '' : starData.bv[o.i].toFixed(2)); row('HIP', starData.id[o.i]);
    { const vb = varStarBox(o); if (vb) { $('info-exo').innerHTML = ''; $('info-exo').append(vb); $('info-exo').hidden = false; } }
  } else {
    ra = o.ra; dec = o.dec;
    $('info-title').textContent = [o.messier, o.name].filter(Boolean).join(' · ') + (o.common ? ` — ${o.common}` : '');
    $('info-sub').textContent = TYPE_RAW_KO[o.type] || o.type;
    row('별자리', o.con); row('등급', isNaN(o.mag) ? '' : o.mag.toFixed(1)); row('크기', `${o.maj.toFixed(1)}′ × ${o.min.toFixed(1)}′`);
    row('위치각', o.pa ? o.pa + '°' : ''); row('허블 분류', o.hubble); row('적색편이 z', o.z);
  }
  { const key = o.planet && !o.p.probe ? o.p.name : o.kindName === 'star' ? (starData.proper[o.i] || o.name) : null, B = key && BODY_INFO[key], ab = $('info-about');
    ab.hidden = !B; ab.innerHTML = B ? `<p>${B.d}</p>${B.n?.length ? `<b>주목할 점</b><ul>${B.n.map(x => `<li>${x}</li>`).join('')}</ul>` : ''}` : ''; }
  if (isFinite(ra)) { row('적경 (J2000)', fmtRA(ra)); row('적위 (J2000)', fmtDec(dec)); }
  else if (o.kindName === 'sat') row('지금', '지평선 아래 (아래 표에서 다음 통과 시각을 확인하세요)');
  if (!mode.space && !(o.kindName === 'sat' && !o.world)) { const aa = dirToAzAlt(worldOf(o)); row('방위 / 고도', `${aa.az.toFixed(1)}° / ${aa.alt.toFixed(1)}°`); }
  else if (o.planet && isFinite(o.p.camDist)) row('현재 위치에서', fmtDist(o.p.camDist));
  if (prevSelected && !mode.space && (!prevSelected.planet || prevSelected.p.world) && (!o.planet || o.p.world)) {
    const a = Math.acos(Math.max(-1, Math.min(1, worldOf(prevSelected).dot(worldOf(o))))) * R2D;
    row(`${prevSelected.planet ? prevSelected.p.ko : prevSelected.messier || prevSelected.name}까지 각거리`, fmtAng(a));
  }
  altGraph(o, ra, dec);
  if (o.kindName !== 'exo' && o.kindName !== 'sat' && !(o.kindName === 'star' && VSTARS[starData.proper[o.i]])) exoDetail(null);
  if (o.planet && o.p.probe && JOURNEYS[o.p.name]) journeyTimeline(o.p);
  showPhoto(o.kindName === 'dso' ? o : null);
  showWiki(o); writeHash(); syncObsButton();
  if (o.kindName === 'site') $('info-goto').textContent = mode.space ? '착륙 지점으로 비행' : '우주 모드에서 볼 수 있음';
  else if (o.planet && o.p.probe) $('info-goto').textContent = mode.space ? '탐사선으로 비행' : '이동 · 확대'; else $('info-goto').textContent = '이동 · 확대';
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
  if (o.kindName === 'sat') return 20;
  if (o.kindName === 'site') return 5;
  if (o.kindName === 'const') return 60;
  if (o.kindName === 'shower') return 60;
  return 2;
}
function flyTo(o) {
  if (o.kindName === 'sat' && !o.world) return; // below the horizon right now
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
  for (const p of PLANETS) if (p.parent && mo[p.name]) helioPos[p.name] = helioPos[p.parent].clone().add(mo[p.name].clone().multiplyScalar(MKM_AU));
  helioPos.Titan = helioPos.Saturn.clone().add(mo.Titan.clone().multiplyScalar(MKM_AU));
  for (const p of PLANETS) if (p.sb) helioPos[p.name] = toEq(sbHelio(p.sb, jd(state.time)));
  for (const p of PROBES) { const h = probeHelio(p, jd(state.time)); p.active = !!h; if (h) helioPos[p.name] = h; }
}
const bodyR = (p) => p.R / 1e6;
function updateSpace() {
  computeHelio();
  const earth = helioPos.Earth;
  for (const t of [sp.target, sp.flight?.p]) if (t?.kindName === 'site') { // place the site with this frame's centre AND this frame's rotation
    const b = PLANETS.find(p => p.name === t.body); orientBody(b);                // (rotation moves the ground ~4 m per frame on Mars; last frame's made it shake)
    t.normal = siteLocal(t).applyQuaternion(b.mesh.quaternion);
    t.helio = helioPos[t.body].clone().addScaledVector(t.normal, bodyR(b) * siteRadius(t)); helioPos[t.key] = t.helio; }
  if (sp.target && !sp.flight && helioPos[sp.target.key || sp.target.name]) sp.pos.copy(helioPos[sp.target.key || sp.target.name]).addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(sp.quat), -sp.dist);
  const minAng = view.fov * D2R * 0.0035;
  let nearest = Infinity, nearestAll = Infinity;
  for (const p of PLANETS) {
    const hp = helioPos[p.name] || new THREE.Vector3(), rel = hp.clone().sub(sp.pos), d = rel.length();
    if (p.probe) {
      if (!p.active) { p.mesh.visible = false; p.world = null; continue; }
      nearestAll = Math.min(nearestAll, d - bodyR(p));
      const gq = hp.clone().sub(earth); p.dist = gq.length() / MKM_AU; const rd = vecToRaDec(gq); p.ra = rd.ra; p.dec = rd.dec; p.helioAU = hp.length() / MKM_AU;
      placeProbe(p, rel, earth.clone().sub(sp.pos), sp.pos.clone().negate(), sp.replay === p ? d * Math.tan(view.fov * D2R * 0.03) : 0); p.mesh.visible = true;
      if (p !== sp.target && PLANETS[0].world && Math.acos(Math.min(1, p.world.dot(PLANETS[0].world))) / (view.fov * D2R) * innerHeight < Math.max(30, PLANETS[0].rpx * 4)) p.mesh.visible = false; // don't blot the Sun
      continue;
    }
    nearest = Math.min(nearest, Math.max(d - bodyR(p) * 0.995, 1e-10)); // 0.995: the faceted sphere's flat faces sit slightly inside the true radius
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
    if (p.name !== 'Sun' && p.mesh.scale.x > bodyR(p) * 1.01 && PLANETS[0].world) { // an enlarged marker disc over the Sun's glow bites a dark notch out of it
      const sepPx = Math.acos(Math.min(1, p.world.dot(PLANETS[0].world))) / (view.fov * D2R) * innerHeight;
      if (sepPx < Math.max(30, PLANETS[0].rpx * 4)) p.mesh.visible = false; }
    if (p.glow) p.glow.scale.setScalar(Math.max(8, 0.15 * view.fov * D2R * d / p.mesh.scale.x));
    p.rpx = Math.atan(p.mesh.scale.x / d) / (view.fov / 2 * D2R) * innerHeight / 2;
  }
  if (!MOBILE) for (const p of PLANETS) if (HIRES[p.name] && !p.hires && mode.space && p.camDist < bodyR(p) * 8) loadHires(p);
  orbits.position.copy(sp.pos).negate(); trails.position.copy(orbits.position); updateTrails(jd(state.time));
  orbits.visible = $('t-orbits').checked && nearest > 2; trails.visible = orbits.visible; // orbit lines only clutter close-ups
  // orbits smaller than a few dozen pixels (inner planets seen from the outer solar system) collapse into a bright smudge beside the Sun
  { const dS = sp.pos.length(); for (const l of orbits.children) { const px = Math.atan(l.userData.r / Math.max(dS, 1e-9)) / (view.fov * D2R) * innerHeight;
    l.material.opacity = l.userData.op * Math.max(0, Math.min(1, (px - 15) / 25)); l.visible = px > 15; } }
  sp.nearest = nearest; sp.nearestAll = Math.min(nearest, nearestAll);
  updateSites();
  if (sp.target?.kindName === 'site') { const s = sp.target; sp.nearestAll = Math.min(sp.nearestAll, sp.dist * 0.6);
    probeSun.position.copy(s.rel).add(s.helio.clone().negate().normalize()); probeSun.target.position.copy(s.rel); probeSun.target.updateMatrixWorld(); }
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
    l.frustumCulled = false; l.userData.r = Math.max(...pts.map(v => v.length())); l.userData.op = l.material.opacity; orbits.add(l);
  }
  for (const p of PLANETS) if (p.sb) {
    const pts = []; for (let i = 0; i <= 720; i++) pts.push(ecl2eq(sbHelio(p.sb, 0, i / 2)).multiplyScalar(MKM_AU));
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: p.name === 'Halley' ? 0x7fd8ff : 0x8a6f9e, transparent: true, opacity: 0.45 }));
    l.frustumCulled = false; l.userData.r = Math.max(...pts.map(v => v.length())); l.userData.op = l.material.opacity; orbits.add(l);
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
  if (sp.target?.kindName === 'site' && sp.target.normal) {
    const up = sp.target.normal, k = 0.3 * D2R, right = new THREE.Vector3(1, 0, 0).applyQuaternion(sp.quat);
    const q = new THREE.Quaternion().setFromAxisAngle(up, -dx * k).multiply(new THREE.Quaternion().setFromAxisAngle(right, -dy * k));
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(sp.quat).applyQuaternion(q);
    if (Math.abs(fwd.dot(up)) < 0.98 && fwd.dot(up) < 0.2) sp.quat.copy(lookQuat(fwd, up)); // never look up from below the ground
    return;
  }
  const k = (sp.target ? 0.3 : view.fov / innerHeight) * D2R;
  const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (sp.target ? -1 : 1) * dx * k);
  const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (sp.target ? -1 : 1) * dy * k);
  sp.quat.multiply(qy).multiply(qx).normalize();
}
function spaceZoom(f) {
  if (sp.target) sp.dist = Math.max(sp.target.kindName === 'site' ? 8e-9 : sp.target.probe ? bodyR(sp.target) * 1.6 : bodyR(sp.target) * 1.15, Math.min(sp.target.gal ? 3e12 : sp.target.sys ? 4e9 : 2e4, sp.dist * f));
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
  sp.replay = null;
  if (o.kindName === 'exo' && o.dist) return visitSystem(exoSystem(o));
  if (o.kindName === 'star') { const s = s3dByName.get(starData.proper?.[o.i] || starData.name[o.i]); if (s) return visitSystem(s); }
  if (!o.planet && o.kindName !== 'site') { // a star or deep-sky object: just turn to face it
    sp.flight = { turnOnly: true, t0: performance.now(), dur: 1200, q0: sp.quat.clone(), q1: lookQuat(o.v.clone().normalize(), new THREE.Vector3(0, 1, 0).applyQuaternion(sp.quat)) };
    return;
  }
  if (o.kindName === 'site') { loadSiteModel(o); const from = sp.pos.clone(), q0 = sp.quat.clone(), d1 = Math.max(o.size * 7, 25) / 1e9;
    sp.flight = { p: o, site: true, from, q0, d1, t0: performance.now(), dur: 5000 }; return; }
  const p = o.p, R = bodyR(p), d1 = p.probe ? bodyR(p) * 5 : p.name === 'Sun' ? R * 6 : R * 4;
  const from = sp.pos.clone(), q0 = sp.quat.clone();
  sp.flight = { p, from, q0, d1, t0: performance.now(), dur: Math.min(4500, 1800 + 400 * Math.log10(1 + from.distanceTo(helioPos[p.name]) / d1)) };
}
function stepSpaceFlight(now) {
  const f = sp.flight; if (!f) return;
  const k = document.body.classList.contains('calm') ? 1 : Math.min(1, (now - f.t0) / f.dur), e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; // calm: jump straight there
  if (f.turnOnly) { sp.quat.slerpQuaternions(f.q0, f.q1, e); if (k >= 1) sp.flight = null; return; }
  const tp = helioPos[f.p.key || f.p.name]; if (!tp) return;
  // approach from the lit side, slightly above the ecliptic
  const sunward = tp.lengthSq() ? tp.clone().negate().normalize() : new THREE.Vector3(1, 0, 0);
  const side = sunward.clone().cross(ECL_N).normalize();
  let dir = sunward.multiplyScalar(0.8).addScaledVector(side, 0.5).addScaledVector(ECL_N, 0.3).normalize();
  if (f.gal) dir = galaxy.ngp.clone().multiplyScalar(0.85).addScaledVector(tp.clone().negate().normalize(), 0.5).normalize();
  if (f.site) { const n = f.p.normal, t = side.clone().addScaledVector(n, -side.dot(n)).normalize(); dir = n.clone().multiplyScalar(0.45).addScaledVector(t, 0.9).normalize(); } // low, oblique view of the lander
  const end = tp.clone().addScaledVector(dir, f.d1);
  const turn = Math.min(1, k * 2.5), te = 1 - Math.pow(1 - turn, 3);
  // move along a log-distance path so long trips don't crawl at the end
  const d0 = f.from.distanceTo(tp), dd = Math.exp(Math.log(d0) + (Math.log(f.d1) - Math.log(d0)) * e);
  const startDir = f.from.clone().sub(tp).normalize();
  const curDir = startDir.lerp(dir, e).normalize();
  sp.pos.copy(tp).addScaledVector(curDir, dd);
  sp.quat.slerpQuaternions(f.q0, lookQuat(tp.clone().sub(sp.pos).normalize(), f.site ? f.p.normal : f.gal ? tp.clone().negate().normalize() : ECL_N), te);
  if (k >= 1) { sp.flight = null; sp.target = f.p; sp.dist = f.d1; $('sp-target').textContent = f.stand ? `${f.p.ko}에 서 있음` : `${f.p.ko} 주위`; writeHash();
    if (f.stand) { const n = f.p.normal, s = tp.clone().negate().normalize(), t = s.addScaledVector(n, -s.dot(n)); if (t.lengthSq() < 1e-6) t.set(1, 0, 0).addScaledVector(n, -n.x); sp.quat.copy(lookQuat(t.normalize().addScaledVector(n, 0.12).normalize(), n)); view.fov = 75; } }
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
  document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === (space ? 'space' : 'ground')));
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
$('lang').textContent = EN ? '한국어' : 'EN'; $('lang').onclick = () => setLang(EN ? 'ko' : 'en');
// third mode: the gravity sandbox and orbital-mechanics labs (sandbox.js, loaded on first use)
let sandboxOn = false, sandboxMod = null;
async function setSandbox(on) {
  sandboxOn = on; document.body.classList.toggle('sandbox', on);
  document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', on ? b.dataset.mode === 'sandbox' : (b.dataset.mode === 'space') === mode.space));
  if (on) { sandboxMod ||= await import('./sandbox.js'); sandboxMod.openSandbox({ helio, jdNow: () => jd(state.time) }); }
  else sandboxMod?.closeSandbox();
}
document.getElementById('sizes-btn')?.addEventListener('click', async () => { (await import('./sizes.js')).openSizes(); });
document.getElementById('cards-btn')?.addEventListener('click', async () => {
  const { openCards } = await import('./cards.js');
  openCards({ openLab: async (n) => { await setSandbox(true); sandboxMod.openLab(n); } });
});
document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { $('tonight').hidden = true;
  if (b.dataset.mode === 'sandbox') return setSandbox(true);
  if (sandboxOn) setSandbox(false); setMode(b.dataset.mode === 'space'); });
$('t-orbits').onchange = (e) => orbits.visible = mode.space && e.target.checked;
$('light-btn').onclick = startLight;
$('galaxy-btn').onclick = () => visitGalaxy();
$('lg-btn').onclick = () => visitLocalGroup();
$('sp-free').onclick = () => { sp.target = null; sp.flight = null; $('sp-target').textContent = '자유 비행'; };

// ---------- search ----------
const searchIndex = new Map();
function buildSearch() {
  const dl = $('search-list'); const opts = [];
  const add = (key, mk, label) => { const k = key.toLowerCase().replace(/\s+/g, ''); if (!k || searchIndex.has(k)) return; searchIndex.set(k, mk); if (label) opts.push(label); };
  for (const p of PLANETS) { add(p.name, () => planetObj(p), p.name); add(p.ko, () => planetObj(p), p.ko); }
  for (const o of dsos) { if (o.messier) add(o.messier, () => dsoObj(o), `${o.messier}${o.common ? ' ' + o.common : ''}`);
    add(o.name, () => dsoObj(o), o.messier || o.common ? `${o.name}` : null); if (o.common) add(o.common, () => dsoObj(o), o.common); }
  for (const sh of showers) { add(sh.ko, () => sh, sh.ko); add(sh.en, () => sh, null); }
  for (const c of constLabels) { add(c.name, () => c, c.name); add(c.la, () => c, null); add(c.desig, () => c, null); }
  for (const s of sats) if (s.star || s.korea) add(s.name, () => s, s.name);
  for (const st of sites) { add(st.ko, () => st, st.ko); add(st.name, () => st, null); }
  add('ISS', () => sats.find(s => s.iss), 'ISS');
  add('다누리', () => planetObj(PLANETS.find(p => p.name === 'Danuri')), EN ? null : '다누리');
  for (const o of smallBodies) add(o.name, () => o, o.comet || /^[1-9] |^1[0-9] /.test(o.name) ? o.name : null);
  for (const h of exo.hosts) { add(h.name, () => h, EXO_FAMOUS.has(h.name) ? h.name : null); for (const p of h.planets) add(`${h.name} ${p[0]}`, () => h); }
  for (let i = 0; i < starData.pos.length; i++) { const n = starData.proper[i]; if (n) add(n, () => starObj(i), n); add('HIP' + starData.id[i], () => starObj(i)); }
  dl.innerHTML = opts.map(s => `<option value="${s.replace(/"/g, '&quot;')}">`).join('');
}
// coordinates typed into search: "05h35m17s -05d23m28s", "5:35:17 -5:23:28", "05 35 17 -05 23 28" or degrees "83.82 -5.39"
function parseCoords(s) {
  const t = s.trim().replace(/[°′″'"]/g, ' ').replace(/[hmsd]/gi, ' ').replace(/:/g, ' ').replace(/\s+/g, ' ').trim(), n = t.split(' ');
  if (n.some(x => isNaN(parseFloat(x)))) return null;
  const sign = (x) => x.trim().startsWith('-') ? -1 : 1, f = n.map(parseFloat);
  if (n.length === 2 && /\./.test(s) && !/[hm:]/i.test(s)) return f[0] >= 0 && f[0] < 360 && Math.abs(f[1]) <= 90 ? { ra: f[0], dec: f[1] } : null;
  if (n.length === 6 || n.length === 4) { const k = n.length / 2, ra = (f[0] + f[1] / 60 + (k === 3 ? f[2] / 3600 : 0)) * 15, sg = sign(n[k]), dec = sg * (Math.abs(f[k]) + f[k + 1] / 60 + (k === 3 ? f[k + 2] / 3600 : 0));
    return ra >= 0 && ra < 360 && Math.abs(dec) <= 90 ? { ra, dec } : null; }
  return null;
}
$('search').addEventListener('change', (e) => {
  const cc = /\d/.test(e.target.value) && !/^\s*(m|ngc|ic|hip|hd)\s*\d/i.test(e.target.value) ? parseCoords(e.target.value) : null;
  if (cc) { const o = { kindName: 'coord', name: `${fmtRA(cc.ra)} ${fmtDec(cc.dec)}`, ra: cc.ra, dec: cc.dec, v: eqVec(cc.ra, cc.dec) }; if (mode.space) setMode(false); select(o); flyTo(o); return; }
  let q = e.target.value.toLowerCase().replace(/\s+/g, '');
  const m = /^m(\d+)/.exec(q); if (m) q = 'm' + m[1];
  const n = /^(ngc|ic)0*(\d+)$/.exec(q); if (n) q = n[1] + n[2];
  let mk = searchIndex.get(q);
  if (!mk) for (const [k, v] of searchIndex) if (k.startsWith(q)) { mk = v; break; }
  if (mk) { const o = mk(); if (o.kindName === 'site' && !mode.space) setMode(true); if (o.planet && (!o.p.world || (o.p.probe && !o.p.active))) { $('status').textContent = o.p.probe ? `${o.name}: 이 시각의 위치 자료가 없습니다` : `${o.name}: 우주 모드에서 볼 수 있습니다`; return; } select(o); flyTo(o); e.target.blur(); } else $('status').textContent = `"${e.target.value}" 를 찾지 못했습니다`;
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
let lessonParam = new URLSearchParams(location.hash.slice(1)).get('lesson') || '';
function writeHash() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    const q = new URLSearchParams();
    q.set('m', mode.space ? 's' : 'g'); q.set('t', new Date(state.time).toISOString().slice(0, 16));
    if (!mode.space) { q.set('lat', state.lat.toFixed(2)); q.set('lon', state.lon.toFixed(2)); q.set('az', view.az.toFixed(1)); q.set('alt', view.alt.toFixed(1)); q.set('fov', view.fov.toPrecision(3)); }
    else if (sp.target) { q.set('at', sp.target.name); q.set('d', sp.dist.toPrecision(3)); }
    if (selected) q.set('o', selected.planet ? selected.p.name : selected.kindName === 'dso' ? (selected.messier || selected.name) : selected.name);
    if (lessonParam) q.set('lesson', lessonParam); // a lesson link keeps its lesson while the student looks around
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
  catch { try { prompt('이 링크를 복사하세요', location.href); } catch { $('status').textContent = '주소창의 링크를 복사해 나눠 주세요'; } }
};
canvas.addEventListener('pointerup', () => writeHash());
canvas.addEventListener('wheel', () => writeHash());
$('lat').onchange = (e) => state.lat = Math.max(-90, Math.min(90, +e.target.value || 0));
$('lon').onchange = (e) => state.lon = +e.target.value || 0;
$('t-lines').onchange = (e) => linesGroup.visible = e.target.checked;
$('t-mw').onchange = (e) => milkyWay.visible = e.target.checked && !!mwMat.uniforms.map.value;
$('skyculture').onchange = applySkyCulture;
$('t-lines').addEventListener('change', applySkyCulture);
$('t-bounds').onchange = (e) => boundsGroup.visible = e.target.checked;
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
$('eyepiece').onchange = (e) => { if (e.target.value === 'custom') { $('wx').hidden = true; $('gear').hidden = false; applyGear(true); return; }
  camFrame = null; const f = +e.target.value; eyeFov = f || 0; if (f) { view.fov = Math.max(view.fov > f * 1.4 ? f * 1.25 : view.fov, f * 1.1); } };
let eyeFov = 0, camFrame = null, gearLabel = '', neoData = [], neoNow = null;
function drawEyepiece() {
  const fr = $('frame-rect'), px = (deg) => Math.tan(deg / 2 * D2R) / Math.tan(view.fov / 2 * D2R) * innerHeight;
  if (camFrame && !mode.space) { fr.hidden = false; fr.style.width = px(camFrame.w) + 'px'; fr.style.height = px(camFrame.h) + 'px'; $('frame-label').textContent = camFrame.label; } else fr.hidden = true;
  const el = $('eye-ring'); if (!eyeFov || mode.space) { el.hidden = true; return; }
  const d = Math.tan(eyeFov / 2 * D2R) / Math.tan(view.fov / 2 * D2R) * innerHeight; el.hidden = false; el.style.width = el.style.height = d + 'px';
  $('eye-label').textContent = gearLabel && $('eyepiece').value === 'custom' ? gearLabel : `${$('eyepiece').selectedOptions[0].text} · 실시야 ${fmtAng(eyeFov)}`;
}
$('shot').onclick = () => {
  const a = document.createElement('a'); a.download = `space-commons-${toLocalInput(state.time).replace(/[:T]/g, '-')}.png`;
  a.href = canvas.toDataURL('image/png'); a.click();
};
// ---------- A3. take a long exposure: stars sweep arcs around the celestial pole; longer and higher-ISO shots reach fainter stars ----------
function longExposure() {
  if (mode.space) { $('status').textContent = '장노출 사진은 지상 모드에서 찍을 수 있습니다'; return; }
  const sec = +$('exp-sec').value, iso = +$('exp-iso').value, W = canvas.width, H = canvas.height, k = W / innerWidth;
  const out = document.createElement('canvas'); out.width = W; out.height = H; const g = out.getContext('2d');
  g.drawImage(canvas, 0, 0); g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, 0, W, H); // the live frame, darkened, keeps the ground and horizon
  const pole = eqVec(0, 90).applyMatrix4(new THREE.Matrix4().extractRotation(sky.matrixWorld)).normalize(), steps = Math.max(2, Math.min(90, Math.round(sec / 20)));
  const lim = Math.min([7.6, 7.1, 6.6, 6.2, 5.7, 5.2, 4.7, 4.2, 3.8][+$('bortle').value - 1] + 2.5, 5 + 1.25 * Math.log10(Math.max(1, sec * iso / 800))), ang = -sec / 86164 * 2 * Math.PI; // sidereal day
  const q = new THREE.Quaternion(), v = new THREE.Vector3(); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
  for (let i = 0; i < starData.pos.length; i++) { const m = starData.mag[i]; if (m > lim) continue;
    const w0 = starData.pos[i].clone().applyMatrix4(sky.matrixWorld).normalize(); if (w0.y < -0.05) continue;
    const [r, gg, b] = bvToRGB(starData.bv[i]), a = Math.min(1, 0.25 + (lim - m) * 0.22), lw = Math.max(0.6, (lim - m) * 0.55) * k;
    g.strokeStyle = `rgba(${r * 255 | 0},${gg * 255 | 0},${b * 255 | 0},${a})`; g.lineWidth = lw; g.beginPath(); let started = false;
    for (let s = 0; s <= steps; s++) { q.setFromAxisAngle(pole, ang * s / steps); v.copy(w0).applyQuaternion(q); if (v.y < 0) { started = false; continue; }
      const p = toScreen(v); if (!p) { started = false; continue; } started ? g.lineTo(p[0] * k, p[1] * k) : g.moveTo(p[0] * k, p[1] * k); started = true; }
    if (steps <= 2 || sec < 15) { const p = toScreen(w0); if (p) { g.fillStyle = g.strokeStyle; g.beginPath(); g.arc(p[0] * k, p[1] * k, lw * 0.9, 0, 7); g.fill(); } } else g.stroke(); }
  g.globalCompositeOperation = 'source-over'; g.fillStyle = 'rgba(236,230,218,.8)'; g.font = `${12 * k}px "Pretendard Variable", sans-serif`;
  g.fillText(`노출 ${sec >= 60 ? (sec / 60).toFixed(0) + '분' : sec + '초'} · ISO ${iso} · 별 한계 약 ${lim.toFixed(1)}등급 · Space Commons`, 12 * k, H - 12 * k);
  $('exp-img').src = out.toDataURL('image/jpeg', 0.9); $('exp-out').hidden = false;
  $('exp-save').onclick = () => { const a = document.createElement('a'); a.download = `space-commons-exposure-${sec}s.jpg`; a.href = $('exp-img').src; a.click(); };
}
$('exp-btn').onclick = () => { $('exp').hidden = !$('exp').hidden; };
$('exp-go').onclick = () => longExposure();
$('exp-close').onclick = () => { $('exp').hidden = true; $('exp-out').hidden = true; };
$('full').onclick = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();
function tonight() { // what is up right now: planets, the Moon and bright Messier objects above 15 degrees
  const list = [], up = (w) => w ? Math.asin(Math.max(-1, Math.min(1, w.y))) * R2D : -90; // planets have no ground-frame direction in space mode
  for (const p of PLANETS) if (!p.probe && !p.parent && p.world && p.name !== 'Sun' && p.name !== 'Earth') { const alt = up(p.world); if (alt > 15) list.push({ o: planetObj(p), alt, kind: p.name === 'Moon' ? '위성' : '행성', rank: -10 }); }
  for (const o of dsos) if (o.messier && o.mag < 7.5) { const w = o.v.clone().applyMatrix4(sky.matrixWorld); const alt = up(w); if (alt > 15) list.push({ o: dsoObj(o), alt, kind: TYPE_RAW_KO[o.type] || '', rank: o.mag }); }
  list.sort((a, b) => a.rank - b.rank);
  const sunAlt = up(PLANETS[0].world);
  $('tonight-sub').textContent = `${state.lat.toFixed(2)}°, ${state.lon.toFixed(2)}° · ${new Date(state.time).toLocaleString(LOCALE, { hour12: false })}` + (sunAlt > -6 ? ' · 지금은 하늘이 밝습니다' : '');
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
  if (e.code === 'KeyF') $('full').click(); if (e.code === 'KeyN') $('night').click(); if (e.code === 'KeyO') $('obs-btn').click(); if (e.code === 'KeyY' && !mode.space) $('today-btn').click(); if (e.code === 'KeyP') $('shot').click(); if (e.code === 'KeyT' && !mode.space) $('tonight-btn').click(); });

// ---------- guided tours ----------
let tour = null, tourStep = -1;
function tourMenu() {
  $('tour-prev').hidden = $('tour-next').hidden = false;
  $('tour-pick').innerHTML = ''; $('tour-pick').hidden = false; $('tour-body').hidden = true;
  for (const t of TOURS) { const b = document.createElement('button'); b.textContent = `${t.ko} (${t.steps.length})`; b.onclick = () => { tour = t; tourGo(0); }; $('tour-pick').append(b); }
  $('tour-step').textContent = '투어 고르기'; $('tour').hidden = false;
}
function tourGo(i) {
  tourStep = Math.max(0, Math.min(tour.steps.length - 1, i)); const st = tour.steps[tourStep];
  setMode(st.space); if (!st.space) $('t-ground').checked = false; // keep targets visible even if they are below the horizon
  if (st.time) { const d = new Date(state.time), [md, hm] = st.time.split('T'), [mo, da] = md.split('-'), [hh, mm] = hm.split(':');
    state.time = new Date(d.getFullYear(), +mo - 1, +da, +hh, +mm).getTime(); }
  const mk = searchIndex.get(st.o.toLowerCase().replace(/\s+/g, ''));
  if (mk) { const o = mk(); select(o); flyTo(o); }
  $('tour-pick').hidden = true; $('tour-body').hidden = false;
  $('tour-text').textContent = st.text; $('tour-step').textContent = `${tour.ko} · ${tourStep + 1} / ${tour.steps.length}`;
  $('tour-next').textContent = tourStep === tour.steps.length - 1 ? '끝' : '다음';
  $('tour').hidden = false;
}
$('tour-btn').onclick = () => { $('tour-prev').hidden = $('tour-next').hidden = false; $('tour').hidden ? tourMenu() : ($('tour').hidden = true); };
$('tour-next').onclick = () => tourStep === tour.steps.length - 1 ? tourMenu() : tourGo(tourStep + 1);
$('tour-prev').onclick = () => tourGo(tourStep - 1);
$('tour-close').onclick = () => { $('tour').hidden = true; tourStep = -1; };

// ---------- 9. meteor showers ----------
const mdOf = (ms) => { const d = new Date(ms); return (d.getMonth() + 1) * 100 + d.getDate(); };
const mdNum = (t) => { const [m, d] = t.split('-'); return +m * 100 + +d; };
const inRange = (md, a, b) => (a <= b ? md >= a && md <= b : md >= a || md <= b);
const showers = SHOWERS.map(sh => ({ ...sh, kindName: 'shower', name: sh.ko, v: eqVec(sh.ra, sh.dec) }));
function showerActive(sh, ms = state.time) { return inRange(mdOf(ms), mdNum(sh.start), mdNum(sh.end)); }
function daysToPeak(sh, ms = state.time) {
  const d = new Date(ms), [m, dd] = sh.peak.split('-');
  const c = [-1, 0, 1].map(k => Math.round((new Date(d.getFullYear() + k, +m - 1, +dd) - d) / 86400000)); // nearest peak, past or future
  return c.reduce((a, b) => Math.abs(b) < Math.abs(a) ? b : a);
}

// ---------- 7. today's sky: rise/set, twilight, Moon phase, dark window ----------
function sunMoonAt(ms) { const T = (jd(ms) - 2451545.0) / 36525; return { Sun: ecl2eq(helio('Earth', T).negate()), Moon: ecl2eq(moonGeo(T)) }; }
function altOf(v, ms) { const { ra, dec } = vecToRaDec(v); const H = (lstDeg(ms, state.lon) - ra) * D2R, d = dec * D2R, p = state.lat * D2R;
  return Math.asin(Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.cos(H)) * R2D; }
function moonPhaseInfo(ms) {
  const { Sun, Moon } = sunMoonAt(ms); const s = Sun.clone().normalize(), m = Moon.clone().normalize();
  const elong = Math.acos(Math.max(-1, Math.min(1, s.dot(m)))) * R2D, frac = (1 - Math.cos(elong * D2R)) / 2;
  const T = (jd(ms) - 2451545.0) / 36525, mo = moonGeo(T), su = helio('Earth', T).negate();
  const dl = ((Math.atan2(mo.y, mo.x) - Math.atan2(su.y, su.x)) * R2D + 720) % 360; // Moon minus Sun ecliptic longitude
  const names = ['삭 (신월)', '초승달', '상현달', '차오르는 달', '보름달', '기우는 달', '하현달', '그믐달'];
  return { frac, name: names[Math.round(dl / 45) % 8], age: dl / 360 * 29.53 };
}
function todaySky() {
  const d0 = new Date(state.time); const start = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate(), 12).getTime() - (d0.getHours() < 12 ? 86400000 : 0);
  const step = 2 * 60000, N = 24 * 30, ev = []; let prev = null; const dark = []; let darkStart = null;
  for (let i = 0; i <= N; i++) {
    const t = start + i * step, sm = sunMoonAt(t), a = { s: altOf(sm.Sun, t), m: altOf(sm.Moon, t) };
    if (prev) {
      const cross = (key, lvl, up, label) => { const x = prev[key] - lvl, y = a[key] - lvl; if ((up ? x < 0 && y >= 0 : x >= 0 && y < 0)) ev.push({ t: t - step + step * (x / (x - y)), label }); };
      cross('s', -0.833, false, '일몰'); cross('s', -6, false, '시민 박명 끝'); cross('s', -12, false, '항해 박명 끝'); cross('s', -18, false, '천문 박명 끝 (완전히 어두워짐)');
      cross('s', -18, true, '천문 박명 시작'); cross('s', -12, true, '항해 박명 시작'); cross('s', -6, true, '시민 박명 시작'); cross('s', -0.833, true, '일출');
      cross('m', 0.125, true, '월출'); cross('m', 0.125, false, '월몰');
    }
    const isDark = a.s < -18 && a.m < 0;
    if (isDark && darkStart === null) darkStart = t; if (!isDark && darkStart !== null) { dark.push([darkStart, t]); darkStart = null; }
    prev = a;
  }
  if (darkStart !== null) dark.push([darkStart, start + N * step]);
  ev.sort((a, b) => a.t - b.t);
  const hm = (t) => new Date(t).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', hour12: false });
  const ph = moonPhaseInfo(state.time);
  const ul = $('today-list'); ul.innerHTML = '';
  const li = (a, b, cls) => { const e = document.createElement('li'); if (cls) e.className = cls; const x = document.createElement('b'); x.textContent = a; const y = document.createElement('span'); y.textContent = b; e.append(x, y); ul.append(e); };
  li('달', `${ph.name} · 밝은 면 ${(ph.frac * 100).toFixed(0)}% · 월령 ${ph.age.toFixed(1)}일`);
  for (const e of ev) li(hm(e.t), e.label);
  if (dark.length) for (const [a, b] of dark) li(`${hm(a)} ~ ${hm(b)}`, '관측하기 가장 좋은 시간 (해와 달이 모두 없음)', 'best');
  else li('-', '오늘 밤은 달빛이나 박명 때문에 완전히 어두운 시간이 없습니다', 'best');
  const act = showers.filter(sh => showerActive(sh));
  for (const sh of act) li(sh.ko, `활동 중 · 극대 ${daysToPeak(sh) === 0 ? '오늘' : daysToPeak(sh) > 0 ? daysToPeak(sh) + '일 뒤' : -daysToPeak(sh) + '일 지남'} · 시간당 최대 약 ${sh.zhr}개`);
  $('today-sub').textContent = `${state.lat.toFixed(2)}°, ${state.lon.toFixed(2)}° · ${new Date(start).toLocaleDateString(LOCALE)} 낮 12시부터 24시간 · 시각은 이 기기의 시간대`;
  $('today').hidden = false;
}
$('today-btn').onclick = () => $('today').hidden ? todaySky() : ($('today').hidden = true);
$('today-close').onclick = () => $('today').hidden = true;

// ---------- 6. eclipses: find the moment of greatest eclipse with our own ephemeris ----------
function geoAt(ms) { // geocentric ecliptic AU
  const T = (jd(ms) - 2451545.0) / 36525, e = helio('Earth', T), o = { Sun: e.clone().negate(), Moon: moonGeo(T) };
  for (const n of ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune']) o[n] = helio(n, T).sub(e);
  return o;
}
const lonOf = (v) => (Math.atan2(v.y, v.x) * R2D + 360) % 360;
const sepDeg = (a, b) => Math.acos(Math.max(-1, Math.min(1, a.clone().normalize().dot(b.clone().normalize())))) * R2D;
function eclipseSep(e, ms) { // solar: Sun-Moon (topocentric at the place); lunar: Moon to the shadow axis (geocentric)
  const g = geoAt(ms);
  if (e.type === 'solar') { const [la, lo] = e.place; return sepDeg(g.Sun, g.Moon.clone().sub(observerEcl(ms, la, lo))); }
  return sepDeg(g.Sun.clone().negate(), g.Moon);
}
function eclipseMax(e) {
  if (e.tMax) return e;
  const t0 = Date.parse(e.date + 'T12:00:00Z'); let best = t0, bs = 1e9;
  for (let t = t0 - 30 * 3600e3; t <= t0 + 30 * 3600e3; t += 600e3) { const v = eclipseSep(e, t); if (v < bs) { bs = v; best = t; } }
  for (let t = best - 600e3; t <= best + 600e3; t += 20e3) { const v = eclipseSep(e, t); if (v < bs) { bs = v; best = t; } }
  e.tMax = best; e.sepMin = bs; return e;
}
function goEclipse(e) {
  eclipseMax(e); setMode(false); $('t-ground').checked = true;
  if (e.type === 'solar') { [state.lat, state.lon] = e.place; $('lat').value = state.lat; $('lon').value = state.lon; $('daysky').value = 'real'; }
  state.time = e.tMax - 12 * 60e3; state.speed = 30; document.querySelectorAll('[data-speed]').forEach(x => x.classList.remove('on')); // greatest eclipse arrives in ~24 s
  updateSkyMatrix(); updatePlanets();
  const body = PLANETS.find(p => p.name === (e.type === 'solar' ? 'Sun' : 'Moon')); const o = planetObj(body); select(o); flyTo(o);
  $('status').textContent = `${e.kind} · 최대 ${new Date(e.tMax).toLocaleString(LOCALE, { hour12: false })}${e.place ? ' · ' + e.place[2] : ''} · 30배속`;
}

// ---------- 8. astronomy calendar (next 90 days, computed from the same ephemeris) ----------
function buildCalendar() {
  const d0 = new Date(state.time), start = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate()).getTime(), end = start + 90 * 86400e3, ev = [];
  const scan = (stepH, f, onCross) => { let pt = start, pv = f(start); for (let t = start + stepH * 3600e3; t <= end; t += stepH * 3600e3) { const v = f(t); onCross(pt, pv, t, v); pt = t; pv = v; } };
  const interp = (t1, v1, t2, v2, lvl) => t1 + (t2 - t1) * ((lvl - v1) / (v2 - v1));
  // Moon phases: Moon-Sun ecliptic longitude difference crossing 0/90/180/270
  const PH = ['삭 (신월)', '상현달', '보름달', '하현달'];
  scan(3, (t) => { const g = geoAt(t); return (lonOf(g.Moon) - lonOf(g.Sun) + 360) % 360; }, (t1, v1, t2, v2) => {
    for (let q = 0; q < 4; q++) { const L = q * 90; let a = v1, b = v2; if (q === 0 && a > 270 && b < 90) b += 360; const lvl = q === 0 && v1 > 270 ? 360 : L;
      if (a < lvl && b >= lvl) ev.push({ t: interp(t1, a, t2, b, lvl), title: PH[q], key: 'Moon', kind: '달' }); } });
  // seasons
  const SE = ['춘분', '하지', '추분', '동지'];
  scan(6, (t) => lonOf(geoAt(t).Sun), (t1, v1, t2, v2) => { for (let q = 0; q < 4; q++) { const lvl = q === 0 ? 360 : q * 90; let b = v2; if (q === 0 && v1 > 270 && v2 < 90) b += 360;
    if (v1 < lvl && b >= lvl && (q !== 0 || v1 > 270)) ev.push({ t: interp(t1, v1, t2, b, lvl), title: SE[q], key: 'Sun', kind: '계절' }); } });
  // oppositions of the outer planets
  for (const n of ['Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune']) scan(12, (t) => { const g = geoAt(t); return (lonOf(g[n]) - lonOf(g.Sun) + 360) % 360; }, (t1, v1, t2, v2) => {
    if (v1 < 180 && v2 >= 180) ev.push({ t: interp(t1, v1, t2, v2, 180), title: `${PLANETS.find(p => p.name === n).ko} 충 (밤새 보이고 가장 밝음)`, key: n, kind: '행성' }); });
  // greatest elongations of Mercury and Venus
  for (const n of ['Mercury', 'Venus']) { let a = null, b = null, ta = 0, tb = 0;
    for (let t = start; t <= end; t += 12 * 3600e3) { const g = geoAt(t), e = sepDeg(g[n], g.Sun);
      if (a !== null && b !== null && b > a && b > e) { const east = ((lonOf(g[n]) - lonOf(g.Sun) + 540) % 360) - 180 > 0;
        ev.push({ t: tb, title: `${PLANETS.find(p => p.name === n).ko} 최대 ${east ? '동방' : '서방'} 이각 ${b.toFixed(1)}° (${east ? '저녁' : '새벽'} 하늘)`, key: n, kind: '행성' }); }
      a = b; ta = tb; b = e; tb = t; } }
  // close approaches: Moon with bright planets, and planet pairs
  const P5 = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'];
  const pairs = [...P5.map(n => ['Moon', n, 4, 2]), ...P5.flatMap((a, i) => P5.slice(i + 1).map(b => [a, b, 3, 12]))];
  for (const [a, b, lim, step] of pairs) { let s1 = null, s2 = null, t2 = 0;
    for (let t = start; t <= end; t += step * 3600e3) { const g = geoAt(t), sv = sepDeg(g[a], g[b]);
      if (s1 !== null && s2 !== null && s2 < s1 && s2 <= sv && s2 < lim) { const ka = a === 'Moon' ? '달' : PLANETS.find(p => p.name === a).ko, kb = PLANETS.find(p => p.name === b).ko;
        ev.push({ t: t2, title: EN ? `${ka === "달" ? "Moon" : ka} and ${kb}: ${s2.toFixed(1)}° apart` : `${ka}과 ${kb} 근접 ${s2.toFixed(1)}°`, key: b, kind: '근접' }); }
      s1 = s2; s2 = sv; t2 = t; } }
  // lunar occultations seen from the observing site (topocentric Moon, Meeus ch.47)
  for (const o of occultations(start, end)) ev.push(o);
  // near-Earth asteroid approaches (CNEOS, baked into data/neo.json)
  for (const n of neoData) if (n.t >= start && n.t <= end) ev.push({ t: n.t, title: `소행성 ${n.name} 지구 근접 ${Math.round(n.dist_km).toLocaleString()} km`, neo: n, kind: '소행성' });
  // meteor shower peaks and eclipses
  for (const sh of showers) for (const y of [d0.getFullYear(), d0.getFullYear() + 1]) { const [m, dd] = sh.peak.split('-'); const t = new Date(y, +m - 1, +dd, 22).getTime();
    if (t >= start && t <= end) ev.push({ t, title: `${sh.ko} 극대 (시간당 최대 약 ${sh.zhr}개)`, key: sh.ko, kind: '유성우' }); }
  for (const e of ECLIPSES) { const t = Date.parse(e.date + 'T12:00:00Z'); if (t >= start && t <= end) ev.push({ t, title: `${e.kind}${e.place ? ' · ' + e.place[2] : ''}`, ecl: e, kind: '식' }); }
  return ev.sort((a, b) => a.t - b.t);
}
function renderCalendar() {
  const ul = $('cal-list'); ul.innerHTML = '<li class="load"><span>계산 중…</span></li>'; $('cal').hidden = false;
  setTimeout(() => {
    const ev = buildCalendar(); ul.innerHTML = ''; let lastDay = '';
    for (const e of ev) {
      const day = new Date(e.t).toLocaleDateString(LOCALE, { month: 'long', day: 'numeric', weekday: 'short' });
      if (day !== lastDay) { const h = document.createElement('li'); h.className = 'day'; h.textContent = day; ul.append(h); lastDay = day; }
      const li = document.createElement('li'), b = document.createElement('button'), k = document.createElement('span');
      b.textContent = e.title; k.textContent = e.kind + (e.ecl ? '' : ' · ' + new Date(e.t).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', hour12: false }));
      b.onclick = () => {
        if (e.ecl) return goEclipse(e.ecl);
        if (e.neo) return playNeo(e.neo);
        setMode(false); state.time = e.t; state.speed = 0; document.querySelectorAll('[data-speed]').forEach(x => x.classList.toggle('on', x.dataset.speed === '0'));
        $('t-ground').checked = false; updateSkyMatrix(); updatePlanets();
        const mk = searchIndex.get(e.key.toLowerCase().replace(/\s+/g, '')); if (mk) { const o = mk(); select(o); flyTo(o); }
      };
      li.append(b, k); ul.append(li);
    }
    // the next eclipses, whatever the window
    const h = document.createElement('li'); h.className = 'day'; h.textContent = '다가오는 일식·월식'; ul.append(h);
    for (const e of ECLIPSES.filter(e => Date.parse(e.date) > state.time - 86400e3).slice(0, 8)) {
      const li = document.createElement('li'), b = document.createElement('button'), k = document.createElement('span');
      b.textContent = `${e.date} ${e.kind}`; k.textContent = e.place ? e.place[2] : '달이 떠 있는 곳 어디서나'; b.onclick = () => goEclipse(e); li.append(b, k);
      if (e.type === 'solar') { const mb = document.createElement('button'); mb.textContent = '그림자 지도'; mb.onclick = () => eclipseMap(e); li.append(mb); } ul.append(li);
    }
  }, 30);
}
$('cal-btn').onclick = () => $('cal').hidden ? renderCalendar() : ($('cal').hidden = true);
$('cal-close').onclick = () => $('cal').hidden = true;

// ---------- 10. ISS and bright satellites (CelesTrak TLE + SGP4 via satellite.js) ----------
const MAJOR_SAT = /천리안|아리랑|무궁화|차세대중형|다누리|COMS|GK-?2|KOMPSAT|KOREASAT|CAS500/i;
const SAT_KO = { 25544: '국제우주정거장 (ISS)', 48274: '톈궁 (중국 우주정거장)', 20580: '허블 우주망원경' };
const sats = [];
async function loadSats() {
  if (!window.satellite) return 0;
  const seen = new Set();
  for (const g of ['data/korea.tle', 'stations', 'visual']) { // Korean list first so their names win
    let txt = ''; try { txt = await fetch(g.startsWith('data/') ? g : `https://celestrak.org/NORAD/elements/gp.php?GROUP=${g}&FORMAT=tle`, { signal: AbortSignal.timeout(6000) /* a slow CelesTrak must not hold the loading screen */ }).then(r => r.ok ? r.text() : ''); } catch {}
    const L = txt.split(/\r?\n/);
    for (let i = 0; i + 2 < L.length; i += 3) {
      const l1 = L[i + 1], l2 = L[i + 2]; if (!l1?.startsWith('1 ') || !l2?.startsWith('2 ')) continue;
      const id = +l1.slice(2, 7); if (seen.has(id)) continue; seen.add(id);
      const korea = g === 'data/korea.tle';
      try { sats.push({ kindName: 'sat', id, korea, name: EN ? ({ 25544: 'International Space Station', 48274: 'Tiangong', 20580: 'Hubble Space Telescope' }[id] || L[i].trim()) : KR_SATS[id] || SAT_KO[id] || L[i].trim(), rec: satellite.twoline2satrec(l1, l2), iss: id === 25544, star: !!SAT_KO[id] }); } catch {}
    }
  }
  return sats.length;
}
function satState(s, ms, sunEqU) {
  const date = new Date(ms), pv = satellite.propagate(s.rec, date); if (!pv || !pv.position) return null;
  const gmst = satellite.gstime(date), la = satellite.ecfToLookAngles({ latitude: state.lat * D2R, longitude: state.lon * D2R, height: 0.05 }, satellite.eciToEcf(pv.position, gmst));
  const r = new THREE.Vector3(pv.position.x, pv.position.y, pv.position.z), d = r.dot(sunEqU), lit = d > 0 || r.clone().addScaledVector(sunEqU, -d).length() > 6371;
  return { az: la.azimuth * R2D, el: la.elevation * R2D, lit, h: satellite.eciToGeodetic(pv.position, gmst).height, v: Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z) };
}
const stations = {}; // NORAD id -> model group
function stationModel(id) {
  if (stations[id]) return stations[id];
  const g = new THREE.Group(); stations[id] = g; planetGroup.add(g);
  if (id === 25544) gltfLoader.load('models/iss.glb', (m) => { g.add(fitUnit(m.scene)); }, undefined, () => g.add(fitUnit(buildCraft('Tiangong'))));
  else g.add(fitUnit(buildCraft('Tiangong')));
  return g;
}
const krOrbits = new THREE.Group(); krOrbits.visible = false; planetGroup.add(krOrbits); let krOrbitsAt = -1e15;
function updateStations() { // space mode near Earth: station models at their real place, Korean satellites' orbits
  const E = helioPos.Earth, near = mode.space && E && E.distanceTo(sp.pos) < 0.3 && $('t-sats').checked;
  for (const s of sats) if (s.star && stations[s.id]) stations[s.id].visible = false;
  krOrbits.visible = near; if (!near) return;
  const date = new Date(state.time);
  for (const s of sats) { if (!s.star) continue;
    const pv = satellite.propagate(s.rec, date); if (!pv || !pv.position) continue;
    const g = stationModel(s.id), rel = E.clone().add(new THREE.Vector3(pv.position.x, pv.position.y, pv.position.z).divideScalar(1e6)).sub(sp.pos), d = rel.length();
    g.visible = true; g.position.copy(rel); g.scale.setScalar(Math.max((s.iss ? 55 : 27) / 1e9, d * Math.tan(view.fov * D2R * 0.012)));
    g.lookAt(rel.clone().add(new THREE.Vector3(pv.velocity.x, pv.velocity.y, pv.velocity.z)));
  }
  if (Math.abs(state.time - krOrbitsAt) > 600e3) { // redraw one revolution of each Korean satellite every 10 simulated minutes
    krOrbitsAt = state.time; krOrbits.clear();
    for (const s of sats) { if (!s.korea) continue; const P = 2 * Math.PI / s.rec.no * 60e3, pts = [];
      for (let i = 0; i <= 96; i++) { const pv = satellite.propagate(s.rec, new Date(state.time + P * i / 96)); if (pv?.position) pts.push(new THREE.Vector3(pv.position.x, pv.position.y, pv.position.z).divideScalar(1e6)); }
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xff7aa2, transparent: true, opacity: 0.28 })); l.frustumCulled = false; krOrbits.add(l); }
  }
  krOrbits.position.copy(E).sub(sp.pos);
}
function updateSats() {
  if (!sats.length || !$('t-sats').checked) { for (const s of sats) s.world = null; return; }
  if (mode.space) { // Korean satellites and the space stations, in true positions around Earth
    const date = new Date(state.time), E = helioPos.Earth, near = E && E.distanceTo(sp.pos) < 0.6;
    for (const s of sats) { s.world = null; if (!near || !(s.korea || s.star)) continue;
      const pv = satellite.propagate(s.rec, date); if (!pv || !pv.position) continue;
      const rel = E.clone().add(new THREE.Vector3(pv.position.x, pv.position.y, pv.position.z).divideScalar(1e6)).sub(sp.pos), d = rel.length();
      const toE = E.clone().sub(sp.pos); if (rel.dot(toE.clone().normalize()) > toE.length() && rel.clone().cross(toE).length() / toE.length() < bodyR(PLANETS.find(p => p.name === 'Earth'))) continue; // behind Earth
      s.world = rel.divideScalar(d); s.st = { h: satellite.eciToGeodetic(pv.position, satellite.gstime(date)).height, v: Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z), lit: true }; s.visible = true;
    }
    return;
  }
  const sunEqU = ecl2eq(geoAt(state.time).Sun).normalize(), sunAlt = PLANETS[0].world ? Math.asin(PLANETS[0].world.y) * R2D : 0;
  for (const s of sats) {
    const st = satState(s, state.time, sunEqU); s.st = st;
    s.world = st && st.el > 0 ? viewDir(st.az, st.el) : null; s.visible = st && st.lit && sunAlt < -6;
  }
}
function satPasses(s, n = 4) { // next passes above 10 degrees within 3 days
  const out = []; let cur = null; const t0 = state.time;
  for (let t = t0; t < t0 + 3 * 86400e3 && out.length < n; t += 30e3) {
    const sunEqU = ecl2eq(geoAt(t).Sun).normalize(), st = satState(s, t, sunEqU); if (!st) break;
    if (st.el > 10) { if (!cur) cur = { rise: t, max: st.el, tMax: t, lit: st.lit, sunAlt: 0 }; if (st.el > cur.max) { cur.max = st.el; cur.tMax = t; cur.lit = st.lit; } }
    else if (cur) { cur.set = t; const sa = sunMoonAt(cur.tMax); cur.dark = altOf(sa.Sun, cur.tMax) < -6; out.push(cur); cur = null; }
  }
  return out;
}

// ---------- landing sites on the Moon, Mars, Venus, Mercury ----------
const sites = SITES.map((s, i) => ({ ...s, kindName: 'site', key: 'site:' + s.name, R: s.size / 1000 }));
const siteModels = {}; // loaded on approach
function siteLocal(s) { const la = s.lat * D2R, lo = s.lon * D2R; return new THREE.Vector3(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo)); }
// the body is a faceted sphere whose flat faces sit up to ~0.1% below the true radius (2 km on the Moon):
// put each site on the drawn surface, found by casting a ray from the centre through the same geometry
const facetProbe = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
function siteRadius(s) {
  if (s.rLocal) return s.rLocal;
  const hit = new THREE.Raycaster(new THREE.Vector3(), siteLocal(s), 0, 2).intersectObject(facetProbe)[0];
  return (s.rLocal = hit ? hit.distance : 1);
}
function updateSites() { // world positions follow the body's real rotation; also keep helioPos for flying to them
  for (const s of sites) {
    const b = PLANETS.find(p => p.name === s.body); s.world = null; if (!mode.space || !b.world) continue;
    const n = siteLocal(s).applyQuaternion(b.mesh.quaternion), Rb = bodyR(b);
    s.normal = n; s.helio = helioPos[s.body].clone().addScaledVector(n, Rb * siteRadius(s)); helioPos[s.key] = s.helio;
    const rel = s.helio.clone().sub(sp.pos), d = rel.length(); s.camDist = d; s.rel = rel;
    const facing = n.dot(rel.clone().negate().normalize()) > 0.05; // on the hemisphere facing us
    s.world = facing && b.rpx > 90 && b.mesh.scale.x <= Rb * 1.001 ? rel.clone().divideScalar(d) : null;
    // landers show as small models once the body fills the view; true size when you are close
    if (s.world && b.camDist < Rb * 40) loadSiteModel(s);
    const m = siteModels[s.name];
    if (m) { m.visible = !!s.world; m.position.copy(rel); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
      m.scale.setScalar(Math.max(s.size / 1e9, d * Math.tan(view.fov * D2R * 0.012))); }
  }
  updateTerrain();
}
// ---------- local terrain around a landing site ----------
// The planet sphere is far too coarse (and too large for 32-bit GPU maths) to stand on: near a site we draw a 40 km
// patch in camera-relative coordinates, coloured from the planet map with procedural relief and fine detail.
const PATCH_M = 40000;
const patchNoise = `
  float h1(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h1(i), h1(i + vec2(1, 0)), f.x), mix(h1(i + vec2(0, 1)), h1(i + vec2(1, 1)), f.x), f.y); }`;
const patchMat = new THREE.ShaderMaterial({
  uniforms: { map: { value: null }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, lat0: { value: 0 }, lon0: { value: 0 }, Rm: { value: 1e6 } },
  vertexShader: `#include <common>
    #include <logdepthbuf_pars_vertex>
    uniform float lat0, lon0, Rm; varying vec2 vUv; varying vec3 vN; varying vec2 vXZ; ${patchNoise}
    float relief(vec2 p) { // flat pad under the lander, hills further out, and the planet's curvature
      float r = length(p), k = smoothstep(15.0, 400.0, r);
      return k * ((n2(p / 3000.0) - 0.5) * 140.0 + (n2(p / 700.0) - 0.5) * 30.0 + (n2(p / 120.0) - 0.5) * 6.0) - r * r / (2.0 * Rm);
    }
    void main() {
      vec2 p = position.xz; float h = relief(p), e = 40.0;
      vec3 n = normalize(vec3(relief(p - vec2(e, 0.0)) - relief(p + vec2(e, 0.0)), 2.0 * e, relief(p - vec2(0.0, e)) - relief(p + vec2(0.0, e))));
      vN = normalize(mat3(modelMatrix) * n); vXZ = p;
      float lat = lat0 - p.y / Rm, lon = lon0 + p.x / (Rm * cos(lat0));
      vUv = vec2(0.5 + lon / 6.2831853, 0.5 + lat / 3.1415927);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p.x, h, p.y, 1.0);
      #include <logdepthbuf_vertex>
    }`,
  fragmentShader: `#include <logdepthbuf_pars_fragment>
    uniform sampler2D map; uniform vec3 sunDir; varying vec2 vUv; varying vec3 vN; varying vec2 vXZ; ${patchNoise}
    void main() {
      #include <logdepthbuf_fragment>
      float d = n2(vXZ / 0.6) * 0.25 + n2(vXZ / 4.0) * 0.35 + n2(vXZ / 30.0) * 0.4;   // rocks, ripples, patches
      vec2 cell = floor(vXZ / 0.5), f = fract(vXZ / 0.5) - 0.5 + (vec2(h1(cell + 7.0), h1(cell + 3.0)) - 0.5) * 0.5;
      float pebble = step(0.965, h1(cell)) * (1.0 - smoothstep(0.08, 0.16 + 0.1 * h1(cell + 11.0), length(f))) * 0.45;
      vec3 t = texture2D(map, vUv).rgb; float lum = dot(t, vec3(0.3, 0.59, 0.11));
      vec3 base = t / max(lum, 0.03) * mix(lum, 0.42, 0.7); // keep the map's colour, lift very dark regions (e.g. Syrtis Major) so the ground reads
      vec3 col = base * (0.7 + 0.55 * d) * (1.0 - pebble);
      float l = max(dot(normalize(vN), sunDir), 0.0) * 0.95 + 0.38; // night side stays readable (as if lit by starlight / a dark-adapted eye)
      gl_FragColor = vec4(col * l, 1.0);
    }`,
});
const patchGeo = new THREE.PlaneGeometry(PATCH_M, PATCH_M, 256, 256); patchGeo.rotateX(-Math.PI / 2); // x east, z south, y up (metres)
const terrain = new THREE.Mesh(patchGeo, patchMat); terrain.frustumCulled = false; terrain.visible = false; planetGroup.add(terrain);
let terrainBody = null, siteUp = null;
function updateTerrain() {
  const near = sites.filter(x => x.rel && x.camDist < 2e-5).sort((a, b) => a.camDist - b.camDist)[0]; // within 20 km
  if (terrainBody) terrainBody.mesh.visible = true;
  terrain.visible = !!near && mode.space; terrainBody = null; siteUp = terrain.visible ? near.normal : null; if (!terrain.visible) return;
  const b = PLANETS.find(p => p.name === near.body), Rb = bodyR(b);
  const up = near.normal, eastL = new THREE.Vector3(-Math.sin(near.lon * D2R), 0, -Math.cos(near.lon * D2R)).applyQuaternion(b.mesh.quaternion);
  const east = eastL.addScaledVector(up, -eastL.dot(up)).normalize(), south = east.clone().cross(up);
  terrain.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(east, up, south));
  terrain.position.copy(near.rel); terrain.scale.setScalar(1e-9);
  const u = patchMat.uniforms; u.map.value = b.mesh.material.uniforms.map.value; u.lat0.value = near.lat * D2R; u.lon0.value = near.lon * D2R; u.Rm.value = Rb * 1e9;
  u.sunDir.value.copy(helioPos[near.body]).negate().normalize();
  b.mesh.visible = false; terrainBody = b; // the coarse sphere would cut through the patch
  sp.nearestAll = Math.min(sp.nearestAll, Math.max(near.camDist * 0.5, 1e-9)); // depth precision near the ground
}
function loadSiteModel(s) {
  if (siteModels[s.name]) return;
  const g = new THREE.Group(); siteModels[s.name] = g; planetGroup.add(g);
  const place = (obj) => { const u = fitUnit(obj); const box = new THREE.Box3().setFromObject(u); u.position.y -= box.min.y; g.clear(); g.add(u); }; // stand on the ground
  if (s.model) gltfLoader.load(`models/${s.model}.glb`, (m) => place(m.scene), undefined, () => place(buildCraft('lander')));
  else place(buildCraft('lander'));
}

// ---------- speed of light: a sphere of light leaving a body, growing at c ----------
const C_MKM = 0.299792458; // 10^6 km per second
const lightSphere = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(1, 36, 18)), new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
lightSphere.visible = false; lightSphere.frustumCulled = false; planetGroup.add(lightSphere);
let light = null; // { from: helio point, t0, name, reached: Set }
function startLight() {
  if (light) { light = null; lightSphere.visible = false; $('light-btn').textContent = '빛 출발'; return; }
  const o = sp.target && !sp.target.kindName ? sp.target : PLANETS[0];
  light = { from: (helioPos[o.name] || new THREE.Vector3()).clone(), t0: state.time, name: o.ko, reached: new Set([o.name]) };
  $('light-btn').textContent = '빛 지우기'; $('status').textContent = `${o.ko}에서 빛이 출발했습니다. 시간을 빠르게 하면 퍼지는 모습이 잘 보입니다.`;
}
function updateLight() {
  if (!light || !mode.space) { lightSphere.visible = false; return; }
  const r = C_MKM * (state.time - light.t0) / 1000; lightSphere.visible = r > 0;
  lightSphere.position.copy(light.from).sub(sp.pos); lightSphere.scale.setScalar(Math.max(r, 1e-6));
  for (const p of PLANETS) { if (light.reached.has(p.name) || p.parent || !helioPos[p.name] || (p.probe && !['Voyager 1', 'New Horizons', 'JWST', 'Parker Solar Probe'].includes(p.name))) continue;
    if (helioPos[p.name].distanceTo(light.from) <= r) { light.reached.add(p.name);
      const sec = (state.time - light.t0) / 1000, t = sec < 120 ? `${sec.toFixed(1)}초` : sec < 7200 ? `${(sec / 60).toFixed(1)}분` : `${(sec / 3600).toFixed(1)}시간`;
      $('status').textContent = `${light.name}의 빛이 ${p.ko}에 닿았습니다 (${t})`; } }
}

// ---------- 13. spacecraft encounter replays ----------
function renderFlybys() {
  const ul = $('flyby-list'); ul.innerHTML = '';
  for (const [k, info] of Object.entries(FLYBY_INFO)) { if (!flybyData[k]) continue;
    const li = document.createElement('li'), b = document.createElement('button'), sp2 = document.createElement('span');
    b.textContent = info.ko; sp2.textContent = info.text; b.onclick = () => playFlyby(k); li.append(b, sp2); ul.append(li); }
  if (neoData.length) { const h = document.createElement('li'); h.className = 'day'; h.textContent = '지구 근접 소행성 (2025~2035, 지름 약 100 m 이상)'; ul.append(h);
    for (const n of [...neoData].sort((a, b) => a.t - b.t)) { const li = document.createElement('li'), b = document.createElement('button'), s2 = document.createElement('span');
      b.textContent = `${n.name} · ${new Date(n.t).toLocaleDateString(LOCALE)}`; s2.textContent = `최근접 ${Math.round(n.dist_km).toLocaleString()} km (달 거리의 ${(n.dist_km / 384400).toFixed(2)}배) · ${n.v_kms} km/s · 지름 약 ${Math.round(n.diam_m)} m`;
      b.onclick = () => playNeo(n); li.append(b, s2); ul.append(li); } }
  $('flyby').hidden = false;
}
function playFlyby(k) {
  const f = flybyData[k], info = FLYBY_INFO[k], tC = Date.parse(f.closest.replace(' ', 'T') + ':00Z');
  setMode(true); state.time = tC - 2 * 3600e3; state.speed = 120; document.querySelectorAll('[data-speed]').forEach(x => x.classList.remove('on'));
  computeHelio();
  const p = PLANETS.find(q => q.name === f.craft), c = PLANETS.find(q => q.name === f.center) || PLANETS[0];
  const dir = helioPos[p.name].clone().sub(helioPos[c.name] || new THREE.Vector3()).normalize();
  // camera behind and to the side of the craft, so the planet sits beside it rather than hidden directly behind
  const side = dir.clone().cross(ECL_N).normalize(), view3 = dir.clone().multiplyScalar(0.75).addScaledVector(side, 0.66).normalize();
  sp.flight = null; sp.target = p; sp.replay = p; sp.dist = Math.max(bodyR(c) * 6, 0.003); sp.quat.copy(lookQuat(view3.negate())); view.fov = 40;
  $('sp-target').textContent = `명장면: ${info.ko}`; $('flyby').hidden = true;
  $('tour-pick').hidden = true; $('tour-body').hidden = false; $('tour-prev').hidden = $('tour-next').hidden = true;
  $('tour-step').textContent = `${info.ko} · 최근접 ${f.closest} UTC · 120배속`; $('tour-text').textContent = info.text; $('tour').hidden = false;
  select(planetObj(p));
}
$('flyby-btn').onclick = () => $('flyby').hidden ? renderFlybys() : ($('flyby').hidden = true);
$('flyby-close').onclick = () => $('flyby').hidden = true;

// ---------- 16. near-Earth asteroid approaches (G: S2) ----------
fetch('data/neo.json').then(r => r.json()).then(d => { neoData = d.map(n => { const [day, hm] = n.cd.split(' '), [y, mo, dd] = day.split('-'); return { ...n, t: Date.parse(`${dd} ${mo} ${y} ${hm} UTC`) }; }); }).catch(() => {});
const neoGroup = new THREE.Group(); neoGroup.visible = false; planetGroup.add(neoGroup);
const neoDot = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffb454 })); neoGroup.add(neoDot);
function neoAt(n, ms) { // geocentric equatorial 10^6 km, linear between 30-minute Horizons samples
  const k = (jd(ms) - n.jd0) / n.step, N = n.xyz.length / 3; if (k < 0 || k > N - 1) return null;
  const i = Math.min(N - 2, Math.floor(k)), f = k - i, a = n.xyz;
  return new THREE.Vector3(a[3 * i] + (a[3 * i + 3] - a[3 * i]) * f, a[3 * i + 1] + (a[3 * i + 4] - a[3 * i + 1]) * f, a[3 * i + 2] + (a[3 * i + 5] - a[3 * i + 2]) * f);
}
function playNeo(n) {
  setMode(true); state.time = n.t - 14 * 3600e3; state.speed = 1800; document.querySelectorAll('[data-speed]').forEach(x => x.classList.remove('on'));
  computeHelio();
  for (const c of [...neoGroup.children]) if (c !== neoDot) { neoGroup.remove(c); c.geometry.dispose(); }
  const pts = []; for (let i = 0; i < n.xyz.length; i += 3) pts.push(new THREE.Vector3(n.xyz[i], n.xyz[i + 1], n.xyz[i + 2]));
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffb454, transparent: true, opacity: 0.55 })); line.frustumCulled = false; neoGroup.add(line);
  const moonPts = []; for (let i = 0; i <= 64; i++) { const t = n.t + (i / 64 - 0.5) * 4 * 86400e3, T = (jd(t) - 2451545.0) / 36525; moonPts.push(ecl2eq(moonGeo(T)).multiplyScalar(MKM_AU)); }
  const ml = new THREE.Line(new THREE.BufferGeometry().setFromPoints(moonPts), new THREE.LineBasicMaterial({ color: 0x9aa5c0, transparent: true, opacity: 0.35 })); ml.frustumCulled = false; neoGroup.add(ml);
  neoNow = n; $('t-sats').checked = false; // satellite labels would hide the fly-by
  const earth = PLANETS.find(p => p.name === 'Earth'), cl = neoAt(n, n.t) || pts[pts.length >> 1];
  const nrm = pts[0].clone().cross(pts[pts.length - 1]).normalize(); // look down on the fly-by plane, a little tilted
  sp.flight = null; sp.target = earth; sp.replay = null; sp.dist = Math.max(n.dist_km / 1e6 * 3.2, bodyR(earth) * 10);
  sp.quat.copy(lookQuat(nrm.clone().negate().addScaledVector(cl.clone().normalize(), 0.35).normalize())); view.fov = 50;
  $('sp-target').textContent = `근접 소행성: ${n.name}`; $('flyby').hidden = true; $('cal').hidden = true;
  $('tour-pick').hidden = true; $('tour-body').hidden = false; $('tour-prev').hidden = $('tour-next').hidden = true;
  $('tour-step').textContent = `${n.name} · 최근접 ${n.cd} UTC · 1800배속`;
  $('tour-text').textContent = `지구 중심에서 ${Math.round(n.dist_km).toLocaleString()} km (달 거리의 ${(n.dist_km / 384400).toFixed(2)}배)까지 다가옵니다. 상대 속도 ${n.v_kms} km/s, 절대 등급 H ${n.H}, 지름 약 ${Math.round(n.diam_m)} m. 주황 선은 JPL Horizons로 계산한 앞뒤 이틀의 경로, 회색 선은 같은 기간의 달 궤도입니다.`;
  $('tour').hidden = false;
}
function updateNeo() {
  const E = helioPos.Earth; if (!neoNow || !mode.space || !E) { neoGroup.visible = false; return; }
  const g = neoAt(neoNow, state.time); neoGroup.visible = true; neoGroup.position.copy(E).sub(sp.pos);
  if (!g) { neoDot.visible = false; return; }
  const rel = g.clone().add(neoGroup.position), d = rel.length(); neoDot.visible = true; neoDot.position.copy(g);
  neoDot.scale.setScalar(Math.max(neoNow.diam_m / 2 / 1e9, d * Math.tan(view.fov * D2R * 0.004)));
  if (sp.target?.name === 'Earth') $('status').textContent = `${neoNow.name} · 지구 중심에서 ${Math.round(g.length() * 1e6).toLocaleString()} km`;
}

// ---------- 17. lunar occultations (G13) ----------
const eq2ecl = (v) => new THREE.Vector3(v.x, v.y * Math.cos(OBL) + v.z * Math.sin(OBL), -v.y * Math.sin(OBL) + v.z * Math.cos(OBL));
const radec = (ra, dec) => new THREE.Vector3(Math.cos(dec * D2R) * Math.cos(ra * D2R), Math.cos(dec * D2R) * Math.sin(ra * D2R), Math.sin(dec * D2R));
const OCC_STARS = [['Aldebaran', 68.980, 16.509, '알데바란'], ['Regulus', 152.093, 11.967, '레굴루스'], ['Spica', 201.298, -11.161, '스피카'], ['Antares', 247.352, -26.432, '안타레스'], ['M45', 56.75, 24.12, '플레이아데스성단']]
  .map(([key, ra, dec, ko]) => ({ key, ko, ecl: eq2ecl(radec(ra, dec)) }));
function occultations(start, end) {
  const out = [], tg = [...['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'].map(n => ({ key: n, ko: PLANETS.find(p => p.name === n).ko, planet: true })), ...OCC_STARS];
  const dirOf = (g, o) => o.planet ? g[o.key] : o.ecl;
  const prev = tg.map(() => [1e9, 1e9]);
  for (let t = start; t <= end; t += 3600e3) { const g = geoAt(t);
    tg.forEach((o, i) => { const s = sepDeg(g.Moon, dirOf(g, o)), [a, b] = prev[i];
      if (b < a && b <= s && b < 1.8) { // geocentric closest approach an hour ago: refine topocentrically
        let best = 1e9, tb = 0, inT = 0, outT = 0;
        for (let u = t - 4 * 3600e3; u <= t + 2 * 3600e3; u += 60e3) { const h = geoAt(u), mt = h.Moon.clone().sub(observerEcl(u, state.lat, state.lon));
          const rad = Math.asin(1737.4 / (mt.length() * KM_AU)) * R2D, sv = sepDeg(mt, o.planet ? h[o.key].clone().sub(observerEcl(u, state.lat, state.lon)) : o.ecl) - rad;
          if (sv < best) { best = sv; tb = u; } if (sv < 0 && !inT) inT = u; if (sv < 0) outT = u; }
        if (inT) { const sm = sunMoonAt(tb), alt = altOf(sm.Moon, tb), sunAlt = altOf(sm.Sun, tb);
          if (alt > 0) out.push({ t: inT, title: EN ? `Moon occults ${o.key}` : `달이 ${o.ko}${/[가-힣]$/.test(o.ko) && (o.ko.charCodeAt(o.ko.length - 1) - 0xac00) % 28 ? '을' : '를'} 가림 (엄폐) · ${Math.round((outT - inT) / 60e3)}분${sunAlt > -6 ? ' · 낮이라 관측 어려움' : ''}`, key: o.planet ? o.key : o.key, kind: '엄폐' }); }
      }
      prev[i] = [b, s]; }); }
  return out;
}

// ---------- 18. altitude tonight (G11) ----------
function altGraph(o, ra, dec) {
  const box = $('info-alt'); box.hidden = true; box.innerHTML = '';
  if (mode.space || o.kindName === 'sat' || o.kindName === 'site' || (o.planet && o.p.probe)) return;
  const name = o.planet ? o.p.name : null, GEO = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];
  let dirAt;
  if (name && GEO.includes(name)) dirAt = (t) => ecl2eq(geoAt(t)[name]);
  else if (isFinite(ra) && isFinite(dec)) { const v = radec(ra, dec); dirAt = () => v; } else return;
  const d0 = new Date(state.time), start = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate(), 12).getTime() - (d0.getHours() < 12 ? 86400e3 : 0);
  const N = 96, W = 300, H = 128, top = 8, bot = 104, y = (a) => top + (90 - Math.max(-20, Math.min(90, a))) / 110 * (bot - top), x = (i) => i / N * W;
  const S = [], M = [], A = [];
  for (let i = 0; i <= N; i++) { const t = start + i * 15 * 60e3, sm = sunMoonAt(t); S.push(altOf(sm.Sun, t)); M.push(altOf(sm.Moon, t)); A.push(altOf(dirAt(t), t)); }
  let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="오늘 밤 고도 그래프">`;
  for (let i = 0; i < N; i++) { const s = S[i], c = s > 0 ? '#2b4370' : s > -6 ? '#1f3056' : s > -12 ? '#172443' : s > -18 ? '#111b33' : '#0a1122';
    svg += `<rect x="${x(i).toFixed(1)}" y="${top}" width="${(W / N + 0.6).toFixed(1)}" height="${bot - top}" fill="${c}"/>`; }
  svg += `<line x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}" stroke="#7d8aa8" stroke-width="1"/>`;
  for (const a of [30, 60]) svg += `<line x1="0" x2="${W}" y1="${y(a)}" y2="${y(a)}" stroke="#7d8aa8" stroke-opacity=".25" stroke-dasharray="2 3"/><text x="3" y="${y(a) - 2}" fill="#7d8aa8" font-size="8">${a}°</text>`;
  const path = (arr) => arr.map((a, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(a).toFixed(1)}`).join('');
  if (name !== 'Moon') svg += `<path d="${path(M)}" fill="none" stroke="#c9d1e6" stroke-opacity=".55" stroke-width="1.2" stroke-dasharray="3 3"/>`;
  svg += `<path d="${path(A)}" fill="none" stroke="#8fb8c9" stroke-width="2"/>`;
  for (let i = 0; i <= N; i += 12) { const t = start + i * 15 * 60e3; svg += `<text x="${Math.min(W - 12, x(i) + 1)}" y="${H - 12}" fill="#9aa5c0" font-size="8.5">${new Date(t).getHours()}시</text>`; }
  const k = (state.time - start) / (15 * 60e3); if (k >= 0 && k <= N) svg += `<line x1="${x(k)}" x2="${x(k)}" y1="${top}" y2="${bot}" stroke="#ffb454" stroke-width="1.2"/>`;
  svg += '</svg>';
  let im = 0; A.forEach((a, i) => { if (a > A[im]) im = i; });
  const night = A.map((a, i) => a > 0 && S[i] < -12), nh = night.filter(Boolean).length / 4;
  const tm = start + im * 15 * 60e3, sep = name === 'Moon' ? null : sepDeg(dirAt(tm), sunMoonAt(tm).Moon);
  const hm = (t) => new Date(t).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', hour12: false });
  box.innerHTML = svg + `<div class="small">가장 높을 때 ${hm(tm)} · 고도 ${A[im].toFixed(0)}° · 어두운 하늘에서 지평선 위 ${nh.toFixed(1)}시간${sep != null ? ` · 그때 달과 ${sep.toFixed(0)}°` : ''}<br>초록 선: 이 천체 · 점선: 달 · 배경: 낮, 박명, 밤 · 주황 선: 지금</div>`;
  box.hidden = false;
}

// ---------- 19. my telescope and camera (G12) ----------
const GEAR_KEY = 'space-commons-gear';
try { const g = JSON.parse(localStorage.getItem(GEAR_KEY)); if (g) for (const [k, v] of Object.entries(g)) if ($(k)) { if ($(k).type === 'checkbox') $(k).checked = v; else $(k).value = v; } } catch {}
function applyGear(zoom) {
  const v = (id) => Math.max(0.1, +$(id).value || 0), D = v('g-ap'), F = v('g-fl') * +$('g-barlow').value, fe = v('g-ep'), af = v('g-af'), sw = v('g-sw'), sh = v('g-sh');
  const mag = F / fe, tf = af / mag, exitP = D / mag, lim = 2.7 + 5 * Math.log10(D), dawes = 116 / D;
  const cw = 2 * Math.atan(sw / 2 / F) * R2D, ch = 2 * Math.atan(sh / 2 / F) * R2D;
  try { localStorage.setItem(GEAR_KEY, JSON.stringify(Object.fromEntries(['g-ap', 'g-fl', 'g-ep', 'g-af', 'g-sw', 'g-sh', 'g-eye', 'g-cam', 'g-barlow'].map(k => [k, $(k).type === 'checkbox' ? $(k).checked : $(k).value])))); } catch {}
  const rows = [['배율', `${mag.toFixed(0)}배${mag > 2 * D ? ' (구경에 비해 너무 높음)' : ''}`], ['실제 시야', fmtAng(tf)], ['사출동공', `${exitP.toFixed(1)} mm${exitP > 7 ? ' (눈동자보다 큼)' : ''}`],
    ['한계 등급 (어두운 하늘)', lim.toFixed(1)], ['분해능 (도스 한계)', `${dawes.toFixed(2)}″`], ['최대 유효 배율', `${Math.round(2 * D)}배`], ['초점비', `f/${(F / D).toFixed(1)}`], ['사진 화각', `${fmtAng(cw)} × ${fmtAng(ch)}`]];
  $('gear-out').innerHTML = ''; for (const [a, b] of rows) { const r = $('gear-out').insertRow(); r.insertCell().textContent = a; r.insertCell().textContent = b; }
  // the same telescope with common eyepieces: what each one is good for
  let eh = '<tr><th>접안렌즈</th><th>배율</th><th>실시야</th><th>사출동공</th><th>알맞은 대상</th></tr>';
  for (const [e, a] of [[40, 44], [32, 52], [25, 52], [15, 60], [10, 60], [6, 66], [4, 66]]) { const m = F / e, t = a / m, x = D / m;
    const use = m > 2 * D ? '배율 초과: 흐려짐' : x > 7 ? '사출동공이 눈보다 커 빛 손실' : x >= 4 ? '은하수 훑기, 큰 성단, 성운' : x >= 2 ? '은하, 구상성단, 달 전체' : x >= 1 ? '행성, 이중성, 행성상 성운' : '달과 행성의 세부 (대기가 안정할 때)';
    eh += `<tr><td>${e} mm</td><td>${m.toFixed(0)}배</td><td>${fmtAng(t)}</td><td>${x.toFixed(1)} mm</td><td>${use}</td></tr>`; }
  $('gear-eps').innerHTML = eh;
  if ($('eyepiece').value !== 'custom') return;
  eyeFov = $('g-eye').checked ? tf : 0; gearLabel = `${D}mm f/${(F / D).toFixed(1)} · ${fe}mm · ${mag.toFixed(0)}배 · 실시야 ${fmtAng(tf)}`;
  camFrame = $('g-cam').checked ? { w: cw, h: ch, label: `센서 ${sw}×${sh} mm · ${fmtAng(cw)} × ${fmtAng(ch)}` } : null;
  if (zoom) view.fov = Math.min(100, Math.max(tf, camFrame ? Math.max(cw, ch) * 1.1 : 0) * 1.6);
}
for (const id of ['g-ap', 'g-fl', 'g-ep', 'g-af', 'g-sw', 'g-sh', 'g-eye', 'g-cam', 'g-barlow']) $(id).oninput = $(id).onchange = () => applyGear(false);
$('g-preset').onchange = () => { const [a, f] = ($('g-preset').value || ',').split(','); if (a) { $('g-ap').value = a; $('g-fl').value = f; applyGear(false); } };
$('gear-close').onclick = () => $('gear').hidden = true;

// ---------- 20. my location and tonight's weather (G9, G10) ----------
$('geo-btn').onclick = () => {
  if (!navigator.geolocation) { $('status').textContent = '이 브라우저는 위치 기능을 지원하지 않습니다'; return; }
  $('status').textContent = '위치 확인 중…';
  navigator.geolocation.getCurrentPosition((p) => {
    state.lat = +p.coords.latitude.toFixed(3); state.lon = +p.coords.longitude.toFixed(3); $('lat').value = state.lat; $('lon').value = state.lon; $('place').value = '';
    $('status').textContent = `내 위치 ${state.lat}°, ${state.lon}° (이 기기 안에서만 씁니다)`; if (!$('wx').hidden) showWeather();
  }, (e) => { $('status').textContent = `위치를 받지 못했습니다 (${e.code === 1 ? '권한 거부' : '시간 초과 또는 오류'})`; }, { timeout: 12000, maximumAge: 600e3 });
};
async function showWeather() {
  const tb = $('wx-table'), la = state.lat.toFixed(2), lo = state.lon.toFixed(2); $('wx').hidden = false; tb.innerHTML = ''; $('wx-sum').textContent = '예보 받는 중…';
  $('wx-sub').textContent = `${la}°, ${lo}° · 지금부터 24시간 · 시각은 이 기기의 시간대`;
  let h; try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}&hourly=cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,relative_humidity_2m,visibility,temperature_2m,wind_speed_10m&forecast_days=3&timezone=GMT&timeformat=unixtime`);
    h = (await r.json()).hourly; if (!h?.time) throw 0;
  } catch { $('wx-sum').textContent = '예보를 받지 못했습니다. 잠시 뒤 다시 눌러 주세요.'; return; }
  const now = Date.now(), i0 = Math.max(0, h.time.findIndex(t => t * 1000 > now - 3600e3)), rows = [];
  tb.innerHTML = '<tr><th>시각</th><th>구름</th><th>저·중·고</th><th>습도</th><th>시정</th><th>기온</th></tr>';
  for (let i = i0; i < Math.min(h.time.length, i0 + 24); i++) {
    const t = h.time[i] * 1000, sun = altOf(sunMoonAt(t).Sun, t), dark = sun < -12, c = h.cloud_cover[i], rh = h.relative_humidity_2m[i], vis = h.visibility[i] / 1000;
    rows.push({ t, dark, c, rh, vis }); const tr = tb.insertRow(); if (!dark) tr.className = 'day';
    const bar = `<span class="bar" style="width:${Math.round(c / 100 * 34)}px;opacity:${0.35 + c / 160}"></span>`;
    tr.innerHTML = `<td>${new Date(t).getHours()}시${dark ? '' : sun > 0 ? ' 낮' : ' 박명'}</td><td>${bar}${c}%</td><td>${h.cloud_cover_low[i]}·${h.cloud_cover_mid[i]}·${h.cloud_cover_high[i]}</td><td>${rh}%</td><td>${vis >= 10 ? Math.round(vis) : vis.toFixed(1)} km</td><td>${Math.round(h.temperature_2m[i])}°</td>`;
  }
  const good = rows.filter(r => r.dark && r.c <= 30), hm = (t) => `${new Date(t).getHours()}시`;
  const transp = (r) => r.rh < 65 && r.vis > 20 ? '좋음' : r.rh < 85 && r.vis > 10 ? '보통' : '나쁨';
  $('wx-sum').textContent = good.length ? `어두운 시간 중 맑은 때(구름 30% 이하): ${good.length}시간, ${hm(good[0].t)}부터 · 대기 투명도 ${transp(good[0])} (습도·시정으로 추정)` : '오늘 밤 어두운 시간에는 구름이 많을 것으로 예보됩니다';
}
$('wx-btn').onclick = () => { $('gear').hidden = true; $('wx').hidden ? showWeather() : ($('wx').hidden = true); };
$('wx-close').onclick = () => $('wx').hidden = true;

// ---------- 21. among the nearby stars (S11) and exoplanet systems (S12) ----------
const PC = 3.0856776e7; // parsec in 10^6 km
const s3d = { rows: [], pos: null, absmag: null, far: false }, s3dByName = new Map();
const s3dMat = new THREE.ShaderMaterial({
  uniforms: { pr: { value: 1 } },
  vertexShader: `attribute float mag; attribute vec3 color; varying vec3 vC; varying float vA; uniform float pr;
    void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); float d = 6.8 - mag;
      vA = d < 0.0 ? 0.0 : clamp(d * 0.6 + 0.25, 0.0, 1.0); gl_PointSize = clamp(2.0 + d * 1.25, 1.5, 22.0) * pr; vC = color; }`,
  fragmentShader: `varying vec3 vC; varying float vA;
    void main(){ vec2 p = gl_PointCoord * 2.0 - 1.0; float r2 = dot(p,p); if (r2 > 1.0 || vA <= 0.0) discard;
      float core = exp(-r2 * 9.0), halo = exp(-r2 * 2.5) * 0.35; gl_FragColor = vec4(mix(vC, vec3(1.0), core*0.6) * (core + halo), 1.0) * vA; }`,
  transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
});
let s3dPts = null;
const ciRGB = (ci) => { const t = 4600 * (1 / (0.92 * ci + 1.7) + 1 / (0.92 * ci + 0.62)); return [Math.min(1, t / 6500 + 0.15), Math.min(1, 0.55 + t / 22000), Math.min(1, t / 9000)]; };
const teffOf = (ci) => 4600 * (1 / (0.92 * ci + 1.7) + 1 / (0.92 * ci + 0.62));
fetch('data/stars3d.json').then(r => r.json()).then(js => {
  const rows = [['태양', 0, 0, 0, 4.83, 0.65, ''], ...js.rows], N = rows.length;
  s3d.rows = rows; s3d.pos = new Float64Array(N * 3); s3d.absmag = new Float32Array(N);
  const col = new Float32Array(N * 3);
  rows.forEach((r, i) => { s3d.pos.set([r[1] * PC, r[2] * PC, r[3] * PC], i * 3); s3d.absmag[i] = r[4]; col.set(ciRGB(r[5]), i * 3);
    if (i) s3dByName.set(r[0], { name: r[0], pos: new THREE.Vector3(r[1] * PC, r[2] * PC, r[3] * PC), M: r[4], ci: r[5], con: r[6], planets: [] }); });
  // the Local Group: each galaxy a cloud of points at its real direction and distance (disc tilted by its catalogued inclination)
  let i = N0; for (const [name, ra, dec, kpc, rk, inc, n, pa] of LOCAL_GROUP) {
    const cen = eqVec(ra, dec, kpc * KPC), up = new THREE.Vector3(0, 0, 1), e1 = new THREE.Vector3().crossVectors(up, cen).normalize(), e2 = new THREE.Vector3().crossVectors(cen.clone().normalize(), e1);
    const a1 = e1.clone().multiplyScalar(Math.cos(pa * D2R)).addScaledVector(e2, Math.sin(pa * D2R)), a2 = e2.clone().multiplyScalar(Math.cos(pa * D2R)).addScaledVector(e1, -Math.sin(pa * D2R)), nrm = cen.clone().normalize();
    const b2 = a2.clone().multiplyScalar(Math.cos(inc * D2R)).addScaledVector(nrm, Math.sin(inc * D2R)), sph = inc < 0;
    for (let k = 0; k < n; k++, i++) { const r = rk * Math.min(3, -Math.log(1 - rnd() * 0.95) * 0.6), th = rnd() * 2 * Math.PI, v = cen.clone();
      if (sph) v.addScaledVector(e1, gau() * rk * 0.5 * KPC).addScaledVector(e2, gau() * rk * 0.5 * KPC).addScaledVector(nrm, gau() * rk * 0.5 * KPC);
      else v.addScaledVector(a1, r * Math.cos(th) * KPC).addScaledVector(b2, r * Math.sin(th) * KPC).addScaledVector(nrm, gau() * rk * 0.04 * KPC);
      pos.set([v.x, v.y, v.z], i * 3); const core = r < rk * 0.3; col.set(core ? [1, 0.88, 0.7] : [0.75, 0.82, 1], i * 3); w[i] = 25 * Math.min(4, kpc / 50) ** 1.2; }
    galaxy.labels.push({ name, v: cen }); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
  g.setAttribute('mag', new THREE.Float32BufferAttribute(new Float32Array(N), 1)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  s3dPts = new THREE.Points(g, s3dMat); s3dPts.frustumCulled = false; s3dPts.renderOrder = -1; s3dPts.visible = false; planetScene.add(s3dPts);
}).catch(() => {});
function updateStars3d() {
  // beyond ~0.03 light-years the sky backdrop (stars fixed at infinity) is replaced by stars at their real 3D places
  const far = mode.space && sp.pos.length() > 2.8e5 && !!s3dPts;
  if (far !== s3d.far) { s3d.far = far;
    if (starPoints) starPoints.visible = !far; if (exoPoints) exoPoints.visible = !far && $('t-exo').checked; if (dsoPoints) dsoPoints.visible = !far && $('t-dso').checked;
    boundsGroup.visible = !far && $('t-bounds').checked; if (far) { linesGroup.visible = false; koreanGroup.visible = false; } else applySkyCulture(); }
  if (s3dPts) s3dPts.visible = far;
  updateSystem();
  if (!far) return;
  const P = s3dPts.geometry.attributes.position, Mg = s3dPts.geometry.attributes.mag, k = 1 / Math.max(1e-12, sp.nearestAll || 1), R = 1e5 / k;
  const cx = sp.pos.x, cy = sp.pos.y, cz = sp.pos.z, a = P.array, m = Mg.array, sp3 = s3d.pos;
  for (let i = 0, n = s3d.absmag.length; i < n; i++) { const x = sp3[3 * i] - cx, y = sp3[3 * i + 1] - cy, z = sp3[3 * i + 2] - cz, d = Math.hypot(x, y, z) || 1e-9;
    a[3 * i] = x / d * R; a[3 * i + 1] = y / d * R; a[3 * i + 2] = z / d * R; m[i] = s3d.absmag[i] + 5 * Math.log10(d / PC) - 5;
    if (sysNow && Math.abs(x + cx - sysNow.pos.x) < 1 && Math.abs(y + cy - sysNow.pos.y) < 1) m[i] = 99; } // the visited star is drawn as a sphere
  P.needsUpdate = true; Mg.needsUpdate = true; s3dMat.uniforms.pr.value = renderer.getPixelRatio();
}
function starLabels() {
  galaxyLabels(); cometLabels();
  if (!s3d.far || !$('t-labels').checked) return;
  const m = s3dPts.geometry.attributes.mag.array, fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(sp.quat), cosLim = Math.cos(Math.min(85, view.fov * 0.75) * D2R), v = new THREE.Vector3();
  const lim = view.fov < 20 ? 3.5 : 1.6; let n = 0;
  for (let i = 0; i < m.length && n < 40; i++) { if (i && (m[i] > lim || !/^[A-Z\u3131-\uD79D]/.test(s3d.rows[i][0]) || /^(HIP|HYG|Gl|GJ|Wo|NN)/.test(s3d.rows[i][0]))) continue;
    v.set(s3d.pos[3 * i] - sp.pos.x, s3d.pos[3 * i + 1] - sp.pos.y, s3d.pos[3 * i + 2] - sp.pos.z).normalize(); if (v.dot(fwd) < cosLim) continue;
    const p = toScreen(v); if (p) { label(p[0], p[1], i ? s3d.rows[i][0] : '태양', i ? 'star' : 'planet'); n++; } }
}
// --- visiting a system: the star as a sphere, planets on circular orbits, the habitable zone ---
let sysNow = null; const sysGroup = new THREE.Group(); sysGroup.visible = false; planetGroup.add(sysGroup);
function exoSystem(o) {
  return { name: o.name, pos: eqVec(o.ra, o.dec, o.dist * PC), teff: o.teff, Rsun: o.srad, L: o.slum != null ? Math.pow(10, o.slum) : null, planets: o.planets, exo: o };
}
function visitSystem(s) {
  const teff = s.teff || teffOf(s.ci ?? 0.65), L = s.L ?? (s.M != null ? Math.pow(10, (4.83 - s.M) / 2.5) : 1);
  const Rsun = s.Rsun || Math.sqrt(L) * Math.pow(5772 / teff, 2);
  sysGroup.clear(); const col = new THREE.Color(...ciRGB(s.ci ?? (teff > 9000 ? -0.1 : teff > 6000 ? 0.4 : teff > 5000 ? 0.75 : teff > 3800 ? 1.2 : 1.6)));
  const starR = Rsun * 695700 / 1e6;
  const star = new THREE.Mesh(new THREE.SphereGeometry(starR, 48, 32), new THREE.MeshBasicMaterial({ color: col })); sysGroup.add(star);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); glow.scale.setScalar(starR * 6); glow.userData.R = starR; sysGroup.add(glow);
  // orbit plane: edge-on as seen from the Sun, the way transiting planets were found
  const los = s.pos.clone().normalize(), n = los.clone().cross(ECL_N).normalize(), u = los.clone().negate(), w = n.clone().cross(u).normalize();
  const ring = (rAU, color, op) => { const pts = []; for (let i = 0; i <= 128; i++) { const a = i / 128 * Math.PI * 2; pts.push(u.clone().multiplyScalar(Math.cos(a) * rAU * MKM_AU).addScaledVector(w, Math.sin(a) * rAU * MKM_AU)); }
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true, opacity: op })); l.frustumCulled = false; sysGroup.add(l); };
  const hz = [Math.sqrt(L / 1.1), Math.sqrt(L / 0.53)];
  for (let r = hz[0]; r <= hz[1]; r += (hz[1] - hz[0]) / 10) ring(r, 0x4fe3c1, 0.12);
  const planets = [];
  for (const p of s.planets) {
    const a = p[1] || (p[2] ? Math.cbrt(Math.pow(p[2] / 365.25, 2) * (L > 0 ? Math.pow(L, 0.25) : 1)) : null); if (!a) continue;
    const rE = p[3] || (p[4] ? Math.min(13, Math.pow(p[4], p[4] < 2 ? 0.27 : 0.55)) : 1), Teq = p[5] || 278 * Math.pow(L, 0.25) / Math.sqrt(a);
    const c = Teq > 1000 ? 0xff8a5c : Teq > 400 ? 0xd9b38c : Teq > 200 ? 0x6fa8dc : 0xb8d4e6;
    const m = new THREE.Mesh(new THREE.SphereGeometry(rE * 6371 / 1e6, 32, 20), new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, emissive: c, emissiveIntensity: 0.25 }));
    sysGroup.add(m); ring(a, 0x9aa5c0, 0.35); planets.push({ r: rE * 6371 / 1e6, m, a, P: p[2] || 365.25 * Math.sqrt(a ** 3), ph: (p[0].charCodeAt(0) * 2.39) % (Math.PI * 2), name: p[0] });
  }
  const amax = Math.max(hz[1], ...planets.map(p => p.a));
  const key = 'sys:' + s.name, body = { name: key, key, ko: s.name, R: Rsun * 695700, sys: true };
  sysNow = { ...s, pos: s.pos.clone(), key, body, planets, u, w, L, teff, hz };
  helioPos[key] = sysNow.pos; sysGroup.visible = true;
  const from = sp.pos.clone(), q0 = sp.quat.clone(), d1 = Math.max(starR * 8, amax * MKM_AU * 2.6);
  sp.flight = { p: body, from, q0, d1, t0: performance.now(), dur: 6000 }; sp.replay = null;
  // where is the Sun from there?
  const toSun = s.pos.clone().negate(), dpc = s.pos.length() / PC; let best = null, bd = -2;
  for (const r of s3d.rows) { if (!r[6] || Math.hypot(r[1], r[2], r[3]) < 40) continue; const d = (r[1] * toSun.x + r[2] * toSun.y + r[3] * toSun.z) / (Math.hypot(r[1], r[2], r[3]) * toSun.length()); if (d > bd) { bd = d; best = r[6]; } }
  const con = constById[best], sunMag = 4.83 + 5 * Math.log10(dpc) - 5;
  $('tour-pick').hidden = true; $('tour-body').hidden = false; $('tour-prev').hidden = $('tour-next').hidden = true;
  $('tour-step').textContent = `${s.name} · ${(dpc * 3.2616).toFixed(dpc < 3 ? 2 : 1)} 광년`;
  $('tour-text').textContent = `표면 온도 약 ${Math.round(teff).toLocaleString()} K, 반지름은 태양의 ${Rsun.toFixed(2)}배, 밝기는 태양의 ${L < 0.01 ? L.toExponential(1) : L.toFixed(L < 1 ? 3 : 1)}배입니다. `
    + (planets.length ? `행성 ${planets.length}개를 실제 궤도 반지름으로 그렸고 (궤도 기울기는 지구에서 볼 때 옆으로 누운 것으로 가정), ` : '')
    + `초록 띠는 액체 물이 있을 수 있는 생명 가능 지대(${hz[0].toFixed(2)}~${hz[1].toFixed(2)} AU)입니다. 이 별에서 태양은 ${con ? con.name : '알 수 없는 별자리'} 방향에 ${sunMag.toFixed(1)}등급 별로 보입니다${sunMag > 6.5 ? ' (맨눈으로 안 보임)' : ''}.`;
  $('tour').hidden = false; $('sp-target').textContent = `${s.name} 계`;
}
let _glow = null; function glowTex() { if (_glow) return _glow; const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.2, 'rgba(255,255,255,.5)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return (_glow = new THREE.CanvasTexture(c)); }
function updateSystem() {
  if (!sysNow || !mode.space) { sysGroup.visible = false; return; }
  helioPos[sysNow.key] = sysNow.pos; sysGroup.visible = true; sysGroup.position.copy(sysNow.pos).sub(sp.pos);
  const days = jd(state.time) - 2451545.0;
  for (const p of sysNow.planets) { const a = p.ph + days / p.P * Math.PI * 2; p.m.position.copy(sysNow.u).multiplyScalar(Math.cos(a) * p.a * MKM_AU).addScaledVector(sysNow.w, Math.sin(a) * p.a * MKM_AU);
    p.m.scale.setScalar(Math.max(1, sysNow.pos.clone().add(p.m.position).distanceTo(sp.pos) * Math.tan(view.fov * D2R) * 0.004 / p.r)); }
  const d = sysNow.pos.distanceTo(sp.pos), gl = sysGroup.children[1]; gl.scale.setScalar(Math.max(gl.userData.R * 6, d * Math.tan(view.fov * D2R) * 0.06));
  sp.nearestAll = Math.min(sp.nearestAll || 1e12, Math.max(1e-6, d - sysNow.body.R / 1e6) * 0.5);
}

// ---------- 21b. the Milky Way from outside (C3): a model galaxy built around the Sun's real place ----------
// Bar, bulge and four logarithmic arms (pitch 12 deg) in galactic coordinates; the Sun 8.2 kpc from the centre, 20 pc above the plane,
// between the Sagittarius and Perseus arms on the Orion spur. Drawn only once the camera is beyond ~1 kpc, where the sky photo stops making sense.
const KPC = 1000 * PC;
const GAL2EQ = new THREE.Matrix3().set(-0.0548755604, 0.4941094279, -0.8676661490, -0.8734370902, -0.4448296300, -0.1980763734, -0.4838350155, 0.7469822445, 0.4559837762);
const galToEq = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix3(GAL2EQ);
const galaxy = { pts: null, pos: null, w: null, center: galToEq(8.2 * KPC, 0, -0.02 * KPC), ngp: galToEq(0, 0, 1), labels: [] };
// Local Group members: name, RA, Dec (deg), distance (kpc), radius (kpc), inclination (deg, <0: spheroidal), points, position angle
const LOCAL_GROUP = [['대마젤란은하 (LMC)', 80.89, -69.76, 50, 4.5, 33, 2500, 170], ['소마젤란은하 (SMC)', 13.19, -72.83, 62, 2.5, -1, 1200, 0],
  ['안드로메다은하 (M31)', 10.68, 41.27, 765, 25, 77, 6000, 38], ['삼각형자리은하 (M33)', 23.46, 30.66, 840, 9, 55, 2500, 23],
  ['M32', 10.67, 40.87, 763, 1.2, -1, 300, 0], ['M110', 10.09, 41.69, 820, 2.5, -1, 400, 0], ['궁수자리 왜소은하', 283.76, -30.48, 26, 2.6, -1, 600, 0],
  ['포낙스 왜소은하', 39.99, -34.45, 147, 1.2, -1, 300, 0], ['NGC 6822 (바너드 은하)', 296.24, -14.80, 500, 1.5, -1, 400, 0], ['IC 1613', 16.20, 2.12, 730, 1.6, -1, 400, 0]];
function buildGalaxy() {
  let s = 20260830; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296), gau = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
  const N0 = MOBILE ? 14000 : 40000, LGN = LOCAL_GROUP.reduce((a, g) => a + g[6], 0), N = N0 + LGN, pos = new Float64Array(N * 3), col = new Float32Array(N * 3), w = new Float32Array(N);
  const pitch = 1 / Math.tan(12 * D2R), barA = Math.PI - 27 * D2R, armPhase = Math.PI - pitch * Math.log(6.9 / 4);
  for (let i = 0; i < N0; i++) { const u = rnd(); let X, Y, Z, cr, cg, cb, wt;
    if (u < 0.1) { X = gau() * 0.7; Y = gau() * 0.7; Z = gau() * 0.45; [cr, cg, cb] = [1, 0.84, 0.6]; wt = 1.6; } // bulge
    else if (u < 0.2) { const t = (rnd() * 2 - 1) * 4.2, q = gau() * 0.45; X = t * Math.cos(barA) - q * Math.sin(barA); Y = t * Math.sin(barA) + q * Math.cos(barA); Z = gau() * 0.25; [cr, cg, cb] = [1, 0.86, 0.64]; wt = 1.2; } // bar
    else { let r = Math.min(16, 1.6 - 3 * Math.log(1 - rnd() * 0.97)), th, arm = rnd() < 0.72;
      if (arm) { const k = Math.floor(rnd() * 4); th = armPhase + k * Math.PI / 2 + pitch * Math.log(r / 4); const off = gau() * 0.32; r += off; th += gau() * 0.04; }
      else th = rnd() * Math.PI * 2;
      if (rnd() < 0.015) { r = 8.3 + gau() * 0.25; th = Math.PI + (rnd() - 0.5) * 0.7; arm = true; } // the Orion spur, where the Sun is
      X = r * Math.cos(th); Y = r * Math.sin(th); Z = gau() * (arm ? 0.1 : 0.22);
      const hii = arm && rnd() < 0.04; [cr, cg, cb] = hii ? [1, 0.45, 0.55] : arm ? [0.66, 0.76, 1] : [0.96, 0.88, 0.74]; wt = hii ? 1.4 : arm ? 1 : 0.6; }
    const e = galToEq((X + 8.2) * KPC, Y * KPC, (Z - 0.02) * KPC); pos.set([e.x, e.y, e.z], i * 3); col.set([cr, cg, cb], i * 3); w[i] = wt; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('a', new THREE.Float32BufferAttribute(new Float32Array(N), 1));
  const m = new THREE.ShaderMaterial({ uniforms: { pr: { value: 1 } },
    vertexShader: `attribute vec3 color; attribute float a; varying vec3 vC; varying float vA; uniform float pr; void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); vC = color; vA = a; gl_PointSize = clamp(1.6 + a * 2.5, 1.2, 5.0) * pr; }`,
    fragmentShader: `varying vec3 vC; varying float vA; void main(){ vec2 p = gl_PointCoord * 2.0 - 1.0; float r2 = dot(p, p); if (r2 > 1.0 || vA <= 0.0) discard; gl_FragColor = vec4(vC * exp(-r2 * 3.0) * min(vA, 1.0), 1.0); }`,
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
  galaxy.pts = new THREE.Points(g, m); galaxy.pts.frustumCulled = false; galaxy.pts.renderOrder = -2; galaxy.pts.visible = false; planetScene.add(galaxy.pts); galaxy.pos = pos; galaxy.w = w;
  const L = (name, r, th) => galaxy.labels.push({ name, v: galToEq((r * Math.cos(th) + 8.2) * KPC, r * Math.sin(th) * KPC, -0.02 * KPC) }), A = (k, r) => armPhase + k * Math.PI / 2 + pitch * Math.log(r / 4);
  galaxy.labels.push({ name: '태양 (여기)', v: new THREE.Vector3() }, { name: '은하 중심 (궁수자리 A*)', v: galaxy.center.clone() });
  L('궁수자리 팔', 6.4, A(0, 6.4)); L('페르세우스 팔', 11, A(1, 11)); L('방패-센타우루스 팔', 6, A(3, 6)); L('바깥 팔', 14, A(2, 14)); L('오리온 지선', 8.6, Math.PI - 0.35);
}
function updateGalaxy() {
  const d = mode.space ? sp.pos.length() : 0, f = Math.max(0, Math.min(1, (d - 0.6 * KPC) / (2.4 * KPC)));
  if (!f) { if (galaxy.pts) { galaxy.pts.visible = false; planetGroup.visible = true; } return; }
  if (!galaxy.pts) buildGalaxy();
  const P = galaxy.pts.geometry.attributes.position, A = galaxy.pts.geometry.attributes.a, k = 1 / Math.max(1e-12, sp.nearestAll || 1), R = 1e5 / k, s = galaxy.pos;
  const cx = sp.pos.x, cy = sp.pos.y, cz = sp.pos.z, ref = 20 * KPC, boost = Math.max(1, (d / (60 * KPC)) ** 1.2); // whole galaxies stay visible from far out
  for (let i = 0, n = galaxy.w.length; i < n; i++) { const x = s[3 * i] - cx, y = s[3 * i + 1] - cy, z = s[3 * i + 2] - cz, dd = Math.hypot(x, y, z) || 1;
    P.array[3 * i] = x / dd * R; P.array[3 * i + 1] = y / dd * R; P.array[3 * i + 2] = z / dd * R; A.array[i] = f * galaxy.w[i] * Math.min(2.5, (ref / dd) ** 1.2 * boost) * 0.55; }
  P.needsUpdate = true; A.needsUpdate = true; galaxy.pts.material.uniforms.pr.value = renderer.getPixelRatio(); galaxy.pts.visible = true;
  planetGroup.visible = f < 0.5; // the Sun's glow and the planets shrink to nothing at galactic scale
  if (s3dPts && f > 0.5) s3dPts.visible = false; // the nearby-star catalogue collapses into one bright dot from out here
  sp.nearestAll = Math.min(sp.nearestAll || 1e12, d * 0.01);
}
function galaxyLabels() {
  if (!galaxy.pts?.visible || !$('t-labels').checked) return;
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(sp.quat), v = new THREE.Vector3();
  for (const l of galaxy.labels) { v.copy(l.v).sub(sp.pos).normalize(); if (v.dot(fwd) < 0.2) continue; const p = toScreen(v); if (p) label(p[0], p[1], l.name, l.name.startsWith('태양') ? 'planet' : 'const'); }
}
function visitLocalGroup() {
  const body = { name: 'galaxy', key: 'galaxy', ko: '국부은하군', R: 1, sys: true, gal: true };
  helioPos.galaxy = eqVec(10.68, 41.27, 765 * KPC).add(galaxy.center).multiplyScalar(0.5); sp.target = null; // aim between the Milky Way and Andromeda
  sp.flight = { p: body, from: sp.pos.clone(), q0: sp.quat.clone(), d1: 1000 * KPC, t0: performance.now(), dur: 11000, gal: true }; sp.replay = null;
  $('status').textContent = '국부은하군 밖으로: 우리 은하, 안드로메다(250만 광년), 삼각형자리은하와 마젤란은하들이 실제 방향과 거리에 있습니다';
}
function visitGalaxy() {
  const body = { name: 'galaxy', key: 'galaxy', ko: '우리 은하', R: 1, sys: true, gal: true };
  helioPos.galaxy = galaxy.center; sp.target = null;
  sp.flight = { p: body, from: sp.pos.clone(), q0: sp.quat.clone(), d1: 42 * KPC, t0: performance.now(), dur: 9000, gal: true }; sp.replay = null;
  $('status').textContent = '우리 은하 밖으로 나가는 중 · 약 13만 7천 광년 위에서 내려다봅니다 (은하 모형: 막대, 팽대부, 나선팔 4개)';
}

// ---------- C1. today's Earth: yesterday's full-globe VIIRS true-colour mosaic from NASA GIBS (public domain), gaps filled from the base map ----------
let liveEarthTex = null, liveEarthDate = '';
async function setLiveEarth(on) {
  const earth = PLANETS.find(p => p.name === 'Earth'); if (!earth?.mesh) return;
  const u = earth.mesh.material.uniforms;
  if (!on) { if (earth.baseMap) u.map.value = earth.baseMap; if (earth.clouds) earth.clouds.visible = true; return; }
  const day = new Date(Date.now() - 86400e3).toISOString().slice(0, 10);
  if (!liveEarthTex || liveEarthDate !== day) {
    $('status').textContent = `${day} 위성 사진을 받는 중 (NASA GIBS)…`;
    const load = (src) => new Promise((ok, no) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => ok(im); im.onerror = no; im.src = src; });
    try {
      const [live, base] = await Promise.all([load(`https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=VIIRS_SNPP_CorrectedReflectance_TrueColor&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH=2048&HEIGHT=1024&FORMAT=image/jpeg&TIME=${day}`), load('textures/2k_earth_daymap.jpg')]);
      const cv = document.createElement('canvas'); cv.width = 2048; cv.height = 1024; const g = cv.getContext('2d'); g.drawImage(base, 0, 0, 2048, 1024); const B = g.getImageData(0, 0, 2048, 1024);
      g.drawImage(live, 0, 0, 2048, 1024); const L = g.getImageData(0, 0, 2048, 1024);
      for (let i = 0; i < L.data.length; i += 4) if (L.data[i] + L.data[i + 1] + L.data[i + 2] < 18) { L.data[i] = B.data[i]; L.data[i + 1] = B.data[i + 1]; L.data[i + 2] = B.data[i + 2]; } // polar night / swath gaps
      g.putImageData(L, 0, 0); liveEarthTex = new THREE.CanvasTexture(cv); liveEarthTex.colorSpace = THREE.SRGBColorSpace; liveEarthTex.anisotropy = 8; liveEarthDate = day;
    } catch { $('status').textContent = '위성 사진을 받지 못했습니다. 기본 지도를 씁니다.'; $('t-live').checked = false; return; }
  }
  if (!$('t-live').checked) return;
  earth.baseMap ||= u.map.value; u.map.value = liveEarthTex; if (earth.clouds) earth.clouds.visible = false;
  $('status').textContent = `오늘의 지구: ${liveEarthDate} VIIRS 위성 사진 (NASA GIBS) · 구름이 실제 그날의 모습`;
}
$('t-live').onchange = () => setLiveEarth($('t-live').checked);
// ---------- A5. aurora from NOAA's OVATION forecast (30-90 min ahead, public domain): an oval on the night side of the Earth, a glow in the ground sky ----------
const aurora = { grid: null, t: 0, mesh: null, tex: null, best: null };
async function fetchAurora() {
  if (aurora.loading || Date.now() - aurora.t < 30 * 60e3) return; aurora.loading = true;
  try { const js = await fetch('https://services.swpc.noaa.gov/json/ovation_aurora_latest.json').then(r => r.json());
    const g = new Float32Array(360 * 181); for (const [lo, la, v] of js.coordinates) g[(la + 90) * 360 + lo] = v; aurora.grid = g; aurora.t = Date.now(); aurora.when = js['Forecast Time'];
    const cv = document.createElement('canvas'); cv.width = 360; cv.height = 181; const x = cv.getContext('2d'), im = x.createImageData(360, 181);
    for (let la = -90; la <= 90; la++) for (let lo = 0; lo < 360; lo++) { const v = Math.min(1, g[(la + 90) * 360 + lo] / 40), px = ((90 - la) * 360 + (lo + 180) % 360) * 4;
      im.data[px] = 60 + 195 * Math.max(0, v - 0.7) / 0.3; im.data[px + 1] = 255; im.data[px + 2] = 120; im.data[px + 3] = 255 * v; }
    x.putImageData(im, 0, 0);
    if (aurora.tex) aurora.tex.dispose(); aurora.tex = new THREE.CanvasTexture(cv); aurora.tex.colorSpace = THREE.SRGBColorSpace;
    if (aurora.mesh) aurora.mesh.material.uniforms.map.value = aurora.tex;
  } catch {} aurora.loading = false;
}
function updateAurora() {
  const on = $('t-aurora').checked; if (on) fetchAurora();
  const earth = PLANETS.find(p => p.name === 'Earth'); if (!earth?.mesh) return;
  if (on && aurora.tex && !aurora.mesh) {
    const m = new THREE.ShaderMaterial({ uniforms: { map: { value: aurora.tex }, sunDir: earth.mesh.material.uniforms.sunDir },
      vertexShader: `#include <common>
        #include <logdepthbuf_pars_vertex>
        varying vec2 vUv; varying vec3 vN; void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
        }`,
      fragmentShader: `#include <logdepthbuf_pars_fragment>
        uniform sampler2D map; uniform vec3 sunDir; varying vec2 vUv; varying vec3 vN; void main(){
        #include <logdepthbuf_fragment>
        vec4 t = texture2D(map, vUv); float night = smoothstep(0.15, -0.25, dot(normalize(vN), sunDir)); gl_FragColor = vec4(t.rgb * t.a * night * 1.4, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    aurora.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 48), m); aurora.mesh.scale.setScalar(1.018); aurora.mesh.renderOrder = 7; earth.mesh.add(aurora.mesh);
  }
  if (aurora.mesh) aurora.mesh.visible = on && mode.space;
}
function updateAuroraGround(u) { // strongest aurora within ~1,100 km: how high above which horizon it shows
  u.aurK.value = 0; if (!$('t-aurora').checked || !aurora.grid) return;
  const la0 = state.lat * D2R, lo0 = state.lon * D2R; let best = 0, bd = 0, baz = 0;
  for (let la = Math.max(-90, Math.round(state.lat) - 12); la <= Math.min(90, Math.round(state.lat) + 12); la++) for (let dl = -25; dl <= 25; dl++) {
    const lo = ((Math.round(state.lon) + dl) % 360 + 360) % 360, v = aurora.grid[(la + 90) * 360 + lo]; if (v < 4) continue;
    const la1 = la * D2R, lo1 = lo * D2R, cd = Math.sin(la0) * Math.sin(la1) + Math.cos(la0) * Math.cos(la1) * Math.cos(lo1 - lo0), d = Math.acos(Math.min(1, cd)) * 6371;
    if (d > 1100) continue; const s = v * (1 - d / 1100); if (s > best) { best = s; bd = d;
      baz = Math.atan2(Math.sin(lo1 - lo0) * Math.cos(la1), Math.cos(la0) * Math.sin(la1) - Math.sin(la0) * Math.cos(la1) * Math.cos(lo1 - lo0)); } }
  if (!best) return;
  const elev = Math.max(0.03, Math.atan2(150, Math.max(1, bd)) - bd / (2 * 6371));  // curtain at ~150 km seen from bd km away
  u.aurK.value = Math.min(1, best / 25) * 0.35; u.aurH.value = Math.min(1.2, elev + 0.05); u.aurDir.value.set(Math.sin(baz), 0, -Math.cos(baz));
}
// ---------- A4. light pollution from satellite night lights: NASA Black Marble (VIIRS, public domain) via GIBS ----------
// Sky glow at a point ~ sum of every light within ~110 km weighted by distance^-2.5 (Walker's law); log10 of that sum is calibrated to the Bortle scale
// on known places (central Seoul 9, Yangpyeong ~6, Bohyeonsan Observatory ~3, Atacama 1).
const BORTLE_CUT = [1.1, 0.9, 0.7, 0.45, 0.15, -0.3, -1.0, -2.0];
const bortleOf = (s) => { const L = Math.log10(Math.max(1e-9, s)); let b = 9; for (const t of BORTLE_CUT) { if (L >= t) return b; b--; } return 1; };
async function autoBortle() {
  const lat = state.lat, lon = state.lon; $('status').textContent = '위성 야간 사진으로 하늘 밝기를 재는 중 (NASA Black Marble)…';
  let im; try { im = await createImageBitmap(await (await fetch(`https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=VIIRS_Black_Marble&CRS=EPSG:4326&BBOX=${lat - 1},${lon - 1},${lat + 1},${lon + 1}&WIDTH=256&HEIGHT=256&FORMAT=image/png&TIME=2016-01-01`)).blob()); }
  catch { $('status').textContent = '야간 사진을 받지 못했습니다'; return; }
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const g = cv.getContext('2d'); g.drawImage(im, 0, 0); const d = g.getImageData(0, 0, 256, 256).data;
  const r = new Float32Array(256 * 256); for (let i = 0; i < r.length; i++) { const L = (0.3 * d[4 * i] + 0.59 * d[4 * i + 1] + 0.11 * d[4 * i + 2]) / 255; r[i] = Math.max(0, L - 0.16) ** 2.2; }
  const kx = 222 * Math.cos(lat * D2R) / 256, ky = 222 / 256;
  const lit = []; for (let i = 0; i < r.length; i++) if (r[i] > 1e-5) lit.push((i % 256) * kx, Math.floor(i / 256) * ky, r[i]); // only lit pixels count
  const glow = (cx, cy) => { let s = 0; const X = cx * kx, Y = cy * ky; for (let k = 0; k < lit.length; k += 3) { const d2 = Math.max(1, (lit[k] - X) ** 2 + (lit[k + 1] - Y) ** 2); s += lit[k + 2] * d2 ** -1.25; } return s; };
  const here = bortleOf(glow(127.5, 127.5));
  // a darker place within ~80 km: sample a coarse grid on land and keep the nearest spot at least two classes darker (or class 3)
  let best = null;
  for (let gy = 16; gy <= 240; gy += 16) for (let gx = 16; gx <= 240; gx += 16) { const dk = Math.hypot((gx - 127.5) * kx, (gy - 127.5) * ky); if (dk > 80 || dk < 8) continue;
    const L = (0.3 * d[4 * (gy * 256 + gx)] + 0.59 * d[4 * (gy * 256 + gx) + 1]) / 255; if (L < 0.09) continue; // skip sea (darker than land in this rendering)
    const b = bortleOf(glow(gx, gy)); if (b < here && b <= Math.max(3, here - 2) && (!best || dk < best.dk)) best = { b, dk, la: lat + (127.5 - gy) * 2 / 256, lo: lon + (gx - 127.5) * 2 / 256, az: Math.atan2((gx - 127.5) * kx, (127.5 - gy) * ky) * R2D }; }
  $('bortle').value = String(here); $('bortle').dispatchEvent(new Event('change'));
  const dir = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'][Math.round(((best?.az ?? 0) + 360) % 360 / 45) % 8];
  $('status').textContent = `위성 야간 사진으로 판정한 광공해: ${here}단계` + (best ? ` · 가장 가까운 더 어두운 곳(${best.b}단계): ${dir}쪽 약 ${Math.round(best.dk)} km (${best.la.toFixed(2)}°, ${best.lo.toFixed(2)}°)` : ' · 80 km 안에 확실히 더 어두운 곳이 없습니다');
}
$('lp-auto').onclick = () => autoBortle();
// ---------- B6. pass alerts: a notification a few minutes before a satellite rises (while this page is open) ----------
const alerts = new Map();
async function togglePassAlert(o, ps, btn) {
  if (alerts.has(o.id)) { clearTimeout(alerts.get(o.id)); alerts.delete(o.id); btn.textContent = '다음 통과 5분 전에 알림'; return; }
  if (Notification.permission !== 'granted' && await Notification.requestPermission() !== 'granted') { $('status').textContent = '브라우저 알림이 허용되지 않았습니다'; return; }
  const p = ps.find(q => q.rise > Date.now() + 60e3); if (!p) return;
  const wait = Math.max(0, p.rise - 5 * 60e3 - Date.now()), hm = (t) => new Date(t).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', hour12: false });
  alerts.set(o.id, setTimeout(() => { alerts.delete(o.id); new Notification(`${o.name} 곧 지나갑니다`, { body: `${hm(p.rise)}에 떠서 최고 고도 ${p.max.toFixed(0)}°까지 올라갑니다${p.lit && p.dark ? ' (맨눈으로 보일 수 있음)' : ''}`, icon: 'assets/sc-mark.svg?v=3' }); }, wait));
  btn.textContent = '통과 알림 끄기'; $('status').textContent = `${o.name}: ${hm(p.rise - 5 * 60e3)}에 알림 (이 페이지가 열려 있는 동안)`;
}

// ---------- B4. observing log: each observation with date, place, equipment, notes and a photo; kept in IndexedDB, exported as JSON or CSV ----------
const logDB = new Promise((ok, no) => { try { const r = indexedDB.open('space-commons-log', 1); r.onupgradeneeded = () => r.result.createObjectStore('obs', { keyPath: 'id', autoIncrement: true }); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); } catch (e) { no(e); } });
const logTx = async (mode, fn) => { const db = await logDB; return new Promise((ok, no) => { const t = db.transaction('obs', mode), s = t.objectStore('obs'), r = fn(s); t.oncomplete = () => ok(r?.result); t.onerror = () => no(t.error); }); };
async function addLog(o) {
  const es = $('eyepiece'); const rec = { target: objLabel(o), key: objKey(o), time: state.time, saved: Date.now(), lat: state.lat, lon: state.lon, bortle: +$('bortle').value,
    gear: es.value === 'custom' ? `${$('g-ap').value}mm f/${(+$('g-fl').value / +$('g-ap').value).toFixed(1)}, ${$('g-ep').value}mm 접안` : es.options[es.selectedIndex].text, note: '', photo: null };
  await logTx('readwrite', s => s.add(rec)); renderLog();
}
async function renderLog() {
  const all = (await logTx('readonly', s => s.getAll()).catch(() => [])) || [], box = $('log-list'); box.innerHTML = '';
  $('log-sub').textContent = all.length ? `기록 ${all.length}개 · 이 브라우저에만 저장됩니다` : '천체를 고르고 정보창의 "관측 기록 남기기"를 누르세요';
  for (const r of all.slice().reverse()) {
    const li = document.createElement('li'), d = new Date(r.time).toLocaleString(LOCALE, { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
    li.innerHTML = `<b>${r.target}</b> <span class="small">${d} · ${r.lat.toFixed(2)}°, ${r.lon.toFixed(2)}° · 광공해 ${r.bortle}단계 · ${r.gear}</span>`;
    const note = document.createElement('textarea'); note.placeholder = '본 것, 하늘 상태, 스케치 설명'; note.value = r.note || ''; note.onchange = () => { r.note = note.value; logTx('readwrite', s => s.put(r)); };
    const ph = document.createElement('input'); ph.type = 'file'; ph.accept = 'image/*'; ph.onchange = async () => { const f = ph.files[0]; if (!f) return; // keep photos small: 1200 px JPEG
      const bm = await createImageBitmap(f), k = Math.min(1, 1200 / Math.max(bm.width, bm.height)), cv = document.createElement('canvas'); cv.width = bm.width * k; cv.height = bm.height * k; cv.getContext('2d').drawImage(bm, 0, 0, cv.width, cv.height);
      r.photo = cv.toDataURL('image/jpeg', 0.8); await logTx('readwrite', s => s.put(r)); renderLog(); };
    const del = document.createElement('button'); del.textContent = '삭제'; del.onclick = async () => { await logTx('readwrite', s => s.delete(r.id)); renderLog(); };
    li.append(note); if (r.photo) { const im = document.createElement('img'); im.src = r.photo; im.className = 'log-photo'; li.append(im); }
    const row = document.createElement('div'); row.className = 'row'; row.append(ph, del); li.append(row); box.append(li);
  }
  $('log').hidden = false;
}
async function exportLog(kind) {
  const all = (await logTx('readonly', s => s.getAll())) || []; let blob, name;
  if (kind === 'csv') { const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    blob = new Blob(['\ufeff날짜,천체,위도,경도,광공해,장비,메모\n' + all.map(r => [new Date(r.time).toISOString(), r.target, r.lat, r.lon, r.bortle, r.gear, r.note].map(q).join(',')).join('\n')], { type: 'text/csv' }); name = 'space-commons-log.csv'; }
  else { blob = new Blob([JSON.stringify(all, null, 1)], { type: 'application/json' }); name = 'space-commons-log.json'; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
$('log-btn').onclick = () => $('log').hidden ? renderLog() : ($('log').hidden = true);
$('log-close').onclick = () => $('log').hidden = true;
$('log-json').onclick = () => exportLog('json'); $('log-csv').onclick = () => exportLog('csv');
$('log-add').onclick = () => { if (selected) addLog(selected).then(() => { $('status').textContent = `${objLabel(selected)} 관측 기록을 남겼습니다`; }); };

// ---------- B5. variable-star estimates, exported in the AAVSO Visual File Format ----------
const VSTARS = { Algol: 'bet Per', Mira: 'omi Cet', Betelgeuse: 'alf Ori', 'Delta Cephei': 'del Cep', Polaris: 'alf UMi', Antares: 'alf Sco', 'R Leonis': 'R Leo', 'Chi Cygni': 'chi Cyg', 'Eta Aquilae': 'eta Aql', 'Zeta Geminorum': 'zet Gem', 'Mu Cephei': 'mu Cep', 'Rasalgethi': 'alf Her' };
const VS_KEY = 'space-commons-varstar';
function varStarBox(o) { // shown in the star panel when the star is a known variable
  const name = starData.proper[o.i]; const id = VSTARS[name]; if (!id) return null;
  const box = document.createElement('div'); box.className = 'vs-box';
  box.innerHTML = `<b>변광성 밝기 기록 (${id})</b><div class="small">비교성 두 개와 견줘 눈으로 어림한 등급을 적습니다. 국제 변광성 관측자 협회(AAVSO) 형식으로 내보낼 수 있습니다.</div>
    <div class="row"><input type="number" step="0.1" placeholder="어림 등급" class="vs-mag"><input placeholder="비교성1 (예: 21)" class="vs-c1"><input placeholder="비교성2" class="vs-c2"><button class="vs-save">기록</button><button class="vs-exp">AAVSO 파일</button></div><div class="small vs-n"></div>`;
  const load = () => { try { return JSON.parse(localStorage.getItem(VS_KEY)) || []; } catch { return []; } };
  const show = () => { const l = load().filter(x => x.id === id); box.querySelector('.vs-n').textContent = l.length ? `이 별 기록 ${l.length}개 · 마지막 ${l[l.length - 1].mag}등급` : ''; };
  box.querySelector('.vs-save').onclick = () => { const m = parseFloat(box.querySelector('.vs-mag').value); if (!isFinite(m)) return;
    const l = load(); l.push({ id, jd: jd(state.time), mag: m, c1: box.querySelector('.vs-c1').value, c2: box.querySelector('.vs-c2').value }); try { localStorage.setItem(VS_KEY, JSON.stringify(l)); } catch {} show(); };
  box.querySelector('.vs-exp').onclick = () => { const l = load(); if (!l.length) return;
    const txt = ['#TYPE=VISUAL', '#OBSCODE=XXXX', '#SOFTWARE=Space Commons', '#DELIM=,', '#DATE=JD', '#OBSTYPE=Visual', '#NAME,DATE,MAG,COMMENTCODE,COMP1,COMP2,CHART,NOTES',
      ...l.map(r => [r.id, r.jd.toFixed(4), r.mag.toFixed(1), 'na', r.c1 || 'na', r.c2 || 'na', 'na', 'na'].join(','))].join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain' })); a.download = 'aavso-visual.txt'; a.click(); };
  show(); return box;
}
// ---------- A6. solar eclipse map: the Moon's shadow swept over the Earth, the path of totality, and the eclipse seen from here ----------
const R_SUN_AU = 695700 / KM_AU, R_MOON_AU = 1737.4 / KM_AU;
function obscAt(ms, g, lat, lon) { // fraction of the Sun covered, seen from (lat, lon) at time ms (g = geoAt(ms)); -1 if the Sun is below the horizon
  const ob = observerEcl(ms, lat, lon), s = g.Sun.clone().sub(ob), m = g.Moon.clone().sub(ob);
  if (s.dot(ob) <= 0) return -1;
  const sep = Math.acos(Math.max(-1, Math.min(1, s.clone().normalize().dot(m.clone().normalize()))));
  return diskOverlap(sep, Math.asin(R_SUN_AU / s.length()), Math.asin(R_MOON_AU / m.length()));
}
function greatestEclipse(dateStr) { // geocentric minimum of Sun-Moon separation within the day
  let best = 0, bs = 9; const t0 = Date.parse(dateStr + 'T00:00:00Z') - 6 * 3600e3;
  for (let t = t0; t < t0 + 36 * 3600e3; t += 5 * 60e3) { const g = geoAt(t), s = sepDeg(g.Sun, g.Moon); if (s < bs) { bs = s; best = t; } }
  return best;
}
async function eclipseMap(e) {
  const box = $('ecl'); box.hidden = false; $('ecl-title').textContent = `${e.date} ${e.kind}`; $('ecl-sub').textContent = '달 그림자를 계산하는 중…';
  await new Promise(r => setTimeout(r, 30));
  const tg = greatestEclipse(e.date), W = 360, H = 180, cv = $('ecl-map'), g2 = cv.getContext('2d'); cv.width = W * 2; cv.height = H * 2;
  const base = await new Promise((ok) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ok(null); im.src = 'textures/2k_earth_daymap.jpg'; });
  const maxO = new Float32Array(W / 2 * H / 2), total = new Uint8Array(W / 2 * H / 2), steps = [];
  for (let t = tg - 3.5 * 3600e3; t <= tg + 3.5 * 3600e3; t += 6 * 60e3) steps.push([t, geoAt(t)]);
  for (let j = 0; j < H / 2; j++) for (let i = 0; i < W / 2; i++) { const lat = 89 - j * 2, lon = -179 + i * 2; let m = 0;
    for (const [t, g] of steps) { const o = obscAt(t, g, lat, lon); if (o > m) m = o; } maxO[j * W / 2 + i] = m; if (m > 0.995) total[j * W / 2 + i] = 1; }
  if (base) g2.drawImage(base, 0, 0, W * 2, H * 2); g2.fillStyle = 'rgba(0,0,0,.12)'; g2.fillRect(0, 0, W * 2, H * 2);
  for (let j = 0; j < H / 2; j++) for (let i = 0; i < W / 2; i++) { const m = maxO[j * W / 2 + i]; if (m <= 0) continue;
    g2.fillStyle = total[j * W / 2 + i] ? 'rgba(76,141,246,.95)' : `rgba(8,8,30,${0.25 + 0.65 * m})`; g2.fillRect(i * 4, j * 4, 4, 4); }
    const ox = (state.lon + 180) * 2, oy = (90 - state.lat) * 2; g2.strokeStyle = '#fff'; g2.beginPath(); g2.arc(ox, oy, 5, 0, 7); g2.stroke();
  // the eclipse from here: contacts, maximum and how much of the Sun is covered
  let first = null, last = null, mx = 0, tmx = 0;
  for (let t = tg - 4 * 3600e3; t <= tg + 4 * 3600e3; t += 60e3) { const o = obscAt(t, geoAt(t), state.lat, state.lon); if (o > 0) { first ??= t; last = t; if (o > mx) { mx = o; tmx = t; } } }
  const hm = (t) => new Date(t).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', hour12: false });
  $('ecl-sub').textContent = first ? `여기(${state.lat.toFixed(1)}°, ${state.lon.toFixed(1)}°)에서: ${hm(first)} 시작 · ${hm(tmx)} 최대, 태양의 ${(mx * 100).toFixed(0)}% 가려짐${mx > 0.995 ? ' (개기)' : ''} · ${hm(last)} 끝`
    : `여기(${state.lat.toFixed(1)}°, ${state.lon.toFixed(1)}°)에서는 보이지 않습니다. 지도의 어두운 곳에서 부분식, 붉은 띠에서 ${e.kind === '금환일식' ? '금환식' : '개기식'}이 보입니다.`;
  $('ecl-go').onclick = () => { if (first) { state.time = tmx; $('ecl').hidden = true; select(planetObj(PLANETS[0])); flyTo(planetObj(PLANETS[0])); } };
  $('ecl-go').hidden = !first;
}
$('ecl-close').onclick = () => $('ecl').hidden = true;
// ---------- E4. history of astronomy in Korea: go back to that night's sky ----------
function goHistory(s) {
  setMode(false); $('t-ground').checked = true; [state.lat, state.lon] = s.at; $('lat').value = state.lat; $('lon').value = state.lon;
  state.time = Date.parse(s.date); state.speed = 0; document.querySelectorAll('[data-speed]').forEach(x => x.classList.remove('on'));
  if (s.culture) { $('skyculture').value = s.culture; applySkyCulture(); }
  view.az = s.az; view.alt = s.alt; view.fov = s.fov; updateSkyMatrix(); updatePlanets();
  if (s.target) { const t = s.target; const o = { kindName: 'hist', name: t.name, ra: t.ra, dec: t.dec, v: eqVec(t.ra, t.dec), mag: t.mag, note: t.note }; select(o); }
  else if (s.planet) { const mk = searchIndex.get(s.planet.toLowerCase()); if (mk) { const o = mk(); select(o); flyTo(o); } }
  $('status').textContent = `${new Date(state.time).toLocaleString(LOCALE, { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })} · ${s.note || s.target?.name || ''} · 시간 멈춤`;
}
$('hist-btn').onclick = async () => (await import('./history.js')).openHistory({ goTo: goHistory });
// ---------- E3. lesson links: a teacher packs the current scene with a goal and questions into one link; students answer and save a file ----------
const b64u = { enc: (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), ch => ch.charCodeAt(0))) };
function makeLesson() {
  const L = { title: $('ls-title').value.trim() || '오늘의 관측 수업', goal: $('ls-goal').value.trim(), qs: $('ls-qs').value.split('\n').map(s => s.trim()).filter(Boolean) };
  lessonParam = b64u.enc(JSON.stringify(L)); writeHash();
  setTimeout(() => { const url = location.href; $('ls-url').value = url; navigator.clipboard?.writeText(url).then(() => { $('status').textContent = '수업 링크를 복사했습니다'; }).catch(() => {}); }, 350);
}
function showLesson() {
  let L; try { L = JSON.parse(b64u.dec(lessonParam)); } catch { return; }
  const box = $('lesson'); box.hidden = false; $('lesson-title').textContent = L.title; $('lesson-goal').textContent = L.goal || '';
  const ol = $('lesson-qs'); ol.innerHTML = '';
  L.qs.forEach((q, i) => { const li = document.createElement('li'), ta = document.createElement('textarea'); li.append(Object.assign(document.createElement('div'), { textContent: q }), ta); ta.dataset.i = i; ol.append(li); });
  $('lesson-save').onclick = () => { const ans = [...ol.querySelectorAll('textarea')].map(t => t.value);
    const out = { lesson: L.title, student: $('lesson-name').value.trim(), saved: new Date().toISOString(), scene: location.hash, answers: L.qs.map((q, i) => ({ q, a: ans[i] })) };
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' })); a.download = `수업-${out.student || '이름없음'}.json`; a.click(); };
}
$('ls-btn').onclick = () => { $('ls').hidden = !$('ls').hidden; };
$('ls-close').onclick = () => $('ls').hidden = true; $('ls-make').onclick = makeLesson; $('lesson-close').onclick = () => $('lesson').hidden = true;
if (lessonParam) setTimeout(showLesson, 1500);
// ---------- C2. look through a spacecraft's camera: from its real position toward the nearest body, with the instrument's field of view ----------
const INSTR = { 'New Horizons': ['LORRI 망원 카메라', 0.29], 'Juno': ['JunoCam', 58], 'Voyager 1': ['ISS 협각 카메라', 0.42], 'Voyager 2': ['ISS 협각 카메라', 0.42],
  'Parker Solar Probe': ['WISPR 광시야 카메라', 95], 'Danuri': ['LUTI 고해상도 카메라', 0.7], JWST: ['NIRCam', 0.04], 'Europa Clipper': ['EIS 협각 카메라', 2.3], Juice: ['JANUS 카메라', 1.3],
  Lucy: ['L\'LORRI 카메라', 0.29], Psyche: ['다중분광 카메라', 4.6], BepiColombo: ['SIMBIO-SYS 협각', 1.5], 'Solar Orbiter': ['EUI 전면 카메라', 3.8], 'Pioneer 10': ['IPP 영상 편광계', 0.5], 'Pioneer 11': ['IPP 영상 편광계', 0.5] };
function probeCamera(p) {
  const pos = helioPos[p.name]; if (!pos) return;
  let best = null, bd = Infinity; for (const b of PLANETS) { if (b.probe || b === p || !helioPos[b.name] || (b.name === 'Sun' && p.name !== 'Parker Solar Probe' && p.name !== 'Solar Orbiter')) continue;
    const d = helioPos[b.name].distanceTo(pos) / Math.max(1, bodyR(b)); if (d < bd) { bd = d; best = b; } }
  if (!best) return; const [inst, fov] = INSTR[p.name] || ['카메라', 5];
  sp.flight = null; sp.target = null; sp.pos.copy(pos); sp.quat.copy(lookQuat(helioPos[best.name].clone().sub(pos).normalize())); view.fov = fov;
  const dist = helioPos[best.name].distanceTo(pos), ang = 2 * Math.atan(bodyR(best) / dist) * R2D;
  $('sp-target').textContent = `${p.ko}의 ${inst}`;
  $('status').textContent = `${p.ko} ${inst} (시야 ${fov}°)로 본 ${best.ko} · 거리 ${fmtDist(dist)} · ${best.ko}의 겉보기 크기 ${ang < 0.01 ? (ang * 3600).toFixed(1) + '″' : ang.toFixed(2) + '°'}${ang < fov * 0.02 ? ' (아직 점으로 보입니다)' : ''}`;
}
// ---------- C6. cinematic flight and recording: a smooth tour of the planets, and the screen saved as a video (MediaRecorder) ----------
let rec = null, tourTimer = null;
function toggleRecord() {
  if (rec) { rec.stop(); return; }
  if (!canvas.captureStream || !window.MediaRecorder) { $('status').textContent = '이 브라우저는 화면 녹화를 지원하지 않습니다'; return; }
  const chunks = [], type = ['video/webm;codecs=vp9', 'video/webm', 'video/mp4'].find(t => MediaRecorder.isTypeSupported(t)) || '';
  rec = new MediaRecorder(canvas.captureStream(30), type ? { mimeType: type, videoBitsPerSecond: 8e6 } : undefined);
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.onstop = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(chunks, { type: rec.mimeType })); a.download = `space-commons-${Date.now()}.${rec.mimeType.includes('mp4') ? 'mp4' : 'webm'}`; a.click(); rec = null; $('rec-btn').textContent = '녹화'; $('rec-btn').classList.remove('on'); };
  rec.start(500); $('rec-btn').textContent = '녹화 중지'; $('rec-btn').classList.add('on'); $('status').textContent = '녹화 중: 화면에 보이는 하늘이 영상으로 저장됩니다 (글자 표시는 빠짐)';
}
function cinematic() {
  if (tourTimer) { clearTimeout(tourTimer); tourTimer = null; $('cine-btn').classList.remove('on'); return; }
  if (!mode.space) setMode(true);
  const stops = ['Earth', 'Moon', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'].map(n => PLANETS.find(q => q.name === n)).filter(Boolean); let k = 0;
  $('cine-btn').classList.add('on');
  const next = () => { if (k >= stops.length) { tourTimer = null; $('cine-btn').classList.remove('on'); $('status').textContent = '자동 비행이 끝났습니다'; return; }
    const b = stops[k++]; flyTo(planetObj(b)); $('status').textContent = `자동 비행 ${k}/${stops.length}: ${b.ko}`; tourTimer = setTimeout(next, 11000); };
  next();
}
$('rec-btn').onclick = toggleRecord; $('cine-btn').onclick = cinematic;
// ---------- C5. stand on the surface at a landing site: eye 8 m up, looking at the horizon; Mars gets its sky (butterscotch dust by day, a blue glow round the Sun at dusk) ----------
const marsSkyMat = new THREE.ShaderMaterial({ uniforms: { up: { value: new THREE.Vector3(0, 1, 0) }, sunDir: { value: new THREE.Vector3(1, 0, 0) } },
  vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform vec3 up, sunDir; varying vec3 vD;
    void main(){ vec3 d = normalize(vD); float h = max(dot(d, up), 0.0), s = dot(sunDir, up), ct = dot(d, sunDir);
      float day = smoothstep(-0.18, 0.12, s);
      vec3 sky = mix(vec3(0.82, 0.6, 0.42), vec3(0.5, 0.36, 0.27), pow(h, 0.6));            // dust scatters red light everywhere
      vec3 halo = vec3(0.35, 0.55, 0.95) * exp((ct - 1.0) * 18.0) * (0.6 + 0.8 * (1.0 - smoothstep(0.0, 0.5, s)));  // fine dust sends blue forward, round the Sun
      vec3 col = (sky * day + halo * smoothstep(-0.25, 0.05, s)) * step(-0.02, dot(d, up));
      gl_FragColor = vec4(col, clamp(day * 0.92 + 0.6 * exp((ct - 1.0) * 18.0) * smoothstep(-0.25, 0.05, s), 0.0, 0.95)); }`,
  side: THREE.BackSide, depthTest: false, depthWrite: false, transparent: true });
const marsSky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), marsSkyMat); marsSky.renderOrder = -10; marsSky.frustumCulled = false; marsSky.visible = false; planetScene.add(marsSky);
let standing = null;
function standOn(site) {
  standing = site; const b = PLANETS.find(q => q.name === site.body);
  sp.flight = { p: site, from: sp.pos.clone(), q0: sp.quat.clone(), d1: 8e-9, t0: performance.now(), dur: 7000, site: true, stand: true }; sp.replay = null;
  $('status').textContent = `${site.ko}에 서는 중 · ${b.ko}의 ${b.name === 'Mars' ? '붉은 하늘과 푸른 노을' : b.name === 'Moon' ? '공기가 없어 낮에도 검은 하늘과 지구' : '하늘'}`;
}
function updateStanding() {
  const on = !!standing && mode.space && siteUp && standing.body === 'Mars'; marsSky.visible = on; if (!on) { if (standing && !siteUp && !sp.flight) standing = null; return; }
  const k = 1 / Math.max(1e-12, sp.nearestAll || 1); marsSky.scale.setScalar(5 / k); marsSky.position.set(0, 0, 0);
  marsSkyMat.uniforms.up.value.copy(siteUp); marsSkyMat.uniforms.sunDir.value.copy(helioPos.Mars).negate().normalize();
}
// ---------- B2. telescope control: LX200 commands over Web Serial (most go-to mounts), or ASCOM Alpaca over the network ----------
// Coordinates are sent as J2000 with precession to the date applied (mounts work in the equinox of date).
const scope = { port: null, writer: null, alpaca: '' };
function precessToDate(ra, dec, ms) { // IAU 1976 precession, rigorous enough for pointing (< 1')
  const T = (jd(ms) - 2451545) / 36525, z = (2306.2181 * T + 1.09468 * T * T) / 3600 * D2R, ze = (2306.2181 * T + 0.30188 * T * T) / 3600 * D2R, th = (2004.3109 * T - 0.42665 * T * T) / 3600 * D2R;
  const a = ra * D2R, d = dec * D2R, A = Math.cos(d) * Math.sin(a + ze), B = Math.cos(th) * Math.cos(d) * Math.cos(a + ze) - Math.sin(th) * Math.sin(d), C = Math.sin(th) * Math.cos(d) * Math.cos(a + ze) + Math.cos(th) * Math.sin(d);
  return { ra: ((Math.atan2(A, B) + z) * R2D + 360) % 360, dec: Math.asin(C) * R2D };
}
async function scopeConnectSerial() {
  if (!navigator.serial) { $('scope-st').textContent = '이 브라우저는 Web Serial을 지원하지 않습니다 (크롬·엣지 데스크톱에서 가능)'; return; }
  try { scope.port = await navigator.serial.requestPort(); await scope.port.open({ baudRate: +$('scope-baud').value }); scope.writer = scope.port.writable.getWriter(); $('scope-st').textContent = '직렬 포트 연결됨 (LX200 명령)'; }
  catch (e) { $('scope-st').textContent = '연결하지 못했습니다: ' + (e.message || e); }
}
async function scopeGoto(o) {
  if (!mode.space && PLANETS[0].world && worldOf(o).normalize().dot(PLANETS[0].world.clone().normalize()) > Math.cos(15 * D2R)) { $('scope-st').textContent = '태양에서 15° 안쪽이라 보내지 않습니다: 필터 없이 태양을 향하면 눈과 장비가 상합니다'; return; }
  const w = worldOf(o).applyMatrix4(new THREE.Matrix4().copy(sky.matrixWorld).invert()), { ra, dec } = vecToRaDec(w), p = precessToDate(ra, dec, state.time);
  if (scope.writer) { const pad = (n, k) => String(Math.floor(n)).padStart(k, '0'), h = p.ra / 15, dd = Math.abs(p.dec);
    const cmd = `:Sr${pad(h, 2)}:${pad((h % 1) * 60, 2)}:${pad(((h * 60) % 1) * 60, 2)}#:Sd${p.dec < 0 ? '-' : '+'}${pad(dd, 2)}*${pad((dd % 1) * 60, 2)}:${pad(((dd * 60) % 1) * 60, 2)}#:MS#`;
    await scope.writer.write(new TextEncoder().encode(cmd)); $('scope-st').textContent = `보냄: ${objLabel(o)} (${cmd})`; return; }
  if (scope.alpaca) { const base = scope.alpaca.replace(/\/$/, '') + '/api/v1/telescope/0/';
    try { const body = new URLSearchParams({ RightAscension: (p.ra / 15).toFixed(5), Declination: p.dec.toFixed(5), ClientID: '7', ClientTransactionID: String(Date.now() % 1e6) });
      const r = await fetch(base + 'slewtocoordinatesasync', { method: 'PUT', body }); const j = await r.json(); $('scope-st').textContent = j.ErrorNumber ? `망원경 오류: ${j.ErrorMessage}` : `${objLabel(o)}(으)로 움직이는 중 (Alpaca)`; }
    catch (e) { $('scope-st').textContent = 'Alpaca 서버에 닿지 못했습니다 (주소, CORS 허용 여부 확인)'; } return; }
  $('scope-st').textContent = '먼저 망원경을 연결하세요';
}
$('scope-serial').onclick = scopeConnectSerial;
$('scope-alpaca').onclick = () => { scope.alpaca = $('scope-url').value.trim(); $('scope-st').textContent = scope.alpaca ? `Alpaca 주소 설정: ${scope.alpaca}` : ''; };
$('scope-goto').onclick = () => { if (selected) scopeGoto(selected); else $('scope-st').textContent = '하늘에서 천체를 먼저 고르세요'; };
// ---------- E5. accessibility: large text, colour-blind-safe palette (Okabe-Ito blue/orange), less motion; remembered in this browser ----------
const A11Y_KEY = 'space-commons-a11y';
(function a11y() {
  let st = {}; try { st = JSON.parse(localStorage.getItem(A11Y_KEY)) || {}; } catch {}
  if (st.calm == null && matchMedia('(prefers-reduced-motion: reduce)').matches) st.calm = true;
  const apply = () => { document.body.classList.toggle('large', !!st.large); document.body.classList.toggle('cvd', !!st.cvd); document.body.classList.toggle('calm', !!st.calm);
    if (st.calm && $('t-twinkle')) $('t-twinkle').checked = false; try { localStorage.setItem(A11Y_KEY, JSON.stringify(st)); } catch {} };
  for (const [id, k] of [['a-large', 'large'], ['a-cvd', 'cvd'], ['a-calm', 'calm']]) { const el = $(id); if (!el) continue; el.checked = !!st[k]; el.onchange = () => { st[k] = el.checked; apply(); }; }
  apply();
})();
// ---------- proper motion: stars drift over centuries (HYG / Hipparcos, data/pm.json); constellation lines follow the stars they join ----------
const pm = { data: null, base: null, years: 0, lineMaps: new Map() };
fetch('data/pm.json').then(r => r.json()).then(j => { pm.data = j; }).catch(() => {});
const MAS = Math.PI / 180 / 3.6e6;
function lineMapFor(seg) { // which star each vertex of a line set sits on (within 0.2 degree), found once
  if (pm.lineMaps.has(seg)) return pm.lineMaps.get(seg);
  const P = seg.geometry.attributes.position, n = P.count, idx = new Int32Array(n).fill(-1), base = Float32Array.from(P.array), v = new THREE.Vector3(), lim = Math.cos(0.2 * D2R);
  for (let k = 0; k < n; k++) { v.fromBufferAttribute(P, k).normalize(); let best = lim;
    for (let i = 0; i < pm.base.length; i++) { if (starData.mag[i] > 6.5) continue; const b = pm.base[i], d = b.x * v.x + b.y * v.y + b.z * v.z; if (d > best) { best = d; idx[k] = i; } } }
  const m = { idx, base, R: Math.hypot(base[0], base[1], base[2]) }; pm.lineMaps.set(seg, m); return m;
}
function updateProperMotion() {
  if (!pm.data || !starPoints) return;
  const yrs = (jd(state.time) - 2451545) / 365.25; if (Math.abs(yrs - pm.years) < 20) return;
  if (!pm.base) pm.base = starData.pos.map(v => v.clone());
  pm.years = yrs; const P = starPoints.geometry.attributes.position, E = new THREE.Vector3(), N = new THREE.Vector3();
  for (let i = 0; i < pm.base.length; i++) { const v = pm.base[i], m = pm.data[starData.id[i]], out = starData.pos[i];
    if (!m) { out.copy(v); } else { const q = Math.hypot(v.x, v.y) || 1e-9; E.set(-v.y / q, v.x / q, 0); N.set(-v.z * v.x / q, -v.z * v.y / q, q);
      out.copy(v).addScaledVector(E, m[0] * MAS * yrs).addScaledVector(N, m[1] * MAS * yrs).normalize(); }
    P.setXYZ(i, out.x * R_SKY, out.y * R_SKY, out.z * R_SKY); }
  P.needsUpdate = true;
  for (const grp of [linesGroup, koreanGroup, ...Object.values(CULTURES).map(c => c.group)]) for (const seg of grp.children) { if (!seg.isLineSegments) continue;
    const m = lineMapFor(seg), A = seg.geometry.attributes.position;
    for (let k = 0; k < A.count; k++) { const s = m.idx[k]; if (s < 0) A.setXYZ(k, m.base[3 * k], m.base[3 * k + 1], m.base[3 * k + 2]); else { const o = starData.pos[s]; A.setXYZ(k, o.x * m.R, o.y * m.R, o.z * m.R); } }
    A.needsUpdate = true; }
}
// ---------- active comets in space mode: orbit, nucleus and a tail pointing away from the Sun (longer and brighter near perihelion) ----------
const cometGroup = new THREE.Group(); cometGroup.visible = false; planetGroup.add(cometGroup); let cometT = NaN;
function updateComets3d() {
  const on = mode.space && $('t-asteroids').checked && smallBodies.some(o => o.comet); cometGroup.visible = on; if (!on) return;
  cometGroup.position.copy(sp.pos).negate();
  if (Math.abs(state.time - cometT) < 3600e3 * 6 && cometGroup.children.length) return; cometT = state.time;
  cometGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); }); cometGroup.clear();
  const J = jd(state.time), toS = (v) => ecl2eq(v).multiplyScalar(MKM_AU);
  for (const o of smallBodies) { if (!o.comet || !(o.mag < 16)) continue;
    const [q, e] = o.el, pts = [], lim = e < 1 ? Math.PI : Math.acos(-1 / e) * 0.97, tp = o.el[5];
    for (let k = -120; k <= 120; k++) { const nu = lim * k / 120, r = q * (1 + e) / (1 + e * Math.cos(nu)); if (r > 12 || r < 0) continue;
      // position along the orbit from the true anomaly, using the same orientation as smallHelio
      const x = r * Math.cos(nu), y = r * Math.sin(nu), I = o.el[2] * D2R, O = o.el[3] * D2R, w = o.el[4] * D2R, cO = Math.cos(O), sO = Math.sin(O), ci = Math.cos(I), si = Math.sin(I), cw = Math.cos(w), sw = Math.sin(w);
      pts.push(toS(new THREE.Vector3((cw * cO - sw * sO * ci) * x + (-sw * cO - cw * sO * ci) * y, (cw * sO + sw * cO * ci) * x + (-sw * sO + cw * cO * ci) * y, sw * si * x + cw * si * y))); }
    if (pts.length > 1) { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x6fa8dc, transparent: true, opacity: 0.35 })); l.frustumCulled = false; cometGroup.add(l); }
    const h = smallHelio(o, J), r = h.length(), P = toS(h), away = P.clone().normalize(), len = Math.min(0.6, 0.25 / (r * r)) * MKM_AU;
    const tail = new THREE.Line(new THREE.BufferGeometry().setFromPoints([P, P.clone().addScaledVector(away, len)]), new THREE.LineBasicMaterial({ color: 0xbfe3ff, transparent: true, opacity: Math.min(0.9, 0.9 / r) }));
    tail.frustumCulled = false; cometGroup.add(tail);
    const dot = new THREE.Points(new THREE.BufferGeometry().setFromPoints([P]), new THREE.PointsMaterial({ color: 0xdff2ff, size: 4, sizeAttenuation: false })); dot.frustumCulled = false; dot.userData = { comet: o, pos: P }; cometGroup.add(dot); }
}
function cometLabels() {
  if (!cometGroup.visible || !$('t-labels').checked) return; const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(sp.quat), v = new THREE.Vector3();
  for (const d of cometGroup.children) { if (!d.userData.comet) continue; v.copy(d.userData.pos).sub(sp.pos).normalize(); if (v.dot(fwd) < 0.2) continue;
    const p = toScreen(v); if (p) label(p[0], p[1], d.userData.comet.name.replace(/\s*\(.*\)/, ''), 'small comet'); }
}
// ---------- top bar: the most used tools stay visible, the rest go into three menus (fixed pop-ups, so the scrolling bar on phones does not clip them) ----------
(function groupMenus() {
  const groups = [['관측', ['today-btn', 'obs-btn', 'exp-btn', 'night', 'gyro', 'ar']], ['배우기', ['tour-btn', 'cine-btn', 'sizes-btn', 'hist-btn', 'ls-btn']], ['저장·공유', ['share', 'shot', 'rec-btn', 'offline-btn', 'addon-btn', 'full']]];
  const tools = $('tools'), lang = $('lang'), pops = [];
  for (const [name, ids] of groups) {
    const wrap = document.createElement('div'), btn = document.createElement('button'), pop = document.createElement('div');
    wrap.className = 'menu'; btn.className = 'menu-btn'; btn.textContent = name + ' ▾'; btn.setAttribute('aria-haspopup', 'true'); pop.className = 'menu-pop'; pop.hidden = true; pop.setAttribute('role', 'menu');
    for (const id of ids) { const b = $(id); if (!b) continue; b.setAttribute('role', 'menuitem'); pop.append(b); b.addEventListener('click', () => { pop.hidden = true; }); }
    btn.onclick = (e) => { e.stopPropagation(); const open = pop.hidden; pops.forEach(q => q.hidden = true); if (!open) return; const r = btn.getBoundingClientRect();
      pop.style.left = Math.min(r.left, innerWidth - 200) + 'px'; pop.style.top = r.bottom + 4 + 'px'; pop.hidden = false; };
    wrap.append(btn); document.body.append(pop); pops.push(pop); tools.insertBefore(wrap, lang);
  }
  addEventListener('click', (e) => { if (!e.target.closest('.menu-pop')) pops.forEach(q => q.hidden = true); });
})();
// ---------- bottom panel: the everyday display switches stay, the rest fold into "more" ----------
(function foldToggles() {
  const keep = new Set(['t-ground', 't-refr', 't-lines', 't-labels', 't-mw', 't-orbits']), boxes = [...document.querySelectorAll('#panel input[type=checkbox]')];
  const labels = boxes.map(b => b.closest('label')).filter(Boolean), move = labels.filter(l => !keep.has(l.querySelector('input').id));
  if (!move.length) return; const host = move[0].parentElement, det = document.createElement('details'), sum = document.createElement('summary'), box = document.createElement('div');
  det.className = 'more-toggles'; sum.textContent = '더 많은 표시 설정'; box.className = 'row'; det.append(sum, box);
  for (const l of move) { const sel = l.nextElementSibling?.tagName === 'SELECT' ? l.nextElementSibling : null; box.append(l); if (sel) box.append(sel); }
  for (const id of ['mwstyle', 'wavelen', 'skyculture', 'csver']) { const s = $(id); if (s && !box.contains(s) && s.closest('#panel')) box.append(s); }
  host.parentElement.insertBefore(det, host.nextSibling);
})();
// ---------- first visit: a four-step guide, shown once (and again from the help line) ----------
const GUIDE = [['#c', '하늘 둘러보기', '끌어서 둘러보고, 휠이나 두 손가락으로 확대합니다. 별이나 행성을 누르면 설명이 나옵니다.'],
  ['#search', '찾기', '천체 이름(목성, M31, 시리우스)이나 좌표를 적으면 그쪽으로 갑니다.'],
  ['#modes', '세 가지 모드', '지상: 내가 선 곳의 밤하늘 · 우주: 태양계와 은하를 날아다니기 · 샌드박스: 행성과 별을 직접 만들어 보는 실험실'],
  ['#cards-btn', '배우기', '우주 알아보기에서 개념 카드와 확인 문제로 차근차근 배울 수 있습니다. 관측·배우기 메뉴에 더 많은 도구가 있습니다.']];
function showGuide(k = 0) {
  document.querySelector('.guide')?.remove(); if (k >= GUIDE.length) { try { localStorage.setItem('space-commons-guided', '1'); } catch {} return; }
  const [sel, t, d] = GUIDE[k], tgt = document.querySelector(sel), r = tgt?.getBoundingClientRect(), g = document.createElement('div'); g.className = 'guide';
  g.innerHTML = `<div class="guide-box"><b>${t}</b><p>${d}</p><div class="row"><span class="small">${k + 1} / ${GUIDE.length}</span><button class="g-skip">건너뛰기</button><button class="g-next">${k < GUIDE.length - 1 ? '다음' : '시작하기'}</button></div></div>`;
  document.body.append(g); const box = g.querySelector('.guide-box');
  if (r && sel !== '#c') { box.style.left = Math.max(8, Math.min(innerWidth - 300, r.left)) + 'px'; box.style.top = Math.min(innerHeight - 160, r.bottom + 10) + 'px'; tgt.classList.add('guide-hl'); setTimeout(() => tgt.classList.remove('guide-hl'), 4000); }
  g.querySelector('.g-next').onclick = () => showGuide(k + 1); g.querySelector('.g-skip').onclick = () => showGuide(GUIDE.length);
}
{ let seen = false; try { seen = !!localStorage.getItem('space-commons-guided'); } catch {} if (!seen && !location.hash.includes('lesson=')) setTimeout(() => showGuide(0), 2500); }
$('help')?.addEventListener('dblclick', () => showGuide(0));
// ---------- photo horizons: real 360-degree panoramas (ESO, CC BY 4.0) with the sky removed; choosing one also moves you there ----------
let LANDS = {}; fetch('data/landscapes.json').then(r => r.json()).then(j => { LANDS = j; const s = $('landsel'); for (const [k, v] of Object.entries(j)) s.append(new Option(v.ko, k)); }).catch(() => {});
$('landsel').onchange = () => {
  const k = $('landsel').value, u = groundMat.uniforms;
  if (!k) { u.usePhoto.value = 0; $('status').textContent = '지평선: 지형 자료로 그린 능선'; return; }
  const L = LANDS[k]; new THREE.TextureLoader().load(`textures/land_${k}.webp`, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; u.photo.value = t; u.north.value = (L.north || 0) * D2R; u.usePhoto.value = 1; });
  setMode(false); state.lat = L.lat; state.lon = L.lon; $('lat').value = L.lat; $('lon').value = L.lon; updateSkyMatrix();
  $('status').textContent = L.dem ? `${L.ko} (해발 ${L.elev} m) · 실제 지형으로 그린 360° 능선, 방위 정확 (${L.credit})` : `${L.ko} · 실제 360° 사진 지평선 (${L.credit}, ${L.licence}) · 사진 속 방위는 대략입니다`;
};
// ---------- A2. zoomable survey tiles: DSS2 colour HiPS (ESA ESASky mirror of CDS) on HEALPix nested tiles, finer as you zoom ----------
// Tile orientation was checked against bright stars (Betelgeuse 0.05 deg): image row runs along the HEALPix x axis, column along y.
const SURVEYS = { DSSColor: 9, '2MASSColor': 9, SDSS9Color: 10, AllWISEColor: 8 }; // HiPS max order of each survey
let HIPS = 'https://skies.esac.esa.int/DSSColor/'; const JRLL = [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4], JPLL = [1, 3, 5, 7, 0, 2, 4, 6, 1, 3, 5, 7];
const hips = { group: new THREE.Group(), tiles: new Map(), tex: new Map(), order: -1 }; sky.add(hips.group);
const interleave = (ix, iy) => { let r = 0; for (let b = 0; b < 15; b++) r += (((ix >> b) & 1) + 2 * ((iy >> b) & 1)) * 4 ** b; return r; };
function hpAng2Pix(order, v) { // v: unit vector in the equatorial frame
  const ns = 1 << order, z = v.z, za = Math.abs(z), phi = Math.atan2(v.y, v.x), tt = ((phi * 2 / Math.PI) % 4 + 4) % 4; let face, ix, iy;
  if (za <= 2 / 3) { const t1 = ns * (0.5 + tt), t2 = ns * z * 0.75, jp = Math.floor(t1 - t2), jm = Math.floor(t1 + t2), ifp = jp >> order, ifm = jm >> order;
    face = ifp === ifm ? (ifp | 4) : ifp < ifm ? ifp : ifm + 8; ix = jm & (ns - 1); iy = ns - (jp & (ns - 1)) - 1; }
  else { const ntt = Math.min(3, Math.floor(tt)), tp = tt - ntt, tmp = ns * Math.sqrt(3 * (1 - za)), jp = Math.min(Math.floor(tp * tmp), ns - 1), jm = Math.min(Math.floor((1 - tp) * tmp), ns - 1);
    if (z >= 0) { face = ntt; ix = ns - jm - 1; iy = ns - jp - 1; } else { face = ntt + 8; ix = jp; iy = jm; } }
  return face * ns * ns + interleave(ix, iy);
}
function hpFxy(face, x, y, R) { // HEALPix face coordinates to a point on the sky sphere
  const jr = JRLL[face] - x - y; let nr, z;
  if (jr < 1) { nr = jr; z = 1 - nr * nr / 3; } else if (jr > 3) { nr = 4 - jr; z = nr * nr / 3 - 1; } else { nr = 1; z = (2 - jr) * 2 / 3; }
  const t = (((JPLL[face] * nr + x - y) % 8) + 8) % 8, phi = nr < 1e-15 ? 0 : (Math.PI / 4 * t) / nr, s = Math.sqrt(Math.max(0, 1 - z * z));
  return new THREE.Vector3(R * s * Math.cos(phi), R * s * Math.sin(phi), R * z);
}
const hipsMat = (tex) => new THREE.ShaderMaterial({ uniforms: { map: { value: tex }, op: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D map; uniform float op; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(map, vUv).rgb * op, 1.0); }`,
  transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending });
function hipsTile(order, pix) {
  const key = order + '/' + pix; if (hips.tiles.has(key)) return hips.tiles.get(key);
  const ns = 1 << order, face = Math.floor(pix / (ns * ns)), ipf = pix % (ns * ns); let ix = 0, iy = 0;
  for (let b = 0; b < 15; b++) { ix |= ((Math.floor(ipf / 4 ** b) & 1) << b); iy |= ((Math.floor(ipf / (2 * 4 ** b)) & 1) << b); }
  const N = 8, pos = [], uv = [], idx = [], R = R_DSO - 10;
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) { const a = i / N, b = j / N, v = hpFxy(face, (ix + a) / ns, (iy + b) / ns, R); pos.push(v.x, v.y, v.z); uv.push(b, 1 - a); }
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const k = i * (N + 1) + j; idx.push(k, k + 1, k + N + 1, k + 1, k + N + 2, k + N + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  const m = new THREE.Mesh(g, hipsMat(null)); m.frustumCulled = false; m.renderOrder = 3; m.userData = { order, used: 0, ready: false }; hips.tiles.set(key, m); hips.group.add(m);
  new THREE.TextureLoader().load(`${HIPS}Norder${order}/Dir${Math.floor(pix / 10000) * 10000}/Npix${pix}.jpg`, (t) => { t.colorSpace = THREE.SRGBColorSpace; m.material.uniforms.map.value = t; m.userData.ready = true; }, undefined, () => { m.userData.failed = true; });
  return m;
}
let hipsLast = 0;
$('survey').onchange = () => { HIPS = `https://skies.esac.esa.int/${$('survey').value}/`; for (const [k, m] of hips.tiles) { hips.group.remove(m); m.geometry.dispose(); m.material.uniforms.map.value?.dispose(); } hips.tiles.clear();
  $('status').textContent = { DSSColor: '확대 사진: DSS2 컬러 (가시광, 온 하늘)', '2MASSColor': '확대 사진: 2MASS 근적외선 (먼지 너머의 별)', SDSS9Color: '확대 사진: SDSS 9 (더 선명, 북쪽 하늘 일부만)', AllWISEColor: '확대 사진: AllWISE 중적외선 (따뜻한 먼지와 별 탄생 지역)' }[$('survey').value]; };
function updateHips() {
  const on = $('t-photo').checked && view.fov < 20 && groundOn() !== null && !mode.space; hips.group.visible = on;
  const now = performance.now(); if (!on) return;
  const order = Math.max(3, Math.min(SURVEYS[$('survey').value] || 9, Math.round(Math.log2(innerHeight / view.fov * 58.6 / 512))));
  if (now - hipsLast > 250) { hipsLast = now; const inv = new THREE.Matrix4().copy(sky.matrixWorld).invert(), want = new Set();
    for (let sx = -1; sx <= 1.001; sx += 0.25) for (let sy = -1; sy <= 1.001; sy += 0.25) { const d = new THREE.Vector3(sx, sy, 0.5).unproject(camera).normalize().applyMatrix4(inv).normalize(); want.add(hpAng2Pix(order, d)); }
    for (const p of want) hipsTile(order, p).userData.used = now; }
  const fade = Math.max(0, Math.min(1, (20 - view.fov) / 8));
  for (const [key, m] of hips.tiles) { const cur = m.userData.order === order && now - m.userData.used < 1500, target = cur && m.userData.ready ? 0.9 * fade : 0;
    m.material.uniforms.op.value += (target - m.material.uniforms.op.value) * 0.1;
    if (!cur && m.material.uniforms.op.value < 0.01 && now - m.userData.used > 8000) { hips.group.remove(m); m.geometry.dispose(); m.material.uniforms.map.value?.dispose(); hips.tiles.delete(key); } }
}
// ---------- add-ons and presentation scripts: a JSON file from the user (see examples/addon-example.json) ----------
// { "name": "...", "objects": [{ "name", "ra" (deg), "dec" (deg), "note"? }], "script": [{ "t"?: "2027-08-02T08:00", "lat"?, "lon"?, "az"?, "alt"?, "fov"?, "o"?: object, "say": "...", "wait": s }] }
const addonPts = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: 0x7fb2ff, size: 7, sizeAttenuation: false, depthTest: false }));
addonPts.renderOrder = 5; sky.add(addonPts); const addonPos = [];
function loadAddon(j) {
  for (const o of j.objects || []) { if (!(o.ra >= 0 && o.ra < 360 && Math.abs(o.dec) <= 90)) continue;
    const obj = { kindName: 'coord', name: String(o.name).slice(0, 60), ra: o.ra, dec: o.dec, v: eqVec(o.ra, o.dec), note: o.note ? String(o.note).slice(0, 300) : '' };
    searchIndex.set(obj.name.toLowerCase().replace(/\s+/g, ''), () => obj); $('search-list').append(new Option('', obj.name)); addonPos.push(...obj.v.clone().multiplyScalar(90).toArray()); }
  addonPts.geometry.setAttribute('position', new THREE.Float32BufferAttribute(addonPos, 3)); addonPts.geometry.computeBoundingSphere();
  $('status').textContent = `애드온 "${j.name || '이름 없음'}": 천체 ${(j.objects || []).length}개${j.script ? `, 발표 ${j.script.length}단계` : ''}`;
  if (j.script && j.script.length) runScript(j.script);
}
let scriptRun = 0;
async function runScript(steps) {
  const id = ++scriptRun, cap = $('status');
  for (const [i, s] of steps.entries()) { if (id !== scriptRun) return;
    const q = new URLSearchParams(); for (const k of ['t', 'lat', 'lon', 'az', 'alt', 'fov', 'o']) if (s[k] != null) q.set(k, s[k]);
    if ([...q.keys()].length) { q.set('m', 'g'); location.hash = q.toString(); readHash(); updateSkyMatrix(); }
    if (s.o) { const mk = searchIndex.get(String(s.o).toLowerCase().replace(/\s+/g, '')); if (mk) { const o = mk(); select(o); flyTo(o); } }
    cap.textContent = `[${i + 1}/${steps.length}] ${String(s.say || '')}  (Esc: 멈춤)`;
    await new Promise(r => setTimeout(r, Math.min(600, Math.max(1, +s.wait || 6)) * 1000));
  }
  if (id === scriptRun) cap.textContent = '발표가 끝났습니다';
}
addEventListener('keydown', (e) => { if (e.key === 'Escape' && scriptRun) { scriptRun++; $('status').textContent = '발표를 멈췄습니다'; } });
$('addon-btn').onclick = () => { const f = document.createElement('input'); f.type = 'file'; f.accept = '.json,application/json';
  f.onchange = async () => { try { loadAddon(JSON.parse(await f.files[0].text())); } catch { $('status').textContent = '애드온 파일을 읽을 수 없습니다 (JSON 형식 확인)'; } }; f.click(); };
// ---------- offline: store the core pack (libraries, catalogues, textures, small models) in the service-worker cache in one go ----------
async function offlinePack() {
  if (!('caches' in window)) { $('status').textContent = '이 브라우저는 오프라인 저장을 지원하지 않습니다'; return; }
  const pack = await fetch('data/offline-pack.json').then(r => r.json()), cache = await caches.open('space-commons-pack'); // kept across service-worker updates
  let done = 0, bytes = 0; const list = ['./', 'index.html', ...pack.files], N = list.length;
  for (let i = 0; i < N; i += 6) { await Promise.all(list.slice(i, i + 6).map(async (f) => { try { const r = await fetch(f, { cache: 'reload' }); if (r.ok) { await cache.put(f, r.clone()); bytes += +(r.headers.get('content-length') || 0); } } catch {} done++; }));
    $('status').textContent = `오프라인용으로 받는 중 ${done}/${N} (${(bytes / 1e6).toFixed(0)} MB)`; }
  try { localStorage.setItem('space-commons-offline', new Date().toISOString()); } catch {}
  $('status').textContent = `오프라인에서도 쓸 수 있게 저장했습니다 (${N}개, 약 ${(pack.bytes / 1e6).toFixed(0)} MB). 실시간 자료는 마지막으로 받은 것을 씁니다.`;
}
$('offline-btn').onclick = () => offlinePack();
const NEEDS_NET = '인터넷 없음: 위성 목록, 오로라, 오늘의 지구, 날씨, 확대 사진은 마지막으로 받은 것만 보입니다';
addEventListener('offline', () => { $('status').textContent = NEEDS_NET; }); if (!navigator.onLine) setTimeout(() => { $('status').textContent = NEEDS_NET; }, 3000);
// ---------- 22. whole spacecraft journeys (S7) ----------
function journeyTimeline(p) {
  const box = $('info-exo'), ev = JOURNEYS[p.name], e = probeEph[p.name]; box.innerHTML = ''; box.hidden = false;
  const t0 = Date.parse(ev[0][0] + 'T12:00:00Z'), tEnd = e ? (e.jd0 + (e.xyz.length / 3 - 1) * e.step - 2440587.5) * 86400e3 : Date.now();
  const t1 = Math.max(tEnd, ...ev.map(x => Date.parse(x[0] + 'T12:00:00Z'))), X = (t) => 4 + (t - t0) / (t1 - t0) * 292;
  let svg = `<svg viewBox="0 0 300 34" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="여정 타임라인"><line x1="4" x2="296" y1="17" y2="17" stroke="#7d8aa8" stroke-opacity=".5"/>`;
  svg += `<line x1="4" x2="${Math.min(296, X(state.time)).toFixed(1)}" y1="17" y2="17" stroke="#8fb8c9" stroke-width="2"/>`;
  for (const [d, , f] of ev) { const t = Date.parse(d + 'T12:00:00Z'); svg += `<circle cx="${X(t).toFixed(1)}" cy="17" r="3.2" fill="${t > Date.now() ? '#ffb454' : '#8fb8c9'}"/>`; }
  const xn = X(state.time); if (xn >= 4 && xn <= 296) svg += `<line x1="${xn}" x2="${xn}" y1="8" y2="26" stroke="#fff" stroke-width="1.2"/>`;
  svg += `<text x="4" y="32" fill="#9aa5c0" font-size="8">${new Date(t0).getUTCFullYear()}</text><text x="296" y="32" fill="#9aa5c0" font-size="8" text-anchor="end">${new Date(t1).getUTCFullYear()}</text></svg>`;
  const h = document.createElement('div'); h.className = 'small'; h.textContent = '전체 여정 · 누르면 그 순간으로 이동 (초록: 지나온 길, 주황 점선: 앞으로의 예정 경로)';
  const wrap = document.createElement('div'); wrap.innerHTML = svg; box.append(h, wrap);
  const ul = document.createElement('ul'); ul.className = 'journey';
  for (const [d, title, focus] of ev) { const li = document.createElement('li'), b = document.createElement('button'), k = document.createElement('span'), t = Date.parse(d + 'T12:00:00Z');
    b.textContent = title; k.textContent = d; b.onclick = () => goJourney(p, t, focus); li.append(k, b); ul.append(li); }
  box.append(ul);
}
function goJourney(p, t, focus) {
  if (!mode.space) setMode(true);
  state.time = t; state.speed = 3600; document.querySelectorAll('[data-speed]').forEach(x => x.classList.remove('on'));
  computeHelio(); const hp = probeHelio(p, jd(t)); if (!hp) { $('status').textContent = '이 시각의 궤도 자료가 없습니다'; return; }
  const fb = focus && focus !== 'Sun' ? PLANETS.find(q => q.name === focus) : null, fp = fb && helioPos[fb.name];
  const d = fp ? Math.max(hp.distanceTo(fp) * 2.2, bodyR(fb) * 6) : focus === 'Sun' ? hp.length() * 1.4 : Math.max(bodyR(p) * 5, 2);
  // look from beside the craft toward it with the focus body in frame
  const dir = (fp ? fp.clone().sub(hp) : hp.clone().negate()).normalize(), side = dir.clone().cross(ECL_N).normalize(), view3 = dir.clone().multiplyScalar(-0.9).addScaledVector(side, 0.3).addScaledVector(ECL_N, 0.2).normalize();
  sp.flight = null; sp.target = p; sp.replay = p; sp.dist = d; sp.quat.copy(lookQuat(view3.negate())); view.fov = 50;
  $('sp-target').textContent = `${p.ko} 여정`; $('status').textContent = `${p.ko} · ${new Date(t).toISOString().slice(0, 10)} · 1시간/초로 재생`;
}

// ---------- 23. faint stars when zoomed in: Gaia DR3 tiles to G = 12 (G2) ----------
const gaia = { index: null, tiles: new Map(), loading: 0, group: new THREE.Group(), max: MOBILE ? 40 : 160 };
sky.add(gaia.group);
fetch('data/gaia/index.json').then(r => r.json()).then(j => gaia.index = j).catch(() => {});
async function loadGaiaTile(b, i, key) {
  const [d0, n, counts] = gaia.index.tiles[b], w = 360 / n, B = gaia.index.band; gaia.loading++;
  const t = { pts: null, used: performance.now() }; gaia.tiles.set(key, t);
  try {
    if (!counts[i]) return;
    const buf = await fetch(`data/gaia/${b}_${i}.bin`).then(r => r.arrayBuffer()), dv = new DataView(buf), N = buf.byteLength / 6;
    const pos = new Float32Array(N * 3), mag = new Float32Array(N), col = new Float32Array(N * 3);
    for (let k = 0; k < N; k++) { const o = k * 6, ra = (i * w + dv.getUint16(o, true) / 65535 * w) * D2R, de = (d0 + dv.getUint16(o + 2, true) / 65535 * B) * D2R;
      pos[3 * k] = R_SKY * Math.cos(de) * Math.cos(ra); pos[3 * k + 1] = R_SKY * Math.cos(de) * Math.sin(ra); pos[3 * k + 2] = R_SKY * Math.sin(de);
      mag[k] = 8 + dv.getUint8(o + 4) / 60; const c = bvToRGB(dv.getUint8(o + 5) / 60 - 0.5 - 0.1); col.set(c, 3 * k); } // BP-RP is a little redder than B-V
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('mag', new THREE.BufferAttribute(mag, 1)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    t.pts = new THREE.Points(g, starMat); t.pts.frustumCulled = false; t.pts.renderOrder = 2; gaia.group.add(t.pts);
  } catch {} finally { gaia.loading--; }
}
function updateGaia() {
  const on = !!gaia.index && !s3d.far && view.fov < (MOBILE ? 15 : 30) && starMat.uniforms.limit.value > 8;
  gaia.group.visible = on; if (!on) return;
  const inv = new THREE.Matrix4().copy(sky.matrixWorld).invert(), f = camFwd().applyMatrix4(inv).normalize();
  const dec = Math.asin(f.z) * R2D, ra = (Math.atan2(f.y, f.x) * R2D + 360) % 360, r = view.fov * 0.5 * Math.max(1, innerWidth / innerHeight) + 3, B = gaia.index.band, now = performance.now();
  gaia.tiles.forEach(t => { if (t.pts) t.pts.visible = false; });
  for (let b = 0; b < gaia.index.tiles.length; b++) { const [d0, n] = gaia.index.tiles[b]; if (d0 + B < dec - r || d0 > dec + r) continue;
    const c = Math.cos(Math.min(89, Math.max(Math.abs(d0), Math.abs(d0 + B), Math.abs(dec)) - (Math.abs(dec) < Math.abs(d0) ? 0 : 0)) * D2R), half = Math.abs(dec) + r > 88 ? 180 : Math.min(180, r / Math.max(0.05, c)), w = 360 / n;
    for (let i = 0; i < n; i++) { const mid = (i + 0.5) * w, dRA = Math.abs(((mid - ra + 540) % 360) - 180); if (dRA > half + w / 2) continue;
      const key = b + '_' + i, t = gaia.tiles.get(key); if (t) { t.used = now; if (t.pts) t.pts.visible = true; } else if (gaia.loading < 6) loadGaiaTile(b, i, key); } }
  if (gaia.tiles.size > gaia.max) { const old = [...gaia.tiles.entries()].sort((a, b) => a[1].used - b[1].used).slice(0, gaia.tiles.size - gaia.max);
    for (const [k, t] of old) { if (t.pts) { gaia.group.remove(t.pts); t.pts.geometry.dispose(); } gaia.tiles.delete(k); } }
}

// ---------- 24. real horizon from terrain (G4): Copernicus DEM through Open-Meteo's elevation API ----------
const hzTex = new THREE.DataTexture(new Uint8Array(360 * 4), 360, 1, THREE.RGBAFormat); // altitude (rad) as (r * 0.6 - 0.1): 0.13 deg steps, filterable everywhere
hzTex.wrapS = THREE.RepeatWrapping; hzTex.magFilter = hzTex.minFilter = THREE.LinearFilter; groundMat.uniforms.horizon.value = hzTex;
const hz = { key: '', pending: null, cache: new Map() };
function destPoint(lat, lon, az, km) { const R = 6371, d = km / R, a = az * D2R, p1 = lat * D2R, l1 = lon * D2R;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(a));
  return [p2 * R2D, (l1 + Math.atan2(Math.sin(a) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2))) * R2D]; }
// elevation from AWS Terrain Tiles (Terrarium PNG, zoom 10 ~ 130 m per pixel near Korea), read on a canvas
const demTiles = new Map();
function demTile(x, y) { const key = x + '/' + y; if (!demTiles.has(key)) demTiles.set(key, (async () => {
  const im = await createImageBitmap(await fetch(`https://elevation-tiles-prod.s3.amazonaws.com/terrarium/10/${x}/${y}.png`).then(r => { if (!r.ok) throw 0; return r.blob(); }));
  const c = new OffscreenCanvas(256, 256), g = c.getContext('2d'); g.drawImage(im, 0, 0); return g.getImageData(0, 0, 256, 256).data; })());
  return demTiles.get(key); }
async function elevation(lat, lon) {
  const n = 1024, fx = (lon + 180) / 360 * n, fy = (1 - Math.log(Math.tan(lat * D2R) + 1 / Math.cos(lat * D2R)) / Math.PI) / 2 * n;
  const d = await demTile(Math.floor(fx), Math.floor(fy)), px = Math.min(255, Math.floor((fx % 1) * 256)), py = Math.min(255, Math.floor((fy % 1) * 256)), o = (py * 256 + px) * 4;
  return d[o] * 256 + d[o + 1] + d[o + 2] / 256 - 32768;
}
async function loadHorizon(lat, lon) {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`; if (hz.cache.has(key)) return hz.cache.get(key);
  const NA = 180, DIST = MOBILE ? [0.4, 0.8, 1.3, 2, 3, 4.5, 6.5, 9, 12, 16, 21, 27, 35] : [0.3, 0.6, 1, 1.5, 2.2, 3, 4, 5.5, 7, 9, 11.5, 14.5, 18, 22, 27, 33, 40, 48, 57];
  const h0 = Math.max(0, await elevation(lat, lon)) + 1.7, prof = new Float32Array(NA);
  for (let i = 0; i < NA; i++) { let m = -0.02;
    for (const d of DIST) { const [la, lo] = destPoint(lat, lon, i * 360 / NA, d), h = Math.max(0, await elevation(la, lo)), m2 = d * 1000, drop = m2 * m2 / (2 * 6371000) * 0.87; // curvature with standard refraction
      m = Math.max(m, Math.atan((h - h0 - drop) / m2)); }
    prof[i] = m; }
  const out = { prof, h0: h0 - 1.7 }; hz.cache.set(key, out); return out;
}
function updateHorizon() {
  const on = groundOn() && $('t-terrain').checked; groundMat.uniforms.realH.value = on && hz.ready ? 1 : 0; if (!on) return;
  const key = `${state.lat.toFixed(3)},${state.lon.toFixed(3)}`; if (key === hz.key) return;
  hz.key = key; clearTimeout(hz.pending); hz.ready = false;
  hz.pending = setTimeout(async () => { try { const r = await loadHorizon(state.lat, state.lon); if (hz.key !== key) return;
    const a = hzTex.image.data, N = r.prof.length;
    for (let x = 0; x < 360; x++) { const f = x / 360 * N, i = Math.floor(f) % N, t = f - Math.floor(f); a[x * 4] = Math.round(Math.max(0, Math.min(1, ((r.prof[i] * (1 - t) + r.prof[(i + 1) % N] * t) + 0.1) / 0.6)) * 255); }
    hzTex.needsUpdate = true; hz.ready = true; $('status').textContent = `실제 지형 지평선 · 관측지 고도 ${Math.round(r.h0)} m · 가장 높은 능선 ${(Math.max(...r.prof) * R2D).toFixed(1)}°`;
  } catch { hz.ready = false; } }, 600);
}

// ---------- 25. constellation artwork (G7): Johan Meuris' drawings, tinted in Space Commons teal ----------
const artGroup = new THREE.Group(); artGroup.visible = false; sky.add(artGroup);
const artMat = (tex) => new THREE.ShaderMaterial({
  uniforms: { map: { value: tex }, op: { value: 0.55 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D map; uniform float op; varying vec2 vUv;
    void main(){ float l = texture2D(map, vUv).r / 0.62; l = 0.22 * l + 0.85 * smoothstep(0.5, 1.0, l); gl_FragColor = vec4(vec3(0.31, 0.89, 0.76) * l * op, 1.0); }`,
  transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
});
let artLoaded = false;
async function loadArt() {
  artLoaded = true;
  const list = await fetch('data/constellation-art.json').then(r => r.json()), byHip = new Map(); starData.id.forEach((id, i) => byHip.set(+id, starData.pos[i]));
  const loader = new THREE.TextureLoader();
  for (const a of list) {
    const S = a.anchors.map(([x, y, hip]) => ({ x, y, v: byHip.get(hip) })); if (S.some(q => !q.v)) continue;
    // gnomonic plane at the anchors' centroid; affine map pixel -> plane from the three anchors
    const c = S.reduce((m, q) => m.add(q.v), new THREE.Vector3()).normalize(), e1 = new THREE.Vector3(0, 0, 1).cross(c).normalize(), e2 = c.clone().cross(e1);
    const P = S.map(q => { const t = q.v.clone().divideScalar(q.v.dot(c)); return [t.dot(e1), t.dot(e2)]; });
    const M = new THREE.Matrix3().set(S[0].x, S[0].y, 1, S[1].x, S[1].y, 1, S[2].x, S[2].y, 1).invert();
    const solve = (k) => new THREE.Vector3(P[0][k], P[1][k], P[2][k]).applyMatrix3(M); const au = solve(0), av = solve(1);
    const [W, H] = a.size, N = 16, pos = [], uv = [], idx = [];
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) { const x = i / N * W, y = j / N * H, u = au.x * x + au.y * y + au.z, v = av.x * x + av.y * y + av.z;
      const d = c.clone().addScaledVector(e1, u).addScaledVector(e2, v).normalize().multiplyScalar(R_SKY * 0.995); pos.push(d.x, d.y, d.z); uv.push(i / N, 1 - j / N); }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const k = j * (N + 1) + i; idx.push(k, k + 1, k + N + 1, k + 1, k + N + 2, k + N + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    const m = new THREE.Mesh(g, artMat(loader.load('assets/constellations/' + a.file))); m.frustumCulled = false; m.renderOrder = 1; artGroup.add(m);
  }
}
// Korean sky culture: the Cheonsang Yeolcha Bunyajido itself (woodcut print, public domain), laid on the sky.
// Carved in 1395 (Joseon) from an older Goguryeo-era rubbing; as a polar equidistant map its stars fit the sky of about 600 CE best (tools/make_cheonsang.py).
const csGroup = new THREE.Group(); csGroup.visible = false; sky.add(csGroup); let csLoaded = '';
function precessDeg(ra, dec, years) { // rotation about the ecliptic pole by general precession in longitude
  const e = 23.44 * D2R, r = ra * D2R, d = dec * D2R, x = Math.cos(d) * Math.cos(r), y = Math.cos(d) * Math.sin(r), z = Math.sin(d);
  const ye = y * Math.cos(e) + z * Math.sin(e), ze = -y * Math.sin(e) + z * Math.cos(e), L = 50.29 / 3600 * years * D2R;
  const x2 = x * Math.cos(L) - ye * Math.sin(L), y2 = x * Math.sin(L) + ye * Math.cos(L), y3 = y2 * Math.cos(e) - ze * Math.sin(e), z3 = y2 * Math.sin(e) + ze * Math.cos(e);
  return [(Math.atan2(y3, x2) * R2D + 360) % 360, Math.asin(Math.max(-1, Math.min(1, z3))) * R2D];
}
async function loadCheonsang(ver) {
  csLoaded = ver; csGroup.clear(); const f = await fetch(`data/${ver}.json`).then(r => r.json()), NR = 96, ND = 72, pos = [], uv = [], idx = [], half = f.size / 2;
  for (let j = 0; j <= ND; j++) for (let i = 0; i <= NR; i++) { const ra = i / NR * 360, dec = 90 - j / ND * 143, [pr, pdc] = precessDeg(ra, dec, f.years), pd = 90 - pdc, a = (f.mir * pr + f.rot) * D2R;
    const v = eqVec(ra, dec, R_SKY * 0.994); pos.push(v.x, v.y, v.z); uv.push((half + f.k * pd * Math.cos(a)) / f.size, 1 - (half - f.k * pd * Math.sin(a)) / f.size); }
  for (let j = 0; j < ND; j++) for (let i = 0; i < NR; i++) { const k = j * (NR + 1) + i; idx.push(k, k + 1, k + NR + 1, k + 1, k + NR + 2, k + NR + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  const tex = new THREE.TextureLoader().load(`assets/${ver}.webp`); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.6, depthTest: false, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  m.frustumCulled = false; m.renderOrder = 1; csGroup.add(m);
}
function updateArt() {
  const korean = $('skyculture').value === 'korean';
  $('csver').hidden = !korean;
  const kon = $('t-art').checked && korean && !s3d.far, ver = $('csver').value; csGroup.visible = kon; if (kon && csLoaded !== ver) { loadCheonsang(ver); if (ver === 'cheonmundo') $('status').textContent = '채색 천문도 (조선 필사본, 퍼블릭 도메인, 인터넷 아카이브)를 겹칩니다. 먹선은 밝게, 붉은 별점은 그대로 바꿔 그렸습니다. 손으로 그린 지도라 별 위치가 군데군데 어긋납니다.'; else $('status').textContent = '천상열차분야지도 (조선 태조 4년 1395년 각석, 목판본 인쇄, 퍼블릭 도메인)를 겹칩니다. 고구려 시대 원본을 바탕으로 해서 별 위치가 서기 600년 무렵 하늘과 가장 잘 맞고, 지금 하늘과는 조금씩 어긋납니다.'; }
  if (kon) csGroup.children.forEach(m => m.material.opacity = (ver === 'cheonmundo' ? 0.26 : 0.38) * Math.max(0, Math.min(1, (view.fov - 4) / 16)));
  const on = $('t-art').checked && !s3d.far && !korean; artGroup.visible = on; if (!on) return; if (!artLoaded) loadArt();
  const op = 0.3 * Math.max(0, Math.min(1, (view.fov - 6) / 20));
  for (const m of artGroup.children) m.material.uniforms.op.value = op;
}

// ---------- 26. analemma: the Sun at this clock time on every day of the year ----------
const anaGroup = new THREE.Group(); anaGroup.visible = false; scene.add(anaGroup); let anaKey = '';
function updateAnalemma() {
  const on = !mode.space && $('t-analemma').checked; anaGroup.visible = on; if (!on) return;
  const d = new Date(state.time), key = `${d.getHours()}:${d.getMinutes()}|${state.lat.toFixed(2)},${state.lon.toFixed(2)}|${d.getFullYear()}`; if (key === anaKey) return; anaKey = key;
  anaGroup.clear(); const pts = [], marks = [];
  for (let k = 0; k <= 366; k++) { const t = new Date(d.getFullYear(), 0, 1 + k, d.getHours(), d.getMinutes()).getTime(), v = sunMoonAt(t).Sun, { ra, dec } = vecToRaDec(v);
    const H = (lstDeg(t, state.lon) - ra) * D2R, de = dec * D2R, p = state.lat * D2R, alt = Math.asin(Math.sin(p) * Math.sin(de) + Math.cos(p) * Math.cos(de) * Math.cos(H));
    const az = Math.atan2(-Math.cos(de) * Math.sin(H), Math.sin(de) * Math.cos(p) - Math.cos(de) * Math.cos(H) * Math.sin(p)) * R2D;
    const w = viewDir((az + 360) % 360, alt * R2D).multiplyScalar(R_SKY * 0.99); pts.push(w); if (new Date(t).getDate() === 1) marks.push([w, new Date(t).getMonth() + 1]); }
  anaGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.8, depthTest: false })));
  const g = new THREE.BufferGeometry().setFromPoints(marks.map(m => m[0])); anaGroup.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffd27a, size: 5, sizeAttenuation: false, depthTest: false })));
  anaGroup.children.forEach(c => { c.renderOrder = 4; c.frustumCulled = false; }); anaGroup.userData.marks = marks;
}

// ---------- 11. observing list (kept in this browser) ----------
const OBS_KEY = 'space-commons-obslist';
const loadObs = () => { try { return JSON.parse(localStorage.getItem(OBS_KEY)) || []; } catch { return []; } };
const saveObs = (l) => { try { localStorage.setItem(OBS_KEY, JSON.stringify(l)); } catch {} };
function objKey(o) { return o.planet ? o.p.name : o.kindName === 'dso' ? (o.messier || o.name) : o.kindName === 'star' ? (starData.proper[o.i] || 'HIP' + starData.id[o.i]) : o.name; }
function objLabel(o) { return o.planet ? o.p.ko : o.kindName === 'dso' ? [o.messier, o.common || o.name].filter(Boolean).join(' ') : o.name; }
function syncObsButton() { if (!selected) return; const k = objKey(selected), has = loadObs().some(x => x.key === k); $('obs-add').textContent = has ? '목록에서 빼기' : '관측 목록에 담기'; $('obs-add').classList.toggle('on', has); }
$('obs-add').onclick = () => { if (!selected) return; let l = loadObs(); const k = objKey(selected);
  l = l.some(x => x.key === k) ? l.filter(x => x.key !== k) : [...l, { key: k, label: objLabel(selected), done: false, note: '', added: Date.now() }];
  saveObs(l); syncObsButton(); if (!$('obs').hidden) renderObs(); };
function renderObs() {
  const l = loadObs(), ul = $('obs-list'); ul.innerHTML = '';
  $('obs-sub').textContent = l.length ? `${l.length}개 중 ${l.filter(x => x.done).length}개 관측함 · 이 브라우저에만 저장됩니다` : '천체를 선택하고 "관측 목록에 담기"를 누르세요';
  l.forEach((it, i) => {
    const li = document.createElement('li'); const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = it.done;
    cb.onchange = () => { const L = loadObs(); L[i].done = cb.checked; L[i].doneAt = cb.checked ? Date.now() : null; saveObs(L); renderObs(); };
    const go = document.createElement('button'); go.textContent = it.label; go.className = it.done ? 'done' : '';
    go.onclick = () => { const mk = searchIndex.get(it.key.toLowerCase().replace(/\s+/g, '')); if (mk) { const o = mk(); if (!o.planet || o.p.world) { select(o); flyTo(o); } } };
    const note = document.createElement('input'); note.placeholder = '메모'; note.value = it.note || '';
    note.onchange = () => { const L = loadObs(); L[i].note = note.value; saveObs(L); };
    const del = document.createElement('button'); del.textContent = '×'; del.className = 'del';
    del.onclick = () => { const L = loadObs(); L.splice(i, 1); saveObs(L); renderObs(); syncObsButton(); };
    li.append(cb, go, del, note); ul.append(li);
  });
  $('obs').hidden = false;
}
$('obs-btn').onclick = () => $('obs').hidden ? renderObs() : ($('obs').hidden = true);
$('obs-close').onclick = () => $('obs').hidden = true;

// ---------- 11b. tonight's observing plan (B1): what is worth seeing, in time order, during astronomical darkness ----------
function azAltAt(v, ms) { const { ra, dec } = vecToRaDec(v); const H = (lstDeg(ms, state.lon) - ra) * D2R, d = dec * D2R, p = state.lat * D2R;
  const alt = Math.asin(Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.cos(H));
  const az = Math.atan2(-Math.cos(d) * Math.sin(H), Math.sin(d) * Math.cos(p) - Math.cos(d) * Math.cos(H) * Math.sin(p));
  return { alt: alt * R2D, az: ((az * R2D) + 360) % 360 }; }
const DIR8 = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
function tonightPlan() {
  const d0 = new Date(state.time), start = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate(), 12).getTime() - (d0.getHours() < 12 ? 86400e3 : 0);
  const T = [], SM = []; for (let i = 0; i <= 96; i++) { const t = start + i * 15 * 60e3; T.push(t); SM.push(sunMoonAt(t)); }
  const dark = T.map((t, i) => altOf(SM[i].Sun, t) < -12); if (!dark.some(Boolean)) return { rows: [], note: '오늘은 하늘이 충분히 어두워지지 않습니다 (백야)' };
  const i0 = dark.indexOf(true), i1 = dark.lastIndexOf(true), bortle = +$('bortle').value, lim = [7.6, 7.1, 6.6, 6.2, 5.7, 5.2, 4.7, 4.2, 3.8][bortle - 1];
  const es = $('eyepiece'), eq = es.options[es.selectedIndex]?.text || '', aid = es.value === 'custom' ? Math.max(0, 5 * Math.log10(Math.max(7, +$('g-ap').value || 7) / 7)) : /200mm/.test(eq) ? 6 : /80mm|mm/.test(eq) ? 4.5 : /쌍안경/.test(eq) ? 2.5 : 0;  // the chosen equipment reaches fainter objects
  const cands = [];
  for (const n of ['Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune']) { const p = PLANETS.find(q => q.name === n);
    cands.push({ key: n, label: p.ko, kind: n === 'Moon' ? '위성' : '행성', mag: p.mag, dirAt: (t) => ecl2eq(geoAt(t)[n]) }); }
  for (const o of dsos) if (o.messier && isFinite(o.mag) && o.mag < lim + aid + 1) { const v = radec(o.ra, o.dec);
    cands.push({ key: o.messier, label: [o.messier, o.common].filter(Boolean).join(' '), kind: TYPE_RAW_KO[o.type] || o.type, mag: o.mag, dirAt: () => v }); }
  const mine = new Set(loadObs().map(x => x.key)), rows = [];
  for (const c of cands) { let best = -1, ba = -90;
    for (let i = i0; i <= i1; i++) { const a = altOf(c.dirAt(T[i]), T[i]); if (a > ba) { ba = a; best = i; } }
    if (ba < 25 || (c.kind !== '행성' && c.kind !== '위성' && c.mag > lim + aid)) continue;
    if (['Uranus', 'Neptune'].includes(c.key) && !aid) continue;
    const t = T[best], v = c.dirAt(t), aa = azAltAt(v, t), moonSep = c.key === 'Moon' ? null : sepDeg(v, SM[best].Moon), moonUp = altOf(SM[best].Moon, t) > 0;
    const moonPenalty = c.kind === '행성' || c.kind === '위성' ? 0 : moonUp && moonSep < 40 ? 2 : 0;
    rows.push({ ...c, t, alt: aa.alt, dir: DIR8[Math.round(aa.az / 45) % 8], moonSep, moonUp, score: ba / 10 - (c.mag || 0) * 0.6 - moonPenalty + (mine.has(c.key) ? 5 : 0), mine: mine.has(c.key) }); }
  rows.sort((a, b) => b.score - a.score); const pick = rows.slice(0, 14).sort((a, b) => a.t - b.t);
  return { rows: pick, dusk: T[i0], dawn: T[i1], lim: lim + aid };
}
function renderPlan() {
  const P = tonightPlan(), box = $('plan'), hm = (t) => new Date(t).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', hour12: false });
  if (!P.rows.length) { box.innerHTML = `<p class="small">${P.note || '조건에 맞는 천체가 없습니다'}</p>`; box.hidden = false; return; }
  let h = `<h3>오늘 밤 관측 계획</h3><p class="small">${state.lat.toFixed(2)}°, ${state.lon.toFixed(2)}° · 천문 박명 끝 ${hm(P.dusk)} ~ 시작 ${hm(P.dawn)} · 보이는 한계 약 ${P.lim.toFixed(1)}등급 (광공해 단계와 장비 기준)</p>`;
  h += '<table class="pltable"><tr><th>시각</th><th>천체</th><th>방향 · 고도</th><th>등급</th><th>참고</th></tr>';
  for (const r of P.rows) h += `<tr data-k="${r.key}"><td>${hm(r.t)}</td><td><button class="plan-go">${r.label}</button>${r.mine ? ' ★' : ''}<br><span class="small">${r.kind}</span></td><td>${r.dir} ${r.alt.toFixed(0)}°</td><td>${isFinite(r.mag) ? r.mag.toFixed(1) : '-'}</td><td class="small">${r.kind === '행성' || r.kind === '위성' ? '' : r.moonSep != null && r.moonUp && r.moonSep < 40 ? `달과 ${r.moonSep.toFixed(0)}°, 달빛 방해` : r.moonSep != null && r.moonUp ? '달이 떠 있음' : ''}</td></tr>`;
  h += '</table><p class="small">시각은 가장 높이 뜨는 때입니다. ★ = 내 관측 목록. 날씨는 날씨 창에서 확인하세요.</p>';
  box.innerHTML = h; box.hidden = false; $('plan-print').hidden = false;
  box.querySelectorAll('.plan-go').forEach(b => b.onclick = () => { const k = b.closest('tr').dataset.k, mk = searchIndex.get(k.toLowerCase().replace(/\s+/g, '')); if (mk) { const o = mk(); select(o); flyTo(o); } });
}
$('plan-btn').onclick = () => { if ($('obs').hidden) renderObs(); renderPlan(); };
$('plan-print').onclick = () => { document.body.classList.add('print-plan'); window.print(); document.body.classList.remove('print-plan'); };

// ---------- 25. phone: collapsible panel, point-at-the-sky with the gyroscope ----------
if (matchMedia('(max-width: 640px)').matches) document.body.classList.add('collapsed');
$('panel-toggle').onclick = () => { const c = document.body.classList.toggle('collapsed'); $('panel-toggle').textContent = c ? '더 보기' : '접기'; };
$('panel-toggle').textContent = document.body.classList.contains('collapsed') ? '더 보기' : '접기';
let gyro = null;
function onOrient(e) {
  if (e.alpha == null) return;
  const a = (e.webkitCompassHeading != null ? 360 - e.webkitCompassHeading : e.alpha) * D2R, b = e.beta * D2R, g = e.gamma * D2R;
  // direction of the back camera (device -Z) in East-North-Up, from the Z-X'-Y'' rotation of the device
  const E = -Math.sin(g) * Math.cos(a) - Math.cos(g) * Math.sin(b) * Math.sin(a);
  const Nn = -Math.sin(g) * Math.sin(a) + Math.cos(g) * Math.sin(b) * Math.cos(a);
  const U = -Math.cos(g) * Math.cos(b);
  const az = (Math.atan2(E, Nn) * R2D + 360) % 360, alt = Math.asin(Math.max(-1, Math.min(1, U))) * R2D;
  const daz = ((az - view.az + 540) % 360) - 180; view.az = (view.az + daz * 0.25 + 360) % 360; view.alt += (alt - view.alt) * 0.25; // smooth the jitter
}
// B3: the phone camera behind the sky - labels, constellation lines and planets over the real view
let arStream = null;
async function setAR(on) {
  if (!on) { arStream?.getTracks().forEach(t => t.stop()); arStream = null; $('ar-video').hidden = true; document.body.classList.remove('ar'); $('ar').classList.remove('on'); return; }
  try { arStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }); }
  catch { $('status').textContent = '카메라를 쓸 수 없습니다 (권한 또는 기기)'; return; }
  const v = $('ar-video'); v.srcObject = arStream; v.hidden = false; await v.play().catch(() => {});
  document.body.classList.add('ar'); $('ar').classList.add('on'); view.fov = 62; // about a phone's main camera across its height
}
$('ar').onclick = () => setAR(!arStream);
$('gyro').onclick = async () => {
  if (gyro) { removeEventListener(gyro, onOrient); gyro = null; $('gyro').classList.remove('on'); setAR(false); $('ar').hidden = true; return; }
  try { if (typeof DeviceOrientationEvent?.requestPermission === 'function' && await DeviceOrientationEvent.requestPermission() !== 'granted') return; } catch { return; }
  setMode(false); flight = null; tracking = null;
  gyro = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
  addEventListener(gyro, onOrient); $('gyro').classList.add('on'); $('ar').hidden = !navigator.mediaDevices?.getUserMedia;
};
if (!('DeviceOrientationEvent' in window) || !matchMedia('(pointer: coarse)').matches) $('gyro').hidden = true;

// ---------- labels ----------
const labelBox = $('labels'); const pool = []; let used = 0;
let discs = [], washout = 0; // washout: daylight in the realistic day-sky setting
 // screen disks of solar-system bodies; sky labels behind them are skipped
function label(x, y, text, cls) {
  if (!/^(planet|card|site|sat)/.test(cls) && discs.some(d => Math.hypot(d[0] - x, d[1] - y) < d[2])) return;
  let el = pool[used]; if (!el) { el = document.createElement('div'); labelBox.appendChild(el); pool.push(el); }
  used++; el.className = 'lbl ' + cls; text = tr(text); if (el.textContent !== text) el.textContent = text;
  el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.display = '';
}
function drawLabels() {
  used = 0;
  discs = [];
  for (const p of PLANETS) if (p.world && p.mesh.visible && p.rpx > 4 && p.world.dot(camFwd()) > 0) { const s = toScreen(p.world); if (s) discs.push([s[0], s[1], p.rpx]); }
  const gOn = groundOn();
  if ($('t-labels').checked) {
    const fwd = camFwd(), cosLim = Math.cos(Math.min(85, view.fov * 0.75) * D2R);
    const vis = (w) => w.dot(fwd) > cosLim && !(gOn && w.y < 0) && !(siteUp && w.dot(siteUp) < 0); // also hide what is under a landing site's horizon
    const lim = starMat.uniforms.limit.value; const starLim = Math.min(lim - 1.2, 1.2 + 2.5 * Math.log10(70 / view.fov) + 1.2);
    let n = 0;
    const dark = washout < 0.6 && !s3d.far; // in realistic daylight only the Sun, Moon and bright planets keep labels; among the stars, 3D labels instead
    for (let i = 0; dark && i < starData.pos.length && n < 70; i++) {
      if (starData.mag[i] > starLim || !starData.name[i]) continue;
      if (!starData.proper[i] && starData.mag[i] > starLim - 1.5) continue;
      const w = starData.pos[i].clone().applyMatrix4(sky.matrixWorld); if (!vis(w)) continue;
      const s = toScreen(w); if (s) { label(s[0], s[1], starData.proper[i] || starData.name[i], 'star'); n++; }
    }
    if (dark && !mode.space && $('t-dso').checked) { const L = smallLim(); let sn = 0;
      for (const o of smallBodies) { if (!o.v || o.dup || o.mag > L || sn > 40) continue; const w = o.v.clone().applyMatrix4(sky.matrixWorld); if (!vis(w)) continue;
        const s = toScreen(w); if (s) { label(s[0], s[1], o.comet ? o.name.replace(/^C\/|^P\//, '').replace(/\s*\(.*\)/, (m) => view.fov < 20 ? m : '') : o.name.replace(/^\d+ /, ''), o.comet ? 'small comet' : 'small'); sn++; } } }
    if (dark && $('t-lines').checked && $('skyculture').value === 'korean') { let kn = 0; // Korean names; small asterisms only when zoomed in
      for (const c of koreanLabels) { if (kn > 90 || (c.n < 3 && view.fov > 35 && !c.mansion)) continue; const w = c.v.clone().applyMatrix4(sky.matrixWorld); if (!vis(w)) continue;
        const s = toScreen(w); if (s) { label(s[0], s[1], view.fov < 30 && c.hanja && !EN ? `${c.name} ${c.hanja}` : c.name, c.mansion ? 'const kr mansion' : 'const kr'); kn++; } } }
    else if (dark && $('t-lines').checked && CULTURES[$('skyculture').value]) { let cn = 0;
      for (const c of CULTURES[$('skyculture').value].labels) { if (cn > 80 || (c.n < 4 && view.fov > 40)) continue; const w = c.v.clone().applyMatrix4(sky.matrixWorld); if (!vis(w)) continue;
        const s = toScreen(w); if (s) { label(s[0], s[1], view.fov < 25 && c.gloss ? `${c.name} · ${c.gloss}` : c.name, 'const kr'); cn++; } } }
    else if (dark && $('t-lines').checked && view.fov > 15) for (const c of constLabels) {
      const w = c.v.clone().applyMatrix4(sky.matrixWorld); if (!vis(w)) continue; const s = toScreen(w); if (s) label(s[0], s[1], c.name, 'const'); }
    if (dark && $('t-dso').checked) {
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
    for (const p of PLANETS) if (p.world && p.mesh.visible && p.world.dot(fwd) > 0 && !(siteUp && p.world.dot(siteUp) < 0)) { const s = toScreen(p.world); if (s) label(s[0] + p.rpx, s[1], p.ko, 'planet'); }
  }
  if ($('t-labels').checked && washout < 0.6 && exoPoints?.visible && view.fov < 40) {
    const fwd = camFwd(), cosLim = Math.cos(Math.min(85, view.fov * 0.75) * D2R); let m = 0;
    for (const h of exo.hosts) {
      if (m > 40) break; if (!(EXO_FAMOUS.has(h.name) || view.fov < 4)) continue;
      const w = h.v.clone().applyMatrix4(sky.matrixWorld); if (w.dot(fwd) < cosLim || (gOn && w.y < 0)) continue;
      const s = toScreen(w); if (s) { label(s[0] + 6, s[1], `${h.name} (${h.planets.length})`, 'exo'); m++; }
    }
  }
  if ($('t-showers').checked && !mode.space) {
    const fwd = camFwd(), cosLim = Math.cos(Math.min(85, view.fov * 0.75) * D2R);
    for (const sh of showers) { if (!showerActive(sh)) continue;
      const w = sh.v.clone().applyMatrix4(sky.matrixWorld); if (w.dot(fwd) < cosLim || (gOn && w.y < 0)) continue;
      const s = toScreen(w); if (s) { const dp = daysToPeak(sh); label(s[0], s[1], `${sh.ko}${dp === 0 ? ' · 오늘 극대' : dp > 0 && dp < 8 ? ` · 극대 ${dp}일 전` : ''}`, 'shower'); } }
  }
  if (mode.space && $('t-labels').checked) for (const st of sites) { if (!st.world) continue; const sc = toScreen(st.world); if (sc) label(sc[0], sc[1], st.ko, 'site'); }
  if (sats.length && $('t-sats').checked && (!mode.space || true)) {
    const fwd = camFwd(), cosLim = Math.cos(Math.min(85, view.fov * 0.75) * D2R);
    // names: stations and major Korean satellites first, the rest only when zoomed in, and never on top of another name
    const E = helioPos.Earth, close = view.fov < 25 || (mode.space && E && E.distanceTo(sp.pos) < 0.05), boxes = [], cand = [];
    for (const s of sats) { if (!s.world || s.world.dot(fwd) < cosLim) continue; const p = toScreen(s.world); if (!p) continue;
      const pr = s === selected ? 1e3 : s.star ? 100 : s.korea && MAJOR_SAT.test(s.name) ? 50 : s.korea ? 10 : 0; cand.push({ s, p, pr }); }
    cand.sort((a, b) => b.pr - a.pr);
    const out = []; // satellites hidden behind a shown name (e.g. the Koreasats sharing 116 E) are counted on that name
    for (const { s, p, pr } of cand) {
      let name = pr >= 50 || ((s.korea || !mode.space) && close) ? s.name : '', host = null;
      if (name) { const w = name.length * 7 + 12, b = [p[0] - 4, p[1] - 9, p[0] + w, p[1] + 9];
        host = boxes.find(o => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]); if (host) { name = ''; host.n++; } else { b.n = 0; boxes.push(b); out.push(b.item = { p, s, name, b }); continue; } }
      else { const near = boxes.find(o => Math.hypot(o[0] + 4 - p[0], o[1] + 9 - p[1]) < 14); if (near) near.n++; }
      out.push({ p, s, name: '' }); }
    for (const o of out) label(o.p[0], o.p[1], o.name && o.b.n ? `${o.name} 외 ${o.b.n}기` : o.name, 'sat' + (o.s.visible ? ' lit' : '') + (o.s.iss ? ' iss' : '') + (o.s.korea ? ' kr' : ''));
  }
  if (mode.space) starLabels();
  if (anaGroup.visible && anaGroup.userData.marks) for (const [w, m] of anaGroup.userData.marks) { const sc = toScreen(w.clone().normalize()); if (sc && w.clone().normalize().dot(camFwd()) > 0) label(sc[0], sc[1], `${m}월`, 'planet'); }
  if (gridGroup.visible && !mode.space) { const fwd = camFwd(), lim = Math.cos(Math.min(85, view.fov * 0.7) * D2R);
    for (let h = 0; h < 24; h += view.fov > 60 ? 2 : 1) { const w = eqVec(h * 15, 0).applyMatrix4(sky.matrixWorld); if (w.dot(fwd) < lim || (gOn && w.y < 0)) continue; const sc = toScreen(w); if (sc) label(sc[0], sc[1], `${h}h`, 'grid'); }
    for (const ra0 of [0, 90, 180, 270]) for (let d = -60; d <= 80; d += 20) { if (!d) continue; const w = eqVec(ra0, d).applyMatrix4(sky.matrixWorld); if (w.dot(fwd) < lim || (gOn && w.y < 0)) continue; const sc = toScreen(w); if (sc) label(sc[0], sc[1], `${d > 0 ? '+' : ''}${d}°`, 'grid'); } }
  if (gOn) for (const c of cardinals) { const s = toScreen(c.w); if (s && c.w.dot(camFwd()) > 0) label(s[0], s[1], c.name, 'card'); }
  for (let i = used; i < pool.length; i++) pool[i].style.display = 'none';
  const ring = $('sel-ring');
  if (selected && !(selected.planet && !selected.p.world)) { const s = toScreen(worldOf(selected)); ring.hidden = !s; if (s) { ring.style.left = s[0] + 'px'; ring.style.top = s[1] + 'px'; } } else ring.hidden = true;
}

// ---------- main loop ----------
const skyNight = new THREE.Color(0x02040a), skyDay = new THREE.Color(0x3d72b8), skyTwi = new THREE.Color(0x1a2a50), bg = new THREE.Color();
function frame(now) {
  if (sandboxOn) { state.lastReal = now; requestAnimationFrame(frame); return; } // the sandbox draws itself
  const dt = now - state.lastReal; state.lastReal = now;
  state.time += dt * state.speed;
  updateSkyMatrix();
  if (mode.space) { computeHelio(); stepSpaceFlight(now); spaceKeys(dt); }
  updatePlanets();   // positions for this frame first...
  updateAsteroids(); updateSmallBodies(); updateComets3d(); updateAurora(); updateStanding(); updateProperMotion(); updateLight(); updateStations(); updateNeo(); updateStars3d(); updateGalaxy(); updateGaia(); updateHorizon(); updateArt(); updateAnalemma(); updateSkyPhoto(); updateHips();
  updateSats();
  stepFlight(now);   // ...then aim the camera at them (aiming at last frame's position made zoomed views shake)
  updateCamera();
  placePhoto();

  // brightness / limiting magnitudes scale with zoom
  const zoom = Math.log10(70 / view.fov);
  const gOn = groundOn(); ground.visible = gOn && !arStream;
  // daylight: how bright the sky is from the Sun's altitude; the day-sky setting decides what it does
  const daySky = $('daysky').value, sunlight = gOn && PLANETS[0].world ? Math.min(1, Math.max(0, (Math.asin(PLANETS[0].world.y) * R2D + 12) / 14)) : 0;
  const obsc = gOn ? solarObscuration() : 0, totality = obsc >= 0.999 ? 1 : obsc * 0.96; // sky light follows the uncovered part of the Sun
  const skyDayK = daySky === 'stars' ? 0 : sunlight * (1 - totality * 0.97);   // paints the sky blue
  const day = daySky === 'real' ? sunlight * (1 - totality * 0.97) : 0;         // washes out stars (only in the realistic setting)
  bg.copy(skyNight); renderer.setClearColor(bg);
  if (PLANETS[0].glow) PLANETS[0].glow.material.opacity = 1 - 0.9 * Math.pow(obsc, 1.5); // in totality only a faint corona-like ring is left
  skyDome.visible = gOn && daySky !== 'stars' && PLANETS[0].world && PLANETS[0].world.y > -0.33;
  if (skyDome.visible) { skyDomeMat.uniforms.sunDir.value.copy(PLANETS[0].world); skyDomeMat.uniforms.k.value = (daySky === 'both' ? 0.75 : 1) * (1 - totality * 0.97); }
  const dim = 1 - day * 0.97; washout = day;
  for (const l of linesGroup.children) l.material.opacity = 0.55 * (1 - day * 0.9);
  groundMat.uniforms.light.value = daySky === 'stars' ? 0.55 : 0.25 + 0.75 * skyDayK;
  // Bortle class sets the naked-eye limiting magnitude and how much Milky Way survives (ground mode only)
  const bortle = gOn ? +$('bortle').value : 1;
  const NELM = [7.6, 7.1, 6.6, 6.2, 5.7, 5.2, 4.7, 4.2, 3.8], MWK = [1, 0.95, 0.8, 0.55, 0.3, 0.12, 0.04, 0, 0];
  nightGlow.visible = gOn && !!PLANETS[0].world && $('t-refr').checked;
  if (nightGlow.visible) { const u = nightGlowMat.uniforms; u.sunDir.value.copy(PLANETS[0].world); u.eclPole.value.copy(eqVec(270, 66.56, 1)).transformDirection(sky.matrixWorld);
    u.lp.value = (bortle - 1) / 8; u.k.value = 1 - skyDayK; updateAuroraGround(u); }
  const atmo = gOn && $('t-refr').checked; atmoU.refractOn.value = atmo ? 1 : 0; atmoU.extK.value = atmo ? 0.25 : 0;
  if (gOn && bortle > 3) bg.lerp(new THREE.Color(0x2a2620), (bortle - 3) / 6 * 0.35 * (1 - skyDayK)); renderer.setClearColor(bg); // skyglow
  if (arStream) { renderer.setClearColor(bg, 0); skyDome.visible = false; nightGlow.visible = false; milkyWay.visible = false; }
  starMat.uniforms.limit.value = Math.min(view.fov > 30 ? 8.5 : MOBILE ? 11 : 12.5, (gOn ? NELM[bortle - 1] : 6.4) + (view.fov > 30 ? 2.2 : 3) * zoom) - day * 5; // deeper when zoomed: Gaia tiles
  mwMat.uniforms.gain.value = 3.5 * dim * MWK[bortle - 1] / Math.max(1, Math.sqrt(70 / view.fov) * 0.6);
  if (mwMat.uniforms.photo.value) mwMat.uniforms.gain.value *= Math.max(0, Math.min(1, (view.fov - 6) / 24));
  const waveOn = $('wavelen').value !== 'visible'; if (waveOn) mwMat.uniforms.gain.value = 0.95; // the photo's own stars smear into blobs when magnified: let the real stars take over
  starMat.uniforms.pr.value = renderer.getPixelRatio(); starMat.uniforms.dim.value = dim * (waveOn ? 0.18 : 1);
  starMat.uniforms.time.value = now / 1000; starMat.uniforms.twinkle.value = gOn && $('t-twinkle').checked && atmo ? (MOBILE ? 0.5 : 1) : 0;
  exoMat.uniforms.pr.value = renderer.getPixelRatio(); exoMat.uniforms.alpha.value = Math.min(1, Math.max(0, (30 - view.fov) / 20)) * (1 - day * 0.8);
  dsoMat.uniforms.pxPerDeg.value = innerHeight / view.fov; dsoMat.uniforms.pr.value = renderer.getPixelRatio();
  dsoMat.uniforms.limit.value = 7 - (gOn ? (bortle - 1) * 0.45 : 0) + 3.2 * zoom; dsoMat.uniforms.dim.value = Math.max(0.05, dim);

  renderer.clear();
  renderer.render(scene, camera);
  pcam.quaternion.copy(camera.quaternion); pcam.fov = camera.fov;
  // log depth spends its precision on distances near 1 unit: rescale the scene so the closest surface sits about 1 unit away,
  // otherwise a 20 m spacecraft seen from 20 m (2e-8 units) collapses into one depth value and its layers z-fight
  if (mode.space) { const k = 1 / Math.max(1e-12, sp.nearestAll || 1); planetScene.scale.setScalar(k); pcam.near = 1e-3; pcam.far = 1e14; }
  else { planetScene.scale.setScalar(1); pcam.near = camera.near; pcam.far = camera.far; }
  pcam.updateProjectionMatrix(); pcam.updateMatrixWorld();
  renderer.clearDepth();
  // Far objects at the near-camera scale (e.g. the Sun 172 AU away while 5 m from Voyager) sit ~1e12 units out, where
  // float32 vertices break up and shake. Pull each one in along its line of sight and shrink it by the same factor:
  // it looks identical from the camera. Log compression keeps far objects in the right depth order.
  const squeezed = [];
  if (mode.space) { const lim = 1e5 * Math.max(1e-12, sp.nearestAll || 1);
    for (const o of [...planetGroup.children, halleyTail]) { if (!o.visible) continue; const d = o.position.length(); if (d <= lim) continue;
      const f = lim * (1 + Math.log(d / lim)) / d; squeezed.push([o, o.position.clone(), o.scale.clone()]); o.position.multiplyScalar(f); o.scale.multiplyScalar(f); } }
  updateShadows();
  renderer.render(planetScene, pcam);
  for (const [o, p0, s0] of squeezed) { o.position.copy(p0); o.scale.copy(s0); }
  drawLabels(); drawEyepiece();
  $('clock').textContent = clockText(state.time) + (state.speed !== 1 ? `  (×${state.speed})` : '');
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
startTranslator();
updateSkyMatrix(); requestAnimationFrame(frame);
(async () => {
  const st = $('status'); const parts = [];
  new MutationObserver(() => { st.title = st.textContent; }).observe(st, { childList: true, characterData: true, subtree: true });
  const LOADING = ['우주를 당신에게 가져오는 중', '별 4만 1천 개를 하늘에 거는 중', '은하 1만 2천 개의 먼지를 터는 중', '보이저 1호에게 안부를 묻는 중',
    '달을 지구 쪽으로 돌려놓는 중', '토성 고리를 닦는 중', '외계행성 6천 개의 주소를 확인하는 중', '다누리와 교신하는 중', '화성 탐사차를 깨우는 중', '은하수를 펼치는 중'];
  let li = Math.floor(Math.random() * LOADING.length); $('loader-step').textContent = LOADING[li];
  const loadTimer = setInterval(() => { li = (li + 1) % LOADING.length; $('loader-step').textContent = LOADING[li]; }, 1400);
  const r = await Promise.allSettled([loadStars(), loadNGC(), loadLines(), loadExo(), loadSats()]);
  clearInterval(loadTimer);
  if (r[0].status === 'fulfilled') parts.push(`별 ${r[0].value.toLocaleString()}개`); else parts.push('별 카탈로그 실패');
  if (r[1].status === 'fulfilled') parts.push(`NGC/IC 천체 ${r[1].value.toLocaleString()}개`); else parts.push('OpenNGC 실패');
  if (r[3].status === 'fulfilled') parts.push(`외계행성 ${r[3].value.toLocaleString()}개`);
  if (r[4].status === 'fulfilled' && r[4].value) parts.push(`인공위성 ${r[4].value}개`);
  st.textContent = parts.join(' · ');
  document.body.classList.add('ready');
  buildSearch();
  readHash();
  if (/[#&]sb=/.test(location.hash)) setSandbox(true).then(() => sandboxMod.sceneFromHash()); // a shared sandbox scene
  loadKorean().then(applySkyCulture).catch(() => {});
})();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
