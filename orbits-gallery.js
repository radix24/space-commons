// Orbit gallery (다양한 궤도 사례) and the Korean satellite orbit design lab (한국 위성 궤도 설계 실습).
// Each case runs its own small calculation on a canvas in the lab panel. Three-body cases use the circular restricted problem
// in the co-rotating frame with real mass ratios; Earth orbits use two-body motion plus the J2 nodal precession.
import { api, helpers } from './sandbox-plus.js';
import { C, canvas, loop, txt, numTxt, slider, para, rk4, scratch, cr3bp, lagrangeX, D2R, R2D } from './sb-kit.js';

const MU = { SE: 3.0404e-6, EM: 0.0121505856, SJ: 9.5388e-4 };   // m2 / (m1 + m2): Sun-(Earth+Moon), Earth-Moon, Sun-Jupiter
const KM = { SE: 149597870.7, EM: 384400, SJ: 778.5e6 };
const MUE = 398600.4418, RE = 6378.137, J2 = 1.08263e-3, WE = 7.2921159e-5;
// integrate a CR3BP path, returning a Float64Array of x, y, z samples
function path(mu, y0, T, n = 1200, sub = 20) {
  const f = cr3bp(mu), y = Float64Array.from(y0), s = scratch(6), out = new Float64Array(n * 3), h = T / (n * sub);
  for (let i = 0; i < n; i++) { out[i * 3] = y[0]; out[i * 3 + 1] = y[1]; out[i * 3 + 2] = y[2]; for (let k = 0; k < sub; k++) rk4(f, y, h, s); }
  return out;
}
// linear Lissajous about a collinear point (Richardson 1980 linearisation): in-plane frequency λ, out-of-plane ν, in-plane ratio k
function lissajous(mu, Lk, Ax, Az, n = 1600, T = 40, halo = false) {
  const Lx = lagrangeX(mu, Lk), g = Math.abs(Lx - 1 + mu), c2 = (mu + (1 - mu) * g ** 3 / (Lk === 2 ? (1 + g) ** 3 : (1 - g) ** 3)) / g ** 3;
  const lam = Math.sqrt((2 - c2 + Math.sqrt((c2 - 2) ** 2 + 4 * (c2 - 1) * (1 + 2 * c2))) / 2), k = (lam * lam + 1 + 2 * c2) / (2 * lam), nu = Math.sqrt(c2), out = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) { const t = T * i / n; out[i * 3] = Lx - Ax * Math.cos(lam * t); out[i * 3 + 1] = k * Ax * Math.sin(lam * t); out[i * 3 + 2] = Az * Math.sin((halo ? lam : nu) * t); }
  return { out, lam, nu, Lx };
}

const CASES = [
  ['halo-se2', '태양-지구 L2 헤일로 궤도 (제임스 웹)', '지구에서 태양 반대쪽으로 약 150만 km 떨어진 L2점 둘레를 도는 궤도입니다. 태양·지구와 함께 돌아가는 좌표(공전 좌표계)로 보면 고리 모양이고, 지구 그림자에 들어가지 않아 늘 태양전지가 빛을 받습니다. 제임스 웹 우주망원경이 이런 궤도를 약 6개월마다 한 바퀴 돕니다.'],
  ['halo-se1', '태양-지구 L1 헤일로 궤도 (태양 관측선)', 'L1점은 지구에서 태양 쪽으로 약 150만 km 떨어져 있습니다. SOHO와 ACE 같은 태양 관측선이 이 둘레를 돌며 태양풍을 지구보다 약 한 시간 먼저 잽니다.'],
  ['liss-se2', '태양-지구 L2 리사주 궤도', '궤도면 안과 밖의 진동 주기가 조금 달라 매번 다른 길을 그리는 궤도입니다(선형 근사). 가이아와 허셜 망원경이 이런 궤도를 썼습니다.'],
  ['halo-em2', '지구-달 L2 헤일로 궤도', '달 뒤쪽 약 6만 km의 L2점 둘레 궤도입니다. 달 뒷면에서도 지구가 보이므로 중계 위성(창어 4호의 췌차오)이 이 궤도에서 신호를 이어 줍니다.'],
  ['trojan', '목성의 트로이 소행성 (L4, L5)', '목성보다 60° 앞(L4)과 뒤(L5)에 소행성 무리가 모여 있습니다. 공전 좌표계에서 보면 각 소행성이 올챙이 모양(tadpole)으로 그 자리 둘레를 천천히 오갑니다. 실제로 1만 개 넘게 알려져 있고 루시 탐사선이 찾아가고 있습니다.'],
  ['horseshoe', '말굽 궤도와 올챙이 궤도', '지구와 거의 같은 거리에서 도는 작은 천체는 지구를 따라잡았다가 밀려나 돌아가기를 반복하며 말굽 모양을 그립니다 (소행성 2002 AA29, 크루이트네의 사촌). 지구에서 조금 더 가까이 L4 근처에서 시작하면 올챙이 모양이 됩니다. 반지름 방향은 크게 늘려 그렸습니다.'],
  ['sso', '태양동기 궤도 (아리랑)', '경사각 약 98°의 궤도면이 지구의 적도 부풀음(J2) 때문에 하루 0.986°씩 돌아, 1년에 한 바퀴로 태양을 따라갑니다. 그래서 매일 같은 지방시에 같은 곳 위를 지나 그림자 방향이 같은 영상을 찍습니다.'],
  ['molniya', '몰니야 궤도', '경사각 63.4°, 주기 12시간의 길쭉한 궤도입니다. 이 경사각에서는 근지점이 돌지 않아, 원지점이 늘 북쪽 고위도 위에 머물며 8시간 넘게 러시아 북부를 내려다봅니다.'],
  ['geo', '정지궤도 (천리안)', '적도 위 35,786 km에서 지구 자전과 같은 빠르기로 돌아 하늘의 한 점에 멈춰 있는 것처럼 보입니다. 천리안 2A·2B는 동경 128.2°에 있습니다.'],
  ['tundra', '툰드라 궤도', '주기가 하루(23시간 56분)인 경사·이심 궤도입니다. 지상 궤적이 8자 모양으로 고위도에 오래 머뭅니다. 시리우스 XM 위성 라디오가 썼습니다.'],
  ['freereturn', '자유 귀환 궤도 (아폴로)', '달 뒤를 돌아 엔진을 켜지 않아도 지구로 돌아오는 궤도입니다. 지구-달 공전 좌표계에서 8자 모양이 됩니다. 아폴로 13호는 사고 뒤 이 궤도로 돌아왔습니다.'],
  ['assist', '중력 도움 (스윙바이)', '행성 기준으로는 들어올 때와 나갈 때 빠르기가 같지만 방향이 꺾입니다. 행성의 공전 속도를 더하면 태양 기준 빠르기가 달라집니다. 행성 뒤쪽을 지나면 빨라지고 앞쪽을 지나면 느려집니다.'],
  ['bielliptic', '호만 전이와 이중 타원 전이', '두 원 궤도 사이를 옮길 때, 반지름 비가 11.94보다 크면 아주 멀리 갔다가 돌아오는 이중 타원 전이가 연료를 덜 쓸 수 있습니다 (시간은 훨씬 오래 걸립니다).'],
];

