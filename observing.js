// Observing suitability (관측 적합도) and alerts (알림) for Space Commons.
// Each hour of tonight gets a 0-100 score from cloud cover (Open-Meteo), the Moon, twilight, the Bortle class and the
// selected target's altitude. Alerts are in-app notifications while the page is open, plus an .ics export so phone
// calendars remind people when the app is closed. There is no push server: nothing leaves the device except the
// latitude/longitude already sent to Open-Meteo.

const H = 3600e3;

// ---------- the score: pure, so tools/qa.py can test it ----------
// f = { sunAlt, cloud (0-100 or null), moonAlt, moonFrac (0-1), bortle (1-9), targetAlt (null when nothing selected) }
export function scoreHour(f) {
  const sky = f.sunAlt > -6 ? 0 : f.sunAlt > -12 ? 0.35 : f.sunAlt > -18 ? 0.8 : 1;           // twilight
  const cloud = f.cloud == null ? 1 : Math.pow(1 - Math.min(100, Math.max(0, f.cloud)) / 100, 1.5);
  const moon = f.moonAlt > 0 ? 1 - 0.6 * f.moonFrac * Math.min(1, (f.moonAlt + 5) / 35) : 1;    // a high full Moon washes out faint things
  const lp = 1 - (Math.min(9, Math.max(1, f.bortle)) - 1) * 0.05;                               // Bortle 9 keeps 60%
  const tgt = f.targetAlt == null ? 1 : f.targetAlt < 5 ? 0 : f.targetAlt < 20 ? 0.3 + 0.7 * (f.targetAlt - 5) / 15 * 0.6 : Math.min(1, 0.72 + (f.targetAlt - 20) / 60 * 0.28);
  return Math.round(100 * sky * cloud * moon * lp * tgt);
}

const hourKo = (t) => { const h = new Date(t).getHours(); return h < 6 ? `새벽 ${h}시` : `${h}시`; };

// the one-line verdict: the best run of hours scoring within 15 points of the best
export function verdict(hours) {
  if (!hours.length) return '오늘 밤 계산할 시간이 없습니다';
  const best = Math.max(...hours.map(h => h.score));
  if (best < 25) {
    const dark = hours.filter(h => h.sunAlt < -12), cloudy = dark.length && dark.every(h => h.cloud != null && h.cloud > 70);
    return cloudy ? '오늘 밤은 구름이 많아 관측하기 어렵습니다' : !dark.length ? '오늘 밤은 하늘이 충분히 어두워지지 않습니다' : '오늘 밤은 관측 조건이 좋지 않습니다';
  }
  const cut = Math.max(25, best - 15); let a = -1, b = -1, ba = -1, bb = -1, bsum = -1;
  for (let i = 0; i <= hours.length; i++) {
    if (i < hours.length && hours[i].score >= cut) { if (a < 0) a = i; b = i; continue; }
    if (a >= 0) { const s = hours.slice(a, b + 1).reduce((x, h) => x + h.score, 0); if (s > bsum) { bsum = s; ba = a; bb = b; } a = -1; }
  }
  const run = hours.slice(ba, bb + 1), cl = run.filter(h => h.cloud != null), cloud = cl.length ? Math.round(cl.reduce((x, h) => x + h.cloud, 0) / cl.length / 5) * 5 : null;
  const moonUp = run.some(h => h.moonAlt > 0), moonTxt = !moonUp ? '달 없음' : run[0].moonFrac > 0.6 ? '밝은 달' : '달 있음';
  const span = ba === bb ? `${hourKo(run[0].t)}` : `${hourKo(run[0].t)}~${hourKo(run[run.length - 1].t + H)}`;
  return `오늘 밤 ${span}가 가장 좋습니다 (${cloud == null ? '구름 정보 없음' : `구름 ${cloud}%`}, ${moonTxt})`;
}

