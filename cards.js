import { EN, tr } from './i18n.js';
import { CARD_EN, CHAPTERS_EN, INTROS_EN } from './cards-en.js';
import { QUIZ2 } from './quiz2.js';
// Space Commons concept cards: astrodynamics from the two-body problem to relative motion, each with a live widget.
// Level: 기초 (high school), 교양 (university general education), 전공 (astrodynamics course). Formulas in KaTeX.
import * as O from './orbits.js';

const fmt = (x, d = 2) => Number.isFinite(x) ? x.toLocaleString('ko-KR', { maximumFractionDigits: d, minimumFractionDigits: d }) : '–';
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const D2R = Math.PI / 180, MU_E = 398600.4418, RE = 6378.137, G0 = 9.80665;
let root = null, opts = {}, katexP = null;

function loadKatex() {
  if (katexP) return katexP;
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css'; document.head.append(css);
  katexP = window.katex ? Promise.resolve() : new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js'; s.onload = res; s.onerror = rej; document.head.append(s); });
  return katexP;
}
const renderTex = (box) => loadKatex().then(() => { for (const e of box.querySelectorAll('.tex:not([data-done])')) { katex.render(e.textContent, e, { throwOnError: false, displayMode: e.classList.contains('block') }); e.dataset.done = 1; } }).catch(() => {});

// ---- widget helpers ----
function canvas(box, w = 340, h = 240) {
  const c = el('canvas', 'cc-canvas'), r = Math.min(2, devicePixelRatio || 1); c.width = w * r; c.height = h * r; c.style.aspectRatio = `${w} / ${h}`;
  const g = c.getContext('2d'); g.scale(r, r); box.append(c); return { c, g, w, h };
}
function slider(box, label, min, max, step, val, show = (v) => v) {
  const l = el('label', 'cc-slider'), t = el('span'), i = el('input'); i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = val;
  const out = el('b'); const upd = () => { out.textContent = show(+i.value); }; i.addEventListener('input', upd); upd();
  t.textContent = label; l.append(t, i, out); box.append(l); return i;
}
function readout(box) { const d = el('div', 'cc-read'); box.append(d); return (rows) => { d.innerHTML = rows.map(([a, b]) => `<span>${a}</span><b>${b}</b>`).join(''); }; }
const C = { bg: '#101011', grid: '#2a2927', mute: '#8e887d', text: '#d8d2c6', teal: '#8fb8c9', amber: '#d9a650', pink: '#ef7a5f', blue: '#7f93c9', sun: '#ffe6a6' };
function clear(K) { K.g.fillStyle = C.bg; K.g.fillRect(0, 0, K.w, K.h); }
function arrow(g, x1, y1, x2, y2, col, lw = 2) { g.strokeStyle = col; g.fillStyle = col; g.lineWidth = lw; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  const a = Math.atan2(y2 - y1, x2 - x1); g.beginPath(); g.moveTo(x2, y2); g.lineTo(x2 - 8 * Math.cos(a - 0.4), y2 - 8 * Math.sin(a - 0.4)); g.lineTo(x2 - 8 * Math.cos(a + 0.4), y2 - 8 * Math.sin(a + 0.4)); g.fill(); }
const text = (g, s, x, y, col = C.text, size = 11, align = 'left') => { g.fillStyle = col; g.font = `${size}px "Pretendard Variable", "Malgun Gothic", sans-serif`; g.textAlign = align; g.fillText(tr(s), x, y); g.textAlign = 'left'; };
function dot(g, x, y, r, col) { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
function conic(g, cx, cy, S, p, e, rot = 0, col = C.teal, lw = 2) { // focus at (cx, cy), screen y up
  g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); const lim = e < 1 ? Math.PI : Math.acos(-1 / e) - 0.02; let first = true;
  for (let k = -400; k <= 400; k++) { const nu = lim * k / 400, r = p / (1 + e * Math.cos(nu)); if (!(r > 0) || r > 60) { first = true; continue; }
    const x = cx + S * r * Math.cos(nu + rot), y = cy - S * r * Math.sin(nu + rot); first ? g.moveTo(x, y) : g.lineTo(x, y); first = false; } g.stroke();
}
function plot(K, xs, series, opt = {}) { // simple line chart; series: [{ys, col, label}]
  const { g, w, h } = K, L = 40, R = 10, T = 14, B = 26, x0 = opt.x0 ?? Math.min(...xs), x1 = opt.x1 ?? Math.max(...xs);
  const all = series.flatMap(s => s.ys.filter(Number.isFinite)), y0 = opt.y0 ?? Math.min(...all), y1 = opt.y1 ?? Math.max(...all);
  const X = (x) => L + (opt.logx ? Math.log(x / x0) / Math.log(x1 / x0) : (x - x0) / (x1 - x0)) * (w - L - R), Y = (y) => h - B - (y - y0) / (y1 - y0) * (h - T - B);
  g.strokeStyle = C.grid; g.lineWidth = 1; g.strokeRect(L, T, w - L - R, h - T - B);
  text(g, fmt(y1, opt.yd ?? 1), L - 4, T + 8, C.mute, 9, 'right'); text(g, fmt(y0, opt.yd ?? 1), L - 4, h - B, C.mute, 9, 'right');
  text(g, String(fmt(x0, opt.xd ?? 0)), L, h - B + 12, C.mute, 9); text(g, String(fmt(x1, opt.xd ?? 0)), w - R, h - B + 12, C.mute, 9, 'right');
  if (opt.xl) text(g, opt.xl, (L + w - R) / 2, h - 4, C.mute, 10, 'center'); if (opt.yl) text(g, opt.yl, 4, 10, C.mute, 10);
  series.forEach((s, k) => { g.strokeStyle = s.col; g.lineWidth = s.lw || 2; g.beginPath(); let f = true; xs.forEach((x, i) => { const y = s.ys[i]; if (!Number.isFinite(y)) { f = true; return; } f ? g.moveTo(X(x), Y(y)) : g.lineTo(X(x), Y(y)); f = false; }); g.stroke();
    if (s.label) text(g, s.label, L + 6, T + 12 + k * 13, s.col, 10); });
  return { X, Y };
}

// ---- the cards ----
const CARDS = [
  { id: 'twobody', level: '교양', title: '이체 문제', tag: '궤도역학의 출발점',
    eq: String.raw`\ddot{\vec r} = -\frac{\mu}{r^3}\,\vec r`,
    body: `두 천체만 있고 서로의 중력만 작용하는 경우를 이체 문제라고 합니다. 행성과 태양, 위성과 지구처럼 궤도 계산의 출발점이 되기 때문에 가장 먼저 배웁니다. 이 경우 가벼운 쪽이 무거운 쪽 둘레를 도는 궤도는 언제나 <b>원뿔 곡선</b>(원, 타원, 포물선, 쌍곡선)이 되고, 어느 것이 되는지는 출발 속도 하나로 정해집니다. 예를 들어 원 궤도 속도로 던지면 원, 그보다 빠르면 타원이 되고, 원 궤도 속도의 √2배(탈출 속도)가 되면 포물선을 그리며 영영 돌아오지 않습니다.
      아래에서 같은 자리(거리 r₀)에서 옆으로 던지는 속도를 바꿔 보세요.`,
    deep: String.raw`각운동량 <span class="tex">\vec h = \vec r \times \dot{\vec r}</span>이 보존되므로 운동은 한 평면 안에 있습니다. 운동 방정식에 <span class="tex">\vec h</span>를 곱해 적분하면 라플라스-룽게-렌츠 벡터가 상수임을 얻고, 이로부터 궤도 방정식
      <span class="tex block">r = \frac{h^2/\mu}{1 + e\cos\nu}</span>이 나옵니다. 여기서 <span class="tex">\mu = G(m_1+m_2)</span>, ν는 진근점 이각입니다.`,
    widget(box) { const K = canvas(box), v = slider(box, '던지는 속도 / 원 궤도 속도', 0.3, 1.6, 0.01, 1, (x) => x.toFixed(2)), R = readout(box);
      return () => { clear(K); const k = +v.value, h = k, p = h * h, e = Math.abs(k * k - 1), rot = k < 1 ? Math.PI : 0, cx = K.w * 0.5, cy = K.h * 0.5, S = 46;
        dot(K.g, cx, cy, 7, C.sun); conic(K.g, cx, cy, S, p, e, rot); dot(K.g, cx + S, cy, 4, C.amber); arrow(K.g, cx + S, cy, cx + S, cy - 34 * k, C.amber);
        const eps = k * k / 2 - 1; R([['궤도', e < 0.005 ? '원' : e < 1 ? '타원' : Math.abs(e - 1) < 0.005 ? '포물선' : '쌍곡선'], ['이심률 e', fmt(e, 3)], ['비에너지 ε (GM/r₀ 단위)', fmt(eps, 3)], ['탈출 속도 비', fmt(Math.SQRT2, 3)]]); }; },
    lab: 'circular' },
  { id: 'invariants', level: '전공', title: '보존량: 에너지, 각운동량, 이심률 벡터', tag: '움직이는 동안 변하지 않는 것',
    eq: String.raw`\varepsilon = \frac{v^2}{2} - \frac{\mu}{r} = -\frac{\mu}{2a},\quad \vec e = \frac{\vec v\times\vec h}{\mu} - \frac{\vec r}{r}`,
    body: `탐사선이 궤도를 도는 동안 속도와 거리는 계속 바뀌지만, 그대로 유지되는 값이 세 가지 있습니다. 바로 <b>비에너지 ε</b>, <b>비각운동량 h</b>, 근점을 가리키는 <b>이심률 벡터 e</b>로, 중력만 작용하는 한 변하지 않습니다. 그래서 궤도를 순간의 위치와 속도 대신 이 세 값으로 기억하면, 궤도의 크기와 모양, 방향을 한 번에 알 수 있어 모든 계산이 쉬워집니다. 예를 들어 비에너지는 긴반지름 하나로 정해지므로, 궤도가 클수록 덜 묶여 있다는 것을 바로 알 수 있습니다.`,
    deep: String.raw`<span class="tex">\vec e</span>는 근점 방향을 가리키고 크기가 이심률입니다. <span class="tex">h^2 = \mu a(1-e^2)</span>, <span class="tex">r_p = a(1-e)</span>, <span class="tex">r_a = a(1+e)</span>.
      실제 궤도에서는 J2·대기·제3천체 섭동 때문에 이 값들이 천천히 변하고, 그 변화율을 다루는 것이 섭동론(라그랑주·가우스 행성 방정식)입니다.`,
    widget(box) { const K = canvas(box), ee = slider(box, '이심률', 0, 0.85, 0.01, 0.5, (x) => x.toFixed(2)), R = readout(box); let M = 0;
      return () => { clear(K); const e = +ee.value, a = 1, p = a * (1 - e * e); M += 0.02; let E = M; for (let i = 0; i < 8; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
        const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2)), r = p / (1 + e * Math.cos(nu)), S = 90 / (1 + e), cx = K.w * 0.42 + e * 40, cy = K.h / 2;
        conic(K.g, cx, cy, S, p, e, 0); dot(K.g, cx, cy, 6, C.sun); const x = cx + S * r * Math.cos(nu), y = cy - S * r * Math.sin(nu);
        const vr = Math.sqrt(1 / p) * e * Math.sin(nu), vt = Math.sqrt(1 / p) * (1 + e * Math.cos(nu)), vx = vr * Math.cos(nu) - vt * Math.sin(nu), vy = vr * Math.sin(nu) + vt * Math.cos(nu);
        K.g.strokeStyle = C.mute; K.g.lineWidth = 1; K.g.beginPath(); K.g.moveTo(cx, cy); K.g.lineTo(x, y); K.g.stroke(); arrow(K.g, x, y, x + vx * 40, y - vy * 40, C.amber); dot(K.g, x, y, 4, C.amber);
        arrow(K.g, cx, cy, cx + e * 90, cy, C.pink); text(K.g, 'e 벡터', cx + e * 90 + 4, cy - 4, C.pink, 10);
        const v2 = vx * vx + vy * vy; R([['거리 r', fmt(r, 3)], ['속력 v', fmt(Math.sqrt(v2), 3)], ['ε = v²/2 − μ/r', fmt(v2 / 2 - 1 / r, 4)], ['h = r·v⊥', fmt(r * vt, 4)], ['−μ/(2a)', fmt(-0.5, 4)]]); }; },
    lab: 'visviva' },
  { id: 'elements', level: '전공', title: '고전 궤도 요소 6개', tag: '궤도를 숫자 여섯 개로',
    eq: String.raw`(a,\ e,\ i,\ \Omega,\ \omega,\ \nu)`,
    body: `궤도 하나를 정확히 적으려면 몇 개의 값이 필요할까요? 답은 여섯 개이며, 이를 고전 궤도 요소라고 합니다. 우주 공간의 궤도는 모양, 기울기, 놓인 방향, 현재 위치를 모두 알아야 정해지기 때문에 위성 궤도를 기록할 때 이 여섯 값을 씁니다. 모양은 긴반지름 a와 이심률 e가, 기울기는 경사각 i가, 놓인 방향은 승교점 경도 Ω와 근점 인수 ω가 정하고, 지금 위치는 진근점 이각 ν가 알려 줍니다. 이 가운데 경사각을 보면 궤도의 성격을 알 수 있는데, i가 0°면 적도 궤도, 90°면 극궤도이고, 90°를 넘으면 지구 자전과 반대로 도는 역행 궤도입니다. 아래 그림에서 회색 원이 기준면(적도면 또는 황도면)이니, 슬라이더를 움직여 각 요소가 궤도를 어떻게 바꾸는지 보세요.`,
    deep: String.raw`근점 좌표계에서 관성 좌표계로의 변환은 <span class="tex">R = R_3(-\Omega)\,R_1(-i)\,R_3(-\omega)</span>입니다. 원 궤도(e = 0)나 적도 궤도(i = 0)에서는 ω나 Ω가 정의되지 않아 위도 인수, 진경도 같은 대체 요소를 씁니다. 수치 계산에서는 특이점이 없는 춘분점 요소를 쓰기도 합니다.`,
    widget(box) { const K = canvas(box, 340, 260), s = { e: slider(box, '이심률 e', 0, 0.8, 0.01, 0.4, (x) => x.toFixed(2)), i: slider(box, '경사각 i', 0, 180, 1, 35, (x) => x + '°'),
        O: slider(box, '승교점 경도 Ω', 0, 360, 1, 40, (x) => x + '°'), w: slider(box, '근점 인수 ω', 0, 360, 1, 60, (x) => x + '°'), n: slider(box, '진근점 이각 ν', 0, 360, 1, 30, (x) => x + '°') };
      const view = (x, y, z) => { const az = 30 * D2R, el2 = 22 * D2R, X = x * Math.cos(az) - y * Math.sin(az), Y = x * Math.sin(az) + y * Math.cos(az); return [K.w / 2 + 70 * X, K.h / 2 - 70 * (Y * Math.sin(el2) + z * Math.cos(el2))]; };
      return () => { clear(K); const e = +s.e.value, i = s.i.value * D2R, Om = s.O.value * D2R, w = s.w.value * D2R, p = 1 - e * e;
        const rot = (xp, yp) => { const cO = Math.cos(Om), sO = Math.sin(Om), ci = Math.cos(i), si = Math.sin(i), cw = Math.cos(w), sw = Math.sin(w);
          return [(cO * cw - sO * sw * ci) * xp + (-cO * sw - sO * cw * ci) * yp, (sO * cw + cO * sw * ci) * xp + (-sO * sw + cO * cw * ci) * yp, sw * si * xp + cw * si * yp]; };
        const g = K.g; g.strokeStyle = C.grid; g.lineWidth = 1; g.beginPath(); for (let k = 0; k <= 64; k++) { const [x, y] = view(1.6 * Math.cos(k / 32 * Math.PI), 1.6 * Math.sin(k / 32 * Math.PI), 0); k ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
        const [ax, ay] = view(1.8, 0, 0), [ox, oy] = view(0, 0, 0); arrow(g, ox, oy, ax, ay, C.mute, 1); text(g, '기준 방향 ♈', ax + 4, ay, C.mute, 10);
        const [nx, ny] = view(1.7 * Math.cos(Om), 1.7 * Math.sin(Om), 0), [mx, my] = view(-1.7 * Math.cos(Om), -1.7 * Math.sin(Om), 0); g.setLineDash([4, 4]); g.strokeStyle = C.blue; g.beginPath(); g.moveTo(mx, my); g.lineTo(nx, ny); g.stroke(); g.setLineDash([]); text(g, '교점선', nx + 4, ny, C.blue, 10);
        g.lineWidth = 2; for (let k = 0; k < 200; k++) { const nu = k / 200 * 2 * Math.PI, nu2 = (k + 1) / 200 * 2 * Math.PI, r1 = p / (1 + e * Math.cos(nu)), r2 = p / (1 + e * Math.cos(nu2));
          const P1 = rot(r1 * Math.cos(nu), r1 * Math.sin(nu)), P2 = rot(r2 * Math.cos(nu2), r2 * Math.sin(nu2)); g.strokeStyle = P1[2] >= 0 ? C.teal : 'rgba(79,227,193,.35)';
          const [x1, y1] = view(...P1), [x2, y2] = view(...P2); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }
        dot(g, ox, oy, 5, C.sun); const pp = rot(p / (1 + e), 0), [px, py] = view(...pp); dot(g, px, py, 3.5, C.pink); text(g, '근점', px + 5, py, C.pink, 10);
        const nu = s.n.value * D2R, r = p / (1 + e * Math.cos(nu)), sat = rot(r * Math.cos(nu), r * Math.sin(nu)), [sx, sy] = view(...sat); dot(g, sx, sy, 4.5, C.amber);
        text(g, '밝은 선: 기준면 위, 흐린 선: 아래', 8, K.h - 8, C.mute, 10); }; } },
  { id: 'kepler', level: '전공', title: '케플러 방정식', tag: '시간이 주어지면 위치는 어디인가',
    eq: String.raw`M = E - e\sin E,\qquad M = n(t-t_p),\ n=\sqrt{\mu/a^3}`,
    body: `타원 궤도 위의 천체가 시간이 지난 뒤 어디에 있을지는 케플러 방정식으로 구합니다. 이 식은 시간에 비례해 고르게 늘어나는 평균 근점 이각 M과 실제 위치를 나타내는 이심 근점 이각 E를 이어 줍니다. 천체는 타원 궤도에서 고르게 움직이지 않고 근점 근처에서 빨리, 원점 근처에서 천천히 움직이기 때문에 이런 변환이 필요합니다. 그런데 M에서 E를 구하는 식은 대수적으로 풀리지 않아서, 뉴턴법으로 반복해 근사값을 구합니다. 반면에 이심률이 0인 원 궤도라면 천체가 고르게 움직이므로 E와 M이 같아집니다.`,
    deep: String.raw`뉴턴법: <span class="tex">E_{k+1} = E_k - \frac{E_k - e\sin E_k - M}{1 - e\cos E_k}</span>. 시작값은 보통 <span class="tex">E_0 = M</span>, 이심률이 크면 <span class="tex">E_0=\pi</span>가 안전합니다. 그 다음
      <span class="tex">\tan\frac{\nu}{2} = \sqrt{\frac{1+e}{1-e}}\tan\frac{E}{2}</span>. 쌍곡선 궤도는 <span class="tex">M = e\sinh H - H</span>, 모든 원뿔 곡선을 한 식으로 다루려면 범용 변수(스텀프 함수)를 씁니다.`,
    widget(box) { const K = canvas(box), Ms = slider(box, '평균 근점 이각 M', 0, 360, 1, 60, (x) => x + '°'), es = slider(box, '이심률 e', 0, 0.99, 0.01, 0.6, (x) => x.toFixed(2)), R = readout(box);
      return () => { clear(K); const M = Ms.value * D2R, e = +es.value, xs = [], ys = []; for (let k = 0; k <= 200; k++) { const E = k / 200 * 2 * Math.PI; xs.push(E / D2R); ys.push((E - e * Math.sin(E)) / D2R); }
        const P = plot(K, xs, [{ ys, col: C.teal, label: 'E − e sin E' }, { ys: xs.map(() => M / D2R), col: C.amber, lw: 1, label: 'M' }], { x0: 0, x1: 360, y0: 0, y1: 360, xl: '이심 근점 이각 E (°)', yd: 0 });
        let E = e > 0.8 ? Math.PI : M; const it = [E]; for (let k = 0; k < 6; k++) { E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E)); it.push(E); }
        it.forEach((x, k) => dot(K.g, P.X(x / D2R), P.Y((x - e * Math.sin(x)) / D2R), k === it.length - 1 ? 4 : 2.5, k === it.length - 1 ? C.pink : C.mute));
        const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
        R([['뉴턴 반복', it.slice(0, 5).map(x => fmt(x / D2R, 2) + '°').join(' → ')], ['E', fmt(E / D2R, 4) + '°'], ['ν', fmt(((nu / D2R) + 360) % 360, 2) + '°']]); }; } },
  { id: 'hohmann', level: '교양', title: '호만 전이와 이중 타원 전이', tag: '가장 싼 길은 늘 호만일까',
    eq: String.raw`\Delta v_\text{H} = \sqrt{\tfrac{\mu}{r_1}}\left(\sqrt{\tfrac{2R}{1+R}}-1\right) + \sqrt{\tfrac{\mu}{r_2}}\left(1-\sqrt{\tfrac{2}{1+R}}\right),\ R=\tfrac{r_2}{r_1}`,
    body: `호만 전이(Hohmann transfer)는 두 원 궤도 사이를 두 번의 분사로 옮겨 가는 타원 궤도입니다. 출발 궤도에서 한 번 분사해 전이 타원에 올라타고, 도착 궤도에서 한 번 더 분사해 원 궤도로 맞춥니다. 보통은 이 방법이 연료가 가장 적게 들어서 행성 탐사와 정지궤도 진입에 널리 쓰입니다. 그런데 바깥 궤도가 안쪽의 약 12배보다 멀면(15.6배를 넘으면 언제나), 일부러 더 멀리 나갔다가 돌아오는 <b>이중 타원 전이</b>(세 번 분사)가 더 적게 듭니다. 대신 이중 타원 전이는 시간이 훨씬 오래 걸린다는 점을 기억해야 합니다.`,
    deep: String.raw`R > 15.58이면 중간 반지름 r_b에 상관없이 이중 타원이 유리하고, 11.94 < R < 15.58에서는 r_b가 충분히 클 때만 유리합니다. r_b → ∞의 극한은 탈출 후 무한히 먼 곳에서 공짜로 방향을 바꾸는 이중 포물선 전이로, <span class="tex">\Delta v = (\sqrt2-1)(1+1/\sqrt R)\sqrt{\mu/r_1}</span>.
      핵심은 오베르트 효과입니다: 깊은 중력 우물에서의 분사가 에너지를 더 많이 바꿉니다.`,
    widget(box) { const K = canvas(box), rb = slider(box, '중간 반지름 r_b / r₁', 5, 200, 1, 40), R = readout(box);
      const hoh = (R2) => { const a = (1 + R2) / 2; return Math.abs(Math.sqrt(2 - 1 / a) - 1) + Math.abs(Math.sqrt(1 / R2) - Math.sqrt(2 / R2 - 1 / a)); };
      const bi = (R2, b) => { if (b < R2) return NaN; const a1 = (1 + b) / 2, a2 = (b + R2) / 2; return Math.sqrt(2 - 1 / a1) - 1 + Math.abs(Math.sqrt(2 / b - 1 / a2) - Math.sqrt(2 / b - 1 / a1)) + Math.abs(Math.sqrt(2 / R2 - 1 / a2) - Math.sqrt(1 / R2)); };
      return () => { clear(K); const b = +rb.value, xs = []; for (let x = 1; x <= 60; x += 0.25) xs.push(x);
        plot(K, xs, [{ ys: xs.map(hoh), col: C.teal, label: '호만' }, { ys: xs.map(x => bi(x, b)), col: C.amber, label: `이중 타원 (r_b = ${b} r₁)` }, { ys: xs.map(x => (Math.SQRT2 - 1) * (1 + 1 / Math.sqrt(x))), col: C.mute, lw: 1, label: '이중 포물선 (극한)' }],
          { x0: 1, x1: 60, y0: 0, y1: 0.6, xl: '바깥 / 안쪽 반지름 비 R', yl: 'Δv / v₁' });
        const geo = 42164 / 6678; R([['지구 저궤도→정지궤도 (R = 6.3)', `호만 ${fmt(hoh(geo) * Math.sqrt(MU_E / 6678), 2)} km/s`], ['호만이 최대인 R', '15.58'], ['R = 30에서', `호만 ${fmt(hoh(30), 3)}, 이중 타원 ${fmt(bi(30, b), 3)} (× v₁)`]]); }; },
    lab: 'hohmann' },
  { id: 'plane', level: '교양', title: '궤도면 바꾸기', tag: '방향만 바꾸는 데도 큰 비용',
    eq: String.raw`\Delta v = 2v\sin\frac{\Delta i}{2}`,
    body: `궤도면을 기울이는 기동, 곧 궤도면 변경은 생각보다 비쌉니다. 궤도면을 기울이려면 속도의 크기가 아니라 방향을 돌려야 하므로, 속도가 클수록 많은 연료가 듭니다. 예를 들어 지구 저궤도(7.8 km/s)에서 궤도면을 60° 바꾸려면 7.8 km/s의 Δv가 들어, 새 위성을 쏘는 것과 비슷한 비용이 됩니다. 그래서 면 변경은 속도가 느린 원점에서, 다른 분사와 <b>합쳐서</b> 하는 것이 보통입니다.`,
    deep: String.raw`크기 변화와 방향 변화를 한 번에 하면 코사인 법칙 <span class="tex">\Delta v = \sqrt{v_1^2+v_2^2-2v_1v_2\cos\Delta i}</span>. 정지궤도 위성은 발사장 위도(나로 34.4°, 케이프커내버럴 28.5°)만큼 기울어진 전이 궤도의 원점에서 원 궤도화와 면 변경을 함께 합니다. 적도에 가까운 발사장이 유리한 이유입니다.`,
    widget(box) { const K = canvas(box), di = slider(box, '바꿀 경사각 Δi', 0, 60, 0.5, 28.5, (x) => x + '°'), R = readout(box);
      return () => { clear(K); const d = di.value * D2R, v1 = 1.597, v2 = 3.075, sep = (v2 - v1) + 2 * v2 * Math.sin(d / 2), comb = Math.sqrt(v1 * v1 + v2 * v2 - 2 * v1 * v2 * Math.cos(d)), leo = 2 * 7.784 * Math.sin(d / 2);
        const bars = [['지구 저궤도에서 면 변경만', leo, C.pink], ['정지궤도: 원 궤도화 후 면 변경', sep, C.amber], ['정지궤도: 원점에서 함께', comb, C.teal]], mx = Math.max(8, leo);
        bars.forEach(([l, v, c], k) => { const y = 30 + k * 62; K.g.fillStyle = c; K.g.fillRect(12, y, (K.w - 24) * v / mx, 22); text(K.g, `${l}: ${fmt(v, 2)} km/s`, 12, y + 38, C.text, 11); });
        R([['GTO 원점 속도', '1.60 km/s'], ['정지궤도 속도', '3.07 km/s'], ['합쳐서 아끼는 양', `${fmt(sep - comb, 2)} km/s`]]); }; } },
  { id: 'oberth', level: '전공', title: '오베르트 효과', tag: '빠를 때 밟는 가속 페달',
    eq: String.raw`v_\infty = \sqrt{(v_p+\Delta v)^2 - v_\text{esc}^2}`,
    body: `오베르트 효과(Oberth effect)는 같은 Δv라도 빠르게 움직일 때 분사하면 더 많은 에너지를 얻는 현상입니다. 탐사선이 행성 가까이, 곧 가장 빠를 때 엔진을 켜는 이유가 여기에 있습니다. 운동 에너지 변화가 <b>v·Δv</b>에 비례하기 때문에, 이미 속도 v가 큰 곳에서 같은 Δv를 더하면 에너지가 더 크게 늘어납니다. 그래서 궤도에서는 원일점보다 근일점에서 분사하는 것이 유리합니다. 아래에서 분사 고도에 따라 탈출 후 남는 속도 v∞가 어떻게 달라지는지 비교해 보세요.`,
    deep: String.raw`<span class="tex">\Delta\varepsilon = v\,\Delta v + \tfrac12\Delta v^2</span>. 연료 자체가 가진 운동 에너지가 함께 쓰이는 것이라 에너지 보존과 모순되지 않습니다. 근점에서 분사하는 동력 플라이바이, 태양 근처에서 분사하는 '오베르트 기동'으로 탈출 속도를 크게 늘리는 방안이 연구되어 있습니다.`,
    widget(box) { const K = canvas(box), dv = slider(box, '분사량 Δv (km/s)', 0.5, 6, 0.1, 4, (x) => x.toFixed(1)), R = readout(box);
      return () => { clear(K); const d = +dv.value, xs = [], ys = []; for (let h = 200; h <= 100000; h *= 1.08) { const r = RE + h, vc = Math.sqrt(MU_E / r), ve = vc * Math.SQRT2, q = (vc + d) ** 2 - ve * ve; xs.push(h); ys.push(q > 0 ? Math.sqrt(q) : NaN); }
        plot(K, xs, [{ ys, col: C.teal, label: '원 궤도에서 분사한 뒤 남는 v∞' }], { logx: true, x0: 200, x1: 100000, y0: 0, xl: '분사 고도 (km, 로그)', yl: 'v∞ (km/s)' });
        const at = (h) => { const r = RE + h, vc = Math.sqrt(MU_E / r), q = (vc + d) ** 2 - 2 * vc * vc; return q > 0 ? Math.sqrt(q) : 0; };
        R([['고도 200 km에서', at(200) > 0 ? `${fmt(at(200), 2)} km/s` : '탈출 못 함'], ['고도 36,000 km에서', `${fmt(at(35786), 2)} km/s`], ['무한히 먼 곳 (Δv 그대로)', `${fmt(d, 2)} km/s`]]); }; } },
  { id: 'rocket', level: '기초', title: '로켓 방정식', tag: '왜 로켓은 대부분이 연료인가',
    eq: String.raw`\Delta v = I_\text{sp}\,g_0\ln\frac{m_0}{m_f}`,
    body: `로켓이 낼 수 있는 속도 변화 Δv는 로켓 방정식으로 정해집니다. 로켓은 무거운 연료를 싣고 가며 그 연료를 뒤로 내뿜어 나아가므로, 얻는 속도 변화는 배기 속도(비추력 I<sub>sp</sub>)와 질량비의 <b>로그</b>에 비례합니다. 식으로 쓰면 Δv = I<sub>sp</sub> × g₀ × ln(처음 질량 ÷ 나중 질량)이고 g₀ = 9.81 m/s²입니다. 예를 들어 질량비가 e(약 2.72, ln = 1)이면 Δv는 I<sub>sp</sub> × 9.81 m/s가 됩니다. 그런데 지구 저궤도까지는 약 9.4 km/s(공기 저항과 중력 손실 포함)가 들어서, 케로신 엔진으로는 질량비가 20이 넘어야 합니다. 이 때문에 로켓은 빈 연료통을 버리며 올라가도록 여러 단으로 나눕니다.`,
    deep: String.raw`운동량 보존 <span class="tex">m\,dv = -v_e\,dm</span>를 적분하면 됩니다(치올코프스키, 1903). 단을 나누면 다 쓴 탱크를 버려 남은 질량비가 좋아집니다. 이온 엔진은 I_sp가 3,000 s 이상이지만 추력이 작아 몇 달에 걸쳐 가속합니다.`,
    widget(box) { const K = canvas(box), isp = slider(box, '비추력 I_sp (초)', 200, 4000, 10, 311), mr = slider(box, '질량비 m₀/m_f', 1, 25, 0.1, 8, (x) => x.toFixed(1)), R = readout(box);
      return () => { clear(K); const I = +isp.value, xs = []; for (let x = 1; x <= 25; x += 0.2) xs.push(x);
        plot(K, xs, [{ ys: xs.map(x => I * G0 * Math.log(x) / 1000), col: C.teal, label: `I_sp ${I} s` }, { ys: xs.map(() => 9.4), col: C.pink, lw: 1, label: '지구 저궤도 ≈ 9.4 km/s' }], { x0: 1, x1: 25, y0: 0, y1: Math.max(12, I * G0 * Math.log(25) / 1000), xl: '질량비', yl: 'Δv (km/s)' });
        const dvv = I * G0 * Math.log(+mr.value) / 1000; R([['이 로켓의 Δv', `${fmt(dvv, 2)} km/s`], ['연료 비율', `${fmt((1 - 1 / mr.value) * 100, 1)}%`], ['9.4 km/s에 필요한 질량비', fmt(Math.exp(9400 / (I * G0)), 1)], ['참고', '고체 ~250 s · 케로신 ~311 s · 수소 ~450 s · 이온 ~3,000 s']]); }; } },
  { id: 'soi', level: '교양', title: '영향권과 패치드 코닉', tag: '누구의 중력을 따를 것인가',
    eq: String.raw`r_\text{SOI} = a\left(\frac{m}{M}\right)^{2/5}`,
    body: `탐사선은 행성 가까이 있을 때는 행성의 중력을, 멀리 있을 때는 태양의 중력을 주로 받습니다. 그 경계가 <b>영향권</b>이며, 이 경계를 기준으로 계산을 나눌 수 있습니다. 그래서 행성 사이 여행을 '태양 둘레 궤도 + 행성 둘레 쌍곡선' 조각으로 이어 붙여 계산하는데, 이것이 패치드 코닉 근사입니다. 예를 들어 달(약 38만 km)은 지구 영향권(약 92만 km) 안에 있어서 지구 중심 궤도로 계산합니다.`,
    deep: String.raw`라플라스의 정의: 두 가지 분해(태양 중심 + 행성 섭동, 행성 중심 + 태양 섭동)에서 섭동/주중력 비가 같아지는 거리입니다. 힐 반지름 <span class="tex">r_H = a(m/3M)^{1/3}</span>은 위성이 안정하게 머물 수 있는 범위로 영향권보다 큽니다. 샌드박스의 플라이바이 실습에서 영향권 경계에서 시작하면 태양의 조석력 때문에 공식과 어긋나는 것을 직접 볼 수 있습니다.`,
    widget(box) { const K = canvas(box, 340, 250), R = readout(box);
      return () => { clear(K); const list = ['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'], KO = ['수성', '금성', '지구', '화성', '목성', '토성', '천왕성', '해왕성'], mx = Math.log10(1e8), mn = Math.log10(5e4);
        list.forEach((n, k) => { const s = O.BODY[n].soi, y = 14 + k * 28, w = (Math.log10(s) - mn) / (mx - mn) * (K.w - 120); K.g.fillStyle = C.teal; K.g.fillRect(70, y, w, 14);
          text(K.g, KO[k], 8, y + 11, C.text, 11); text(K.g, `${fmt(s / 1e6, 2)}백만 km`, 74 + w, y + 11, C.mute, 10); });
        text(K.g, '막대 길이: 로그 눈금', 8, K.h - 4, C.mute, 10); R([['달까지 거리', '38만 km (지구 영향권 92.5만 km 안)'], ['목성 영향권', '태양-지구 거리의 3분의 1']]); }; } },
  { id: 'flyby', level: '전공', title: '중력 도움과 꺾임각', tag: '행성에게 속도를 빌리기',
    eq: String.raw`\delta = 2\arcsin\frac{1}{1 + r_p v_\infty^2/\mu}`,
    body: `중력 도움(gravity assist)은 탐사선이 행성 곁을 스쳐 지나가며 연료 없이 속도와 방향을 바꾸는 방법입니다. 행성 기준으로 보면 탐사선은 들어올 때와 나갈 때 속력이 같고, 방향만 꺾임각 δ만큼 꺾입니다. 그런데 태양 기준 속도는 여기에 행성의 속도를 더한 것이라, 방향이 바뀌면 크기도 바뀝니다. 이 때문에 탐사선은 행성에게서 속도를 얻거나 잃을 수 있습니다. 꺾임각은 행성 가까이, 천천히 지나갈수록 커진다는 점을 눈여겨보세요.`,
    deep: String.raw`조준 거리 <span class="tex">b = r_p\sqrt{1 + 2\mu/(r_p v_\infty^2)}</span>. 실제 임무는 B-평면(행성 중심을 지나고 v∞에 수직인 면)에서 조준점 <span class="tex">\vec B = (B\cdot T, B\cdot R)</span>을 맞추도록 궤도를 수정합니다. 최대 속도 변화는 <span class="tex">2v_\infty\sin(\delta/2)</span>입니다.`,
    widget(box) { const K = canvas(box), pl = el('select'); for (const [n, k] of [['Jupiter', '목성'], ['Saturn', '토성'], ['Earth', '지구'], ['Venus', '금성'], ['Mars', '화성']]) pl.append(new Option(k, n)); box.append(pl);
      const vi = slider(box, 'v∞ (km/s)', 1, 20, 0.1, 6, (x) => x.toFixed(1)), rp = slider(box, '최근접 거리 (행성 반지름)', 1.05, 30, 0.05, 3, (x) => x.toFixed(2)), R = readout(box);
      return () => { clear(K); const P = O.BODY[pl.value], v = +vi.value, r = rp.value * P.R, f = O.flyby(P.mu, v, r), cx = K.w / 2, cy = K.h / 2, S = 30 / rp.value * 2.2;
        K.g.fillStyle = '#d9b48a'; K.g.beginPath(); K.g.arc(cx, cy, Math.max(3, S), 0, 7); K.g.fill();
        const p = rp.value * (1 + f.e); conic(K.g, cx, cy, S, p, f.e, Math.PI / 2, C.teal);
        const ninf = Math.acos(-1 / f.e); for (const s of [1, -1]) { const a = Math.PI / 2 + s * ninf; K.g.setLineDash([3, 4]); K.g.strokeStyle = C.mute; K.g.lineWidth = 1; K.g.beginPath(); K.g.moveTo(cx, cy); K.g.lineTo(cx + 200 * Math.cos(a), cy - 200 * Math.sin(a)); K.g.stroke(); K.g.setLineDash([]); }
        R([['꺾임각 δ', `${fmt(f.delta / D2R, 1)}°`], ['이심률', fmt(f.e, 3)], ['조준 거리 b', `${fmt(f.b / P.R, 2)} 행성 반지름`], ['최대 속도 변화', `${fmt(2 * v * Math.sin(f.delta / 2), 2)} km/s`]]); }; },
    lab: 'flyby' },
  { id: 'lambert', level: '전공', title: '램버트 문제', tag: '두 점과 시간이 주어지면 궤도는 하나',
    eq: String.raw`\sqrt{\mu}\,\Delta t = \frac{y(z)^{3/2}}{C(z)^{3/2}}S(z) + A\sqrt{y(z)}`,
    body: `"이 날 지구를 떠나 저 날 화성에 닿으려면 어떤 궤도로 가야 하나?" 탐사선의 발사 계획을 세울 때 꼭 풀어야 하는 이 질문이 램버트 문제입니다. 출발점, 도착점, 비행 시간을 정하면(같은 방향으로 한 바퀴 안에서) 궤도가 하나로 정해지고, 그 궤도에서 필요한 출발 속도가 답으로 나옵니다. 아래에서 두 점의 각도와 비행 시간을 바꿔 보세요.`,
    deep: String.raw`범용 변수 z(타원이면 양수, 쌍곡선이면 음수)와 스텀프 함수 C(z), S(z)를 쓰면 원뿔 곡선 종류와 상관없이 한 식으로 풀립니다(Curtis 5장). <span class="tex">A = \sin\Delta\theta\sqrt{r_1r_2/(1-\cos\Delta\theta)}</span>. 전이각이 180°에 가까우면 A → 0이라 궤도면이 정해지지 않는 특이점이 생깁니다. 포크찹 그림은 이 문제를 수천 번 푼 결과입니다.`,
    widget(box) { const K = canvas(box), th = slider(box, '전이각 Δθ', 20, 340, 1, 140, (x) => x + '°'), r2s = slider(box, '도착 거리 r₂ / r₁', 0.4, 3, 0.05, 1.52, (x) => x.toFixed(2)), tof = slider(box, '비행 시간 (원 궤도 주기 단위)', 0.05, 1.5, 0.01, 0.4, (x) => x.toFixed(2)), R = readout(box);
      return () => { clear(K); const d = th.value * D2R, r2 = +r2s.value, T = tof.value * 2 * Math.PI, A = [1, 0, 0], B = [r2 * Math.cos(d), r2 * Math.sin(d), 0], L = O.lambert(A, B, T, 1), cx = K.w / 2, cy = K.h / 2, S = 60 / Math.max(1, r2 * 0.8);
        K.g.strokeStyle = C.grid; for (const r of [1, r2]) { K.g.beginPath(); K.g.arc(cx, cy, S * r, 0, 7); K.g.stroke(); } dot(K.g, cx, cy, 6, C.sun);
        dot(K.g, cx + S, cy, 4, C.blue); dot(K.g, cx + S * B[0], cy - S * B[1], 4, C.pink);
        if (!L) { text(K.g, '이 조건으로는 한 바퀴 안의 해가 없습니다', 10, 16, C.pink); R([['결과', '해 없음']]); return; }
        K.g.strokeStyle = C.teal; K.g.lineWidth = 2; K.g.beginPath(); for (let k = 0; k <= 100; k++) { const s = O.propagate(A, L.v1, T * k / 100, 1); const x = cx + S * s.r[0], y = cy - S * s.r[1]; k ? K.g.lineTo(x, y) : K.g.moveTo(x, y); } K.g.stroke();
        const el2 = O.elements(A, L.v1, 1); R([['출발 속도 / 원 궤도 속도', fmt(Math.hypot(...L.v1), 3)], ['궤도', el2.e < 1 ? `타원 (e = ${fmt(el2.e, 3)})` : `쌍곡선 (e = ${fmt(el2.e, 3)})`], ['출발 Δv (원 궤도 기준)', fmt(Math.hypot(L.v1[0], L.v1[1] - 1), 3)]]); }; },
    lab: 'porkchop' },
  { id: 'j2', level: '전공', title: 'J2 섭동과 태양동기 궤도', tag: '찌그러진 지구가 궤도면을 돌린다',
    eq: String.raw`\dot\Omega = -\frac{3}{2}\,n J_2\left(\frac{R_\oplus}{p}\right)^2\cos i`,
    body: `지구는 완전한 공이 아니라 적도가 부풀어 있어서(J2 = 1.0826×10⁻³), 위성 궤도면이 조금씩 회전합니다. 이를 J2 섭동이라고 합니다. 이 회전 속도를 1년에 한 바퀴(하루 0.9856°)로 맞추면, 궤도면이 늘 태양과 같은 각도를 유지하는 <b>태양동기 궤도</b>가 됩니다. 이를 위해 저궤도에서는 경사각을 약 98°(살짝 역행)로 잡아야 궤도면이 하루 0.9856°씩 동쪽으로 돌아 태양동기 조건이 맞습니다. 아리랑·차세대중형위성 같은 지구 관측 위성이 매일 같은 지방시에 지나가는 것도 이 때문입니다.`,
    deep: String.raw`J2는 지구 중력 퍼텐셜의 구면 조화 전개에서 가장 큰 비구형 항입니다. 근점 인수도 <span class="tex">\dot\omega = \tfrac34 nJ_2(R/p)^2(5\cos^2 i - 1)</span>로 도는데, i = 63.4°에서 멈춥니다. 몰니야 궤도가 이 경사각을 쓰는 이유입니다.`,
    widget(box) { const K = canvas(box), alt = slider(box, '고도 (km)', 200, 1500, 10, 528), inc = slider(box, '경사각 i', 0, 180, 0.1, 97.5, (x) => x + '°'), R = readout(box);
      const rate = (h, i) => { const a = RE + h, n = Math.sqrt(MU_E / a ** 3); return -1.5 * n * 1.08263e-3 * (RE / a) ** 2 * Math.cos(i * D2R) * 180 / Math.PI * 86400; };
      return () => { clear(K); const xs = []; for (let h = 200; h <= 1500; h += 10) xs.push(h);
        const P = plot(K, xs, [{ ys: xs.map(h => Math.acos(-0.98565 / Math.abs(rate(h, 0)) ) / D2R), col: C.teal, label: '태양동기에 필요한 경사각' }], { x0: 200, x1: 1500, y0: 95, y1: 103, xl: '고도 (km)', yl: '경사각 (°)', yd: 0 });
        dot(K.g, P.X(+alt.value), P.Y(Math.min(103, Math.max(95, +inc.value))), 4, C.amber);
        const r = rate(+alt.value, +inc.value); R([['궤도면 회전', `${fmt(r, 4)}°/일`], ['태양동기 조건', '+0.9856°/일'], ['이 고도의 태양동기 경사각', `${fmt(Math.acos(-0.98565 / Math.abs(rate(+alt.value, 0))) / D2R, 2)}°`], ['아리랑 3호 (고도 약 685 km)', `${fmt(Math.acos(-0.98565 / Math.abs(rate(685, 0))) / D2R, 2)}°`]]); }; } },
  { id: 'cr3bp', level: '전공', title: '제한 삼체 문제와 야코비 상수', tag: '갈 수 있는 곳과 갈 수 없는 곳',
    eq: String.raw`C = 2\Omega(x,y) - v^2,\quad \Omega = \tfrac12(x^2+y^2) + \frac{1-\mu}{r_1} + \frac{\mu}{r_2}`,
    body: `제한 삼체 문제(circular restricted three-body problem)는 서로 도는 두 천체 곁에서 아주 가벼운 세 번째 물체가 어떻게 움직이는지를 다루는 문제입니다. 지구와 달 사이를 오가는 탐사선이 대표적인 예입니다. 지구와 달이 함께 도는 좌표계에서는 에너지 대신 <b>야코비 상수 C</b>가 보존되어, 탐사선이 갈 수 있는 곳을 정해 줍니다. C가 크면(에너지가 작으면) 탐사선은 지구 둘레나 달 둘레에 갇히고, C를 낮추면 L1 목이 열려 달로 건너갈 수 있습니다. 그림의 어두운 영역은 그 C로는 갈 수 없는 곳입니다. 또 다섯 라그랑주점 가운데 L1·L2·L3은 불안정하고, 정삼각형 꼭짓점의 L4·L5만 안정해서 목성 궤도의 트로이 소행성처럼 물체가 모여 있을 수 있습니다.`,
    deep: String.raw`지구-달 질량비 μ = 0.01215. 라그랑주점의 C: L1 3.188, L2 3.172, L3 3.012, L4·L5 2.988. 이 값들 사이에서 영속도 곡선의 위상이 바뀝니다. 다누리는 태양-지구 L1 근처까지 갔다 오는 탄도 전이(BLT)로 연료를 아껴 달에 갔고, 이것이 이 구조를 쓰는 예입니다.`,
    widget(box) { const K = canvas(box, 340, 260), cs = slider(box, '야코비 상수 C', 2.95, 3.3, 0.001, 3.18, (x) => x.toFixed(3)), R = readout(box), mu = 0.01215;
      const Om = (x, y) => 0.5 * (x * x + y * y) + (1 - mu) / Math.hypot(x + mu, y) + mu / Math.hypot(x - 1 + mu, y);
      const Lx = (g0) => { let x = g0; for (let k = 0; k < 50; k++) { const f = (x) => x - (1 - mu) * (x + mu) / Math.abs(x + mu) ** 3 - mu * (x - 1 + mu) / Math.abs(x - 1 + mu) ** 3; const d = (f(x + 1e-6) - f(x - 1e-6)) / 2e-6; x -= f(x) / d; } return x; };
      const Ls = [[Lx(0.83), 0, 'L1'], [Lx(1.16), 0, 'L2'], [Lx(-1.0), 0, 'L3'], [0.5 - mu, Math.sqrt(3) / 2, 'L4'], [0.5 - mu, -Math.sqrt(3) / 2, 'L5']];
      let img = null, lastC = null;
      return () => { const c = +cs.value; if (c !== lastC) { lastC = c; const W = 170, H = 130, id = new ImageData(W, H);
          for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const x = (i / W - 0.5) * 3, y = (0.5 - j / H) * 3 * H / W, ok = 2 * Om(x, y) >= c, o = (j * W + i) * 4;
            id.data[o] = ok ? 10 : 40; id.data[o + 1] = ok ? 15 : 22; id.data[o + 2] = ok ? 28 : 46; id.data[o + 3] = 255; }
          img = document.createElement('canvas'); img.width = W; img.height = H; img.getContext('2d').putImageData(id, 0, 0); }
        K.g.imageSmoothingEnabled = true; K.g.drawImage(img, 0, 0, K.w, K.h); const X = (x) => (x / 3 + 0.5) * K.w, Y = (y) => (0.5 - y / (3 * K.h / K.w)) * K.h;
        dot(K.g, X(-mu), Y(0), 6, C.blue); dot(K.g, X(1 - mu), Y(0), 3.5, '#c9c9c9'); for (const [x, y, n] of Ls) { dot(K.g, X(x), Y(y), 2.5, C.amber); text(K.g, n, X(x) + 4, Y(y) - 4, C.amber, 10); }
        text(K.g, '어두운 곳: 갈 수 없는 영역 (회전 좌표계)', 8, K.h - 6, C.mute, 10);
        R([['C', fmt(c, 3)], ['L1 문', c < 3.188 ? '열림: 지구와 달 사이를 오갈 수 있음' : '닫힘'], ['L2 문', c < 3.172 ? '열림: 달 너머로 빠져나갈 수 있음' : '닫힘']]); }; },
    lab: 'lagrange' },
  { id: 'cw', level: '전공', title: '상대 운동과 랑데부 (CW 방정식)', tag: '앞에 보이는 정거장으로 다가가기',
    eq: String.raw`\ddot x - 3n^2x - 2n\dot y = 0,\quad \ddot y + 2n\dot x = 0`,
    body: `원 궤도를 도는 정거장 곁에서 우주선은 직관과 다르게 움직이는데, 이 상대 운동을 나타내는 식이 CW 방정식입니다. 우주선이 정거장에 다가가 도킹하는 랑데부를 계획할 때 이 식을 씁니다. 그런데 궤도에서는 속도를 바꾸면 궤도 높이도 바뀌기 때문에, 상대 운동이 직관과 다릅니다. 예를 들어 정거장 쪽으로 밀면 오히려 위로 떠오르며 뒤처지고, 반대로 아래 궤도로 가면 앞서 나갑니다. 그림에서 x는 지구 반대쪽(위), y는 진행 방향(앞)이니, 초기 위치와 속도를 바꿔 보세요.`,
    deep: String.raw`클로히시-윌트셔(힐) 방정식은 기준 궤도 근처에서 운동 방정식을 선형화한 것입니다. 해:
      <span class="tex block">x = (4-3\cos nt)x_0 + \tfrac{\sin nt}{n}\dot x_0 + \tfrac{2}{n}(1-\cos nt)\dot y_0</span>
      <span class="tex block">y = 6(\sin nt - nt)x_0 + y_0 - \tfrac{2}{n}(1-\cos nt)\dot x_0 + \tfrac{4\sin nt-3nt}{n}\dot y_0</span>
      <span class="tex">\dot y_0 = -2nx_0</span>이면 떠내려가지 않는 닫힌 '축구공 궤도'가 됩니다. 국제우주정거장 랑데부는 이 식으로 분사 시점을 정합니다.`,
    widget(box) { const K = canvas(box, 340, 260), pre = el('select'); for (const [k, v] of [['custom', '직접 입력'], ['vbar', '앞쪽 1 km에 정지'], ['above', '위쪽 1 km에서 시작'], ['push', '정거장 쪽(앞)으로 1 m/s'], ['radial', '위로 1 m/s'], ['football', '축구공 궤도']]) pre.append(new Option(v, k)); box.append(pre);
      const x0 = slider(box, '처음 위치: 위 (km)', -2, 2, 0.05, 0), y0 = slider(box, '처음 위치: 앞 (km)', -4, 4, 0.05, 1), vx = slider(box, '처음 속도: 위 (m/s)', -2, 2, 0.05, 0), vy = slider(box, '처음 속도: 앞 (m/s)', -2, 2, 0.05, 0), R = readout(box);
      pre.onchange = () => { const P = { vbar: [0, 1, 0, 0], above: [1, 0, 0, 0], push: [0, 1, 0, -1], radial: [0, 0, 1, 0], football: [0, 0, 1, 0] }[pre.value]; if (!P) return;
        if (pre.value === 'football') { P[0] = 0; P[2] = 1; P[3] = 0; } [x0, y0, vx, vy].forEach((s, k) => { s.value = P[k]; s.dispatchEvent(new Event('input')); }); };
      const n = 2 * Math.PI / (92.7 * 60); // ISS: one orbit in 92.7 minutes
      return () => { clear(K); const X0 = +x0.value, Y0 = +y0.value, VX = vx.value / 1000, VY = vy.value / 1000, cx = K.w / 2, cy = K.h / 2, S = 22;
        K.g.strokeStyle = C.grid; K.g.beginPath(); K.g.moveTo(0, cy); K.g.lineTo(K.w, cy); K.g.moveTo(cx, 0); K.g.lineTo(cx, K.h); K.g.stroke(); text(K.g, '앞 →', K.w - 30, cy - 4, C.mute, 10); text(K.g, '↑ 위 (지구 반대)', cx + 4, 12, C.mute, 10);
        dot(K.g, cx, cy, 5, C.text); K.g.strokeStyle = C.teal; K.g.lineWidth = 2; K.g.beginPath(); let last = null, maxd = 0;
        for (let k = 0; k <= 600; k++) { const t = k / 600 * 3 * 2 * Math.PI / n, c = Math.cos(n * t), s = Math.sin(n * t);
          const x = (4 - 3 * c) * X0 + s / n * VX + 2 / n * (1 - c) * VY, y = 6 * (s - n * t) * X0 + Y0 - 2 / n * (1 - c) * VX + (4 * s - 3 * n * t) / n * VY; maxd = Math.max(maxd, Math.hypot(x, y));
          const px = cx + S * y, py = cy - S * x; k ? K.g.lineTo(px, py) : K.g.moveTo(px, py); last = [px, py, x, y]; } K.g.stroke(); dot(K.g, cx + S * Y0, cy - S * X0, 4, C.amber);
        if (last) dot(K.g, last[0], last[1], 3, C.pink);
        R([['표시 시간', '3바퀴 (약 4.6시간)'], ['3바퀴 뒤 위치', `위 ${fmt(last[2], 2)} km, 앞 ${fmt(last[3], 2)} km`], ['닫힌 궤도 조건 ẏ₀ = −2n x₀', `${fmt(-2 * n * X0 * 1000, 2)} m/s`]]); }; } },
  { id: 'visviva', level: '기초', title: '활력 방정식 (vis-viva)', tag: '궤도 위 속도를 한 줄로',
    eq: String.raw`v^2 = \mu\left(\frac{2}{r} - \frac{1}{a}\right)`,
    body: `활력 방정식(vis-viva equation)은 궤도 위 어느 거리에서든 천체의 속도를 알려 주는 식입니다. 궤도의 크기(긴반지름 a)만 알면 어느 거리 r에서든 속도가 정해지기 때문에, 궤도 역학에서 가장 자주 쓰입니다. 예를 들어 원 궤도 속도, 그 √2배인 탈출 속도, 호만 전이의 분사량이 모두 이 식에서 나옵니다. 샌드박스 실습에서 실제 N체 계산과 맞는지 확인해 보세요.`,
    deep: String.raw`에너지 보존 <span class="tex">\tfrac{v^2}{2} - \tfrac{\mu}{r} = \varepsilon</span>에 타원 궤도의 에너지 <span class="tex">\varepsilon = -\tfrac{\mu}{2a}</span>를 넣으면 됩니다. a → ∞이면 포물선(탈출), a < 0이면 쌍곡선으로 같은 식이 그대로 쓰입니다.`,
    widget(box) { const K = canvas(box), aa = slider(box, '긴반지름 a (AU)', 0.6, 5, 0.05, 1.5, (x) => x.toFixed(2)), R = readout(box);
      return () => { clear(K); const a = +aa.value, xs = []; for (let r = 0.2; r <= 6; r += 0.02) xs.push(r); const k = O.KMS * Math.sqrt(O.MU_SUN);
        plot(K, xs, [{ ys: xs.map(r => r < 2 * a ? k * Math.sqrt(2 / r - 1 / a) : NaN), col: C.teal, label: `a = ${a} AU 궤도의 속도` }, { ys: xs.map(r => k * Math.sqrt(1 / r)), col: C.mute, lw: 1, label: '원 궤도 속도' }, { ys: xs.map(r => k * Math.sqrt(2 / r)), col: C.pink, lw: 1, label: '탈출 속도' }], { x0: 0.2, x1: 6, y0: 0, y1: 80, xl: '태양에서 거리 r (AU)', yl: 'km/s', yd: 0 });
        R([['1 AU에서', `${fmt(k * Math.sqrt(Math.max(0, 2 - 1 / a)), 2)} km/s`], ['근일점이 1 AU일 때 원일점', a > 0.5 ? `${fmt(2 * a - 1, 2)} AU` : '-'], ['같은 거리의 원 궤도 속도', `${fmt(k, 2)} km/s`]]); }; },
    lab: 'visviva' },
];