export function openGallery(start) {
  const A = api(), h = helpers(), box = A.labBox('다양한 궤도 사례', '실제 임무에 쓰이는 궤도들을 준비해 두었습니다. 3체 궤도는 실제 질량비로 계산하고, 함께 돌아가는 좌표계(공전 좌표계)에서 보여 줍니다.');
  const sel = A.el('select', 'sb-orbsel'); for (const [k, t] of CASES) sel.append(new Option(t, k)); h.field(box, '사례', sel);
  const info = para(h, box, ''), ctl = A.el('div'); box.append(ctl);
  const cv = canvas(h, box, 340, 260), set = h.results(box); let cur = null, view = { yaw: 0.6, pitch: 0.5, auto: false }; // no automatic turning: drag to turn
  cv.c.addEventListener('pointermove', (e) => { if (e.buttons) { view.yaw += e.movementX * 0.01; view.pitch = Math.max(-1.5, Math.min(1.5, view.pitch + e.movementY * 0.01)); view.auto = false; } });
  const choose = () => { const c = CASES.find(x => x[0] === sel.value); info.textContent = c[2]; ctl.innerHTML = ''; cur = build(sel.value, ctl, set); };
  sel.onchange = choose; if (start) sel.value = start; choose();
  loop(cv, (dt) => { if (view.auto) view.yaw += dt * 0.25; const { g, w, h: H } = cv; g.fillStyle = C.bg; g.fillRect(0, 0, w, H); cur?.draw(g, w, H, dt, view); });
}

// 3D → 2D projection with yaw about z and pitch about x
const proj = (view, x, y, z, s, cx, cy) => { const cy_ = Math.cos(view.yaw), sy = Math.sin(view.yaw), cp = Math.cos(view.pitch), sp = Math.sin(view.pitch);
  const X = x * cy_ - y * sy, Y = x * sy + y * cy_; return [cx + X * s, cy - (z * cp - Y * sp) * s]; };
function poly(g, pts, view, s, cx, cy, ox, oy, oz, col, lw = 1.2, n = pts.length / 3) {
  g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); for (let i = 0; i < n; i++) { const p = proj(view, pts[i * 3] - ox, pts[i * 3 + 1] - oy, pts[i * 3 + 2] - oz, s, cx, cy); i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); } g.stroke();
}
const dotAt = (g, p, r, col) => { g.fillStyle = col; g.beginPath(); g.arc(p[0], p[1], r, 0, 7); g.fill(); };

