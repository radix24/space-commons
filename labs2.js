// Stage-3 sandbox labs that run their own small simulations on a canvas inside the lab panel:
// D1 Earth-orbit design, D2 launch to orbit, D3 galaxy collision, D4 the Sun's life, D5 black-hole lensing, D6 impact debris.
// h = helpers from sandbox.js: { labBox, steps, field, num, btn, results, deeper, el, fmt }
const MU = 398600.4418, RE = 6378.137, J2 = 1.08263e-3, WE = 7.2921159e-5; // Earth: km^3/s^2, km, -, rad/s
const D2R = Math.PI / 180, R2D = 180 / Math.PI;
function canvas(h, box, w = 340, hh = 200) { const c = h.el('canvas', 'sb-vec'); const r = Math.min(2, devicePixelRatio || 1); c.width = w * r; c.height = hh * r; c.style.width = '100%'; c.style.aspectRatio = `${w} / ${hh}`; box.append(c); const g = c.getContext('2d'); g.scale(r, r); return { c, g, w, h: hh }; }
function loop(cv, f) { let last = performance.now(); const step = (t) => { if (!cv.c.isConnected) return; f(Math.min(0.05, (t - last) / 1000)); last = t; requestAnimationFrame(step); }; requestAnimationFrame(step); }
const txt = (g, s, x, y, col = '#d8d2c6', size = 10, al = 'left') => { g.fillStyle = col; g.font = `${size}px "Pretendard Variable", "Malgun Gothic", sans-serif`; g.textAlign = al; g.fillText(s, x, y); g.textAlign = 'left'; };

// ---- D1: design an Earth orbit, see its ground track and how long a Korean ground station can talk to it ----
const PRESETS = { iss: ['국제우주정거장', 420, 51.6, 0, 0], sso: ['다목적실용위성 3호 (태양동기)', 685, 98.1, 0, 0], geo: ['천리안 2A (정지궤도)', 35786, 0.05, 0, 128.2], molniya: ['몰니야 궤도', 0, 63.4, 0.74, 0], gps: ['GPS', 20200, 55, 0, 0] };
export function labOrbitDesign(h) {
  const box = h.labBox('지구 둘레 궤도 설계', '높이와 기울기를 정하면 위성이 지구 위를 지나가는 길(지상 궤적)과, 대전 지상국과 하루에 몇 분 교신할 수 있는지 계산합니다.');
  h.steps(box, ['미리 만든 궤도를 골라 보거나, 높이와 경사각을 직접 정하세요.', '태양동기 궤도는 경사각이 약 98°일 때 궤도면이 하루 0.9856°씩 돌아 1년에 한 바퀴를 맞춥니다.', '정지궤도는 지상 궤적이 한 점에 머뭅니다.']);
  const sel = h.el('select'); for (const [k, v] of Object.entries(PRESETS)) sel.append(new Option(v[0], k)); h.field(box, '미리 만든 궤도', sel);
  const alt = h.field(box, '높이 (km, 원 궤도)', h.num(685, 10, 160, 40000)), inc = h.field(box, '경사각 (°)', h.num(98.1, 0.1, 0, 180)), ecc = h.field(box, '이심률 (몰니야 0.74)', h.num(0, 0.01, 0, 0.8));
  const cv = canvas(h, box, 340, 170), set = h.results(box);
  sel.onchange = () => { const p = PRESETS[sel.value]; alt.value = p[1] || 26600 - RE; inc.value = p[2]; ecc.value = p[3]; draw(); };
  const map = new Image(); map.src = 'textures/2k_earth_daymap.jpg'; map.onload = () => draw();
  for (const i of [alt, inc, ecc]) i.oninput = () => draw();
  function draw() {
    const e = +ecc.value, a = e > 0 ? 26600 : RE + +alt.value, i = +inc.value * D2R, n = Math.sqrt(MU / a ** 3), P = 2 * Math.PI / n, p = a * (1 - e * e);
    const dO = -1.5 * n * J2 * (RE / p) ** 2 * Math.cos(i), dw = 0.75 * n * J2 * (RE / p) ** 2 * (5 * Math.cos(i) ** 2 - 1), w0 = e > 0 ? 270 * D2R : 0;
    const { g, w, h: H } = cv; g.clearRect(0, 0, w, H); if (map.complete) g.drawImage(map, 0, 0, w, H); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 0, w, H);
    const gs = [36.37 * D2R, 127.36 * D2R], X = (lo) => (lo * R2D + 180) / 360 * w, Y = (la) => (90 - la * R2D) / 180 * H;
    g.fillStyle = '#e2573f'; g.fillRect(X(gs[1]) - 2, Y(gs[0]) - 2, 4, 4); txt(g, '대전 지상국', X(gs[1]) + 4, Y(gs[0]) - 3, '#e2573f', 9);
    let contact = 0, prev = null, lon0 = sel.value === 'geo' && e === 0 && +inc.value < 1 ? 128.2 * D2R : 0; const dt = 30, T = 86400;
    g.strokeStyle = 'rgba(143,184,201,.9)'; g.lineWidth = 1.2; g.beginPath();
    for (let t = 0; t <= T; t += dt) { let M = n * t, E = M; for (let k = 0; k < 12; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
      const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2)), r = a * (1 - e * Math.cos(E)), u = nu + w0 + dw * t, O = dO * t;
      const x = r * (Math.cos(O) * Math.cos(u) - Math.sin(O) * Math.sin(u) * Math.cos(i)), y = r * (Math.sin(O) * Math.cos(u) + Math.cos(O) * Math.sin(u) * Math.cos(i)), z = r * Math.sin(u) * Math.sin(i);
      const la = Math.asin(z / r), lo = ((Math.atan2(y, x) - WE * t + lon0 + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
      if (prev && Math.abs(lo - prev) > Math.PI) { g.stroke(); g.beginPath(); g.moveTo(X(lo), Y(la)); } else if (!prev) g.moveTo(X(lo), Y(la)); else g.lineTo(X(lo), Y(la)); prev = lo;
      // elevation from Daejeon
      const sx = Math.cos(gs[0]) * Math.cos(gs[1]) * RE, sy = Math.cos(gs[0]) * Math.sin(gs[1]) * RE, sz = Math.sin(gs[0]) * RE, cx = r * Math.cos(la) * Math.cos(lo), cy = r * Math.cos(la) * Math.sin(lo), cz = r * Math.sin(la);
      const dx = cx - sx, dy = cy - sy, dz = cz - sz, d = Math.hypot(dx, dy, dz), el = Math.asin((dx * sx + dy * sy + dz * sz) / (d * RE)); if (el > 10 * D2R) contact += dt; }
    g.stroke();
    const sso = 360 / 365.2422 / 86400 * D2R;
    set([['주기', `${h.fmt(P / 60, 1)}분 (하루 ${h.fmt(86400 / P, 2)}바퀴)`], ['궤도면이 도는 빠르기', `하루 ${h.fmt(dO * 86400 * R2D, 3)}°${Math.abs(dO - sso) / sso < 0.05 ? ' · 태양동기 조건 충족' : ''}`],
      ['대전 지상국 교신 (고도 10° 이상)', contact >= 86000 ? '하루 종일 (정지궤도)' : `하루 약 ${h.fmt(contact / 60, 0)}분`], ['원 궤도 속도', `${h.fmt(Math.sqrt(MU / a), 2)} km/s`]]);
  }
  sel.value = 'sso'; sel.onchange();
  h.deeper(box, '지구가 적도 쪽으로 불룩해서(J2 = 1.083×10⁻³) 궤도면이 천천히 돕니다: <span class="tex">\\dot\\Omega = -\\tfrac{3}{2} n J_2 (R/p)^2 \\cos i</span>. 몰니야 궤도는 경사각 63.4°에서 근지점이 움직이지 않아(<span class="tex">5\\cos^2 i = 1</span>), 원지점이 늘 북반구 고위도 위에 머뭅니다. 교신 시간은 지구를 공으로, 대기 굴절 없이 고도 10° 이상일 때로 계산했습니다.');
}

