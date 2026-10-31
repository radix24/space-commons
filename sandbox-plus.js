// Space Commons sandbox, stage 6 add-ons: before/after comparison, scene gallery, tides (locking and heating), Roche breakup into a ring,
// the end of massive stars (supernova, neutron star or black hole), binary mass transfer with an accretion disc and novae, seasons and oceans.
// sandbox.js calls init(api) once the UI exists, tick(dt, dDays) every frame after drawing, and the onX hooks below.
// Missions live in sandbox-missions.js, the orbit gallery and Korean satellite labs in orbits-gallery.js, the Nuri launch lab in sandbox-nuri.js.
import * as ATM from './atmos.js';
import * as MIS from './sandbox-missions.js';
import * as GAL from './orbits-gallery.js';
import * as NURI from './sandbox-nuri.js';
import { initGroups } from './sandbox-groups.js';
import { initHelp, tickHelp } from './sandbox-help.js';
import { C, NUM, canvas, txt, numTxt, slider, para, D2R, lagrangeX } from './sb-kit.js';

let A = null; // the api from sandbox.js
const MSUN_KG = 1.98847e30, G_SI = 6.674e-11;
const st = { tides: false, tideK: 1e4, tideAcc: 0, tideMsg: new Set(), shell: null, sn: [], mt: null, mtCheck: 0, cmpT: 0, rocheT: 0, seasonT: 0 };
const q = (s) => A.root.querySelector(s);
const H = () => ({ labBox: A.labBox, steps: A.steps, field: A.field, num: A.num, btn: A.btn, results: A.results, deeper: A.deeper, el: A.el, fmt: A.fmt });
export const helpers = H;
export const api = () => A;

// ---------------- wiring into the library ----------------
export function init(api) {
  A = api; const h = H();
  // 만들기: the scene gallery next to save / share
  const line = q('.sb-share')?.parentElement; if (line) line.append(h.btn('장면 갤러리', openGallery, 'sb-galbtn'));
  // 시나리오
  const SC = [['로슈 한계와 고리', '위성이 로슈 한계 안으로 들어가 부서지고 고리로 퍼집니다', scenRoche], ['초신성: 15 태양질량 별', '폭발 뒤 중성자별이 남고 행성들이 풀려납니다', () => scenSN(15)],
    ['초신성: 30 태양질량 별', '폭발 뒤 블랙홀이 남습니다', () => scenSN(30)], ['쌍성의 질량 이동과 신성', '로슈 엽을 채운 별의 가스가 짝별의 강착 원반으로 흘러갑니다', scenBinary],
    ['조석 고정과 조석 가열 (이오)', '빨리 돌던 위성이 느려져 한쪽 면만 보이게 되고, 찌그러진 궤도 때문에 뜨거워집니다', scenIo]];
  for (const [t, d, f] of SC) { const b = A.el('button', 'sb-scenbtn', `<b>${t}</b><span>${d}</span>`); b.onclick = f; q('.sb-scens')?.append(b); }
  // 궤도 실습: a new level
  const labs = q('.sb-labs'), ROWS = [['임무 모드 (목표 달성형 과제)', () => MIS.openMissions(), 'hohmann'], ['다양한 궤도 사례', () => GAL.openGallery(), 'cr3bp'], ['한국 위성 궤도 설계 실습', () => GAL.openKorSat(), 'j2'],
    ['누리호 발사 실습', () => NURI.openNuri(), 'rocket'], ['계절과 바다 (자전축·자전 주기)', () => openSeasons(), null], ['무엇이 달라졌나 (전후 비교)', () => openCompare(), null], ['장면 갤러리', () => openGallery(), null]];
  if (labs) { labs.append(A.el('div', 'sb-level', '7단계 · 도전 과제와 궤도 사례'));
    for (const [t, f] of ROWS) { const row = A.el('div', 'sb-labrow'); row.append(h.btn(t, f)); labs.append(row); } }
  // 보기: tides
  const view = A.root.querySelector('.sb-tab[data-tab=view]');
  if (view) { const l = A.el('label', '', '<input type="checkbox" class="sb-tides"> 조석 효과 (자전이 느려지고 위성이 데워짐)'); view.append(l);
    const k = A.el('input'); k.type = 'range'; k.min = 0; k.max = 6; k.step = 0.5; k.value = 4; k.className = 'sb-tidek'; k.dataset.stops = '0:×1|3:×1000|6:×100만';
    const fl = A.el('label', 'sb-field'); fl.append(A.el('span', '', '조석 시간 가속'), k); view.append(fl); A.gauge(k);
    l.querySelector('input').onchange = (e) => { st.tides = e.target.checked; if (!st.tides) clearTideGlow(); };
    k.oninput = () => { st.tideK = Math.pow(10, +k.value); }; }
  // inspector: before/after comparison under the orbit graph
  const ov = A.root.querySelector('.sb-ipane[data-it=ov]'), acts = ov?.querySelector('.sb-acts');
  if (ov) { const box = A.el('div', 'sb-cmp'); box.innerHTML = '<div class="sb-sec"><span>무엇이 달라졌나</span></div><div class="sb-row"><button class="sb-cmprec">지금을 기준으로 기록</button><button class="sb-cmpclr">기준 지우기</button></div><canvas class="sb-cmpcv" width="560" height="168" hidden></canvas><div class="small sb-tideinfo" hidden></div><div class="sb-sec"><span>대기와 생명 가능성 진단</span></div><table class="sb-res sb-diag"></table><div class="small sb-diagnote">이 진단은 행성 전체의 평균값으로 따로따로 판정합니다. 구름, 대기 순환, 기후 되먹임, 대기가 우주로 빠져나가는 것은 계산하지 않습니다.</div>';
    ov.insertBefore(box, acts); box.querySelector('.sb-cmprec').onclick = () => { const b = A.selected(); if (b) { recordBase(b); A.toast('기준을 기록했습니다. 실험한 뒤 막대를 비교하세요'); } };
    box.querySelector('.sb-cmpclr').onclick = () => { const b = A.selected(); if (b) b.cmp0 = null; };
    void 0;
    const sn = A.btn('초신성으로 폭발', () => { const b = A.selected(); if (b?.kind === 'star') explode(b); }, 'sb-snbtn'); sn.hidden = true; acts?.append(sn); }
  initGroups(A); initHelp(A);
}
export async function fromHash() { return MIS.fromHash(); }
export function onBurn(b, dv) { MIS.onBurn(b, dv); }
export function onClear() { clearShell(); clearMT(); st.sn.length = 0; MIS.onClear?.(); }

// ---------------- the per-frame hook (called at the end of draw) ----------------
export function tick(dt, dDays) {
  if (!A) return;
  tickHelp(dt); MIS.tick(dt, dDays);
  if (dDays > 0) { if (st.tides) tides(dDays); supernovae(dDays); massTransfer(dDays); }
  st.rocheT += dt; if (st.rocheT > 0.05) { st.rocheT = 0; rocheCheck(); }
  st.cmpT += dt; if (st.cmpT > 0.3) { st.cmpT = 0; drawCompare(); diagnose(); const b = A.selected(), sn = q('.sb-snbtn'); if (sn) sn.hidden = !(b && b.kind === 'star' && b.m >= 8); }
  st.seasonT += dt; if (st.seasonT > 0.2) { st.seasonT = 0; seasonsLive(); }
}