function build(k, ctl, set) {
  const A = api(), h = helpers(), fmt = A.fmt;
  if (k.startsWith('halo') || k === 'liss-se2') {
    const sys = k === 'halo-em2' ? 'EM' : 'SE', mu = MU[sys], Lk = k === 'halo-se1' ? 1 : 2, Lx = lagrangeX(mu, Lk), key = sys + Lk;
    let pts, T, note;
    if (k === 'liss-se2') { const L = lissajous(mu, 2, 0.0013, 0.0009); pts = L.out; T = 2 * Math.PI / L.lam; note = `면 안 주기 ${fmt(T / (2 * Math.PI) * 365.25, 0)}일 · 면 밖 주기 ${fmt(2 * Math.PI / L.nu / (2 * Math.PI) * 365.25, 0)}일 (선형 근사)`; }
    else { const g = Math.abs(Lx - 1 + mu), ax = g * (sys === 'EM' ? 0.17 : 0.13), az = g * (sys === 'EM' ? 0.2 : 0.1); T = 2 * Math.PI / lissajous(mu, Lk, ax, az, 2, 1, true).lam; pts = lissajous(mu, Lk, ax, az, 600, T, true).out;
      note = `주기 약 ${fmt(T / (2 * Math.PI) * (sys === 'EM' ? 27.32 : 365.25), 1)}일 (선형 근사: 면 안팎 진동수를 같게 맞춘 헤일로 모양)`; void key; }
    let ax = 0, az = 0; for (let i = 0; i < pts.length / 3; i++) { ax = Math.max(ax, Math.abs(pts[i * 3 + 1])); az = Math.max(az, Math.abs(pts[i * 3 + 2])); }
    set([['계', sys === 'EM' ? '지구-달 (질량비 0.01215)' : '태양-지구 (질량비 3.04×10⁻⁶)'], [`L${Lk}점 거리`, `${sys === 'EM' ? '달' : '지구'}에서 ${fmt(Math.abs(Lx - 1 + mu) * KM[sys], 0)} km`], ['궤도 크기 (y, z 방향 최대)', `${fmt(ax * KM[sys], 0)} km · ${fmt(az * KM[sys], 0)} km`], ['한 바퀴', note], ['보기', '공전 좌표계 · 끌어서 돌려 보기']]);
    let t = 0; const n = pts.length / 3, small = 1 - mu;
    return { draw(g, w, H, dt, view) { t = (t + dt * 0.08) % 1; const sc = Math.min(w, H) * 0.42 / Math.max(Math.abs(Lx - small) * 1.2, ax * 1.3), cx = w / 2, cy = H / 2, ox = (Lx + small) / 2;
      g.strokeStyle = C.grid; g.lineWidth = 1; const a = proj(view, -2, 0, 0, sc, cx, cy), b = proj(view, 2, 0, 0, sc, cx, cy); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
      poly(g, pts, view, sc, cx, cy, ox, 0, 0, C.acc);
      const pb = proj(view, small - ox, 0, 0, sc, cx, cy), pl = proj(view, Lx - ox, 0, 0, sc, cx, cy), i = Math.floor(t * n), ps = proj(view, pts[i * 3] - ox, pts[i * 3 + 1], pts[i * 3 + 2], sc, cx, cy);
      dotAt(g, pb, 5, sys === 'EM' ? '#b5aa9c' : '#6fa8ff'); txt(g, sys === 'EM' ? '달' : '지구', pb[0] + 7, pb[1] - 6, C.ink, 10); g.strokeStyle = C.brass; g.strokeRect(pl[0] - 3, pl[1] - 3, 6, 6); txt(g, `L${Lk}`, pl[0] + 6, pl[1] + 12, C.brass, 10);
      dotAt(g, ps, 3, '#fff'); txt(g, sys === 'EM' ? '← 지구 방향' : (Lk === 2 ? '← 태양 방향' : '태양 방향 ←'), 8, H - 8, C.mute, 9); } };
  }
  if (k === 'trojan' || k === 'horseshoe') {
    const sj = k === 'trojan', mu = sj ? MU.SJ : MU.SE, f = cr3bp(mu), s = scratch(6), N = sj ? 160 : 2, Y = new Float64Array(N * 6);
    if (sj) for (let i = 0; i < N; i++) { const L5 = i % 2, th = (L5 ? -60 : 60) * D2R + (Math.random() - 0.5) * 0.5, r = 1 + (Math.random() - 0.5) * 0.04, x = r * Math.cos(th) - mu, y = r * Math.sin(th), vf = 1 / Math.sqrt(r) - r;
      Y.set([x, y, (Math.random() - 0.5) * 0.02, -y * vf, x * vf + mu * vf, 0], i * 6); }
    else { const d1 = 0.0012, d2 = 0.00025; for (const [i, r, th] of [[0, 1 + d1, 180 * D2R], [1, 1 + d2, 60 * D2R]]) { const x = r * Math.cos(th) - mu, y = r * Math.sin(th), vf = 1 / Math.sqrt(r) - r; Y.set([x, y, 0, -y * vf, x * vf + mu * vf, 0], i * 6); } }
    const trailN = sj ? 0 : 6000, tr = [new Float32Array(trailN * 2), new Float32Array(trailN * 2)], tn = [0, 0], y6 = new Float64Array(6); let years = 0;
    set([['계', sj ? '태양-목성 (질량비 9.54×10⁻⁴)' : '태양-지구 (질량비 3.04×10⁻⁶)'], ['보기', sj ? '공전 좌표계 · 목성은 오른쪽에 고정' : '공전 좌표계 · 반지름 방향을 400배 늘림'], ['흐른 시간', '-']]);
    return { draw(g, w, H, dt) {
      const steps = sj ? 6 : 220, hh = sj ? 0.05 : 0.08;
      for (let i = 0; i < N; i++) { for (let q = 0; q < 6; q++) y6[q] = Y[i * 6 + q]; for (let k2 = 0; k2 < steps; k2++) rk4(f, y6, hh, s); for (let q = 0; q < 6; q++) Y[i * 6 + q] = y6[q];
        if (!sj) { const r = Math.hypot(y6[0] + mu, y6[1]), th = Math.atan2(y6[1], y6[0] + mu); const j = tn[i] % trailN; tr[i][j * 2] = r; tr[i][j * 2 + 1] = th; tn[i]++; } }
      years += steps * hh / (2 * Math.PI) * (sj ? 11.86 : 1);
      const cx = w / 2, cy = H / 2, R = Math.min(w, H) * 0.4, ex = sj ? 1 : 400, map = (r, th) => [cx + R * (1 + (r - 1) * ex) * Math.cos(th), cy - R * (1 + (r - 1) * ex) * Math.sin(th)];
      g.strokeStyle = C.grid; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.stroke(); dotAt(g, [cx, cy], 5, C.star); txt(g, '태양', cx + 7, cy + 4, C.mute, 9);
      const pp = map(1, 0); dotAt(g, pp, 4, sj ? '#d9b48a' : '#6fa8ff'); txt(g, sj ? '목성' : '지구', pp[0] - 12, pp[1] - 8, C.ink, 10);
      for (const [a, l] of [[60, 'L4'], [-60, 'L5']]) { const p = map(1, a * D2R); g.strokeStyle = C.brass; g.strokeRect(p[0] - 3, p[1] - 3, 6, 6); txt(g, l, p[0] + 6, p[1] + 3, C.brass, 10); }
      if (sj) { g.fillStyle = 'rgba(201,168,106,.9)'; for (let i = 0; i < N; i++) { const x = Y[i * 6] + mu, y = Y[i * 6 + 1]; g.fillRect(cx + R * x - 1, cy - R * y - 1, 2, 2); } }
      else for (let i = 0; i < 2; i++) { g.strokeStyle = i ? C.brass : C.acc; g.lineWidth = 1.2; g.beginPath(); const n = Math.min(tn[i], trailN), o = tn[i] > trailN ? tn[i] % trailN : 0;
        for (let q = 0; q < n; q++) { const j = (o + q) % trailN, p = map(tr[i][j * 2], tr[i][j * 2 + 1]); q ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); } g.stroke(); }
      if (!sj) { txt(g, '파랑: 말굽 궤도', 8, 14, C.acc, 10); txt(g, '금색: 올챙이 궤도 (L4)', 8, 28, C.brass, 10); }
      set([['계', sj ? '태양-목성 (질량비 9.54×10⁻⁴)' : '태양-지구 (질량비 3.04×10⁻⁶)'], ['보기', sj ? '공전 좌표계 · 목성은 오른쪽에 고정' : '공전 좌표계 · 반지름 방향을 400배 늘림'], ['흐른 시간', `${fmt(years, 0)}년`]]); } };
  }
  if (['sso', 'molniya', 'geo', 'tundra'].includes(k)) return earthCase(k, set);
  if (k === 'freereturn') return freeReturn(set);
  if (k === 'assist') return assist(ctl, set);
  return bielliptic(ctl, set);
}