// ---- D2: fly a three-stage rocket from the pad to orbit (2D, drag, gravity turn) ----
export function labLaunch(h) {
  const box = h.labBox('로켓 발사부터 궤도까지', '누리호와 비슷한 3단 로켓을 수직으로 쏘아 올린 뒤 살짝 기울여(피치 킥) 중력 선회로 궤도에 올립니다.');
  h.steps(box, ['피치 킥 각도와 시점을 정하고 발사하세요. 1~2°만 기울여도 충분합니다: 나머지는 중력이 알아서 눕혀 줍니다.', '너무 일찍 크게 기울이면 공기 저항과 열로 손해를 보고, 너무 늦으면 수직으로만 올라가 옆으로 빠르지 못해 다시 떨어집니다.', '목표: 고도 700 km, 초속 7.5 km 안팎의 원 궤도 (누리호 3차 발사는 550 km).']);
  const kick = h.field(box, '피치 킥 각도 (°)', h.num(1.2, 0.1, 0, 15)), tk = h.field(box, '피치 킥 시점 (초)', h.num(16, 1, 5, 60));
  const cv = canvas(h, box, 340, 200), set = h.results(box);
  // stage: [wet mass t, dry mass t, thrust kN (vac), Isp s, burn s]; payload 1.5 t. Values are representative, not official.
  const ST = [[144, 14, 3000, 290, 127], [44.5, 5.5, 788, 315, 143], [13.4, 2.4, 78, 325, 500]];
  let S = null;
  box.append(h.btn('발사', () => { S = { t: 0, x: 0, y: 0, vx: 0, vy: 0, st: 0, burnt: 0, path: [], kicked: false, done: '' }; }, 'sb-go'));
  loop(cv, (dt) => {
    const { g, w, h: H } = cv; g.fillStyle = '#0c0c0d'; g.fillRect(0, 0, w, H);
    const X = (x) => 20 + x / 2400 * (w - 40), Y = (y) => H - 18 - y / 1000 * (H - 30);
    g.strokeStyle = '#2a2927'; g.beginPath(); g.moveTo(X(0), Y(0)); g.lineTo(X(2400), Y(0)); g.stroke(); txt(g, '수평 거리 (km) →', w - 20, H - 4, '#8e887d', 9, 'right'); txt(g, '고도 1000 km', 22, 12, '#8e887d', 9);
    if (!S) return set([['안내', '"발사"를 누르세요']]);
    for (let k = 0; k < 40 && !S.done; k++) { const h2 = 0.5; S.t += h2; // seconds per sub-step, sim runs ~40x real time
      const r = Math.hypot(S.x, RE + S.y), gacc = MU / r ** 2, st = ST[S.st], pay = 1.5, upper = ST.slice(S.st + 1).reduce((s, q) => s + q[0], 0);
      const mdot = st ? st[0] - st[1] : 0, m = st ? st[0] - (st[0] - st[1]) * Math.min(1, S.burnt / st[4]) + upper + pay : pay + 0.5;
      const v = Math.hypot(S.vx, S.vy), rho = 1.225 * Math.exp(-S.y / 8.5), drag = 0.5 * rho * (v * 1000) ** 2 * 0.3 * 7 / (m * 1000) / 1000; // N / kg = m/s^2, then km/s^2
      let thr = 0; if (st && S.burnt < st[4]) { thr = st[2] * (S.st === 0 ? 0.9 + 0.1 * Math.min(1, S.y / 30) : 1) / m / 1000; S.burnt += h2; } else if (st) { S.st++; S.burnt = 0; }
      if (!S.kicked && S.t >= +tk.value) { S.kicked = true; const a = +kick.value * D2R, vv = Math.max(0.05, v); S.vx = vv * Math.sin(a); S.vy = vv * Math.cos(a); }
      const dir = v > 0.01 && S.kicked ? [S.vx / v, S.vy / v] : [0, 1];   // gravity turn: thrust along velocity
      const cent = S.vx ** 2 / (RE + S.y);                                 // curvature of the Earth in a flat picture
      S.vx += (thr * dir[0] - drag * (S.vx / (v || 1))) * h2; S.vy += (thr * dir[1] - drag * (S.vy / (v || 1)) - gacc + cent) * h2;
      S.x += S.vx * h2; S.y += S.vy * h2; if (S.path.length === 0 || S.t % 10 < h2) S.path.push([S.x, S.y]);
      if (S.y < 0 && S.t > 5) S.done = '추락: 옆으로 충분히 빠르지 못했습니다';
      if (S.st >= 3) { const vc = Math.sqrt(MU / (RE + S.y)); S.done = S.vx >= vc * 0.985 && S.y > 150 ? `궤도 진입 성공 · 고도 ${h.fmt(S.y, 0)} km` : S.vx >= vc * 0.9 ? '거의 성공: 조금 모자라 대기로 다시 들어옵니다' : '연료를 다 썼지만 궤도 속도에 못 미칩니다'; }
      if (S.t > 1400) S.done = S.done || '시간 초과'; }
    g.strokeStyle = '#e2573f'; g.beginPath(); S.path.forEach(([x, y], i) => i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))); g.stroke();
    const vc = Math.sqrt(MU / (RE + Math.max(0, S.y)));
    set([['시간', `${h.fmt(S.t, 0)}초 · ${Math.min(3, S.st + 1)}단`], ['고도', `${h.fmt(S.y, 1)} km`], ['수평 속도 / 그 고도의 궤도 속도', `${h.fmt(S.vx, 2)} / ${h.fmt(vc, 2)} km/s`], ['결과', S.done || '비행 중']]);
  });
  h.deeper(box, '로켓이 얻는 속도는 치올콥스키 식 <span class="tex">\\Delta v = I_{sp} g_0 \\ln(m_0/m_f)</span>로 정해지지만, 올라가는 동안 중력을 이기느라(중력 손실, 1~1.5 km/s)와 공기 저항(0.1~0.3 km/s)으로 잃는 몫이 있어 저궤도에 실제로는 약 9.3~10 km/s가 필요합니다. 중력 선회는 추력을 늘 속도 방향으로 두어 날개 없이도 비행 경로가 자연스럽게 눕게 하는 방법으로, 공기 저항이 큰 저고도에서 받음각을 0으로 지켜 구조에 무리가 가지 않게 합니다. 여기의 단별 수치는 대표값입니다.');
}