// ---------------- orbit numbers relative to what a body orbits ----------------
function relOrbit(b) {
  const o = A.dominantOther(b); if (!o) return null; const mu = A.O.MU_SUN * A.sim.G * (o.m + b.m);
  const rx = b.r[0] - o.r[0], ry = b.r[1] - o.r[1], rz = b.r[2] - o.r[2], vx = b.v[0] - o.v[0], vy = b.v[1] - o.v[1], vz = b.v[2] - o.v[2];
  const r = Math.hypot(rx, ry, rz), v2 = vx * vx + vy * vy + vz * vz, a = 1 / (2 / r - v2 / mu), rv = rx * vx + ry * vy + rz * vz;
  const ex = ((v2 - mu / r) * rx - rv * vx) / mu, ey = ((v2 - mu / r) * ry - rv * vy) / mu, ez = ((v2 - mu / r) * rz - rv * vz) / mu, e = Math.hypot(ex, ey, ez);
  return { o, r, a, e, P: a > 0 ? 2 * Math.PI * Math.sqrt(a * a * a / mu) : Infinity, n: a > 0 ? Math.sqrt(mu / (a * a * a)) : 0 };
}
const surfT = (b) => { if (b.kind !== 'planet') return NaN; const k = ATM.climate(b, A.teq(b)); return k ? k.Ts - 273.15 : NaN; };

// ---------------- 1. what changed: baseline and before/after bars ----------------
function snap(b) { const e = relOrbit(b); return { a: e?.a ?? NaN, e: e?.e ?? NaN, P: e?.P ?? NaN, T: surfT(b), at: A.sim.t, host: e?.o.ko || '' }; }
function recordBase(b) { b.cmp0 = snap(b); }
const CMP = [['a', '궤도 긴반지름', 'AU', 4], ['e', '이심률', '', 3], ['P', '주기', '일', 1], ['T', '표면 온도', '°C', 0]];
export function drawCompareOn(cv, b) {
  const g = cv.getContext('2d'), W = cv.width, Hh = cv.height; g.fillStyle = C.bg; g.fillRect(0, 0, W, Hh);
  if (!b?.cmp0) { txt(g, '"지금을 기준으로 기록"을 누른 뒤 질량, 속도, 별을 바꿔 보세요', 12, Hh / 2, C.mute, 13); return; }
  const now = snap(b), pw = W / 4;
  CMP.forEach(([k, lab, u, d], i) => {
    const x0 = i * pw + 10, v0 = b.cmp0[k], v1 = now[k], ok0 = Number.isFinite(v0), ok1 = Number.isFinite(v1);
    txt(g, lab, x0, 18, C.mute, 12);
    const lo = k === 'T' ? Math.min(0, ok0 ? v0 : 0, ok1 ? v1 : 0) : 0, hi = Math.max(ok0 ? v0 : 0, ok1 ? v1 : 0, k === 'e' ? 0.1 : 1e-9, k === 'T' ? 10 : 0), span = (hi - lo) || 1, base = Hh - 46, top = 30;
    const bar = (v, x, col) => { if (!Number.isFinite(v)) { txt(g, '없음', x, base - 4, C.mute, 11); return; } const y0 = base - (0 - lo) / span * (base - top), y1 = base - (v - lo) / span * (base - top); g.fillStyle = col; g.fillRect(x, Math.min(y0, y1), 34, Math.max(1.5, Math.abs(y1 - y0))); };
    bar(v0, x0 + 6, '#4a5170'); bar(v1, x0 + 52, C.acc);
    g.fillStyle = C.grid; g.fillRect(x0, base - (0 - lo) / span * (base - top), pw - 24, 1);
    const f = (v) => !Number.isFinite(v) ? '-' : Math.abs(v) >= 1e5 ? v.toExponential(2) : v.toFixed(d);
    numTxt(g, f(v0), x0 + 6, Hh - 30, '#9aa0b8', 11); numTxt(g, f(v1), x0 + 52, Hh - 30, C.acc, 11);
    const ch = ok0 && ok1 && v0 !== 0 && k !== 'T' ? `${v1 >= v0 ? '+' : ''}${((v1 / v0 - 1) * 100).toFixed(1)}%` : ok0 && ok1 ? `${v1 - v0 >= 0 ? '+' : ''}${(v1 - v0).toFixed(d)}${u}` : '';
    numTxt(g, ch, x0 + 6, Hh - 12, C.ink, 12); txt(g, u, x0 + pw - 30, 18, C.mute, 11);
  });
  txt(g, `회색: 기준 (${A.fmtDate(b.cmp0.at)}) · 파랑: 지금`, W - 8, Hh - 12, C.mute, 11, 'right');
}
function drawCompare() {
  const b = A.selected(), cv = q('.sb-cmpcv'); if (!cv || !b || q('.sb-sel').hidden) return; cv.hidden = !b.cmp0; if (b.cmp0) drawCompareOn(cv, b);
  const ti = q('.sb-tideinfo'); if (ti) { ti.hidden = !(st.tides && b.tide); if (b.tide) ti.textContent = `조석 가열 ${A.fmt(b.tide.F, 3)} W/m² · 자전 ${A.fmt(b.spinH, 2)}시간 / 공전 ${A.fmt(b.tide.Ph, 2)}시간${b.tide.locked ? ' · 조석 고정' : ''}`; }
}
function openCompare() {
  const h = H(), box = A.labBox('무엇이 달라졌나 (전후 비교)', '실험 전의 궤도와 온도를 기록해 두고, 실험 뒤에 나란히 비교합니다.');
  h.steps(box, ['비교할 천체를 고르고 "기준 기록"을 누르세요.', '시나리오를 고르지 말고, 지금 장면에서 태양 질량을 바꾸거나 행성을 밀어 보세요. 시간을 흘려도 됩니다.', '회색 막대가 기준, 파란 막대가 지금입니다. 고른 천체의 정보 창에도 같은 그래프가 나옵니다.']);
  const sel = A.el('select'); const fill = () => { sel.length = 0; for (const b of A.sim.bodies) if (!b.test && b.kind !== 'star' && !b.dead) sel.append(new Option(b.ko, b.name)); }; fill(); h.field(box, '천체', sel);
  const cv = A.el('canvas', 'sb-vec'); cv.width = 560; cv.height = 168; cv.style.width = '100%'; box.append(cv);
  const all = h.btn('모든 행성 기준 기록', () => { for (const b of A.sim.bodies) if (!b.test && b.kind === 'planet') recordBase(b); A.toast('모든 행성의 기준을 기록했습니다'); });
  box.append(h.btn('기준 기록', () => { const b = A.byName(sel.value); if (b) recordBase(b); }, 'sb-go'), all, h.btn('태양 질량 ×2로 실험', () => { const s = A.byName('Sun'); if (s) { s.m *= 2; A.sim.E0 = A.energy(); A.toast('태양 질량을 2배로 바꿨습니다'); } }));
  if (!sel.value && sel.options.length) sel.value = sel.options[0].value; if (A.byName('Earth')) sel.value = 'Earth';
  let t = 0; A.setLab({ tick: () => { if (++t % 10) return; drawCompareOn(cv, A.byName(sel.value)); } });
}