// ---- Earth orbits: 3D view of the orbit about Earth plus a ground track ----
const EORB = { sso: { a: RE + 685, e: 0, i: 98.13, w: 0, name: '아리랑 3호와 비슷한 궤도' }, molniya: { a: 26554, e: 0.74, i: 63.4, w: 270, name: '몰니야' }, geo: { a: 42164, e: 0, i: 0.05, w: 0, name: '천리안 2A', lon: 128.2 }, tundra: { a: 42164, e: 0.27, i: 63.4, w: 270, name: '툰드라' } };
const map = new Image(); map.src = 'textures/2k_earth_daymap.jpg';
function track(o, T, n) { // ground track: [lon, lat] pairs over T seconds (J2 on node and perigee)
  const a = o.a, e = o.e, i = o.i * D2R, nn = Math.sqrt(MUE / a ** 3), p = a * (1 - e * e), dO = -1.5 * nn * J2 * (RE / p) ** 2 * Math.cos(i), dw = 0.75 * nn * J2 * (RE / p) ** 2 * (5 * Math.cos(i) ** 2 - 1), out = new Float32Array(n * 2), xyz = new Float32Array(n * 3);
  for (let q = 0; q < n; q++) { const t = T * q / n, M = nn * t; let E = M; for (let k = 0; k < 12; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2)), r = a * (1 - e * Math.cos(E)), u = nu + o.w * D2R + dw * t, O = dO * t + (o.lon ? o.lon * D2R : 0);
    const x = r * (Math.cos(O) * Math.cos(u) - Math.sin(O) * Math.sin(u) * Math.cos(i)), y = r * (Math.sin(O) * Math.cos(u) + Math.cos(O) * Math.sin(u) * Math.cos(i)), z = r * Math.sin(u) * Math.sin(i);
    xyz[q * 3] = x; xyz[q * 3 + 1] = y; xyz[q * 3 + 2] = z; out[q * 2] = ((Math.atan2(y, x) - WE * t) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI; out[q * 2 + 1] = Math.asin(z / r); }
  return { out, xyz, P: 2 * Math.PI / nn, dO, dw };
}
function earthCase(k, set) {
  const A = api(), o = EORB[k], T = k === 'sso' ? 86400 : 2 * 86400, tk = track(o, T, 1400), fmt = A.fmt;
  set([['예', o.name], ['높이', o.e ? `근지점 ${fmt(o.a * (1 - o.e) - RE, 0)} km · 원지점 ${fmt(o.a * (1 + o.e) - RE, 0)} km` : `${fmt(o.a - RE, 0)} km`], ['경사각', `${o.i}°`], ['주기', `${fmt(tk.P / 3600, 2)}시간`], ['궤도면이 도는 빠르기 (J2)', `하루 ${fmt(tk.dO * 86400 * R2D, 3)}°`], ['근지점이 도는 빠르기', `하루 ${fmt(tk.dw * 86400 * R2D, 3)}°`]]);
  let t = 0; const n = tk.xyz.length / 3;
  return { draw(g, w, H, dt, view) { t = (t + dt * 0.05) % 1; const top = H * 0.58, sc = top * 0.45 / (o.a * (1 + o.e)), cx = w / 2, cy = top / 2;
    g.fillStyle = '#1d3a6a'; g.beginPath(); g.arc(cx, cy, RE * sc, 0, 7); g.fill(); g.strokeStyle = '#3d6aa8'; g.stroke();
    const eq = new Float64Array(180); for (let q = 0; q < 60; q++) { const th = q / 59 * 2 * Math.PI; eq[q * 3] = RE * 1.0 * Math.cos(th); eq[q * 3 + 1] = RE * Math.sin(th); } poly(g, eq, view, sc, cx, cy, 0, 0, 0, '#5a7fb8', 1, 60);
    poly(g, tk.xyz, view, sc, cx, cy, 0, 0, 0, C.acc, 1.1, Math.min(n, k === 'sso' ? 120 : n));
    const i = Math.floor(t * n); dotAt(g, proj(view, tk.xyz[i * 3], tk.xyz[i * 3 + 1], tk.xyz[i * 3 + 2], sc, cx, cy), 3, '#fff');
    const my = top + 4, mh = H - my - 2; if (map.complete && map.naturalWidth) g.drawImage(map, 0, my, w, mh); g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(0, my, w, mh);
    g.strokeStyle = 'rgba(143,184,201,.9)'; g.lineWidth = 1; g.beginPath(); let prev = null;
    for (let q = 0; q < n; q++) { const lo = tk.out[q * 2], la = tk.out[q * 2 + 1], X = (lo * R2D + 180) / 360 * w, Y = my + (90 - la * R2D) / 180 * mh; if (prev != null && Math.abs(lo - prev) > Math.PI) g.moveTo(X, Y); else if (prev == null) g.moveTo(X, Y); else g.lineTo(X, Y); prev = lo; }
    g.stroke(); const lo = tk.out[i * 2], la = tk.out[i * 2 + 1]; dotAt(g, [(lo * R2D + 180) / 360 * w, my + (90 - la * R2D) / 180 * mh], 3, '#fff'); txt(g, '지상 궤적', 4, my + 12, C.ink, 9); } };
}

