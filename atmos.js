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
export function waterState(Ts, P) {
  if (P < 0.006) return '물이 액체로 있을 수 없음 (기압이 물의 삼중점보다 낮음)';
  return Ts < 273 ? '얼음' : Ts < 373 + 30 * Math.log10(Math.max(P, 0.01)) ? '액체 물 가능' : '끓어서 수증기 (폭주 온실 위험)';
}
