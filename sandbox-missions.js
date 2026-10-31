// Mission mode: goal-based tasks with a Δv budget and a time limit, checked live against the N-body simulation.
// A teacher can write a custom mission and share it as a link (#sb=mission&m=<base64url JSON>).
import { api, helpers } from './sandbox-plus.js';

// type: reach (distance from the Sun ≥ r AU) · near (within d AU of a body) · inner (distance from the Sun ≤ r AU) · escape (unbound from the Sun) · keepMoon (Moon bound to Earth for years)
export const MISSIONS = [
  { id: 'mars', t: 'Δv 4 km/s 안에서 화성 궤도까지 가기', g: '지구 근처의 탐사선을 분사해 태양에서 1.52 AU(화성 궤도)까지 올라가세요.', type: 'reach', r: 1.52, dv: 4, days: 730, hint: '진행 방향(+)으로 약 3 km/s 분사하면 호만 전이 궤도가 됩니다.' },
  { id: 'moon', t: '달을 지구 둘레에 100년 유지하기', g: '달이 너무 빨라 곧 지구를 떠날 상황입니다. 달을 골라 0.5 km/s 안에서 분사해, 100년 동안 지구 둘레(0.01 AU 안)에 붙잡아 두세요.', type: 'keepMoon', years: 100, dv: 0.5, days: 36525, hint: '달을 고르고 진행 방향으로 -300 m/s 정도 분사해 보세요.' },
  { id: 'venus', t: '금성 가까이 지나가기', g: 'Δv 3.5 km/s 안에서 금성에 0.02 AU(약 300만 km)까지 다가가세요.', type: 'near', body: 'Venus', d: 0.02, dv: 3.5, days: 500, hint: '진행 반대 방향(-)으로 분사하면 안쪽으로 떨어집니다. 출발 시점이 중요합니다: 금성이 앞서 있을 때 쏘세요.' },
  { id: 'jupiter', t: '목성 궤도까지 가기', g: 'Δv 9 km/s 안에서 태양에서 5.2 AU까지 올라가세요.', type: 'reach', r: 5.2, dv: 9, days: 2000, hint: '목성까지 호만 전이에 필요한 출발 Δv는 약 8.8 km/s입니다.' },
  { id: 'sun', t: '태양에 0.3 AU까지 다가가기', g: 'Δv 15 km/s 안에서 근일점이 0.3 AU가 되도록 안쪽으로 떨어지세요 (파커 태양 탐사선처럼).', type: 'inner', r: 0.3, dv: 15, days: 400, hint: '지구의 공전 속도 29.8 km/s를 상당히 줄여야 합니다. 진행 방향으로 큰 음수를 넣어 보세요.' },
  { id: 'escape', t: '태양계를 탈출하기', g: 'Δv 13 km/s 안에서 태양의 중력을 벗어나는 속도(탈출 속도)에 도달하세요.', type: 'escape', dv: 13, days: 400, hint: '1 AU에서 태양 탈출 속도는 42.1 km/s, 지구는 이미 29.8 km/s로 돌고 있습니다.' },
];
const KMS = () => api().O.KMS;
let M = null; // the running mission: { def, probe, used, t0, best, state, msg }