// ---- free return: an Apollo-like figure eight in the Earth-Moon rotating frame, found by a search over the departure point ----
function freeReturn(set) {
  const A = api(), mu = MU.EM, f = cr3bp(mu), s = scratch(6), r0 = (RE + 185) / KM.EM, tu = 27.32 / (2 * Math.PI); let best = null, th = -Math.PI, pts = null;
  const fly = (theta, vp, keep) => { const x = -mu + r0 * Math.cos(theta), y = r0 * Math.sin(theta), vi = vp; // inertial speed vp tangential (prograde), then into the rotating frame
    const Y = Float64Array.of(x, y, 0, -vi * Math.sin(theta) + y, vi * Math.cos(theta) - (x), 0); let t = 0, dm = 9, de = 9, left = false, out = keep ? [] : null;
    while (t < 3.2) { const r1 = Math.hypot(Y[0] + mu, Y[1]), r2 = Math.hypot(Y[0] - 1 + mu, Y[1]), hh = Math.min(0.002, 0.02 * Math.min(r1, r2) ** 1.5); rk4(f, Y, hh, s); t += hh; if (out && out.length < 30000) out.push(Y[0], Y[1]);
      if (r2 < dm) dm = r2; if (r1 > 0.5) left = true; if (left && r1 < de) de = r1; if (r2 < 1738 / KM.EM || (left && r1 < RE / KM.EM)) break; }
    return { dm, de, out }; };
  const vp = Math.sqrt((1 - mu) * (2 / r0 - 2 / (r0 + 1.03))) * 1.0005; let vbest = vp;
  set([['상태', '궤도를 찾는 중...']]);
  let done = false, step = 0;
  const work = () => { if (done) return; for (let q = 0; q < 6 && th < Math.PI; q++, th += 2 * Math.PI / 240) { for (const k of [0.999, 1, 1.001]) { const r = fly(th, vp * k, false), ok = r.dm > 1838 / KM.EM && r.dm < 0.04 && r.de < 1;
      const sc = ok ? Math.abs(r.de - (RE + 60) / KM.EM) : 9; if (!best || sc < best.sc) best = { sc, th, v: vp * k, dm: r.dm, de: r.de }; } }
    step++; if (th < Math.PI) return; done = true; vbest = best.v; pts = fly(best.th, best.v, true).out;
    set([['계', '지구-달 (질량비 0.01215), 공전 좌표계'], ['출발', `고도 185 km에서 ${A.fmt(best.v * KM.EM / (tu * 86400), 3)} km/s (달 전이 분사 뒤)`], ['달에 가장 가까이', `달 표면에서 ${A.fmt(best.dm * KM.EM - 1738, 0)} km`], ['돌아왔을 때 근지점 고도', `${A.fmt(best.de * KM.EM - RE, 0)} km`], ['주의', '평면 원 궤도 3체 모형 · 실제 아폴로는 달 궤도에 들어갈 때 분사했습니다']]); };
  let t = 0;
  return { draw(g, w, H, dt) { work(); const sc = w * 0.62, cx = w * 0.28, cy = H / 2, X = (x) => cx + (x + mu) * sc, Y = (y) => cy - y * sc;
    dotAt(g, [X(-mu), Y(0)], 5, '#6fa8ff'); txt(g, '지구', X(-mu) - 10, Y(0) + 16, C.ink, 10); dotAt(g, [X(1 - mu), Y(0)], 3, '#b5aa9c'); txt(g, '달', X(1 - mu) + 6, Y(0) - 6, C.ink, 10);
    if (!pts) { txt(g, '자유 귀환 궤도를 찾는 중...', 10, 16, C.mute, 11); return; } t = (t + dt * 0.12) % 1;
    g.strokeStyle = C.acc; g.lineWidth = 1.2; g.beginPath(); for (let i = 0; i < pts.length; i += 2) i ? g.lineTo(X(pts[i]), Y(pts[i + 1])) : g.moveTo(X(pts[i]), Y(pts[i + 1])); g.stroke();
    const i = Math.floor(t * pts.length / 2) * 2; dotAt(g, [X(pts[i]), Y(pts[i + 1])], 3, '#fff'); void vbest; void step; } };
}

