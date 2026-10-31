// Nuri launch practice (누리호 발사 실습): pick burn times, the pitch programme and the launch azimuth, launch from the Naro Space Center
// and try to reach a target orbit. A simplified 2D ascent in the plane of the flight (point-mass gravity, exponential air, gravity turn).
// Stage figures follow KARI's published numbers (stage 1: four 75 t KRE-075 engines, stage 2: one 75 t vacuum engine, stage 3: one 7 t engine);
// masses and Isp are representative values, not official flight data. The rocket model is buildCraft('Nuri') from craft.js.
import * as THREE from 'three';
import { buildCraft } from './craft.js';
import { api, helpers } from './sandbox-plus.js';
import { C, canvas, loop, txt, numTxt, slider, para, D2R, R2D } from './sb-kit.js';

const MU = 398600.4418, RE = 6378.137, G0 = 9.80665e-3, LAT = 34.43, LON = 127.53; // km^3/s^2, km, km/s^2, Naro
// [wet t, dry t, thrust kN (sea level), thrust kN (vacuum), Isp vac s, nominal burn s]
const ST = [[143.5, 18.5, 2942, 3250, 289, 127], [45.3, 6.0, 0, 788, 315, 143], [13.6, 2.6, 0, 68.6, 325, 498]];
const FAIRING = 1.2, PAYLOAD = 0.5; // flight 3 (2023) carried about 0.5 t: NEXTSat-2 (180 kg) and seven cubesats