// ---------------- FEAT-03: atmosphere and habitability diagnosis, each question answered separately ----------------
function diagnose() {
  const b = A.selected(), t = q('.sb-diag'); if (!t || !b || q('.sb-sel').hidden) return; const box = t.parentElement;
  const show = b.kind === 'planet' && !!b.Rkm; t.hidden = !show; box.querySelector('.sb-diagnote').hidden = !show; if (!show) return;
  const T30 = A.teq(b), k = ATM.climate(b, T30); if (!k) { t.innerHTML = '<tr><td>대기</td><td>자료 없음</td></tr>'; return; }
  const a = k.a, P = a.P || 0, br = ATM.breathable(a), Ts = k.Ts, S = Math.pow(T30 / 255, 4) / Math.max(1e-9, 1 - (b.shade || 0)); // stellar flux in Earth units, before any shade
  const inHZ = S <= 1 / 0.95 ** 2 && S >= 1 / 1.37 ** 2, climateOK = Ts >= 273.15 && Ts <= 323.15, water = ATM.waterState(Ts, P);
  const f = (x, d) => A.fmt(x, d);
  t.innerHTML = [
    ['표면 온도 (모형, 전체 평균)', `${f(Ts - 273.15, 0)} °C (${f(Ts, 0)} K)`],
    ['지표 기압', `${f(P, P < 0.1 ? 4 : 2)} bar`],
    ['산소 분압 · 농도', `${f(br.pO2, 3)} bar · ${f((a.mix.O2 || 0) * 100, 1)}%`],
    ['이산화탄소 분압 · 농도', `${f(br.pCO2, 4)} bar · ${f((a.mix.CO2 || 0) * 100, 2)}%`],
    ['별빛 (지구 = 1)', `${f(S, 2)}${b.shade ? ` · 가리개 뒤 ${f(S * (1 - b.shade), 2)}` : ''} → ${inHZ ? '생명 가능 지대 안' : '생명 가능 지대 밖'} (생명 가능 지대는 별빛만 따지며, 그 안이라고 살 수 있다는 뜻은 아님)`],
    ['기후 (평균 0~50 °C)', climateOK ? '맞음' : '맞지 않음'],
    ['물', water],
    ['사람이 장비 없이 숨쉬기', br.ok ? '가능 (산소 0.16~0.5 bar, 이산화탄소 0.005 bar 이하, 기압 0.5~3 bar 기준)' : `불가: ${br.why}`],
  ].map(([x, y]) => `<tr><td>${x}</td><td>${y}</td></tr>`).join('');
}
// ---------------- FEAT-04: an experiment = scene now + its initial conditions + settings + model version ----------------
function experiment() {
  const snap = A.sim.snapshot, initial = snap ? { t: snap.t, bodies: snap.bodies.filter(b => !b.crashed && !b.frag && !b.dead).map(b => ({ name: b.name, ko: b.ko, m: b.m, r: b.r, v: b.v, Rkm: b.Rkm, color: b.color, kind: b.kind, atm: b.atm || undefined })) } : null;
  const base = {}; for (const b of A.sim.bodies) if (b.cmp0) base[b.name] = b.cmp0;
  return { initial, base, settings: { G: A.sim.G, collide: A.sim.collide, speed: A.sim.speed, tides: st.tides, tideK: st.tideK }, version: window.SC_VERSION || '' };
}
function loadExperiment(s, fromStart) {
  A.loadScene(fromStart && s.initial ? s.initial : s.data);
  if (s.settings) { A.sim.G = s.settings.G ?? 1; A.sim.collide = s.settings.collide ?? true; A.sim.speed = s.settings.speed ?? A.sim.speed; st.tides = !!s.settings.tides; st.tideK = s.settings.tideK ?? 1e4; const cb = q('.sb-tides'); if (cb) cb.checked = st.tides; A.sim.E0 = A.energy(); }
  if (s.base) for (const [n, v] of Object.entries(s.base)) { const b = A.byName(n); if (b) b.cmp0 = { ...v }; }
  if (s.version && s.version !== window.SC_VERSION) A.toast(`이 실험은 ${s.version}에서 저장했습니다. 지금 버전(${window.SC_VERSION})과 계산이 조금 다를 수 있습니다`);
}

