// Planetary atmospheres for the sandbox: surface pressure, composition, cloud albedo -> greenhouse warming and which gases the planet can hold.
// Grey-atmosphere model: Ts = Teq * (1 + 0.75 tau)^(1/4), with an infrared optical depth from pressure-broadened absorbers,
//   tau = 5.34 (p_CO2 P)^0.362 + 5.2 (p_H2O P)^0.5 + 2.0 (p_CH4 P)^0.5 + 0.6 (p_H2 P)^0.5 (collision-induced)
// fitted so that Venus (92 bar CO2, cloud albedo 0.76) gives ~735 K, Earth ~288 K and Mars ~215 K. It is a teaching model:
// the right size and direction of each effect, not a climate simulation.
export const GASES = [['N2', '질소', 28], ['O2', '산소', 32], ['CO2', '이산화탄소', 44], ['H2O', '수증기', 18], ['CH4', '메테인', 16], ['H2', '수소', 2], ['He', '헬륨', 4], ['Ar', '아르곤', 40]];
export const PRESETS = {
  Earth: { P: 1.013, albedo: 0.30, mix: { N2: 0.78, O2: 0.21, Ar: 0.0093, CO2: 0.0004, H2O: 0.01 } },
  Venus: { P: 92, albedo: 0.76, mix: { CO2: 0.965, N2: 0.035 } },
  Mars: { P: 0.006, albedo: 0.25, mix: { CO2: 0.95, N2: 0.028, Ar: 0.02 } },
  Titan: { P: 1.47, albedo: 0.22, mix: { N2: 0.95, CH4: 0.049, H2: 0.001 } },
  none: { P: 0, albedo: 0.12, mix: {} },
};
export function atmOf(b) { // the body's atmosphere, from its name the first time
  if (!b.atm) { const p = PRESETS[b.name] || (b.Rkm && b.Rkm < 12000 ? PRESETS.none : null); b.atm = p ? JSON.parse(JSON.stringify(p)) : null; }
  return b.atm;
}
export function tauOf(a) {
  if (!a || !a.P) return 0; const P = a.P, x = (g) => (a.mix[g] || 0) * P;
  return 5.34 * Math.pow(x('CO2') * P, 0.362) + 5.2 * Math.sqrt(x('H2O') * P) + 2.0 * Math.sqrt(x('CH4') * P) + 0.6 * Math.sqrt(x('H2') * P);
}
// equilibrium temperature with this albedo (teq30 is the sandbox's value for albedo 0.3), surface temperature with the greenhouse
export function climate(b, teq30) {
  const a = atmOf(b); if (!a) return null;
  const Teq = teq30 * Math.pow((1 - a.albedo) / 0.7, 0.25), tau = tauOf(a), Ts = Teq * Math.pow(1 + 0.75 * tau, 0.25);
  return { Teq, Ts, tau, a };
}
// gases kept for billions of years: escape speed at least ~6x the thermal speed at the exobase (taken ~3.5x surface temperature: Earth ~1000 K)
export function retention(vescKms, Ts) {
  return GASES.map(([g, ko, m]) => { const vth = Math.sqrt(2 * 1.380649e-23 * Ts * 3.5 / (m * 1.6605e-27)) / 1000; return [g, ko, vescKms / vth >= 6]; });
}
// ---- water: saturation curves (pressures in bar, temperatures in K) ----
// Liquid-vapour: Wagner & Pruss (1993) saturation-pressure equation as adopted by IAPWS, valid from the triple point to the critical point.
// Ice-vapour: IAPWS (2011) sublimation-pressure equation, valid 50 K to 273.16 K.
export const WATER = { Tt: 273.16, Pt: 0.00611657, Tc: 647.096, Pc: 220.64, Pmax: 220.64, Tmin: 50 };
export function psatWater(T) { // bar, liquid-vapour, NaN outside [Tt, Tc]
  if (!(T >= WATER.Tt && T <= WATER.Tc)) return NaN; const t = 1 - T / WATER.Tc;
  return WATER.Pc * Math.exp(WATER.Tc / T * (-7.85951783 * t + 1.84408259 * t ** 1.5 - 11.7866497 * t ** 3 + 22.6807411 * t ** 3.5 - 15.9618719 * t ** 4 + 1.80122502 * t ** 7.5));
}
export function psubIce(T) { // bar, ice-vapour, NaN outside [50 K, Tt]
  if (!(T >= WATER.Tmin && T <= WATER.Tt)) return NaN; const th = T / WATER.Tt;
  return WATER.Pt * Math.exp((-21.2144006 * th ** 0.00333333333 + 27.3203819 * th ** 1.20666667 - 6.10598130 * th ** 1.70333333) / th);
}
// What pure water at the surface would do at a (global mean) temperature Ts and total pressure P. Boiling is set by the total pressure
// against the saturation vapour pressure; the water vapour partial pressure (evaporation and condensation) is not modelled, nor is ice melting
// under pressure (taken as 273.16 K) or high-pressure ices. Outside 50-647 K or above 220.64 bar the answer is "판정 불가".
export function waterState(Ts, P) {
  if (!Number.isFinite(Ts) || !Number.isFinite(P) || P < 0) return '판정 불가 (값이 올바르지 않음)';
  if (Ts > WATER.Tc) return '액체 물 없음 (임계 온도 647 K보다 뜨거움)';
  if (Ts < WATER.Tmin || P > WATER.Pmax) return '판정 불가 (이 모형의 지원 범위 밖: 50~647 K, 220.64 bar 이하)';
  if (P < WATER.Pt) return Ts < WATER.Tt && P <= psubIce(Ts) ? '얼음 (기압이 삼중점보다 낮아 녹지 않고 승화)' : Ts < WATER.Tt ? '얼음이 승화해 사라짐 (기압이 삼중점보다 낮음)' : '액체 물 불가 (기압이 물의 삼중점 0.0061 bar보다 낮음)';
  if (Ts < WATER.Tt) return '얼음';
  const ps = psatWater(Ts);
  return P > ps ? `액체 물 가능 (기압이 이 온도의 포화 증기압 ${ps < 0.1 ? ps.toFixed(3) : ps.toFixed(2)} bar보다 높음)` : `끓음: 액체로 머물 수 없음 (포화 증기압 ${ps < 0.1 ? ps.toFixed(3) : ps.toFixed(2)} bar가 기압보다 높음)`;
}
// Can a person breathe this air unaided? Separate from climate and liquid water. Partial pressures in bar.
// Limits used: O2 0.16-0.5 bar (hypoxia below, oxygen toxicity above over long exposure); CO2 below 0.005 bar (about 0.5% at 1 atm,
// in line with NASA long-duration spacecraft limits of a few mmHg); total pressure 0.5-3 bar; no notable CH4 or H2 (flammable).
export function breathable(a) {
  if (!a || !a.P) return { ok: false, why: '대기가 없음', pO2: 0, pCO2: 0 };
  const pO2 = (a.mix.O2 || 0) * a.P, pCO2 = (a.mix.CO2 || 0) * a.P, why = [];
  if (pO2 < 0.16) why.push(`산소 분압 ${pO2.toFixed(3)} bar가 0.16 bar보다 낮음`); if (pO2 > 0.5) why.push(`산소 분압 ${pO2.toFixed(2)} bar가 0.5 bar보다 높음 (산소 독성)`);
  if (pCO2 > 0.005) why.push(`이산화탄소 분압 ${pCO2.toFixed(3)} bar가 한계 0.005 bar보다 높음 (중독)`);
  if (a.P < 0.5 || a.P > 3) why.push(`기압 ${a.P.toFixed(2)} bar가 0.5~3 bar 밖`);
  if (((a.mix.CH4 || 0) + (a.mix.H2 || 0)) * a.P > 0.01) why.push('메테인·수소가 많아 타기 쉬움');
  return { ok: !why.length, why: why.join(', '), pO2, pCO2 };
}
// how evenly the air spreads the heat: a thick atmosphere carries it to the poles and the night side, a thin one cannot.
// eta = P / (P + 1.5 bar); without transport the equator runs ~10% warmer than the mean, the poles ~35% colder and the night ~25% colder.
// Checks: Venus (92 bar) almost uniform; Earth about +32 C equator / -45 C pole; Mars (6 mbar) about -36 C equator, 140 K CO2-frost poles.
export function extremes(Ts, P) {
  const eta = (P || 0) / ((P || 0) + 1.5), k = 1 - eta;
  return { eq: Ts * (1 + 0.1 * k), pole: Ts * (1 - 0.35 * k), night: Ts * (1 - 0.25 * k), eta };
}