// ---------- .ics export (RFC 5545): CRLF line ends, lines folded at 75 octets, UTC times ----------
const icsEsc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsTime = (t) => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
function fold(line) {
  const enc = new TextEncoder(); if (enc.encode(line).length <= 75) return line;
  const out = []; let cur = '', n = 0, lim = 75;
  for (const ch of line) { const b = enc.encode(ch).length; if (n + b > lim) { out.push(cur); cur = ' '; n = 1; lim = 75; } cur += ch; n += b; }
  out.push(cur); return out.join('\r\n');
}
// events: [{ t, end?, title, desc? }]
export function buildICS(events, now = Date.now()) {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Space Commons//Observing alerts//KO', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Space Commons 관측 알림'];
  events.forEach((e, i) => {
    L.push('BEGIN:VEVENT', `UID:${icsTime(e.t)}-${i}-${Math.abs(hash(e.title))}@space-commons`, `DTSTAMP:${icsTime(now)}`, `DTSTART:${icsTime(e.t)}`, `DTEND:${icsTime(e.end || e.t + 30 * 60e3)}`,
      `SUMMARY:${icsEsc(e.title)}`, ...(e.desc ? [`DESCRIPTION:${icsEsc(e.desc)}`] : []),
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(e.title)}`, 'TRIGGER:-PT15M', 'END:VALARM', 'END:VEVENT');
  });
  L.push('END:VCALENDAR');
  return L.map(fold).join('\r\n') + '\r\n';
}
function hash(s) { let h = 0; for (const c of s) h = (h * 31 + c.codePointAt(0)) | 0; return h; }

// ---------- the panel ----------
let C = null; const wx = { key: '', at: 0, h: null };
const NOTE_KEY = 'space-commons-alerts';

async function cloudCover() { // hourly cloud cover, cached for 30 minutes per place
  const la = C.state.lat.toFixed(2), lo = C.state.lon.toFixed(2), key = la + ',' + lo;
  if (wx.h && wx.key === key && Date.now() - wx.at < 30 * 60e3) return wx.h;
  try { const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}&hourly=cloud_cover&forecast_days=3&timezone=GMT&timeformat=unixtime`);
    const h = (await r.json()).hourly; if (!h?.time) throw 0; Object.assign(wx, { key, at: Date.now(), h }); return h; } catch { return null; }
}

// tonight: 18:00 local to 06:00 the next morning, around the app's clock
function tonightHours(cc) {
  const d = new Date(C.state.time), base = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 18).getTime() - (d.getHours() < 6 ? 86400e3 : 0);
  const out = [], bortle = C.bortle(), sel = C.selected();
  for (let i = 0; i < 12; i++) {
    const t = base + i * H, tm = t + H / 2, sm = C.sunMoonAt(tm), mp = C.moonPhase(tm);
    let cloud = null; if (cc) { const k = cc.time.findIndex(x => Math.abs(x * 1000 - tm) <= H / 2); if (k >= 0) cloud = cc.cloud_cover[k]; }
    const tv = sel ? C.targetEqAt(sel, tm) : null;
    const f = { t, sunAlt: C.altOf(sm.Sun, tm), moonAlt: C.altOf(sm.Moon, tm), moonFrac: mp.frac, cloud, bortle, targetAlt: tv ? C.altOf(tv, tm) : null };
    out.push({ ...f, score: scoreHour(f) });
  }
  return out;
}

export async function renderScore() {
  const box = C.$('obs-score'); box.hidden = false; const strip = C.$('os-strip'), sel = C.selected();
  C.$('os-sub').textContent = `${C.state.lat.toFixed(2)}°, ${C.state.lon.toFixed(2)}° · 광공해 ${C.bortle()}단계` + (sel ? ` · 대상: ${C.label(sel)}` : '');
  C.$('os-verdict').textContent = '계산 중…';
  const cc = await cloudCover(), hours = tonightHours(cc); box._hours = hours;
  strip.innerHTML = '';
  for (const h of hours) {
    const col = document.createElement('div'); col.className = 'os-col';
    col.title = `${hourKo(h.t)} · 점수 ${h.score} · 구름 ${h.cloud == null ? '?' : h.cloud + '%'} · 달 ${h.moonAlt > 0 ? '떠 있음' : '없음'}` + (h.targetAlt != null ? ` · 대상 고도 ${Math.round(h.targetAlt)}°` : '');
    col.innerHTML = `<span class="os-n">${h.score}</span><span class="os-bar" style="height:${Math.max(2, h.score * 0.7)}px;opacity:${0.35 + h.score / 160}"></span><span class="os-h">${new Date(h.t).getHours()}</span>`;
    strip.append(col);
  }
  C.$('os-verdict').textContent = verdict(hours);
  C.$('os-note').textContent = cc ? '' : '구름 예보를 받지 못해 구름은 빼고 계산했습니다.';
  renderEvents();
}