// ---------------- 3. scene gallery (this browser) ----------------
const GKEY = 'space-commons-sandbox-gallery';
const gLoad = () => { try { const l = JSON.parse(localStorage.getItem(GKEY)); return Array.isArray(l) ? l : []; } catch { return []; } };
const gSave = (l) => { try { localStorage.setItem(GKEY, JSON.stringify(l)); return true; } catch { return false; } };
export function openGallery() {
  const h = H(), box = A.labBox('장면 갤러리', '지금 장면을 이름과 설명을 붙여 이 브라우저에 저장합니다. JSON 파일로 내보내고 불러올 수 있습니다.');
  const nm = A.el('input'); nm.placeholder = '장면 이름'; nm.value = `장면 ${gLoad().length + 1}`; h.field(box, '이름', nm);
  const ds = A.el('textarea', 'sb-note'); ds.placeholder = '설명 (무엇을 실험했는지)'; box.append(ds);
  const list = A.el('ul', 'sb-recs sb-gallery');
  const render = () => { list.innerHTML = ''; const l = gLoad(); if (!l.length) list.append(A.el('li', '', '저장한 장면이 없습니다.'));
    l.forEach((s, i) => { const li = A.el('li'); li.append(A.el('b', '', esc(s.name)), A.el('span', '', ` ${s.at.slice(0, 16).replace('T', ' ')} · 천체 ${s.data.bodies.length}개${s.version ? ' · ' + esc(s.version) : ''}${s.settings ? ` · G ×${s.settings.G}` : ''}`));
      if (s.desc) li.append(A.el('div', 'note', esc(s.desc)));
      const row = A.el('div', 'sb-row'); row.append(h.btn('불러오기', () => loadExperiment(s, false)), ...(s.initial ? [h.btn('처음 조건으로', () => loadExperiment(s, true))] : []), h.btn('지우기', () => { const L = gLoad(); L.splice(i, 1); gSave(L); render(); })); li.append(row); list.append(li); }); };
  box.append(h.btn('지금 장면 저장', () => { const l = gLoad(); l.push({ name: nm.value.trim() || '이름 없는 장면', desc: ds.value.trim(), at: new Date().toISOString(), data: A.sceneData(), ...experiment() });
    if (gSave(l.slice(-30))) A.toast('갤러리에 저장했습니다'); else A.toast('저장 공간이 부족하거나 저장이 막혀 있습니다'); nm.value = `장면 ${gLoad().length + 1}`; ds.value = ''; render(); }, 'sb-go'));
  const io = A.el('div', 'sb-row'), fi = A.el('input'); fi.type = 'file'; fi.accept = 'application/json,.json'; fi.hidden = true;
  io.append(h.btn('JSON으로 내보내기', () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(gLoad(), null, 1)], { type: 'application/json' })); a.download = 'space-commons-scenes.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }),
    h.btn('JSON 불러오기', () => fi.click()), fi);
  fi.onchange = async () => { try { const x = JSON.parse(await fi.files[0].text()), arr = (Array.isArray(x) ? x : [x]).filter(s => s && s.data && Array.isArray(s.data.bodies));
    gSave([...gLoad(), ...arr.map(s => ({ name: String(s.name || '불러온 장면'), desc: String(s.desc || ''), at: s.at || new Date().toISOString(), data: s.data, initial: s.initial, settings: s.settings, version: s.version, base: s.base }))].slice(-30)); A.toast(`${arr.length}개 장면을 불러왔습니다`); render(); } catch { A.toast('불러올 수 없는 파일입니다'); } };
  box.append(A.el('div', 'sb-sec', '<span>저장한 장면</span>'), list, io); render();
}
const esc = (s) => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// ---------------- 4. tides: spin-down to synchronous rotation, and tidal heating ----------------
// dω/dt = 3 k2 G M² R³ / (2 α Q m a⁶) (Gladman et al. 1996 form), heating Ė = (21/2)(k2/Q) G M² R⁵ n e² / a⁶ (Peale et al. 1979) plus the despin work
const K2 = 0.3, QF = 100, ALPHA = 0.4;
function tides(dDays) {
  st.tideAcc += dDays; if (st.tideAcc < 0.02 && A.sim.speed < 5) return; const days = st.tideAcc; st.tideAcc = 0;
  for (const b of A.sim.bodies) {
    if (b.test || b.dead || b.kind !== 'planet' || !b.Rkm) continue;
    const e = relOrbit(b); if (!e || !(e.a > 0) || e.o.m < b.m * 3) { b.tide = null; continue; }
    const M = e.o.m * MSUN_KG, m = b.m * MSUN_KG, R = b.Rkm * 1e3, a = e.a * A.O.AU_KM * 1e3, n = e.n / 86400; // SI
    const spinH = b.spinH ?? 24, w = 2 * Math.PI / (spinH * 3600) * Math.sign(spinH || 1);
    const rate = 3 * K2 * G_SI * M * M * R ** 3 / (2 * ALPHA * QF * m * a ** 6);       // rad/s²
    const dtS = days * 86400 * st.tideK, dw = w - n; let w2 = w;
    if (Math.abs(dw) > 1e-4 * n) { const step = rate * dtS; w2 = Math.abs(dw) <= step ? n : w - Math.sign(dw) * step; }
    else w2 = n;
    const locked = Math.abs(w2 - n) <= 1e-3 * n; b.spinH = 2 * Math.PI / w2 / 3600;
    const Ee = 10.5 * (K2 / QF) * G_SI * M * M * R ** 5 * n * e.e * e.e / a ** 6, Ew = rate * ALPHA * m * R * R * Math.abs(w - n), F = (Ee + Ew) / (4 * Math.PI * R * R);
    b.tide = { F, Ph: 2 * Math.PI / n / 3600, locked };
    if (locked && !st.tideMsg.has(b)) { st.tideMsg.add(b); A.toast(`${b.ko}이(가) 조석 고정되었습니다: 자전 주기와 공전 주기가 같아져 ${e.o.ko}에서 늘 같은 면만 보입니다`); }
    glow(b, F);
  }
}
function glow(b, F) { // tidal heat flux (W/m²) as a dull red to yellow glow; Io is about 2.5 W/m²
  const m = b.mesh?.children[1]?.material; if (!m?.emissive) return; const k = Math.max(0, Math.min(1, (Math.log10(Math.max(F, 1e-6)) + 1.3) / 2.2));
  m.emissive.setRGB(0.9 * k, 0.32 * k * k, 0.05 * k * k * k); b.glowK = k;
}
function clearTideGlow() { for (const b of A.sim.bodies) if (b.glowK) { b.mesh?.children[1]?.material?.emissive?.setRGB(0, 0, 0); b.glowK = 0; } }
function scenIo() {
  A.clearScene(); A.sim.bodies.length = 0; const MJ = A.MASS.Jupiter, AU = A.O.AU_KM;
  A.sim.bodies.push(A.makeBody('Jupiter', [0, 0, 0], [0, 0, 0], { ko: '목성', m: MJ, Rkm: 71492, color: 0xd9b48a, kind: 'planet' }));
  const moon = (name, ko, akm, mkg, Rkm, col, e, ph) => { const a = akm / AU, mu = A.O.MU_SUN * MJ, rp = a * (1 - e), vp = Math.sqrt(mu * (1 + e) / rp); const b = A.makeBody(name, [rp * Math.cos(ph), rp * Math.sin(ph), 0], [-vp * Math.sin(ph), vp * Math.cos(ph), 0], { ko, m: mkg / MSUN_KG, Rkm, color: col, kind: 'planet' }); A.sim.bodies.push(b); return b; };
  const io = moon('Io', '이오', 421700, 8.93e22, 1821, 0xe8d06a, 0.04, 0), eu = moon('Europa', '유로파', 671000, 4.8e22, 1561, 0xcdbfa8, 0.009, 2);
  io.spinH = 5; eu.spinH = 9; A.buildMeshes(); A.sim.E0 = A.energy(); A.snapshot(); A.sim.speed = 2; A.sim.playing = true; A.select(io); A.focus('Jupiter', 0.012);
  st.tides = true; st.tideK = 1e4; const cb = q('.sb-tides'); if (cb) cb.checked = true; const k = q('.sb-tidek'); if (k) k.value = 4; st.tideMsg.clear();
  const h = H(), box = A.labBox('조석 고정과 조석 가열', '이오는 처음에 5시간마다 한 바퀴 자전하도록 바꿨습니다. 목성의 조석이 자전을 늦춰, 공전 주기(42.5시간)와 같아지면 멈춥니다.');
  h.steps(box, ['정보 창의 "자전" 값이 공전 주기 쪽으로 줄어드는 것을 보세요. 조석 시간은 1만 배 빠르게 흐릅니다 (보기 탭에서 바꿀 수 있습니다).', '이오의 궤도는 이심률 0.04로 살짝 찌그러져 있어, 목성과의 거리가 바뀔 때마다 몸이 늘었다 줄었다 하며 데워집니다. 표면의 붉은빛이 그 열입니다.', '유로파의 이심률(0.009)은 작아서 훨씬 덜 데워집니다.']);
  const set = h.results(box); A.setLab({ tick: () => set([['이오 자전 / 공전', io.tide ? `${A.fmt(io.spinH, 2)} / ${A.fmt(io.tide.Ph, 2)} 시간` : '-'], ['이오 조석 열 흐름', io.tide ? `${A.fmt(io.tide.F, 2)} W/m² (지구 내부열 0.09)` : '-'], ['유로파 조석 열 흐름', eu.tide ? `${A.fmt(eu.tide.F, 3)} W/m²` : '-']]) });
  h.deeper(box, '조석 토크 τ = (3/2)(k₂/Q) G M² R⁵ / a⁶ 가 자전을 늦추고, 관성모멘트 I = 0.4 m R²로 나눠 각가속도를 얻습니다. 이심률 가열은 Ė = (21/2)(k₂/Q) G M² R⁵ n e² / a⁶ (필 외 1979)로, 이 모형(k₂ = 0.3, Q = 100)은 이오의 실제 열(약 10¹⁴ W, 2.5 W/m²)과 자릿수가 비슷합니다. 실제 이오의 이심률은 유로파·가니메데와의 1:2:4 공명이 유지합니다.');
}

// ---------------- 5. Roche limit: a moon inside it breaks into a spreading ring ----------------
function rocheCheck() {
  const B = A.sim.bodies; let any = false;
  for (let i = 0; i < B.length; i++) { const b = B[i]; if (b.test || b.dead || b.kind !== 'planet' || !b.Rkm) continue;
    for (let j = 0; j < B.length; j++) { const o = B[j]; if (o === b || o.test || o.dead || o.kind === 'bh' || !o.Rkm || o.m < b.m * 20) continue;
      const d = Math.hypot(b.r[0] - o.r[0], b.r[1] - o.r[1], b.r[2] - o.r[2]) * A.O.AU_KM;
      if (d > o.Rkm + b.Rkm && d < A.rocheKm(o, A.density(b))) { breakup(b, o); any = true; break; } } }
  if (any) { A.sim.bodies = A.sim.bodies.filter(b => !b.dead); A.sim.E0 = A.energy(); }
}
export function onDisrupt(small, big) { if (big.kind === 'bh' || big.kind === 'star') return false; breakup(small, big); return true; }
function breakup(small, big) {
  const N = matchMedia('(max-width: 640px)').matches ? 150 : 320, AU = A.O.AU_KM, s = Math.max(small.Rkm * 3, 2000) / AU;
  const rx = small.r[0] - big.r[0], ry = small.r[1] - big.r[1], rz = small.r[2] - big.r[2], d0 = Math.hypot(rx, ry, rz), vx = small.v[0] - big.v[0], vy = small.v[1] - big.v[1], vz = small.v[2] - big.v[2];
  for (let i = 0; i < N; i++) { const t = Math.random() * 2 * Math.PI, u = Math.sqrt(Math.random()) * s, p = [rx + u * Math.cos(t), ry + u * Math.sin(t), rz + (Math.random() - 0.5) * s * 0.2], d = Math.hypot(...p), k = Math.sqrt(d0 / d);
    const f = A.makeBody(`${small.name}-rr${i}`, [big.r[0] + p[0], big.r[1] + p[1], big.r[2] + p[2]], [big.v[0] + vx * k, big.v[1] + vy * k, big.v[2] + vz * k], { m: 0, ko: '', color: small.color ?? 0xd9c9b0 });
    f.frag = true; f.trail = new Float32Array(3); A.sim.bodies.push(f); A.buildMesh(f); if (f.line) f.line.visible = false; }
  A.kill(small); A.flash(small.r, 0.05, 0xffd0b0);
  A.toast(`${small.ko}이(가) ${big.ko}의 로슈 한계(${A.fmt(A.rocheKm(big, A.density(small)), 0)} km) 안으로 들어와 조석력에 부서졌습니다. 조각들은 안쪽이 더 빨리 돌아 고리로 퍼집니다`);
}
function scenRoche() {
  A.clearScene(); A.sim.bodies.length = 0; const MS = A.MASS.Saturn, AU = A.O.AU_KM, R = 58232;
  A.sim.bodies.push(A.makeBody('Saturn', [0, 0, 0], [0, 0, 0], { ko: '토성', m: MS, Rkm: R, color: 0xe6d29c, kind: 'planet' }));
  const rhoM = 900, Rm = 250, mm = rhoM * 4 / 3 * Math.PI * (Rm * 1e3) ** 3 / MSUN_KG, ra = 4.5 * R / AU, rp = 1.85 * R / AU, a = (ra + rp) / 2, mu = A.O.MU_SUN * MS, va = Math.sqrt(mu * (2 / ra - 1 / a));
  const moon = A.makeBody('icemoon', [ra, 0, 0], [0, va, 0], { ko: '얼음 위성', m: mm, Rkm: Rm, color: 0xcfe0ee, kind: 'planet' }); A.sim.bodies.push(moon);
  A.buildMeshes(); A.sim.E0 = A.energy(); A.snapshot(); A.sim.speed = 0.08; A.sim.playing = true; A.focus('Saturn', 0.004); A.select(moon);
  const h = H(), box = A.labBox('로슈 한계와 고리', '얼음 위성(지름 500 km)이 찌그러진 궤도로 토성에 가까이 갑니다. 가장 가까운 점(토성 반지름의 1.85배)이 로슈 한계(약 2.2배) 안쪽입니다.');
  h.steps(box, ['점선 원이 로슈 한계입니다 (보기 탭). 위성이 그 안으로 들어가면 토성이 가까운 쪽과 먼 쪽을 당기는 힘의 차이가 위성 스스로의 중력보다 커집니다.', '부서진 조각들은 안쪽일수록 빨리 돌아 몇 바퀴 만에 고리로 퍼집니다. 토성 고리도 이렇게 생겼다는 가설이 있습니다.']);
  h.deeper(box, '유체 위성의 로슈 한계는 d = 2.44 R (ρ_행성/ρ_위성)^(1/3) 입니다. 토성(평균 밀도 687 kg/m³)과 얼음(900 kg/m³)이면 d ≈ 2.23 R, 약 13만 km로 지금의 A 고리 바깥 끝 근처입니다. 단단한 바위 위성은 자체 강도 덕분에 이보다 조금 더 안쪽까지 버팁니다.');
}