export function openMissions(def) {
  const A = api(), h = helpers(), box = A.labBox('임무 모드 (목표 달성형 과제)', '목표, Δv 예산, 기한이 있는 과제입니다. 정보 창의 "물리량" 탭에서 "분사 Δv"를 넣고 분사하세요.');
  const sel = A.el('select'); MISSIONS.forEach((m, i) => sel.append(new Option(m.t, i))); if (def?.custom) sel.append(new Option(def.t, 'c')); h.field(box, '임무', sel);
  const goal = A.el('div', 'small'); goal.style.margin = '6px 0'; box.append(goal);
  const set = h.results(box), bar = A.el('div', 'sb-mbar', '<i></i>'); box.append(bar);
  const cur = () => sel.value === 'c' ? def : MISSIONS[+sel.value];
  const show = () => { const d = cur(); goal.innerHTML = `${d.g}<br>예산 Δv ${d.dv} km/s · 기한 ${d.days >= 3650 ? Math.round(d.days / 365.25) + '년' : d.days + '일'}${d.hint ? `<br><span style="color:var(--mute)">도움말: ${d.hint}</span>` : ''}`; };
  sel.onchange = show; if (def?.custom) sel.value = 'c'; show();
  box.append(h.btn('임무 시작', () => start(cur()), 'sb-go'), h.btn('다시 하기', () => M && start(M.def)));
  A.setLab({ tick: () => { if (!M) return set([['상태', '"임무 시작"을 누르세요']]);
    const d = M.def, el = (A.sim.t - M.t0); bar.firstChild.style.width = `${Math.min(100, el / d.days * 100)}%`;
    set([['쓴 Δv / 예산', `${A.fmt(M.used, 3)} / ${d.dv} km/s`], ['지난 시간 / 기한', `${A.fmt(el, 0)} / ${d.days}일`], [progLabel(d), progVal(d)], ['결과', M.state === 'run' ? '진행 중' : M.state === 'pass' ? `<b style="color:#7fd99a">성공</b> ${M.msg}` : `<b style="color:#ff7a5a">실패</b> ${M.msg}`]]); } });
  // teacher: write a mission and copy a link
  const t = A.el('details', 'sb-deep'); t.append(A.el('summary', '', '교사용: 새 임무를 링크로 만들기')); const tb = A.el('div'); t.append(tb); box.append(t);
  const ti = A.el('input'); ti.value = '토성 궤도까지 가기'; h.field(tb, '제목', ti);
  const ty = A.el('select'); for (const [k, v] of [['reach', '태양에서 거리 도달 (AU)'], ['inner', '태양에 다가가기 (AU)'], ['near', '행성에 다가가기 (AU)'], ['escape', '태양계 탈출']]) ty.append(new Option(v, k)); h.field(tb, '목표 종류', ty);
  const val = h.field(tb, '목표 값 (AU)', h.num(9.5, 0.01, 0.001, 100)), body = A.el('select'); for (const n of ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn']) body.append(new Option(A.byName(n)?.ko || n, n)); h.field(tb, '행성 (다가가기일 때)', body);
  const dv = h.field(tb, 'Δv 예산 (km/s)', h.num(11, 0.1, 0.1, 40)), days = h.field(tb, '기한 (일)', h.num(3000, 10, 10, 40000));
  const out = A.el('input'); out.readOnly = true; out.style.width = '100%';
  tb.append(h.btn('링크 만들기', async () => { const m = { t: ti.value.trim() || '새 임무', type: ty.value, r: +val.value, d: +val.value, body: body.value, dv: +dv.value, days: +days.value };
    m.g = ty.value === 'escape' ? `Δv ${m.dv} km/s 안에서 태양계를 탈출하세요.` : ty.value === 'near' ? `Δv ${m.dv} km/s 안에서 ${body.selectedOptions[0].text}에 ${m.d} AU까지 다가가세요.` : ty.value === 'inner' ? `Δv ${m.dv} km/s 안에서 태양에 ${m.r} AU까지 다가가세요.` : `Δv ${m.dv} km/s 안에서 태양에서 ${m.r} AU까지 가세요.`;
    const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(m)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    out.value = `${location.origin}${location.pathname}#sb=mission&m=${b64}`; try { await navigator.clipboard.writeText(out.value); A.toast('임무 링크를 복사했습니다'); } catch { out.select(); } }), out);
}
const progLabel = (d) => ({ reach: '태양에서 가장 멀리 간 거리', inner: '태양에 가장 가까이 간 거리', near: '가장 가까이 간 거리', escape: '태양 탈출 속도 대비', keepMoon: '지구에서 달까지 가장 먼 거리' }[d.type]);
function progVal(d) { if (!M) return '-'; const b = M.best; return d.type === 'escape' ? `${api().fmt(b * 100, 1)}%` : `${api().fmt(b, 4)} AU (목표 ${d.type === 'keepMoon' ? '0.01 AU 안' : (d.r ?? d.d) + ' AU'})`; }

function start(def) {
  const A = api(); A.resetSolarSystem(A.ctx().jdNow()); const E = A.byName('Earth'); A.sim.playing = true; let probe;
  if (def.type === 'keepMoon') { A.addSolarBody('Moon', true); probe = A.byName('Moon'); const rx = probe.r[0] - E.r[0], ry = probe.r[1] - E.r[1], d = Math.hypot(rx, ry), v = 1.36 / KMS();
    probe.v = [E.v[0] - ry / d * v, E.v[1] + rx / d * v, E.v[2]]; A.sim.speed = 400; A.focus('Earth', 0.05); }
  else { const v = Math.hypot(...E.v), u = E.v.map(x => x / v); probe = A.makeBody('mprobe', [E.r[0] + u[0] * 0.012, E.r[1] + u[1] * 0.012, E.r[2]], [...E.v], { m: 0, ko: '임무 탐사선', color: 0x4fe3c1 });
    A.sim.bodies.push(probe); A.buildMesh(probe); A.sim.speed = 20; A.focus('Sun', def.type === 'reach' && def.r > 3 ? 14 : 4); }
  A.sim.E0 = A.energy(); A.snapshot(); A.select(probe);
  M = { def, probe, used: 0, t0: A.sim.t, best: def.type === 'reach' || def.type === 'escape' || def.type === 'keepMoon' ? 0 : Infinity, state: 'run', msg: '' };
  A.root.querySelector('.sb-itabs [data-it=pr]')?.click(); if (def.type === 'keepMoon') A.sim.playing = false;
  A.toast(def.type === 'keepMoon' ? '시간을 멈췄습니다. 달을 분사해 고친 뒤 재생하세요' : '탐사선을 골랐습니다. "분사 Δv"에 값을 넣고 분사하세요');
}
export function onBurn(b, dv) { if (!M || M.state !== 'run' || b !== M.probe) return; M.used += Math.hypot(...dv) * KMS(); if (M.used > M.def.dv + 1e-6) end('fail', `Δv 예산(${M.def.dv} km/s)을 넘었습니다`); }
export function onClear() { if (M && !api().sim.bodies.includes(M.probe)) M.state === 'run' && (M.state = 'stop'); }
function end(s, msg) { M.state = s; M.msg = msg; api().toast(s === 'pass' ? `임무 성공: ${M.def.t}` : `임무 실패: ${msg}`); }
export function tick() {
  if (!M || M.state !== 'run') return; const A = api(), d = M.def, p = M.probe, S = A.byName('Sun'); if (!S) return;
  if (p.dead || !A.sim.bodies.includes(p)) return end('fail', '탐사선이 부딪히거나 사라졌습니다');
  const rs = Math.hypot(p.r[0] - S.r[0], p.r[1] - S.r[1], p.r[2] - S.r[2]), el = A.sim.t - M.t0;
  if (d.type === 'reach') { M.best = Math.max(M.best, rs); if (rs >= d.r) return end('pass', `${A.fmt(el, 0)}일 만에 ${d.r} AU 도달, Δv ${A.fmt(M.used, 2)} km/s`); }
  if (d.type === 'inner') { M.best = Math.min(M.best, rs); if (rs <= d.r) return end('pass', `${A.fmt(el, 0)}일 만에 ${d.r} AU 도달`); }
  if (d.type === 'near') { const B = A.byName(d.body); if (B) { const x = Math.hypot(p.r[0] - B.r[0], p.r[1] - B.r[1], p.r[2] - B.r[2]); M.best = Math.min(M.best, x); if (x <= d.d) return end('pass', `${B.ko}에 ${A.fmt(x, 4)} AU까지 다가감`); } }
  if (d.type === 'escape') { const v = Math.hypot(p.v[0] - S.v[0], p.v[1] - S.v[1], p.v[2] - S.v[2]), ve = Math.sqrt(2 * A.O.MU_SUN * S.m / rs); M.best = Math.max(M.best, v / ve); if (v >= ve) return end('pass', `탈출 속도 도달, Δv ${A.fmt(M.used, 2)} km/s`); }
  if (d.type === 'keepMoon') { const E = A.byName('Earth'); if (!E) return end('fail', '지구가 사라졌습니다'); const x = Math.hypot(p.r[0] - E.r[0], p.r[1] - E.r[1], p.r[2] - E.r[2]); M.best = Math.max(M.best, x);
    if (x > 0.01) return end('fail', `${A.fmt(el / 365.25, 1)}년 만에 달이 지구를 떠났습니다`); if (el >= d.days) return end('pass', `100년 동안 달이 지구 둘레에 머물렀습니다 (가장 먼 거리 ${A.fmt(x * A.O.AU_KM, 0)} km)`); }
  if (el > d.days && d.type !== 'keepMoon') end('fail', '기한이 지났습니다');
}
export async function fromHash() {
  const h = location.hash; if (!/sb=mission/.test(h)) return false; const m = h.match(/[&#]m=([A-Za-z0-9_-]+)/); if (!m) return false;
  try { const bin = atob(m[1].replace(/-/g, '+').replace(/_/g, '/')), d = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
    const def = { custom: true, t: String(d.t || '새 임무').slice(0, 80), g: String(d.g || '').slice(0, 300), type: ['reach', 'inner', 'near', 'escape'].includes(d.type) ? d.type : 'reach', r: +d.r || 1.5, d: +d.d || 0.05, body: String(d.body || 'Mars'), dv: +d.dv || 5, days: Math.min(40000, +d.days || 1000) };
    openMissions(def); return true; } catch { return false; }
}