// ---- space-science deck: Earth, Moon, stars and galaxies ----
const BRIGHT_N = [['북극성 Polaris', 37.95, 89.26], ['투반 Thuban', 211.10, 64.38], ['베가 Vega', 279.23, 38.78], ['데네브 Deneb', 310.36, 45.28], ['알데라민 Alderamin', 319.64, 62.59],
  ['코카브 Kochab', 222.68, 74.16], ['에라이 Errai', 354.84, 77.63], ['엘타닌 Eltanin', 269.15, 51.49], ['이오타 헤르쿨레스', 264.87, 46.01], ['델타 백조', 296.24, 45.13], ['두베 Dubhe', 165.93, 61.75], ['카프 Caph', 2.29, 59.15], ['세긴 Segin', 28.6, 63.67]];
function precessPole(years) { // where the north celestial pole points (J2000 RA/Dec) after `years`: the pole circles the ecliptic pole every ~25,772 years
  const eps = 23.44 * D2R, L = -50.29 / 3600 * years * D2R, E = [0, -Math.sin(eps), Math.cos(eps)], P0 = [0, 0, 1];
  const k = E, v = P0, c = Math.cos(L), s = Math.sin(L), kv = k[0] * v[0] + k[1] * v[1] + k[2] * v[2], kx = [k[1] * v[2] - k[2] * v[1], k[2] * v[0] - k[0] * v[2], k[0] * v[1] - k[1] * v[0]];
  const r = v.map((x, i) => x * c + kx[i] * s + k[i] * kv * (1 - c)); return [(Math.atan2(r[1], r[0]) / D2R + 360) % 360, Math.asin(r[2]) / D2R];
}
const sep = (r1, d1, r2, d2) => Math.acos(Math.min(1, Math.sin(d1 * D2R) * Math.sin(d2 * D2R) + Math.cos(d1 * D2R) * Math.cos(d2 * D2R) * Math.cos((r1 - r2) * D2R))) / D2R;
// geomagnetic polarity, last 5.3 Myr (Ogg 2020 GPTS, simplified): [start Ma, end Ma, normal?]
const CHRONS = [[0, 0.773, 1], [0.773, 0.99, 0], [0.99, 1.07, 1], [1.07, 1.775, 0], [1.775, 1.934, 1], [1.934, 2.595, 0], [2.595, 3.032, 1], [3.032, 3.116, 0], [3.116, 3.207, 1], [3.207, 3.33, 0],
  [3.33, 3.596, 1], [3.596, 4.187, 0], [4.187, 4.3, 1], [4.3, 4.493, 0], [4.493, 4.631, 1], [4.631, 4.799, 0], [4.799, 4.896, 1], [4.896, 4.997, 0], [4.997, 5.235, 1], [5.235, 5.5, 0]];
const NMP = [[1904, 70.5, -96.5], [1948, 73.0, -100.0], [1973, 76.0, -101.0], [1994, 78.3, -104.0], [2001, 81.3, -110.8], [2007, 83.9, -120.7], [2015, 86.3, -160.0], [2020, 86.5, 162.9], [2025, 85.8, 139.3]];

