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
const C = { bg: '#0a0f1c', grid: '#1c2640', mute: '#7d8aa8', text: '#c9d1e6', teal: '#4FE3C1', amber: '#ffb454', pink: '#ff7aa2', blue: '#6f8dff', sun: '#ffe6a6' };
function clear(K) { K.g.fillStyle = C.bg; K.g.fillRect(0, 0, K.w, K.h); }
function arrow(g, x1, y1, x2, y2, col, lw = 2) { g.strokeStyle = col; g.fillStyle = col; g.lineWidth = lw; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  const a = Math.atan2(y2 - y1, x2 - x1); g.beginPath(); g.moveTo(x2, y2); g.lineTo(x2 - 8 * Math.cos(a - 0.4), y2 - 8 * Math.sin(a - 0.4)); g.lineTo(x2 - 8 * Math.cos(a + 0.4), y2 - 8 * Math.sin(a + 0.4)); g.fill(); }
const text = (g, s, x, y, col = C.text, size = 11, align = 'left') => { g.fillStyle = col; g.font = `${size}px sans-serif`; g.textAlign = align; g.fillText(s, x, y); g.textAlign = 'left'; };
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
    body: `두 천체만 있고 서로의 중력만 작용하면, 가벼운 쪽이 무거운 쪽 둘레를 도는 궤도는 언제나 <b>원뿔 곡선</b>(원, 타원, 포물선, 쌍곡선)입니다. 어느 것이 되는지는 출발 속도 하나로 정해집니다.
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
    body: `탐사선이 궤도를 도는 동안 속도와 거리는 계속 바뀌지만, <b>비에너지 ε</b>, <b>비각운동량 h</b>, 근점을 가리키는 <b>이심률 벡터 e</b>는 그대로입니다. 궤도를 이 세 값으로 기억하면 모든 계산이 쉬워집니다.`,
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
    body: `모양(긴반지름 a, 이심률 e), 기울기(경사각 i), 놓인 방향(승교점 경도 Ω, 근점 인수 ω), 그리고 지금 위치(진근점 이각 ν)입니다. 슬라이더를 움직여 각 요소가 궤도를 어떻게 바꾸는지 보세요. 회색 원이 기준면(적도면 또는 황도면)입니다.`,
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
    body: `평균 근점 이각 M은 시간에 비례해 고르게 늘어나지만, 실제 위치(이심 근점 이각 E, 진근점 이각 ν)는 근점 근처에서 빨리, 원점 근처에서 천천히 움직입니다. M에서 E를 구하는 식은 대수적으로 풀리지 않아 뉴턴법으로 반복해서 풉니다.`,
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
    body: `두 원 궤도 사이를 옮길 때 보통은 두 번 분사하는 호만 전이가 가장 쌉니다. 그런데 바깥 궤도가 안쪽의 약 12배보다 멀면, 일부러 더 멀리 나갔다가 돌아오는 <b>이중 타원 전이</b>(세 번 분사)가 더 적게 듭니다. 대신 시간이 훨씬 오래 걸립니다.`,
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
    body: `궤도면을 기울이려면 속도의 방향을 돌려야 하는데, 속도가 클수록 비쌉니다. 지구 저궤도(7.8 km/s)에서 60°를 바꾸려면 7.8 km/s가 들어 새 위성을 쏘는 것과 비슷합니다. 그래서 면 변경은 속도가 느린 원점에서, 다른 분사와 <b>합쳐서</b> 합니다.`,
    deep: String.raw`크기 변화와 방향 변화를 한 번에 하면 코사인 법칙 <span class="tex">\Delta v = \sqrt{v_1^2+v_2^2-2v_1v_2\cos\Delta i}</span>. 정지궤도 위성은 발사장 위도(나로 34.4°, 케이프커내버럴 28.5°)만큼 기울어진 전이 궤도의 원점에서 원 궤도화와 면 변경을 함께 합니다. 적도에 가까운 발사장이 유리한 이유입니다.`,
    widget(box) { const K = canvas(box), di = slider(box, '바꿀 경사각 Δi', 0, 60, 0.5, 28.5, (x) => x + '°'), R = readout(box);
      return () => { clear(K); const d = di.value * D2R, v1 = 1.597, v2 = 3.075, sep = (v2 - v1) + 2 * v2 * Math.sin(d / 2), comb = Math.sqrt(v1 * v1 + v2 * v2 - 2 * v1 * v2 * Math.cos(d)), leo = 2 * 7.784 * Math.sin(d / 2);
        const bars = [['지구 저궤도에서 면 변경만', leo, C.pink], ['정지궤도: 원 궤도화 후 면 변경', sep, C.amber], ['정지궤도: 원점에서 함께', comb, C.teal]], mx = Math.max(8, leo);
        bars.forEach(([l, v, c], k) => { const y = 30 + k * 62; K.g.fillStyle = c; K.g.fillRect(12, y, (K.w - 24) * v / mx, 22); text(K.g, `${l}: ${fmt(v, 2)} km/s`, 12, y + 38, C.text, 11); });
        R([['GTO 원점 속도', '1.60 km/s'], ['정지궤도 속도', '3.07 km/s'], ['합쳐서 아끼는 양', `${fmt(sep - comb, 2)} km/s`]]); }; } },
  { id: 'oberth', level: '전공', title: '오베르트 효과', tag: '빠를 때 밟는 가속 페달',
    eq: String.raw`v_\infty = \sqrt{(v_p+\Delta v)^2 - v_\text{esc}^2}`,
    body: `같은 Δv라도 행성 가까이(빠르게 움직일 때) 분사하면 얻는 에너지가 더 큽니다. 운동 에너지 변화가 <b>v·Δv</b>에 비례하기 때문입니다. 탈출 후 남는 속도 v∞를 분사 고도에 따라 비교해 보세요.`,
    deep: String.raw`<span class="tex">\Delta\varepsilon = v\,\Delta v + \tfrac12\Delta v^2</span>. 연료 자체가 가진 운동 에너지가 함께 쓰이는 것이라 에너지 보존과 모순되지 않습니다. 근점에서 분사하는 동력 플라이바이, 태양 근처에서 분사하는 '오베르트 기동'으로 탈출 속도를 크게 늘리는 방안이 연구되어 있습니다.`,
    widget(box) { const K = canvas(box), dv = slider(box, '분사량 Δv (km/s)', 0.5, 6, 0.1, 4, (x) => x.toFixed(1)), R = readout(box);
      return () => { clear(K); const d = +dv.value, xs = [], ys = []; for (let h = 200; h <= 100000; h *= 1.08) { const r = RE + h, vc = Math.sqrt(MU_E / r), ve = vc * Math.SQRT2, q = (vc + d) ** 2 - ve * ve; xs.push(h); ys.push(q > 0 ? Math.sqrt(q) : NaN); }
        plot(K, xs, [{ ys, col: C.teal, label: '원 궤도에서 분사한 뒤 남는 v∞' }], { logx: true, x0: 200, x1: 100000, y0: 0, xl: '분사 고도 (km, 로그)', yl: 'v∞ (km/s)' });
        const at = (h) => { const r = RE + h, vc = Math.sqrt(MU_E / r), q = (vc + d) ** 2 - 2 * vc * vc; return q > 0 ? Math.sqrt(q) : 0; };
        R([['고도 200 km에서', at(200) > 0 ? `${fmt(at(200), 2)} km/s` : '탈출 못 함'], ['고도 36,000 km에서', `${fmt(at(35786), 2)} km/s`], ['무한히 먼 곳 (Δv 그대로)', `${fmt(d, 2)} km/s`]]); }; } },
  { id: 'rocket', level: '기초', title: '로켓 방정식', tag: '왜 로켓은 대부분이 연료인가',
    eq: String.raw`\Delta v = I_\text{sp}\,g_0\ln\frac{m_0}{m_f}`,
    body: `로켓이 낼 수 있는 속도 변화는 배기 속도(비추력 I_sp)와 질량비의 <b>로그</b>에 비례합니다. 지구 저궤도까지 약 9.4 km/s(공기 저항과 중력 손실 포함)가 드는데, 케로신 엔진으로는 질량비가 20이 넘어야 해서 여러 단으로 나눕니다.`,
    deep: String.raw`운동량 보존 <span class="tex">m\,dv = -v_e\,dm</span>를 적분하면 됩니다(치올코프스키, 1903). 단을 나누면 다 쓴 탱크를 버려 남은 질량비가 좋아집니다. 이온 엔진은 I_sp가 3,000 s 이상이지만 추력이 작아 몇 달에 걸쳐 가속합니다.`,
    widget(box) { const K = canvas(box), isp = slider(box, '비추력 I_sp (초)', 200, 4000, 10, 311), mr = slider(box, '질량비 m₀/m_f', 1, 25, 0.1, 8, (x) => x.toFixed(1)), R = readout(box);
      return () => { clear(K); const I = +isp.value, xs = []; for (let x = 1; x <= 25; x += 0.2) xs.push(x);
        plot(K, xs, [{ ys: xs.map(x => I * G0 * Math.log(x) / 1000), col: C.teal, label: `I_sp ${I} s` }, { ys: xs.map(() => 9.4), col: C.pink, lw: 1, label: '지구 저궤도 ≈ 9.4 km/s' }], { x0: 1, x1: 25, y0: 0, y1: Math.max(12, I * G0 * Math.log(25) / 1000), xl: '질량비', yl: 'Δv (km/s)' });
        const dvv = I * G0 * Math.log(+mr.value) / 1000; R([['이 로켓의 Δv', `${fmt(dvv, 2)} km/s`], ['연료 비율', `${fmt((1 - 1 / mr.value) * 100, 1)}%`], ['9.4 km/s에 필요한 질량비', fmt(Math.exp(9400 / (I * G0)), 1)], ['참고', '고체 ~250 s · 케로신 ~311 s · 수소 ~450 s · 이온 ~3,000 s']]); }; } },
  { id: 'soi', level: '교양', title: '영향권과 패치드 코닉', tag: '누구의 중력을 따를 것인가',
    eq: String.raw`r_\text{SOI} = a\left(\frac{m}{M}\right)^{2/5}`,
    body: `탐사선이 행성 가까이 있을 때는 행성의 중력을, 멀리 있을 때는 태양의 중력을 주로 받습니다. 그 경계가 <b>영향권</b>입니다. 행성 사이 여행을 '태양 둘레 궤도 + 행성 둘레 쌍곡선' 조각으로 이어 붙여 계산하는 방법이 패치드 코닉 근사입니다.`,
    deep: String.raw`라플라스의 정의: 두 가지 분해(태양 중심 + 행성 섭동, 행성 중심 + 태양 섭동)에서 섭동/주중력 비가 같아지는 거리입니다. 힐 반지름 <span class="tex">r_H = a(m/3M)^{1/3}</span>은 위성이 안정하게 머물 수 있는 범위로 영향권보다 큽니다. 샌드박스의 플라이바이 실습에서 영향권 경계에서 시작하면 태양의 조석력 때문에 공식과 어긋나는 것을 직접 볼 수 있습니다.`,
    widget(box) { const K = canvas(box, 340, 250), R = readout(box);
      return () => { clear(K); const list = ['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'], KO = ['수성', '금성', '지구', '화성', '목성', '토성', '천왕성', '해왕성'], mx = Math.log10(1e8), mn = Math.log10(5e4);
        list.forEach((n, k) => { const s = O.BODY[n].soi, y = 14 + k * 28, w = (Math.log10(s) - mn) / (mx - mn) * (K.w - 120); K.g.fillStyle = C.teal; K.g.fillRect(70, y, w, 14);
          text(K.g, KO[k], 8, y + 11, C.text, 11); text(K.g, `${fmt(s / 1e6, 2)}백만 km`, 74 + w, y + 11, C.mute, 10); });
        text(K.g, '막대 길이: 로그 눈금', 8, K.h - 4, C.mute, 10); R([['달까지 거리', '38만 km (지구 영향권 92.5만 km 안)'], ['목성 영향권', '태양-지구 거리의 3분의 1']]); }; } },
  { id: 'flyby', level: '전공', title: '중력 도움과 꺾임각', tag: '행성에게 속도를 빌리기',
    eq: String.raw`\delta = 2\arcsin\frac{1}{1 + r_p v_\infty^2/\mu}`,
    body: `행성 기준으로는 들어올 때와 나갈 때 속력이 같고 방향만 δ만큼 꺾입니다. 태양 기준 속도는 행성 속도를 더한 것이라, 방향이 바뀌면 크기도 바뀝니다. 가까이, 천천히 지나갈수록 많이 꺾입니다.`,
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
    body: `"이 날 지구를 떠나 저 날 화성에 닿으려면 어떤 궤도로 가야 하나?"가 램버트 문제입니다. 출발점, 도착점, 비행 시간을 정하면(같은 방향으로 한 바퀴 안에서) 궤도가 하나로 정해집니다. 아래에서 두 점의 각도와 비행 시간을 바꿔 보세요.`,
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
    body: `지구는 적도가 불룩해서(J2 = 1.0826×10⁻³) 궤도면이 천천히 돕니다. 이 회전 속도를 1년에 한 바퀴(하루 0.9856°)로 맞추면, 궤도면이 늘 태양과 같은 각도를 유지하는 <b>태양동기 궤도</b>가 됩니다. 아리랑·차세대중형위성 같은 지구 관측 위성이 매일 같은 지방시에 지나가는 이유입니다.`,
    deep: String.raw`J2는 지구 중력 퍼텐셜의 구면 조화 전개에서 가장 큰 비구형 항입니다. 근점 인수도 <span class="tex">\dot\omega = \tfrac34 nJ_2(R/p)^2(5\cos^2 i - 1)</span>로 도는데, i = 63.4°에서 멈춥니다. 몰니야 궤도가 이 경사각을 쓰는 이유입니다.`,
    widget(box) { const K = canvas(box), alt = slider(box, '고도 (km)', 200, 1500, 10, 528), inc = slider(box, '경사각 i', 0, 180, 0.1, 97.5, (x) => x + '°'), R = readout(box);
      const rate = (h, i) => { const a = RE + h, n = Math.sqrt(MU_E / a ** 3); return -1.5 * n * 1.08263e-3 * (RE / a) ** 2 * Math.cos(i * D2R) * 180 / Math.PI * 86400; };
      return () => { clear(K); const xs = []; for (let h = 200; h <= 1500; h += 10) xs.push(h);
        const P = plot(K, xs, [{ ys: xs.map(h => Math.acos(-0.98565 / Math.abs(rate(h, 0)) ) / D2R), col: C.teal, label: '태양동기에 필요한 경사각' }], { x0: 200, x1: 1500, y0: 95, y1: 103, xl: '고도 (km)', yl: '경사각 (°)', yd: 0 });
        dot(K.g, P.X(+alt.value), P.Y(Math.min(103, Math.max(95, +inc.value))), 4, C.amber);
        const r = rate(+alt.value, +inc.value); R([['궤도면 회전', `${fmt(r, 4)}°/일`], ['태양동기 조건', '+0.9856°/일'], ['이 고도의 태양동기 경사각', `${fmt(Math.acos(-0.98565 / Math.abs(rate(+alt.value, 0))) / D2R, 2)}°`], ['아리랑 3호 (고도 약 685 km)', `${fmt(Math.acos(-0.98565 / Math.abs(rate(685, 0))) / D2R, 2)}°`]]); }; } },
  { id: 'cr3bp', level: '전공', title: '제한 삼체 문제와 야코비 상수', tag: '갈 수 있는 곳과 갈 수 없는 곳',
    eq: String.raw`C = 2\Omega(x,y) - v^2,\quad \Omega = \tfrac12(x^2+y^2) + \frac{1-\mu}{r_1} + \frac{\mu}{r_2}`,
    body: `지구와 달이 함께 도는 좌표계에서는 에너지 대신 <b>야코비 상수 C</b>가 보존됩니다. C가 크면(에너지가 작으면) 탐사선은 지구 둘레나 달 둘레에 갇히고, C를 낮추면 L1 목이 열려 달로 건너갈 수 있습니다. 어두운 영역은 그 C로는 갈 수 없는 곳입니다.`,
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
    body: `원 궤도를 도는 정거장 기준으로 본 우주선의 움직임은 직관과 다릅니다. 정거장 쪽으로 밀면 오히려 위로 떠오르며 뒤처지고, 아래 궤도로 가면 앞서 나갑니다. x는 지구 반대쪽(위), y는 진행 방향(앞)입니다. 초기 위치와 속도를 바꿔 보세요.`,
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
    body: `궤도의 크기(긴반지름 a)만 알면 어느 거리 r에서든 속도가 정해집니다. 원 궤도 속도, 탈출 속도, 호만 전이의 분사량이 모두 이 식에서 나옵니다. 샌드박스 실습에서 실제 N체 계산과 맞는지 확인해 보세요.`,
    deep: String.raw`에너지 보존 <span class="tex">\tfrac{v^2}{2} - \tfrac{\mu}{r} = \varepsilon</span>에 타원 궤도의 에너지 <span class="tex">\varepsilon = -\tfrac{\mu}{2a}</span>를 넣으면 됩니다. a → ∞이면 포물선(탈출), a < 0이면 쌍곡선으로 같은 식이 그대로 쓰입니다.`,
    widget(box) { const K = canvas(box), aa = slider(box, '긴반지름 a (AU)', 0.6, 5, 0.05, 1.5, (x) => x.toFixed(2)), R = readout(box);
      return () => { clear(K); const a = +aa.value, xs = []; for (let r = 0.2; r <= 6; r += 0.02) xs.push(r); const k = O.KMS * Math.sqrt(O.MU_SUN);
        plot(K, xs, [{ ys: xs.map(r => r < 2 * a ? k * Math.sqrt(2 / r - 1 / a) : NaN), col: C.teal, label: `a = ${a} AU 궤도의 속도` }, { ys: xs.map(r => k * Math.sqrt(1 / r)), col: C.mute, lw: 1, label: '원 궤도 속도' }, { ys: xs.map(r => k * Math.sqrt(2 / r)), col: C.pink, lw: 1, label: '탈출 속도' }], { x0: 0.2, x1: 6, y0: 0, y1: 80, xl: '태양에서 거리 r (AU)', yl: 'km/s', yd: 0 });
        R([['1 AU에서', `${fmt(k * Math.sqrt(Math.max(0, 2 - 1 / a)), 2)} km/s`], ['근일점이 1 AU일 때 원일점', a > 0.5 ? `${fmt(2 * a - 1, 2)} AU` : '-'], ['같은 거리의 원 궤도 속도', `${fmt(k, 2)} km/s`]]); }; },
    lab: 'visviva' },
];

// ---- deck UI ----
function openCard(card) {
  const box = root.querySelector('.cc-detail'); box.innerHTML = ''; box.hidden = false; root.querySelector('.cc-grid').hidden = true;
  const back = el('button', 'cc-back', '← 카드 목록'); back.onclick = () => { box.hidden = true; root.querySelector('.cc-grid').hidden = false; cancelAnimationFrame(anim); };
  const left = el('div', 'cc-left'), right = el('div', 'cc-right');
  left.append(el('div', 'cc-level ' + card.level, card.level), el('h2', '', card.title), el('div', 'cc-tag', card.tag), el('div', 'cc-eq', `<span class="tex block">${card.eq}</span>`), el('p', '', card.body));
  const d = el('details', 'cc-deep'); d.append(el('summary', '', '전공 심화: 유도와 실제'), el('div', '', card.deep)); left.append(d);
  if (card.lab && opts.openLab) left.append(Object.assign(el('button', 'cc-lab', '샌드박스 실습 열기'), { onclick: () => { close(); opts.openLab(card.lab); } }));
  const draw = card.widget(right); box.append(back, el('div', 'cc-body')); box.querySelector('.cc-body').append(left, right); renderTex(box);
  cancelAnimationFrame(anim); const loop = () => { if (box.hidden || root.hidden) return; draw(); anim = requestAnimationFrame(loop); }; loop();
}
let anim = 0;
function build() {
  root = el('div', 'cc-root'); root.innerHTML = `<div class="cc-win"><div class="cc-head"><b>우주동역학 개념 카드</b><span class="small">카드를 눌러 직접 조작해 보세요 · 기초 · 교양 · 전공</span><button class="cc-x">×</button></div><div class="cc-grid"></div><div class="cc-detail" hidden></div></div>`;
  document.body.append(root); root.querySelector('.cc-x').onclick = close; root.onclick = (e) => { if (e.target === root) close(); };
  const grid = root.querySelector('.cc-grid');
  for (const c of CARDS) { const b = el('button', 'cc-card'); b.append(el('span', 'cc-level ' + c.level, c.level), el('b', '', c.title), el('span', 'cc-tag', c.tag), el('span', 'cc-mini', `<span class="tex">${c.eq}</span>`)); b.onclick = () => openCard(c); grid.append(b); }
  renderTex(grid);
}
export function openCards(o = {}) { opts = o; if (!root) build(); root.hidden = false; if (o.card) { const c = CARDS.find(x => x.id === o.card); if (c) openCard(c); } }
function close() { if (root) { root.hidden = true; cancelAnimationFrame(anim); } }