// ---- gravity assist: patched conic at Jupiter ----
function assist(ctl, set) {
  const A = api(), h = helpers(), muJ = 1.26687e8, Vp = 13.07, vinf = slider(h, A, ctl, '들어오는 상대 속도 v∞ (km/s)', 5.6, 1, 15, 0.1), rp = slider(h, A, ctl, '가장 가까울 때 (목성 반지름)', 6, 1.1, 40, 0.1, '1.1:1.1|6:6|40:40');
  const side = A.el('select'); side.append(new Option('목성 뒤쪽 (빨라짐)', '1'), new Option('목성 앞쪽 (느려짐)', '-1')); h.field(ctl, '지나가는 쪽', side);
  let t = 0;
  return { draw(g, w, H, dt) { t = (t + dt * 0.15) % 1; const v = +vinf.value, r = +rp.value * 71492, sg = +side.value, fb = A.O.flyby(muJ, v, r), d = fb.delta;
    // incoming v∞ at angle so that sun-frame speed in is Voyager-like; out = rotated by ±δ
    const ain = Math.PI * 0.75, aout = ain - sg * d, vin = [Vp + v * Math.cos(ain), v * Math.sin(ain)], vout = [Vp + v * Math.cos(aout), v * Math.sin(aout)];
    const cx = w * 0.3, cy = H * 0.5, s = 8; g.strokeStyle = C.grid; g.beginPath(); g.moveTo(10, cy); g.lineTo(w * 0.58, cy); g.stroke(); txt(g, '목성 기준 경로', 8, 14, C.mute, 10);
    dotAt(g, [cx, cy], 6, '#d9b48a'); const e = fb.e, p = r * (e * e - 1) / e / e, nuMax = Math.acos(-1 / e) * 0.97;   // hyperbola in the planet frame, scaled to fit
    g.strokeStyle = C.acc; g.lineWidth = 1.3; g.beginPath(); const K = 60 / Math.max(r * 3, 71492 * 8);
    for (let q = 0; q <= 100; q++) { const nu = -nuMax + 2 * nuMax * q / 100, rr = r * (1 + e) / (1 + e * Math.cos(nu)), ang = nu * sg + (ain + aout) / 2 + Math.PI; const x = cx + rr * K * Math.cos(ang), y = cy - rr * K * Math.sin(ang); q ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); void p; void t;
    const ox = w * 0.62, oy = H * 0.72; txt(g, '태양 기준 속도 (km/s)', ox, 14, C.mute, 10);
    const arrow = (x0, y0, vx, vy, col, lb) => { g.strokeStyle = col; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + vx * s, y0 - vy * s); g.stroke(); dotAt(g, [x0 + vx * s, y0 - vy * s], 2.5, col); txt(g, lb, x0 + vx * s + 3, y0 - vy * s, col, 9); };
    arrow(ox, oy, Vp, 0, C.brass, '목성'); arrow(ox, oy, vin[0], vin[1], '#9aa0b8', '들어옴'); arrow(ox, oy, vout[0], vout[1], C.acc, '나감');
    const si = Math.hypot(...vin), so = Math.hypot(...vout);
    set([['꺾이는 각', `${A.fmt(d * R2D, 1)}°`], ['목성 기준 빠르기', `${A.fmt(v, 2)} → ${A.fmt(v, 2)} km/s (같음)`], ['태양 기준 빠르기', `${A.fmt(si, 2)} → ${A.fmt(so, 2)} km/s (${so >= si ? '+' : ''}${A.fmt(so - si, 2)})`], ['목성 공전 속도', `${Vp} km/s`]]); } };
}