// ---- D3: two disc galaxies pass each other (Toomre & Toomre 1972: massive cores, test-particle discs) ----
export function labGalaxies(h) {
  const box = h.labBox('은하 충돌', '두 은하의 중심만 서로 끌어당기고, 원반의 별들은 그 중력을 따라 움직입니다. 지나가는 거리와 기울기에 따라 꼬리와 다리가 생깁니다 (툼레 형제의 계산, 1972).');
  h.steps(box, ['처음 거리와 원반 기울기를 정하고 시작하세요.', '가까이 지나칠수록 긴 조석 꼬리가 생기고, 원반이 궤도와 같은 방향으로 돌 때(순행) 꼬리가 가장 뚜렷합니다.', '"우리 은하와 안드로메다"는 약 45억 년 뒤 첫 근접을 재현합니다.']);
  const peri = h.field(box, '가장 가까울 때 거리 (원반 반지름 단위)', h.num(1.4, 0.1, 0.3, 4)), tilt = h.field(box, '두 번째 원반 기울기 (°)', h.num(30, 5, 0, 180));
  const cv = canvas(h, box, 340, 260), set = h.results(box); let S = null;
  const start = (mw) => { const N = matchMedia('(max-width: 640px)').matches ? 1200 : 3000, rp = +peri.value, cores = [{ m: 1, p: [-4, -rp / 2, 0], v: [0.36, 0, 0] }, { m: mw ? 1.3 : 1, p: [4, rp / 2, 0], v: [-0.36, 0, 0] }];
    const parts = []; let s = 7;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let c = 0; c < 2; c++) { const tl = c ? +tilt.value * D2R : 0, M = cores[c].m;
      for (let k = 0; k < N; k++) { const r = 0.2 + 0.8 * Math.sqrt(rnd()), th = rnd() * 2 * Math.PI, vc = Math.sqrt(M / r), x = r * Math.cos(th), y = r * Math.sin(th);
        const P = [x, y * Math.cos(tl), y * Math.sin(tl)], V = [-vc * Math.sin(th), vc * Math.cos(th) * Math.cos(tl), vc * Math.cos(th) * Math.sin(tl)];
        parts.push({ p: P.map((q, i) => q + cores[c].p[i]), v: V.map((q, i) => q + cores[c].v[i]), c }); } }
    S = { cores, parts, t: 0 }; };
  box.append(h.btn('시작', () => start(false), 'sb-go'), h.btn('우리 은하와 안드로메다', () => { peri.value = 1.0; tilt.value = 70; start(true); }));
  const acc = (p, cores) => { const a = [0, 0, 0]; for (const c of cores) { const d = [c.p[0] - p[0], c.p[1] - p[1], c.p[2] - p[2]], r2 = d[0] ** 2 + d[1] ** 2 + d[2] ** 2 + 0.04, f = c.m / (r2 * Math.sqrt(r2)); a[0] += f * d[0]; a[1] += f * d[1]; a[2] += f * d[2]; } return a; };
  loop(cv, () => {
    const { g, w, h: H } = cv; g.fillStyle = 'rgba(12,12,13,.55)'; g.fillRect(0, 0, w, H); if (!S) return set([['안내', '"시작"을 누르세요']]);
    for (let k = 0; k < 6; k++) { const dt = 0.02; // leapfrog: cores pull each other, everything feels the cores
      for (const c of S.cores) { const o = S.cores.find(q => q !== c), a = acc(c.p, [o]); for (let i = 0; i < 3; i++) c.v[i] += a[i] * dt; } for (const c of S.cores) for (let i = 0; i < 3; i++) c.p[i] += c.v[i] * dt;
      for (const q of S.parts) { const a = acc(q.p, S.cores); for (let i = 0; i < 3; i++) { q.v[i] += a[i] * dt; q.p[i] += q.v[i] * dt; } } S.t += dt; }
    const sc = Math.min(w, H) / 14, cx = w / 2, cy = H / 2;
    for (const q of S.parts) { g.fillStyle = q.c ? 'rgba(255,200,150,.8)' : 'rgba(150,190,255,.8)'; g.fillRect(cx + q.p[0] * sc, cy - q.p[1] * sc, 1.3, 1.3); }
    for (const c of S.cores) { g.fillStyle = '#fff'; g.beginPath(); g.arc(cx + c.p[0] * sc, cy - c.p[1] * sc, 2.5, 0, 7); g.fill(); }
    const d = Math.hypot(...S.cores[0].p.map((v, i) => v - S.cores[1].p[i]));
    set([['시간', `약 ${h.fmt(S.t * 0.11, 2)}억 년 (원반 반지름 15 kpc 기준)`], ['두 중심 사이', `${h.fmt(d, 2)} (원반 반지름 단위)`]]);
  });
  h.deeper(box, '실제 은하는 암흑 물질 헤일로와 가스 때문에 이 모형보다 빨리 합쳐집니다. 그래도 별끼리는 거의 부딪히지 않습니다: 별 사이 거리가 별 크기의 수천만 배라 은하 충돌은 별들의 충돌이 아니라 궤도끼리의 뒤섞임입니다. 생쥐 은하(NGC 4676), 안테나 은하(NGC 4038/4039)가 이 계산으로 처음 설명되었습니다.');
}