// ---------------- 6. the end of massive stars ----------------
const SN_V = 10000 / 1731.457; // ejecta speed, AU/day (10 000 km/s)
function supernovae(dDays) {
  for (const s of A.sim.bodies) { if (s.kind !== 'star' || s.dead || s.remnant || s.m < 8) continue;
    if (s.snAt != null && A.sim.t >= s.snAt) explode(s); } // set by the supernova scenarios; otherwise the star's age (setAge in sandbox.js) decides
  for (let i = st.sn.length - 1; i >= 0; i--) { const e = st.sn[i], R = (A.sim.t - e.t0) * SN_V;
    for (const p of A.sim.bodies) { if (p === e.star || p.dead || e.hit.has(p) || false) continue;
      const d = Math.hypot(p.r[0] - e.c[0], p.r[1] - e.c[1], p.r[2] - e.c[2]); if (d > R) continue; e.hit.add(p);
      if (p.kind === 'planet' && p.Rkm) { // momentum of the ejecta that hits the planet's cross-section, pushing it outward; the atmosphere is stripped close in
        const frac = (p.Rkm / A.O.AU_KM) ** 2 / (4 * d * d), dv = Math.min(0.5 * SN_V, e.Mej * frac * SN_V / Math.max(p.m, 1e-12)), u = [(p.r[0] - e.c[0]) / d, (p.r[1] - e.c[1]) / d, (p.r[2] - e.c[2]) / d];
        p.v[0] += u[0] * dv; p.v[1] += u[1] * dv; p.v[2] += u[2] * dv;
        if (d < 15 && p.atm?.P > 0) { p.atm = { ...p.atm, P: 0 }; e.stripped.push(p.ko); } } }
    if (e.shell) { e.shell.scale.setScalar(Math.max(1e-4, R)); e.shell.material.uniforms.k.value = Math.max(0, 1 - R / 80); }
    if (R > 80) { if (e.stripped.length) A.toast(`충격파가 ${e.stripped.join(', ')}의 대기를 벗겨 냈습니다`); clearShell(e); st.sn.splice(i, 1); } }
  A.sim.bodies = A.sim.bodies.filter(b => !b.dead);
}
export function explode(s) {
  const m0 = s.base0?.m ?? s.m, bh = m0 >= 20, mr = bh ? Math.max(3, 0.3 * m0) : 1.4, Mej = m0 - mr, c = [...s.r];
  s.remnant = true; s.m = mr; s.lumK = bh ? 0 : 1e-4;
  if (bh) { s.kind = 'bh'; s.Rkm = A.RS_KM(mr); s.color = 0x000000; s.ko = `블랙홀 (${A.fmt(mr, 1)} 태양질량)`; }
  else { s.kind = 'star'; s.Rkm = 12; s.color = 0xcfe0ff; s.ko = '중성자별 (1.4 태양질량)'; }
  A.rebuild(s); A.sim.E0 = A.energy();
  A.flash(c, 2.5, 0xffffff); A.flash(c, 1.2, 0xbfd6ff);
  const shell = new A.THREE.Mesh(new A.THREE.SphereGeometry(1, 48, 24), new A.THREE.ShaderMaterial({ uniforms: { k: { value: 1 } }, transparent: true, depthWrite: false, blending: A.THREE.AdditiveBlending, side: A.THREE.DoubleSide,
    vertexShader: 'varying vec3 vN, vV; void main(){ vec4 w = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-w.xyz); gl_Position = projectionMatrix * w; }',
    fragmentShader: 'uniform float k; varying vec3 vN, vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 3.0); gl_FragColor = vec4(vec3(0.62, 0.78, 1.0) * f * k + vec3(1.0, 0.55, 0.3) * f * f * k * 0.6, f * k); }' }));
  shell.position.set(...c); shell.scale.setScalar(1e-4); A.scene.add(shell);
  st.sn.push({ star: s, c, t0: A.sim.t, Mej, shell, hit: new Set([s]), stripped: [] });
  A.sim.speed = Math.min(Math.abs(A.sim.speed), 1);
  A.toast(`초신성 폭발: 중심핵이 무너지며 바깥층 ${A.fmt(Mej, 1)} 태양질량을 초속 1만 km로 날려 보냈습니다. ${bh ? '남은 핵이 무거워 블랙홀이 되었습니다' : '남은 핵은 지름 약 24 km의 중성자별입니다'} (이 모형은 처음 질량 약 20 태양질량을 경계로 나누지만, 실제 경계는 금속 함량·질량 손실·회전·쌍성에 따라 달라집니다). 별의 질량이 크게 줄어 행성들이 붙잡혀 있지 못합니다`);
}
function clearShell(e) { const list = e ? [e] : st.sn; for (const x of list) if (x.shell) { A.scene.remove(x.shell); x.shell.geometry.dispose(); x.shell.material.dispose(); x.shell = null; } }
function scenSN(m) {
  A.clearScene(); A.sim.bodies.length = 0; const star = A.makeBody('Sun', [0, 0, 0], [0, 0, 0], { ko: `무거운 별 (${m} 태양질량)`, m, kind: 'star', Rkm: A.starRadiusKm(m), color: A.starColor(m) }); A.sim.bodies.push(star);
  const P = [['p1', '뜨거운 목성', 4, A.MASS.Jupiter, 71492, 0xd9b48a], ['p2', '바위 행성', 9, A.MASS.Earth, 6371, 0x6fa8ff], ['p3', '얼음 거인', 22, A.MASS.Neptune, 24622, 0x6f8dff]];
  for (const [n, ko, a, mm, R, col] of P) { const v = Math.sqrt(A.O.MU_SUN * m / a), b = A.makeBody(n, [a, 0, 0], [0, v, 0], { ko, m: mm, Rkm: R, color: col, kind: 'planet' }); if (n === 'p2') b.atm = { P: 1, mix: { N2: 0.78, O2: 0.21, Ar: 0.01 } }; A.sim.bodies.push(b); }
  A.buildMeshes(); A.sim.E0 = A.energy(); star.snAt = A.sim.t + 200; A.snapshot(); A.sim.speed = 40; A.sim.playing = true; A.focus('Sun', 40); A.select(null);
  const h = H(), box = A.labBox(`초신성: ${m} 태양질량 별`, `8 태양질량이 넘는 별은 중심에서 철까지 만든 뒤 핵이 무너져 폭발합니다. 이 별은 약 200일 뒤 터집니다 (시간 압축).`);
  h.steps(box, ['폭발 순간 섬광과 함께 퍼지는 충격파 껍질이 보입니다.', m >= 20 ? '30 태양질량 별의 핵은 너무 무거워 블랙홀이 됩니다.' : '15 태양질량 별의 핵은 지름 약 24 km의 중성자별이 됩니다.', '별이 질량의 대부분을 잃으므로, 행성들은 원래 속도를 그대로 가진 채 붙잡는 힘을 잃고 날아갑니다. 충격파는 가까운 행성의 대기를 벗겨 냅니다.']);
  h.deeper(box, '남는 천체는 별의 처음 질량과 금속 함량, 회전에 따라 달라지며, 대략 8~20 태양질량이면 중성자별, 그보다 무거우면 블랙홀이 됩니다 (Heger et al. 2003). 질량의 절반 넘게 갑자기 잃으면 원 궤도의 행성은 풀려납니다: 남은 질량이 M′ < M/2이면 v > √(2GM′/r).');
}