// ---- Hohmann versus bi-elliptic ----
function bielliptic(ctl, set) {
  const A = api(), h = helpers(), R = slider(h, A, ctl, '바깥 궤도 / 안쪽 궤도 반지름 비 R', 15, 2, 60, 0.5, '2:2|11.94:11.94|15.58:15.58|60:60'), B = slider(h, A, ctl, '중간 원지점 / 바깥 궤도 반지름', 3, 1, 10, 0.1);
  const hoh = (R) => (Math.sqrt(2 * R / (1 + R)) - 1) + (1 / Math.sqrt(R)) * (1 - Math.sqrt(2 / (1 + R)));
  const bi = (R, b) => { const rb = R * b; return (Math.sqrt(2 * rb / (1 + rb)) - 1) + Math.sqrt(2 / rb) * (Math.sqrt(1 / (1 + rb)) * 1 - Math.sqrt(R / (R + rb)) * 1) * -1 * -1 + (Math.sqrt(2 * rb / (R * (R + rb))) - Math.sqrt(1 / R)); };
  const biT = (R, b) => { const rb = R * b; return Math.sqrt(2 / rb) * Math.abs(Math.sqrt(R / (R + rb)) - Math.sqrt(1 / (1 + rb))); };
  const total = (R, b) => (Math.sqrt(2 * R * b / (1 + R * b)) - 1) + biT(R, b) + Math.abs(Math.sqrt(2 * R * b / (R * (R + R * b))) - Math.sqrt(1 / R));
  void bi;
  return { draw(g, w, H) { const r = +R.value, b = +B.value, dh = hoh(r), db = total(r, b), Th = Math.PI * Math.sqrt(((1 + r) / 2) ** 3), Tb = Math.PI * (Math.sqrt(((1 + r * b) / 2) ** 3) + Math.sqrt(((r + r * b) / 2) ** 3));
    const X = (x) => 30 + (x - 2) / 58 * (w - 40), lo = 0.25, hi = 0.6, Y = (v) => H * 0.55 - (v - lo) / (hi - lo) * (H * 0.5);
    g.strokeStyle = C.grid; g.beginPath(); g.moveTo(30, Y(lo)); g.lineTo(w - 10, Y(lo)); g.stroke();
    const curve = (fn, col) => { g.strokeStyle = col; g.lineWidth = 1.5; g.beginPath(); for (let q = 0; q <= 120; q++) { const x = 2 + 58 * q / 120, y = fn(x); q ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)); } g.stroke(); };
    curve(hoh, C.brass); curve((x) => total(x, b), C.acc); curve((x) => Math.sqrt(2) - 1 + (Math.sqrt(2) - 1) / Math.sqrt(x) * 1, 'rgba(154,160,184,.6)');
    g.strokeStyle = '#fff'; g.beginPath(); g.moveTo(X(r), Y(lo)); g.lineTo(X(r), Y(hi)); g.stroke();
    txt(g, '금색: 호만 · 파랑: 이중 타원 · 회색: 무한히 멀리 갔다 오기', 8, 12, C.mute, 9); txt(g, 'Δv / 안쪽 원 궤도 속도', 8, 24, C.mute, 9); numTxt(g, 'R →', w - 12, Y(lo) + 12, C.mute, 9, 'right');
    // the orbits themselves, to scale on the bottom half
    const cy = H * 0.8, sc = (H * 0.18) / (r * b), cx = w / 2; g.lineWidth = 1;
    for (const [rr, col] of [[1, '#6fa8ff'], [r, '#9aa0b8']]) { g.strokeStyle = col; g.beginPath(); g.ellipse(cx, cy, rr * sc, rr * sc, 0, 0, 7); g.stroke(); }
    g.strokeStyle = C.acc; g.beginPath(); g.ellipse(cx - ((r * b - 1) / 2) * sc, cy, (1 + r * b) / 2 * sc, Math.sqrt(r * b) * sc, 0, 0, 7); g.stroke(); dotAt(g, [cx, cy], 2, C.star);
    set([['호만 전이', `Δv ${A.fmt(dh, 4)} · 시간 ${A.fmt(Th / (2 * Math.PI), 2)} 안쪽 주기`], ['이중 타원 전이', `Δv ${A.fmt(db, 4)} · 시간 ${A.fmt(Tb / (2 * Math.PI), 2)} 안쪽 주기`], ['더 적게 쓰는 쪽', db < dh ? `이중 타원 (${A.fmt((1 - db / dh) * 100, 2)}% 절약)` : '호만']]); } };
}