// ---- D4: the Sun's life replayed: radius against the planets' orbits ----
const SUNLIFE = [[0, 0.89, 0.7, '주계열 시작'], [4.6, 1, 1, '지금'], [10, 1.6, 1.8, '주계열 끝'], [11, 2.3, 2.3, '준거성'], [11.8, 15, 30, '적색거성 가지'], [12.15, 170, 2300, '적색거성 끝: 가장 큼'], [12.2, 10, 45, '헬륨 태우기'], [12.33, 220, 5000, '점근 거성 가지'], [12.34, 0.02, 3000, '행성상 성운'], [12.4, 0.012, 0.5, '백색왜성']];
export function labSunLife(h) {
  const box = h.labBox('태양의 일생', '태양이 나이 들며 부풀어 적색거성이 되면 수성과 금성을 삼키고, 지구는 아슬아슬합니다. 태양이 질량을 잃어 행성 궤도는 바깥으로 밀려납니다.');
  h.steps(box, ['나이를 움직여 태양의 크기와 밝기가 어떻게 바뀌는지 보세요.', '태양은 적색거성 때 질량의 약 30%를 잃어 행성 궤도가 그만큼 넓어집니다 (a ∝ 1/M).']);
  const age = h.el('input'); age.type = 'range'; age.min = 0; age.max = 12.4; age.step = 0.01; age.value = 4.6; h.field(box, '나이 (10억 년)', age);
  const cv = canvas(h, box, 340, 220), set = h.results(box);
  const PL = [['수성', 0.387], ['금성', 0.723], ['지구', 1], ['화성', 1.524]];
  const at = (t) => { let k = 0; while (k < SUNLIFE.length - 2 && SUNLIFE[k + 1][0] <= t) k++; const A = SUNLIFE[k], B = SUNLIFE[k + 1], f = Math.max(0, Math.min(1, (t - A[0]) / (B[0] - A[0])));
    return { R: Math.exp(Math.log(A[1]) + (Math.log(B[1]) - Math.log(A[1])) * f), L: Math.exp(Math.log(A[2]) + (Math.log(B[2]) - Math.log(A[2])) * f), st: f < 0.5 ? A[3] : B[3] }; };
  const draw = () => { const t = +age.value, s = at(t), M = t < 11.8 ? 1 : t < 12.34 ? 1 - 0.3 * (t - 11.8) / 0.54 : 0.54, { g, w, h: H } = cv;
    g.fillStyle = '#0c0c0d'; g.fillRect(0, 0, w, H); const sc = (w / 2 - 10) / 1.7, cx = w / 2, cy = H / 2, Rau = s.R * 0.00465;
    const col = s.R > 5 ? '#ff7a3a' : s.R < 0.05 ? '#dfe7ff' : '#ffd27a'; const gr = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(2, Rau * sc)); gr.addColorStop(0, '#fff2d0'); gr.addColorStop(1, col); g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, Math.max(2, Rau * sc), 0, 7); g.fill();
    const eaten = []; PL.forEach(([n, a0]) => { const a = a0 / M; g.strokeStyle = a < Rau ? 'rgba(226,87,63,.6)' : '#3a3936'; g.beginPath(); g.arc(cx, cy, a * sc, 0, 7); g.stroke(); if (a < Rau) eaten.push(n); else txt(g, n, cx + a * sc + 3, cy - 3, '#d8d2c6', 9); });
    set([['단계', s.st], ['반지름', `태양 지금의 ${h.fmt(s.R, s.R < 1 ? 3 : 0)}배 (${h.fmt(Rau, Rau < 0.1 ? 4 : 2)} AU)`], ['밝기', `${h.fmt(s.L, s.L < 10 ? 1 : 0)}배`], ['남은 질량', `${h.fmt(M * 100, 0)}%`], ['삼켜진 행성', eaten.join(', ') || '없음']]); };
  age.oninput = draw; draw();
  h.deeper(box, '적색거성 가지 끝에서 태양 반지름은 약 1.2 AU까지 커진다고 계산됩니다(Schröder & Smith 2008). 질량 손실로 지구 궤도도 약 1.5 AU로 넓어지지만, 부푼 태양의 바깥 대기가 일으키는 조석과 끌림 때문에 결국 삼켜질 가능성이 큽니다. 여기의 반지름과 밝기는 대표 진화 경로를 단순화한 값입니다.');
}