export function openNuri() {
  const A = api(), h = helpers(), fmt = A.fmt;
  const box = A.labBox('누리호 발사 실습', '나로우주센터(북위 34.43°, 동경 127.53°)에서 누리호를 쏘아 목표 궤도에 올립니다.');
  para(h, box, '단순화한 2차원 상승 모형입니다: 비행하는 평면 안에서만 움직이고, 지구는 공 모양, 공기는 높이에 따라 지수로 옅어집니다. 단별 질량과 비추력은 대표값입니다.', 'small sb-note2');
  h.steps(box, ['목표 궤도를 고르고, 단별 연소 시간과 피치 킥(수직 상승 뒤 기울이는 각)을 정하세요.', '발사 방위각은 궤도 경사각을 정합니다. 누리호는 남쪽(방위각 약 170°)으로 쏘아 일본과 필리핀을 피합니다. 동쪽으로 쏠수록 지구 자전 속도를 덤으로 얻습니다.', '3단은 원지점 가까이에서 켜야 원 궤도가 됩니다: "2단 분리 뒤 기다리는 시간"으로 맞추세요.']);
  const tgt = A.el('select'); for (const [v, t] of [[550, '550 km 원 궤도 (누리호 3차 발사)'], [700, '700 km 원 궤도 (누리호 2차 발사)'], [600, '600 km 원 궤도 (누리호 4차 발사)']]) tgt.append(new Option(t, v)); h.field(box, '목표 궤도', tgt);
  const az = slider(h, A, box, '발사 방위각 (°)', 170, 90, 200, 1, '90:동|135:남동|180:남|200:200');
  const kick = slider(h, A, box, '피치 킥 각도 (°)', 1.0, 0.2, 6, 0.05), tk = slider(h, A, box, '피치 킥 시점 (초)', 14, 5, 40, 1);
  const b1 = slider(h, A, box, '1단 연소 시간 (초)', 127, 60, 127, 1), b2 = slider(h, A, box, '2단 연소 시간 (초)', 143, 40, 143, 1), b3 = slider(h, A, box, '3단 연소 시간 (초)', 498, 50, 560, 1);
  const coast = slider(h, A, box, '2단 분리 뒤 기다리는 시간 (초)', 260, 0, 800, 5);
  const mode = A.el('select'); mode.append(new Option('3단 자동 유도 (수평 유지, 목표 높이에서 끄기)', 'horiz'), new Option('끝까지 중력 선회 (유도 없음)', 'turn')); h.field(box, '3단 자세', mode);
  const row = A.el('div', 'sb-row'), wrap = A.el('div', 'sb-nuri'); box.append(row, wrap);
  const cv = canvas(h, wrap, 340, 220), set = h.results(box);
  // the 3D rocket in its own small view; disposed when the lab closes
  const rc = A.el('canvas', 'sb-nuri3d'); wrap.append(rc); const R = new THREE.WebGLRenderer({ canvas: rc, antialias: true, alpha: true }); R.setPixelRatio(Math.min(2, devicePixelRatio || 1)); R.setSize(90, 220, false);
  const scn = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, 90 / 220, 1, 500); scn.add(new THREE.HemisphereLight(0xdfe8ff, 0x202430, 1.6)); const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(30, 40, 50); scn.add(sun);
  const rocket = buildCraft('Nuri'); const piv = new THREE.Group(); scn.add(piv); if (rocket) { piv.add(rocket); rocket.position.y = -24; } cam.position.set(0, 0, 140); cam.lookAt(0, 0, 0);
  const parts = rocket?.userData.stages || {};
  const showParts = (st, fair) => { if (parts.s1) parts.s1.visible = st < 1; if (parts.s2) parts.s2.visible = st < 2; if (parts.fairing) parts.fairing.visible = !fair; };
  let S = null;
  const go = () => { const vrot = 0.4651 * Math.cos(LAT * D2R) * Math.sin(+az.value * D2R); S = { vrot, t: 0, x: 0, y: RE, vx: vrot, vy: 0, st: 0, burnt: 0, wait: 0, fair: false, kicked: false, done: '', path: [], maxq: 0, events: [] }; showParts(0, false); while (!S.done) stepSim(S, 0.5); S.play = 0; }; // the whole flight is computed at once, then played back
  row.append(h.btn('발사', go, 'sb-go'), h.btn('성공하는 예시 값', () => { for (const [r, v] of [[az, 170], [kick, 1.4], [tk, 8], [b1, 127], [b2, 143], [b3, 498], [coast, 175]]) { r.value = v; r.dispatchEvent(new Event('input')); } tgt.value = 550; mode.value = 'horiz'; }));
  const burnOf = (i) => [+b1.value, +b2.value, +b3.value][i];
  loop(cv, () => {
    if (!cv.c.isConnected) return;
    if (S) S.play = Math.min(S.path.length, S.play + 2);
    const { g, w, h: H } = cv; g.fillStyle = C.bg; g.fillRect(0, 0, w, H);
    // curved Earth: show the arc under the flight
    const sc = (H - 30) / 900, cx = 30, cy = H - 14, X = (x, y) => [cx + Math.atan2(x, y) * RE * sc, cy - (Math.hypot(x, y) - RE) * sc];
    g.strokeStyle = '#2b4a7a'; g.beginPath(); g.moveTo(cx, cy); g.lineTo(w, cy); g.stroke(); txt(g, '나로', cx - 4, cy + 11, C.mute, 9);
    const ht = +tgt.value, yt = cy - ht * sc; g.strokeStyle = 'rgba(201,168,106,.6)'; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(cx, yt); g.lineTo(w, yt); g.stroke(); g.setLineDash([]); txt(g, `목표 ${ht} km`, w - 6, yt - 4, C.brass, 9, 'right');
    numTxt(g, '0', cx - 4, cy - 2, C.mute, 8, 'right'); numTxt(g, '900 km', cx + 2, 12, C.mute, 8);
    if (!S) { set([['안내', '"발사"를 누르세요']]); R.render(scn, cam); return; }
    g.strokeStyle = C.acc; g.lineWidth = 1.4; g.beginPath(); S.path.slice(0, Math.max(1, S.play)).forEach(([x, y], i) => { const p = X(x, y); i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); }); g.stroke();
    const cur = S.path[Math.max(0, Math.min(S.path.length - 1, S.play - 1))] || [S.x, S.y, 0, false], p = X(cur[0], cur[1]); g.fillStyle = '#fff'; g.fillRect(p[0] - 1.5, p[1] - 1.5, 3, 3);
    for (const [ex, ey, lb] of S.events) { const q = X(ex, ey); g.fillStyle = C.brass; g.fillRect(q[0] - 2, q[1] - 2, 4, 4); txt(g, lb, q[0] + 3, q[1] + 10, C.brass, 8); }
    const r = Math.hypot(S.x, S.y), v = Math.hypot(S.vx, S.vy), en = v * v / 2 - MU / r, a = -MU / (2 * en), hh = S.x * S.vy - S.y * S.vx, e = Math.sqrt(Math.max(0, 1 + 2 * en * hh * hh / (MU * MU)));
    const hp = a * (1 - e) - RE, ha = e < 1 ? a * (1 + e) - RE : Infinity, inc = Math.acos(Math.cos(LAT * D2R) * Math.sin(+az.value * D2R)) * R2D;
    piv.rotation.z = -Math.min(1.4, Math.atan2(cur[0], cur[1]) * 8); showParts(cur[2], cur[3]); R.render(scn, cam);
    const ok = S.done && hp > 150 && Math.abs(hp - ht) < 50 && Math.abs(ha - ht) < 50;
    set([['시간 · 단계', `${fmt(S.t, 0)}초 · ${S.st < 3 ? (S.wait > 0 && S.st === 2 && S.burnt === 0 ? '2단 분리 뒤 관성 비행' : `${S.st + 1}단 연소`) : '엔진 정지'}`], ['고도 · 속도', `${fmt(r - RE, 1)} km · ${fmt(v, 3)} km/s`],
      ['궤도 (근지점 / 원지점 고도)', `${fmt(hp, 0)} / ${Number.isFinite(ha) ? fmt(ha, 0) : '탈출'} km`], ['궤도 경사각 (방위각에서)', `${fmt(inc, 1)}° (누리호 3차 97.5°)`], ['최대 동압', `${fmt(S.maxq, 0)} kPa`],
      ['결과', !S.done ? '비행 중' : ok ? `<b style="color:#7fd99a">성공</b>: ${ht} km 원 궤도 ±50 km 안` : S.done]]);
  });
  function stepSim(S, dt) {
    S.t += dt; const r = Math.hypot(S.x, S.y), alt = r - RE, ux = S.x / r, uy = S.y / r, v = Math.hypot(S.vx, S.vy);
    const st = ST[S.st], upper = ST.slice(S.st + 1).reduce((s, q) => s + q[0], 0) + PAYLOAD + (S.fair ? 0 : FAIRING);
    const bt = st ? burnOf(S.st) : 0, mdot = st ? (st[0] - st[1]) / st[5] : 0, m = st ? st[0] - mdot * S.burnt + upper : PAYLOAD + 2.6;
    // air: rotating with the Earth is ignored in this 2D model; density 1.225 exp(-h/7.2 km)
    const rho = alt < 150 ? 1.225 * Math.exp(-alt / 7.2) : 0, q = 0.5 * rho * (v * 1000) ** 2 / 1000; S.maxq = Math.max(S.maxq, q);
    const drag = q * 1000 * 0.3 * 9.6 / (m * 1000) / 1000; // N/kg -> km/s^2 (Cd 0.3, 3.5 m body)
    let thr = 0, dir = [ux, uy];
    const burning = st && S.burnt < bt && !(S.st === 2 && S.wait < +coast.value);
    if (st && S.st === 2 && S.wait < +coast.value) S.wait += dt;
    if (burning) { const pa = Math.exp(-alt / 7.2), F = st[3] - (st[3] - (st[2] || st[3])) * pa; thr = F / m / 1000; S.burnt += dt; }
    else if (st && (S.burnt >= bt)) { S.events.push([S.x, S.y, `${S.st + 1}단 분리`]); S.st++; S.burnt = 0; }
    if (!S.fair && alt > 110) { S.fair = true; S.events.push([S.x, S.y, '페어링']); }
    if (!S.kicked && S.t >= +tk.value) { S.kicked = true; const k = +kick.value * D2R, vr = S.vx * ux + S.vy * uy, vh = S.vx * uy - S.vy * ux - S.vrot, vr2 = vr * Math.cos(k), vh2 = vh + vr * Math.sin(k) + S.vrot; S.vx = vr2 * ux + vh2 * uy; S.vy = vr2 * uy - vh2 * ux; }
    // steer along the velocity relative to the turning Earth (the air), not the inertial one, or the rotation would tip the rocket over at lift-off
    const vr0 = S.vrot * r / RE, ax = S.vx - vr0 * uy, ay = S.vy + vr0 * ux, va = Math.hypot(ax, ay); if (S.kicked && va > 0.01) dir = [ax / va, ay / va];
    if (S.st === 2 && mode.value === 'horiz') { // simple guidance: hold the nose near horizontal, pitch to cancel climbing or sinking, cut off once the perigee reaches the target
      const vr = S.vx * ux + S.vy * uy, p = Math.max(-0.6, Math.min(0.6, -vr * 2 + (+tgt.value - alt) * 0.004)); dir = [uy * Math.cos(p) + ux * Math.sin(p), -ux * Math.cos(p) + uy * Math.sin(p)];
      const en = v * v / 2 - MU / r; if (burning && en < 0) { const a = -MU / (2 * en), hh = S.x * S.vy - S.y * S.vx, e = Math.sqrt(Math.max(0, 1 + 2 * en * hh * hh / (MU * MU))); if (a * (1 - e) - RE >= +tgt.value - 10) S.cut = true; } }
    const g = MU / (r * r);
    S.vx += (thr * dir[0] - drag * (v ? S.vx / v : 0) - g * ux) * dt; S.vy += (thr * dir[1] - drag * (v ? S.vy / v : 0) - g * uy) * dt;
    S.x += S.vx * dt; S.y += S.vy * dt; if (S.t % 5 < dt) S.path.push([S.x, S.y, S.st, S.fair]);
    if (alt < -0.01 && S.t > 5) S.done = '추락: 궤도 속도에 못 미쳤습니다';
    if (S.st >= 3) S.done = '연료를 다 써서 엔진 정지: 아래 궤도 값을 보세요';
    if (S.cut) S.done = '유도 컴퓨터가 3단 엔진을 껐습니다 (목표 높이 도달)';
    if (S.t > 3000) S.done = '시간 초과';
  }
  // free the WebGL context when the lab panel is replaced or closed
  const iv = setInterval(() => { if (rc.isConnected) return; clearInterval(iv); rocket?.traverse(o => { o.geometry?.dispose(); const mm = o.material; (Array.isArray(mm) ? mm : mm ? [mm] : []).forEach(x => { x.map?.dispose(); x.dispose(); }); }); R.dispose(); R.forceContextLoss?.(); }, 1000);
  h.deeper(box, '발사 방위각 A와 발사장 위도 φ가 궤도 경사각을 정합니다: cos i = cos φ sin A. 나로(34.43°N)에서 정남쪽 가까이 쏘면 태양동기 궤도에 가까운 97° 남짓이 됩니다. 이 모형은 지구 자전에 따른 공기의 움직임, 바람, 추력 방향 제어 손실, 연소 중 질량 중심 변화를 무시합니다. 실제 누리호는 비행 중 유도 알고리즘이 연소 시간을 조절합니다.');
}
