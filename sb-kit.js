// Small shared helpers for the sandbox add-on modules (sandbox-plus.js, sandbox-missions.js, orbits-gallery.js, sandbox-nuri.js).
import { tr } from './i18n.js';
export const D2R = Math.PI / 180, R2D = 180 / Math.PI;
export const NUM = '"IBM Plex Mono", ui-monospace, monospace', BODY = '"Pretendard Variable", Pretendard, "Malgun Gothic", sans-serif';
export const C = { bg: '#0a0f1c', grid: '#222842', mute: '#8D93B3', ink: '#E9ECF6', acc: '#4C8DF6', brass: '#C9A86A', star: '#F3E2A6', warn: '#ff7a5a', ok: '#7fd99a' };
// a crisp canvas inside a lab box; returns { c, g, w, h }
export function canvas(h, box, w = 340, hh = 200) {
  const c = h.el('canvas', 'sb-vec'); const r = Math.min(2, devicePixelRatio || 1); c.width = w * r; c.height = hh * r; c.style.width = '100%'; c.style.aspectRatio = `${w} / ${hh}`; box.append(c);
  const g = c.getContext('2d'); g.scale(r, r); return { c, g, w, h: hh };
}
// runs f(dt) every animation frame while the canvas is on the page
export function loop(cv, f) { let last = performance.now(); const step = (t) => { if (!cv.c.isConnected) return; f(Math.min(0.05, (t - last) / 1000)); last = t; requestAnimationFrame(step); }; requestAnimationFrame(step); }
export const txt = (g, s, x, y, col = C.ink, size = 10, al = 'left', font = BODY) => { g.fillStyle = col; g.font = `${size}px ${font}`; g.textAlign = al; g.fillText(tr(String(s)), x, y); g.textAlign = 'left'; };
export const numTxt = (g, s, x, y, col = C.ink, size = 10, al = 'left') => txt(g, s, x, y, col, size, al, NUM);
// a range slider with the sandbox gauge style, labelled; returns the input
export function slider(h, api, box, label, v, min, max, step, stops) {
  const r = h.el('input'); r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = v; if (stops) r.dataset.stops = stops;
  h.field(box, label, r); api.gauge(r); return r;
}
export function para(h, box, html, cls = 'small') { const d = h.el('div', cls, html); d.style.margin = '6px 0'; box.append(d); return d; }
// 4th-order Runge-Kutta step for y' = f(y), in place, with scratch arrays k1..k4, tmp of the same length
export function rk4(f, y, dt, s) {
  const n = y.length; f(y, s.k1); for (let i = 0; i < n; i++) s.t[i] = y[i] + s.k1[i] * dt / 2; f(s.t, s.k2); for (let i = 0; i < n; i++) s.t[i] = y[i] + s.k2[i] * dt / 2; f(s.t, s.k3);
  for (let i = 0; i < n; i++) s.t[i] = y[i] + s.k3[i] * dt; f(s.t, s.k4); for (let i = 0; i < n; i++) y[i] += dt / 6 * (s.k1[i] + 2 * s.k2[i] + 2 * s.k3[i] + s.k4[i]);
}
export const scratch = (n) => ({ k1: new Float64Array(n), k2: new Float64Array(n), k3: new Float64Array(n), k4: new Float64Array(n), t: new Float64Array(n) });
// circular restricted three-body problem in the co-rotating frame (units: separation 1, total mass 1, period 2 pi)
export function cr3bp(mu) {
  return (y, d) => { const x = y[0], yy = y[1], z = y[2], r1 = Math.hypot(x + mu, yy, z), r2 = Math.hypot(x - 1 + mu, yy, z), a = (1 - mu) / (r1 * r1 * r1), b = mu / (r2 * r2 * r2);
    d[0] = y[3]; d[1] = y[4]; d[2] = y[5];
    d[3] = 2 * y[4] + x - a * (x + mu) - b * (x - 1 + mu); d[4] = -2 * y[3] + yy - a * yy - b * yy; d[5] = -a * z - b * z; };
}
// collinear Lagrange point x for k = 1, 2, 3
export function lagrangeX(mu, k) {
  let x = k === 1 ? 1 - mu - Math.cbrt(mu / 3) : k === 2 ? 1 - mu + Math.cbrt(mu / 3) : -1 - 5 * mu / 12;
  const fx = (x) => { const r1 = Math.abs(x + mu), r2 = Math.abs(x - 1 + mu); return x - (1 - mu) * (x + mu) / (r1 ** 3) - mu * (x - 1 + mu) / (r2 ** 3); };
  for (let i = 0; i < 60; i++) { const e = 1e-7, d = (fx(x + e) - fx(x - e)) / (2 * e); x -= fx(x) / d; } return x;
}