// ---- D5: gravitational lensing by a black hole, traced per pixel ----
export function labLensing(h) {
  const box = h.labBox('블랙홀의 빛 휘어짐', '블랙홀 뒤에 있는 별과 은하의 빛이 중력에 휘어 고리(아인슈타인 고리)와 이중상이 생깁니다. 마우스로(또는 터치로) 블랙홀을 움직여 보세요.');
  h.steps(box, ['블랙홀이 배경 바로 앞에 오면 배경의 한 점이 고리처럼 퍼집니다.', '질량이 4배가 되면 고리 반지름은 2배입니다 (θ_E ∝ √M).']);
  const mass = h.el('input'); mass.type = 'range'; mass.min = 0.2; mass.max = 4; mass.step = 0.05; mass.value = 1; h.field(box, '질량 (상대값)', mass);
  const cv = canvas(h, box, 320, 220), set = h.results(box), W = 320, H = 220;
  const bg = document.createElement('canvas'); bg.width = W; bg.height = H; const bgc = bg.getContext('2d'); bgc.fillStyle = '#05060a'; bgc.fillRect(0, 0, W, H); let s = 3; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let k = 0; k < 900; k++) { const b = rnd(); bgc.fillStyle = `rgba(255,${220 + 35 * rnd() | 0},${190 + 60 * rnd() | 0},${0.3 + 0.7 * b})`; bgc.fillRect(rnd() * W, rnd() * H, b > 0.95 ? 2 : 1, b > 0.95 ? 2 : 1); }
  const gx = W * 0.62, gy = H * 0.45; for (let k = 0; k < 400; k++) { const r = Math.abs(rnd() * 22), a = rnd() * 7; bgc.fillStyle = 'rgba(180,170,255,.25)'; bgc.fillRect(gx + r * Math.cos(a) * 1.6, gy + r * Math.sin(a), 1.5, 1.5); }
  bgc.fillStyle = '#ffd27a'; bgc.beginPath(); bgc.arc(W * 0.5, H * 0.5, 2.2, 0, 7); bgc.fill();
  const src = bgc.getImageData(0, 0, W, H).data; let lx = W / 2 + 18, ly = H / 2 + 6;
  const move = (e) => { const r = cv.c.getBoundingClientRect(), p = e.touches ? e.touches[0] : e; lx = (p.clientX - r.left) / r.width * W; ly = (p.clientY - r.top) / r.height * H; draw(); };
  cv.c.addEventListener('mousemove', move); cv.c.addEventListener('touchmove', (e) => { e.preventDefault(); move(e); }, { passive: false });
  const img = cv.g.createImageData(W * (cv.c.width / W), H * (cv.c.height / H));
  function draw() { const tE = 28 * Math.sqrt(+mass.value), rs = tE * 0.18, k = cv.c.width / W, out = img.data, Wd = img.width, Hd = img.height;
    for (let y = 0; y < Hd; y++) for (let x = 0; x < Wd; x++) { const dx = x / k - lx, dy = y / k - ly, r2 = dx * dx + dy * dy, o = (y * Wd + x) * 4;
      if (r2 < rs * rs) { out[o] = out[o + 1] = out[o + 2] = 0; out[o + 3] = 255; continue; }
      const f = 1 - tE * tE / Math.max(1e-6, r2), sx = Math.round(lx + dx * f), sy = Math.round(ly + dy * f); // lens equation: beta = theta - thetaE^2 / theta
      if (sx < 0 || sy < 0 || sx >= W || sy >= H) { out[o] = out[o + 1] = out[o + 2] = 0; out[o + 3] = 255; continue; } const i = (sy * W + sx) * 4; out[o] = src[i]; out[o + 1] = src[i + 1]; out[o + 2] = src[i + 2]; out[o + 3] = 255; }
    cv.g.setTransform(1, 0, 0, 1, 0, 0); cv.g.putImageData(img, 0, 0); cv.g.setTransform(k, 0, 0, k, 0, 0);
    cv.g.strokeStyle = 'rgba(226,87,63,.35)'; cv.g.setLineDash([3, 3]); cv.g.beginPath(); cv.g.arc(lx, ly, tE, 0, 7); cv.g.stroke(); cv.g.setLineDash([]);
    set([['아인슈타인 반지름 (점선)', `${h.fmt(tE, 0)} 픽셀 · 질량의 제곱근에 비례`], ['검은 원', '빛이 빠져나오지 못하는 그림자 (크기는 과장)']]); }
  mass.oninput = draw; draw();
  h.deeper(box, '점 질량 렌즈의 렌즈 방정식은 <span class="tex">\\beta = \\theta - \\theta_E^2/\\theta</span>이고, 아인슈타인 반지름은 <span class="tex">\\theta_E = \\sqrt{\\frac{4GM}{c^2}\\frac{D_{LS}}{D_L D_S}}</span>입니다. 배경 별이 렌즈 바로 뒤(β = 0)면 고리가 되고, 조금 벗어나면 렌즈 양쪽에 상이 두 개 생깁니다. 미세 중력 렌즈법으로 외계 행성을 찾는 원리도 같습니다.');
}

