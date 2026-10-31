// Small sky calculator for the intro pages: Sun, Moon and the bright planets seen from one place.
// Low-precision orbital elements (P. Schlyter, "How to compute planetary positions"): good to a fraction of a degree,
// plenty for "is it up tonight, and roughly where". The app itself uses the full ephemeris.
const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const rev = (x) => ((x % 360) + 360) % 360;
const sind = (x) => Math.sin(x * D2R), cosd = (x) => Math.cos(x * D2R);

export const SEOUL = { name: '서울', lat: 37.57, lon: 126.98 };
export const PLANETS = [
  { id: 'Mercury', ko: '수성' }, { id: 'Venus', ko: '금성' }, { id: 'Mars', ko: '화성' },
  { id: 'Jupiter', ko: '목성' }, { id: 'Saturn', ko: '토성' },
];

const dayNo = (t) => t / 86400000 + 2440587.5 - 2451543.5; // days since 2000 Jan 0.0 UT
const ELEM = {
  Mercury: (d) => [48.3313 + 3.24587e-5 * d, 7.0047 + 5e-8 * d, 29.1241 + 1.01444e-5 * d, 0.387098, 0.205635 + 5.59e-10 * d, 168.6562 + 4.0923344368 * d],
  Venus: (d) => [76.6799 + 2.4659e-5 * d, 3.3946 + 2.75e-8 * d, 54.891 + 1.38374e-5 * d, 0.72333, 0.006773 - 1.302e-9 * d, 48.0052 + 1.6021302244 * d],
  Mars: (d) => [49.5574 + 2.11081e-5 * d, 1.8497 - 1.78e-8 * d, 286.5016 + 2.92961e-5 * d, 1.523688, 0.093405 + 2.516e-9 * d, 18.6021 + 0.5240207766 * d],
  Jupiter: (d) => [100.4542 + 2.76854e-5 * d, 1.303 - 1.557e-7 * d, 273.8777 + 1.64505e-5 * d, 5.20256, 0.048498 + 4.469e-9 * d, 19.895 + 0.0830853001 * d],
  Saturn: (d) => [113.6634 + 2.3898e-5 * d, 2.4886 - 1.081e-7 * d, 339.3939 + 2.97661e-5 * d, 9.55475, 0.055546 - 9.499e-9 * d, 316.967 + 0.0334442282 * d],
  Moon: (d) => [125.1228 - 0.0529538083 * d, 5.1454, 318.0634 + 0.1643573223 * d, 60.2666, 0.0549, 115.3654 + 13.0649929509 * d],
};
// position in the orbit plane rotated to ecliptic rectangular coordinates
function orbit([N, i, w, a, e, M]) {
  M = rev(M); let E = M + R2D * e * sind(M) * (1 + e * cosd(M));
  for (let k = 0; k < 5; k++) E = E - (E - R2D * e * sind(E) - M) / (1 - e * cosd(E));
  const xv = a * (cosd(E) - e), yv = a * Math.sqrt(1 - e * e) * sind(E);
  const v = Math.atan2(yv, xv) * R2D, r = Math.hypot(xv, yv);
  return [r * (cosd(N) * cosd(v + w) - sind(N) * sind(v + w) * cosd(i)), r * (sind(N) * cosd(v + w) + cosd(N) * sind(v + w) * cosd(i)), r * sind(v + w) * sind(i)];
}
function sunEcl(d) { // geocentric Sun, AU
  const w = 282.9404 + 4.70935e-5 * d, e = 0.016709 - 1.151e-9 * d, M = rev(356.047 + 0.9856002585 * d);
  const E = M + R2D * e * sind(M) * (1 + e * cosd(M)), xv = cosd(E) - e, yv = Math.sqrt(1 - e * e) * sind(E);
  const v = Math.atan2(yv, xv) * R2D, r = Math.hypot(xv, yv);
  return [r * cosd(v + w), r * sind(v + w), 0];
}
function eclToEq([x, y, z], d) {
  const ob = 23.4393 - 3.563e-7 * d;
  const ye = y * cosd(ob) - z * sind(ob), ze = y * sind(ob) + z * cosd(ob);
  return { ra: rev(Math.atan2(ye, x) * R2D), dec: Math.atan2(ze, Math.hypot(x, ye)) * R2D };
}
function geocentric(id, d) {
  if (id === 'Sun') return sunEcl(d);
  if (id === 'Moon') return orbit(ELEM.Moon(d)); // Earth radii; direction is what matters
  const p = orbit(ELEM[id](d)), s = sunEcl(d);
  return [p[0] + s[0], p[1] + s[1], p[2] + s[2]];
}
export function altAz(id, t, place) {
  const d = dayNo(t), { ra, dec } = eclToEq(geocentric(id, d), d);
  return altAzRaDec(ra, dec, t, place);
}
// fixed objects (stars, nebulae, galaxies) by J2000 right ascension and declination in degrees
export function altAzRaDec(ra, dec, t, place) {
  const lst = rev(280.46061837 + 360.98564736629 * (t / 86400000 + 2440587.5 - 2451545) + place.lon);
  const H = lst - ra, alt = Math.asin(sind(place.lat) * sind(dec) + cosd(place.lat) * cosd(dec) * cosd(H)) * R2D;
  const az = rev(Math.atan2(-cosd(dec) * sind(H), sind(dec) * cosd(place.lat) - cosd(dec) * cosd(H) * sind(place.lat)) * R2D);
  return { alt, az };
}
// fraction of the Moon's disc lit, and whether it is growing (evening Moon)
export function moonPhase(t) {
  const d = dayNo(t), s = sunEcl(d), m = orbit(ELEM.Moon(d));
  const ls = Math.atan2(s[1], s[0]) * R2D, lm = Math.atan2(m[1], m[0]) * R2D;
  const bm = Math.asin(m[2] / Math.hypot(...m)) * R2D;
  const elong = Math.acos(cosd(lm - ls) * cosd(bm)) * R2D;
  return { lit: (1 - cosd(elong)) / 2, waxing: rev(lm - ls) < 180 };
}
export function phaseName({ lit, waxing }) {
  if (lit < 0.03) return '삭';
  if (lit > 0.97) return '보름달';
  if (Math.abs(lit - 0.5) < 0.08) return waxing ? '상현달' : '하현달';
  if (lit < 0.5) return waxing ? '초승달' : '그믐달';
  return waxing ? '차오르는 달' : '기우는 달';
}
const dirName = (az) => ['북', '북동', '동', '남동', '남', '남서', '서', '북서'][Math.round(az / 45) % 8];
export { dirName };