// ---------------- 7. binary mass transfer: a stream from L1 into an accretion disc ----------------
const eggleton = (q) => { const q3 = Math.cbrt(q), q23 = q3 * q3; return 0.49 * q23 / (0.6 * q23 + Math.log(1 + q3)); }; // Roche-lobe radius / separation for mass ratio q = M_donor / M_other
const MTN = 2400;
function clearMT() { if (!st.mt) return; A.scene.remove(st.mt.pts); st.mt.pts.geometry.dispose(); st.mt.pts.material.dispose(); st.mt = null; }
function massTransfer(dDays) {
  st.mtCheck += dDays; const mt = st.mt;
  if (!mt || mt.donor.dead || mt.acc.dead) { if (mt) clearMT(); if (st.mtCheck < 0.05) return; st.mtCheck = 0; findDonor(); return; }
  const d = mt.donor, c = mt.acc, P = mt.P, nSub = Math.min(120, Math.max(1, Math.ceil(dDays / (P / 500)))), hh = dDays / nSub, mu1 = A.O.MU_SUN * A.sim.G * d.m, mu2 = A.O.MU_SUN * A.sim.G * c.m, X = mt.x, V = mt.v, al = mt.alive;
  const a = Math.hypot(d.r[0] - c.r[0], d.r[1] - c.r[1], d.r[2] - c.r[2]), Racc = Math.max(c.Rkm / A.O.AU_KM * 2, 0.025 * a), Rdisc = 0.42 * a;
  for (let s = 0; s < nSub; s++) {
    const tb = -dDays + (s + 0.5) * hh; // star positions back-extrapolated within this frame
    const dx0 = d.r[0] + d.v[0] * tb, dy0 = d.r[1] + d.v[1] * tb, dz0 = d.r[2] + d.v[2] * tb, cx0 = c.r[0] + c.v[0] * tb, cy0 = c.r[1] + c.v[1] * tb, cz0 = c.r[2] + c.v[2] * tb;
    mt.emit += hh * MTN / (2.5 * P);
    while (mt.emit >= 1) { mt.emit -= 1; const i = mt.next; mt.next = (mt.next + 1) % MTN; emitAt(i, dx0, dy0, dz0, cx0, cy0, cz0); }
    for (let i = 0; i < MTN; i++) { if (!al[i]) continue; const j = i * 3;
      let ax = 0, ay = 0, az = 0, ex = dx0 - X[j], ey = dy0 - X[j + 1], ez = dz0 - X[j + 2], r2 = ex * ex + ey * ey + ez * ez + 1e-14, f = mu1 / (r2 * Math.sqrt(r2)); ax += f * ex; ay += f * ey; az += f * ez;
      ex = cx0 - X[j]; ey = cy0 - X[j + 1]; ez = cz0 - X[j + 2]; r2 = ex * ex + ey * ey + ez * ez + 1e-14; const rc = Math.sqrt(r2); f = mu2 / (r2 * rc); ax += f * ex; ay += f * ey; az += f * ez;
      V[j] += ax * hh; V[j + 1] += ay * hh; V[j + 2] += az * hh;
      if (rc < Rdisc && mt.inDisc[i] + 1) { // viscosity stand-in: the gas relaxes towards a circular orbit about the accretor and slowly spirals in
        const vc = Math.sqrt(mu2 / rc), tx = -ey / rc * mt.hs, ty = ex / rc * mt.hs, rvx = V[j] - c.v[0], rvy = V[j + 1] - c.v[1], rvz = V[j + 2] - c.v[2], k = 1 - Math.exp(-hh / (0.06 * P));
        V[j] += ((tx * vc - 0.015 * vc * -ex / rc) - rvx) * k; V[j + 1] += ((ty * vc - 0.015 * vc * -ey / rc) - rvy) * k; V[j + 2] += (-rvz) * k; mt.inDisc[i] = 1; }
      X[j] += V[j] * hh; X[j + 1] += V[j + 1] * hh; X[j + 2] += V[j + 2] * hh;
      if (rc < Racc) { al[i] = 0; mt.accreted++; } else if (rc > 3 * a) al[i] = 0; } }
  if (mt.nova && mt.accreted >= 1500) { mt.accreted = 0; A.flash(c.r, 0.25, 0xffffff); A.flash(c.r, 0.12, 0xffe0a0);
    for (let i = 0; i < MTN; i++) if (al[i] && mt.inDisc[i]) { const j = i * 3, ex = X[j] - c.r[0], ey = X[j + 1] - c.r[1], ez = X[j + 2] - c.r[2], r = Math.hypot(ex, ey, ez) || 1, kick = 3 * Math.sqrt(mu2 / r); V[j] += ex / r * kick; V[j + 1] += ey / r * kick; V[j + 2] += ez / r * kick; mt.inDisc[i] = -1; }
    A.toast('신성 폭발: 백색왜성 표면에 쌓인 수소가 한꺼번에 핵융합하며 밝게 터졌습니다. 별 자체는 살아남아 다시 가스를 받습니다'); }
  const pos = mt.pts.geometry.attributes.position, col = mt.pts.geometry.attributes.color, pa = pos.array, ca = col.array;
  for (let i = 0; i < MTN; i++) { const j = i * 3; if (!al[i]) { pa[j] = c.r[0]; pa[j + 1] = c.r[1]; pa[j + 2] = c.r[2]; ca[j] = ca[j + 1] = ca[j + 2] = 0; continue; }
    pa[j] = X[j]; pa[j + 1] = X[j + 1]; pa[j + 2] = X[j + 2]; const rc = Math.hypot(X[j] - c.r[0], X[j + 1] - c.r[1], X[j + 2] - c.r[2]) / Rdisc, t = Math.max(0, Math.min(1, 1 - rc));
    ca[j] = 1 - 0.25 * t; ca[j + 1] = 0.55 + 0.4 * t; ca[j + 2] = 0.3 + 0.7 * t; }
  pos.needsUpdate = true; col.needsUpdate = true;
}
function emitAt(i, dx, dy, dz, cx, cy, cz) {
  const mt = st.mt, d = mt.donor, c = mt.acc, j = i * 3, ux = cx - dx, uy = cy - dy, uz = cz - dz, a = Math.hypot(ux, uy, uz), M = d.m + c.m;
  const xl = lagrangeX(d.m / M, 1), fromAcc = xl + d.m / M; // CR3BP frame: accretor (1 - mu) at -mu, donor at 1 - mu
  const px = cx - ux / a * fromAcc * a, py = cy - uy / a * fromAcc * a, pz = cz - uz / a * fromAcc * a;
  const gx = (d.m * dx + c.m * cx) / M, gy = (d.m * dy + c.m * cy) / M, gvx = (d.m * d.v[0] + c.m * c.v[0]) / M, gvy = (d.m * d.v[1] + c.m * c.v[1]) / M, gvz = (d.m * d.v[2] + c.m * c.v[2]) / M;
  const w = 2 * Math.PI / mt.P * mt.hs, rx = px - gx, ry = py - gy, cs = 0.04 * a * w, jit = () => (Math.random() - 0.5) * cs;
  mt.x[j] = px + jit() * 0.01; mt.x[j + 1] = py + jit() * 0.01; mt.x[j + 2] = pz;
  mt.v[j] = gvx - w * ry + ux / a * cs + jit(); mt.v[j + 1] = gvy + w * rx + uy / a * cs + jit(); mt.v[j + 2] = gvz + jit() * 0.3; mt.alive[i] = 1; mt.inDisc[i] = 0;
}
function findDonor() {
  const S = A.sim.bodies.filter(b => b.kind === 'star' && !b.dead && b.Rkm); if (S.length < 2) return;
  for (const d of S) for (const c of A.sim.bodies) { if (c === d || c.dead || c.test || (c.kind !== 'star' && c.kind !== 'bh')) continue;
    const a = Math.hypot(d.r[0] - c.r[0], d.r[1] - c.r[1], d.r[2] - c.r[2]); if (d.Rkm / A.O.AU_KM < 0.97 * eggleton(d.m / c.m) * a) continue;
    const mu = A.O.MU_SUN * A.sim.G * (d.m + c.m), hz = (d.r[0] - c.r[0]) * (d.v[1] - c.v[1]) - (d.r[1] - c.r[1]) * (d.v[0] - c.v[0]);
    const g = new A.THREE.BufferGeometry(); g.setAttribute('position', new A.THREE.BufferAttribute(new Float32Array(MTN * 3), 3)); g.setAttribute('color', new A.THREE.BufferAttribute(new Float32Array(MTN * 3), 3));
    const pts = new A.THREE.Points(g, new A.THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, blending: A.THREE.AdditiveBlending })); pts.frustumCulled = false; A.scene.add(pts);
    st.mt = { donor: d, acc: c, P: 2 * Math.PI * Math.sqrt(a ** 3 / mu), hs: Math.sign(hz) || 1, x: new Float64Array(MTN * 3), v: new Float64Array(MTN * 3), alive: new Uint8Array(MTN), inDisc: new Int8Array(MTN), next: 0, emit: 0, accreted: 0, nova: st.novaOn ?? true, pts };
    A.toast(`${d.ko}이(가) 로슈 엽을 가득 채워, 가스가 L1점을 넘어 ${c.ko} 쪽으로 흘러갑니다`); return; }
}
function scenBinary() {
  A.clearScene(); A.sim.bodies.length = 0; const md = 0.7, ma = 0.9, a = 0.006, M = md + ma, v = Math.sqrt(A.O.MU_SUN * M / a), RL = eggleton(md / ma) * a * A.O.AU_KM;
  A.sim.bodies.push(A.makeBody('Sun', [-a * md / M, 0, 0], [0, -v * md / M, 0], { ko: '백색왜성 (0.9)', m: ma, kind: 'star', Rkm: 6000, color: 0xdfe8ff }));
  A.sim.bodies.push(A.makeBody('donor', [a * ma / M, 0, 0], [0, v * ma / M, 0], { ko: '주계열성 (0.7, 로슈 엽을 채움)', m: md, kind: 'star', Rkm: RL * 1.01, color: 0xffb070 }));
  A.sim.bodies[0].lumK = 0.01; A.buildMeshes(); A.sim.E0 = A.energy(); A.snapshot(); A.sim.speed = 0.01; A.sim.playing = true; A.focus('Sun', a * 7); A.select(null); st.mtCheck = 1;
  const h = H(), box = A.labBox('쌍성의 질량 이동과 신성', `두 별이 ${A.fmt(a * A.O.AU_KM, 0)} km 떨어져 약 ${A.fmt(2 * Math.PI * Math.sqrt(a ** 3 / (A.O.MU_SUN * M)) * 24, 1)}시간마다 서로를 돕니다 (격변 변광성). 주황색 별이 자기 로슈 엽을 가득 채웠습니다.`);
  h.steps(box, ['가스는 두 별의 중력이 비기는 L1점을 넘어 백색왜성 쪽으로 떨어집니다.', '별들이 돌고 있으므로 가스 줄기는 곧장 떨어지지 못하고 휘어 백색왜성 둘레에 원반(강착 원반)을 만듭니다.', '원반 안쪽으로 흘러든 수소가 백색왜성 표면에 쌓이다 한꺼번에 타오르면 신성입니다.']);
  const cb = A.el('label', '', '<input type="checkbox" checked> 신성 폭발 켜기'); cb.querySelector('input').onchange = (e) => { st.novaOn = e.target.checked; if (st.mt) st.mt.nova = e.target.checked; }; box.append(cb);
  const set = h.results(box); A.setLab({ tick: () => set([['로슈 엽 반지름 (주황색 별)', `${A.fmt(RL, 0)} km (에글턴 식)`], ['상태', st.mt ? `질량 이동 중 · 쌓인 가스 ${Math.min(100, Math.round(st.mt.accreted / 15))}%` : '준비 중']]) });
  h.deeper(box, '로슈 엽의 크기는 에글턴(1983) 근사식 r_L/a = 0.49 q^(2/3) / (0.6 q^(2/3) + ln(1 + q^(1/3)))로 구합니다. 실제 원반에서는 기체의 점성이 각운동량을 바깥으로 옮겨 기체가 안쪽으로 흘러듭니다. 여기서는 그 효과를 원 궤도로 끌어당기는 감쇠로 흉내 냈습니다.');
}

