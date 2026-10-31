// Frame timing and automatic resolution: one helper shared by the sky/space view and the sandbox.
// Every two seconds the median frame time decides whether to draw fewer or more pixels, so a slow phone or an
// old laptop stays smooth instead of stuttering. ?fps=1 (or Shift+F) shows the numbers in a corner.
const STEPS = [0.6, 0.75, 1, 1.25, 1.5, 2];
const top = Math.min(devicePixelRatio || 1, 2);
const weak = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
let level = STEPS.findIndex(s => s >= (weak ? Math.min(1, top) : top)); if (level < 0) level = STEPS.length - 1;
const renderers = new Set(), times = [];
let windowStart = 0, calm = 0, meter = null;
const ratio = () => Math.min(STEPS[level], top);
export function watchRenderer(r) { renderers.add(r); r.setPixelRatio(ratio()); }
function setLevel(l) { level = Math.max(0, Math.min(STEPS.length - 1, l)); for (const r of renderers) r.setPixelRatio(ratio()); }
export function frameTick(now) {
  if (times.length < 240) times.push(now);
  if (!windowStart) windowStart = now;
  if (now - windowStart < 2000) return;
  const d = []; for (let i = 1; i < times.length; i++) d.push(times[i] - times[i - 1]);
  times.length = 0; windowStart = now; if (d.length < 10) return; // the tab was hidden or a long task stalled us: no verdict
  d.sort((a, b) => a - b); const med = d[d.length >> 1], fps = 1000 / med;
  if (fps < 32 && ratio() > STEPS[0]) { setLevel(level - 1); calm = 0; }
  else if (fps > 57 && STEPS[level] < top) { if (++calm >= 3) { setLevel(level + 1); calm = 0; } } // climb back slowly, after six smooth seconds
  else calm = 0;
  if (meter) meter.textContent = `${fps.toFixed(0)} fps · ${med.toFixed(1)} ms · 해상도 ×${ratio()}${weak ? ' · 저사양 기기' : ''}`;
}
function toggleMeter() {
  if (meter) { meter.remove(); meter = null; return; }
  meter = document.createElement('div'); meter.id = 'fps-meter'; meter.textContent = '측정 중…'; document.body.append(meter);
}
if (new URLSearchParams(location.search).get('fps') === '1') addEventListener('DOMContentLoaded', toggleMeter);
addEventListener('keydown', (e) => { if (e.shiftKey && e.code === 'KeyF' && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) toggleMeter(); });