const SCIENCE = [
  { id: 'declination', level: '교양', title: '진북과 자북, 자기 편각', tag: '나침반은 북극을 가리키지 않는다',
    eq: String.raw`\text{진방위} = \text{자기 방위} + D\quad(D\text{: 동편각 +, 서편각 −})`,
    body: `지도의 북쪽(진북)과 나침반 바늘의 북쪽(자북)은 서로 다르며, 그 각도 차이를 자기 편각 <b>D</b>라고 합니다. 진북은 자전축의 북극을 향하지만 자북은 지구 자기장의 방향을 따르기 때문에 두 방향이 어긋납니다. 예를 들어 서울은 약 9° 서쪽으로 치우쳐 있어서, 나침반으로 정북을 찾으려면 바늘보다 9° 오른쪽(동쪽)을 봐야 합니다.
      게다가 자북극은 해마다 수십 km씩 움직여, 1900년대 캐나다 북부에서 지금은 시베리아 쪽으로 가고 있습니다. 그래서 지도와 항법 장비는 몇 년마다 편각 값을 고칩니다.`,
    deep: String.raw`지구 자기장은 바깥 핵의 액체 철이 움직이며 만드는 다이너모로, 대략 자전축에서 약 10° 기운 막대자석(쌍극자)과 그 위의 불규칙한 성분으로 이루어집니다. 실제 편각은 국제 표준 자기장 모델(IGRF, WMM)의 구면 조화 계수로 계산합니다.
      아래 그림의 "쌍극자 근사"는 지자기 북극을 향하는 대원의 방위로 구한 값이라 실제와 몇 도 다를 수 있습니다. 나침반이 기울어지는 각도(복각) <span class="tex">\tan I = 2\tan\lambda_m</span>도 같은 쌍극자 모형에서 나옵니다.`,
    widget(box) { const K = canvas(box, 340, 230), la = slider(box, '위도', -60, 75, 0.5, 37.6, (x) => x + '°'), lo = slider(box, '경도', -180, 180, 0.5, 127, (x) => x + '°'), R = readout(box);
      const bearing = (p1, l1, p2, l2) => { const f1 = p1 * D2R, f2 = p2 * D2R, dl = (l2 - l1) * D2R; return Math.atan2(Math.sin(dl) * Math.cos(f2), Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl)) / D2R; };
      return () => { const g = K.g; clear(K); const X = (l) => (l + 180) / 360 * K.w, Y = (p) => (90 - p) / 180 * K.h;
        g.strokeStyle = C.grid; for (let l = -180; l <= 180; l += 30) { g.beginPath(); g.moveTo(X(l), 0); g.lineTo(X(l), K.h); g.stroke(); } for (let p = -60; p <= 90; p += 30) { g.beginPath(); g.moveTo(0, Y(p)); g.lineTo(K.w, Y(p)); g.stroke(); }
        g.strokeStyle = C.pink; g.lineWidth = 2; g.beginPath(); NMP.forEach(([y, p, l], i) => { i ? g.lineTo(X(l), Y(p)) : g.moveTo(X(l), Y(p)); }); g.stroke();
        NMP.forEach(([y, p, l], i) => { if (i % 2 === 0 || i === NMP.length - 1) { dot(g, X(l), Y(p), 2.5, C.pink); text(g, String(y), X(l) + 3, Y(p) + 10, C.pink, 9); } });
        dot(g, X(-72.6), Y(80.8), 3, C.amber); text(g, '지자기 북극 (쌍극자)', X(-72.6) - 40, Y(80.8) + 22, C.amber, 9);
        const p = +la.value, l = +lo.value; dot(g, X(l), Y(p), 4, C.teal); text(g, '분홍 선: 자북극이 지나온 길 (1904~2025)', 6, K.h - 6, C.mute, 10);
        const Dd = bearing(p, l, 80.8, -72.6), Dm = bearing(p, l, 85.8, 139.3), lam = 90 - sep(l, p, -72.6, 80.8);
        R([['쌍극자 근사 편각', `${fmt(Dd, 1)}° (${Dd < 0 ? '서' : '동'}편각) · 실제와 크게 다를 수 있음`], ['자북극(복각 90°) 방향', `${fmt(Dm, 1)}°`], ['쌍극자 근사 복각', `${fmt(Math.atan(2 * Math.tan(lam * D2R)) / D2R, 1)}°`], ['실측 참고 (WMM)', '서울 약 −9°, 런던 약 +1°, 뉴욕 약 −13°'], ['차이가 나는 이유', '지구 자기장의 비쌍극자 성분(특히 동아시아·남대서양)이 커서, 막대자석 모형으로는 방향이 맞지 않습니다']]); }; } },
  { id: 'precession', level: '교양', title: '세차 운동과 북극성의 교대', tag: '2만 6천 년마다 바뀌는 북극의 별',
    eq: String.raw`\dot\psi \approx 50.29''/\text{년} \;\Rightarrow\; T \approx 25{,}772\text{년}`,
    body: `지구의 자전축은 팽이처럼 천천히 원을 그리며 돌아가는데, 이를 세차 운동이라고 합니다. 적도 부분이 불룩한 지구를 달과 태양이 당기기 때문에 일어납니다. 그 결과 하늘의 북극은 2만 6천 년에 한 번 원을 그리고, 북극성도 바뀝니다.
      예를 들어 피라미드를 지을 무렵(기원전 2600년)의 북극성은 용자리 투반이었고, 지금은 폴라리스이며, 약 1만 2천 년 뒤에는 베가가 북극 근처에 옵니다. 천상열차분야지도의 별이 지금 하늘과 조금씩 어긋나는 것도 세차 운동 때문입니다.`,
    deep: String.raw`세차 운동의 주기 <span class="tex">T = 2\pi/\dot\psi</span>, 일반 세차 <span class="tex">\dot\psi = \frac{3}{2}\frac{GM}{a^3}\frac{C-A}{C\,\omega}\cos\varepsilon</span> (달과 태양의 기여 합). 춘분점이 황도를 따라 해마다 50.3″씩 서쪽으로 움직이므로, 별자리의 적경·적위 좌표는 기준 시점(J2000 등)을 함께 밝혀야 합니다.
      여기에 18.6년 주기의 작은 끄덕임(장동)이 겹칩니다. 기원전 2세기 히파르코스가 처음 발견했습니다.`,
    widget(box) { const K = canvas(box, 340, 260), yr = slider(box, '연도', -13000, 14000, 1, 2026, (x) => x < 0 ? `기원전 ${-x + 1}년` : `${x}년`), R = readout(box);
      return () => { const g = K.g; clear(K); const cx = K.w / 2, cy = K.h / 2, S = 2.4, eclR = 266, eclD = 66.56; // gnomonic-ish: plot around the ecliptic pole
        const proj = (ra, de) => { const d = sep(ra, de, eclR, eclD), pa = Math.atan2(Math.sin((ra - eclR) * D2R), Math.cos(eclD * D2R) * Math.tan(de * D2R) - Math.sin(eclD * D2R) * Math.cos((ra - eclR) * D2R)); return [cx - S * d * Math.sin(pa), cy - S * d * Math.cos(pa)]; };
        g.strokeStyle = C.grid; g.beginPath(); for (let k = 0; k <= 120; k++) { const [r, d] = precessPole(k / 120 * 25772); const [x, y] = proj(r, d); k ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
        for (const [n, r, d] of BRIGHT_N) { const [x, y] = proj(r, d); dot(g, x, y, 2.5, C.text); text(g, n.split(' ')[0], x + 4, y - 3, C.mute, 9); }
        const t = +yr.value - 2000, [pr, pd] = precessPole(t), [px, py] = proj(pr, pd); dot(g, px, py, 5, C.teal); text(g, '천구 북극', px + 6, py + 12, C.teal, 10);
        const near = BRIGHT_N.map(([n, r, d]) => [n, sep(r, d, pr, pd)]).sort((a, b) => a[1] - b[1])[0];
        R([['그 해의 북극', `적경 ${fmt(pr / 15, 2)}h, 적위 ${fmt(pd, 2)}° (J2000 좌표)`], ['가장 가까운 밝은 별', `${near[0]} · ${fmt(near[1], 1)}°`], ['한 바퀴', '약 25,772년']]); }; } },
  { id: 'paleomag', level: '교양', title: '고지자기와 지자기 역전', tag: '바닷속 바위에 새겨진 자기장의 역사',
    eq: String.raw`\text{줄무늬 폭} = v_\text{확장} \times \Delta t`,
    body: `용암이 식어 굳을 때 그 속의 자철석은 그때의 지구 자기장 방향으로 굳습니다. 그래서 암석을 조사하면 옛 자기장 방향, 곧 고지자기를 알 수 있습니다. 이렇게 살펴보니 지구 자기장은 수십만 년마다 N극과 S극이 뒤바뀌어 왔고, 마지막 역전은 약 77만 년 전(브뤼느-마쓰야마 경계)이었습니다.
      한편 해령에서는 새 바닥이 양쪽으로 벌어지며 만들어지므로, 해령을 중심으로 정자극·역자극 줄무늬가 <b>거울처럼 대칭</b>으로 놓입니다. 이 발견이 판 구조론의 결정적인 증거가 되었습니다.`,
    deep: String.raw`역전은 수천 년에 걸쳐 일어나고, 그동안 자기장 세기가 크게 약해집니다. 지자기 극성 연대표(GPTS)는 해양 자기 이상, 화산암의 방사성 연대, 퇴적층을 맞춰 만듭니다. 짧은 역전 사건(자라미요, 올두바이 등)도 아래 그림에 있습니다.
      역전 간격은 불규칙해서, 백악기에는 약 4천만 년 동안 역전이 없던 시기(백악기 정자극 초시)도 있습니다.`,
    widget(box) { const K = canvas(box, 340, 220), sp = slider(box, '해저 확장 속도 (한쪽, cm/년)', 1, 8, 0.1, 2.5, (x) => x.toFixed(1)), R = readout(box);
      return () => { const g = K.g; clear(K); const v = +sp.value, Wkm = v * 10 * 5.5, S = (K.w / 2 - 10) / Wkm, cx = K.w / 2; // km per Myr = cm/yr * 10
        for (const [a, b, n] of CHRONS) { const w1 = a * v * 10 * S, w2 = b * v * 10 * S; g.fillStyle = n ? '#4FE3C1' : '#1b2a44'; g.fillRect(cx + w1, 30, w2 - w1, 90); g.fillRect(cx - w2, 30, w2 - w1, 90); }
        g.fillStyle = C.amber; g.fillRect(cx - 1, 24, 2, 102); text(g, '해령', cx, 18, C.amber, 10, 'center'); text(g, '초록: 지금과 같은 방향 (정자극) · 남색: 반대 (역자극)', 6, 140, C.mute, 10);
        // timescale bar
        const T = (m) => 10 + m / 5.5 * (K.w - 20); for (const [a, b, n] of CHRONS) { g.fillStyle = n ? '#4FE3C1' : '#1b2a44'; g.fillRect(T(a), 160, T(b) - T(a), 18); }
        for (const m of [0, 1, 2, 3, 4, 5]) text(g, `${m}`, T(m), 194, C.mute, 9, 'center'); text(g, '백만 년 전', K.w - 10, 208, C.mute, 9, 'right');
        R([['77만 년 전 경계까지 거리', `해령에서 ${fmt(0.773 * v * 10, 1)} km`], ['500만 년 동안 생긴 바닥', `한쪽 ${fmt(5 * v * 10, 0)} km`], ['참고', '대서양 중앙 해령 약 1.2 cm/년, 동태평양 해팽 약 7 cm/년 (한쪽)']]); }; } },
  { id: 'roche', level: '교양', title: '로슈 한계', tag: '너무 가까이 가면 부서진다',
    eq: String.raw`d_\text{강체} = 1.26\,R_M\left(\frac{\rho_M}{\rho_m}\right)^{1/3},\qquad d_\text{유체} = 2.44\,R_M\left(\frac{\rho_M}{\rho_m}\right)^{1/3}`,
    body: `로슈 한계(Roche limit)는 위성이 행성의 조석력에 부서지지 않고 버틸 수 있는 가장 가까운 거리입니다. 위성이 행성에 너무 가까이 가면, 행성 쪽 면과 반대쪽 면이 받는 중력 차이(조석력)가 위성을 묶어 두는 자기 중력보다 커집니다. 그래서 로슈 한계 안에서는 물질이 하나의 위성으로 뭉치지 못합니다. 예를 들어 토성의 고리는 대부분 로슈 한계 안에 있어 위성으로 뭉치지 못했고, 화성의 위성 포보스는 점점 가까워져 수천만 년 뒤 부서져 고리가 될 것으로 예상됩니다.`,
    deep: String.raw`조석 가속도 <span class="tex">\Delta g \approx 2GMr/d^3</span>가 위성 표면 중력 <span class="tex">Gm/r^2</span>과 같아지는 거리에서 강체 근사 <span class="tex">d = r(2M/m)^{1/3} = 1.26R_M(\rho_M/\rho_m)^{1/3}</span>를 얻습니다. 위성이 유체처럼 변형되면 길쭉해져 더 멀리서 부서지고(2.44), 실제 위성은 그 사이입니다.
      인공위성처럼 작은 물체는 자기 중력이 아니라 재료의 강도로 버티므로 로슈 한계 안에서도 부서지지 않습니다. 샌드박스에서 행성을 고르면 로슈 한계가 점선으로 보이고, 그 안으로 들어간 천체는 부서집니다.`,
    widget(box) { const K = canvas(box, 340, 220), rhoS = slider(box, '위성 밀도 (kg/m³)', 500, 5500, 50, 900), pl = el('select'); for (const [n, k, R2, rho] of [['Saturn', '토성', 60268, 687], ['Earth', '지구', 6371, 5514], ['Jupiter', '목성', 71492, 1326], ['Mars', '화성', 3390, 3933]]) pl.append(new Option(k, `${R2},${rho},${n}`)); box.append(pl);
      const R = readout(box);
      return () => { const g = K.g; clear(K); const [Rp, rho, n] = pl.value.split(','), RM = +Rp, rM = +rho, rs = +rhoS.value, f = 2.44 * RM * Math.cbrt(rM / rs), r = 1.26 * RM * Math.cbrt(rM / rs), S = (K.h / 2 - 10) / Math.max(f, RM * 2.5), cx = 70, cy = K.h / 2;
        g.fillStyle = '#d9b48a'; g.beginPath(); g.arc(cx, cy, RM * S, 0, 7); g.fill();
        for (const [d, c, lab] of [[r, C.amber, '강체'], [f, C.pink, '유체']]) { g.setLineDash([4, 4]); g.strokeStyle = c; g.beginPath(); g.arc(cx, cy, d * S, -0.9, 0.9); g.stroke(); g.setLineDash([]); text(g, `${lab} ${fmt(d / RM, 2)} R`, cx + d * S + 4, cy - 30 - (lab === '강체' ? 0 : 14), c, 10); }
        if (n === 'Saturn') { g.strokeStyle = 'rgba(230,210,156,.6)'; g.lineWidth = 6; g.beginPath(); g.arc(cx, cy, 1.24 * RM * S, -0.6, 0.6); g.stroke(); g.beginPath(); g.arc(cx, cy, 2.27 * RM * S, -0.5, 0.5); g.stroke(); g.lineWidth = 1; text(g, '고리 (1.24~2.27 R)', cx + 2.3 * RM * S, cy + 40, C.text, 10); }
        if (n === 'Mars') { const d = 9376; dot(g, cx + d * S, cy, 3, C.text); text(g, '포보스', cx + d * S + 5, cy + 4, C.text, 10); }
        R([['유체 로슈 한계', `${fmt(f, 0)} km`], ['강체 로슈 한계', `${fmt(r, 0)} km`], ['참고 밀도', '얼음 약 900 · 암석 약 3,000 · 철 약 7,800 kg/m³']]); }; } },
  { id: 'stellar', level: '교양', title: '항성 진화', tag: '질량이 별의 일생을 정한다',
    eq: String.raw`t_\text{주계열} \approx 10^{10}\,\text{년}\left(\frac{M}{M_\odot}\right)^{-2.5},\quad L \propto M^{3.5}`,
    body: `별의 일생은 태어날 때의 질량으로 거의 모든 것이 정해집니다. 무거운 별은 연료가 많아도 훨씬 빨리 태워서 수백만 년 만에 초신성으로 폭발하고, 반면에 가벼운 적색왜성은 수조 년을 탑니다. 아래에서 질량을 바꿔 가며 HR도 위의 길과 마지막 모습을 보세요.`,
    deep: String.raw`주계열에서는 중심에서 수소가 헬륨으로 바뀌며(pp 연쇄, CNO 순환) 정역학 평형 <span class="tex">dP/dr = -G M(r)\rho/r^2</span>을 유지합니다. 중심 수소가 떨어지면 핵이 수축하고 바깥층이 부풀어 적색거성이 됩니다.
      약 8 태양질량 아래는 행성상 성운을 남기고 백색왜성(찬드라세카르 한계 1.4 M☉ 이하)이 되고, 그 위는 철 핵이 붕괴해 중성자별(톨먼-오펜하이머-볼코프 한계 약 2~3 M☉ 이하)이나 블랙홀이 됩니다. 아래 경로는 개략입니다.`,
    widget(box) { const K = canvas(box, 340, 250), ms = slider(box, '처음 질량 (태양 = 1)', -1, 1.6, 0.01, 0, (x) => fmt(10 ** x, 2)), R = readout(box);
      return () => { const g = K.g; clear(K); const M = 10 ** ms.value, X = (lt) => K.w - 20 - (lt - 3.4) / (4.75 - 3.4) * (K.w - 50), Y = (ll) => K.h - 20 - (ll + 3) / 9 * (K.h - 30);
        g.strokeStyle = C.grid; g.strokeRect(30, 10, K.w - 50, K.h - 30); text(g, '← 뜨거움 · 표면 온도 · 차가움 →', K.w / 2, K.h - 5, C.mute, 9, 'center'); text(g, '밝기', 4, 12, C.mute, 9);
        g.strokeStyle = 'rgba(159,224,230,.35)'; g.lineWidth = 8; g.beginPath(); for (let k = -1; k <= 1.6; k += 0.05) { const m = 10 ** k, L = m < 0.43 ? 0.23 * m ** 2.3 : m ** 3.5, Rr = m ** 0.8, T = 5772 * Math.pow(L / Rr ** 2, 0.25); const x = X(Math.log10(T)), y = Y(Math.log10(L)); k > -1 ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); g.lineWidth = 1;
        text(g, '주계열', X(4.4), Y(4.6), 'rgba(159,224,230,.8)', 10);
        const L0 = M < 0.43 ? 0.23 * M ** 2.3 : M ** 3.5, R0 = M ** 0.8, T0 = 5772 * Math.pow(L0 / R0 ** 2, 0.25), life = 1e10 * M ** -2.5;
        const path = M < 0.5 ? [[T0, L0], [T0 * 1.6, L0 * 0.3], [12000, 1e-3]] : M < 8 ? [[T0, L0], [T0 * 0.85, L0 * 2.5], [4200, L0 * 30], [3600, L0 * 400], [80000, L0 * 300], [30000, 1e-1], [12000, 1e-3]] : [[T0, L0], [T0 * 0.6, L0 * 1.3], [6000, L0 * 1.5], [3500, L0 * 1.6]];
        g.strokeStyle = C.amber; g.lineWidth = 2; g.beginPath(); path.forEach(([T, L], i) => { const x = X(Math.log10(T)), y = Y(Math.log10(L)); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); dot(g, X(Math.log10(T0)), Y(Math.log10(L0)), 5, starColorHex(M));
        const end = M < 0.5 ? '헬륨 백색왜성 (우주 나이보다 오래 걸림)' : M < 8 ? '적색거성 → 행성상 성운 → 탄소·산소 백색왜성' : M < 25 ? '적색초거성 → 초신성 폭발 → 중성자별' : '초거성 → 초신성 또는 직접 붕괴 → 블랙홀';
        R([['주계열 수명', life >= 1e12 ? `${fmt(life / 1e12, 1)}조 년` : life >= 1e8 ? `${fmt(life / 1e8, 1)}억 년` : `${fmt(life / 1e6, 1)}백만 년`], ['표면 온도 (주계열)', `${fmt(T0, 0)} K`], ['밝기', `${L0 < 0.01 ? L0.toExponential(1) : fmt(L0, 2)} 태양`], ['마지막 모습', end]]); }; } },
  { id: 'galaxy', level: '교양', title: '은하 진화', tag: '우주가 별을 가장 많이 만든 때',
    eq: String.raw`\psi(z) = 0.015\,\frac{(1+z)^{2.7}}{1+\left[(1+z)/2.9\right]^{5.6}}\;M_\odot\,\text{yr}^{-1}\,\text{Mpc}^{-3}`,
    body: `빅뱅 후 수억 년 만에 첫 별과 작은 은하가 생겼고, 은하들은 서로 부딪히고 합쳐지며 커졌습니다. 이 과정에서 우주 전체가 별을 가장 활발하게 만든 시기는 약 100억 년 전(적색편이 z ≈ 2, '우주의 한낮')이고, 지금은 그때의 10분의 1 정도입니다.
      은하의 모습은 가스가 얼마나 남았는지에 따라 갈립니다. 나선 은하는 가스가 남아 별을 계속 만들고, 반면에 거대 타원 은하는 합병으로 가스를 다 쓰거나 잃어 '붉고 늙은' 은하가 됩니다. 우리 은하도 약 45억 년 뒤 안드로메다 은하와 만나 하나의 타원 은하가 될 것으로 예상됩니다.`,
    deep: String.raw`위 식은 마다우와 디킨슨(2014)이 자외선·적외선 관측을 모아 맞춘 우주 별 생성률 밀도입니다. 적색편이와 시간은 ΛCDM 우주론(H₀ = 67.7 km/s/Mpc, Ω_m = 0.31)으로 바꿉니다:
      <span class="tex">t(z) = \int_z^\infty \frac{dz'}{(1+z')H(z')},\ H(z) = H_0\sqrt{\Omega_m(1+z)^3 + \Omega_\Lambda}</span>.
      은하 형태는 허블의 소리굽쇠 분류(타원·렌즈·나선·막대나선·불규칙)로 나누고, 색-등급도에서 '푸른 구름'과 '붉은 줄기' 사이의 '녹색 골짜기'를 지나는 은하가 별 생성을 멈추는(quenching) 중이라고 봅니다.`,
    widget(box) { const K = canvas(box, 340, 230), zs = slider(box, '적색편이 z', 0, 12, 0.05, 2, (x) => x.toFixed(2)), R = readout(box);
      const H0 = 67.7 / 977.8, Om = 0.31, OL = 0.69; // H0 in 1/Gyr
      const age = (z) => { let s = 0; const N = 400, u0 = 1 / (1 + z); for (let i = 0; i < N; i++) { const a = u0 * (i + 0.5) / N; s += (u0 / N) / (a * H0 * Math.sqrt(Om / a ** 3 + OL)); } return s; }; // Gyr since the Big Bang
      const sfr = (z) => 0.015 * (1 + z) ** 2.7 / (1 + ((1 + z) / 2.9) ** 5.6);
      const now = age(0), zs2 = [], curve = []; for (let lz = 0; lz <= 1.3; lz += 0.01) { const z = 10 ** lz - 1; zs2.push(age(z)); curve.push(sfr(z)); } // t(z) and SFR(z) once
      zs2.reverse(); curve.reverse();
      return () => { clear(K); const xs = zs2;
        const P = plot(K, xs, [{ ys: curve, col: C.teal, label: '우주 별 생성률' }], { x0: 0, x1: now, y0: 0, y1: 0.12, xl: '빅뱅 이후 시간 (십억 년)', yl: 'M☉/년/Mpc³', yd: 2, xd: 0 });
        const z = +zs.value, t = age(z); K.g.strokeStyle = C.amber; K.g.beginPath(); K.g.moveTo(P.X(t), 14); K.g.lineTo(P.X(t), K.h - 26); K.g.stroke();
        R([['그때 우주 나이', `${fmt(t, 2)}십억 년`], ['지금부터 거슬러 올라간 시간', `${fmt(now - t, 2)}십억 년`], ['별 생성률 (지금 대비)', `${fmt(sfr(z) / sfr(0), 1)}배`], ['지금 우주 나이', `${fmt(now, 2)}십억 년`]]); }; } },
  { id: 'moon', level: '교양', title: '달의 형성과 멀어지는 달', tag: '거대 충돌에서 태어나 해마다 3.8 cm씩',
    eq: String.raw`\frac{da}{dt} \propto a^{-11/2}\quad(\text{조석 마찰})`,
    body: `달은 어떻게 생겼을까요? 가장 유력한 설명은 원시 지구와 다른 천체가 부딪혀 달이 생겼다는 <b>거대 충돌설</b>입니다. 약 45억 년 전 화성만 한 천체(테이아)가 원시 지구에 비스듬히 부딪혀 맨틀 물질이 튀어 나갔고, 이 물질이 지구 둘레에 원반을 만든 뒤 그중 로슈 한계 밖의 물질이 모여 달이 되었다고 봅니다. 달 암석이 지구 맨틀과 산소 동위원소 비율이 거의 같고, 철 핵이 작은 것이 그 근거입니다.
      태어날 때 달은 지금보다 훨씬 가까웠습니다. 그 뒤 조석 마찰로 지구 자전 에너지를 받아 지금도 해마다 3.8 cm씩 멀어지고 있으며, 그 대가로 지구의 하루는 길어지고 있습니다. 샌드박스의 "달의 탄생" 시나리오에서 충돌을 직접 볼 수 있습니다.`,
    deep: String.raw`조석 팽대부가 자전 때문에 달보다 앞서 있어 달을 앞으로 끌어당기고(각운동량 전달), 지구 자전은 느려집니다. 지금의 비율을 과거로 그대로 적용하면 달이 약 15억 년 전에 지구에 붙어 있어야 하는데(아래 회색 곡선), 이는 지질 기록과 맞지 않습니다.
      과거에는 바다 모양이 달라 조석 공명이 약해 멀어지는 속도가 더 느렸다고 봅니다. 6억 2천만 년 전 엘라티나 층의 조석 퇴적층은 하루 약 21.9시간, 지구-달 거리 약 58 지구 반지름을 보여 줍니다(아래 점).`,
    widget(box) { const K = canvas(box, 340, 220), ago = slider(box, '몇 억 년 전', 0, 45, 0.5, 6.2, (x) => `${x}억 년 전`), R = readout(box);
      return () => { clear(K); const a0 = 60.27, k = 3.82e-5 / 6371 * 1e9 * a0 ** 5.5 * 6.5 / 1e3 * 1e3; // R_E^(13/2) per Gyr from today's 3.82 cm/yr
        const naive = (Gyr) => { const v = a0 ** 6.5 - k * Gyr; return v > 0 ? v ** (1 / 6.5) : NaN; }, xs = []; for (let t = 0; t <= 4.5; t += 0.02) xs.push(t);
        const P = plot(K, xs, [{ ys: xs.map(naive), col: C.mute, lw: 1.5, label: '지금 속도를 그대로 거꾸로 (너무 빨리 붙음)' }, { ys: xs.map(t => a0 - (a0 - 30) * Math.pow(t / 4.5, 1.6)), col: C.teal, label: '지질 기록과 맞춘 개략' }], { x0: 0, x1: 4.5, y0: 0, y1: 65, xl: '십억 년 전', yl: '지구-달 거리 (지구 반지름)', xd: 1, yd: 0 });
        for (const [t, a] of [[0.62, 58.2], [2.45, 54.6]]) dot(K.g, P.X(t), P.Y(a), 4, C.amber);
        const t = ago.value / 10, a = a0 - (a0 - 30) * Math.pow(t / 4.5, 1.6), day = 24 * Math.pow(a / a0, 1.5 * 0.6); K.g.strokeStyle = C.pink; K.g.beginPath(); K.g.moveTo(P.X(t), 14); K.g.lineTo(P.X(t), K.h - 26); K.g.stroke();
        R([['그때 지구-달 거리 (개략)', `${fmt(a, 1)} 지구 반지름 (${fmt(a * 6371 / 1000, 0)}천 km)`], ['그때 달의 겉보기 크기', `지금의 ${fmt(a0 / a, 2)}배`], ['지금', '38만 4천 km, 해마다 3.82 cm (달 레이저 반사 측정)'], ['주황 점', '엘라티나 층(6.2억 년 전), 위리 월리 층(24.5억 년 전) 추정치']]); }; },
    lab: null },
];
function starColorHex(m) { const T = 5772 * Math.pow(Math.max(m, 0.08), 0.54); return T > 9000 ? '#aabfff' : T > 7000 ? '#d8e2ff' : T > 5500 ? '#ffe6a6' : T > 4000 ? '#ffc27a' : '#ff8a5c'; }

// ---- more chapters: sky and time, Earth, planets, stars, cosmos ----
const MORE = [
  { id: 'coords', level: '기초', title: '천구와 좌표계', tag: '하늘의 주소 쓰는 법',
    eq: String.raw`\sin h = \sin\varphi\sin\delta + \cos\varphi\cos\delta\cos H`,
    body: `하늘을 지구 둘레의 큰 공(천구)으로 생각하면 별의 위치를 좌표로 적을 수 있습니다. 이렇게 생각하면 별의 위치를 지구의 위도·경도처럼 <b>적위 δ</b>와 <b>적경 α</b>로 적을 수 있습니다. 반면에 내가 보는 하늘의 높이(고도 h)는 관측지 위도 φ와 별의 시간각 H로 정해지므로, 같은 별도 장소와 시각에 따라 다른 높이에 보입니다.
      예를 들어 위도가 높을수록 지지 않는 별(주극성)이 많아지고, 적위가 −(90° − φ)보다 낮은 별은 아예 떠오르지 않습니다. 또 하늘의 북극(북극성 근처)은 언제나 관측지의 위도와 같은 높이에 떠 있어서, 서울(37.5°N)에서는 지평선 위 약 37.5°입니다.`,
    deep: String.raw`구면 삼각법의 코사인 법칙을 천문 삼각형(천정·천구 북극·별)에 적용하면 위 식이 나옵니다. 방위각은 <span class="tex">\tan A = \frac{\sin H}{\cos H\sin\varphi - \tan\delta\cos\varphi}</span>. 시간각은 지방 항성시에서 적경을 뺀 값 <span class="tex">H = \text{LST} - \alpha</span>입니다.`,
    widget(box) { const K = canvas(box), la = slider(box, '관측지 위도 φ', -90, 90, 0.5, 37.6, (x) => x + '°'), de = slider(box, '별의 적위 δ', -90, 90, 0.5, 20, (x) => x + '°'), R = readout(box);
      return () => { clear(K); const p = la.value * D2R, d = de.value * D2R, xs = [], ys = []; for (let H = -180; H <= 180; H += 2) { xs.push(H / 15); ys.push(Math.asin(Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.cos(H * D2R)) / D2R); }
        const P = plot(K, xs, [{ ys, col: C.teal, label: '하루 동안의 고도' }, { ys: xs.map(() => 0), col: C.mute, lw: 1, label: '지평선' }], { x0: -12, x1: 12, y0: -90, y1: 90, xl: '시간각 H (시간, 남중 = 0)', yl: '고도 (°)', yd: 0 });
        const cosH = -Math.tan(p) * Math.tan(d), up = cosH < -1 ? 24 : cosH > 1 ? 0 : 2 * Math.acos(cosH) / D2R / 15;
        R([['남중 고도', `${fmt(90 - Math.abs(la.value - de.value), 1)}°`], ['하루 중 지평선 위', `${fmt(up, 1)}시간`], ['종류', up >= 24 ? '주극성 (지지 않음)' : up <= 0 ? '이 위도에서는 뜨지 않음' : '뜨고 지는 별']]); }; } },
  { id: 'eot', level: '교양', title: '균시차와 아날렘마', tag: '해시계가 시계와 어긋나는 이유',
    eq: String.raw`E \approx 9.87\sin 2B - 7.53\cos B - 1.5\sin B\ (\text{분}),\ B = \tfrac{2\pi}{365}(n-81)`,
    body: `해시계와 손목시계는 1년 내내 딱 맞지 않는데, 그 차이를 균시차라고 합니다. 시계는 1년 내내 같은 빠르기로 가지만, 실제 태양은 남중 시각이 최대 ±16분까지 들쭉날쭉합니다. 지구 궤도가 타원이라 공전 속도가 바뀌고(케플러 2법칙), 자전축이 기울어 있기 때문입니다. 그래서 1년 동안 같은 시각에 태양 위치를 찍으면 8자 모양의 <b>아날렘마</b>가 나옵니다.`,
    deep: String.raw`균시차는 두 성분의 합입니다: 이심률 때문의 연주기 항(진폭 약 7.7분)과 황도 경사 때문의 반년 주기 항(진폭 약 9.9분). 정밀한 값은 태양의 겉보기 적경과 평균 태양의 적경 차이로 계산합니다. 화성에서는 이심률이 커서 아날렘마가 눈물방울 모양입니다.`,
    widget(box) { const K = canvas(box), dn = slider(box, '날짜 (1월 1일부터)', 1, 365, 1, 120, (x) => { const d = new Date(Date.UTC(2026, 0, x)); return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`; }), R = readout(box);
      const E = (n) => { const B = 2 * Math.PI * (n - 81) / 365; return 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B); }, dec = (n) => 23.44 * Math.sin(2 * Math.PI * (284 + n) / 365);
      return () => { clear(K); const g = K.g, X = (e) => K.w / 2 + e * 7, Y = (d) => K.h / 2 - d * 4; g.strokeStyle = C.grid; g.beginPath(); g.moveTo(0, K.h / 2); g.lineTo(K.w, K.h / 2); g.moveTo(K.w / 2, 0); g.lineTo(K.w / 2, K.h); g.stroke();
        g.strokeStyle = C.amber; g.lineWidth = 2; g.beginPath(); for (let n = 1; n <= 366; n++) n > 1 ? g.lineTo(X(E(n)), Y(dec(n))) : g.moveTo(X(E(n)), Y(dec(n))); g.stroke();
        const n = +dn.value; dot(g, X(E(n)), Y(dec(n)), 5, C.teal); text(g, '← 태양이 늦게 남중 · 일찍 남중 →', K.w / 2, K.h - 6, C.mute, 10, 'center'); text(g, '태양 적위 ↑', 4, 12, C.mute, 10);
        R([['균시차', `${fmt(E(n), 1)}분 (${E(n) > 0 ? '해시계가 빠름' : '해시계가 느림'})`], ['태양 적위', `${fmt(dec(n), 1)}°`]]); }; } },
  { id: 'seasons', level: '기초', title: '계절과 자전축의 기울기', tag: '여름이 더운 건 가까워서가 아니다',
    eq: String.raw`\bar Q = \frac{S_0}{\pi}\left(\frac{a}{r}\right)^2\left(h_0\sin\varphi\sin\delta + \cos\varphi\cos\delta\sin h_0\right)`,
    body: `여름과 겨울이 생기는 까닭은 무엇일까요? 흔히 태양과의 거리 때문이라고 생각하지만, 지구가 태양에 가장 가까운 때는 오히려 1월 초입니다. 그런데도 북반구가 겨울인 이유는 자전축이 23.4° 기울어 있어 햇빛이 비스듬히 들고 낮이 짧기 때문입니다. 나아가 이 기울기와 이심률이 수만 년 주기로 바뀌면 빙하기가 찾아오는데, 이것이 <b>밀란코비치 주기</b>입니다. 아래에서 기울기를 바꿔 위도별 하루 평균 일사량이 어떻게 달라지는지 보세요.`,
    deep: String.raw`h₀는 일출 시간각 <span class="tex">\cos h_0 = -\tan\varphi\tan\delta</span>, S₀ = 1361 W/m²(태양 상수). 자전축 기울기는 약 4만 1천 년 주기로 22.1°~24.5°, 이심률은 약 10만·40만 년 주기로 0~0.06, 근일점의 계절은 약 2만 3천 년(세차)으로 바뀝니다.`,
    widget(box) { const K = canvas(box), ob = slider(box, '자전축 기울기', 0, 45, 0.1, 23.44, (x) => x + '°'), la = slider(box, '위도', -90, 90, 1, 37, (x) => x + '°'), R = readout(box);
      const Q = (n, phi, eps) => { const d = Math.asin(Math.sin(eps * D2R) * Math.sin(2 * Math.PI * (n - 80) / 365.25)), p = phi * D2R, c = -Math.tan(p) * Math.tan(d), h0 = c <= -1 ? Math.PI : c >= 1 ? 0 : Math.acos(c), r = 1 - 0.0167 * Math.cos(2 * Math.PI * (n - 3) / 365.25);
        return 1361 / Math.PI / (r * r) * (h0 * Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.sin(h0)); };
      return () => { clear(K); const xs = []; for (let n = 1; n <= 365; n += 3) xs.push(n);
        plot(K, xs, [{ ys: xs.map(n => Q(n, +la.value, +ob.value)), col: C.amber, label: `위도 ${la.value}°` }, { ys: xs.map(n => Q(n, 0, +ob.value)), col: C.mute, lw: 1, label: '적도' }], { x0: 1, x1: 365, y0: 0, y1: 560, xl: '1월 → 12월', yl: '하루 평균 일사량 (W/m²)', yd: 0 });
        const ys = xs.map(n => Q(n, +la.value, +ob.value)); R([['가장 많을 때 / 적을 때', `${fmt(Math.max(...ys), 0)} / ${fmt(Math.min(...ys), 0)} W/m²`], ['북극권 위도', `${fmt(90 - ob.value, 1)}°`]]); }; } },
  { id: 'moonphase', level: '기초', title: '달의 위상과 식', tag: '보름달마다 월식이 일어나지 않는 이유',
    eq: String.raw`k = \frac{1-\cos\psi}{2}\quad(\psi:\ \text{태양에서 본 이각})`,
    body: `달은 한 달 동안 차고 기울며 모양(위상)이 바뀝니다. 달은 스스로 빛나지 않고 햇빛을 반사하므로, 태양-지구-달의 각도에 따라 위상이 바뀝니다. 이 배치는 식과도 이어져서, 삭(신월) 때 해와 달이 겹치면 일식, 망(보름) 때 달이 지구 그림자에 들어가면 월식이 일어납니다. 그런데 달 궤도가 황도에 5.1° 기울어 있어서, 매달 식이 생기지는 않고 달이 교점 근처에 있을 때만 일어납니다.`,
    deep: String.raw`식이 가능한 시기(식의 계절)는 1년에 두 번, 약 173일 간격입니다. 교점이 18.6년 주기로 돌기 때문에 같은 조건의 식은 사로스 주기(6,585.3일 ≈ 18년 11일)마다 되풀이됩니다. 밝은 면의 비율 k는 이각 ψ(태양-달 사이 각)로 정해집니다.`,
    widget(box) { const K = canvas(box, 340, 200), ph = slider(box, '월령 (일)', 0, 29.5, 0.1, 7.4, (x) => x.toFixed(1)), nd = slider(box, '달과 교점 사이 거리 (°)', 0, 90, 0.5, 4, (x) => x + '°'), R = readout(box);
      return () => { const g = K.g; clear(K); const a = ph.value / 29.53 * 2 * Math.PI, cx = 90, cy = 100;
        dot(g, cx, cy, 10, C.blue); g.strokeStyle = C.grid; g.beginPath(); g.arc(cx, cy, 60, 0, 7); g.stroke(); text(g, '태양 빛 →', 8, 20, C.amber, 10); const mx = cx - 60 * Math.cos(a), my = cy + 60 * Math.sin(a); dot(g, mx, my, 6, '#ccc');
        // appearance from Earth
        const X = 260, Y = 100, r = 50, k = (1 - Math.cos(a)) / 2; g.fillStyle = '#202838'; g.beginPath(); g.arc(X, Y, r, 0, 7); g.fill(); g.fillStyle = '#e6e6e0'; g.beginPath();
        const waxing = a < Math.PI; g.arc(X, Y, r, -Math.PI / 2, Math.PI / 2, !waxing); g.ellipse(X, Y, Math.abs(1 - 2 * k) * r, r, 0, Math.PI / 2, -Math.PI / 2, (k > 0.5) === waxing); g.fill();
        const nb = +nd.value, solar = Math.abs(Math.sin(nb * D2R) * 5.145) < 1.5 && (ph.value < 1 || ph.value > 28.5), lunar = Math.abs(Math.sin(nb * D2R) * 5.145) < 1.0 && Math.abs(ph.value - 14.77) < 1;
        R([['밝은 면', `${fmt(k * 100, 0)}%`], ['모양', ['삭', '초승달', '상현달', '차오르는 달', '보름달', '기우는 달', '하현달', '그믐달'][Math.round(ph.value / 29.53 * 8) % 8]], ['황도에서 달까지', `${fmt(Math.sin(nb * D2R) * 5.145, 2)}°`], ['식', solar ? '일식이 일어날 수 있음' : lunar ? '월식이 일어날 수 있음' : '없음 (삭·망이면서 교점 근처여야 함)']]); }; } },
  { id: 'tides', level: '교양', title: '조석', tag: '바다가 하루에 두 번 부풀어 오르는 이유',
    eq: String.raw`a_\text{조석} \approx \frac{2GMR}{d^3}`,
    body: `바닷가에서는 하루에 두 번 물이 들어오고 나가는데, 이것이 조석입니다. 달은 지구의 가까운 쪽을 더 세게, 먼 쪽을 덜 세게 당기는데, 그 차이가 조석력입니다. 이 때문에 바다는 달 쪽과 그 반대쪽 두 곳이 부풀어, 하루에 밀물이 두 번 옵니다. 태양도 조석력을 주지만 그 크기는 달의 약 46%라서, 둘이 일직선이면 힘이 더해져 사리(큰 조석), 직각이면 서로 깎여 조금(작은 조석)이 됩니다.`,
    deep: String.raw`조석력은 거리의 세제곱에 반비례해서, 태양은 달보다 2,700만 배 무겁지만 390배 멀어 조석 효과는 <span class="tex">(M_\odot/M_☾)(d_☾/d_\odot)^3 \approx 0.46</span>입니다. 실제 조차는 해안 지형과 바다의 공명으로 크게 달라집니다(서해 인천 약 9 m). 조석 마찰은 지구 자전을 늦추고 달을 밀어냅니다.`,
    widget(box) { const K = canvas(box, 340, 220), an = slider(box, '태양과 달 사이 각도', 0, 180, 1, 0, (x) => x + '°'), R = readout(box);
      return () => { const g = K.g; clear(K); const th = an.value * D2R, cx = K.w / 2, cy = K.h / 2, amp = Math.hypot(1 + 0.46 * Math.cos(2 * th), 0.46 * Math.sin(2 * th)), dir = Math.atan2(0.46 * Math.sin(2 * th), 1 + 0.46 * Math.cos(2 * th)) / 2;
        g.fillStyle = 'rgba(111,168,255,.35)'; g.beginPath(); g.ellipse(cx, cy, 40 + 22 * amp, 40, -dir, 0, 7); g.fill(); dot(g, cx, cy, 34, '#3d6b3a');
        dot(g, cx + 140, cy, 7, '#ccc'); text(g, '달', cx + 132, cy - 12, C.text, 10); const sx = cx + 150 * Math.cos(th), sy = cy - 150 * Math.sin(th); text(g, '태양 방향', Math.min(K.w - 50, sx), Math.max(14, sy), C.amber, 10); arrow(g, cx, cy, cx + 60 * Math.cos(th), cy - 60 * Math.sin(th), C.amber, 1);
        R([['조석 크기 (달만 = 1)', fmt(amp, 2)], ['상태', an.value < 15 || an.value > 165 ? '사리 (삭·망 무렵)' : Math.abs(an.value - 90) < 15 ? '조금 (상현·하현 무렵)' : '중간']]); }; } },
  { id: 'teq', level: '교양', title: '평형 온도와 온실 효과', tag: '금성이 수성보다 뜨거운 이유',
    eq: String.raw`T_\text{eq} = 278.6\,\text{K}\,(1-A)^{1/4}\left(\frac{L}{L_\odot}\right)^{1/4}\left(\frac{d}{1\,\text{AU}}\right)^{-1/2}`,
    body: `평형 온도는 행성이 받는 햇빛과 내놓는 적외선이 같아질 때의 온도입니다. 대기의 영향을 빼고 계산한 값이라, 실제 온도와 비교하면 대기가 하는 일을 알 수 있습니다. 예를 들어 지구는 평형 온도가 −18 °C인데, 실제 평균은 15 °C입니다. 대기의 온실 기체가 적외선을 붙잡아 표면을 데우기 때문이며, 이것이 온실 효과입니다. 그 극단적인 예로, 두꺼운 이산화탄소 대기를 가진 금성은 표면이 460 °C로 태양에 더 가까운 수성보다 뜨겁습니다.`,
    deep: String.raw`흡수 <span class="tex">\pi R^2(1-A)S</span> = 방출 <span class="tex">4\pi R^2\sigma T^4</span>에서 나옵니다. 한 겹 대기 모형에서 적외선 흡수율 ε이면 <span class="tex">T_s = T_\text{eq}\left(\frac{2}{2-\varepsilon}\right)^{1/4}</span>. 금성처럼 대기가 두꺼우면 여러 겹 모형(광학 깊이 τ)으로 <span class="tex">T_s^4 \approx T_\text{eq}^4(1 + \tfrac34\tau)</span>.`,
    widget(box) { const K = canvas(box, 340, 160), d = slider(box, '태양까지 거리 (AU)', 0.3, 5.5, 0.01, 1, (x) => x.toFixed(2)), A = slider(box, '반사율 A', 0, 0.9, 0.01, 0.3, (x) => x.toFixed(2)), ep = slider(box, '대기의 적외선 흡수율 ε', 0, 1, 0.01, 0.78, (x) => x.toFixed(2)), R = readout(box);
      return () => { clear(K); const Te = 278.6 * Math.pow(1 - A.value, 0.25) / Math.sqrt(+d.value), Ts = Te * Math.pow(2 / (2 - ep.value), 0.25), g = K.g, X = (T) => 20 + (T - 0) / 800 * (K.w - 40);
        for (const [n, T] of [['수성 낮 430 °C', 703], ['금성 464 °C', 737], ['지구 15 °C', 288], ['화성 −63 °C', 210]]) { dot(g, X(T), 40, 3, C.mute); text(g, n, X(T), 30, C.mute, 9, 'center'); }
        dot(g, X(Te), 90, 6, C.blue); text(g, '평형 온도', X(Te), 112, C.blue, 10, 'center'); dot(g, X(Ts), 90, 6, C.pink); text(g, '표면 (온실)', X(Ts), 128, C.pink, 10, 'center');
        R([['평형 온도', `${fmt(Te, 0)} K (${fmt(Te - 273.15, 0)} °C)`], ['한 겹 온실 모형 표면', `${fmt(Ts, 0)} K (${fmt(Ts - 273.15, 0)} °C)`]]); }; } },
  { id: 'hz', level: '교양', title: '생명 가능 지대', tag: '물이 액체로 있을 수 있는 거리',
    eq: String.raw`d_\text{안} \approx 0.95\sqrt{L/L_\odot}\ \text{AU},\quad d_\text{밖} \approx 1.37\sqrt{L/L_\odot}\ \text{AU}`,
    body: `생명 가능 지대는 행성 표면에 액체 물이 있을 수 있는, 별 둘레의 거리 범위입니다. 별에서 너무 가까우면 바다가 끓어 사라지고, 너무 멀면 얼어붙기 때문에 그 사이에서만 생명을 기대할 수 있습니다. 이 거리는 별의 밝기에 따라 달라져서, 별이 밝을수록 멀리, 어두운 적색왜성은 아주 가까이 있습니다. 그래서 적색왜성 둘레의 행성은 별에 가까워 한쪽 면만 별을 보는 조석 고정이 되기 쉽습니다.`,
    deep: String.raw`안쪽 경계는 폭주 온실 효과, 바깥쪽은 최대 온실 효과(이산화탄소 응결) 한계로 정합니다(Kasting 1993, Kopparapu 2013). 별이 나이를 먹으면 밝아져 생명 가능 지대가 바깥으로 움직입니다. 태양은 약 10억 년 뒤 지구를 안쪽 경계 밖으로 밀어낼 만큼 밝아집니다.`,
    widget(box) { const K = canvas(box, 340, 150), ms = slider(box, '별 질량 (태양 = 1)', 0.08, 2, 0.01, 1, (x) => x.toFixed(2)), R = readout(box);
      return () => { clear(K); const m = +ms.value, L = m < 0.43 ? 0.23 * m ** 2.3 : m ** 4, a = 0.95 * Math.sqrt(L), b = 1.37 * Math.sqrt(L), g = K.g, X = (d) => 20 + Math.log10(d / 0.01) / Math.log10(10 / 0.01) * (K.w - 40);
        g.fillStyle = 'rgba(79,227,193,.25)'; g.fillRect(X(a), 40, X(b) - X(a), 60); dot(g, X(0.012), 70, 8, starColorHex(m));
        for (const [n, d2] of [['수성', 0.39], ['금성', 0.72], ['지구', 1], ['화성', 1.52], ['목성', 5.2]]) { dot(g, X(d2), 70, 3, C.text); text(g, n, X(d2), 120, C.mute, 9, 'center'); }
        text(g, '거리 (로그 눈금, 0.01~10 AU)', K.w / 2, K.h - 6, C.mute, 9, 'center');
        R([['별의 밝기', `${L < 0.01 ? L.toExponential(1) : fmt(L, 3)} 태양`], ['생명 가능 지대', `${fmt(a, 3)} ~ ${fmt(b, 3)} AU`], ['예', 'TRAPPIST-1 (0.09 태양질량): 0.03~0.05 AU에 행성 3개']]); }; } },
  { id: 'blackbody', level: '교양', title: '흑체 복사: 별의 색과 온도', tag: '빨간 별은 차갑고 파란 별은 뜨겁다',
    eq: String.raw`\lambda_\text{max} = \frac{2898\,\mu\text{m·K}}{T},\qquad L = 4\pi R^2\sigma T^4`,
    body: `뜨거운 물체는 온도에 따라 정해진 모양의 빛을 내는데, 이를 흑체 복사라고 합니다. 별빛도 거의 흑체 복사라서, 별의 색으로 표면 온도를 잴 수 있습니다. 온도가 높을수록 더 밝아지고, 가장 센 빛의 파장이 짧아져 파랗게 보입니다(빈의 법칙). 구체적으로 가장 센 빛의 파장은 2,898 μm·K를 온도로 나눈 값이라, 태양(약 5,800 K)은 약 500 nm 청록빛에서 가장 밝습니다.`,
    deep: String.raw`플랑크 함수 <span class="tex">B_\lambda(T) = \frac{2hc^2}{\lambda^5}\frac{1}{e^{hc/\lambda k T}-1}</span>를 모든 파장에 대해 적분하면 슈테판-볼츠만 법칙 <span class="tex">\sigma T^4</span>, 미분해서 0이 되는 곳이 빈의 변위 법칙입니다. 별의 스펙트럼에는 대기의 원소가 흡수한 검은 선(흡수선)이 겹쳐 있어 성분도 알 수 있습니다.`,
    widget(box) { const K = canvas(box), Ts = slider(box, '표면 온도 (K)', 2500, 30000, 50, 5772), R = readout(box);
      const B = (l, T) => 1 / (l ** 5 * (Math.exp(14388 / (l * T)) - 1)); // l in micrometres
      return () => { clear(K); const T = +Ts.value, xs = []; for (let l = 0.1; l <= 2.5; l += 0.01) xs.push(l); const mx = B(2898 / T, T);
        const g = K.g; const P = plot(K, xs, [{ ys: xs.map(l => B(l, T) / mx), col: C.amber, label: `${T} K` }, { ys: xs.map(l => B(l, 5772) / B(2898 / 5772, 5772)), col: C.mute, lw: 1, label: '태양 5,772 K' }], { x0: 0.1, x1: 2.5, y0: 0, y1: 1.05, xl: '파장 (μm)', yl: '세기 (최댓값 = 1)', yd: 1, xd: 1 });
        const gr = g.createLinearGradient(P.X(0.38), 0, P.X(0.75), 0); for (const [s, c] of [[0, '#7a3cff'], [0.25, '#3c7aff'], [0.45, '#3cff7a'], [0.65, '#ffe03c'], [1, '#ff3c3c']]) gr.addColorStop(s, c); g.globalAlpha = 0.18; g.fillStyle = gr; g.fillRect(P.X(0.38), 14, P.X(0.75) - P.X(0.38), K.h - 40); g.globalAlpha = 1;
        R([['가장 센 파장', `${fmt(2898 / T, 3)} μm (${fmt(2898000 / T, 0)} nm)`], ['같은 크기일 때 밝기', `태양의 ${fmt((T / 5772) ** 4, 2)}배`], ['색', T > 10000 ? '청백색' : T > 7500 ? '백색' : T > 6000 ? '황백색' : T > 5000 ? '노란색' : T > 3700 ? '주황색' : '붉은색']]); }; } },
  { id: 'magnitude', level: '교양', title: '별의 밝기, 등급, 거리', tag: '5등급 차이가 100배',
    eq: String.raw`m - M = 5\log_{10}\frac{d}{10\,\text{pc}},\qquad \frac{F_1}{F_2} = 10^{-0.4(m_1-m_2)}`,
    body: `별의 밝기는 등급으로 나타내며, 숫자가 작을수록 밝고 5등급 차이가 정확히 100배입니다. 이때 지구에서 보이는 밝기가 겉보기 등급 m, 별을 10 파섹(32.6광년)에 놓았을 때의 밝기가 절대 등급 M입니다. 겉보기 밝기는 거리에 따라 달라지므로, 둘의 차이(거리 지수)를 알면 거꾸로 별까지의 거리를 알 수 있습니다.`,
    deep: String.raw`등급 체계는 히파르코스의 6단계를 포그슨(1856)이 <span class="tex">2.512^5 = 100</span>으로 정한 것입니다. 성간 먼지에 의한 소광 A를 더하면 <span class="tex">m - M = 5\log_{10} d - 5 + A</span>. 세페이드 변광성처럼 절대 등급을 아는 '표준 촛불'로 은하까지 거리를 잽니다.`,
    widget(box) { const K = canvas(box, 340, 170), Ms = slider(box, '절대 등급 M', -8, 15, 0.1, 4.83, (x) => x.toFixed(1)), ds = slider(box, '거리 (광년, 로그)', 0, 5, 0.01, 1.4, (x) => fmt(10 ** x, 1)), R = readout(box);
      return () => { clear(K); const d = 10 ** ds.value / 3.2616, m = +Ms.value + 5 * Math.log10(d / 10), g = K.g, X = (mm) => 20 + (mm + 2) / 22 * (K.w - 40);
        g.strokeStyle = C.grid; g.beginPath(); g.moveTo(X(-2), 80); g.lineTo(X(20), 80); g.stroke(); for (const [n, mm] of [['시리우스 −1.5', -1.46], ['맨눈 한계 6.5', 6.5], ['쌍안경 9', 9], ['20 cm 망원경 14', 14], ['허블 30 →', 20]]) { dot(g, X(mm), 80, 2.5, C.mute); text(g, n, X(mm), 70, C.mute, 9, 'center'); }
        dot(g, X(Math.max(-2, Math.min(20, m))), 80, 6, C.teal); text(g, '이 별', X(Math.max(-2, Math.min(20, m))), 102, C.teal, 10, 'center');
        R([['겉보기 등급', fmt(m, 2)], ['거리', `${fmt(d, 2)} pc (${fmt(d * 3.2616, 1)}광년)`], ['맨눈으로', m < 6.5 ? '보임' : '안 보임'], ['태양 (M 4.83)을 이 거리에 두면', fmt(4.83 + 5 * Math.log10(d / 10), 2)]]); }; } },
  { id: 'remnants', level: '전공', title: '별의 최후: 백색왜성, 중성자별, 블랙홀', tag: '무엇이 붕괴를 버티는가',
    eq: String.raw`r_s = \frac{2GM}{c^2} \approx 2.95\,\text{km}\times\frac{M}{M_\odot},\qquad \frac{\Delta t_\infty}{\Delta t} = \frac{1}{\sqrt{1-r_s/r}}`,
    body: `별이 연료를 다 쓰면 무엇이 남을까요? 연료가 떨어지면 중력을 버틸 압력이 사라져 별이 수축하는데, 무엇이 그 수축을 막느냐에 따라 마지막 모습이 갈립니다. 전자들이 서로 같은 상태에 들어가지 못하는 힘(전자 축퇴압)이 버티면 지구만 한 백색왜성이 되고, 그것도 넘으면 중성자 축퇴압으로 버티는 지름 20~25 km의 중성자별이 됩니다. 그마저 넘으면 아무것도 버티지 못해 블랙홀이 됩니다. 블랙홀의 사건의 지평선 반지름은 질량에 정비례해서, 태양 질량이면 약 3 km, 10배 무거우면 약 30 km입니다.`,
    deep: String.raw`찬드라세카르 한계 약 1.4 M☉, TOV 한계 약 2.2~2.9 M☉. 블랙홀 근처에서는 시간이 느리게 갑니다(중력 시간 지연). 가장 안쪽 안정 원 궤도(ISCO)는 <span class="tex">3r_s</span>, 빛이 원을 그리는 광자 구는 <span class="tex">1.5r_s</span>입니다. 샌드박스에서 태양을 같은 질량의 블랙홀로 바꿔도 행성 궤도가 그대로인 이유는 바깥에서 본 중력이 질량에만 달려 있기 때문입니다.`,
    widget(box) { const K = canvas(box, 340, 170), ms = slider(box, '질량 (태양 = 1, 로그)', -0.5, 9.8, 0.01, 1, (x) => fmt(10 ** x, 2)), rr = slider(box, '중심에서 거리 r / r_s', 1.01, 20, 0.01, 3, (x) => x.toFixed(2)), R = readout(box);
      return () => { clear(K); const M = 10 ** ms.value, rs = 2.9532 * M, g = K.g, cx = 80, cy = 85;
        g.fillStyle = '#000'; g.beginPath(); g.arc(cx, cy, 30, 0, 7); g.fill(); g.strokeStyle = C.amber; g.setLineDash([3, 3]); g.beginPath(); g.arc(cx, cy, 45, 0, 7); g.stroke(); g.strokeStyle = C.teal; g.beginPath(); g.arc(cx, cy, 90, -0.5, 0.5); g.stroke(); g.setLineDash([]);
        text(g, '사건의 지평선', cx, cy + 4, C.mute, 9, 'center'); text(g, '광자 구 1.5 r_s', cx + 48, cy - 34, C.amber, 9); text(g, 'ISCO 3 r_s', cx + 92, cy, C.teal, 9);
        const r = +rr.value, dil = 1 / Math.sqrt(1 - 1 / r), rho = M * 1.989e30 / (4 / 3 * Math.PI * (rs * 1e3) ** 3);
        R([['사건의 지평선 반지름', rs > 1e6 ? `${fmt(rs / 1.496e8, 3)} AU` : `${fmt(rs, 2)} km`], ['지평선 안 평균 밀도', `${rho.toExponential(1)} kg/m³`], [`r = ${r} r_s에서 시간`, `먼 곳보다 ${fmt(dil, 3)}배 느리게 감`], ['참고', '궁수자리 A* 430만 M☉ → r_s 약 0.08 AU']]); }; } },
  { id: 'hubble', level: '교양', title: '허블 법칙과 우주 팽창', tag: '멀리 있는 은하일수록 빨리 멀어진다',
    eq: String.raw`v = H_0\,d,\qquad t_H = 1/H_0`,
    body: `1929년 허블은 은하의 거리와 스펙트럼의 적색편이를 비교해, 멀리 있는 은하일수록 빠르게 멀어진다는 것을 보였습니다. 이를 허블 법칙이라고 합니다. 이는 은하가 공간 속을 달아나는 것이 아니라 우주 공간 자체가 늘어나고 있다는 뜻입니다. 거리와 후퇴 속도를 잇는 기울기 H₀를 허블 상수라 하며, 후퇴 속도는 H₀에 거리를 곱해 구합니다. 또 H₀의 역수는 우주 나이의 대략적인 값이 됩니다.`,
    deep: String.raw`가까운 거리에서 <span class="tex">z \approx v/c</span>. H₀는 측정 방법에 따라 약 67.4(우주 배경 복사, 플랑크)와 73(세페이드·초신성, SH0ES) km/s/Mpc로 갈려 있어 '허블 긴장'이라 부릅니다. 실제 우주 나이는 팽창 속도의 변화(감속 후 가속)를 적분해서 138억 년으로 구합니다.`,
    widget(box) { const K = canvas(box), H = slider(box, '허블 상수 H₀ (km/s/Mpc)', 50, 90, 0.1, 70), R = readout(box);
      const G = [['처녀자리 은하단', 16.5, 1100], ['M101', 6.7, 241], ['코마 은하단', 99, 6925], ['NGC 7331', 14.7, 816], ['M87', 16.4, 1284], ['안드로메다 (다가옴)', 0.77, -110]];
      return () => { clear(K); const xs = []; for (let d = 0; d <= 110; d += 1) xs.push(d); const P = plot(K, xs, [{ ys: xs.map(d => H.value * d), col: C.teal, label: `v = ${H.value} d` }], { x0: 0, x1: 110, y0: -500, y1: 8000, xl: '거리 (Mpc)', yl: '후퇴 속도 (km/s)', yd: 0 });
        for (const [n, d, v] of G) { dot(K.g, P.X(d), P.Y(v), 3.5, C.amber); } text(K.g, '주황 점: 실제 은하 (근사값, 가까운 은하는 고유 운동이 섞임)', 44, 30, C.mute, 9);
        R([['허블 시간 1/H₀', `${fmt(977.8 / H.value, 1)}십억 년`], ['100 Mpc 떨어진 은하', `${fmt(H.value * 100, 0)} km/s로 멀어짐`]]); }; } },
  { id: 'cmb', level: '교양', title: '우주 배경 복사', tag: '138억 년 전 빛의 화석',
    eq: String.raw`T(z) = 2.7255\,\text{K}\,(1+z)`,
    body: `하늘 어느 방향을 보아도 희미한 마이크로파가 오는데, 이것이 우주 배경 복사입니다. 우주는 처음에 뜨겁고 빽빽해서 빛이 물질에 갇혀 있었습니다. 그러다 약 38만 년 뒤 3,000 K까지 식으며 원자가 생기자 빛이 자유롭게 나아가게 되었습니다. 그 빛의 파장이 우주 팽창으로 1,100배 늘어나, 지금은 2.7 K의 마이크로파로 관측됩니다. 이 빛은 1965년 펜지어스와 윌슨이 우연히 발견했습니다.`,
    deep: String.raw`우주 배경 복사는 측정된 것 중 가장 완벽한 흑체 스펙트럼입니다(COBE/FIRAS). 10만 분의 1 수준의 온도 요동(WMAP, 플랑크)이 훗날 은하가 된 밀도 씨앗이며, 그 각도 크기에서 우주가 평평하다는 것과 암흑 물질·암흑 에너지의 비율을 얻습니다.`,
    widget(box) { const K = canvas(box, 340, 170), zs = slider(box, '적색편이 z (로그)', 0, 3.3, 0.01, 3.04, (x) => fmt(10 ** x - 1, 0)), R = readout(box);
      return () => { clear(K); const z = 10 ** zs.value - 1, T = 2.7255 * (1 + z), peak = 2898 / T, g = K.g; const X = (lz) => 20 + lz / 3.3 * (K.w - 40);
        for (const [n, zz] of [['지금', 0], ['첫 은하 z≈10', 10], ['재결합 z≈1,090', 1090]]) { dot(g, X(Math.log10(1 + zz)), 70, 3, C.mute); text(g, n, X(Math.log10(1 + zz)), 60, C.mute, 9, 'center'); }
        dot(g, X(zs.value), 70, 6, C.amber); text(g, 'log(1+z)', K.w - 20, K.h - 6, C.mute, 9, 'right');
        R([['그때 배경 복사 온도', `${fmt(T, 1)} K`], ['가장 센 파장', peak > 1000 ? `${fmt(peak / 1000, 2)} mm` : `${fmt(peak, 2)} μm`], ['지금', '2.7255 K, 가장 센 파장 1.06 mm (마이크로파)']]); }; } },
];
// Textbook order: chapters, and what each card builds on (prerequisites). "Next" links are derived from these.
const CHAPTERS = [
  { title: '0. 우주 첫걸음', intro: '수식이 낯설어도 괜찮은 우주 이야기: 크기, 하늘의 색, 오로라, 유성, 외계 문명, 우주의 역사', ids: ['scale', 'calendar', 'bluesky', 'aurora', 'meteor', 'microg', 'eht', 'drake'] },
  { title: '1. 하늘의 좌표와 시간', intro: '하늘을 지도처럼 읽는 법: 좌표, 시간, 계절, 달', ids: ['coords', 'eot', 'seasons', 'precession', 'moonphase', 'synodic'] },
  { title: '2. 지구와 우주 환경', intro: '지구의 자기장과 바다, 그리고 위성들이 사는 지구 둘레의 우주', ids: ['declination', 'paleomag', 'tides', 'spaceweather', 'vanallen', 'decay', 'debris', 'gps'] },
  { title: '3. 중력과 궤도', intro: '뉴턴의 중력에서 탐사선 궤도 설계까지', ids: ['gravity', 'keplerlaws', 'twobody', 'invariants', 'visviva', 'kepler', 'elements', 'rocket', 'hohmann', 'plane', 'oberth', 'soi', 'flyby', 'lambert', 'j2', 'cr3bp', 'cw'] },
  { title: '4. 행성과 위성', intro: '행성의 온도, 대기, 충돌, 위성, 그리고 다른 별의 행성', ids: ['roche', 'moon', 'teq', 'atmos', 'impact', 'hz', 'transit', 'exodetect'] },
  { title: '5. 별', intro: '빛으로 별을 재고, 별의 탄생부터 최후까지', ids: ['blackbody', 'spectral', 'parallax', 'magnitude', 'hrdiagram', 'doppler', 'sun', 'starstruct', 'starbirth', 'stellar', 'nucleo', 'remnants', 'gw'] },
  { title: '6. 은하와 우주', intro: '거리 사다리를 올라 우주의 역사까지', ids: ['distladder', 'galaxytypes', 'hubble', 'bigbang', 'darkmatter', 'cmb', 'darkenergy', 'galaxy'] },
];
const PRE = { eot: ['coords', 'keplerlaws'], seasons: ['coords'], precession: ['coords', 'j2'], moonphase: ['coords'], paleomag: ['declination'], tides: ['gravity'],
  keplerlaws: ['gravity'], twobody: ['keplerlaws'], invariants: ['twobody'], visviva: ['twobody'], kepler: ['invariants'], elements: ['kepler', 'coords'], hohmann: ['visviva'], plane: ['elements', 'hohmann'], oberth: ['visviva', 'rocket'],
  soi: ['twobody'], flyby: ['soi', 'hohmann'], lambert: ['kepler', 'hohmann'], j2: ['elements'], cr3bp: ['invariants'], cw: ['twobody', 'kepler'],
  roche: ['gravity', 'tides'], moon: ['roche', 'tides', 'impact'], teq: ['blackbody'], atmos: ['teq', 'visviva'], impact: ['visviva'], hz: ['teq', 'stellar'], transit: ['doppler', 'magnitude'],
  parallax: ['coords'], magnitude: ['blackbody', 'parallax'], doppler: ['blackbody'], sun: ['blackbody', 'gravity'], starbirth: ['gravity', 'blackbody'], stellar: ['sun', 'starbirth', 'magnitude'],
  nucleo: ['stellar'], remnants: ['nucleo', 'visviva'], distladder: ['parallax', 'magnitude'], hubble: ['distladder', 'doppler'], darkmatter: ['keplerlaws', 'distladder'], cmb: ['blackbody', 'hubble'], galaxy: ['hubble', 'darkmatter', 'stellar'], spaceweather: ['declination', 'sun'], vanallen: ['spaceweather'], decay: ['visviva', 'atmos'], debris: ['decay', 'elements'], gps: ['visviva', 'remnants'], gw: ['remnants', 'keplerlaws'], aurora: ['bluesky'], meteor: ['scale'], eht: ['scale'], drake: ['calendar'], hrdiagram: ['blackbody', 'magnitude'], spectral: ['blackbody'], starstruct: ['sun', 'gravity'], stellar: ['sun', 'starbirth', 'magnitude', 'hrdiagram'], exodetect: ['doppler', 'transit'], galaxytypes: ['distladder'], bigbang: ['hubble'], darkenergy: ['hubble', 'darkmatter', 'distladder'], synodic: ['coords', 'keplerlaws'] };

// ---- more concepts: foundations, measuring the sky, planets, stars, galaxies ----
const EXTRA = [
  { id: 'gravity', level: '기초', title: '만유인력', tag: '사과와 달을 같은 법칙으로',
    eq: String.raw`F = \frac{GMm}{r^2},\qquad g = \frac{GM}{r^2}`,
    body: `질량을 가진 모든 것은 서로 당기며, 이 힘을 만유인력이라고 합니다. 그 힘은 두 질량에 비례하고 거리의 제곱에 반비례합니다. 뉴턴은 사과를 떨어뜨리는 힘과 달을 붙잡아 두는 힘이 같은 것임을 보여, 땅과 하늘의 운동을 하나의 법칙으로 설명했습니다. 행성마다 표면 중력이 다른 이유도 이 법칙으로 알 수 있는데, 표면 중력은 행성의 질량에 비례하고 반지름의 제곱에 반비례합니다.`,
    deep: String.raw`G = 6.674×10⁻¹¹ N·m²/kg²는 1798년 캐번디시가 비틀림 저울로 처음 쟀습니다. 구 대칭인 천체 밖에서는 모든 질량이 중심에 모인 것처럼 계산해도 됩니다(셸 정리). 지구 안으로 들어가면 바깥 껍질의 인력은 서로 상쇄되어 중력이 줄어듭니다.`,
    widget(box) { const K = canvas(box, 340, 160), pl = el('select'); for (const [k, M, R2] of [['지구', 5.972e24, 6371], ['달', 7.342e22, 1737], ['화성', 6.417e23, 3390], ['목성', 1.898e27, 71492], ['세레스', 9.39e20, 470]]) pl.append(new Option(k, `${M},${R2}`)); box.append(pl);
      const h = slider(box, '표면에서 높이 (km)', 0, 40000, 10, 400), R = readout(box);
      return () => { clear(K); const [M, R2] = pl.value.split(',').map(Number), r = (R2 + +h.value) * 1e3, g = 6.674e-11 * M / (r * r), g0 = 6.674e-11 * M / (R2 * 1e3) ** 2, G2 = K.g;
        G2.fillStyle = C.teal; G2.fillRect(20, 60, (K.w - 40) * Math.min(1, g / 30), 26); text(G2, `${fmt(g, 2)} m/s²`, 24, 54, C.text, 11); G2.fillStyle = C.mute; G2.fillRect(20, 110, (K.w - 40) * 9.81 / 30, 10); text(G2, '지구 표면 9.81', 24, 136, C.mute, 10);
        R([['표면 중력', `${fmt(g0, 2)} m/s² (지구의 ${fmt(g0 / 9.81, 2)}배)`], ['이 높이의 중력', `${fmt(g, 2)} m/s²`], ['몸무게 60 kg인 사람이 느끼는 무게', `${fmt(60 * g / 9.81, 1)} kg중`]]); }; } },
  { id: 'keplerlaws', level: '기초', title: '케플러의 세 법칙', tag: '타원, 같은 넓이, 주기와 크기',
    eq: String.raw`\frac{T^2}{a^3} = \frac{4\pi^2}{GM}`,
    body: `케플러는 행성 관측 기록을 분석해 행성의 운동을 세 가지 법칙으로 정리했습니다. 첫째, 행성은 태양을 한 초점으로 하는 타원을 그립니다. 둘째, 같은 시간 동안 태양과 행성을 잇는 선이 쓸고 지나가는 넓이는 같아서, 행성은 태양에 가까울 때 빠르게 움직입니다. 셋째, 공전 주기의 제곱은 긴반지름의 세제곱에 비례합니다. 특히 태양 둘레에서는 주기를 년, 긴반지름을 AU로 쓰면 T² = a³이 그대로 성립합니다. 아래 색칠된 부채꼴들은 모두 같은 시간 동안 쓸고 지나간 넓이입니다.`,
    deep: String.raw`케플러는 티코 브라헤의 화성 관측에서 경험적으로 이 법칙들을 찾았고(1609, 1619), 뉴턴이 만유인력으로 유도했습니다. 2법칙은 각운동량 보존 <span class="tex">\tfrac12 r^2\dot\theta = h/2</span>, 3법칙은 원 궤도에서 <span class="tex">GM/r^2 = (2\pi/T)^2 r</span>로 바로 확인됩니다.`,
    widget(box) { const K = canvas(box), es = slider(box, '이심률', 0, 0.8, 0.01, 0.5, (x) => x.toFixed(2)), R = readout(box);
      return () => { const g = K.g; clear(K); const e = +es.value, a = 1, p = a * (1 - e * e), S = 95 / (1 + e), cx = K.w / 2 + e * 50, cy = K.h / 2;
        const pos = (M) => { let E = M; for (let i = 0; i < 12; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E)); const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2)), r = p / (1 + e * Math.cos(nu)); return [cx + S * r * Math.cos(nu), cy - S * r * Math.sin(nu)]; };
        for (let k = 0; k < 12; k++) { g.fillStyle = k % 2 ? 'rgba(79,227,193,.18)' : 'rgba(255,180,84,.18)'; g.beginPath(); g.moveTo(cx, cy); for (let j = 0; j <= 20; j++) g.lineTo(...pos((k + j / 20) / 12 * 2 * Math.PI)); g.closePath(); g.fill(); }
        conic(g, cx, cy, S, p, e); dot(g, cx, cy, 6, C.sun);
        R([['근일점 속도 / 원일점 속도', fmt((1 + e) / (1 - e), 2)], ['부채꼴 12개', '모두 같은 시간 (주기의 1/12)'], ['3법칙 예', '목성 a = 5.2 AU → T = √5.2³ = 11.9년']]); }; } },
  { id: 'parallax', level: '교양', title: '연주 시차로 별까지 거리 재기', tag: '1초각에 1파섹',
    eq: String.raw`d\,[\text{pc}] = \frac{1}{p\,[\text{″}]}`,
    body: `지구가 태양 둘레를 도는 동안 가까운 별은 먼 배경에 대해 조금씩 왔다 갔다 하는데, 그 각도의 절반이 연주 시차 p입니다. 가까운 별일수록 크게 움직이므로, 이 각도를 재면 별까지의 거리를 직접 구할 수 있습니다. 거리는 시차에 반비례해서, p가 1초각(1/3600°)이면 거리가 1 파섹(3.26광년)입니다. 그러나 이 각도는 매우 작아서, 가장 가까운 별 프록시마도 0.77초각밖에 안 되며 별의 시차는 1838년에야 처음 측정되었습니다.`,
    deep: String.raw`작은 각도 근사 <span class="tex">\tan p \approx p = 1\,\text{AU}/d</span>에서 1 pc = 206,265 AU. 히파르코스 위성(1989~1993)은 약 1밀리초각, 가이아는 수십 마이크로초각 정밀도로 18억 개 별의 시차를 쟀습니다. 이것이 우주 거리 사다리의 첫 계단입니다.`,
    widget(box) { const K = canvas(box, 340, 160), ps = slider(box, '시차 p (초각, 로그)', -5, 0, 0.01, -0.11, (x) => (10 ** x).toPrecision(3)), R = readout(box);
      return () => { const g = K.g; clear(K); const p = 10 ** ps.value, d = 1 / p; g.strokeStyle = C.grid; g.beginPath(); g.ellipse(60, 120, 30, 10, 0, 0, 7); g.stroke(); dot(g, 60, 120, 5, C.sun); dot(g, 30, 120, 3, C.blue); dot(g, 90, 120, 3, C.blue);
        const sx = 60, sy = 20; dot(g, sx, sy, 4, C.text); g.strokeStyle = C.amber; g.beginPath(); g.moveTo(30, 120); g.lineTo(sx, sy); g.lineTo(90, 120); g.stroke(); text(g, '별', sx + 6, sy + 4, C.text, 10); text(g, '1월 · 7월의 지구', 100, 124, C.blue, 10);
        R([['거리', `${fmt(d, d < 10 ? 2 : 0)} pc = ${fmt(d * 3.2616, d < 10 ? 2 : 0)}광년`], ['예', '프록시마 0.768″, 시리우스 0.379″, 베텔게우스 약 0.006″'], ['가이아로 잴 수 있는 한계', `약 0.00002″ → ${fmt(1 / 2e-5 / 1000, 0)} kpc`]]); }; } },
  { id: 'doppler', level: '교양', title: '스펙트럼과 도플러 효과', tag: '빛의 색으로 속도를 잰다',
    eq: String.raw`\frac{\Delta\lambda}{\lambda_0} = \frac{v_r}{c}`,
    body: `구급차가 다가올 때와 멀어질 때 사이렌 소리가 달라지듯, 별빛도 별의 움직임에 따라 파장이 달라집니다. 이것이 도플러 효과입니다. 별빛을 프리즘으로 펼치면 원소마다 정해진 파장에 검은 흡수선이 보이는데, 이 선들의 위치가 기준이 됩니다. 별이 우리에게서 멀어지면 선들이 긴 파장(빨간 쪽)으로, 다가오면 짧은 파장(파란 쪽)으로 밀립니다. 그래서 이 어긋남을 재면 시선 방향 속도를 알 수 있습니다. 실제로 쌍성, 외계행성, 은하의 후퇴 속도가 모두 이 방법으로 측정됩니다.`,
    deep: String.raw`빛의 속도에 가까우면 상대론적 식 <span class="tex">1+z = \sqrt{\frac{1+\beta}{1-\beta}}</span>을 씁니다. 먼 은하의 적색편이는 은하가 공간을 달리는 것이 아니라 빛이 오는 동안 공간이 늘어난 결과(우주론적 적색편이)라서 <span class="tex">1+z = a_\text{now}/a_\text{then}</span>입니다. 지금의 분광기는 초속 수십 cm의 별의 흔들림까지 잽니다.`,
    widget(box) { const K = canvas(box, 340, 120), vs = slider(box, '시선 속도 (km/s, +는 멀어짐)', -3000, 3000, 10, 600), R = readout(box);
      return () => { const g = K.g; clear(K); const v = +vs.value, f = 1 + v / 299792.458, X = (l) => 10 + (l - 380) / (760 - 380) * (K.w - 20);
        for (let l = 380; l <= 760; l += 2) { const h = 270 - (l - 380) / 380 * 270; g.fillStyle = `hsl(${h},80%,${l < 420 || l > 700 ? 30 : 50}%)`; g.fillRect(X(l), 20, X(l + 2) - X(l) + 1, 50); }
        for (const [n, l] of [['Hα', 656.28], ['Hβ', 486.13], ['Na', 589.0], ['Hγ', 434.05]]) { const ls = l * f; g.fillStyle = '#000'; g.fillRect(X(ls) - 1, 20, 3, 50); text(g, n, X(ls), 86, C.text, 10, 'center'); g.fillStyle = C.mute; g.fillRect(X(l), 72, 1, 6); }
        text(g, '회색 눈금: 정지했을 때 위치', 10, 110, C.mute, 9);
        R([['Hα 이동', `${fmt(656.28 * (f - 1), 3)} nm`], ['적색편이 z', fmt(v / 299792.458, 5)]]); }; } },
  { id: 'transit', level: '교양', title: '외계행성 찾기: 횡단법', tag: '별빛이 아주 조금 어두워질 때',
    eq: String.raw`\delta = \left(\frac{R_p}{R_\star}\right)^2`,
    body: `행성이 별 앞을 지나가면 별빛이 살짝 어두워지는데, 이를 이용해 외계행성을 찾는 방법이 횡단법입니다. 행성이 별을 가리면 별빛이 행성 단면적만큼 줄어드는데, 단면적은 반지름의 제곱에 비례합니다. 예를 들어 목성이 태양 앞을 지나면 1%, 지구는 0.008%만 어두워집니다. 이렇게 미세한 변화이지만 케플러와 TESS 우주망원경은 이를 잡아내 수천 개의 외계행성을 찾았습니다. 이때 어두워지는 간격은 공전 주기를, 깊이는 행성의 크기를 알려 줍니다.`,
    deep: String.raw`횡단 지속 시간 <span class="tex">t \approx \frac{P}{\pi}\frac{R_\star}{a}</span>(정면 통과), 궤도 기울기가 맞을 확률은 약 <span class="tex">R_\star/a</span>(지구 같은 행성은 0.5%). 시선속도법과 함께 쓰면 질량과 반지름을 모두 알아 밀도(암석인지 기체인지)를 구할 수 있습니다. 횡단 때 별빛이 행성 대기를 지나며 생기는 흡수로 대기 성분도 잽니다(JWST).`,
    widget(box) { const K = canvas(box), rp = slider(box, '행성 반지름 (지구 = 1)', 0.5, 15, 0.1, 11, (x) => x.toFixed(1)), rs = slider(box, '별 반지름 (태양 = 1)', 0.1, 2, 0.01, 1, (x) => x.toFixed(2)), R = readout(box);
      return () => { clear(K); const k = rp.value * 6371 / (rs.value * 696000), depth = k * k, xs = []; for (let t = -2; t <= 2; t += 0.01) xs.push(t);
        const flux = (t) => { const x = Math.abs(t); if (x >= 1 + k) return 1; if (x <= 1 - k) return 1 - depth; const f = (1 + k - x) / (2 * k); return 1 - depth * f; };
        plot(K, xs, [{ ys: xs.map(flux), col: C.amber, label: '별의 밝기' }], { x0: -2, x1: 2, y0: 1 - Math.max(depth * 1.4, 0.0002), y1: 1 + depth * 0.2 + 1e-5, xl: '시간 (통과 중심 = 0)', yd: 4 });
        R([['어두워지는 정도', `${fmt(depth * 100, 4)}%`], ['예', '목성형 1%, 지구형 0.008%, TRAPPIST-1e 약 0.5% (별이 작아서)']]); }; } },
  { id: 'atmos', level: '교양', title: '대기를 붙잡는 힘', tag: '달에 공기가 없는 이유',
    eq: String.raw`v_\text{rms} = \sqrt{\frac{3kT}{m}},\qquad \text{유지 조건 } v_\text{esc} \gtrsim 6\,v_\text{rms}`,
    body: `어떤 행성은 두꺼운 대기를 가졌고 어떤 행성은 거의 없는데, 그 차이는 행성이 기체를 얼마나 붙잡을 수 있는지에 달려 있습니다. 기체 분자는 온도에 따라 빠르게 움직이며, 가벼운 분자일수록, 뜨거울수록 빠릅니다. 그래서 행성의 탈출 속도가 분자 평균 속력보다 충분히 크지 않으면, 수십억 년 동안 그 기체는 우주로 새어 나갑니다. 이 때문에 지구에는 수소가 거의 없고, 탈출 속도가 작은 달과 수성에는 대기가 거의 없으며, 반면에 무거운 목성은 수소를 그대로 붙잡고 있습니다.`,
    deep: String.raw`맥스웰-볼츠만 분포의 빠른 꼬리에 있는 분자가 대기 맨 위(외기권)에서 빠져나가는 것을 진스 탈출이라 합니다. 탈출 속도가 평균 속력의 6배쯤이면 태양계 나이 동안 대부분 남습니다. 화성은 자기장이 약해 태양풍이 대기를 깎아 낸 효과도 컸습니다(MAVEN).`,
    widget(box) { const K = canvas(box, 340, 200), pl = el('select'); for (const [k, ve, T] of [['지구', 11.19, 1000], ['달', 2.38, 390], ['화성', 5.03, 300], ['목성', 59.5, 1000], ['타이탄', 2.64, 95], ['수성', 4.25, 700]]) pl.append(new Option(k, `${ve},${T}`)); box.append(pl);
      const R = readout(box);
      return () => { clear(K); const [ve, T] = pl.value.split(',').map(Number), g = K.g, gases = [['H₂', 2], ['He', 4], ['H₂O', 18], ['N₂', 28], ['O₂', 32], ['CO₂', 44]];
        gases.forEach(([n, m], i) => { const v = Math.sqrt(3 * 1.380649e-23 * T / (m * 1.6605e-27)) / 1000, y = 16 + i * 30, w = (K.w - 110) * Math.min(1, 6 * v / 60); const keep = ve > 6 * v;
          g.fillStyle = keep ? C.teal : C.pink; g.fillRect(70, y, w, 16); text(g, n, 8, y + 12, C.text, 11); text(g, `6×v = ${fmt(6 * v, 1)} km/s ${keep ? '유지' : '샘'}`, 74 + w, y + 12, C.mute, 9); });
        const X = 70 + (K.w - 110) * Math.min(1, ve / 60); g.strokeStyle = C.amber; g.beginPath(); g.moveTo(X, 10); g.lineTo(X, 190); g.stroke(); text(g, `탈출 속도 ${ve}`, X + 3, 196, C.amber, 9);
        R([['외기권 온도 (가정)', `${T} K`], ['읽는 법', '막대(6×평균 속력)가 노란 선(탈출 속도)보다 짧으면 그 기체는 남습니다']]); }; } },
  { id: 'impact', level: '교양', title: '소행성 충돌과 크레이터', tag: '공룡을 멸종시킨 10 km',
    eq: String.raw`E = \tfrac12 m v^2,\qquad D \approx 1.25\times 1.161\left(\frac{\rho_i}{\rho_t}\right)^{1/3}L^{0.78}v^{0.44}g^{-0.22}`,
    body: `소행성은 초속 20 km 안팎으로 부딪히기 때문에, 운동 에너지가 속도의 제곱에 비례해 크기에 비해 엄청난 에너지를 냅니다. 예를 들어 2013년 첼랴빈스크 운석(지름 20 m)은 공중에서 터져 유리창을 깼고, 6,600만 년 전 지름 10 km 천체가 만든 칙술루브 크레이터(지름 약 180 km)는 공룡 멸종을 불렀습니다. 아래에서 크기와 속도를 바꿔 보세요.`,
    deep: String.raw`크레이터 크기 식은 실험과 수치 모의로 얻은 스케일링 법칙(Collins, Melosh, Marcus 2005)의 단순화입니다. 작은 천체는 대기에서 부서지고, 지름 수십 m 이상의 암석질·철질만 땅에 닿습니다. 지구 근접 천체는 NASA CNEOS가 감시하며, 2022년 DART 우주선은 소행성 디모르포스의 궤도를 실제로 바꿨습니다.`,
    widget(box) { const K = canvas(box, 340, 120), Ls = slider(box, '지름 (m, 로그)', 0, 4.3, 0.01, 1.3, (x) => fmt(10 ** x, 0)), vs = slider(box, '속도 (km/s)', 11, 72, 0.5, 19), R = readout(box);
      return () => { clear(K); const L = 10 ** Ls.value, v = vs.value * 1e3, m = 3000 * Math.PI / 6 * L ** 3, E = 0.5 * m * v * v, Mt = E / 4.184e15, D = 1.25 * 1.161 * Math.cbrt(3000 / 2500) * L ** 0.78 * v ** 0.44 * 9.81 ** -0.22, g = K.g;
        const X = (e) => 10 + (Math.log10(e) + 3) / 12 * (K.w - 20); for (const [n, e] of [['히로시마 0.015', 0.015], ['첼랴빈스크 0.5', 0.5], ['퉁구스카 10', 10], ['차르 봄바 50', 50], ['칙술루브 1억', 1e8]]) { dot(g, X(e), 50, 3, C.mute); text(g, n, X(e), 40, C.mute, 9, 'center'); }
        dot(g, X(Math.max(1e-3, Mt)), 50, 6, C.pink); text(g, 'TNT 메가톤 (로그)', K.w / 2, 100, C.mute, 9, 'center');
        R([['에너지', `${E.toExponential(2)} J = TNT ${Mt < 1 ? fmt(Mt * 1000, 1) + '킬로톤' : fmt(Mt, Mt < 100 ? 1 : 0) + '메가톤'}`], ['크레이터 지름 (땅에 닿을 때)', L < 25 ? '대기에서 부서질 가능성이 큼' : D > 4000 ? `약 ${fmt(D / 1000, 0)} km (복합 크레이터)` : `약 ${fmt(D, 0)} m`]]); }; } },
  { id: 'sun', level: '교양', title: '태양의 에너지와 구조', tag: '1초에 4백만 톤이 빛이 된다',
    eq: String.raw`4\,{}^1\text{H} \to {}^4\text{He} + 2e^+ + 2\nu_e + 26.7\,\text{MeV},\quad E = mc^2`,
    body: `태양은 중심에서 일어나는 수소 핵융합으로 빛과 열을 냅니다. 태양 중심(1,500만 K)에서는 수소 4개가 헬륨 1개로 합쳐지며, 이때 질량의 0.7%가 에너지로 바뀝니다. 그 규모는 엄청나서 태양은 1초에 약 6억 톤의 수소를 태우고, 그중 400만 톤이 빛이 됩니다. 이렇게 중심에서 만들어진 에너지는 복사층에서 수없이 흡수·방출되며 수만 년이 걸려 표면에 닿고, 표면에서 지구까지는 8분 20초면 옵니다.`,
    deep: String.raw`양성자끼리는 전기적으로 밀어내지만 양자 터널 효과로 확률적으로 붙습니다(pp 연쇄 반응). 복사층에서 광자의 평균 자유 경로 ℓ가 짧아 무작위 걸음 <span class="tex">N \approx (R/\ell)^2</span>번을 거칩니다. 태양 중성미자는 이를 거치지 않고 곧장 나와, 지하 검출기로 중심부 반응을 직접 확인했습니다.`,
    widget(box) { const K = canvas(box, 340, 180), mfp = slider(box, '복사층 광자의 평균 자유 경로 (cm, 로그)', -3, 1, 0.01, -1.6, (x) => (10 ** x).toPrecision(2)), R = readout(box);
      return () => { const g = K.g; clear(K); const cx = 90, cy = 90; for (const [r, c, n] of [[80, '#e0703a', '대류층'], [57, '#f5a14a', '복사층'], [20, '#fff1b0', '중심핵']]) { g.fillStyle = c; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill(); }
        text(g, '중심핵 1,500만 K', 180, 40, C.text, 10); text(g, '복사층 (0.25~0.7 R)', 180, 70, C.text, 10); text(g, '대류층 (0.7~1 R)', 180, 100, C.text, 10); text(g, '광구 5,772 K', 180, 130, C.text, 10);
        const L2 = 10 ** mfp.value / 100, Rr = 0.45 * 6.96e8, N = (Rr / L2) ** 2, t = N * L2 / 3e8 / 3.156e7;
        R([['수소 소비', '초당 약 6억 톤'], ['질량 → 빛', '초당 약 426만 톤 (L = 3.83×10²⁶ W)'], ['복사층 통과 시간 (무작위 걸음)', `약 ${t > 1e6 ? fmt(t / 1e6, 1) + '백만' : fmt(t, 0)}년`]]); }; } },
  { id: 'starbirth', level: '교양', title: '별의 탄생', tag: '차갑고 짙은 가스구름이 무너질 때',
    eq: String.raw`M_J \approx \left(\frac{5kT}{G\mu m_H}\right)^{3/2}\left(\frac{3}{4\pi\rho}\right)^{1/2}`,
    body: `별은 성간 분자구름에서 태어납니다. 구름 속 가스의 열운동(압력)은 구름을 퍼지게 하고 중력은 모이게 하는데, 중력이 이기면 구름이 무너지며 뭉칩니다. 그 경계가 되는 질량이 <b>진스 질량</b>입니다. 진스 질량은 구름이 차갑고 빽빽할수록 작아져서, 작은 덩어리도 무너질 수 있습니다. 이 때문에 별은 한 구름에서 무리 지어 태어나며, 오리온 성운과 플레이아데스가 그 예입니다.`,
    deep: String.raw`비리얼 정리 <span class="tex">2K + U = 0</span>에서 출발해 열에너지 <span class="tex">\tfrac32 NkT</span>와 중력 에너지 <span class="tex">-\tfrac35 GM^2/R</span>를 비교하면 진스 조건이 나옵니다. 붕괴하는 원시성은 각운동량 때문에 원반을 만들고, 그 원반에서 행성이 생깁니다(ALMA가 찍은 HL 타우리의 원반).`,
    widget(box) { const K = canvas(box, 340, 120), Ts = slider(box, '온도 (K)', 5, 100, 1, 10), ns = slider(box, '수밀도 (개/cm³, 로그)', 1, 7, 0.01, 4, (x) => fmt(10 ** x, 0)), R = readout(box);
      return () => { clear(K); const T = +Ts.value, n = 10 ** ns.value, mu = 2.33, rho = n * 1e6 * mu * 1.6726e-27, MJ = Math.pow(5 * 1.380649e-23 * T / (6.674e-11 * mu * 1.6726e-27), 1.5) * Math.sqrt(3 / (4 * Math.PI * rho)) / 1.989e30, g = K.g;
        const X = (m) => 10 + (Math.log10(m) + 2) / 7 * (K.w - 20); for (const [nn, m] of [['갈색왜성 0.08', 0.08], ['태양 1', 1], ['O형 별 50', 50], ['성단 1,000', 1000], ['거대 분자구름 10만', 1e5]]) { dot(g, X(m), 50, 3, C.mute); text(g, nn, X(m), 40, C.mute, 9, 'center'); }
        dot(g, X(Math.max(0.01, Math.min(1e5, MJ))), 50, 6, C.teal); text(g, '진스 질량 (태양질량, 로그)', K.w / 2, 100, C.mute, 9, 'center');
        R([['진스 질량', `${MJ < 10 ? fmt(MJ, 2) : fmt(MJ, 0)} 태양질량`], ['붕괴 시간 (자유 낙하)', `약 ${fmt(Math.sqrt(3 * Math.PI / (32 * 6.674e-11 * rho)) / 3.156e13, 2)}백만 년`]]); }; } },
  { id: 'nucleo', level: '교양', title: '원소의 기원과 초신성', tag: '우리는 별의 재로 만들어졌다',
    eq: String.raw`\frac{B}{A}\ \text{최대: } {}^{56}\text{Fe},\ {}^{62}\text{Ni}\ (\approx 8.8\,\text{MeV/핵자})`,
    body: `우리 몸의 탄소와 피 속의 철은 어디에서 왔을까요? 빅뱅은 수소와 헬륨(그리고 약간의 리튬)만 만들었고, 탄소, 산소부터 철까지는 별 속 핵융합이 만들었습니다. 그런데 철에서 핵자당 결합 에너지가 가장 커서, 그 너머로는 핵융합이 에너지를 내지 않습니다. 그래서 철보다 무거운 원소는 다른 길로 생겼는데, 초신성 폭발과 중성자별 충돌 속 빠른 중성자 포획(r 과정)과 늙은 거성 속 느린 포획(s 과정)이 그것입니다.`,
    deep: String.raw`결합 에너지 곡선은 준경험적 질량 공식 <span class="tex">B = a_vA - a_sA^{2/3} - a_c\frac{Z^2}{A^{1/3}} - a_a\frac{(A-2Z)^2}{A} \pm \delta</span>로 대략 그릴 수 있습니다. 철 핵이 1.4 M☉을 넘으면 1초도 안 되어 붕괴해 핵붕괴 초신성이 됩니다. 2017년 중성자별 충돌(GW170817)에서 금·백금 같은 r 과정 원소가 생긴 흔적이 관측되었습니다.`,
    widget(box) { const K = canvas(box), As = slider(box, '질량수 A', 2, 238, 1, 56), R = readout(box);
      const BA = (A) => { const Z = A / (1.98 + 0.0155 * A ** (2 / 3)); return (15.75 * A - 17.8 * A ** (2 / 3) - 0.711 * Z * Z / A ** (1 / 3) - 23.7 * (A - 2 * Z) ** 2 / A) / A; };
      const NAME = { 4: '헬륨', 12: '탄소', 16: '산소', 28: '규소', 56: '철', 63: '구리', 107: '은', 197: '금', 208: '납', 238: '우라늄' };
      return () => { clear(K); const xs = []; for (let A = 4; A <= 240; A++) xs.push(A); const P = plot(K, xs, [{ ys: xs.map(BA), col: C.teal, label: '핵자당 결합 에너지 (근사)' }], { x0: 4, x1: 240, y0: 6.5, y1: 9.2, xl: '질량수 A', yl: 'MeV', yd: 1 });
        const A = +As.value; dot(K.g, P.X(A), P.Y(BA(A)), 5, C.amber); const nm = NAME[A] || Object.entries(NAME).sort((a, b) => Math.abs(a[0] - A) - Math.abs(b[0] - A))[0][1] + ' 근처';
        R([['원소', nm], ['만드는 곳', A <= 7 ? '빅뱅' : A <= 56 ? '별 속 핵융합' : A <= 209 ? '거성의 s 과정, 초신성·중성자별 충돌의 r 과정' : '주로 r 과정 (중성자별 충돌)']]); }; } },
  { id: 'darkmatter', level: '교양', title: '은하 회전 곡선과 암흑 물질', tag: '보이는 것보다 훨씬 무겁다',
    eq: String.raw`v(r) = \sqrt{\frac{G M(\lt r)}{r}}`,
    body: `은하에 별과 가스만 있다면, 은하 바깥쪽 별은 태양계 바깥 행성처럼 느리게 돌아야 합니다. 그런데 실제로는 바깥까지 거의 같은 속도로 도는 평평한 회전 곡선이 관측됩니다. 이는 보이지 않는 질량이 은하를 감싸며 바깥까지 계속 늘어난다는 뜻으로, 암흑 물질의 가장 직접적인 증거입니다. 이 사실은 1970년대 베라 루빈이 확립했습니다.`,
    deep: String.raw`평평한 곡선은 <span class="tex">M(\lt r) \propto r</span>, 즉 밀도 <span class="tex">\rho \propto r^{-2}</span>인 헤일로를 뜻합니다. 은하단의 중력 렌즈, 우주 배경 복사의 요동, 총알 은하단도 같은 결론을 줍니다. 우주 전체 에너지의 약 27%가 암흑 물질, 5%가 보통 물질입니다. 정체는 아직 모릅니다.`,
    widget(box) { const K = canvas(box), hs = slider(box, '암흑 물질 헤일로 세기', 0, 2, 0.01, 1), R = readout(box);
      return () => { clear(K); const xs = []; for (let r = 0.2; r <= 30; r += 0.2) xs.push(r);
        const vis = (r) => { const Mb = 1.5e10 * r ** 2 / (r + 0.6) ** 2, Md = 6e10 * (1 - (1 + r / 3) * Math.exp(-r / 3)); return Math.sqrt(4.30e-6 * (Mb + Md) / r); }; // kpc, Msun, km/s
        const halo = (r) => Math.sqrt(4.30e-6 * hs.value * 9.5e11 * (Math.log(1 + r / 16) - (r / 16) / (1 + r / 16)) / (Math.log(1 + 12) - 12 / 13) / r) * 1; // NFW, c ~ 12
        const P = plot(K, xs, [{ ys: xs.map(vis), col: C.amber, label: '보이는 물질만' }, { ys: xs.map(r => Math.hypot(vis(r), halo(r))), col: C.teal, label: '보이는 물질 + 암흑 물질' }], { x0: 0, x1: 30, y0: 0, y1: 320, xl: '은하 중심에서 거리 (kpc)', yl: 'km/s', yd: 0 });
        dot(K.g, P.X(8.2), P.Y(230), 4, C.pink); text(K.g, '태양 (8.2 kpc, 230 km/s)', P.X(8.2) + 5, P.Y(230) - 5, C.pink, 9);
        R([['태양 위치 속도 (모형)', `${fmt(Math.hypot(vis(8.2), halo(8.2)), 0)} km/s`], ['보이는 물질만이라면', `${fmt(vis(8.2), 0)} km/s`]]); }; } },
  { id: 'distladder', level: '교양', title: '우주 거리 사다리', tag: '한 계단씩 더 멀리',
    eq: String.raw`\text{레이더} \to \text{시차} \to \text{세페이드} \to \text{Ia형 초신성} \to \text{허블 법칙}`,
    body: `우주의 거리는 한 가지 방법으로 끝까지 잴 수 없습니다. 그래서 여러 측정법을 계단처럼 이어 가까운 계단으로 다음 계단의 기준을 맞추는데, 이를 우주 거리 사다리라고 합니다. 예를 들어 태양계는 레이더로, 가까운 별은 시차로 잽니다. 그 거리로 밝기를 맞춘 세페이드 변광성(주기-광도 관계)으로 가까운 은하를, 세페이드로 맞춘 Ia형 초신성으로 먼 은하를 재고, 그 너머는 허블 법칙으로 잽니다. 아래 계단마다 닿는 거리를 보세요.`,
    deep: String.raw`헨리에타 레빗(1912)이 소마젤란은하의 세페이드에서 주기-광도 관계를 발견했습니다. Ia형 초신성은 백색왜성이 찬드라세카르 한계 부근에서 폭발해 최대 밝기가 거의 일정합니다(M ≈ −19.3). 각 계단의 오차가 다음 계단으로 전해지므로, 허블 상수 논쟁은 이 사다리의 보정 문제이기도 합니다.`,
    widget(box) { const K = canvas(box, 340, 210), R = readout(box);
      return () => { const g = K.g; clear(K); const X = (pc) => 70 + (Math.log10(pc) + 6) / 16 * (K.w - 80), rows = [['레이더', 1e-6, 1e-4], ['연주 시차', 1, 1e4], ['세페이드', 1e3, 4e7], ['Ia 초신성', 1e6, 3e9], ['허블 법칙', 1e7, 1.4e10]];
        rows.forEach(([n, a, b], i) => { const y = 20 + i * 34; g.fillStyle = [C.blue, C.teal, C.amber, C.pink, '#c9d1e6'][i]; g.fillRect(X(a), y, X(b) - X(a), 18); text(g, n, 4, y + 13, C.text, 11); });
        for (const [n, pc] of [['태양', 4.8e-6], ['프록시마', 1.3], ['은하 중심', 8200], ['안드로메다', 7.7e5], ['처녀자리 은하단', 1.65e7]]) { g.strokeStyle = C.grid; g.beginPath(); g.moveTo(X(pc), 14); g.lineTo(X(pc), 190); g.stroke(); text(g, n, X(pc), 204, C.mute, 9, 'center'); }
        R([['가로축', '파섹 (로그 눈금, 10⁻⁶ ~ 10¹⁰)']]); }; } },
];

// ---- one check question per concept: number (with tolerance) or choice ----
const QUIZ = {
  hrdiagram: { q: 'H-R도에서 온도가 같은데 위쪽(더 밝은 쪽)에 있는 별은?', opts: ['더 작다', '더 크다', '더 가깝다'], a: 1, why: 'L = 4πR²σT⁴이라 온도가 같으면 밝을수록 반지름이 큽니다. 거리는 광도와 무관합니다.' },
  spectral: { q: '수소 흡수선이 가장 강한 분광형은?', opts: ['O형', 'A형', 'M형'], a: 1, why: '약 1만 K의 A형에서 수소가 가장 잘 들떠 흡수선이 가장 강합니다.' },
  starstruct: { q: '태양의 바깥 30%에서 에너지는 주로 어떻게 전달될까요?', opts: ['복사', '대류', '전도'], a: 1, why: '태양은 안쪽 70%가 복사층, 바깥 30%가 대류층입니다.' },
  exodetect: { q: '시선 속도법으로 가장 찾기 쉬운 행성은?', opts: ['별에 가깝고 무거운 행성', '별에서 멀고 가벼운 행성', '크기만 큰 행성'], a: 0, why: '무겁고 가까울수록 별을 크게 흔들어 도플러 이동이 커집니다.' },
  galaxytypes: { q: '우리 은하는 어떤 은하일까요?', opts: ['타원 은하', '막대 나선 은하', '불규칙 은하'], a: 1, why: '중심에 막대가 있는 나선 은하(SBbc 정도)입니다.' },
  bigbang: { q: '빅뱅 우주론의 증거가 아닌 것은?', opts: ['우주 배경 복사', '수소와 헬륨의 질량비 약 3:1', '별의 연주 시차'], a: 2, why: '연주 시차는 지구 공전의 증거이자 거리 측정법입니다.' },
  darkenergy: { q: '지금 우주에서 보통 물질이 차지하는 비율은 약?', opts: ['5%', '26%', '69%'], a: 0, why: '보통 물질 약 5%, 암흑 물질 약 26%, 암흑 에너지 약 69%입니다.' },
  synodic: { q: '외행성이 역행하는 때는?', opts: ['충 무렵', '합 무렵', '언제나'], a: 0, why: '지구가 외행성을 안쪽에서 앞지르는 충 무렵 역행합니다.' },
  scale: { q: '태양빛이 지구까지 오는 데 걸리는 시간은?', opts: ['8초', '약 8분', '약 8시간'], a: 1, why: '1억 5천만 km ÷ 초속 30만 km ≈ 500초 ≈ 8분 20초입니다.' },
  bluesky: { q: '파장이 절반인 빛은 몇 배 더 잘 흩어질까요?', a: 16, unit: '배', why: '(1/2)⁻⁴ = 16배입니다.' },
  aurora: { q: '오로라의 초록빛을 내는 원소는?', opts: ['질소', '산소', '수소'], a: 1, why: '높이 100~200 km의 산소 원자가 557.7 nm 초록빛을 냅니다.' },
  meteor: { q: '유성이 대기에 들어오는 가장 느린 속도는 대략?', opts: ['1 km/s', '11 km/s', '72 km/s'], a: 1, why: '지구 중력에 끌려 적어도 탈출 속도 11.2 km/s가 됩니다.' },
  drake: { q: '드레이크 방정식에서 관측으로 가장 잘 알려진 항은?', opts: ['f_p (행성 있는 별의 비율)', 'f_i (지적 생명 확률)', 'L (문명 지속 시간)'], a: 0, why: '외계행성 탐사로 대부분의 별에 행성이 있다는 것이 밝혀졌습니다.' },
  calendar: { q: '우주 달력에서 인류가 등장하는 날은?', opts: ['12월 1일', '12월 25일', '12월 31일'], a: 2, why: '30만 년은 달력에서 약 11분, 12월 31일 밤 늦게입니다.' },
  microg: { q: '높이 420 km에서 중력은 지상의 몇 %일까요?', a: 88.5, tol: 1.5, unit: '%', why: '(6371/6791)² ≈ 0.885입니다.' },
  eht: { q: '같은 파장에서 망원경 지름을 10배로 하면 분해능 각도는?', opts: ['10배 커짐', '10분의 1로 작아짐', '그대로'], a: 1, why: 'θ ∝ λ/D이므로 D가 10배면 θ는 1/10, 10배 더 작은 것을 구별합니다.' },
  coords: { q: '위도 37.5°인 서울에서 하늘의 북극(북극성 근처)은 지평선 위 몇 도에 있을까요?', a: 37.5, tol: 1, unit: '°', why: '천구 북극의 고도는 관측지의 위도와 같습니다.' },
  eot: { q: '1년 중 균시차가 가장 큰 때는 약 몇 분일까요?', a: 16, tol: 1.5, unit: '분', why: '11월 초 약 +16.4분, 2월 중순 약 −14.2분입니다.' },
  seasons: { q: '북반구에서 지구가 태양에 가장 가까운 때(근일점)는 언제일까요?', opts: ['1월 초', '4월 초', '7월 초', '10월 초'], a: 0, why: '근일점은 1월 3~4일 무렵입니다. 계절은 거리 때문이 아니라 자전축 기울기 때문입니다.' },
  precession: { q: '약 1만 2천 년 뒤 북극 근처에 올 밝은 별은?', opts: ['시리우스', '베가', '카펠라', '아크투루스'], a: 1, why: '세차 운동으로 하늘의 북극이 거문고자리 베가 근처로 갑니다.' },
  moonphase: { q: '월식이 일어날 수 있는 달의 위상은?', opts: ['삭', '상현', '망(보름)', '하현'], a: 2, why: '지구가 해와 달 사이에 있어야 하므로 보름달일 때만 일어납니다.' },
  declination: { q: '서울의 자기 편각이 −9°(서편각)라면, 나침반 바늘이 가리키는 북쪽에서 진북은 어느 쪽으로 몇 도일까요?', opts: ['동쪽으로 9°', '서쪽으로 9°', '같다', '남쪽'], a: 0, why: '바늘이 진북보다 9° 서쪽을 가리키므로, 진북은 바늘에서 동쪽(시계 방향)으로 9°입니다.' },
  paleomag: { q: '가장 최근의 지자기 역전(브뤼느-마쓰야마 경계)은 약 몇 만 년 전일까요?', a: 77, tol: 3, unit: '만 년 전', why: '약 77만 3천 년 전입니다.' },
  tides: { q: '태양의 조석력은 달의 약 몇 %일까요?', a: 46, tol: 4, unit: '%', why: '태양은 훨씬 무겁지만 조석력이 거리의 세제곱에 반비례해 달의 약 46%입니다.' },
  gravity: { q: '지구에서 반지름이 같고 질량이 2배인 행성의 표면 중력은 지구의 몇 배일까요?', a: 2, tol: 0.05, unit: '배', why: 'g = GM/r², 반지름이 같으면 질량에 비례합니다.' },
  keplerlaws: { q: '긴반지름이 4 AU인 궤도의 공전 주기는 몇 년일까요?', a: 8, tol: 0.1, unit: '년', why: 'T² = a³ → T = √64 = 8년.' },
  twobody: { q: '원 궤도 속도로 던진 것을 √2배 빠르게 던지면 궤도는?', opts: ['더 큰 원', '타원', '포물선 (탈출)', '떨어짐'], a: 2, why: '√2배는 탈출 속도라 포물선이 됩니다.' },
  invariants: { q: '타원 궤도의 비에너지 ε가 −μ/(2a)일 때, 긴반지름이 2배가 되면 ε는?', opts: ['2배', '절반 (0에 가까워짐)', '그대로', '4배'], a: 1, why: 'ε ∝ −1/a 이므로 절반이 되어 0에 가까워집니다(덜 묶임).' },
  visviva: { q: '1 AU에서 원 궤도 속도가 29.8 km/s일 때 탈출 속도는 약 몇 km/s일까요?', a: 42.1, tol: 0.5, unit: 'km/s', why: 'v_esc = √2 × 29.8 ≈ 42.1 km/s.' },
  kepler: { q: '이심률이 0이면 E와 M의 관계는?', opts: ['E = M', 'E = 2M', 'E = M/2', 'E = 0'], a: 0, why: 'e = 0이면 M = E − 0이므로 같습니다(원 궤도에서는 고르게 움직임).' },
  elements: { q: '경사각 i가 90°보다 큰 궤도는?', opts: ['순행 궤도', '역행 궤도', '적도 궤도', '극궤도'], a: 1, why: '90°를 넘으면 자전 방향과 반대로 도는 역행 궤도입니다. 태양동기 궤도(약 98°)가 그 예입니다.' },
  rocket: { q: 'I_sp 300초인 로켓의 질량비가 e(약 2.72)일 때 Δv는 약 몇 km/s일까요?', a: 2.94, tol: 0.1, unit: 'km/s', why: 'Δv = I_sp g₀ ln(e) = 300 × 9.81 ≈ 2.94 km/s.' },
  hohmann: { q: '호만 전이는 분사를 몇 번 할까요?', a: 2, tol: 0, unit: '번', why: '출발 궤도에서 한 번, 도착 궤도에서 한 번입니다.' },
  plane: { q: '7.8 km/s로 도는 위성이 궤도면을 60° 바꾸려면 Δv는 몇 km/s일까요?', a: 7.8, tol: 0.2, unit: 'km/s', why: '2v sin(30°) = v = 7.8 km/s. 새로 발사하는 것과 비슷합니다.' },
  oberth: { q: '같은 Δv라면 어디서 분사해야 에너지를 가장 많이 얻을까요?', opts: ['원일점', '근일점', '어디서나 같다', '궤도 밖'], a: 1, why: '가장 빠를 때(근일점) 분사해야 v·Δv가 커집니다.' },
  soi: { q: '달은 지구의 영향권(약 92만 km) 안에 있을까요?', opts: ['안에 있다', '밖에 있다'], a: 0, why: '달까지 38만 km라 영향권 안이므로 지구 중심으로 계산해도 됩니다.' },
  flyby: { q: '플라이바이에서 행성 기준 속력 v∞는 들어올 때와 나갈 때 어떻게 될까요?', opts: ['커진다', '작아진다', '같다'], a: 2, why: '행성 기준으로는 에너지 보존이라 같고, 방향만 바뀝니다. 태양 기준 속도가 바뀝니다.' },
  lambert: { q: '램버트 문제에서 주어지는 것이 아닌 것은?', opts: ['출발 위치', '도착 위치', '비행 시간', '출발 속도'], a: 3, why: '출발 속도는 구하려는 답입니다.' },
  j2: { q: '태양동기 궤도의 경사각은 대략?', opts: ['약 28°', '약 63°', '약 98°', '0°'], a: 2, why: '저궤도에서 약 97~99°의 역행 궤도여야 궤도면이 1년에 한 바퀴 돕니다.' },
  cr3bp: { q: '안정한 라그랑주점은?', opts: ['L1과 L2', 'L3', 'L4와 L5', '모두'], a: 2, why: 'L4, L5는 질량비가 충분히 작으면 안정합니다(트로이 소행성).' },
  cw: { q: '정거장 바로 뒤에서 정거장 쪽(앞)으로 밀면 우주선은 처음에 어떻게 움직일까요?', opts: ['곧장 다가간다', '위로 떠오르며 뒤처진다', '아래로 떨어진다', '멈춘다'], a: 1, why: '속도가 늘면 궤도가 커져(높아져) 결국 더 느리게 돌아 뒤처집니다.' },
  roche: { q: '토성 고리가 위성으로 뭉치지 못한 가장 큰 이유는?', opts: ['너무 차가워서', '로슈 한계 안에 있어서', '태양풍 때문에', '너무 가벼워서'], a: 1, why: '조석력이 자기 중력보다 커서 뭉치지 못합니다.' },
  moon: { q: '달은 지금 해마다 지구에서 몇 cm씩 멀어질까요?', a: 3.8, tol: 0.3, unit: 'cm', why: '달 레이저 반사 측정으로 약 3.82 cm/년.' },
  teq: { q: '반사율 0.3인 지구의 평형 온도는 약 몇 °C일까요?', a: -18, tol: 3, unit: '°C', why: '약 255 K = −18 °C. 실제 평균 15 °C와의 차이가 온실 효과입니다.' },
  hz: { q: '밝기가 태양의 4배인 별의 생명 가능 지대 거리는 태양의 몇 배일까요?', a: 2, tol: 0.05, unit: '배', why: '거리는 √L에 비례하므로 √4 = 2배.' },
  blackbody: { q: '표면 온도 5,800 K인 별의 가장 센 빛의 파장은 약 몇 nm일까요?', a: 500, tol: 15, unit: 'nm', why: '2898 μm·K / 5800 K ≈ 0.50 μm = 500 nm.' },
  magnitude: { q: '5등급 차이는 밝기로 몇 배일까요?', a: 100, tol: 1, unit: '배', why: '포그슨의 정의로 정확히 100배입니다.' },
  parallax: { q: '연주 시차가 0.1초각인 별까지 거리는 몇 파섹일까요?', a: 10, tol: 0.1, unit: 'pc', why: 'd = 1/p = 10 pc.' },
  doppler: { q: '656.3 nm의 Hα선이 657.0 nm로 보였다면 별은?', opts: ['다가온다', '멀어진다', '정지'], a: 1, why: '긴 파장으로 밀렸으니(적색편이) 멀어지는 중이며 약 320 km/s입니다.' },
  transit: { q: '목성 크기(태양 반지름의 1/10) 행성이 태양 같은 별을 가리면 몇 % 어두워질까요?', a: 1, tol: 0.1, unit: '%', why: '(1/10)² = 1%.' },
  atmos: { q: '달에 대기가 거의 없는 주된 이유는?', opts: ['너무 차가워서', '탈출 속도가 작아서', '자기장이 강해서', '너무 멀어서'], a: 1, why: '탈출 속도가 2.4 km/s로 작아 기체 분자가 쉽게 빠져나갑니다.' },
  impact: { q: '같은 크기의 소행성이 2배 빨리 부딪히면 에너지는 몇 배일까요?', a: 4, tol: 0.05, unit: '배', why: 'E = ½mv²이므로 4배.' },
  sun: { q: '태양 핵융합에서 수소 질량의 몇 %가 에너지로 바뀔까요?', a: 0.7, tol: 0.1, unit: '%', why: '수소 4개 → 헬륨 1개에서 약 0.7%의 질량이 사라집니다.' },
  starbirth: { q: '분자구름이 더 차가워지면 진스 질량은?', opts: ['커진다', '작아진다', '그대로'], a: 1, why: 'M_J ∝ T^{3/2}이라 차가울수록 작은 덩어리도 무너집니다.' },
  stellar: { q: '태양보다 10배 무거운 별의 주계열 수명은 태양의 약 몇 분의 1일까요?', a: 316, tol: 30, unit: '분의 1', why: 't ∝ M^−2.5 → 10^2.5 ≈ 316분의 1(약 3천만 년).' },
  nucleo: { q: '핵융합으로 에너지를 낼 수 있는 가장 무거운 쪽 원소는?', opts: ['탄소', '산소', '철', '우라늄'], a: 2, why: '철 근처에서 핵자당 결합 에너지가 가장 크기 때문입니다.' },
  remnants: { q: '태양 질량 블랙홀의 사건의 지평선 반지름은 약 몇 km일까요?', a: 3, tol: 0.1, unit: 'km', why: 'r_s = 2GM/c² ≈ 2.95 km.' },
  hubble: { q: 'H₀ = 70 km/s/Mpc일 때 200 Mpc 떨어진 은하의 후퇴 속도는 몇 km/s일까요?', a: 14000, tol: 100, unit: 'km/s', why: 'v = 70 × 200 = 14,000 km/s.' },
  distladder: { q: '안드로메다 은하까지 거리를 재는 데 쓰는 계단은?', opts: ['레이더', '연주 시차', '세페이드 변광성', '허블 법칙'], a: 2, why: '77만 pc는 시차로는 너무 멀고 허블 법칙으로는 너무 가까워, 세페이드를 씁니다(허블, 1924).' },
  darkmatter: { q: '평평한 회전 곡선은 은하의 질량 분포가 어떻다는 뜻일까요?', opts: ['중심에 몰려 있다', '바깥까지 질량이 계속 늘어난다', '질량이 없다'], a: 1, why: 'v가 일정하면 M(&lt;r) ∝ r로 바깥까지 보이지 않는 질량이 늘어납니다.' },
  cmb: { q: '우주 배경 복사가 나올 때(z ≈ 1,100) 온도는 약 몇 K일까요?', a: 3000, tol: 100, unit: 'K', why: '2.7255 × 1,101 ≈ 3,000 K.' },
  galaxy: { q: '우주의 별 생성이 가장 활발했던 때는 약 몇십억 년 전일까요?', a: 10, tol: 1, unit: '십억 년 전', why: '적색편이 약 2(우주 나이 약 33억 년), 즉 약 100억 년 전입니다.' },
  spaceweather: { q: '태양풍이 세지면 자기권계면은 지구에 어떻게 될까요?', opts: ['멀어진다', '가까워진다', '그대로다'], a: 1, why: '동압 ρv²가 커지면 균형점이 지구 쪽으로 밀려듭니다.' },
  vanallen: { q: '국제우주정거장(약 420 km)은 밴앨런대의 어디에 있을까요?', opts: ['안쪽 대 속', '바깥 대 속', '두 대 아래'], a: 2, why: '안쪽 대는 약 1.2 지구 반지름(높이 1,000 km 남짓)부터라 ISS는 그 아래입니다. 남대서양 이상 지역에서만 잠깐 스칩니다.' },
  decay: { q: '태양 활동이 활발할 때 저궤도 위성은?', opts: ['더 오래 머문다', '더 빨리 떨어진다', '영향 없다'], a: 1, why: '열을 받은 상층 대기가 부풀어 같은 높이의 밀도가 커지기 때문입니다.' },
  debris: { q: '초속 10 km로 부딪히는 1 cm 알루미늄 조각의 위험이 큰 이유는?', opts: ['무거워서', '운동 에너지가 커서', '뜨거워서'], a: 1, why: '½mv²에서 속도가 매우 커서 작은 조각도 수류탄 정도의 에너지를 가집니다.' },
  gps: { q: 'GPS 위성 시계는 지상보다 하루에 약 몇 마이크로초 빨리 갈까요?', a: 38, tol: 2, unit: 'μs', why: '중력 효과 +45.7 μs, 속도 효과 −7.2 μs로 합 약 +38.5 μs입니다.' },
  gw: { q: '두 블랙홀이 합쳐지기 직전 중력파 주파수는?', opts: ['낮아진다', '높아진다', '일정하다'], a: 1, why: '가까워질수록 빨리 돌아 주파수가 치솟는 처프 신호가 됩니다.' },
};

// ---- near-Earth space: the environment satellites and astronauts live in ----
const SPACEENV = [
  { id: 'spaceweather', level: '교양', title: '우주 날씨: 태양풍과 지구 자기권', tag: '지구를 감싼 보이지 않는 방패',
    eq: String.raw`r_{mp} \approx \left(\frac{B_0^2}{\mu_0\,\rho v^2}\right)^{1/6} R_\oplus`,
    body: `태양 활동이 지구 주변 환경을 바꾸는 것을 우주 날씨라고 합니다. 태양은 초속 수백 km의 전하 입자 흐름인 태양풍을 끊임없이 내뿜고, 지구 자기장은 이를 밀어내 낮 쪽으로 약 10 지구 반지름 거리에 경계(자기권계면)를 만듭니다. 그런데 태양 폭발(코로나 질량 방출)로 태양풍이 세지면 이 경계가 지구 쪽으로 밀려듭니다. 경계가 정지궤도(6.6 지구 반지름) 안까지 들어오면 위성이 태양풍에 그대로 노출되고, 오로라가 낮은 위도까지 내려옵니다.`,
    deep: String.raw`경계는 태양풍의 동압 <span class="tex">\rho v^2</span>과 지구 자기 압력 <span class="tex">B^2/2\mu_0</span>(쌍극자라 <span class="tex">\propto r^{-6}</span>)이 같아지는 곳입니다. 1859년 캐링턴 사건 같은 큰 자기 폭풍은 전력망과 위성에 피해를 줄 수 있어, NOAA와 한국 우주전파센터가 우주 날씨를 예보합니다. 2024년 5월 폭풍 때는 한국에서도 오로라가 사진에 찍혔습니다.`,
    widget(box) { const K = canvas(box, 340, 200), vs = slider(box, '태양풍 속도 (km/s)', 250, 1500, 10, 400), ns = slider(box, '태양풍 밀도 (개/cm³)', 1, 50, 0.5, 5), R = readout(box);
      return () => { const g = K.g; clear(K); const rho = ns.value * 1e6 * 1.6726e-27, v = vs.value * 1e3, B0 = 3.1e-5, r = Math.pow(B0 * B0 / (4e-7 * Math.PI * rho * v * v), 1 / 6) * 1.4, cx = 230, cy = 100, S = 12;
        dot(g, cx, cy, S, C.blue); g.strokeStyle = C.teal; g.lineWidth = 2; g.beginPath(); g.ellipse(cx + S * r * 0.6, cy, S * r * 1.6, S * r * 1.3, 0, Math.PI * 0.5, Math.PI * 1.5); g.stroke();
        g.setLineDash([3, 4]); g.strokeStyle = C.amber; g.beginPath(); g.arc(cx, cy, S * 6.6, 0, 7); g.stroke(); g.setLineDash([]); text(g, '정지궤도 6.6 R', cx - 20, cy - S * 6.6 - 4, C.amber, 10);
        for (let k = 0; k < 6; k++) arrow(g, 6, 30 + k * 28, 46, 30 + k * 28, C.mute, 1); text(g, '태양풍 →', 6, 20, C.mute, 10);
        R([['자기권계면 거리 (낮 쪽)', `${fmt(r, 1)} 지구 반지름`], ['정지궤도 위성', r < 6.6 ? '태양풍에 직접 노출됨' : '자기권 안에서 보호됨'], ['참고', '평소 400 km/s, 5개/cm³ · 큰 폭풍 때 1,000 km/s 이상']]); }; } },
  { id: 'vanallen', level: '교양', title: '밴앨런대', tag: '지구 자기장에 갇힌 방사선',
    eq: String.raw`\text{안쪽 대 } 1.2\text{–}3\,R_\oplus\ (\text{양성자}),\quad \text{바깥 대 } 4\text{–}7\,R_\oplus\ (\text{전자})`,
    body: `밴앨런대(Van Allen belt)는 지구 자기장에 붙잡힌 고에너지 입자가 모여 있는 두 겹의 방사선대입니다. 1958년 미국의 첫 인공위성 익스플로러 1호가 처음 발견했습니다. 이 입자들은 자기력선을 따라 남북 극 사이를 오가며 갇혀 있어서, 그 안을 지나는 우주선과 위성은 강한 방사선을 받습니다. 이 때문에 전자 장비가 많이 상해서 위성들은 이 영역을 피해 궤도를 정합니다. 예를 들어 국제우주정거장은 그 아래를 돌고, 아폴로 우주선은 빠르게 통과해 피폭을 줄였습니다.`,
    deep: String.raw`대전 입자는 자기력선을 감아 돌며(회전), 극 쪽에서 반사되며(거울점) 남북으로 오가고, 지구 둘레를 표류합니다. 남대서양 상공은 자기장이 약해 안쪽 대가 낮게 내려와(남대서양 이상 지역), 국제우주정거장도 그곳을 지날 때 방사선량이 늘어납니다.`,
    widget(box) { const K = canvas(box, 340, 200), hs = slider(box, '궤도 높이 (km, 로그)', 2.3, 4.7, 0.01, 2.62, (x) => fmt(10 ** x, 0)), R = readout(box);
      return () => { const g = K.g; clear(K); const cx = 70, cy = 100, S = 26;
        for (const [a, b, c] of [[1.2, 3, 'rgba(255,122,162,.35)'], [4, 7, 'rgba(255,180,84,.3)']]) { g.fillStyle = c; g.beginPath(); g.ellipse(cx, cy, S * b, S * b * 0.55, 0, -1.2, 1.2); g.ellipse(cx, cy, S * a, S * a * 0.5, 0, 1.2, -1.2, true); g.fill(); }
        dot(g, cx, cy, S, C.blue); const h = 10 ** hs.value, r = 1 + h / 6371; g.strokeStyle = C.teal; g.beginPath(); g.arc(cx, cy, S * r, -1.3, 1.3); g.stroke();
        for (const [n, rr] of [['ISS', 1.065], ['GPS', 4.17], ['정지궤도', 6.62]]) { text(g, n, cx + S * rr + 2, cy + 4, C.mute, 9); }
        const zone = r < 1.2 ? '방사선대 아래 (저궤도)' : r < 3 ? '안쪽 방사선대 (고에너지 양성자)' : r < 4 ? '두 대 사이의 틈 (슬롯)' : r < 7 ? '바깥 방사선대 (고에너지 전자)' : '방사선대 바깥';
        R([['높이', `${fmt(h, 0)} km = ${fmt(r, 2)} 지구 반지름`], ['위치', zone]]); }; } },
  { id: 'decay', level: '교양', title: '궤도 감쇠와 대기권 재진입', tag: '저궤도 위성은 언젠가 떨어진다',
    eq: String.raw`\frac{da}{dt} = -\sqrt{\mu a}\;\rho(h)\,\frac{C_D A}{m}`,
    body: `인공위성은 한번 올리면 영원히 도는 것이 아니라 조금씩 내려옵니다. 높이 수백 km에도 아주 옅은 공기가 있어서, 위성은 끊임없이 저항을 받으며 내려옵니다. 그런데 내려갈수록 공기가 짙어지므로 점점 빨리 떨어지다가, 결국 대기권에 들어와 불탑니다. 그래서 국제우주정거장은 몇 달마다 엔진으로 고도를 올립니다. 또 태양 활동이 활발하면 상층 대기가 부풀어 같은 높이의 공기가 짙어지므로 위성이 더 빨리 떨어집니다.`,
    deep: String.raw`대기 밀도는 높이에 따라 대략 <span class="tex">\rho = \rho_0 e^{-(h-h_0)/H}</span>로 줄고, 규모 높이 H는 수십 km입니다. 2022년 2월 스타링크 위성 38기는 지자기 폭풍으로 대기가 부푼 날 발사되어 궤도에 오르지 못하고 떨어졌습니다. 고도가 1,000 km를 넘으면 수백~수천 년을 머무르기 때문에 다 쓴 위성을 내리는 규칙(25년 규정, 지금은 5년)이 생겼습니다.`,
    widget(box) { const K = canvas(box), h0 = slider(box, '처음 높이 (km)', 250, 700, 5, 420), bc = slider(box, '면적 / 질량 (m²/kg, 로그)', -3, -1, 0.01, -2.3, (x) => (10 ** x).toPrecision(2)), sa = slider(box, '태양 활동 (0 조용 ~ 1 활발)', 0, 1, 0.05, 0.5, (x) => x.toFixed(2)), R = readout(box);
      const rho = (h, k) => { const T = [[200, 2.5e-10, 37], [300, 1.9e-11, 53], [400, 2.8e-12, 59], [500, 5.2e-13, 70], [600, 1.1e-13, 80], [700, 3.1e-14, 90]]; let r = T[0]; for (const t of T) if (h >= t[0]) r = t; return r[1] * Math.exp(-(h - r[0]) / r[2]) * (0.4 + 1.6 * k); };
      return () => { clear(K); const am = 10 ** bc.value * 2.2, k = +sa.value; let h = +h0.value, t = 0; const xs = [0], ys = [h], dt = 86400;
        while (h > 150 && t < 3.15e7 * 30) { const a = (6371 + h) * 1e3, d = Math.sqrt(398600.4418e9 * a) * rho(h, k) * am * (h > 300 ? dt : dt / 24); h -= d / 1e3; t += h > 300 ? dt : dt / 24; if (xs.length < 4000 && (xs.length % 2 === 0 || h < 200)) { xs.push(t / 86400); ys.push(h); } }
        plot(K, xs, [{ ys, col: C.amber, label: '높이' }], { x0: 0, x1: Math.max(1, t / 86400), y0: 100, y1: +h0.value + 20, xl: '일', yl: 'km', yd: 0 });
        R([['떨어지기까지', t >= 3.15e7 * 30 ? '30년 이상' : t > 3.15e7 ? `${fmt(t / 3.15e7, 1)}년` : `${fmt(t / 86400, 0)}일`], ['참고', 'ISS 약 420 km (재가속 없이 1~2년), 허블 약 530 km']]); }; } },
  { id: 'debris', level: '교양', title: '우주 쓰레기와 케슬러 증후군', tag: '부서진 조각이 또 부순다',
    eq: String.raw`\text{충돌 빈도} \approx n\,\sigma\,v_\text{rel}\,N`,
    body: `우주 쓰레기는 지구 궤도를 도는 고장 난 위성, 로켓 잔해, 파편 같은 물체입니다. 지구 둘레에는 추적되는 10 cm 이상 물체만 3만 개가 넘고, 1 cm 이상은 100만 개로 추정됩니다. 이들은 초속 10 km로 부딪히므로, 운동 에너지가 커서 작은 조각도 위성을 부술 수 있습니다. 더 큰 문제는 충돌로 생긴 파편이 또 다른 충돌을 부르는 연쇄인 케슬러 증후군으로, 이것이 일어나면 그 고도는 오랫동안 쓸 수 없게 됩니다. 실제로 2009년 이리듐 33과 코스모스 2251 충돌, 2007년 중국의 위성 요격 실험이 큰 파편 구름을 만들었습니다.`,
    deep: String.raw`공간 밀도 n(개/km³), 단면적 σ, 상대 속도 v로 한 물체가 1년에 맞을 확률은 <span class="tex">n\sigma v\,t</span>입니다. 고도 800 km 근처가 가장 붐빕니다. 다 쓴 위성을 무덤 궤도로 올리거나 대기권으로 내리고, 파편을 잡아 내리는 기술(능동 제거)이 연구되고 있습니다.`,
    widget(box) { const K = canvas(box, 340, 150), ns = slider(box, '파편 공간 밀도 (개/10⁸ km³, 로그)', 0, 3, 0.01, 1.3, (x) => fmt(10 ** x, 0)), Ns = slider(box, '그 고도의 위성 수', 10, 10000, 10, 2000), R = readout(box);
      return () => { clear(K); const n = 10 ** ns.value / 1e8, sig = 10e-6, v = 10 * 3.156e7, rate = n * sig * v, sats = +Ns.value, g = K.g, per = rate * sats;
        g.fillStyle = C.pink; g.fillRect(20, 40, Math.min(K.w - 40, (K.w - 40) * per / 2), 26); text(g, `1년에 예상 충돌 ${fmt(per, 3)}회`, 22, 34, C.text, 11); text(g, '막대 끝 = 2회/년', K.w - 20, 90, C.mute, 9, 'right');
        R([['위성 하나가 1년에 맞을 확률', `${fmt(rate * 100, 4)}%`], ['평균 충돌 간격', per > 0 ? `${fmt(1 / per, 1)}년` : '-'], ['가정', '위성 단면적 10 m², 상대 속도 10 km/s']]); }; } },
  { id: 'gps', level: '교양', title: 'GPS와 상대성 이론', tag: '시계를 고치지 않으면 하루 11 km 틀린다',
    eq: String.raw`\frac{\Delta t}{t} \approx \frac{GM}{c^2}\left(\frac{1}{R_\oplus} - \frac{1}{r}\right) - \frac{v^2}{2c^2}`,
    body: `스마트폰의 GPS가 정확한 위치를 알려 주려면 상대성 이론까지 고려해야 합니다. 높이 2만 km의 GPS 위성에 실린 원자시계는 두 가지 상대론 효과를 받습니다. 빠르게 움직여서 느려지고(특수 상대론, 하루 −7 μs), 중력이 약한 곳에 있어서 빨라집니다(일반 상대론, 하루 +45 μs). 둘을 합치면 하루 약 38 μs 빨라지는데, 빛은 1 μs에 300 m를 가므로 고치지 않으면 위치가 하루에 약 11 km씩 틀어집니다. 그래서 GPS 시계는 발사 전부터 일부러 조금 느리게 맞춰 둡니다.`,
    deep: String.raw`약한 중력장 근사에서 고유 시간의 비는 <span class="tex">d\tau/dt \approx 1 + \Phi/c^2 - v^2/2c^2</span>. 궤도 높이에 따라 두 효과가 같아져 상쇄되는 높이(약 3,200 km)가 있습니다. 한국형 위성항법시스템(KPS)도 같은 보정을 합니다.`,
    widget(box) { const K = canvas(box), hs = slider(box, '궤도 높이 (km)', 200, 40000, 100, 20200), R = readout(box);
      const eff = (h) => { const r = (6371 + h) * 1e3, c2 = 8.98755e16, GM = 3.986e14, v2 = GM / r, gr = GM / c2 * (1 / 6.371e6 - 1 / r) * 86400e6, sr = -v2 / (2 * c2) * 86400e6; return [gr, sr]; };
      return () => { clear(K); const xs = []; for (let h = 200; h <= 40000; h += 200) xs.push(h);
        const P = plot(K, xs, [{ ys: xs.map(h => eff(h)[0]), col: C.teal, label: '일반 상대론 (중력)' }, { ys: xs.map(h => eff(h)[1]), col: C.pink, label: '특수 상대론 (속도)' }, { ys: xs.map(h => eff(h)[0] + eff(h)[1]), col: C.amber, label: '합' }], { x0: 200, x1: 40000, y0: -30, y1: 55, xl: '높이 (km)', yl: 'μs/일', yd: 0 });
        const [gr, sr] = eff(+hs.value); dot(K.g, P.X(+hs.value), P.Y(gr + sr), 4, C.amber);
        R([['중력 효과', `${fmt(gr, 1)} μs/일`], ['속도 효과', `${fmt(sr, 1)} μs/일`], ['합', `${fmt(gr + sr, 1)} μs/일 → 하루 ${fmt(Math.abs(gr + sr) * 0.2998, 1)} km 오차`]]); }; } },
  { id: 'gw', level: '전공', title: '중력파', tag: '시공간이 떨린다',
    eq: String.raw`f(\tau) = \frac{1}{\pi}\left(\frac{5}{256\,\tau}\right)^{3/8}\left(\frac{G\mathcal{M}}{c^3}\right)^{-5/8}`,
    body: `무거운 두 천체가 서로 돌면 시공간의 물결인 중력파를 내며 에너지를 잃고 점점 가까워집니다. 가까워질수록 더 빨리 돌기 때문에, 합쳐지기 직전에는 주파수가 치솟는 '처프' 신호가 나옵니다. 2015년 LIGO가 13억 광년 밖 두 블랙홀(태양의 36배와 29배)의 충돌에서 처음 검출했는데, 그 신호는 지구에서 4 km 팔의 길이를 양성자 지름의 1,000분의 1만큼 바꿨을 정도로 작았습니다.`,
    deep: String.raw`처프 질량 <span class="tex">\mathcal M = (m_1m_2)^{3/5}/(m_1+m_2)^{1/5}</span>가 주파수 변화율을 정합니다: <span class="tex">\dot f = \frac{96}{5}\pi^{8/3}\left(\frac{G\mathcal M}{c^3}\right)^{5/3}f^{11/3}</span>. 1974년 발견된 쌍성 펄서(헐스-테일러)의 궤도 주기 감소가 일반 상대론 예측과 정확히 맞아 중력파의 간접 증거가 되었습니다. 2017년 중성자별 충돌에서는 빛(감마선, 킬로노바)도 함께 관측되었습니다.`,
    widget(box) { const K = canvas(box), ms = slider(box, '처프 질량 (태양 = 1, 로그)', -0.2, 1.8, 0.01, 1.45, (x) => fmt(10 ** x, 1)), R = readout(box);
      return () => { clear(K); const Mc = 10 ** ms.value * 4.925e-6, xs = [], ys = []; // G M_sun / c^3 in seconds
        for (let lt = -3; lt <= 1.5; lt += 0.02) { const tau = 10 ** -lt; xs.push(-tau); ys.push(Math.log10((1 / Math.PI) * Math.pow(5 / (256 * tau), 3 / 8) * Math.pow(Mc, -5 / 8))); }
        xs.reverse(); ys.reverse(); plot(K, xs.map(x => -Math.log10(-x)), [{ ys, col: C.teal, label: '주파수 (log Hz)' }], { x0: -1.5, x1: 3, y0: 0.5, y1: 3.5, xl: '합쳐지기 전 시간 (log 10⁻ˣ초, 오른쪽이 합쳐지는 순간)', yd: 1 });
        const f01 = (1 / Math.PI) * Math.pow(5 / (256 * 0.1), 3 / 8) * Math.pow(Mc, -5 / 8);
        R([['합쳐지기 0.1초 전 주파수', `${fmt(f01, 0)} Hz`], ['예', 'GW150914 처프 질량 약 28 · 중성자별 쌍 약 1.2']]); }; } },
];

// ---- general reading: the universe for everyone ----
const GENERAL = [
  { id: 'scale', level: '기초', title: '우주의 크기', tag: '빛으로 재는 거리',
    eq: String.raw`d = c\,t`,
    body: `우주의 거리는 너무 커서 km로는 감이 오지 않기 때문에, 빛이 가는 데 걸리는 시간으로 나타냅니다. 빛은 초속 30만 km로 가장 빠르므로, 이 시간이 곧 거리의 잣대가 됩니다. 예를 들어 달까지 1.3초, 태양까지 8분 20초, 보이저 1호까지 약 23시간, 가장 가까운 별까지 4.2년이 걸립니다. 더 나아가 우리 은하 지름은 10만 년, 안드로메다 은하까지는 250만 년입니다. 그러니 밤하늘의 별빛은 모두 과거에서 온 빛입니다.`,
    deep: String.raw`천문단위(AU, 지구-태양 평균 거리 1억 4,960만 km), 광년(9.46조 km), 파섹(3.26광년)을 상황에 맞게 씁니다. 관측 가능한 우주의 반지름은 약 465억 광년으로, 우주 나이(138억 년)보다 큰데 이는 빛이 오는 동안 공간이 늘어났기 때문입니다.`,
    widget(box) { const K = canvas(box, 340, 170), s = slider(box, '거리 (로그 눈금)', 0, 20, 0.01, 8, (x) => fmtLy(10 ** x)), R = readout(box);
      const L = [['달', 384400], ['태양', 1.496e8], ['해왕성', 4.5e9], ['보이저 1호', 2.5e10], ['프록시마', 4.0e13], ['베텔게우스', 5.0e15], ['은하 중심', 2.5e17], ['안드로메다', 2.4e19]];
      return () => { clear(K); const g = K.g, x0 = 20, x1 = K.w - 20, X = (lg) => x0 + (lg - 5) / 15 * (x1 - x0);
        g.strokeStyle = C.grid; g.beginPath(); g.moveTo(x0, 100); g.lineTo(x1, 100); g.stroke();
        L.forEach(([n, d], i) => { const x = X(Math.log10(d)); dot(g, x, 100, 3, C.teal); text(g, n, x, i % 2 ? 122 : 88, C.text, 10, 'center'); });
        const d = 10 ** (5 + +s.value * 15 / 20); g.strokeStyle = C.amber; g.beginPath(); g.moveTo(X(Math.log10(d)), 40); g.lineTo(X(Math.log10(d)), 150); g.stroke();
        const t = d / 299792.458; R([['거리', `${fmt(d, 0)} km`], ['빛이 걸리는 시간', fmtTime(t)], ['시속 100 km 자동차로', fmtTime(d / 100 * 3600)]]); }; } },
  { id: 'bluesky', level: '기초', title: '하늘은 왜 파랗고 노을은 붉을까', tag: '공기가 빛을 흩뜨린다',
    eq: String.raw`I \propto \frac{1}{\lambda^4}`,
    body: `맑은 날 하늘은 왜 파랗고, 해 질 녘 노을은 왜 붉을까요? 답은 공기 분자가 햇빛을 흩뜨리는 레일리 산란에 있습니다. 햇빛은 여러 색이 섞인 흰빛인데, 공기 분자는 파장이 짧은 파란빛을 빨간빛보다 5배 넘게 잘 흩뜨립니다. 그래서 하늘 어디를 보아도 흩어진 파란빛이 눈에 들어옵니다. 반면에 해가 낮게 뜨면 빛이 공기를 수십 배 길게 지나오는 동안 파란빛이 다 흩어져 빠지고, 남은 주황·빨간빛이 노을이 됩니다. 공기가 없는 달에서는 흩뜨릴 분자가 없으니 낮에도 하늘이 검습니다.`,
    deep: String.raw`분자처럼 파장보다 훨씬 작은 입자에서는 산란 세기가 <span class="tex">\lambda^{-4}</span>에 비례합니다. 물방울이나 먼지처럼 큰 입자는 색을 가리지 않고 흩뜨려(미 산란) 구름이 흰색으로 보입니다. 화성은 붉은 먼지 때문에 낮 하늘이 분홍빛이고, 노을은 오히려 파랗습니다.`,
    widget(box) { const K = canvas(box, 340, 170), s = slider(box, '태양 고도 (°)', 0, 90, 1, 45), R = readout(box);
      return () => { clear(K); const g = K.g, h = Math.max(0.5, +s.value), am = 1 / (Math.sin(h * Math.PI / 180) + 0.15 * (h + 3.885) ** -1.253), cols = [];
        for (let i = 0; i < 60; i++) { const lam = 400 + i * 5, tr = Math.exp(-0.0088 * (550 / lam) ** 4 * am * 9.6); cols.push([lam, tr]); }
        const keep = (lo, hi) => cols.filter(([l]) => l >= lo && l < hi).reduce((a, [, t]) => a + t, 0) / cols.filter(([l]) => l >= lo && l < hi).length;
        const r = keep(600, 700), gg = keep(500, 600), b = keep(400, 500), m = Math.max(r, gg, b);
        g.fillStyle = `rgb(${255 * r / m | 0},${235 * gg / m | 0},${215 * b / m | 0})`; g.beginPath(); g.arc(K.w / 2, 80, 34, 0, 7); g.fill();
        text(g, '지면에 닿는 햇빛의 색', K.w / 2, 140, C.mute, 10, 'center');
        R([['빛이 지나는 공기 두께', `머리 위의 ${fmt(am, 1)}배`], ['남는 파란빛', `${fmt(b * 100, 0)}%`], ['남는 빨간빛', `${fmt(r * 100, 0)}%`]]); }; } },
  { id: 'aurora', level: '교양', title: '오로라', tag: '대기가 내는 빛',
    eq: String.raw`E = h\nu = \frac{hc}{\lambda}`,
    body: `오로라는 극지방 밤하늘에 커튼처럼 일렁이는 빛입니다. 태양풍의 전자가 지구 자기력선을 따라 극지방 대기로 쏟아지면, 산소와 질소 원자를 들뜨게 합니다. 들뜬 원자는 원래대로 돌아오며 원소마다 정해진 색의 빛을 냅니다. 예를 들어 높이 100~200 km의 산소는 초록(557.7 nm), 200 km보다 높은 곳의 희박한 산소는 빨강(630 nm), 질소는 아래쪽 가장자리에서 보라·분홍빛을 냅니다. 강한 지자기 폭풍 때는 한국에서도 북쪽 하늘에 붉은 오로라가 찍힌 적이 있습니다(2024년 5월).`,
    deep: String.raw`630 nm 빨간 빛은 들뜬 상태가 약 110초 동안 유지되어야 나오는 금지선이라, 그동안 다른 분자와 부딪히지 않는 희박한 높은 대기에서만 보입니다. 오로라 띠(오로라 타원)는 자기 위도 65~70° 둘레에 생기며, 폭풍이 세질수록 적도 쪽으로 넓어집니다.`,
    widget(box) { const K = canvas(box, 340, 170), s = slider(box, '빛나는 높이 (km)', 80, 400, 5, 150), R = readout(box);
      return () => { clear(K); const g = K.g, h = +s.value, lam = h > 220 ? 630 : h > 95 ? 557.7 : 427.8, col = h > 220 ? '#ff5050' : h > 95 ? '#5dff8a' : '#b070ff', who = h > 220 ? '산소 (희박)' : h > 95 ? '산소' : '질소 이온';
        const grd = g.createLinearGradient(0, 30, 0, 150); grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, col); g.fillStyle = grd; g.fillRect(60, 30, K.w - 120, 120);
        const E = 6.626e-34 * 2.998e8 / (lam * 1e-9) / 1.602e-19; R([['내는 원자', who], ['파장', `${lam} nm`], ['광자 하나의 에너지', `${fmt(E, 2)} eV`]]); }; } },
  { id: 'meteor', level: '기초', title: '혜성과 유성우', tag: '먼지가 타는 별똥별',
    eq: String.raw`v_\text{유성} = \sqrt{v_\infty^2 + v_\text{esc}^2}`,
    body: `밤하늘에 유성이 한꺼번에 쏟아지는 유성우는 혜성이 남긴 먼지에서 비롯됩니다. 혜성은 얼음과 먼지로 된 덩어리로, 태양에 가까워지면 얼음이 녹아 꼬리를 만들고 궤도에 먼지를 흘립니다. 지구는 해마다 같은 날 그 먼지 띠를 지나가므로 유성우도 해마다 같은 때 찾아옵니다. 이때 모래알만 한 알갱이가 초속 11~72 km로 대기에 뛰어들어 높이 80~120 km에서 타며 빛줄기를 남깁니다. 지구와 마주 오는 먼지(사자자리 유성우)는 빠르고, 따라오는 먼지는 느립니다.`,
    deep: String.raw`<span class="tex">v_\infty</span>는 지구 중력에 끌리기 전 상대 속도이고, 지구의 탈출 속도 11.2 km/s만큼 더 빨라집니다. 상대 속도의 최대는 지구 공전 속도 30 km/s와 태양계 탈출 속도 42 km/s를 정면으로 더한 72 km/s입니다. 유성우 이름은 유성이 퍼져 나오는 점(복사점)이 있는 별자리에서 땄습니다.`,
    widget(box) { const K = canvas(box, 340, 160), s = slider(box, '지구에 대한 접근 속도 v∞ (km/s)', 0, 71, 1, 30), R = readout(box);
      return () => { clear(K); const g = K.g, vi = +s.value, v = Math.hypot(vi, 11.2), E = 0.5 * 1e-6 * (v * 1e3) ** 2;
        arrow(g, 40, 30, 40 + v * 3.6, 30 + v * 1.4, C.amber, 3); text(g, '대기 진입', 40, 22, C.mute, 10);
        R([['대기 진입 속도', `${fmt(v, 1)} km/s`], ['1 mg 알갱이의 운동 에너지', `${fmt(E, 0)} J (총알 하나쯤)`], ['예', vi > 60 ? '사자자리 유성우처럼 마주 오는 먼지' : vi < 25 ? '용자리 유성우처럼 따라오는 먼지' : '페르세우스자리 유성우 정도']]); }; } },
  { id: 'drake', level: '교양', title: '외계 문명은 몇이나 될까', tag: '드레이크 방정식',
    eq: String.raw`N = R_\ast\, f_p\, n_e\, f_l\, f_i\, f_c\, L`,
    body: `1961년 프랭크 드레이크는 "우리 은하에 지금 신호를 보낼 수 있는 문명이 몇이나 될까"를 따져 보려고 한 줄의 식을 썼습니다. 이것이 드레이크 방정식입니다. 별이 생기는 빠르기에 행성이 있을 확률, 생명이 살 만한 행성 수, 생명이 생길 확률, 지적 생명으로 자랄 확률, 신호를 보낼 기술을 가질 확률, 그 문명이 이어지는 시간을 차례로 곱합니다. 이 가운데 앞의 셋은 관측으로 꽤 알게 되었지만, 뒤의 넷은 아직 아무도 모릅니다.`,
    deep: String.raw`케플러와 TESS 덕분에 <span class="tex">f_p \approx 1</span>(대부분의 별에 행성이 있음), <span class="tex">n_e \sim 0.1\text{–}0.4</span> 정도로 좁혀졌습니다. 우주가 크고 오래됐는데 왜 아무도 보이지 않느냐는 물음을 페르미 역설이라 합니다.`,
    widget(box) { const sl = [['별 생성률 R* (개/년)', 0, 10, 0.5, 2], ['행성 있는 비율 fp', 0, 1, 0.05, 1], ['생명 가능 행성 수 ne', 0, 1, 0.05, 0.2], ['생명 생길 확률 fl (로그)', -6, 0, 0.5, -1], ['지적 생명 fi (로그)', -6, 0, 0.5, -2], ['통신 기술 fc (로그)', -6, 0, 0.5, -1], ['문명 지속 L (년, 로그)', 1, 9, 0.5, 4]].map(([a, b, c, d, e]) => slider(box, a, b, c, d, e, a.includes('로그') ? (x) => (10 ** x).toExponential(0) : (x) => x)), R = readout(box);
      return () => { const v = sl.map(i => +i.value), N = v[0] * v[1] * v[2] * 10 ** v[3] * 10 ** v[4] * 10 ** v[5] * 10 ** v[6];
        R([['지금 우리 은하의 통신 문명 수 N', N < 0.01 ? N.toExponential(1) : fmt(N, 2)], ['뜻', N < 1 ? '우리가 유일할 가능성이 큼' : `가장 가까운 문명까지 대략 ${fmt(50000 / Math.sqrt(N), 0)}광년`]]); }; } },
  { id: 'calendar', level: '기초', title: '우주 달력', tag: '138억 년을 1년으로',
    eq: String.raw`t_\text{달력} = \frac{t}{138\text{억 년}} \times 365\text{일}`,
    body: `칼 세이건이 소개한 우주 달력은 우주의 역사 약 138억 년을 1년으로 줄여 보여 줍니다. 빅뱅을 1월 1일 0시, 지금을 12월 31일 자정으로 놓으면 긴 시간을 한눈에 비교할 수 있습니다. 이 달력에서 우리 은하는 3월쯤, 태양계는 9월 초에 생깁니다. 공룡은 12월 25일에 나타나 30일에 사라지고, 인류는 12월 31일 밤 10시 반쯤 등장합니다. 기록된 역사는 마지막 14초에 모두 들어갑니다.`,
    deep: String.raw`달력의 1초는 실제로 약 440년, 하루는 약 3,780만 년입니다. 이 비율로 보면 생명이 지구에 나타나는 데는 오래 걸리지 않았지만(9월 말), 복잡한 다세포 생물이 나오기까지는 아주 오래 걸렸습니다(12월 중순).`,
    widget(box) { const E = [['빅뱅', 0], ['첫 별', 0.2], ['우리 은하', 1.0], ['태양계', 9.2], ['지구의 첫 생명', 10.0], ['산소 대기', 11.4], ['캄브리아 대폭발', 13.26], ['공룡', 13.57], ['공룡 멸종', 13.734], ['현생 인류', 13.7997], ['첨성대', 13.79999864]], s = slider(box, '사건', 0, E.length - 1, 1, 3, (k) => E[k][0]), R = readout(box);
      return () => { const [n, ga] = E[+s.value], day = ga / 13.8 * 365, d = new Date(2001, 0, 1, 0, 0, 0); d.setTime(d.getTime() + day * 864e5);
        R([['사건', n], ['실제 시기', agoText(13.8 - ga)], ['우주 달력', d.toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })]]); }; } },
  { id: 'microg', level: '기초', title: '우주정거장은 왜 무중력일까', tag: '끝없이 떨어지는 중',
    eq: String.raw`g(h) = g_0 \left(\frac{R_\oplus}{R_\oplus + h}\right)^2`,
    body: `우주정거장 안의 우주인은 왜 둥둥 떠 있을까요? 중력이 없어서가 아닙니다. 실제로 국제우주정거장(높이 약 420 km)에서도 중력은 지상의 약 89%로 거의 그대로입니다. 그런데 정거장과 우주인은 함께 지구를 향해 계속 떨어지고 있습니다. 동시에 옆으로 초속 7.7 km로 날아가므로, 떨어지는 만큼 지구 표면이 둥글게 멀어져 땅에 닿지 않습니다. 이것이 궤도이고, 함께 떨어지는 사람에게는 무게가 느껴지지 않습니다(자유 낙하).`,
    deep: String.raw`엄밀히는 "무중력"이 아니라 "미소 중력"입니다. 정거장의 중심에서 벗어난 곳은 조석 효과와 공기 저항 때문에 아주 작은 가속도(10⁻⁶ g 정도)가 남습니다. 오래 머물면 뼈와 근육이 약해지고 체액이 머리 쪽으로 몰려 얼굴이 붓습니다.`,
    widget(box) { const K = canvas(box, 340, 170), s = slider(box, '높이 (km)', 0, 36000, 10, 420), R = readout(box);
      return () => { clear(K); const g = K.g, h = +s.value, gr = (6371 / (6371 + h)) ** 2, v = Math.sqrt(398600 / (6371 + h)), T = 2 * Math.PI * (6371 + h) / v / 60;
        const cx = K.w / 2, cy = 95, Re = 40, S = Re / 6371; dot(g, cx, cy, Re, '#2a5aa0'); g.strokeStyle = C.teal; g.beginPath(); g.arc(cx, cy, Math.min(80, Re + h * S), 0, 7); g.stroke();
        R([['그 높이의 중력', `지상의 ${fmt(gr * 100, 1)}%`], ['원 궤도 속도', `${fmt(v, 2)} km/s`], ['한 바퀴', T > 120 ? `${fmt(T / 60, 1)}시간` : `${fmt(T, 0)}분`]]); }; } },
  { id: 'eht', level: '교양', title: '블랙홀을 찍은 지구 크기 망원경', tag: '사건지평선 망원경',
    eq: String.raw`\theta \approx 1.22\,\frac{\lambda}{D}`,
    body: `블랙홀의 그림자를 찍으려면 지구만 한 망원경이 필요한데, 사건지평선 망원경(EHT)은 전 세계 전파 망원경을 묶어 바로 그런 망원경을 만들었습니다. 망원경이 구별할 수 있는 가장 작은 각도(분해능)는 빛의 파장을 망원경 지름으로 나눈 값에 비례합니다. 그래서 같은 파장에서 지름을 10배로 키우면 구별할 수 있는 각도가 10분의 1로 작아져 10배 더 작은 것을 볼 수 있고, 파장이 짧을수록 마찬가지로 더 선명해집니다. 그런데 M87 은하 중심 블랙홀의 그림자는 겨우 40 마이크로초각, 달 위의 도넛 하나 크기입니다. 이를 보려고 전파 망원경 8곳을 동시에 관측해 지름 D ≈ 1만 km의 망원경처럼 썼고, 2019년 첫 블랙홀 사진, 2022년 우리 은하 중심 블랙홀 사진을 냈습니다. 한국의 KVN 망원경도 후속 관측에 참여합니다.`,
    deep: String.raw`각 망원경이 받은 전파를 원자시계 시각과 함께 하드디스크에 기록한 뒤 슈퍼컴퓨터로 맞추는 초장기선 간섭계(VLBI)입니다. 그림자의 지름은 슈바르츠실트 반지름의 약 5.2배로, 크기에서 블랙홀 질량(M87*: 태양의 65억 배)을 잴 수 있습니다.`,
    widget(box) { const K = canvas(box, 340, 190), s = slider(box, '망원경 지름 D (로그, m)', -2, 7.1, 0.05, 1, (x) => fmtLen(10 ** x)), w = slider(box, '파장 (mm)', 0.5, 10, 0.1, 1.3), R = readout(box);
      const pre = el('div', 'cc-opts'); [['큰 전파 접시 (100 m)', 2], ['알마 (16 km)', Math.log10(16000)], ['한국 KVN (480 km)', Math.log10(480000)], ['EHT (지구 지름)', Math.log10(1.07e7)]].forEach(([n, v]) => { const b = el('button', '', n); b.onclick = () => { s.value = v; s.dispatchEvent(new Event('input')); }; pre.append(b); }); box.insertBefore(pre, s.parentNode);
      // the sky model: M87*'s bright ring (42 μas across) around the dark shadow, brighter on the side where the gas comes toward us
      const N = 150, FOV = 120, pxu = N / FOV, sky = document.createElement('canvas'); sky.width = sky.height = N; const sg = sky.getContext('2d'), im = sg.createImageData(N, N);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const dx = (x - N / 2) / pxu, dy = (y - N / 2) / pxu, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
        const v = Math.exp(-(((r - 21) / 3.2) ** 2)) * (1 + 0.75 * Math.sin(a)) * 0.6, k = (y * N + x) * 4; im.data[k] = 255 * Math.min(1, v * 1.3); im.data[k + 1] = 170 * Math.min(1, v); im.data[k + 2] = 60 * v; im.data[k + 3] = 255; }
      sg.putImageData(im, 0, 0); const obs = document.createElement('canvas'); obs.width = obs.height = N; const og = obs.getContext('2d', { willReadFrequently: true }); let key = '';
      return () => { const g = K.g, D = 10 ** +s.value, lam = +w.value * 1e-3, th = 1.22 * lam / D * 206265e6, sig = th / 1.22 / 2.355 * pxu;
        if (key !== `${D}|${lam}`) { key = `${D}|${lam}`; og.fillStyle = '#000'; og.fillRect(0, 0, N, N);
          if (sig < 300) { og.filter = `blur(${sig.toFixed(2)}px)`; og.drawImage(sky, 0, 0); og.filter = 'none'; const d = og.getImageData(0, 0, N, N); let m = 1; for (let k = 0; k < d.data.length; k += 4) m = Math.max(m, d.data[k]);
            const f = 255 / m; for (let k = 0; k < d.data.length; k += 4) { d.data[k] *= f; d.data[k + 1] *= f; d.data[k + 2] *= f; } og.putImageData(d, 0, 0); }
          else { og.fillStyle = 'rgb(120,80,30)'; og.fillRect(0, 0, N, N); } }
        clear(K); g.drawImage(sky, 12, 22); g.drawImage(obs, K.w - N - 12, 22);
        text(g, '실제 모습 (모형)', 12 + N / 2, 14, C.mute, 10, 'center'); text(g, '이 망원경으로 찍은 사진', K.w - 12 - N / 2, 14, C.mute, 10, 'center');
        const bR = th / 2 * pxu; if (bR < N / 2) { g.strokeStyle = C.teal; g.lineWidth = 1; g.beginPath(); g.arc(K.w - 12 - N + 14 + Math.max(2, bR), 22 + N - 14 - Math.max(2, bR), Math.max(2, bR), 0, 7); g.stroke(); }
        text(g, th <= 35 ? '고리와 가운데 그림자가 보임' : th <= 80 ? '고리가 뿌옇게 겹쳐 보임' : '한 점으로 뭉개짐', K.w - 12 - N / 2, 22 + N + 14, th <= 35 ? C.teal : th <= 80 ? C.amber : C.pink, 10, 'center');
        text(g, `가로 ${FOV} μas`, 12 + N / 2, 22 + N + 14, C.mute, 10, 'center');
        R([['분해능 (초록 원 = 빔 크기)', th > 1e6 ? `${fmt(th / 1e6, 2)}″` : th > 1e3 ? `${fmt(th / 1e3, 1)} mas` : `${fmt(th, 1)} μas`], ['M87* 그림자 지름', '약 42 μas'], ['참고', '사람 눈 약 60″ = 6천만 μas']]); }; } },
];
const fmtLy = (x) => { const d = 10 ** (5 + Math.log10(x) * 15 / 20); return d > 9.46e12 ? `${fmt(d / 9.46e12, 1)}광년` : `${fmt(d, 0)} km`; };
const fmtTime = (t) => t < 60 ? `${fmt(t, 1)}초` : t < 3600 ? `${fmt(t / 60, 1)}분` : t < 86400 ? `${fmt(t / 3600, 1)}시간` : t < 3.156e7 ? `${fmt(t / 86400, 1)}일` : `${fmt(t / 3.156e7, t < 3.156e9 ? 1 : 0)}년`;
const fmtLen = (x) => x >= 1000 ? `${fmt(x / 1000, 0)} km` : `${fmt(x, 1)} m`;
const agoText = (gyr) => gyr >= 0.1 ? `${fmt(gyr * 10, 1)}억 년 전` : gyr >= 1e-4 ? `${fmt(gyr * 1e5, 0)}만 년 전` : `${fmt(gyr * 1e9, 0)}년 전`;
// ---- high-school earth science (지구과학Ⅰ·Ⅱ): H-R diagram, spectra, stellar interiors, exoplanet detection, galaxies, cosmology ----
const HR_STARS = [ // [name, T (K), L (Lsun)]
  ['태양', 5772, 1], ['시리우스 A', 9940, 25.4], ['시리우스 B', 25000, 0.056], ['베가', 9600, 40], ['알타이르', 7700, 10.6], ['프로키온 A', 6530, 6.9],
  ['알파 센타우리 A', 5790, 1.52], ['프록시마', 3042, 0.0017], ['바너드별', 3130, 0.0035], ['아크투르스', 4290, 170], ['알데바란', 3900, 440],
  ['카펠라', 4970, 79], ['폴룩스', 4670, 33], ['리겔', 12100, 120000], ['데네브', 8500, 196000], ['베텔게우스', 3600, 126000], ['안타레스', 3570, 75900],
  ['스피카', 22400, 20500], ['레굴루스', 12460, 316], ['아케르나르', 15000, 3150], ['북극성', 6015, 1260], ['미라', 2900, 8400], ['40 에리다니 B', 16500, 0.013],
  ['타우 고래', 5340, 0.52], ['엡실론 에리다니', 5080, 0.34], ['라이텐별', 3150, 0.0012], ['반 마넨별', 6220, 0.00017],
];
const SUN_TRACK = [ // the Sun's life on the H-R diagram: [T, L, stage, age]
  [5600, 0.7, '주계열 시작', '0'], [5772, 1, '지금', '46억 년'], [5800, 1.8, '주계열 끝', '약 100억 년'], [4900, 2.3, '준거성', '약 110억 년'],
  [4300, 30, '적색거성 가지', '약 121억 년'], [3100, 2300, '헬륨 섬광 직전 (가장 큰 적색거성)', '약 122억 년'], [4800, 45, '헬륨을 태우는 수평 가지', '약 122억 년'],
  [3200, 5000, '점근 거성 가지 (바깥층을 날려 보냄)', '약 123억 년'], [100000, 3000, '행성상 성운의 중심별', '약 123억 년'], [30000, 0.5, '백색왜성', '이후'], [8000, 0.0005, '식어 가는 백색왜성', '수십억 년 뒤'],
];
const SPECTRAL = [['O', 40000, '이온화 헬륨'], ['B', 20000, '중성 헬륨'], ['A', 9000, '수소 (가장 강함)'], ['F', 7000, '이온화 칼슘, 수소'], ['G', 5500, '이온화 칼슘, 금속'], ['K', 4500, '중성 금속'], ['M', 3200, '산화 타이타늄 분자']];
function hrAxes(K) { // log T (reversed) on x, log L on y
  const { g, w, h } = K, L = 40, R = 10, T = 12, B = 26, X = (t) => L + (Math.log10(120000) - Math.log10(t)) / (Math.log10(120000) - Math.log10(2400)) * (w - L - R), Y = (l) => h - B - (Math.log10(l) + 5) / 11 * (h - T - B);
  g.strokeStyle = C.grid; g.strokeRect(L, T, w - L - R, h - T - B);
  for (const r of [0.01, 1, 100, 1000]) { g.strokeStyle = 'rgba(255,255,255,.08)'; g.setLineDash([2, 3]); g.beginPath(); // lines of equal radius: L = R^2 (T/5772)^4
    for (let t = 2500; t <= 120000; t *= 1.05) { const x = X(t), y = Y(r * r * (t / 5772) ** 4); t === 2500 ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke(); g.setLineDash([]);
    const tl = 3000, yl = Y(r * r * (tl / 5772) ** 4); if (yl > T && yl < h - B) text(g, `${r}R☉`, X(tl) - 2, yl - 2, C.mute, 8, 'right'); }
  text(g, '← 뜨거움   표면 온도   차가움 →', (L + w - R) / 2, h - 6, C.mute, 9, 'center'); text(g, '광도 (태양=1)', 4, 9, C.mute, 9);
  for (const l of [1e-4, 1, 1e4]) text(g, l === 1 ? '1' : l.toExponential(0), L - 3, Y(l) + 3, C.mute, 8, 'right');
  return { X, Y };
}
function bvColor(t) { const r = t < 6600 ? 255 : 255 * (t / 6600) ** -0.13, gr = t < 6600 ? 100 + 140 * Math.log10(t / 1000) / Math.log10(6.6) : 255 * (t / 6600) ** -0.09, b = t > 6600 ? 255 : Math.max(0, 255 * (Math.log10(t / 2000) / Math.log10(3.3))); return `rgb(${r | 0},${Math.min(255, gr) | 0},${b | 0})`; }
const HS = [
  { id: 'hrdiagram', level: '기초', title: 'H-R도', tag: '별의 온도와 밝기로 그린 지도 · 고교 지구과학Ⅰ',
    eq: String.raw`L = 4\pi R^2 \sigma T^4`,
    body: `별을 표면 온도(가로, 왼쪽이 뜨거움)와 광도(세로)로 찍은 그림을 H-R도라고 합니다. 이렇게 찍으면 별은 아무 데나 흩어지지 않고 몇 무리로 모여서, 별의 종류와 일생을 읽을 수 있습니다. 왼쪽 위에서 오른쪽 아래로 이어지는 띠가 <b>주계열성</b>으로, 중심에서 수소를 태우는 별이며 별의 약 90%가 여기에 있습니다. 오른쪽 위는 차갑지만 아주 밝은 <b>거성과 초거성</b>, 왼쪽 아래는 뜨겁지만 어두운 <b>백색왜성</b>입니다. 온도가 같은데 더 밝다면 더 크다는 뜻이므로, H-R도에서 위로 갈수록 반지름이 큰 별입니다(점선은 반지름이 같은 선). 또 주계열에서는 위쪽 별일수록 무겁고 수명이 짧습니다.`,
    deep: String.raw`관측으로는 색지수(B−V)와 절대 등급으로 그린 색-등급도를 씁니다. 성단의 H-R도는 별들의 나이가 같아서, 주계열에서 무거운 별부터 떨어져 나간 지점(전향점)으로 성단의 나이를 잽니다.`,
    widget(box) { const K = canvas(box, 340, 260), s = slider(box, '태양의 일생 (단계)', 0, SUN_TRACK.length - 1, 1, 1, (k) => `${k + 1}/${SUN_TRACK.length}`), R = readout(box);
      return () => { clear(K); const g = K.g, { X, Y } = hrAxes(K);
        g.strokeStyle = 'rgba(217,166,80,.18)'; g.lineWidth = 16; g.beginPath(); g.moveTo(X(35000), Y(2e5)); g.lineTo(X(9500), Y(40)); g.lineTo(X(5772), Y(1)); g.lineTo(X(3000), Y(0.001)); g.stroke(); g.lineWidth = 1;
        text(g, '주계열', X(12000), Y(30) + 22, C.amber, 9); text(g, '거성', X(4300), Y(300) - 10, C.mute, 9); text(g, '초거성', X(6000), Y(1.5e5) - 8, C.mute, 9); text(g, '백색왜성', X(16000), Y(0.002) + 14, C.mute, 9);
        for (const [n, t, l] of HR_STARS) { dot(g, X(t), Y(l), 2.6, bvColor(t)); if (['태양', '베텔게우스', '리겔', '시리우스 B', '프록시마', '베가', '아크투르스'].includes(n)) text(g, n, X(t) + 4, Y(l) - 3, C.text, 8); }
        g.strokeStyle = C.pink; g.setLineDash([3, 3]); g.beginPath(); SUN_TRACK.forEach(([t, l], i) => i ? g.lineTo(X(t), Y(l)) : g.moveTo(X(t), Y(l))); g.stroke(); g.setLineDash([]);
        const [t, l, st, age] = SUN_TRACK[+s.value]; dot(g, X(t), Y(l), 5, C.pink);
        R([['단계', st], ['나이', age], ['표면 온도', `${t.toLocaleString()} K`], ['광도', `태양 지금의 ${l < 0.01 ? l.toExponential(1) : fmt(l, l < 10 ? 1 : 0)}배`], ['반지름', `태양 지금의 ${fmt(Math.sqrt(l) / (t / 5772) ** 2, 2)}배`]]); }; } },
  { id: 'spectral', level: '기초', title: '별의 분광형과 색', tag: 'OBAFGKM · 고교 지구과학Ⅰ',
    eq: String.raw`\lambda_\text{max} = \frac{2898\ \mu\text{m·K}}{T}`,
    body: `별빛을 프리즘으로 펼치면 군데군데 검은 선(흡수선)이 보이는데, 어떤 원소의 선이 세게 보이는지는 별의 성분보다 <b>표면 온도</b>에 따라 정해집니다. 그래서 별을 뜨거운 순서로 O, B, A, F, G, K, M으로 나누고, 같은 분광형 안에서는 0~9 숫자로 더 잘게 나눕니다. 예를 들어 O형은 파랗고 4만 K 가까이 되며, 태양은 노란 G2형(약 5,800 K), M형은 붉고 3,000 K 정도입니다. 특히 수소 흡수선은 1만 K 근처 A형에서 가장 강하고, 더 뜨거우면 수소가 이온화되어, 더 차가우면 들뜨지 못해 약해집니다.`,
    deep: String.raw`흡수선 세기는 원자의 이온화(사하 방정식)와 들뜸(볼츠만 분포)이 함께 정합니다. 광도 등급(Ⅰ 초거성 ~ Ⅴ 주계열)을 덧붙여 태양은 G2Ⅴ, 베텔게우스는 M1-2Ⅰa로 씁니다.`,
    widget(box) { const K = canvas(box, 340, 170), s = slider(box, '분광형', 0, 6, 1, 4, (k) => SPECTRAL[k][0] + '형'), R = readout(box);
      return () => { clear(K); const g = K.g, [c, T, lines] = SPECTRAL[+s.value];
        for (let x = 0; x < K.w - 40; x++) { const lam = 380 + x / (K.w - 40) * 370, hue = 270 - (lam - 380) / 370 * 270; g.fillStyle = `hsl(${hue},80%,${45 + 15 * Math.min(1, Math.max(0, 1 - Math.abs(lam - 2.898e6 / T) / 900))}%)`; g.fillRect(20 + x, 30, 1, 50); }
        const LINES = { O: [468.6, 541.1], B: [447.1, 402.6, 486.1, 656.3], A: [410.2, 434.0, 486.1, 656.3, 397.0], F: [393.4, 396.8, 486.1, 656.3, 434.0], G: [393.4, 396.8, 430.8, 516.7, 589.0, 656.3], K: [393.4, 396.8, 422.7, 516.7, 589.0, 430.8], M: [476.0, 516.7, 589.0, 616.0, 705.0, 671.0] };
        g.fillStyle = '#000'; for (const l of LINES[c]) if (l >= 380 && l <= 750) g.fillRect(20 + (l - 380) / 370 * (K.w - 40), 30, c === 'A' && [410.2, 434.0, 486.1, 656.3].includes(l) ? 3 : 1.6, 50);
        dot(g, K.w / 2, 125, 22, bvColor(T)); text(g, '380 nm', 20, 95, C.mute, 9); text(g, '750 nm', K.w - 20, 95, C.mute, 9, 'right');
        R([['표면 온도', `약 ${T.toLocaleString()} K`], ['강한 흡수선', lines], ['가장 센 빛의 파장', `${Math.round(2.898e6 / T)} nm`], ['예', { O: '오리온 허리띠의 알니탁', B: '리겔, 스피카', A: '시리우스, 베가', F: '프로키온, 북극성', G: '태양, 카펠라', K: '아크투르스, 알데바란', M: '베텔게우스, 안타레스' }[c]]]); }; } },
  { id: 'starstruct', level: '교양', title: '별의 내부 구조', tag: '핵융합과 에너지 전달 · 고교 지구과학Ⅰ',
    eq: String.raw`\frac{dP}{dr} = -\frac{G\,M(r)\,\rho(r)}{r^2}`,
    body: `별은 자기 중력으로 안쪽을 누르는 힘과 뜨거운 기체의 압력이 바깥으로 미는 힘이 맞서는 <b>정역학 평형</b> 상태에 있습니다. 중심부에서 수소 핵융합으로 만든 에너지는 바깥으로 나오는데, 태양 같은 별에서는 안쪽 70%의 <b>복사층</b>에서 빛이 흡수·방출을 반복하며 천천히 나오고, 바깥 30%의 <b>대류층</b>에서는 끓는 물처럼 기체가 오르내리며 전달됩니다. 반면에 태양보다 훨씬 무거운 별은 중심부가 대류하고 바깥이 복사하며, 아주 가벼운 적색왜성은 전체가 대류합니다. 또 태양 질량의 약 2배보다 무거운 주계열성은 양성자-양성자 연쇄 대신 탄소·질소·산소를 촉매로 쓰는 <b>CNO 순환</b>이 주된 핵융합입니다.`,
    deep: String.raw`복사로 운반할 수 있는 에너지보다 많이 흘러야 하면 온도 기울기가 가팔라져 대류가 시작됩니다(슈바르츠실트 조건). 핵융합 무게 중심이 중심부에 몰린 무거운 별일수록 중심의 에너지 흐름이 커서 대류핵을 가집니다.`,
    widget(box) { const K = canvas(box, 340, 220), s = slider(box, '별의 질량 (태양 = 1)', 0.1, 20, 0.1, 1), R = readout(box);
      return () => { clear(K); const g = K.g, M = +s.value, cx = K.w / 2, cy = 110, Rr = 90;
        const conv = M < 0.35 ? [0, 1] : M < 1.3 ? [0.71 + (M - 1) * 0.2, 1] : [0, Math.min(0.45, 0.12 + 0.03 * M)];
        g.fillStyle = '#3a2a1a'; g.beginPath(); g.arc(cx, cy, Rr, 0, 7); g.fill();
        const ring = (a, b, col) => { g.fillStyle = col; g.beginPath(); g.arc(cx, cy, Rr * b, 0, 7); g.arc(cx, cy, Rr * a, 0, 7, true); g.fill(); };
        ring(conv[0], conv[1], '#6a3e1e'); ring(0, M < 0.35 ? 0.25 : M < 1.3 ? 0.25 : 0.15, '#e2a23a');
        text(g, '중심핵 (핵융합)', cx, cy + 4, '#120c0a', 9, 'center');
        text(g, M < 0.35 ? '전체가 대류' : M < 1.3 ? '대류층 (바깥)' : '대류핵 (안쪽)', cx, M < 1.3 && M >= 0.35 ? cy - Rr + 12 : cy + Rr * 0.35, C.text, 9, 'center');
        R([['에너지 전달', M < 0.35 ? '전체 대류' : M < 1.3 ? '안쪽 복사 → 바깥 대류' : '안쪽 대류 → 바깥 복사'], ['주된 핵융합', M < 1.5 ? '양성자-양성자 연쇄' : 'CNO 순환'], ['주계열 수명', `약 ${fmt(1e10 * M ** -2.5 / 1e8, 0)}억 년`]]); }; } },
  { id: 'exodetect', level: '교양', title: '외계 행성을 찾는 방법', tag: '시선 속도 · 식 · 미세 중력 렌즈 · 고교 지구과학Ⅰ',
    eq: String.raw`K = \left(\frac{2\pi G}{P}\right)^{1/3} \frac{m_p \sin i}{M_\star^{2/3}}`,
    body: `외계 행성은 너무 어두워 직접 보기 어려워서, 주로 행성이 별에 미치는 영향으로 찾습니다. 첫째, <b>시선 속도법</b>에서는 행성이 별을 끌어당겨 별이 조금씩 앞뒤로 흔들리고, 그 흔들림이 도플러 효과로 스펙트럼선을 파랗게, 붉게 번갈아 옮깁니다. 행성이 무겁고 별에 가까울수록 흔들림(K)이 커서 잘 찾힙니다. 둘째, <b>식 현상(통과)법</b>에서는 행성이 별 앞을 지날 때 별빛이 잠깐 어두워지며, 어두워진 비율로 행성의 크기를 압니다. 셋째, <b>미세 중력 렌즈법</b>에서는 앞쪽 별이 뒤쪽 별의 빛을 중력으로 모아 밝게 만들 때, 앞쪽 별의 행성이 짧은 추가 밝아짐을 만듭니다. 한국천문연구원의 KMTNet이 이 방법으로 많은 행성을 찾았습니다.`,
    deep: String.raw`시선 속도로는 <span class="tex">m_p \sin i</span>(최소 질량)만 알 수 있지만, 식 현상까지 보이면 i ≈ 90°라서 질량과 반지름을 모두 알아 밀도를 구합니다. 직접 촬영은 코로나그래프로 별빛을 가려 멀리 떨어진 젊고 뜨거운 거대 행성을 찍습니다.`,
    widget(box) { const K = canvas(box, 340, 180), ms = slider(box, '행성 질량 (목성 = 1)', 0.003, 10, 0.003, 1), ps = slider(box, '공전 주기 (일)', 1, 4000, 1, 365), R = readout(box);
      return () => { clear(K); const g = K.g, mp = +ms.value, P = +ps.value, Kv = 28.4 * mp * (P / 365.25) ** (-1 / 3);
        const xs = []; for (let i = 0; i <= 200; i++) xs.push(i / 200 * 2); plot(K, xs, [{ ys: xs.map(x => Kv * Math.sin(2 * Math.PI * x)), col: C.teal, label: '별의 시선 속도 (m/s)' }], { xl: '공전 주기 단위 시간', y0: -Math.max(1, Kv * 1.2), y1: Math.max(1, Kv * 1.2) });
        R([['별의 흔들림 K', `${fmt(Kv, 2)} m/s`], ['지금 장비로 찾을 수 있나', Kv > 1 ? '예 (약 1 m/s 정밀도)' : Kv > 0.1 ? '차세대 장비가 필요' : '어려움'], ['참고', '지구가 태양을 흔드는 정도는 약 0.09 m/s']]); }; } },
  { id: 'galaxytypes', level: '기초', title: '허블의 은하 분류', tag: '타원 · 나선 · 막대 나선 · 불규칙 · 고교 지구과학Ⅰ',
    eq: String.raw`\text{E0} \to \text{E7} \to \text{S0} \to \text{Sa, SBa} \to \text{Sc, SBc}`,
    body: `허블은 은하를 겉모양에 따라 나눴습니다. 모양이 다르면 별과 가스의 구성도 다르기 때문에, 이 분류는 은하의 성격을 알려 줍니다. 먼저 <b>타원 은하(E)</b>는 둥글거나 길쭉한 공 모양으로 나선팔이 없고, 늙은 붉은 별이 많으며 가스가 적어 새 별이 거의 생기지 않습니다. 숫자 0~7은 납작한 정도입니다. 다음으로 <b>나선 은하(S)</b>는 가운데 팽대부와 나선팔을 가진 원반으로, 나선팔에 가스와 젊은 파란 별이 많습니다. 중심을 가로지르는 막대가 있으면 <b>막대 나선 은하(SB)</b>로, 우리 은하가 여기에 속합니다. 나선 은하는 a에서 c로 갈수록 팽대부가 작고 팔이 느슨하게 벌어집니다. 끝으로 정해진 모양이 없는 것은 <b>불규칙 은하(Irr)</b>로, 대·소 마젤란 은하가 예입니다.`,
    deep: String.raw`허블은 이 순서를 진화 순서로 생각했지만, 지금은 은하가 합쳐지며 나선 은하가 타원 은하가 되는 쪽이 많다고 봅니다. 은하 색과 별 생성률로 보면 "파란 구름"과 "붉은 무리"로 나뉩니다.`,
    widget(box) { const K = canvas(box, 340, 180), s = slider(box, '은하 유형', 0, 6, 1, 4, (k) => ['E0', 'E5', 'S0', 'Sa', 'Sb', 'SBb', 'Irr'][k]), R = readout(box);
      return () => { clear(K); const g = K.g, k = +s.value, cx = K.w / 2, cy = 90; g.save(); g.translate(cx, cy);
        if (k <= 1) { const gr = g.createRadialGradient(0, 0, 2, 0, 0, 60); gr.addColorStop(0, 'rgba(255,220,170,.95)'); gr.addColorStop(1, 'rgba(255,180,120,0)'); g.fillStyle = gr; g.scale(1, k ? 0.5 : 1); g.beginPath(); g.arc(0, 0, 60, 0, 7); g.fill(); }
        else if (k === 6) { for (let i = 0; i < 260; i++) { const a = Math.sin(i * 12.9898) * 43758.5453 % 1, b = Math.sin(i * 78.233) * 12345.678 % 1; dot(g, a * 70, b * 40, 1.4, i % 3 ? 'rgba(170,200,255,.8)' : 'rgba(255,200,170,.8)'); } }
        else { const bar = k === 5, open = k === 3 ? 0.18 : 0.32, bulge = k === 3 ? 22 : k === 2 ? 26 : 14;
          if (k > 2) for (let arm = 0; arm < 2; arm++) for (let i = 0; i < 300; i++) { const t = i / 300 * 4.2, r = (bar ? 24 : 10) * Math.exp(open * t * 1.6), a = t + arm * Math.PI; if (r > 75) break; dot(g, r * Math.cos(a), r * Math.sin(a) * 0.55, 1.6, 'rgba(160,190,255,.75)'); }
          if (bar) { g.fillStyle = 'rgba(255,210,160,.7)'; g.fillRect(-26, -5, 52, 10); }
          const gr = g.createRadialGradient(0, 0, 1, 0, 0, bulge); gr.addColorStop(0, 'rgba(255,225,180,1)'); gr.addColorStop(1, 'rgba(255,200,140,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, bulge * 1.6, bulge, 0, 0, 7); g.fill(); }
        g.restore();
        const D = [['타원', '늙은 붉은 별, 가스 적음', 'M87'], ['타원 (납작함)', '늙은 붉은 별, 가스 적음', 'M110'], ['렌즈형', '원반은 있으나 팔이 없음', 'NGC 5866'], ['나선 (팽대부 큼, 팔 감김)', '팔에 젊은 별', 'M104 솜브레로'], ['나선', '팔에 젊은 별과 성운', 'M31 안드로메다'], ['막대 나선', '중심에 막대', '우리 은하, M95'], ['불규칙', '젊은 별과 가스가 많음', '대·소 마젤란 은하']][k];
        R([['모양', D[0]], ['특징', D[1]], ['예', D[2]]]); }; } },
  { id: 'bigbang', level: '기초', title: '빅뱅 우주론과 그 증거', tag: '우주는 뜨겁고 작은 데서 시작했다 · 고교 지구과학Ⅰ',
    eq: String.raw`\frac{\text{He}}{\text{H}+\text{He}} \approx 0.25 \ (\text{질량비})`,
    body: `빅뱅 우주론(Big Bang cosmology)은 우주가 약 138억 년 전 매우 뜨겁고 밀도가 높은 상태에서 팽창하며 식어 왔다는 이론입니다. 이 이론은 세 가지 큰 증거로 뒷받침됩니다. 첫째, 먼 은하일수록 빨리 멀어지는 <b>허블 법칙</b>은 우주가 팽창한다는 것을 보여 줍니다. 둘째, 우주 어디서나 오는 2.7 K의 <b>우주 배경 복사</b>는 우주가 3,000 K일 때 처음 자유롭게 퍼진 빛이 늘어나 식은 것입니다. 셋째, 우주의 보통 물질 질량 가운데 <b>수소가 약 75%, 헬륨이 약 25%</b>라는 비율은 처음 3분 동안 일어난 핵융합 계산과 맞습니다. 반면에 정상 우주론(우주가 늘어나도 물질이 계속 생겨 밀도가 일정)은 배경 복사를 설명하지 못해 밀려났습니다.`,
    deep: String.raw`초기 핵합성에서 중성자:양성자 비가 약 1:7로 얼어붙어, 중성자가 모두 헬륨-4로 들어가면 헬륨 질량비는 <span class="tex">2 \times 1/(1+7) = 0.25</span>입니다. 급팽창 이론은 우주가 평탄하고 어디나 고른 이유를 설명하려고 더해졌습니다.`,
    widget(box) { const K = canvas(box, 340, 170), s = slider(box, '빅뱅 이후 시간 (로그)', -6, 17.6, 0.1, 13, (x) => fmtAge(10 ** x)), R = readout(box);
      const ST = [[1e-6, '쿼크가 모여 양성자·중성자가 됨'], [180, '헬륨 원자핵이 만들어짐 (처음 3분)'], [1.2e13, '원자가 생기고 빛이 자유로워짐 (우주 배경 복사)'], [6e15, '첫 별과 은하'], [4.3e17, '지금']];
      return () => { clear(K); const g = K.g, t = 10 ** +s.value, a = t < 1.5e12 ? Math.sqrt(t / 1.2e13) / 1100 * 3.2 : (t / 4.3e17) ** (2 / 3), T = 2.725 / Math.min(1, a);
        const xs = []; for (let x = -6; x <= 17.6; x += 0.2) xs.push(x); plot(K, xs, [{ ys: xs.map(x => { const tt = 10 ** x, aa = tt < 1.5e12 ? Math.sqrt(tt / 1.2e13) / 1100 * 3.2 : (tt / 4.3e17) ** (2 / 3); return Math.log10(2.725 / Math.min(1, aa)); }), col: C.amber, label: '우주의 온도 (로그 K)' }], { xl: '시간 (로그 초)' });
        let st = ST[0][1]; for (const [tt, n] of ST) if (t >= tt) st = n;
        R([['시간', fmtAge(t)], ['온도', `${T > 1e6 ? T.toExponential(1) : fmt(T, 0)} K`], ['이때', st]]); }; } },
  { id: 'darkenergy', level: '교양', title: '암흑 에너지와 가속 팽창', tag: '우주의 95%는 모른다 · 고교 지구과학Ⅰ',
    eq: String.raw`\Omega_\Lambda \approx 0.69,\quad \Omega_\text{DM} \approx 0.26,\quad \Omega_\text{보통} \approx 0.05`,
    body: `Ia형 초신성은 최대 밝기가 거의 같아 거리를 재는 "표준 촛불"로 씁니다. 그런데 1998년, 먼 Ia형 초신성들이 예상보다 어둡게, 곧 더 멀리 있다는 것이 밝혀졌습니다. 이 결과는 우주 팽창이 느려지는 것이 아니라 약 50억 년 전부터 <b>빨라지고</b> 있음을 뜻합니다. 팽창을 가속시키는 이 정체 모를 에너지를 <b>암흑 에너지</b>라 합니다. 지금 우주의 에너지는 암흑 에너지가 약 69%, 빛을 내지 않고 중력으로만 드러나는 <b>암흑 물질</b>이 약 26%이고, 별·행성·우리 몸을 이루는 보통 물질은 약 5%뿐입니다.`,
    deep: String.raw`가장 단순한 설명은 공간 자체가 가진 에너지(우주 상수 Λ)로, 공간이 늘어나도 밀도가 일정해서 시간이 지날수록 비중이 커집니다. 최근 DESI 관측은 암흑 에너지가 시간에 따라 변할 가능성을 내비쳐 연구가 이어지고 있습니다.`,
    widget(box) { const K = canvas(box, 340, 170), s = slider(box, '우주 나이 (억 년)', 5, 138, 1, 138), R = readout(box);
      return () => { clear(K); const g = K.g, t = +s.value, a = (Math.sinh(1.5 * Math.sqrt(0.69) * (t / 144)) / Math.sinh(1.5 * Math.sqrt(0.69) * (138 / 144))) ** (2 / 3);
        const m = 0.31 / a ** 3, L = 0.69, tot = m + L, dm = m * 0.84, bm = m * 0.16, parts = [[L / tot, '암흑 에너지', C.blue], [dm / tot, '암흑 물질', C.mute], [bm / tot, '보통 물질', C.amber]];
        let x = 20; for (const [f, n, c] of parts) { g.fillStyle = c; g.fillRect(x, 60, (K.w - 40) * f, 40); if (f > 0.08) text(g, `${n} ${fmt(f * 100, 0)}%`, x + 4, 52, c, 10); x += (K.w - 40) * f; }
        R([['우주 크기 (지금 = 1)', fmt(a, 2)], ['팽창', L > m / 2 ? '가속 중' : '감속 중'], ['참고', '물질은 공간이 늘수록 묽어지지만 암흑 에너지 밀도는 그대로']]); }; } },
  { id: 'synodic', level: '기초', title: '행성의 겉보기 운동', tag: '회합 주기와 역행 · 고교 지구과학Ⅱ',
    eq: String.raw`\frac{1}{S} = \left|\frac{1}{P_\oplus} - \frac{1}{P}\right|`,
    body: `행성은 보통 별자리 사이를 서쪽에서 동쪽으로 움직이지만(순행), 가끔 거꾸로 동쪽에서 서쪽으로 가는 <b>역행</b>을 합니다. 이는 지구가 바깥쪽 행성(예: 화성)을 안쪽에서 앞지를 때 생기는데, 기차가 옆 기차를 추월하면 옆 기차가 뒤로 가는 것처럼 보이는 것과 같습니다. 그래서 외행성은 지구에 가장 가까운 <b>충</b> 무렵 역행하고 가장 밝습니다. 한편 같은 배치(예: 충에서 다음 충)가 되풀이되는 시간을 <b>회합 주기</b>라 하며, 두 공전 각속도의 차이로 정해집니다. 예를 들어 화성은 약 780일(2년 2개월)마다 충이 됩니다.`,
    deep: String.raw`프톨레마이오스는 역행을 주전원으로 설명했고, 코페르니쿠스는 태양 중심설로 같은 현상을 훨씬 간단히 설명했습니다. 내행성은 지구와 태양 사이에 오는 내합 무렵 역행합니다.`,
    widget(box) { const K = canvas(box, 340, 220), ps = slider(box, '바깥 행성의 공전 주기 (년)', 1.2, 30, 0.1, 1.88), ts = slider(box, '시간 (년, 가운데가 충)', 0, 1, 0.005, 0.2), R = readout(box);
      return () => { clear(K); const g = K.g, P = +ps.value, a = P ** (2 / 3), t = +ts.value, S = 1 / Math.abs(1 - 1 / P), cx = 110, cy = 110, sc = 80 / Math.max(a, 1.6);
        dot(g, cx, cy, 5, C.sun); g.strokeStyle = C.grid; g.beginPath(); g.arc(cx, cy, sc, 0, 7); g.stroke(); g.beginPath(); g.arc(cx, cy, sc * a, 0, 7); g.stroke();
        const E = (u) => [Math.cos(2 * Math.PI * (u - 0.5)), Math.sin(2 * Math.PI * (u - 0.5))], Pp = (u) => [a * Math.cos(2 * Math.PI * (u - 0.5) / P), a * Math.sin(2 * Math.PI * (u - 0.5) / P)];
        const [ex, ey] = E(t), [px, py] = Pp(t); dot(g, cx + ex * sc, cy - ey * sc, 4, C.blue); dot(g, cx + px * sc, cy - py * sc, 4, C.pink);
        g.strokeStyle = 'rgba(255,255,255,.25)'; g.beginPath(); g.moveTo(cx + ex * sc, cy - ey * sc); g.lineTo(cx + px * sc, cy - py * sc); g.stroke();
        // the planet's direction seen from Earth, against the stars, over time
        const lon = (u) => { const [e1, e2] = E(u), [p1, p2] = Pp(u); return Math.atan2(p2 - e2, p1 - e1); }; let prev = lon(0), acc = 0, pts = [];
        for (let u = 0; u <= 1; u += 0.0025) { const l = lon(u); let d = l - prev; d = (d + 3 * Math.PI) % (2 * Math.PI) - Math.PI; acc += d; prev = l; pts.push([u, acc]); }
        const x0 = 215, w = K.w - x0 - 10, mn = Math.min(...pts.map(p => p[1])), mx = Math.max(...pts.map(p => p[1]));
        g.strokeStyle = C.grid; g.strokeRect(x0, 20, w, 180); text(g, '← 동쪽    별자리 사이    서쪽 →', x0 + w / 2, 14, C.mute, 9, 'center');
        g.strokeStyle = C.teal; g.beginPath(); pts.forEach(([u, v], i) => { const X = x0 + (mx - v) / (mx - mn || 1) * w, Y = 20 + u * 180; i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.stroke();
        const cur = pts[Math.min(pts.length - 1, Math.round(t / 0.0025))]; dot(g, x0 + (mx - cur[1]) / (mx - mn || 1) * w, 20 + t * 180, 3.5, C.pink); text(g, '시간 ↓', K.w - 12, 212, C.mute, 9, 'right');
        const d = lon(t + 0.005) - lon(t); const retro = ((d + 3 * Math.PI) % (2 * Math.PI) - Math.PI) < 0;
        R([['회합 주기', `${fmt(S * 365.25, 0)}일 (${fmt(S, 2)}년)`], ['지금 움직임', retro ? '역행 (서쪽으로)' : '순행 (동쪽으로)'], ['오른쪽 그림', '지구에서 본 행성 위치가 시간에 따라 지나간 길']]); }; } },
];
const fmtAge = (s) => s < 1 ? `${s.toExponential(0)}초` : s < 3600 ? `${fmt(s, 0)}초` : s < 3.156e7 ? `${fmt(s / 86400, 0)}일` : s < 3.156e15 ? `${fmt(s / 3.156e7, 0)}년` : `${fmt(s / 3.156e15, 1)}억 년`;
// ---- textbook UI: chapters in order, prerequisite and follow-up links on every card ----
const ALL = [...CARDS, ...SCIENCE, ...MORE, ...EXTRA, ...SPACEENV, ...GENERAL, ...HS], BYID = Object.fromEntries(ALL.map(c => [c.id, c]));
const NUM = {}; CHAPTERS.forEach((ch, i) => ch.ids.forEach((id, j) => { NUM[id] = `${i}.${j + 1}`; }));
const NEXT = {}; for (const [id, pre] of Object.entries(PRE)) for (const q of pre) (NEXT[q] ||= []).push(id);
const chip = (id) => { const c = BYID[id]; const b = el('button', 'cc-chip', `${NUM[id] || ''} ${c.title}`); b.onclick = () => openCard(c); return b; };
const SEEN_KEY = 'space-commons-cards-seen', OK_KEY = 'space-commons-cards-correct';
const solved = () => { try { return new Set(JSON.parse(localStorage.getItem(OK_KEY)) || []); } catch { return new Set(); } };
function markSolved(id) { try { const s2 = solved(); s2.add(id); localStorage.setItem(OK_KEY, JSON.stringify([...s2])); } catch {} }
// E2: four check questions per card (the original one plus three from quiz2.js), stepped through one at a time;
// each answer is remembered as "id#k", and the card counts as solved once all of its questions are right
const QS = (id) => [QUIZ[id], ...(QUIZ2[id] || [])].filter(Boolean);
const OKQ_KEY = 'space-commons-cards-qok';
const okq = () => { try { return new Set(JSON.parse(localStorage.getItem(OKQ_KEY)) || []); } catch { return new Set(); } };
function markQ(id, k) { try { const s2 = okq(); s2.add(`${id}#${k}`); localStorage.setItem(OKQ_KEY, JSON.stringify([...s2])); if (QS(id).every((_, i) => s2.has(`${id}#${i}`)) || k === 0) markSolved(id); } catch {} }
function quizBox(id, k = 0) {
  const list = QS(id), Q = list[k], box = el('div', 'cc-quiz'), fb = el('div', 'cc-fb'), done0 = okq();
  box.append(el('b', '', `확인 문제 ${k + 1}/${list.length}`), el('p', '', Q.q));
  const done = (ok, extra = '') => { fb.className = 'cc-fb ' + (ok ? 'ok' : 'no'); fb.innerHTML = `${ok ? '정답입니다.' : '다시 생각해 보세요.' + extra} ${ok ? Q.why : ''}`; if (ok) markQ(id, k); };
  if (Q.opts) { const row = el('div', 'cc-opts'); Q.opts.forEach((o, j) => { const b = el('button', '', o); b.onclick = () => done(j === Q.a); row.append(b); }); box.append(row); }
  else { const row = el('div', 'cc-opts'), inp = el('input'); inp.type = 'number'; inp.step = 'any'; const go = el('button', '', '확인'); go.onclick = () => { const v = parseFloat(inp.value); done(Math.abs(v - Q.a) <= (Q.tol ?? Math.abs(Q.a) * 0.03)); };
    inp.onkeydown = (e) => { if (e.key === 'Enter') go.click(); }; row.append(inp, el('span', '', Q.unit || ''), go); box.append(row); }
  const show = el('button', 'cc-show', '풀이 보기'); show.onclick = () => { fb.className = 'cc-fb'; fb.innerHTML = `답: ${Q.opts ? Q.opts[Q.a] : Q.a + ' ' + (Q.unit || '')}. ${Q.why}`; };
  const nav = el('div', 'cc-qnav'); list.forEach((_, j) => { const d = el('button', 'cc-qdot' + (j === k ? ' on' : '') + (done0.has(`${id}#${j}`) ? ' ok' : ''), String(j + 1)); d.onclick = () => box.replaceWith(quizBox(id, j)); nav.append(d); });
  if (k < list.length - 1) nav.append(Object.assign(el('button', '', '다음 문제 →'), { onclick: () => box.replaceWith(quizBox(id, k + 1)) }));
  box.append(fb, show, nav);
  if (done0.has(`${id}#${k}`) || (k === 0 && solved().has(id))) { fb.className = 'cc-fb ok'; fb.textContent = '이미 맞힌 문제입니다.'; }
  return box;
}
const seen = () => { try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY)) || []); } catch { return new Set(); } };
function markSeen(id) { try { const s2 = seen(); s2.add(id); localStorage.setItem(SEEN_KEY, JSON.stringify([...s2])); } catch {} }
// ---- reading each formula: what every symbol is, and what the equation says in words ----
const EXPLAIN = {
  hrdiagram: { s: [['L', '광도: 별이 1초에 내는 전체 에너지'], ['R', '별의 반지름'], ['\\sigma', '슈테판-볼츠만 상수'], ['T', '표면 온도']],
    r: '광도는 표면적(4πR²)과 단위 면적이 내는 빛(σT⁴)의 곱입니다. 그래서 H-R도에서 같은 온도라면 위쪽 별이 더 크고, 같은 광도라면 왼쪽(뜨거운) 별이 더 작습니다.' },
  spectral: { s: [['\\lambda_\\text{max}', '가장 세게 나오는 빛의 파장'], ['T', '표면 온도 (K)']],
    r: '뜨거울수록 가장 센 빛이 짧은 파장(파랑) 쪽으로 옮겨 가서, 별의 색만 보고도 온도를 짐작할 수 있습니다. 분광형은 같은 온도를 흡수선의 모양으로 더 정밀하게 나눈 것입니다.' },
  starstruct: { s: [['P', '그 깊이의 기체 압력'], ['r', '중심에서의 거리'], ['M(r)', 'r 안쪽에 있는 질량'], ['\\rho(r)', '그 깊이의 밀도'], ['G', '만유인력 상수']],
    r: '안쪽으로 갈수록 위에 쌓인 무게를 버티려고 압력이 커져야 합니다. 이 식이 성립하는 동안 별은 커지지도 줄어들지도 않는 평형을 유지합니다.' },
  exodetect: { s: [['K', '별의 시선 속도가 흔들리는 폭 (m/s)'], ['P', '행성의 공전 주기'], ['m_p \\sin i', '행성 질량 × 궤도 기울기의 사인 (최소 질량)'], ['M_\\star', '별의 질량'], ['G', '만유인력 상수']],
    r: '행성이 무거울수록, 주기가 짧을수록(별에 가까울수록) 별을 크게 흔듭니다. 같은 행성이라도 가벼운 별을 더 크게 흔듭니다.' },
  galaxytypes: { s: [['\\text{E}', '타원 은하 (숫자가 클수록 납작)'], ['\\text{S0}', '렌즈형 은하'], ['\\text{S}, \\text{SB}', '나선 은하, 막대 나선 은하 (a→c: 팽대부 작아지고 팔이 벌어짐)']],
    r: '수식이 아니라 모양에 따른 순서를 나타낸 표기입니다. 왼쪽일수록 둥글고 늙은 별 위주, 오른쪽일수록 납작한 원반과 젊은 별이 많은 은하입니다.' },
  bigbang: { s: [['\\text{He}', '헬륨의 질량'], ['\\text{H}', '수소의 질량']],
    r: '처음 3분 동안의 핵융합 계산은 보통 물질의 약 25%가 헬륨이 되어야 한다고 예측하고, 실제로 관측된 값이 이와 맞습니다. 별이 만든 헬륨만으로는 이렇게 많을 수 없습니다.' },
  darkenergy: { s: [['\\Omega_\\Lambda', '암흑 에너지가 차지하는 비율'], ['\\Omega_\\text{DM}', '암흑 물질의 비율'], ['\\Omega_\\text{보통}', '보통 물질의 비율']],
    r: '세 값을 더하면 거의 1이라 우주는 평탄합니다. 우리가 아는 물질은 5%에 불과합니다.' },
  synodic: { s: [['S', '회합 주기: 같은 배치가 되풀이되는 시간'], ['P_\\oplus', '지구의 공전 주기 (1년)'], ['P', '다른 행성의 공전 주기']],
    r: '1/P는 1년에 도는 바퀴 수입니다. 두 행성의 바퀴 수 차이가 1이 될 때마다 같은 배치로 돌아오므로, 공전 주기가 지구와 비슷한 화성은 회합 주기가 깁니다(약 2.1년).' },
  scale: { s: [['d', '거리'], ['c', '빛의 속도 (초속 약 30만 km)'], ['t', '빛이 그 거리를 가는 데 걸리는 시간']],
    r: '빛은 1초에 지구를 일곱 바퀴 반 돕니다. 그 빛으로도 몇 년, 몇백만 년이 걸리는 거리가 우주의 거리입니다. 그래서 먼 천체를 볼수록 더 오래된 과거를 보게 됩니다.' },
  bluesky: { s: [['I', '흩어지는 빛의 세기'], ['\\lambda', '빛의 파장 (파랑 약 450 nm, 빨강 약 700 nm)']],
    r: '파장이 절반이면 흩어지는 세기는 2⁴ = 16배입니다. 파란빛(450 nm)은 빨간빛(700 nm)보다 약 5.9배 잘 흩어집니다. 그래서 하늘 전체가 파란빛으로 차고, 공기를 길게 지나온 노을빛에는 빨간빛만 남습니다.' },
  aurora: { s: [['E', '광자 하나의 에너지'], ['h', '플랑크 상수'], ['\\nu', '빛의 진동수'], ['c', '빛의 속도'], ['\\lambda', '빛의 파장']],
    r: '원자는 정해진 에너지 계단만 오르내릴 수 있어서, 내놓는 빛의 에너지와 색도 원소마다 정해져 있습니다. 에너지가 클수록 파장이 짧은(파란) 빛입니다. 오로라의 색을 보면 어느 높이의 어떤 원자가 빛나는지 알 수 있습니다.' },
  meteor: { s: [['v_\\text{유성}', '대기에 들어오는 속도'], ['v_\\infty', '지구 중력에 끌리기 전 지구에 대한 속도'], ['v_\\text{esc}', '지구 탈출 속도 11.2 km/s']],
    r: '지구 중력이 알갱이를 끌어당겨 그만큼 더 빨라집니다. 아무리 느리게 다가와도 최소 11.2 km/s로 떨어지며, 에너지는 속도의 제곱이라 빠른 유성일수록 훨씬 밝게 탑니다.' },
  drake: { s: [['N', '지금 신호를 보낼 수 있는 우리 은하의 문명 수'], ['R_\\ast', '1년에 새로 생기는 별의 수'], ['f_p', '행성을 가진 별의 비율'], ['n_e', '그런 별 하나에 생명이 살 만한 행성 수'], ['f_l', '그 행성에 생명이 생길 확률'], ['f_i', '생명이 지적 생명으로 자랄 확률'], ['f_c', '먼 곳까지 신호를 보내는 기술을 가질 확률'], ['L', '그런 문명이 유지되는 시간 (년)']],
    r: '앞의 여러 항을 곱한 값은 "1년에 통신 문명이 몇 개 생기는가"이고, 여기에 문명이 이어지는 시간 L을 곱하면 지금 동시에 있는 수가 됩니다. 곱셈이라 한 항만 아주 작아도 N이 크게 줄어듭니다.' },
  calendar: { s: [['t', '빅뱅 이후 흐른 실제 시간'], ['t_\\text{달력}', '1년 달력에서의 날짜']],
    r: '138억 년을 365일로 줄이는 비례식입니다. 달력의 하루가 약 3,780만 년, 한 시간이 약 160만 년, 1초가 약 440년에 해당합니다.' },
  microg: { s: [['g(h)', '높이 h에서의 중력 가속도'], ['g_0', '지표면의 중력 가속도 9.8 m/s²'], ['R_\\oplus', '지구 반지름 6,371 km'], ['h', '지표면에서의 높이']],
    r: '중력은 지구 중심에서 거리의 제곱에 반비례합니다. 420 km는 지구 반지름에 비해 작아서 중력이 11%만 줄어듭니다. 떠 있는 이유는 중력이 없어서가 아니라 함께 떨어지기 때문입니다.' },
  eht: { s: [['\\theta', '구별할 수 있는 가장 작은 각도 (분해능)'], ['\\lambda', '관측하는 빛의 파장 (EHT는 1.3 mm)'], ['D', '망원경 지름 (간섭계는 가장 먼 두 망원경 사이 거리)']],
    r: '같은 파장이면 망원경이 클수록, 같은 망원경이면 파장이 짧을수록 더 작은 것을 구별합니다. 전파는 파장이 길어서, 지구만 한 크기가 되어야 블랙홀 그림자를 볼 수 있습니다.' },
  coords: { s: [['h', '고도: 지평선에서 위로 잰 각도'], ['\\varphi', '관측지의 위도'], ['\\delta', '적위: 천구 적도에서 북쪽으로 잰 각도 (지구의 위도에 해당)'], ['H', '시간각: 별이 남중한 뒤 지난 시간을 각도로 (1시간 = 15°)']],
    r: '별이 하늘에서 얼마나 높이 보이는지는 세 가지로 정해집니다. 내가 어디에 있는지(위도), 별이 천구의 어디에 붙어 있는지(적위), 그리고 지금이 그 별이 남쪽 하늘 가장 높은 곳을 지난 지 얼마나 되었는지(시간각)입니다. H = 0일 때 별은 가장 높고(남중), 그때 고도는 90° − |φ − δ|입니다.' },
  eot: { s: [['E', '균시차: 해시계 시각 − 시계 시각 (분)'], ['n', '1월 1일부터 센 날짜 (1~365)'], ['B', '날짜를 1년 한 바퀴의 각도로 바꾼 값']],
    r: '시계는 늘 같은 빠르기로 가지만, 태양의 남중은 1년 동안 최대 16분까지 앞서거나 늦습니다. 사인 2B 항은 자전축이 기울어 생기는 반년 주기 차이, 코사인 B와 사인 B 항은 궤도가 타원이라 생기는 1년 주기 차이입니다.' },
  seasons: { s: [['\\bar Q', '하루 평균으로 땅 1 m²가 받는 햇빛 에너지 (W/m²)'], ['S_0', '태양 상수: 지구 거리에서 햇빛의 세기, 1,361 W/m²'], ['a/r', '평균 거리에 대한 지금 거리의 비 (가까우면 커짐)'], ['h_0', '해가 뜨는 시간각: 낮의 길이를 정함'], ['\\varphi, \\delta', '위도와 태양의 적위']],
    r: '땅이 받는 햇빛은 태양이 얼마나 높이 뜨는지(sin 항)와 낮이 얼마나 긴지(h₀)에 따라 정해집니다. 여름에는 태양 적위 δ가 커져 두 값이 모두 커집니다. 거리 항 (a/r)²은 7% 정도만 바뀌어 계절의 주된 원인이 아닙니다.' },
  precession: { s: [['\\dot\\psi', '세차 속도: 1년 동안 춘분점이 움직이는 각도'], ['T', '세차 주기: 자전축이 한 바퀴 도는 시간']],
    r: '자전축은 1년에 50.29초각(약 0.014°)씩 돌아, 360°를 다 돌려면 약 2만 5,772년이 걸립니다. 그래서 수천 년 단위로 북극성이 바뀝니다.' },
  moonphase: { s: [['k', '달에서 밝게 보이는 부분의 비율 (0 = 삭, 1 = 보름)'], ['\\psi', '위상각: 달에서 본 태양과 지구 사이의 각도']],
    r: '태양 빛을 받는 달의 반쪽 가운데 지구를 향한 부분이 얼마나 되는지를 나타냅니다. ψ = 0°(지구가 달의 빛받는 쪽 정면)이면 k = 1로 보름달, ψ = 180°이면 k = 0으로 삭입니다.' },
  declination: { s: [['D', '자기 편각: 진북에서 나침반 북쪽까지의 각도 (동쪽 +, 서쪽 −)']],
    r: '나침반으로 잰 방위에 편각을 더하면 지도(진북) 기준 방위가 됩니다. 서울은 D ≈ −9°라, 나침반으로 잰 방위에서 9°를 빼야 진방위입니다.' },
  paleomag: { s: [['v_\\text{확장}', '해저 확장 속도: 해령에서 한쪽으로 판이 벌어지는 빠르기'], ['\\Delta t', '그 자기 극성이 이어진 기간']],
    r: '해령에서 새로 굳은 바위는 그때의 자기장 방향을 기억합니다. 판이 일정한 속도로 벌어지면, 한 극성 시기 동안 만들어진 바닥의 폭은 속도 × 기간입니다. 그래서 줄무늬 폭을 재면 판의 속도를 알 수 있습니다.' },
  tides: { s: [['a_\\text{조석}', '조석 가속도: 지구의 가까운 쪽과 중심이 받는 인력의 차이'], ['G', '만유인력 상수'], ['M', '당기는 천체(달, 태양)의 질량'], ['R', '지구 반지름'], ['d', '그 천체까지의 거리']],
    r: '조석은 인력 자체가 아니라 인력의 "차이"에서 생깁니다. 차이는 거리의 세제곱에 반비례해서, 가까운 달이 훨씬 무거운 태양보다 두 배 이상 큰 조석을 만듭니다.' },
  spaceweather: { s: [['r_{mp}', '자기권계면까지 거리 (지구 반지름 단위)'], ['B_0', '지구 적도 표면 자기장 (약 3.1×10⁻⁵ T)'], ['\\mu_0', '진공의 투자율'], ['\\rho', '태양풍의 밀도'], ['v', '태양풍의 속도']],
    r: '태양풍이 미는 압력(ρv²)과 지구 자기장이 버티는 압력이 같아지는 곳이 경계입니다. 자기장은 거리의 세제곱으로 약해지므로 1/6제곱이 붙습니다. 태양풍 압력이 64배가 되어야 경계가 절반으로 다가옵니다.' },
  vanallen: { s: [['R_\\oplus', '지구 반지름 (6,371 km)']],
    r: '방사선대의 위치를 지구 반지름 단위로 나타낸 것입니다. 1.2~3 R⊕는 지표면 위 약 1,300~13,000 km, 4~7 R⊕는 약 19,000~38,000 km입니다.' },
  decay: { s: [['a', '궤도 반지름 (지구 중심에서)'], ['\\mu', '지구의 중력 상수 GM'], ['\\rho(h)', '그 높이의 대기 밀도'], ['C_D', '항력 계수 (위성은 약 2.2)'], ['A/m', '단면적을 질량으로 나눈 값: 가볍고 넓을수록 큼']],
    r: '궤도 반지름이 줄어드는 빠르기는 공기 밀도와 "넓이 대비 가벼움"에 비례합니다. 높이가 낮아지면 ρ가 급격히 커져서, 떨어지는 속도가 점점 빨라집니다.' },
  debris: { s: [['n', '파편의 공간 밀도 (1 km³ 안의 개수)'], ['\\sigma', '위성의 단면적'], ['v_\\text{rel}', '부딪히는 상대 속도'], ['N', '그 고도에 있는 위성 수']],
    r: '위성 하나가 1초 동안 쓸고 지나가는 부피는 σ × v입니다. 그 부피 안에 파편이 있을 확률은 n에 비례하므로, 충돌 빈도는 세 값을 곱한 것이고 위성이 N개면 N배가 됩니다.' },
  gps: { s: [['\\Delta t/t', '위성 시계가 지상 시계보다 빨리 가는 비율'], ['G M/c^2', '지구 질량을 길이로 바꾼 값 (약 4.4 mm)'], ['r', '위성의 궤도 반지름'], ['v', '위성의 궤도 속도'], ['c', '빛의 속도']],
    r: '첫째 항은 중력이 약한 높은 곳의 시계가 빨리 가는 효과(일반 상대론), 둘째 항은 빠르게 움직이는 시계가 느리게 가는 효과(특수 상대론)입니다. GPS 높이에서는 첫째 항이 더 커서 합쳐서 빨리 갑니다.' },
  gravity: { s: [['F', '두 물체가 서로 당기는 힘'], ['G', '만유인력 상수 6.674×10⁻¹¹ N·m²/kg²'], ['M, m', '두 물체의 질량'], ['r', '두 중심 사이의 거리'], ['g', '중력 가속도: 표면에서 물체가 떨어지는 가속도']],
    r: '질량이 두 배면 힘도 두 배, 거리가 두 배면 힘은 4분의 1입니다. 행성 표면의 g는 그 행성의 질량에 비례하고 반지름의 제곱에 반비례합니다.' },
  keplerlaws: { s: [['T', '공전 주기'], ['a', '긴반지름 (궤도의 평균 크기)'], ['G', '만유인력 상수'], ['M', '가운데 천체의 질량']],
    r: 'T²을 a³으로 나눈 값은 같은 천체를 도는 모든 것에서 같습니다. 그 값은 가운데 천체의 질량만으로 정해지므로, 거꾸로 위성의 주기와 거리를 재면 행성의 질량을 알 수 있습니다.' },
  twobody: { s: [['\\vec r', '중심 천체에서 본 위치 벡터'], ['\\ddot{\\vec r}', '가속도 (위치를 시간으로 두 번 미분)'], ['\\mu', '중력 상수 GM (중심 천체의 질량에 비례)'], ['r', '거리']],
    r: '물체는 언제나 중심 쪽으로(− 부호), 거리의 제곱에 반비례하는 크기로 가속됩니다. 이 단순한 법칙만으로 원·타원·포물선·쌍곡선 궤도가 모두 나옵니다.' },
  invariants: { s: [['\\varepsilon', '비에너지: 단위 질량당 운동 에너지 + 위치 에너지'], ['v', '속력'], ['\\mu', '중력 상수 GM'], ['r', '거리'], ['a', '긴반지름'], ['\\vec e', '이심률 벡터: 근점을 가리키며 크기가 이심률'], ['\\vec h', '비각운동량 r × v']],
    r: '궤도를 도는 동안 빨라졌다 느려졌다 해도 ε는 그대로입니다. ε가 음수면 묶인 타원 궤도이고, 그 크기가 궤도의 크기 a를 정합니다. e 벡터는 궤도가 어느 방향으로 찌그러졌는지 알려 줍니다.' },
  visviva: { s: [['v', '그 지점의 속력'], ['\\mu', '중력 상수 GM'], ['r', '중심에서 그 지점까지 거리'], ['a', '궤도의 긴반지름']],
    r: '같은 궤도에서는 가까울수록(r 작을수록) 빠릅니다. 원 궤도(a = r)면 v = √(μ/r), 무한히 멀리 가는 궤도(a → ∞)면 v = √(2μ/r)로 탈출 속도입니다.' },
  kepler: { s: [['M', '평균 근점 이각: 시간에 비례해 고르게 늘어나는 각도'], ['E', '이심 근점 이각: 위치를 계산하는 데 쓰는 보조 각도'], ['e', '이심률'], ['n', '평균 운동: 한 바퀴 360°를 주기로 나눈 각속도'], ['t_p', '근점을 지난 시각']],
    r: '시간이 주어지면 먼저 M을 구하고, 이 식을 풀어 E를, E에서 실제 위치를 얻습니다. e가 0이면 E = M이고, e가 클수록 근점 근처에서 위치가 빠르게 변합니다.' },
  elements: { s: [['a', '긴반지름: 궤도의 크기'], ['e', '이심률: 찌그러진 정도 (0 = 원)'], ['i', '경사각: 기준면에 대한 기울기'], ['\\Omega', '승교점 경도: 궤도가 기준면을 위로 뚫는 지점의 방향'], ['\\omega', '근점 인수: 승교점에서 근점까지의 각도'], ['\\nu', '진근점 이각: 근점에서 지금 위치까지의 각도']],
    r: '앞의 두 개는 궤도의 모양, 다음 세 개는 공간에서 놓인 방향, 마지막 하나는 지금 그 궤도의 어디에 있는지를 말합니다. 이 여섯 숫자면 위치와 속도를 완전히 알 수 있습니다.' },
  rocket: { s: [['\\Delta v', '로켓이 얻을 수 있는 속도 변화'], ['I_\\text{sp}', '비추력: 엔진의 연료 효율 (초)'], ['g_0', '표준 중력 가속도 9.81 m/s²'], ['m_0', '처음 질량 (연료 포함)'], ['m_f', '연료를 다 쓴 뒤 질량']],
    r: 'I_sp × g₀는 배기 가스가 뿜어지는 속도입니다. 연료를 두 배 실어도 Δv는 두 배가 아니라 ln 2(약 0.69)배만 늘어납니다. 그래서 로켓은 대부분이 연료이고 단을 나눕니다.' },
  hohmann: { s: [['\\Delta v_\\text{H}', '호만 전이에 드는 총 속도 변화'], ['\\mu', '중심 천체의 중력 상수'], ['r_1, r_2', '출발·도착 원 궤도의 반지름'], ['R', '반지름 비 r₂/r₁']],
    r: '첫째 항은 출발 궤도에서 전이 타원으로 올라타는 분사, 둘째 항은 도착해서 원 궤도로 바꾸는 분사입니다. 두 원 궤도 사이를 옮기는 가장 싼 두 번 분사 방법입니다.' },
  plane: { s: [['\\Delta v', '필요한 속도 변화'], ['v', '분사할 때의 궤도 속도'], ['\\Delta i', '바꿀 경사각']],
    r: '속도의 크기는 그대로 두고 방향만 Δi만큼 돌리는 데 드는 비용입니다. v에 비례하므로, 느리게 움직이는 원점에서 바꾸는 것이 쌉니다. 60°를 바꾸려면 지금 속도만큼이 듭니다.' },
  oberth: { s: [['v_\\infty', '중력권을 벗어난 뒤 남는 속도'], ['v_p', '분사 지점의 속도'], ['\\Delta v', '분사로 더한 속도'], ['v_\\text{esc}', '그 지점의 탈출 속도']],
    r: '분사 후 운동 에너지에서 탈출에 드는 에너지를 뺀 것이 v∞²입니다. v_p가 클 때(근점에서) 분사하면 (v_p + Δv)²이 크게 늘어 같은 Δv로 더 큰 v∞를 얻습니다.' },
  soi: { s: [['r_\\text{SOI}', '영향권 반지름: 이 안에서는 행성의 중력이 주인공'], ['a', '행성의 궤도 반지름'], ['m', '행성의 질량'], ['M', '태양의 질량']],
    r: '태양에서 멀리 있고 무거운 행성일수록 영향권이 큽니다. 질량비의 2/5제곱이라, 목성(태양의 1/1047)의 영향권은 궤도 반지름의 약 6%입니다.' },
  flyby: { s: [['\\delta', '꺾임각: 행성 곁을 지나며 방향이 바뀌는 각도'], ['r_p', '최근접 거리 (행성 중심에서)'], ['v_\\infty', '행성 기준 접근 속도'], ['\\mu', '행성의 중력 상수']],
    r: '가까이(r_p 작게), 천천히(v∞ 작게) 지나갈수록 1 + r_p v∞²/μ가 1에 가까워져 꺾임각이 커집니다. 행성이 무거울수록(μ 클수록) 많이 꺾입니다.' },
  lambert: { s: [['\\mu', '중심 천체의 중력 상수'], ['\\Delta t', '비행 시간'], ['z', '궤도 모양을 나타내는 변수 (양수 타원, 음수 쌍곡선)'], ['y(z), A', '두 위치와 전이각으로 정해지는 보조 값'], ['C(z), S(z)', '스텀프 함수: 원뿔 곡선 종류와 무관하게 쓰는 삼각함수의 일반화']],
    r: '두 위치가 정해져 있을 때, 비행 시간 Δt를 맞추는 궤도는 z 하나만 바꿔 찾을 수 있습니다. 컴퓨터는 이 식을 만족하는 z를 반복 계산으로 찾고, 거기서 출발 속도를 얻습니다.' },
  j2: { s: [['\\dot\\Omega', '궤도면이 도는 속도 (승교점의 이동)'], ['n', '평균 운동 (공전 각속도)'], ['J_2', '지구의 납작한 정도를 나타내는 계수 1.08×10⁻³'], ['R_\\oplus', '지구 적도 반지름'], ['p', '궤도의 반통경 a(1−e²)'], ['i', '경사각']],
    r: '지구 적도의 불룩한 부분이 궤도를 당겨 궤도면을 천천히 돌립니다. cos i 때문에 순행 궤도(i < 90°)는 서쪽으로, 역행(i > 90°)은 동쪽으로 돕니다. 동쪽으로 하루 0.9856°가 되게 i를 고르면 태양동기 궤도입니다.' },
  cr3bp: { s: [['C', '야코비 상수: 회전 좌표계에서 보존되는 양'], ['\\Omega(x,y)', '유효 퍼텐셜: 중력과 원심력을 합친 것'], ['v', '회전 좌표계에서의 속력'], ['\\mu', '작은 천체(달)의 질량 비율'], ['r_1, r_2', '두 천체까지의 거리']],
    r: 'v² = 2Ω − C이므로 2Ω < C인 곳에서는 v²이 음수가 되어 갈 수 없습니다. C가 클수록(에너지가 작을수록) 갈 수 없는 영역이 넓어집니다.' },
  cw: { s: [['x', '기준 궤도에서 위쪽(지구 반대) 거리'], ['y', '진행 방향 앞쪽 거리'], ['n', '기준 궤도의 각속도'], ['\\dot x, \\ddot x', 'x의 속도와 가속도']],
    r: '3n²x 항은 높이 차이에 따른 중력·원심력 차이, 2nẏ와 2nẋ 항은 회전 좌표계의 코리올리 효과입니다. 그래서 앞으로 밀면 위로 뜨고, 위로 밀면 뒤로 처지는 직관과 반대인 움직임이 나옵니다.' },
  roche: { s: [['d', '로슈 한계: 이보다 가까우면 위성이 부서짐'], ['R_M', '행성 반지름'], ['\\rho_M', '행성의 평균 밀도'], ['\\rho_m', '위성의 평균 밀도']],
    r: '행성이 위성보다 촘촘할수록(밀도비가 클수록) 한계가 멀어집니다. 위성이 단단하면 1.26, 액체처럼 변형되면 2.44를 곱합니다. 실제 위성은 그 사이입니다.' },
  moon: { s: [['a', '지구-달 거리'], ['da/dt', '거리가 늘어나는 빠르기']],
    r: '달이 가까울수록 조석이 세서 빨리 멀어집니다(거리의 −11/2제곱). 그래서 과거에는 지금보다 빨리 멀어졌을 것 같지만, 실제로는 바다의 모양이 달라 더 느렸던 시기가 길었습니다.' },
  teq: { s: [['T_\\text{eq}', '평형 온도: 받는 햇빛과 내놓는 열이 같아지는 온도'], ['A', '반사율 (알베도): 햇빛을 되튕기는 비율'], ['L/L_\\odot', '별의 밝기 (태양 = 1)'], ['d', '별까지 거리 (AU)']],
    r: '가까울수록, 반사를 덜 할수록 뜨거워집니다. 거리가 4배면 온도는 절반입니다(−1/2제곱). 실제 표면 온도는 여기에 온실 효과가 더해집니다.' },
  atmos: { s: [['v_\\text{rms}', '기체 분자의 평균 속력 (제곱 평균 제곱근)'], ['k', '볼츠만 상수'], ['T', '온도'], ['m', '분자 하나의 질량'], ['v_\\text{esc}', '행성의 탈출 속도']],
    r: '뜨거울수록, 분자가 가벼울수록 빠릅니다. 탈출 속도가 평균 속력의 6배쯤 되어야 수십억 년 동안 그 기체가 남습니다. 수소는 가벼워서 지구에서도 새어 나갑니다.' },
  impact: { s: [['E', '충돌 에너지'], ['m', '소행성 질량'], ['v', '충돌 속도'], ['D', '크레이터 지름'], ['\\rho_i, \\rho_t', '소행성과 땅의 밀도'], ['L', '소행성 지름'], ['g', '표면 중력']],
    r: '에너지는 속도의 제곱에 비례해서 같은 크기라도 빨리 부딪히면 훨씬 큽니다. 크레이터 지름은 소행성 지름의 0.78제곱, 속도의 0.44제곱에 비례하며, 중력이 약한 곳일수록 커집니다.' },
  hz: { s: [['d_\\text{안}, d_\\text{밖}', '생명 가능 지대의 안쪽·바깥쪽 경계 (AU)'], ['L/L_\\odot', '별의 밝기 (태양 = 1)']],
    r: '받는 빛은 거리의 제곱에 반비례하므로, 밝기가 4배인 별은 같은 온도의 거리가 √4 = 2배 멀어집니다.' },
  transit: { s: [['\\delta', '어두워지는 비율'], ['R_p', '행성 반지름'], ['R_\\star', '별 반지름']],
    r: '행성이 가리는 면적 πR_p²를 별의 면적 πR_⋆²로 나눈 값입니다. 그래서 어두워지는 정도를 재면 행성의 크기를 별 크기 대비로 알 수 있습니다.' },
  blackbody: { s: [['\\lambda_\\text{max}', '가장 세게 나오는 빛의 파장'], ['T', '표면 온도 (K)'], ['L', '별이 1초에 내는 전체 에너지 (광도)'], ['R', '별의 반지름'], ['\\sigma', '슈테판-볼츠만 상수']],
    r: '온도가 두 배면 가장 센 빛의 파장은 절반(더 파랗게)이 되고, 같은 크기에서 밝기는 2⁴ = 16배가 됩니다. 크기가 두 배면 밝기는 4배입니다.' },
  parallax: { s: [['d', '별까지 거리 (파섹)'], ['p', '연주 시차 (초각)']],
    r: '시차가 작을수록 멉니다. 1파섹은 시차가 1초각인 거리로 3.26광년입니다. 시차 0.1″이면 10 pc입니다.' },
  magnitude: { s: [['m', '겉보기 등급: 지구에서 보이는 밝기'], ['M', '절대 등급: 10 pc에 두었을 때의 밝기'], ['d', '거리 (파섹)'], ['F_1/F_2', '두 별의 밝기 비']],
    r: '등급은 숫자가 클수록 어둡습니다. m − M(거리 지수)이 5 커질 때마다 거리는 10배입니다. 등급 차이 1은 밝기 2.512배입니다.' },
  doppler: { s: [['\\Delta\\lambda', '파장이 어긋난 양'], ['\\lambda_0', '정지했을 때의 파장'], ['v_r', '시선 방향 속도 (멀어지면 +)'], ['c', '빛의 속도']],
    r: '빛의 속도에 대한 비율만큼 파장이 늘어나거나 줄어듭니다. 초속 300 km로 멀어지면 파장이 0.1% 길어집니다.' },
  sun: { s: [['{}^1\\text{H}, {}^4\\text{He}', '수소 원자핵, 헬륨 원자핵'], ['e^+', '양전자'], ['\\nu_e', '전자 중성미자'], ['E = mc^2', '사라진 질량이 에너지로 바뀌는 양']],
    r: '수소 4개의 질량이 헬륨 1개보다 0.7% 무거워, 그 차이가 26.7 MeV의 에너지로 나옵니다. 질량에 빛의 속도의 제곱을 곱하므로 아주 작은 질량도 큰 에너지가 됩니다.' },
  starbirth: { s: [['M_J', '진스 질량: 이보다 무거운 구름은 스스로 무너짐'], ['k', '볼츠만 상수'], ['T', '구름의 온도'], ['G', '만유인력 상수'], ['\\mu m_H', '기체 분자 하나의 평균 질량'], ['\\rho', '구름의 밀도']],
    r: '첫째 괄호는 열운동이 버티는 힘, 둘째 괄호는 밀도입니다. 차가울수록(T 작게), 빽빽할수록(ρ 크게) 작은 덩어리도 무너져 별이 됩니다.' },
  stellar: { s: [['t_\\text{주계열}', '주계열에서 머무는 시간 (수소를 태우는 기간)'], ['M/M_\\odot', '별의 질량 (태양 = 1)'], ['L', '광도']],
    r: '무거운 별은 연료가 많지만(M배) 훨씬 빨리 태워서(M^3.5배) 수명이 M^−2.5로 짧아집니다. 태양의 10배인 별은 약 3천만 년밖에 살지 못합니다.' },
  nucleo: { s: [['B/A', '핵자당 결합 에너지: 원자핵을 이루는 입자 하나를 떼어 내는 데 드는 평균 에너지'], ['{}^{56}\\text{Fe}', '철-56 원자핵']],
    r: '이 값이 클수록 단단한 원자핵입니다. 철 근처에서 가장 커서, 가벼운 원소는 합칠 때, 무거운 원소는 쪼갤 때 에너지가 나옵니다.' },
  remnants: { s: [['r_s', '슈바르츠실트 반지름 (사건의 지평선)'], ['G', '만유인력 상수'], ['M', '질량'], ['c', '빛의 속도'], ['\\Delta t_\\infty/\\Delta t', '먼 곳에서 본 시간이 블랙홀 근처 시간보다 몇 배 흐르는지'], ['r', '중심에서의 거리']],
    r: '지평선의 크기는 질량에 정비례합니다. 지평선에 가까이 갈수록(r → r_s) 분모가 0에 가까워져 그곳의 시간은 먼 곳에서 보기에 거의 멈춘 것처럼 됩니다.' },
  gw: { s: [['f', '중력파의 주파수'], ['\\tau', '합쳐지기까지 남은 시간'], ['\\mathcal M', '처프 질량: 두 질량을 묶은 값'], ['G, c', '만유인력 상수와 빛의 속도']],
    r: '합쳐질 때가 다가올수록(τ 작게) 주파수가 τ^−3/8로 치솟습니다. 무거운 쌍일수록 같은 순간의 주파수가 낮습니다. 그래서 신호의 모양만 보고 질량을 알 수 있습니다.' },
  distladder: { s: [],
    r: '가까운 거리를 잰 방법으로 다음 방법의 눈금을 맞추는 사다리입니다. 예를 들어 시차로 거리를 아는 세페이드의 밝기로 주기-광도 관계를 맞추고, 그 관계로 먼 은하의 세페이드 거리를 잽니다.' },
  hubble: { s: [['v', '은하가 멀어지는 속도'], ['H_0', '허블 상수 (km/s/Mpc)'], ['d', '은하까지 거리 (Mpc)'], ['t_H', '허블 시간: 팽창을 거꾸로 돌려 한 점에 모이는 시간']],
    r: '거리가 두 배인 은하는 두 배 빨리 멀어집니다. H₀ = 70이면 1 Mpc(326만 광년) 멀어질 때마다 초속 70 km씩 빨라집니다. 1/H₀는 약 140억 년으로 우주 나이와 비슷합니다.' },
  darkmatter: { s: [['v(r)', '중심에서 r 떨어진 곳의 회전 속도'], ['G', '만유인력 상수'], ['M(\\lt r)', 'r 안쪽에 있는 전체 질량']],
    r: '원 궤도에서 중력 = 원심력이므로 회전 속도는 안쪽 질량으로 정해집니다. 바깥까지 속도가 일정하려면 r이 커지는 만큼 안쪽 질량도 계속 늘어나야 하는데, 보이는 별은 그만큼 없습니다.' },
  cmb: { s: [['T(z)', '적색편이 z인 때의 배경 복사 온도'], ['z', '적색편이: 빛이 오는 동안 우주가 늘어난 정도 − 1']],
    r: '우주가 2배 늘어나면 빛의 파장도 2배가 되어 온도는 절반이 됩니다. 지금 2.7 K인 빛이 나올 때는 우주가 1,100배 작아서 약 3,000 K였습니다.' },
  galaxy: { s: [['\\psi(z)', '우주 별 생성률 밀도: 1 Mpc³에서 1년에 생기는 별의 질량'], ['z', '적색편이 (과거로 갈수록 큼)']],
    r: '분자의 (1+z)^2.7은 과거로 갈수록 늘어나는 부분, 분모는 너무 이른 시기에는 아직 은하가 덜 자라서 줄어드는 부분입니다. 둘이 겹치는 z ≈ 2에서 가장 큽니다.' },
};
function readBox(id) {
  const X = EXPLAIN[id]; if (!X) return null; const d = el('div', 'cc-explain'); d.append(el('b', '', '식 읽기'));
  if (X.s.length) { const t = el('div', 'cc-sym'); for (const [s, m] of X.s) t.append(el('span', '', `<span class="tex">${s}</span>`), el('span', '', m)); d.append(t); }
  d.append(el('p', '', X.r)); return d;
}
function openCard(card) {
  markSeen(card.id); const box = root.querySelector('.cc-detail'); box.innerHTML = ''; box.hidden = false; root.querySelector('.cc-grid').hidden = true; root.querySelector('.cc-win').scrollTop = 0;
  const back = el('button', 'cc-back', '← 목차'); back.onclick = () => { box.hidden = true; root.querySelector('.cc-grid').hidden = false; cancelAnimationFrame(anim); renderToc(); };
  const left = el('div', 'cc-left'), right = el('div', 'cc-right');
  left.append(el('div', 'cc-num', `${NUM[card.id] || ''} · ${CHAPTERS.find(ch => ch.ids.includes(card.id))?.title.replace(/^\d+\. /, '') || ''}`), el('span', 'cc-level ' + card.level, card.level), el('h2', '', card.title), el('div', 'cc-tag', card.tag));
  if (PRE[card.id]?.length) { const r = el('div', 'cc-links'); r.append(el('span', '', '먼저 볼 것'), ...PRE[card.id].map(chip)); left.append(r); }
  // read first, then the formula: the explanation says what the topic is before any symbol appears
  const isEq = /=|\\propto|\\approx|\\to\b|\\lt|\\gt/.test(card.eq);
  left.append(el('p', '', card.body), el('div', 'cc-eq-h', isEq ? '식으로 쓰면' : '한눈에 보기'), el('div', 'cc-eq', `<span class="tex block">${card.eq}</span>`));
  const rd = readBox(card.id); if (rd) left.append(rd);
  const d = el('details', 'cc-deep'); d.append(el('summary', '', '전공 심화: 유도와 실제'), el('div', '', card.deep)); left.append(d);
  if (QUIZ[card.id]) left.append(quizBox(card.id));
  if (card.lab && opts.openLab) left.append(Object.assign(el('button', 'cc-lab', '샌드박스에서 해 보기'), { onclick: () => { close(); opts.openLab(card.lab); } }));
  if (NEXT[card.id]?.length) { const r = el('div', 'cc-links'); r.append(el('span', '', '이어서 볼 것'), ...NEXT[card.id].map(chip)); left.append(r); }
  const order = CHAPTERS.flatMap(c => c.ids), k = order.indexOf(card.id), nav = el('div', 'cc-nav');
  if (k > 0) nav.append(Object.assign(el('button', '', `← ${NUM[order[k - 1]]} ${BYID[order[k - 1]].title}`), { onclick: () => openCard(BYID[order[k - 1]]) }));
  if (k < order.length - 1) nav.append(Object.assign(el('button', '', `${NUM[order[k + 1]]} ${BYID[order[k + 1]].title} →`), { onclick: () => openCard(BYID[order[k + 1]]) }));
  const draw = card.widget(right); box.append(back, el('div', 'cc-body'), nav); box.querySelector('.cc-body').append(left, right); renderTex(box);
  cancelAnimationFrame(anim); const loop = () => { if (box.hidden || root.hidden) return; draw(); anim = requestAnimationFrame(loop); }; loop();
}
let anim = 0;
// E2: what to read next - unfinished quizzes on cards already read first, then unread cards whose prerequisites are all read, in textbook order
function recommend(sn, ok) {
  const order = CHAPTERS.flatMap(ch => ch.ids), out = [];
  for (const id of order) if (sn.has(id) && !ok.has(id) && out.length < 1) out.push([id, '읽었지만 확인 문제가 남았습니다']);
  for (const id of order) { if (out.length >= 3) break; if (sn.has(id)) continue; const pre = PRE[id] || [];
    if (pre.every(q => sn.has(q))) out.push([id, pre.length ? `먼저 볼 것(${pre.map(q => NUM[q]).join(', ')})을 다 읽었습니다` : '바로 시작할 수 있습니다']); }
  return out;
}
function renderToc() {
  const grid = root.querySelector('.cc-grid'), sn = seen(); grid.innerHTML = '';
  const ok = solved(), rec = recommend(sn, ok);
  if (rec.length) { const r = el('div', 'cc-rec'); r.append(el('b', '', '다음에 볼 개념'), ...rec.map(([id, why]) => { const b = el('button', 'cc-chip', `${NUM[id]} ${BYID[id].title}`); b.title = why; b.onclick = () => openCard(BYID[id]); const w = el('span', 'cc-why', why); const s = el('span', ''); s.append(b, w); return s; })); grid.append(r); }
  grid.append(el('div', 'cc-progress', `읽은 개념 ${ALL.filter(c => sn.has(c.id)).length}/${ALL.length} · 맞힌 확인 문제 ${ALL.filter(c => ok.has(c.id)).length}/${Object.keys(QUIZ).length}`));
  for (const ch of CHAPTERS) { grid.append(el('h3', 'cc-ch', `${ch.title} <span>${ch.ids.filter(id => sn.has(id)).length}/${ch.ids.length} 읽음 · ${ch.ids.filter(id => ok.has(id)).length} 맞힘</span>`), el('div', 'cc-intro', ch.intro || '')); const row = el('div', 'cc-row');
    for (const id of ch.ids) { const c = BYID[id], b = el('button', 'cc-card' + (sn.has(id) ? ' seen' : ''));
      b.append(el('span', 'cc-num', NUM[id]), el('b', '', c.title), el('span', 'cc-tag', c.tag), el('span', 'cc-level ' + c.level, c.level));
      if (PRE[id]?.length) b.append(el('span', 'cc-pre', '먼저: ' + PRE[id].map(q => NUM[q]).join(', ') + (ok.has(id) ? ' · 문제 맞힘 ✓' : '')));
      else if (ok.has(id)) b.append(el('span', 'cc-pre', '문제 맞힘 ✓'));
      b.onclick = () => openCard(c); row.append(b); }
    grid.append(row); }
  renderTex(grid);
}
function build() {
  root = el('div', 'cc-root'); root.innerHTML = `<div class="cc-win"><div class="cc-head"><b>우주 알아보기</b><span class="small">${ALL.length}개 개념 · 7단원 · 카드마다 직접 조작하는 그림, 먼저 볼 것과 이어서 볼 것 · 기초 · 교양 · 전공</span><button class="cc-x">×</button></div><div class="cc-grid"></div><div class="cc-detail" hidden></div></div>`;
  document.body.append(root); root.querySelector('.cc-x').onclick = close; root.onclick = (e) => { if (e.target === root) close(); };
  renderToc();
}
export function openCards(o = {}) { opts = o; if (!root) build(); root.hidden = false; if (o.card && BYID[o.card]) openCard(BYID[o.card]); }
function close() { if (root) { root.hidden = true; cancelAnimationFrame(anim); } }

// English: swap in the translated text (cards-en.js) once everything above is defined; numbers and answers stay from the Korean source
if (EN) {
  for (const c of ALL) { const e = CARD_EN[c.id]; if (!e) continue;
    Object.assign(c, { title: e.title, tag: e.tag, body: e.body, deep: e.deep });
    if (EXPLAIN[c.id]) { EXPLAIN[c.id].r = e.r; EXPLAIN[c.id].s.forEach((x, i) => { if (e.s?.[i]) x[1] = e.s[i]; }); }
    const qs = [QUIZ[c.id], ...(QUIZ2[c.id] || [])];
    (e.quiz || []).forEach((qe, i) => { const q = qs[i]; if (!q) return; q.q = qe.q; q.why = qe.why; if (qe.opts) q.opts = qe.opts; if (qe.unit != null) q.unit = qe.unit; }); }
  CHAPTERS.forEach((ch, i) => { ch.title = CHAPTERS_EN[i] || ch.title; ch.intro = INTROS_EN[i] || ch.intro; });
}
