// How much to trust a TLE (FIX-07). Three different times are kept apart and shown separately:
//   epoch      the instant the orbital elements describe (TLE line 1, columns 19-32)
//   fetched    when this copy was downloaded (HTTP Date/Last-Modified), which is NOT the epoch
//   simulated  the app's clock, which can be far in the past or future
// Staleness rule, from Vallado, Crawford, Hujsak & Kelso, "Revisiting Spacetrack Report #3" (AIAA 2006-6753, CelesTrak):
// SGP4 with general-perturbation elements is good to about 1 km at epoch, and the error for low Earth orbit grows by
// roughly 1-3 km per day (drag and the analytic theory), so passes more than a few days from epoch are only rough.
// CelesTrak refreshes elements several times a day for that reason. We therefore use, by |simulated - epoch|:
//   up to 3 days   'fresh'  pass times good to about a few seconds to a minute
//   3 to 14 days   'aging'  shown, but labelled low confidence (minutes off, track may shift)
//   over 14 days   'stale'  no pass predictions or alerts; the satellite is drawn with a warning only
export const FRESH_DAYS = 3, STALE_DAYS = 14;

export function tleEpoch(l1) { // YYDDD.DDDDDDDD, years 57-99 are 19xx
  const yy = +l1.slice(18, 20), doy = parseFloat(l1.slice(20, 32));
  return Date.UTC(yy < 57 ? 2000 + yy : 1900 + yy, 0, 1) + (doy - 1) * 86400e3;
}
export function tleAge(epoch, sim) { const days = (sim - epoch) / 86400e3, a = Math.abs(days);
  return { days, level: a <= FRESH_DAYS ? 'fresh' : a <= STALE_DAYS ? 'aging' : 'stale' }; }

const fmt = (t) => new Date(t).toLocaleString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
// Korean lines for the info card: one per time, plus the confidence
export function tleNotes(s, sim) {
  const { days, level } = tleAge(s.epoch, sim), d = Math.abs(days), dt = d < 1 ? `${Math.round(d * 24)}시간` : `${d.toFixed(1)}일`;
  return [
    ['궤도 자료 기준시각', fmt(s.epoch)],
    ['자료 받은 시각', s.fetched ? fmt(s.fetched) + (s.source === 'cache' ? ' (인터넷 연결 실패, 저장해 둔 자료)' : s.source === 'bundled' ? ' (앱에 들어 있는 자료)' : ' (방금 인터넷에서 받음)') : '알 수 없음'],
    ['시뮬레이션 시각과의 차이', `${dt} ${days >= 0 ? '뒤' : '앞'}`],
    ['예보 신뢰도', level === 'fresh' ? '좋음 (기준시각에서 3일 안)' : level === 'aging' ? '낮음: 기준시각에서 3일이 넘어 통과 시각이 몇 분 어긋날 수 있습니다' : '예보하지 않음: 기준시각에서 14일이 넘은 자료라 통과를 예보하지 않습니다'],
  ];
}