// ---- D6: an impact between two rubble planets: gravity, contact pressure and damping (a simple SPH-like particle model) ----
export function labImpact(h) {
  const box = h.labBox('충돌 파편의 물리', '두 천체를 작은 덩어리 수백 개로 만들어 중력, 맞닿을 때의 압력, 마찰로 움직입니다. 비스듬히 부딪히면 파편이 원반을 이루고, 일부가 다시 뭉쳐 위성이 됩니다 (달 탄생 가설).');
  h.steps(box, ['충돌 각도와 속도를 정하고 부딪혀 보세요.', '정면충돌은 대부분 합쳐지고, 45° 안팎의 비스듬한 충돌이 가장 많은 파편을 궤도에 남깁니다.']);
  const ang = h.field(box, '충돌 각도 (°, 0 = 정면)', h.num(45, 5, 0, 80)), spd = h.field(box, '충돌 속도 (탈출 속도 배수)', h.num(1.1, 0.05, 0.8, 3));
  const cv = canvas(h, box, 320, 260), set = h.results(box); let P = null;
  const make = () => { P = []; const blob = (cx, cy, R, n, vx, vy, c) => { for (let k = 0; k < n; k++) { const r = R * Math.sqrt(Math.random()), a = Math.random() * 7; P.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), vx, vy, c, iron: r < R * 0.5 }); } };
    const N = matchMedia('(max-width: 640px)').matches ? 260 : 520, a = +ang.value * D2R, v = +spd.value * 0.55;
    blob(0, 0, 1, N, 0, 0, 0); blob(-3.2, Math.sin(a) * 1.5, 0.55, Math.round(N * 0.18), v, 0, 1); };
  box.append(h.btn('부딪히기', make, 'sb-go'));
  loop(cv, () => { const { g, w, h: H } = cv; g.fillStyle = '#0c0c0d'; g.fillRect(0, 0, w, H); if (!P) return set([['안내', '"부딪히기"를 누르세요']]);
    const n = P.length, G = 0.6 / n, s = 0.09, dt = 0.012;
    for (let it = 0; it < 4; it++) { for (let i = 0; i < n; i++) { const a = P[i]; let ax = 0, ay = 0;
        for (let j = 0; j < n; j++) { if (i === j) continue; const b = P[j], dx = b.x - a.x, dy = b.y - a.y, r2 = dx * dx + dy * dy + 1e-4, r = Math.sqrt(r2);
          ax += G * dx / (r2 * r) * 1; ay += G * dy / (r2 * r) * 1;
          if (r < s) { const push = (s - r) / s * 4, rvx = b.vx - a.vx, rvy = b.vy - a.vy; ax -= dx / r * push - rvx * 1.5; ay -= dy / r * push - rvy * 1.5; } } // pressure and friction when touching
        a.ax = ax; a.ay = ay; }
      for (const a of P) { a.vx += a.ax * dt; a.vy += a.ay * dt; a.x += a.vx * dt; a.y += a.vy * dt; } }
    let cx = 0, cy = 0; for (const a of P) { cx += a.x; cy += a.y; } cx /= n; cy /= n;
    const sc = Math.min(w, H) / 8; let disk = 0, esc = 0;
    for (const a of P) { const r = Math.hypot(a.x - cx, a.y - cy); if (r > 1.25) { const v2 = a.vx ** 2 + a.vy ** 2; if (v2 > 2 * 0.6 / r) esc++; else disk++; }
      g.fillStyle = a.c ? (a.iron ? '#e2573f' : '#d9a650') : (a.iron ? '#8f5a3a' : '#8fb8c9'); g.fillRect(w / 2 + (a.x - cx) * sc - 1, H / 2 - (a.y - cy) * sc - 1, 2.2, 2.2); }
    set([['궤도를 도는 파편 (원반)', `${disk}개 (${h.fmt(disk / n * 100, 1)}%)`], ['날아가 버린 파편', `${esc}개`], ['색', '파랑: 원시 지구 · 노랑: 테이아 · 붉은 기: 철 핵']]); });
  h.deeper(box, '실제 연구는 수백만 개의 입자로 압력과 온도까지 계산하는 SPH(매끄러운 입자 유체 역학)를 씁니다(Canup 2004, 2012). 여기서는 입자 사이 중력과 맞닿았을 때의 반발·마찰만 넣은 간이 모형이라, 모양과 경향(비스듬한 충돌이 원반을 만든다)만 비슷합니다. 달에 철이 적은 이유도 이 그림으로 설명됩니다: 무거운 철 핵은 지구 쪽으로 합쳐지고 가벼운 맨틀 물질이 원반에 남습니다.');
}