// upcoming events for alerts and the calendar: next 3 days
export function upcomingEvents() {
  const t0 = C.state.time, ev = [];
  try { for (const { s, p } of C.krPasses()) ev.push({ t: p.rise, end: p.set, title: `${s.name} 통과 (최대 고도 ${Math.round(p.max)}°)`, desc: '한국 위성이 어두운 하늘에서 햇빛을 받아 보이는 통과입니다.' + (p.conf === 'aging' ? ' 궤도 자료가 오래되어 시각이 몇 분 어긋날 수 있습니다.' : '') }); } catch {}
  for (const sh of C.showers()) { const d = C.daysToPeak(sh, t0); if (d >= 0 && d <= 3) { const p = new Date(t0); p.setDate(p.getDate() + d); p.setHours(22, 0, 0, 0); ev.push({ t: p.getTime(), end: p.getTime() + 6 * H, title: `${sh.ko} 극대`, desc: `시간당 최대 약 ${sh.zhr}개. 밤늦게 어두운 곳에서 하늘 전체를 보세요.` }); } }
  try { for (const o of C.occultations(t0, t0 + 3 * 86400e3)) ev.push({ t: o.t, end: o.t + 60 * 60e3, title: o.title, desc: '달이 별이나 행성을 가리는 현상(엄폐)입니다.' }); } catch {}
  const hrs = C.$('obs-score')._hours || [];
  for (let i = 0; i < hrs.length;) { if (hrs[i].score < 60) { i++; continue; } let j = i; while (j + 1 < hrs.length && hrs[j + 1].score >= 60) j++;
    ev.push({ t: hrs[i].t, end: hrs[j].t + H, title: `맑고 어두운 하늘 (적합도 ${Math.max(...hrs.slice(i, j + 1).map(h => h.score))}점)`, desc: '구름·달·박명을 함께 따진 관측하기 좋은 시간입니다.' }); i = j + 1; }
  return ev.filter(e => e.t > t0 - H).sort((a, b) => a.t - b.t);
}
function renderEvents() {
  const ul = C.$('os-events'), ev = upcomingEvents(); ul.innerHTML = '';
  if (!ev.length) { ul.innerHTML = '<li class="small">앞으로 사흘 동안 알릴 일이 없습니다</li>'; return; }
  for (const e of ev.slice(0, 12)) { const li = document.createElement('li');
    li.innerHTML = `<b></b> <span class="small"></span>`; li.firstChild.textContent = e.title;
    li.lastChild.textContent = new Date(e.t).toLocaleString(C.LOCALE, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }); ul.append(li); }
}

function exportICS() {
  const text = buildICS(upcomingEvents()), a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' })); a.download = 'space-commons-alerts.ics'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  C.$('os-alert-st').textContent = '캘린더 파일을 만들었습니다. 휴대폰에서 열면 일정마다 15분 전에 알려 줍니다.';
  return text;
}

// in-app notifications: checked every minute while the page is open; each event fires once, 10 minutes ahead
const fired = new Set();
function tickAlerts() {
  if (localStorage.getItem(NOTE_KEY) !== 'on' || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const now = Date.now(); let ev; try { ev = upcomingEvents(); } catch { return; }
  for (const e of ev) { const k = e.title + e.t; if (fired.has(k) || e.t - now > 10 * 60e3 || e.t < now - 5 * 60e3) continue; fired.add(k);
    const body = new Date(e.t).toLocaleTimeString(C.LOCALE, { hour: '2-digit', minute: '2-digit', hour12: false }) + ' · ' + (e.desc || '');
    navigator.serviceWorker?.getRegistration().then(r => r ? r.showNotification(e.title, { body, icon: 'assets/icon-192.png' }) : new Notification(e.title, { body })).catch(() => { try { new Notification(e.title, { body }); } catch {} }); }
}
async function toggleAlerts() {
  const st = C.$('os-alert-st');
  if (typeof Notification === 'undefined') { st.textContent = '이 브라우저는 알림을 지원하지 않습니다. 대신 캘린더에 추가해 주세요.'; return; }
  if (localStorage.getItem(NOTE_KEY) === 'on') { localStorage.removeItem(NOTE_KEY); st.textContent = '알림을 껐습니다.'; syncAlertBtn(); return; }
  const p = await Notification.requestPermission(); // only ever asked here, after a click
  if (p !== 'granted') { st.textContent = '알림이 허용되지 않았습니다. 주소창 왼쪽 자물쇠 아이콘에서 알림을 허용할 수 있습니다.'; return; }
  try { localStorage.setItem(NOTE_KEY, 'on'); } catch {}
  st.textContent = '알림을 켰습니다. 앱이 열려 있을 때 일이 생기기 10분 전에 알려 줍니다.'; syncAlertBtn(); tickAlerts();
}
function syncAlertBtn() { let on = false; try { on = localStorage.getItem(NOTE_KEY) === 'on'; } catch {} C.$('os-notify').textContent = on ? '알림 끄기' : '알림 켜기'; }

export function initObserving(ctx) {
  C = ctx;
  C.$('obs-score-btn').onclick = () => C.$('obs-score').hidden ? (C.$('tel').hidden = true, renderScore()) : (C.$('obs-score').hidden = true);
  C.$('os-close').onclick = () => C.$('obs-score').hidden = true;
  C.$('os-notify').onclick = toggleAlerts; C.$('os-ics').onclick = exportICS; C.$('os-refresh').onclick = renderScore;
  syncAlertBtn(); setInterval(tickAlerts, 60e3);
}
export const _test = { exportICS: () => buildICS(upcomingEvents()) };
