// Orbital mechanics for the sandbox: units AU, day, solar mass unless a name says otherwise.
// Universal-variable Kepler propagation and Lambert solver (Curtis, "Orbital Mechanics for Engineering Students", ch. 3 and 5;
// Vallado, "Fundamentals of Astrodynamics", alg. 58), patched-conic flyby formulas.

export const AU_KM = 149597870.7, DAY_S = 86400, KMS = AU_KM / DAY_S; // 1 AU/day in km/s
export const MU_SUN = 2.9591220828559115e-4; // AU^3/day^2
export const MU_SUN_KM = 1.32712440018e11;    // km^3/s^2
// GM (km^3/s^2), radius (km), mean orbit radius (AU) and sphere of influence (km)
export const BODY = {
  Mercury: { mu: 22031.78, R: 2440, a: 0.387 }, Venus: { mu: 324858.59, R: 6052, a: 0.723 }, Earth: { mu: 398600.44, R: 6371, a: 1.0 },
  Mars: { mu: 42828.37, R: 3390, a: 1.524 }, Jupiter: { mu: 126686534, R: 71492, a: 5.203 }, Saturn: { mu: 37931187, R: 60268, a: 9.537 },
  Uranus: { mu: 5793939, R: 25559, a: 19.19 }, Neptune: { mu: 6836529, R: 24764, a: 30.07 },
};
for (const b of Object.values(BODY)) b.soi = b.a * AU_KM * Math.pow(b.mu / MU_SUN_KM, 0.4);

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const vec = { dot, cross, norm, add, scale };

// Stumpff functions C(z), S(z)
function stumpC(z) { if (z > 1e-8) return (1 - Math.cos(Math.sqrt(z))) / z; if (z < -1e-8) return (Math.cosh(Math.sqrt(-z)) - 1) / -z; return 0.5 - z / 24; }
function stumpS(z) { if (z > 1e-8) { const s = Math.sqrt(z); return (s - Math.sin(s)) / (s * s * s); }
  if (z < -1e-8) { const s = Math.sqrt(-z); return (Math.sinh(s) - s) / (s * s * s); } return 1 / 6 - z / 120; }

// state after dt on a two-body orbit (any conic)
export function propagate(r0, v0, dt, mu = MU_SUN) {
  const r0n = norm(r0), vr0 = dot(r0, v0) / r0n, alpha = 2 / r0n - dot(v0, v0) / mu, sm = Math.sqrt(mu);
  let x = sm * Math.abs(alpha) * dt; if (!isFinite(x) || x === 0) x = sm * dt / r0n;
  for (let i = 0; i < 60; i++) {
    const z = alpha * x * x, C = stumpC(z), S = stumpS(z);
    const F = r0n * vr0 / sm * x * x * C + (1 - alpha * r0n) * x * x * x * S + r0n * x - sm * dt;
    const dF = r0n * vr0 / sm * x * (1 - alpha * x * x * S) + (1 - alpha * r0n) * x * x * C + r0n;
    const d = F / dF; x -= d; if (Math.abs(d) < 1e-12 * Math.max(1, Math.abs(x))) break;
  }
  const z = alpha * x * x, C = stumpC(z), S = stumpS(z);
  const f = 1 - x * x / r0n * C, g = dt - x * x * x * S / sm, r = add(scale(r0, f), v0, g), rn = norm(r);
  const fd = sm / (rn * r0n) * (alpha * x * x * x * S - x), gd = 1 - x * x / rn * C;
  return { r, v: add(scale(r0, fd), v0, gd) };
}

// Lambert: velocities at r1 and r2 for a transfer taking tof (single revolution, prograde by default)
export function lambert(r1, r2, tof, mu = MU_SUN, prograde = true) {
  const n1 = norm(r1), n2 = norm(r2), c = cross(r1, r2);
  let dth = Math.acos(Math.max(-1, Math.min(1, dot(r1, r2) / (n1 * n2))));
  if (prograde ? c[2] < 0 : c[2] >= 0) dth = 2 * Math.PI - dth;
  const A = Math.sin(dth) * Math.sqrt(n1 * n2 / (1 - Math.cos(dth)));
  if (!isFinite(A) || Math.abs(A) < 1e-12) return null;
  const y = (z) => n1 + n2 + A * (z * stumpS(z) - 1) / Math.sqrt(stumpC(z));
  const F = (z) => { const yy = y(z); return Math.pow(yy / stumpC(z), 1.5) * stumpS(z) + A * Math.sqrt(yy) - Math.sqrt(mu) * tof; };
  let lo = -400, hi = 4 * Math.PI * Math.PI - 1e-9; // negative z = hyperbolic (fast, escaping) transfers, like Voyager after Saturn
  while (y(lo) < 0 && lo < hi) lo += 0.1; // y must be positive
  if (F(lo) > 0 || F(hi - 1e-6) < 0) return null; // no single-revolution solution in range
  let z = 0;
  for (let i = 0; i < 200; i++) { z = (lo + hi) / 2; const v = F(z); if (Math.abs(v) < 1e-12) break; if (v > 0) hi = z; else lo = z; if (hi - lo < 1e-12) break; }
  const yy = y(z), f = 1 - yy / n1, g = A * Math.sqrt(yy / mu), gd = 1 - yy / n2;
  return { v1: scale(add(r2, r1, -f), 1 / g), v2: scale(add(scale(r2, gd), r1, -1), 1 / g) };
}

// orbit elements from a state (for readouts)
export function elements(r, v, mu = MU_SUN) {
  const rn = norm(r), v2 = dot(v, v), en = v2 / 2 - mu / rn, a = -mu / (2 * en);
  const h = cross(r, v), ev = add(scale(cross(v, h), 1 / mu), r, -1 / rn), e = norm(ev);
  return { a, e, energy: en, rp: a * (1 - e), ra: e < 1 ? a * (1 + e) : Infinity, period: e < 1 ? 2 * Math.PI * Math.sqrt(a * a * a / mu) : Infinity, i: Math.acos(h[2] / norm(h)) };
}

// patched-conic flyby: turning angle and hyperbola for v_inf (km/s) and periapsis radius rp (km)
export function flyby(mu, vinf, rp) {
  const e = 1 + rp * vinf * vinf / mu, delta = 2 * Math.asin(1 / e), b = rp * Math.sqrt(1 + 2 * mu / (rp * vinf * vinf));
  return { e, delta, b, vp: Math.sqrt(vinf * vinf + 2 * mu / rp) };
}
// periapsis radius needed to turn v_inf by delta (inverse of the above)
export const rpForTurn = (mu, vinf, delta) => (1 / Math.sin(delta / 2) - 1) * mu / (vinf * vinf);

// Delta-v from a circular parking orbit (radius rpark, km) onto a hyperbola with excess speed vinf (km/s)
export const dvDepart = (mu, rpark, vinf) => Math.sqrt(vinf * vinf + 2 * mu / rpark) - Math.sqrt(mu / rpark);
// Hohmann transfer between circular orbits r1 -> r2 (same units as mu)
export function hohmann(r1, r2, mu = MU_SUN) {
  const at = (r1 + r2) / 2, v1 = Math.sqrt(mu / r1), v2 = Math.sqrt(mu / r2);
  const dv1 = Math.sqrt(mu * (2 / r1 - 1 / at)) - v1, dv2 = v2 - Math.sqrt(mu * (2 / r2 - 1 / at));
  return { dv1, dv2, tof: Math.PI * Math.sqrt(at * at * at / mu), at };
}