// local evening of a given day: start of the dark (Sun below -12 deg) to 05:00 next morning, in 10-minute steps
export function night(dayStart, place) {
  const steps = [];
  for (let k = 0; k <= 13 * 6; k++) steps.push(dayStart + (17 * 60 + k * 10) * 60000); // 17:00 to 06:00 local
  const dark = steps.filter((t) => altAz('Sun', t, place).alt < -12);
  const sunset = steps.find((t) => altAz('Sun', t, place).alt < -0.83);
  return { dark, sunset };
}
// when a body is above 10 degrees during the dark hours of that night: first, last, and the highest moment
export function visible(id, dark, place) {
  let best = null, first = null, last = null;
  for (const t of dark) { const p = altAz(id, t, place); if (p.alt > 10) { first ??= t; last = t; if (!best || p.alt > best.alt) best = { t, ...p }; } }
  return best ? { first, last, best } : null;
}
// midnight at the start of today, Korean time (UTC+9), as a UTC timestamp
export function kstDayStart(t = Date.now()) { const k = t + 9 * 3600000; return k - (k % 86400000) - 9 * 3600000; }
export const hm = (t) => new Date(t + 9 * 3600000).toISOString().slice(11, 16);
export const md = (t) => { const x = new Date(t + 9 * 3600000); return `${x.getUTCMonth() + 1}월 ${x.getUTCDate()}일`; };
// a link that opens the app on this sky, looking at the body
export function appLink(base, place, t, body) {
  const q = new URLSearchParams({ m: 'g', t: new Date(t).toISOString().slice(0, 16), lat: place.lat.toFixed(2), lon: place.lon.toFixed(2) });
  if (body) { q.set('az', body.az.toFixed(1)); q.set('alt', Math.max(10, Math.min(60, body.alt)).toFixed(1)); q.set('fov', '60'); if (body.o) q.set('o', body.o); }
  return `${base}#${q}`;
}