// ---- E1: real observations ----
const getJSON = (u) => fetch(u).then(r => r.json());
export async function labTess(h) {
  const box = h.labBox('실제 자료: TESS로 외계 행성 찾기', 'NASA TESS 망원경이 2018년 WASP-18 별을 27일 동안 2분마다 잰 밝기입니다. 주기적으로 어두워지는 순간이 행성이 별 앞을 지나는 때입니다.');
  h.steps(box, ['위 그래프에서 규칙적으로 움푹 꺼지는 곳을 찾으세요.', '"접기 주기"를 바꿔 가며 모든 식 현상이 한 곳에 겹치는 주기를 찾으세요. 맞으면 아래 그래프에 깊은 골 하나가 또렷해집니다.', '골의 깊이로 행성 크기를 구합니다: 깊이 = (행성 반지름 ÷ 별 반지름)².']);
  const P = h.el('input'); P.type = 'range'; P.min = 0.5; P.max = 3; P.step = 0.0005; P.value = 1.3; h.field(box, '접기 주기 (일)', P);
  const c1 = canvas(h, box, 340, 120), c2 = canvas(h, box, 340, 140), set = h.results(box);
  const d = await getJSON('data/real-tess-wasp18.json'), rows = d.rows;
  const plot = (cv, xs, ys, x0, x1, y0, y1, col) => { const { g, w, h: H } = cv; g.fillStyle = '#0f0f10'; g.fillRect(0, 0, w, H); g.fillStyle = col;
    for (let i = 0; i < xs.length; i++) g.fillRect(8 + (xs[i] - x0) / (x1 - x0) * (w - 16), 6 + (y1 - ys[i]) / (y1 - y0) * (H - 18), 1.4, 1.4); };
  const draw = () => { const per = +P.value; plot(c1, rows.map(r => r[0]), rows.map(r => r[1]), 0, rows[rows.length - 1][0], -12, 3, '#8fb8c9'); txt(c1.g, '시간 (일) →', c1.w - 10, c1.h - 2, '#8e887d', 9, 'right');
    const ph = rows.map(r => (((r[0] / per) % 1) + 1) % 1); plot(c2, ph, rows.map(r => r[1]), 0, 1, -12, 3, '#d9a650'); txt(c2.g, '주기로 접은 위상 →', c2.w - 10, c2.h - 2, '#8e887d', 9, 'right');
    const bins = new Array(50).fill(0).map(() => []); ph.forEach((p, i) => bins[Math.floor(p * 50) % 50].push(rows[i][1])); const means = bins.map(b => b.length ? b.reduce((s, v) => s + v, 0) / b.length : 0), depth = -Math.min(...means);
    set([['접기 주기', `${h.fmt(per, 4)}일`], ['가장 깊은 골', `${h.fmt(depth, 2)} ppt (천분율)`], ['행성 반지름 / 별 반지름', `${h.fmt(Math.sqrt(depth / 1000), 3)}`], ['정답과 비교', Math.abs(per - d.period_days) < 0.003 ? `맞습니다: WASP-18b, 주기 ${d.period_days}일, 목성보다 약 1.2배 큰 뜨거운 목성` : '아직 골이 흩어져 있습니다']]); };
  P.oninput = draw; draw();
  h.deeper(box, '자료: NASA TESS 2섹터, 탐지 검증(DV) 보고서의 추세 제거 광도 곡선(exo.MAST)을 10분 단위로 묶었습니다. 별 반지름(태양의 약 1.23배)을 곱하면 행성 반지름이 나오고, 같은 별을 시선 속도로 재면 질량(목성의 약 10배)도 알 수 있어 밀도를 구할 수 있습니다.');
}
export async function labSdss(h) {
  const box = h.labBox('실제 자료: 은하의 적색편이 재기', 'SDSS(슬론 디지털 전천 탐사)가 찍은 실제 은하의 스펙트럼입니다. 수소와 산소, 나트륨 같은 원소의 선이 실험실보다 긴 파장 쪽으로 밀려 있습니다.');
  h.steps(box, ['점선은 실험실에서 잰 선의 위치에 적색편이 z를 곱해 옮긴 것입니다.', 'z를 바꿔 점선이 스펙트럼의 뾰족한 봉우리(방출선)와 골(흡수선)에 겹치게 맞추세요.', '찾은 z로 은하가 멀어지는 속도와 거리를 구합니다.']);
  const Z = h.el('input'); Z.type = 'range'; Z.min = 0; Z.max = 0.2; Z.step = 0.0005; Z.value = 0.05; h.field(box, '적색편이 z', Z);
  const cv = canvas(h, box, 340, 200), set = h.results(box), d = await getJSON('data/real-sdss-galaxy.json'), rows = d.rows;
  const LINES = [[3727, '[O II]'], [3934, 'Ca K'], [3969, 'Ca H'], [4861, 'Hβ'], [5007, '[O III]'], [5175, 'Mg'], [5894, 'Na D'], [6563, 'Hα'], [6583, '[N II]'], [6717, '[S II]']];
  const fmax = Math.max(...rows.map(r => r[1])) * 1.05, x0 = rows[0][0], x1 = rows[rows.length - 1][0];
  const draw = () => { const z = +Z.value, { g, w, h: H } = cv, X = (l) => 10 + (l - x0) / (x1 - x0) * (w - 20), Y = (f) => H - 18 - Math.max(0, f) / fmax * (H - 30);
    g.fillStyle = '#0f0f10'; g.fillRect(0, 0, w, H); g.strokeStyle = '#d8d2c6'; g.lineWidth = 1; g.beginPath(); rows.forEach(([l, f], i) => i ? g.lineTo(X(l), Y(f)) : g.moveTo(X(l), Y(f))); g.stroke();
    g.setLineDash([3, 3]); for (const [l, n] of LINES) { const lo = l * (1 + z); if (lo < x0 || lo > x1) continue; g.strokeStyle = 'rgba(226,87,63,.7)'; g.beginPath(); g.moveTo(X(lo), 10); g.lineTo(X(lo), H - 18); g.stroke(); txt(g, n, X(lo) + 2, 10 + (n.length % 3) * 9, '#e2573f', 8); } g.setLineDash([]);
    txt(g, `${Math.round(x0)} Å`, 10, H - 4, '#8e887d', 9); txt(g, `${Math.round(x1)} Å`, w - 10, H - 4, '#8e887d', 9, 'right');
    const v = 299792 * ((1 + z) ** 2 - 1) / ((1 + z) ** 2 + 1), D = v / 70;
    set([['적색편이 z', h.fmt(z, 4)], ['멀어지는 속도', `${h.fmt(v, 0)} km/s`], ['허블 법칙 거리 (H₀ = 70)', `약 ${h.fmt(D, 0)} Mpc (${h.fmt(D * 3.2616 / 100, 1)}억 광년)`], ['SDSS 파이프라인 값과 비교', Math.abs(z - d.z_pipeline) < 0.002 ? `맞습니다 (z = ${d.z_pipeline})` : '선이 아직 어긋나 있습니다']]); };
  Z.oninput = draw; draw();
  h.deeper(box, '자료: SDSS DR17, 판 1198 · 관측일 MJD 52669 · 광섬유 61번 스펙트럼을 4 Å 단위로 묶었습니다. Hα(6563 Å)와 [N II], [O III] 같은 방출선은 별이 태어나는 가스 구름에서, Ca H·K와 Na D 흡수선은 늙은 별들의 대기에서 나옵니다. 속도는 상대론적 도플러 식으로 구했고, 이 거리에서는 허블 법칙이 잘 맞습니다.');
}
export async function labGaiaHR(h) {
  const box = h.labBox('실제 자료: 가이아로 그린 H-R도', '유럽우주국 가이아 위성이 거리를 정밀하게 잰, 100 pc(326광년) 안의 별 6천 개입니다. 색(BP−RP)과 절대 등급으로 찍으면 H-R도가 저절로 나타납니다.');
  h.steps(box, ['왼쪽 위에서 오른쪽 아래로 이어지는 굵은 띠가 주계열입니다.', '왼쪽 아래의 따로 떨어진 무리가 백색왜성입니다.', '거리를 줄여 가며 어떤 별이 사라지는지 보세요: 가까운 곳에는 어두운 적색왜성이 대부분입니다.']);
  const dist = h.el('input'); dist.type = 'range'; dist.min = 10; dist.max = 100; dist.step = 5; dist.value = 100; h.field(box, '이 거리 안의 별만 (pc, 가까운 별이 먼저)', dist);
  const cv = canvas(h, box, 340, 260), set = h.results(box), d = await getJSON('data/real-gaia-hr.json'), rows = d.rows;
  const draw = () => { const { g, w, h: H } = cv, X = (c) => 30 + (c + 0.5) / 5 * (w - 40), Y = (m) => 10 + (m + 2) / 19 * (H - 30), n = Math.round(rows.length * (+dist.value / 100) ** 3);
    g.fillStyle = '#0f0f10'; g.fillRect(0, 0, w, H); let wd = 0, ms = 0, gi = 0;
    for (let i = 0; i < n; i++) { const [c, m] = rows[i]; const col = c < 0.3 ? '#a9c6ff' : c < 0.8 ? '#f4f1e6' : c < 1.5 ? '#ffd27a' : '#ff9a6a'; g.fillStyle = col; g.fillRect(X(c), Y(m), 1.5, 1.5);
      if (m > 10 && c < 1.0) wd++; else if (m < 4 && c > 0.9) gi++; else ms++; }
    txt(g, '← 파랗고 뜨거움   색 (BP−RP)   붉고 차가움 →', w / 2, H - 4, '#8e887d', 9, 'center'); txt(g, '밝음', 4, 16, '#8e887d', 9); txt(g, '어두움', 4, H - 22, '#8e887d', 9);
    txt(g, '주계열', X(1.4), Y(7) - 6, '#d9a650', 10); txt(g, '백색왜성', X(0), Y(13) + 4, '#a9c6ff', 10); txt(g, '거성', X(1.2), Y(0.5), '#ff9a6a', 10);
    set([['그린 별', `${n}개 (무작위 표본에서 거리 비율로 고름)`], ['주계열 / 백색왜성 / 거성 (대략)', `${ms} / ${wd} / ${gi}`]]); };
  dist.oninput = draw; draw();
  h.deeper(box, '자료: Gaia DR3, 연주시차 10 mas 이상(100 pc 안), 시차 정밀도 5% 이내인 별을 무작위로 6천 개 뽑았습니다. 절대 등급은 <span class="tex">M_G = G + 5\log_{10}(\varpi/100)</span>(ϖ는 mas 단위 시차)로 구했습니다. 거리 슬라이더는 부피에 비례해 표본 수를 줄인 근사입니다.');
}
