import { tr } from './i18n.js';
// Size comparison: planets, moons, dwarf planets and stars side by side at true relative size.
// Textured bodies are drawn as orthographic spheres from their surface maps; stars as limb-darkened discs coloured by temperature.
const KM_RSUN = 695700;
const BODIES = [
  { n: '수성', r: 2440, tex: 'mercury' }, { n: '금성', r: 6052, tex: 'venus_atmosphere' }, { n: '지구', r: 6371, tex: 'earth_daymap' }, { n: '화성', r: 3390, tex: 'mars' },
  { n: '목성', r: 69911, tex: 'jupiter' }, { n: '토성', r: 58232, tex: 'saturn', ring: [74500, 136800] }, { n: '천왕성', r: 25362, tex: 'uranus' }, { n: '해왕성', r: 24622, tex: 'neptune' },
  { n: '달', r: 1737, tex: 'moon' }, { n: '이오', r: 1822, tex: 'io' }, { n: '유로파', r: 1561, tex: 'europa' }, { n: '가니메데', r: 2634, tex: 'ganymede' }, { n: '칼리스토', r: 2410, tex: 'callisto' },
  { n: '타이탄', r: 2575, tex: 'titan' }, { n: '명왕성', r: 1188, tex: 'pluto' }, { n: '세레스', r: 470, tex: 'ceres' }, { n: '베스타', r: 263, tex: 'vesta' },
  { n: '태양', r: KM_RSUN, T: 5772, tex: 'sun' }, { n: '프록시마 센타우리', r: 0.154 * KM_RSUN, T: 3042 }, { n: '시리우스 A', r: 1.71 * KM_RSUN, T: 9940 }, { n: '시리우스 B (백색왜성)', r: 0.0084 * KM_RSUN, T: 25000 },
  { n: '베가', r: 2.36 * KM_RSUN, T: 9600 }, { n: '아크투르스', r: 25.4 * KM_RSUN, T: 4290 }, { n: '알데바란', r: 44 * KM_RSUN, T: 3900 }, { n: '리겔', r: 79 * KM_RSUN, T: 12100 },
  { n: '안타레스', r: 680 * KM_RSUN, T: 3570 }, { n: '베텔게우스', r: 764 * KM_RSUN, T: 3600 }, { n: '중성자별', r: 12, T: 600000 },
];
const B = Object.fromEntries(BODIES.map(b => [b.n, b]));
const SETS = [
  ['암석 행성', ['수성', '화성', '금성', '지구']],
  ['지구와 거대 행성', ['지구', '해왕성', '천왕성', '토성', '목성']],
  ['위성과 왜행성', ['베스타', '세레스', '명왕성', '유로파', '달', '이오', '칼리스토', '타이탄', '가니메데', '수성']],
  ['목성과 태양', ['지구', '목성', '태양']],
  ['가까운 별', ['프록시마 센타우리', '태양', '시리우스 A', '베가']],
  ['거성', ['태양', '아크투르스', '알데바란', '리겔']],
  ['초거성', ['리겔', '안타레스', '베텔게우스']],
  ['별의 최후', ['중성자별', '시리우스 B (백색왜성)', '지구']],
];
function starRGB(T) { // blackbody colour, Tanner Helland approximation
  const t = T / 100; let r = t <= 66 ? 255 : 329.7 * (t - 60) ** -0.1332, g = t <= 66 ? 99.47 * Math.log(t) - 161.1 : 288.1 * (t - 60) ** -0.0755, b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5 * Math.log(t - 10) - 305;
  return [r, g, b].map(v => Math.max(0, Math.min(255, v)) | 0);
}
const texCache = {};
function loadTex(name) {
  return texCache[name] ||= new Promise((ok) => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = 1024; c.height = 512; const g = c.getContext('2d'); g.drawImage(im, 0, 0, 1024, 512); ok(g.getImageData(0, 0, 1024, 512)); }; im.onerror = () => ok(null); im.src = `textures/2k_${name}.jpg`; });
}
function sphere(g, cx, cy, R, tex, rgb) { // orthographic sphere with simple lighting from the upper left
  R = Math.max(R, 0.6); if (R < 3 || !tex) { const gr = g.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.1, cx, cy, R); const [r, gg, b] = rgb || [200, 200, 200];
    gr.addColorStop(0, `rgb(${Math.min(255, r + 40)},${Math.min(255, gg + 40)},${Math.min(255, b + 40)})`); gr.addColorStop(1, `rgb(${r * 0.55 | 0},${gg * 0.55 | 0},${b * 0.55 | 0})`); g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill(); return; }
  const S = Math.ceil(R * 2), im = g.createImageData(S, S), d = tex.data, L = [-0.45, -0.4, 0.8], ln = Math.hypot(...L);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const nx = (x + 0.5 - R) / R, ny = (y + 0.5 - R) / R, q = nx * nx + ny * ny; if (q > 1) continue;
    const nz = Math.sqrt(1 - q), lat = Math.asin(-ny), lon = Math.atan2(nx, nz), u = ((lon / (2 * Math.PI) + 0.5) * 1024) | 0, v = ((0.5 - lat / Math.PI) * 512) | 0, k = (v * 1024 + u) * 4;
    const sh = rgb ? 0.55 + 0.45 * nz ** 0.5 : 0.18 + 0.82 * Math.max(0, (nx * L[0] + ny * L[1] + nz * L[2]) / ln), o = (y * S + x) * 4, a = Math.min(1, (1 - Math.sqrt(q)) * R);
    im.data[o] = d[k] * sh; im.data[o + 1] = d[k + 1] * sh; im.data[o + 2] = d[k + 2] * sh; im.data[o + 3] = 255 * a; }
  const c = document.createElement('canvas'); c.width = c.height = S; c.getContext('2d').putImageData(im, 0, 0); g.drawImage(c, cx - R, cy - R);
}
let root = null;
export async function openSizes() {
  if (!root) {
    root = document.createElement('div'); root.className = 'cc-root sz-root';
    root.innerHTML = `<div class="cc-win"><div class="cc-head"><b>크기 비교</b><span class="small">실제 크기 비율 그대로 · 표면 사진은 실제 지도</span><button class="cc-x">×</button></div>
      <div class="sz-tabs"></div><canvas class="sz-canvas"></canvas><div class="sz-info small"></div></div>`;
    document.body.append(root); root.querySelector('.cc-x').onclick = () => root.hidden = true; root.onclick = (e) => { if (e.target === root) root.hidden = true; };
    const tabs = root.querySelector('.sz-tabs'); SETS.forEach(([t], i) => { const b = document.createElement('button'); b.textContent = t; b.onclick = () => draw(i); tabs.append(b); });
    addEventListener('resize', () => { if (!root.hidden) draw(cur); });
  }
  root.hidden = false; draw(cur);
}
let cur = 0;
async function draw(i) {
  cur = i; root.querySelectorAll('.sz-tabs button').forEach((b, k) => b.classList.toggle('on', k === i));
  const names = SETS[i][1], list = names.map(n => B[n]), cv = root.querySelector('.sz-canvas'), W = cv.clientWidth || 800, H = Math.round(Math.min(460, W * 0.55)), pr = Math.min(2, devicePixelRatio || 1);
  cv.width = W * pr; cv.height = H * pr; cv.style.height = H + 'px'; const g = cv.getContext('2d'); g.setTransform(pr, 0, 0, pr, 0, 0);
  const texs = await Promise.all(list.map(b => b.tex && !b.T ? loadTex(b.tex) : b.tex === 'sun' ? loadTex('sun') : null)); if (cur !== i) return;
  g.fillStyle = '#0a0a0b'; g.fillRect(0, 0, W, H);
  const big = list[list.length - 1], ext = (b) => b.ring ? b.ring[1] : b.r, totalW = list.reduce((s, b) => s + 2 * ext(b), 0);
  // the largest body may be cut off at the right edge when it dwarfs the rest, like a horizon
  let k = Math.min((W - 40 - 14 * list.length - 80 * list.filter(b => b !== big).length) / totalW, (H - 70) / (2 * big.r)), clipBig = false;
  if (2 * ext(big) * k > W * 0.6 && list.length > 1) { const rest = totalW - 2 * ext(big); k = Math.min((H - 70) / 2 / Math.max(...list.slice(0, -1).map(b => b.r)), (W * 0.62) / Math.max(rest, 1)); clipBig = true; }
  const base = H - 40; let x = 20;
  list.forEach((b, j) => { const R = b.r * k, E = ext(b) * k, slot = Math.max(E, 40), cx = x + slot, yy = base - R;
    if (b.ring) { g.strokeStyle = 'rgba(214,196,150,.55)'; g.lineWidth = Math.max(1, (b.ring[1] - b.ring[0]) * k * 0.35); g.beginPath(); g.ellipse(cx, yy, (b.ring[0] + b.ring[1]) / 2 * k, (b.ring[0] + b.ring[1]) / 2 * k * 0.22, -0.12, 0, 7); g.stroke(); }
    sphere(g, cx, yy, R, R > 700 ? null : texs[j], b.T ? starRGB(b.T) : null);
    g.fillStyle = '#d8d2c6'; g.font = '12px "Pretendard Variable", "Malgun Gothic", sans-serif'; g.textAlign = 'center';
    const lx = Math.min(cx, W - 70); g.fillText(tr(b.n), lx, H - 22); g.fillStyle = '#8e887d'; g.font = '11px "Pretendard Variable", "Malgun Gothic", sans-serif';
    g.fillText(tr(b.r >= 0.05 * KM_RSUN && b.T ? `반지름 태양의 ${(b.r / KM_RSUN).toLocaleString('ko-KR', { maximumFractionDigits: b.r < KM_RSUN ? 3 : 0 })}배` : `반지름 ${Math.round(b.r).toLocaleString('ko-KR')} km`), lx, H - 8);
    x += 2 * slot + 14; });
  g.textAlign = 'left';
  const a = list[0], z = big; root.querySelector('.sz-info').textContent = `${z.n}의 반지름은 ${a.n}의 ${(z.r / a.r).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}배, 부피로는 ${((z.r / a.r) ** 3).toLocaleString('ko-KR', { maximumFractionDigits: 0 })}배입니다. ${clipBig ? '가장 큰 천체는 화면에 다 담기지 않아 일부만 보입니다.' : ''}`;
}