// ---------------- 8. seasons: axial tilt, spin period, ocean fraction ----------------
const NS = 96;
export function seasonModel(b, tilt, spinH, ocean) {
  const e = relOrbit(b); if (!e || !(e.a > 0) || e.e >= 1) return null;
  const k = ATM.climate(b, A.teq(b)), Tm = k ? k.Ts : A.teq(b), S = 1, eps = tilt * D2R, ecc = e.e, wbar = b.name === 'Earth' ? 283 * D2R : 0;
  const lat = [45 * D2R, -45 * D2R], out = { Tn: new Float32Array(NS), Ts: new Float32Array(NS), day: 0, Tm, P: e.P };
  const Q = (phi, dec, rr) => { const c = -Math.tan(phi) * Math.tan(dec), h0 = c >= 1 ? 0 : c <= -1 ? Math.PI : Math.acos(c); return S / Math.PI / (rr * rr) * (h0 * Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.sin(h0)); };
  const Qm = S / 4 / Math.sqrt(1 - ecc * ecc), q0 = 0.6 * Qm, tau = (4 + 140 * ocean) / Math.max(1, e.P / 365.25) * 1; // relaxation in fractions of the orbit... scaled below
  const T = [Tm, Tm], dt = e.P / NS, tauD = 4 + 140 * ocean;
  for (let pass = 0; pass < 4; pass++) for (let i = 0; i < NS; i++) {
    const M = 2 * Math.PI * i / NS; let E = M; for (let it = 0; it < 8; it++) E -= (E - ecc * Math.sin(E) - M) / (1 - ecc * Math.cos(E));
    const nu = 2 * Math.atan2(Math.sqrt(1 + ecc) * Math.sin(E / 2), Math.sqrt(1 - ecc) * Math.cos(E / 2)), rr = 1 - ecc * Math.cos(E), dec = Math.asin(Math.sin(eps) * Math.sin(nu + wbar));
    for (let hh = 0; hh < 2; hh++) { const Ts = Tm * Math.pow((Q(lat[hh], dec, rr) + q0) / (Qm * 0.72 + q0), 0.25); T[hh] += (Ts - T[hh]) * (1 - Math.exp(-dt / tauD)); (hh ? out.Ts : out.Tn)[i] = T[hh]; } }
  out.day = Tm * 0.25 * (1 - Math.exp(-(Math.abs(spinH) / 24) / (0.3 + 8 * ocean)));
  void tau; return out;
}
function seasonsLive() { // the climate shader's polar temperature follows the colder hemisphere through the year
  for (const b of A.sim.bodies) { if (!b.season || b.dead) continue; const e = relOrbit(b), cu = b.mesh?.children[1]?.material?.userData?.climate; if (!e || !cu) continue;
    const lon = Math.atan2(b.r[1] - e.o.r[1], b.r[0] - e.o.r[0]), i = ((Math.round((lon / (2 * Math.PI)) * NS) % NS) + NS) % NS, s = b.season;
    b.seasonNow = [s.Tn[i], s.Ts[i]]; cu.uTpole.value = Math.min(s.Tn[i], s.Ts[i]) - 35; }
}
function openSeasons() {
  const h = H(), box = A.labBox('계절과 바다', '자전축 기울기는 계절을, 자전 주기는 낮과 밤의 온도 차를, 바다의 비율은 온도가 얼마나 천천히 바뀌는지를 정합니다.');
  h.steps(box, ['행성을 고르고 기울기를 0°로 바꿔 보세요: 계절이 거의 사라집니다.', '바다를 0%로 하면 땅이 빨리 데워지고 식어 연교차와 일교차가 커집니다.', '그래프는 북위 45°(파랑)와 남위 45°(금색)의 온도를 한 해 동안 그립니다. 띠는 하루 동안의 변화입니다.']);
  const sel = A.el('select'); for (const b of A.sim.bodies) if (b.kind === 'planet' && !b.dead && !b.test) sel.append(new Option(b.ko, b.name)); if (A.byName('Earth')) sel.value = 'Earth'; h.field(box, '행성', sel);
  const tilt = slider(h, A, box, '자전축 기울기 (°)', 23.4, 0, 90, 0.5, '0:0|23.4:지구|90:90'), spin = slider(h, A, box, '자전 주기 (시간, 로그)', Math.log10(24), 0, 3.5, 0.05, '0:1|1.38:24|2.77:금성 가까이|3.5:3162');
  const oc = slider(h, A, box, '바다 비율 (%)', 71, 0, 100, 1, '0:땅만|71:지구|100:바다만');
  const cv = canvas(h, box, 340, 190), set = h.results(box);
  const load = () => { const b = A.byName(sel.value); if (!b) return; tilt.value = b.tilt ?? ({ Earth: 23.44, Mars: 25.19, Venus: 177.4, Mercury: 0.03, Jupiter: 3.13, Saturn: 26.73, Uranus: 97.77, Neptune: 28.32 }[b.name] ?? 0); if (+tilt.value > 90) tilt.value = 180 - tilt.value;
    spin.value = Math.log10(Math.max(1, Math.abs(b.spinH ?? ({ Earth: 23.93, Mars: 24.62, Venus: 5832, Mercury: 1407.6, Jupiter: 9.93, Saturn: 10.66, Uranus: 17.24, Neptune: 16.11 }[b.name] ?? 24)))); oc.value = Math.round((b.ocean ?? (b.name === 'Earth' ? 0.71 : 0)) * 100); for (const r of [tilt, spin, oc]) r.dispatchEvent(new Event('input')); };
  const run = () => { const b = A.byName(sel.value); if (!b) return; const sp = Math.pow(10, +spin.value), o = +oc.value / 100; b.tilt = +tilt.value; b.spinH = sp; b.ocean = o; const s = seasonModel(b, +tilt.value, sp, o); b.season = s; draw(s); };
  const draw = (s) => { const { g, w, h: Hh } = cv; g.fillStyle = C.bg; g.fillRect(0, 0, w, Hh); if (!s) { txt(g, '별을 도는 행성을 고르세요', 10, 20, C.mute, 11); return; }
    let lo = 1e9, hi = -1e9; for (let i = 0; i < NS; i++) { lo = Math.min(lo, s.Tn[i] - s.day / 2, s.Ts[i] - s.day / 2); hi = Math.max(hi, s.Tn[i] + s.day / 2, s.Ts[i] + s.day / 2); } lo -= 3; hi += 3;
    const X = (i) => 34 + i / (NS - 1) * (w - 44), Y = (T) => Hh - 22 - (T - lo) / (hi - lo) * (Hh - 36);
    g.strokeStyle = C.grid; g.lineWidth = 1; for (let k = 0; k <= 4; k++) { const T = lo + (hi - lo) * k / 4, y = Y(T); g.beginPath(); g.moveTo(34, y); g.lineTo(w - 10, y); g.stroke(); numTxt(g, Math.round(T - 273.15), 30, y + 3, C.mute, 9, 'right'); }
    for (const [arr, col, band] of [[s.Tn, C.acc, 'rgba(76,141,246,.18)'], [s.Ts, C.brass, 'rgba(201,168,106,.18)']]) {
      g.fillStyle = band; g.beginPath(); for (let i = 0; i < NS; i++) g.lineTo(X(i), Y(arr[i] + s.day / 2)); for (let i = NS - 1; i >= 0; i--) g.lineTo(X(i), Y(arr[i] - s.day / 2)); g.fill();
      g.strokeStyle = col; g.lineWidth = 1.6; g.beginPath(); for (let i = 0; i < NS; i++) i ? g.lineTo(X(i), Y(arr[i])) : g.moveTo(X(i), Y(arr[i])); g.stroke(); }
    txt(g, '°C', 4, 12, C.mute, 9); txt(g, '한 번 공전하는 동안 (근일점에서 시작) →', w - 10, Hh - 6, C.mute, 9, 'right');
    const rng = (a) => { let mn = 1e9, mx = -1e9; for (const v of a) { mn = Math.min(mn, v); mx = Math.max(mx, v); } return [mn - 273.15, mx - 273.15]; }, n = rng(s.Tn), so = rng(s.Ts);
    set([['평균 표면 온도', `${A.fmt(s.Tm - 273.15, 0)} °C (대기 모형 atmos.js)`], ['북위 45° 최저 / 최고', `${A.fmt(n[0], 0)} / ${A.fmt(n[1], 0)} °C · 연교차 ${A.fmt(n[1] - n[0], 0)}`], ['남위 45° 최저 / 최고', `${A.fmt(so[0], 0)} / ${A.fmt(so[1], 0)} °C · 연교차 ${A.fmt(so[1] - so[0], 0)}`], ['하루 온도 차 (일교차)', `약 ${A.fmt(s.day, 0)} °C`], ['한 해', `${A.fmt(s.P, 0)}일`]]); };
  sel.onchange = () => { load(); run(); }; for (const r of [tilt, spin, oc]) r.addEventListener('input', run); load(); run();
  h.deeper(box, '하루 평균 일사량은 Q = (S/π)(a/r)² (h₀ sinφ sinδ + cosφ cosδ sin h₀), 태양 적위는 sinδ = sinε sin λ 입니다. 온도는 Q에 따라 정해지는 목표 온도로 시간 상수 τ(땅 약 4일, 바다 약 140일)를 두고 따라갑니다. 열이 위도 사이로 옮겨 가는 효과는 일정한 몫(q₀)으로만 넣은 단순 에너지 균형 모형입니다.');
}