// ---------------- Korean satellite orbit design ----------------
const KSAT = { k3: ['아리랑 3호 (KOMPSAT-3)', 685, 98.13, '오후 1시 30분 승교점'], k3a: ['아리랑 3A호 (KOMPSAT-3A)', 528, 97.51, '오후 1시 30분 승교점'], k5: ['아리랑 5호 (KOMPSAT-5, 새벽-황혼)', 550, 97.6, '오전 6시 승교점'] };
export function openKorSat() {
  const A = api(), h = helpers(), fmt = A.fmt, box = A.labBox('한국 위성 궤도 설계 실습', '태양동기 궤도(아리랑)와 정지궤도(천리안)를 직접 설계하고 실제 위성과 비교합니다.');
  h.steps(box, ['태양동기 궤도: 높이를 정하면 궤도면이 하루 0.9856°씩 돌기 위한 경사각이 정해집니다. 경사각을 바꿔 그 값에 맞춰 보세요.', '그림은 1년 동안 태양 방향(금색)과 궤도면(파랑)이 어떻게 도는지 북극 위에서 본 모습입니다. 둘의 각이 그대로면 성공입니다.', '정지궤도: 높이와 경도를 바꿔 하루에 몇 °씩 떠내려가는지 보세요.']);
  box.append(A.el('div', 'sb-sec', '<span>태양동기 궤도</span>'));
  const ref = A.el('select'); for (const [k, v] of Object.entries(KSAT)) ref.append(new Option(v[0], k)); h.field(box, '비교할 실제 위성', ref);
  const alt = slider(h, A, box, '높이 (km)', 600, 300, 1200, 1), inc = slider(h, A, box, '경사각 (°)', 97, 90, 105, 0.01);
  const cv = canvas(h, box, 340, 200), set = h.results(box);
  box.append(A.el('div', 'sb-sec', '<span>정지궤도</span>'));
  const galt = slider(h, A, box, '높이 (km)', 35786, 35000, 36600, 1), glon = slider(h, A, box, '동경 (°)', 128.2, 100, 160, 0.1), cv2 = canvas(h, box, 340, 120), set2 = h.results(box);
  box.append(h.btn('지구 궤도 사례 보기 →', () => openGallery('sso')));
  const draw = () => { const a = RE + +alt.value, i = +inc.value * D2R, n = Math.sqrt(MUE / a ** 3), dO = -1.5 * n * J2 * (RE / a) ** 2 * Math.cos(i), need = 2 * Math.PI / (365.2422 * 86400);
    const ireq = Math.acos(-need / (1.5 * n * J2 * (RE / a) ** 2)) * R2D, r = KSAT[ref.value], ar = RE + r[1], nr = Math.sqrt(MUE / ar ** 3), ireqR = Math.acos(-need / (1.5 * nr * J2 * (RE / ar) ** 2)) * R2D;
    const { g, w, h: H } = cv; g.fillStyle = C.bg; g.fillRect(0, 0, w, H); const cx = w / 2, cy = H / 2 + 4, R = H * 0.38;
    g.strokeStyle = C.grid; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.stroke(); dotAt(g, [cx, cy], 4, C.star); txt(g, '태양', cx + 6, cy + 4, C.mute, 9);
    let drift = 0; for (let m = 0; m < 12; m++) { const th = m / 12 * 2 * Math.PI, ex = cx + R * Math.cos(th), ey = cy - R * Math.sin(th), O = th + Math.PI + dO * 86400 * 365.2422 / 12 * m - need * 86400 * 365.2422 / 12 * m;
      dotAt(g, [ex, ey], 3, '#6fa8ff'); g.strokeStyle = C.acc; g.lineWidth = 1.4; g.beginPath(); g.moveTo(ex - 13 * Math.cos(O), ey + 13 * Math.sin(O)); g.lineTo(ex + 13 * Math.cos(O), ey - 13 * Math.sin(O)); g.stroke();
      g.strokeStyle = 'rgba(201,168,106,.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(ex, ey); g.lineTo(ex + (cx - ex) * 0.2, ey + (cy - ey) * 0.2); g.stroke(); drift = (dO - need) * 86400 * 365.2422 * R2D; }
    txt(g, '북극 위에서 본 1년 (한 달 간격)', 6, 12, C.mute, 9);
    set([['궤도면이 도는 빠르기', `하루 ${fmt(dO * 86400 * R2D, 4)}° (필요 0.9856°)`], ['이 높이의 태양동기 경사각', `${fmt(ireq, 2)}°`], ['1년 뒤 어긋남', `${fmt(drift, 1)}°${Math.abs(drift) < 5 ? ' · 태양동기 성공' : ''}`], ['주기', `${fmt(2 * Math.PI / n / 60, 1)}분, 하루 ${fmt(86400 * n / (2 * Math.PI), 2)}바퀴`],
      [`실제 ${r[0]}`, `높이 ${r[1]} km · 경사각 ${r[2]}° (계산 ${fmt(ireqR, 2)}°) · ${r[3]}`], ['내 설계와 차이', `높이 ${fmt(+alt.value - r[1], 0)} km · 경사각 ${fmt(+inc.value - r[2], 2)}°`]]);
    const ga = RE + +galt.value, gn = Math.sqrt(MUE / ga ** 3), dl = (WE - gn) * 86400 * R2D; const c2 = cv2, g2 = c2.g; g2.fillStyle = C.bg; g2.fillRect(0, 0, c2.w, c2.h);
    const X = (lo) => 10 + (lo - 100) / 60 * (c2.w - 20); g2.strokeStyle = C.grid; g2.beginPath(); g2.moveTo(10, 60); g2.lineTo(c2.w - 10, 60); g2.stroke();
    for (const lo of [100, 120, 140, 160]) numTxt(g2, `${lo}°E`, X(lo), 76, C.mute, 9, 'center');
    g2.fillStyle = C.brass; g2.fillRect(X(128.2) - 3, 57, 6, 6); txt(g2, '천리안 2A', X(128.2), 50, C.brass, 9, 'center');
    g2.strokeStyle = C.acc; g2.beginPath(); for (let d = 0; d <= 30; d++) { const lo = +glon.value - dl * d; d ? g2.lineTo(X(lo), 60 + d * 1.6) : g2.moveTo(X(lo), 60); } g2.stroke(); dotAt(g2, [X(+glon.value), 60], 3, '#fff');
    txt(g2, '30일 동안 떠내려가는 경도 (아래로 갈수록 나중)', 6, 12, C.mute, 9);
    set2([['주기', `${fmt(2 * Math.PI / gn / 3600, 4)}시간 (항성일 23.9345)`], ['경도 이동', `하루 ${fmt(-dl, 3)}° ${Math.abs(dl) < 0.01 ? '· 정지궤도 성공' : dl > 0 ? '(서쪽으로)' : '(동쪽으로)'}`], ['천리안 2A와 비교', `높이 35,786 km · 동경 128.2° · 내 설계와 경도 차 ${fmt(+glon.value - 128.2, 1)}°`]]); };
  ref.onchange = () => { const r = KSAT[ref.value]; alt.value = r[1]; inc.value = 97; alt.dispatchEvent(new Event('input')); inc.dispatchEvent(new Event('input')); };
  for (const x of [alt, inc, galt, glon]) x.addEventListener('input', draw); ref.onchange();
  h.deeper(box, '지구의 적도 부풀음 때문에 궤도면은 dΩ/dt = -(3/2) n J₂ (R/a)² cos i 로 돕니다. 이 값을 지구 공전 각속도(하루 0.9856°)와 같게 하면 cos i가 음수, 즉 경사각이 90°보다 커야 합니다(역행). 정지궤도는 공전 주기가 항성일(23시간 56분 4초)과 같아야 하며, 실제로는 달과 태양의 끌림으로 경사각이 해마다 약 0.8° 커지므로 위성이 연료를 써서 바로잡습니다.');
}
