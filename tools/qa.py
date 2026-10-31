"""Pre-push check: open every mode of the app in headless Chrome or Edge and fail if anything breaks.

For each scenario it loads the page from a local server, waits for the app to finish loading, runs a small
check in the page, and collects uncaught exceptions, console errors and missing files (404s from our own
server). Screenshots land in .cache/qa/ so a glance shows whether each mode drew something.

Run:   python tools/qa.py            (all scenarios)
       python tools/qa.py space kr   (only those)
Needs: Chrome or Edge, and the websocket-client package (pip install websocket-client).
Exit code 0 when every scenario passes, 1 otherwise, so it can sit in a git pre-push hook.
"""
import base64, functools, http.server, json, os, pathlib, shutil, socket, subprocess, sys, tempfile, threading, time
try:
    import websocket  # websocket-client
except ImportError:
    sys.exit('pip install websocket-client')

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / '.cache' / 'qa'
READY = "document.body.classList.contains('ready')"
# observing score panel: the scoring rule at its extremes, then the panel draws 12 hourly bars and a verdict
OBS_SCORE = """(async () => { const w = (ms) => new Promise(r => setTimeout(r, ms)); const O = await import('./observing.js');
  const base = { sunAlt: -30, cloud: 0, moonAlt: -10, moonFrac: 0, bortle: 1, targetAlt: null };
  if (O.scoreHour(base) !== 100 || O.scoreHour({ ...base, cloud: 100 }) !== 0 || O.scoreHour({ ...base, sunAlt: 5 }) !== 0 || O.scoreHour({ ...base, targetAlt: -5 }) !== 0) return false;
  if (!(O.scoreHour({ ...base, moonAlt: 50, moonFrac: 1 }) < 50) || !(O.scoreHour({ ...base, bortle: 9 }) === 60)) return false;
  const v = O.verdict([0, 1, 2, 3].map(i => ({ t: new Date(2026, 9, 31, 21 + i).getTime(), score: [90, 92, 91, 88][i], cloud: 10, moonAlt: -5, moonFrac: 0.2, sunAlt: -30 })));
  if (v !== '오늘 밤 21시~새벽 1시가 가장 좋습니다 (구름 10%, 달 없음)') { console.error('verdict ' + v); return false; }
  document.getElementById('obs-score-btn').click(); for (let i = 0; i < 60 && document.querySelectorAll('#os-strip .os-col').length < 12; i++) await w(250);
  await w(500); const t = document.getElementById('os-verdict').textContent; return document.querySelectorAll('#os-strip .os-col').length === 12 && /오늘 밤/.test(t); })()"""
# .ics export: valid RFC 5545 text (CRLF, folded at 75 octets, balanced blocks, UTC times, escaped commas)
OBS_ICS = r"""(async () => { try { const w = (ms) => new Promise(r => setTimeout(r, ms)); const O = await import('./observing.js');
  document.getElementById('obs-score-btn').click(); for (let i = 0; i < 60 && !document.querySelector('#os-strip .os-col'); i++) await w(250);
  const ev = [{ t: Date.UTC(2026, 11, 14, 13), title: '쌍둥이자리 유성우 극대, 시간당 150개; 아주 긴 제목 '.repeat(4), desc: '줄\n바꿈' }, ...O.upcomingEvents()];
  const checks = [O.buildICS(ev), O._test.exportICS()];
  for (const x of checks) { const L = x.split('\r\n'); const enc = new TextEncoder();
    if (!x.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0') || !x.endsWith('END:VCALENDAR\r\n') || /[^\r]\n/.test(x)) { console.error('ics frame'); return false; }
    if (L.some(l => enc.encode(l).length > 75)) { console.error('ics fold'); return false; }
    const un = x.replace(/\r\n /g, '').replace(/\r/g, ''), n = (re) => (un.match(re) || []).length;
    if (n(/^BEGIN:VEVENT$/gm) !== n(/^END:VEVENT$/gm) || n(/^BEGIN:VALARM$/gm) !== n(/^BEGIN:VEVENT$/gm)) { console.error('ics blocks'); return false; }
    if (un.split('\n').filter(l => /^DT(START|END|STAMP):/.test(l)).some(l => !/:\d{8}T\d{6}Z$/.test(l))) { console.error('ics time'); return false; } }
  const ok = checks[0].replace(/\r\n /g, '').includes('SUMMARY:쌍둥이자리 유성우 극대\\, 시간당 150개\\;'); if (!ok) console.error('ics escape ' + checks[0].slice(0, 400)); return ok; } catch (e) { console.error('ics threw ' + e.stack); return false; } })()"""
# telescope wizard with the practice mount: connect, Sun warning, one-star alignment, then a goto to the selected M31
TEL_SIM = """(async () => { const w = (ms) => new Promise(r => setTimeout(r, ms)), q = (s) => document.querySelector(s), T = (await import('./telescope.js'))._qa;
  const until = async (f, n = 120) => { for (let i = 0; i < n && !f(); i++) await w(250); return f(); };
  q('#tel-btn').click(); q('#tel-body [data-go=sim]').click(); q('#tel-body [data-next]').click(); q('#tel-connect').click();
  if (!await until(() => q('#tel-body h3')?.textContent.includes('태양'))) { console.error('no sun warning'); return false; }
  q('#tel-body [data-go=align]').click(); if (!q('#tel-astar')) { console.error('no star'); return false; }
  q('#tel-astar').click(); await w(300); if (!await until(() => T.W.state === 'arrived')) { console.error('no align slew'); return false; }
  await w(400); q('#tel-aligned').click(); if (!await until(() => !!q('#tel-goto'))) return false;
  q('#tel-goto').click(); await w(300); if (!await until(() => T.W.state === 'arrived')) { console.error('no goto'); return false; }
  await w(500); const p = T.posJ, d = Math.hypot((p.ra - 10.6847) * Math.cos(41.27 * Math.PI / 180), p.dec - 41.269);
  if (d > 0.3) { console.error('pointing off by ' + d.toFixed(2)); return false; }
  return !q('#tel-reticle').hidden; })()"""
# fake serial ports that answer like NexStar, SynScan and LX200 hand controllers
TEL_SERIAL = """(async () => { const T = await import('./telescope.js'), { FakePort } = await import('./tools/fake-serial.js');
  for (const kind of ['nexstar', 'synscan', 'lx200']) { const port = new FakePort(kind), m = await T.openSerialMount(port, kind);
    if (kind === 'synscan' && m.version !== '4.10.15') { console.error('synscan version ' + m.version); return false; }
    if (kind === 'nexstar' && m.version !== '5.23') { console.error('nexstar version ' + m.version); return false; }
    await m.goto(83.633, -5.39); let n = 0; while (await m.slewing() && n++ < 20); const p = await m.getRaDec();
    if (Math.abs(p.ra - 83.633) > 0.01 || Math.abs(p.dec + 5.39) > 0.01) { console.error(kind + ' goto ' + JSON.stringify(p)); return false; }
    await m.sync(100, 30); const s = await m.getRaDec(); if (Math.abs(s.ra - 100) > 0.01 || Math.abs(s.dec - 30) > 0.01) { console.error(kind + ' sync'); return false; }
    await m.move(0, 1, 4); await m.move(0, 1, 0); await m.stop();
    if (kind !== 'lx200' && !port.log.includes('r3B78EC4B,FC2AC7CB')) { console.error(kind + ' cmd ' + port.log.join(' ')); return false; }
    await m.close(); }
  const e = T.explain({ code: 'no-serial' })[0]; return e.startsWith('이 브라우저는 USB 연결을 지원하지 않습니다'); })()"""
# FIX-07: TLE epoch, download time and source kept apart; fresh, stale, and cached-after-network-failure cases
TLE_AGE = """(async () => { const T = await import('./tle.js'); const l1 = '1 25544U 98067A   26300.50000000  .00016717  00000-0  10270-3 0  9005';
  const ep = T.tleEpoch(l1); if (ep !== Date.UTC(2026, 0, 1) + 299.5 * 86400e3) { console.error('epoch ' + new Date(ep).toISOString()); return false; }
  const fresh = T.tleNotes({ epoch: ep, fetched: ep + 3600e3, source: 'network' }, ep + 86400e3), stale = T.tleNotes({ epoch: ep, fetched: ep, source: 'network' }, ep + 20 * 86400e3);
  if (T.tleAge(ep, ep + 86400e3).level !== 'fresh' || T.tleAge(ep, ep - 5 * 86400e3).level !== 'aging' || T.tleAge(ep, ep + 20 * 86400e3).level !== 'stale') return false;
  if (!fresh[3][1].startsWith('좋음') || !stale[3][1].startsWith('예보하지 않음') || !fresh[1][1].includes('방금')) { console.error(JSON.stringify([fresh, stale])); return false; }
  // the network fails: sw.js answers from the cache and marks the copy (same construction as sw.js), and the card says so
  const h = new Response('x', { headers: { 'last-modified': 'Mon, 26 Oct 2026 10:00:00 GMT' } }), r = new Response(h.body, { status: h.status, headers: [...h.headers, ['x-sc-cache', '1']] });
  const src = r.headers.get('x-sc-cache') ? 'cache' : 'network', fetched = Date.parse(r.headers.get('last-modified'));
  const cached = T.tleNotes({ epoch: ep, fetched, source: src }, ep + 86400e3);
  if (!cached[1][1].includes('저장해 둔 자료') || cached[0][1] === cached[1][1]) { console.error(JSON.stringify(cached)); return false; }
  return true; })()"""
# name: (path, check run after load, expected to be truthy)
SCENARIOS = {
    'intro':   ('index.html', "document.title.length > 0"),
    'ground':  ('app.html', READY + " && !!document.querySelector('canvas')"),
    'space':   ('app.html#m=s', READY + " && document.body.classList.contains('space')"),
    'sandbox': ('app.html', "(async () => { document.querySelector('[data-mode=sandbox]').click(); for (let i = 0; i < 40 && !document.querySelector('.sb-dock'); i++) await new Promise(r => setTimeout(r, 250)); return !!document.querySelector('.sb-dock'); })()"),
    'kr':      ('app.html#o=' + '%EC%B2%9C%EB%A6%AC%EC%95%88%202A%ED%98%B8', "(async () => { for (let i = 0; i < 60 && !document.querySelector('.krcard'); i++) await new Promise(r => setTimeout(r, 250)); return !!document.querySelector('.krcard b'); })()"),
    'kren':    ('app.html?lang=en#o=GEO-KOMPSAT-2A', "(async () => { const w = (ms) => new Promise(r => setTimeout(r, ms)); for (let i = 0; i < 60 && !document.querySelector('.kracts'); i++) await w(250); document.querySelector('.kracts button').click(); const t = document.querySelector('.krcard').innerText; if (/[가-힣]/.test(t)) console.error('Hangul in the English satellite card: ' + t.match(/[^\n]*[가-힣][^\n]*/)[0]); return !!document.querySelector('.krtl li') && !/[가-힣]/.test(t); })()"),
    'venus':   ('app.html', "(async () => { const w = (ms) => new Promise(r => setTimeout(r, ms)); document.querySelector('[data-mode=sandbox]').click(); for (let i = 0; i < 40 && !document.querySelector('.sb-dock'); i++) await w(250); [...document.querySelectorAll('button')].find(b => /금성 테라포밍/.test(b.textContent)).click(); await w(800); for (let k = 0; k < 5; k++) { document.querySelector('.sb-terra .sb-tgo')?.click(); await w(500); } const sea = document.querySelector('.sb-seam')?.value; document.querySelector('.sb-terra .sb-tx').click(); await w(3000); return sea === '400'; })()"),
    'sblib':   ('app.html', "(async () => { const w = (ms) => new Promise(r => setTimeout(r, ms)); document.querySelector('[data-mode=sandbox]').click(); for (let i = 0; i < 40 && !document.querySelector('.sb-dock'); i++) await w(250); document.querySelector('.sb-tabs [data-tab=make]').click(); const f = document.querySelector('.sb-find'); f.value = '궤도'; f.dispatchEvent(new Event('input')); await w(600); return !document.querySelector('.sb-drawer').hidden && document.querySelectorAll('.sb-miss').length > 0; })()"),
    'sbphone': ('app.html', "(async () => { const w = (ms) => new Promise(r => setTimeout(r, ms)); document.querySelector('[data-mode=sandbox]').click(); for (let i = 0; i < 40 && !document.querySelector('.sb-dock'); i++) await w(250); [...document.querySelectorAll('button')].find(b => /화성 테라포밍/.test(b.textContent)).click(); await w(800); document.querySelector('.sb-terra .sb-tgo')?.click(); await w(1500); return !document.querySelector('.sb-terra').hidden && document.documentElement.scrollWidth <= innerWidth; })()"),
    'sbsys':   ('app.html', "(async () => { const w = (ms) => new Promise(r => setTimeout(r, ms)); document.querySelector('[data-mode=sandbox]').click(); for (let i = 0; i < 40 && !document.querySelector('.sb-dock'); i++) await w(250); await w(800); const c = document.querySelector('.sb-root canvas'); for (let k = 0; k < 14; k++) { c.dispatchEvent(new WheelEvent('wheel', { deltaY: 300, clientX: 640, clientY: 430, bubbles: true, cancelable: true })); await w(60); } await w(1500); return [...document.querySelectorAll('.sb-label')].filter(l => /해왕성|Neptune/.test(l.textContent) && l.style.display !== 'none').length > 0; })()"),
    'sben':    ('app.html?lang=en', "(async () => { const w = (ms) => new Promise(r => setTimeout(r, ms)); const H = /[가-힣]/, left = new Set(); const scan = () => { const r = document.querySelector('.sb-root'); if (!r) return; const tw = document.createTreeWalker(r, NodeFilter.SHOW_TEXT); let n; while ((n = tw.nextNode())) if (H.test(n.nodeValue)) left.add(n.nodeValue.trim()); for (const e of r.querySelectorAll('[title],[placeholder],[aria-label]')) for (const a of ['title', 'placeholder', 'aria-label']) { const v = e.getAttribute(a); if (v && H.test(v)) left.add('@' + a + ': ' + v); } }; document.querySelector('[data-mode=sandbox]').click(); for (let i = 0; i < 40 && !document.querySelector('.sb-dock'); i++) await w(250); await w(800); scan(); for (const t of document.querySelectorAll('.sb-tabs [data-tab]')) { t.click(); await w(300); scan(); } for (const q of ['terra-mars', 'terra-venus']) { const b = document.querySelector(`[data-q=${q}]`); if (!b) { console.log('[HANGUL] no terraform button ' + q); continue; } b.click(); await w(800); scan(); for (let k = 0; k < 6; k++) { document.querySelector('.sb-terra .sb-tgo')?.click(); await w(400); scan(); } const ql = document.querySelector('.sb-quizlink'); if (ql) { ql.click(); await w(200); for (let k = 0; k < 8; k++) { scan(); const o = document.querySelector('.sb-quiz .sb-qopt:not([disabled])'); if (!o) break; o.click(); await w(150); scan(); const nx = [...document.querySelectorAll('.sb-quiz button')].pop(); nx?.click(); await w(150); } scan(); } } for (const b of [...document.querySelectorAll('.sb-scenbtn')].slice(0, 12)) { b.click(); await w(600); scan(); } scan(); for (const r of [...document.querySelectorAll('.sb-labrow')]) { r.querySelector('button')?.click(); await w(700); scan(); } for (const t of left) console.log('[HANGUL] ' + t.slice(0, 300)); return !!document.querySelector('.sb-dock'); })()"),
    'models':  ('tools/model-sheet.html?only=kr', "(() => { const bad = window.__report.filter(r => r.issues.length); for (const r of bad) console.error('model ' + r.name + ': ' + r.issues.join(', ')); return !bad.length; })()"),
    'nuri':    ('tools/model-sheet.html?only=Nuri', "(async () => { for (let i = 0; i < 80 && !window.__report; i++) await new Promise(r => setTimeout(r, 250)); return window.__report.every(r => !r.issues.length); })()"),
    'nurireplay': ('app.html#o=' + '%EC%B2%9C%EB%A6%AC%EC%95%88%202A%ED%98%B8', "(async () => { const w = (ms) => new Promise(r => setTimeout(r, ms)); for (let i = 0; i < 60 && !document.querySelector('.kracts'); i++) await w(250); [...document.querySelectorAll('.kracts button')].find(b => /누리호/.test(b.textContent)).click(); await w(12000); return /누리호/.test(document.getElementById('status').textContent); })()"),
    'daymoon': ('app.html#m=g&t=2026-10-31T00:30&lat=37.57&lon=126.98&az=280.3&alt=31&fov=4&o=Moon', READY),
    'nuribase': ('tools/model-sheet.html?only=Nuri&focus=-3,6', "(async () => { for (let i = 0; i < 80 && !window.__report; i++) await new Promise(r => setTimeout(r, 250)); return window.__report.every(r => !r.issues.length); })()"),
    'nurimid': ('tools/model-sheet.html?only=Nuri&focus=8,24', "(async () => { for (let i = 0; i < 80 && !window.__report; i++) await new Promise(r => setTimeout(r, 250)); return window.__report.every(r => !r.issues.length); })()"),
    'andromeda': ('app.html#m=g&t=2026-10-31T13:00&lat=37.57&lon=126.98&az=58.7&alt=81.9&fov=14.7&o=M31', READY),
    'english': ('app.html?lang=en', READY),
    # English concept cards: open every 4th card (all chapters), answer and reveal each quiz, fail on any Hangul left in the cards window (text, attributes, canvas)
    'cardsen': ('app.html?lang=en', "(async () => { const w = (ms) => new Promise(r => setTimeout(r, ms)), H = /[\\uac00-\\ud7a3]/, left = new Set(); const fx = CanvasRenderingContext2D.prototype.fillText; CanvasRenderingContext2D.prototype.fillText = function (s, ...a) { if (H.test(s) && this.canvas.closest('.cc-root')) left.add('canvas: ' + s); return fx.call(this, s, ...a); }; const { openCards } = await import('./cards.js'); openCards({ openLab() {} }); await w(500); const root = [...document.querySelectorAll('.cc-root')].find(r => !r.hidden); const col = () => { const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n; while ((n = tw.nextNode())) if (H.test(n.nodeValue) && !n.parentElement.closest('.katex-mathml')) left.add(n.nodeValue.trim()); for (const e of root.querySelectorAll('[title],[placeholder],[aria-label]')) for (const a of ['title', 'placeholder', 'aria-label']) if (H.test(e.getAttribute(a) || '')) left.add(a + ': ' + e.getAttribute(a)); }; col(); const n = root.querySelectorAll('.cc-card').length; for (let i = 0; i < n; i += 4) { root.querySelectorAll('.cc-card')[i].click(); await w(400); col(); for (let j = 0; j < root.querySelectorAll('.cc-qdot').length; j++) { root.querySelectorAll('.cc-qdot')[j].click(); await w(60); root.querySelector('.cc-quiz .cc-opts button')?.click(); await w(60); col(); root.querySelector('.cc-show')?.click(); await w(80); col(); } root.querySelector('.cc-back').click(); await w(150); } col(); for (const s of left) console.error('untranslated: ' + s); return n > 60 && left.size === 0; })()"),
    # classroom sync over the local BroadcastChannel transport: this page teaches, an iframe of the app joins by ?join= and must follow
    'sync':    ('app.html?sync=local', "(async () => { const w = (ms) => new Promise(r => setTimeout(r, ms)); const until = async (f, n = 80) => { for (let i = 0; i < n; i++) { try { if (f()) return true; } catch {} await w(250); } return false; }; document.getElementById('sync-btn').click(); await w(200); document.querySelector('.sync-open').click(); if (!await until(() => /^[A-Z0-9]{6}$/.test(document.querySelector('.sync-code')?.textContent))) { console.error('sync: no room code'); return false; } const code = document.querySelector('.sync-code').textContent; if (!document.querySelector('.sync-qr svg path')) { console.error('sync: no QR'); return false; } const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;left:8px;bottom:8px;width:520px;height:360px;z-index:99;border:2px solid #4C8DF6;background:#000'; f.src = 'app.html?sync=local&join=' + code; document.body.append(f); const S = () => f.contentDocument; if (!await until(() => S().body.classList.contains('ready') && /선생님 화면을 따라가는 중/.test(S().getElementById('sync-banner')?.textContent), 160)) { console.error('sync: student never followed'); return false; } if (!await until(() => document.querySelector('.sync-count b')?.textContent === '1')) { console.error('sync: teacher count not 1'); return false; } document.querySelector('[data-mode=space]').click(); await w(1500); if (!await until(() => S().body.classList.contains('space'))) { console.error('sync: mode did not follow'); return false; } document.querySelector('[data-mode=ground]').click(); await w(300); const inp = document.getElementById('search'); inp.value = 'Jupiter'; inp.dispatchEvent(new Event('change', { bubbles: true })); await w(2500); const tName = document.querySelector('#info:not([hidden]) h2, #info:not([hidden]) b')?.textContent; if (!await until(() => !S().getElementById('info').hidden)) { console.error('sync: selection did not follow (teacher: ' + tName + ')'); return false; } document.querySelectorAll('.sync-panel .row button')[0].click(); if (!await until(() => /자유롭게/.test(S().getElementById('sync-banner').textContent))) { console.error('sync: pause did not reach student'); return false; } document.querySelectorAll('.sync-panel .row button')[1].click(); if (!await until(() => /따라가는 중/.test(S().getElementById('sync-banner').textContent))) { console.error('sync: gather did not reach student'); return false; } await w(800); [...document.querySelectorAll('.sync-panel .row button')].find(b => /수업 닫기/.test(b.textContent)).click(); if (!await until(() => /선생님이 수업을 닫았습니다/.test(S().getElementById('sync-panel')?.textContent || ''))) { console.error('sync: student not told the class closed'); return false; } return true; })()"),
    'embed':   ('app.html?embed=1', READY + " && document.body.classList.contains('embed')"),
    'phone':   ('app.html', READY + " && document.documentElement.scrollWidth <= innerWidth"),
    'obsscore': ('app.html#m=g&t=2026-10-31T13:00&lat=37.57&lon=126.98&o=M31', OBS_SCORE),
    'obsics':  ('app.html#m=g&t=2026-10-31T13:00&lat=37.57&lon=126.98', OBS_ICS),
    'telsim':  ('app.html#m=g&t=2026-10-31T13:00&lat=37.57&lon=126.98&az=58.7&alt=60&fov=60&o=M31', TEL_SIM),
    'telserial': ('app.html', TEL_SERIAL),
    'tleage':  ('app.html', TLE_AGE),
    # surface landing (landing.js): Earth over Apollo 11, Jezero at local noon and at sunset; then back to space
    'landmoon':  ('app.html#m=s&t=2026-11-12T03:00&land=Apollo%2011&look=earth', "(async () => { const w = (ms) => new Promise(r => setTimeout(r, ms)); for (let i = 0; i < 120 && !document.querySelector('#land-labels span'); i++) await w(250); await w(1500); const c = document.querySelector('.land-ui .lu-sub:nth-child(3)')?.textContent || ''; console.log('[LAND] ' + c + ' | labels: ' + [...document.querySelectorAll('#land-labels span')].map(s => s.textContent).join(', ')); return document.body.classList.contains('landing') && [...document.querySelectorAll('#land-labels span')].some(s => s.textContent === '지구'); })()"),
    'landnoon':  ('app.html#m=s&t=2026-11-12T03:00&land=Perseverance&lt=noon&look=sun', "(async () => { const w = (ms) => new Promise(r => setTimeout(r, ms)); for (let i = 0; i < 120 && !document.querySelector('#land-labels span'); i++) await w(250); await w(1500); const c = document.querySelector('.land-ui .lu-sub:nth-child(3)')?.textContent || ''; console.log('[LAND] ' + c + ' | labels: ' + [...document.querySelectorAll('#land-labels span')].map(s => s.textContent).join(', ')); return document.body.classList.contains('landing') && /현지 태양시 1[12]:/.test(c); })()"),
    'landdusk':  ('app.html#m=s&t=2026-11-12T03:00&land=Perseverance&lt=sunset&look=sun', "(async () => { const w = (ms) => new Promise(r => setTimeout(r, ms)); for (let i = 0; i < 120 && !document.querySelector('#land-labels span'); i++) await w(250); await w(1500); const c = document.querySelector('.land-ui .lu-sub:nth-child(3)')?.textContent || ''; console.log('[LAND] ' + c + ' | labels: ' + [...document.querySelectorAll('#land-labels span')].map(s => s.textContent).join(', ')); return document.body.classList.contains('landing') && /해의 높이 -0\\.[0-9]°/.test(c); })()"),
    'landexit':  ('app.html#m=s&land=Curiosity', "(async () => { const w = (ms) => new Promise(r => setTimeout(r, ms)); for (let i = 0; i < 120 && !document.getElementById('land-exit'); i++) await w(250); await w(800); document.getElementById('land-exit').click(); await w(1500); return !document.body.classList.contains('landing') && document.body.classList.contains('space') && !document.getElementById('land-ui'); })()"),
    # no WebXR in headless Chrome: the VR/AR buttons stay hidden and a Korean note says why
    'xrhide':    ('app.html', READY + " && document.getElementById('vr-btn').hidden && document.getElementById('xrar-btn').hidden && /숨겼습니다/.test(document.getElementById('xr-note').textContent) && !document.getElementById('xr-note').hidden"),
    # stage-6 sandbox: numeric checks for the review fixes (FIX-01..06), then missions, Roche breakup, supernova, Nuri launch, halo orbit
    'sbfixes': ('app.html', "(async () => { const w = (ms) => new Promise(r => setTimeout(r, ms)); document.querySelector('[data-mode=sandbox]').click(); for (let i = 0; i < 40 && !document.querySelector('.sb-dock'); i++) await w(250); await w(600); const A = await import('./atmos.js'), S = (await import('./sandbox.js'))._test, bad = []; const ck = (id, ok, msg) => { if (!ok) { bad.push(id); console.error('[' + id + '] ' + msg); } }; ck('FIX-02a', !/액체 물 가능/.test(A.waterState(300, 0.01)), 'waterState(300 K, 0.01 bar) = ' + A.waterState(300, 0.01)); ck('FIX-02b', /액체 물 가능/.test(A.waterState(300, 1.013)), '300 K, 1 bar should be liquid'); ck('FIX-02c', /액체 물 가능/.test(A.waterState(373.0, 1.01325)) && /끓음/.test(A.waterState(373.3, 1.01325)), 'boiling point at 1 atm should be 373.12 K'); ck('FIX-02d', Math.abs(A.psatWater(373.124) - 1.01325) < 0.002 && Math.abs(A.psatWater(300) - 0.03537) < 0.0003 && Math.abs(A.psatWater(273.16) - 0.00611657) < 2e-6 && Math.abs(A.psatWater(647.096) - 220.64) < 0.01, 'saturation pressure off IAPWS values'); ck('FIX-02e', /판정 불가/.test(A.waterState(300, 500)) && /판정 불가/.test(A.waterState(20, 1)) && /액체 물 없음/.test(A.waterState(735, 92)) && /액체 물 불가/.test(A.waterState(280, 0.004)) && /^얼음/.test(A.waterState(250, 1)), 'range limits'); const mars = S.TERRA().Mars.steps, last = mars[mars.length - 1], fake = { atm: { P: 0.006, mix: {} } }; last[2](fake); ck('FIX-01a', !A.breathable(fake.atm).ok && /이산화탄소/.test(A.breathable(fake.atm).why), 'Mars final air judged breathable'); ck('FIX-01b', !/숨 쉴 수 있는 대기가 됩니다/.test(last[1]), 'Mars text still says the air becomes breathable'); ck('FIX-01c', A.breathable(A.PRESETS.Earth).ok, 'Earth air should be breathable'); let wd = 0; for (let age = 0; age <= 200; age += 0.05) if (/백색왜성/.test(S.starStage({ m: 20, age }).name)) wd++; ck('FIX-03a', !wd, '20 M_sun star became a white dwarf'); ck('FIX-03b', /초신성/.test(S.starStage({ m: 20, age: 1 }).name), '20 M_sun at 1e8 yr: ' + S.starStage({ m: 20, age: 1 }).name); ck('FIX-03c', /백색왜성/.test(S.starStage({ m: 1, age: 200 }).name) && /모형 밖/.test(S.starStage({ m: 0.2, age: 9000 }).name), 'Sun-like and low-mass stages'); const vs = S.TERRA().Venus.steps.find(x => /가리개로 낮과 밤/.test(x[0])), vb = {}; vs[2](vb); ck('FIX-04a', Math.abs((1 - vb.shade) / 0.723 ** 2 - 1) < 0.01, 'shade ' + vb.shade + ' leaves ' + ((1 - vb.shade) / 0.723 ** 2).toFixed(3) + ' of Earth sunlight'); ck('FIX-04b', vb.spinH === undefined && /243일/.test(vs[1]) && /117일/.test(vs[1]) && !/하루는 243일/.test(vs[1]), 'Venus day text or rotation'); const B = S.rtnBasis([1, 0, 0], [1, 1, 0]), D = S.rtnBasis([1, 0, 0], [0, 0, 0]), dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; ck('FIX-05a', Math.abs(B.R[0] - 1) < 1e-12 && Math.abs(B.R[1]) < 1e-12 && Math.abs(B.T[1] - 1) < 1e-12, 'RTN for eccentric case ' + JSON.stringify(B)); ck('FIX-05b', D && [D.R, D.T, D.N].every(v => v.every(Number.isFinite)) && Math.abs(dot(D.R, D.T)) < 1e-12 && Math.abs(dot(D.N, D.T)) < 1e-12, 'degenerate RTN'); ck('FIX-05c', S.rtnBasis([0, 0, 0], [1, 0, 0]) === null, 'zero radius should give null'); const m = S.byName('Mars'); A.atmOf(m); const P0 = m.atm.P, c0 = m.atm.mix.CO2; S.snapshot(); m.atm.P = 5; m.atm.mix.CO2 = 0.1; S.restore(); let m2 = S.byName('Mars'); const ok1 = m2.atm.P === P0 && m2.atm.mix.CO2 === c0; m2.atm.P = 7; m2.atm.mix.CO2 = 0.2; S.restore(); const m3 = S.byName('Mars'); ck('FIX-06', ok1 && m3.atm.P === P0 && m3.atm.mix.CO2 === c0, 'restore lost the initial atmosphere'); document.querySelector('.sb-sel') && (S.byName('Earth'), 0); return !bad.length; })()"),
    'sbhelp': ('app.html', "(async () => { const w = (ms) => new Promise(r => setTimeout(r, ms)); document.querySelector('[data-mode=sandbox]').click(); for (let i = 0; i < 40 && !document.querySelector('.sb-dock'); i++) await w(250); await w(600); const tabs = [...document.querySelectorAll('.sb-tabs button')].map(b => b.textContent); if (tabs.length > 6) console.error('too many groups: ' + tabs.join(', ')); document.querySelector('.sb-helpbtn').click(); await w(300); const card = document.querySelector('.sb-tutcard'); const ok1 = !!card && /1 \\/ 5/.test(card.textContent); for (let i = 0; i < 4; i++) { [...card.querySelectorAll('button')].find(b => b.textContent === '다음').click(); await w(200); } const ok2 = /5 \\/ 5/.test(document.querySelector('.sb-tutcard').textContent); [...document.querySelector('.sb-tutcard').querySelectorAll('button')].find(b => b.textContent === '닫기').click(); const S = (await import('./sandbox.js'))._test; dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' })); await w(2500); const b = document.querySelector('.sb-dock [data-tool=home]'); b.dispatchEvent(new MouseEvent('mouseenter')); await w(800); const tip = document.querySelector('.sb-tip'); return ok1 && ok2 && !document.querySelector('.sb-tutcard') && tabs.length <= 6 && !!tip && !tip.hidden && /자세히/.test(tip.textContent); })()"),
    'sbmission': ('app.html', "(async () => { const w = (ms) => new Promise(r => setTimeout(r, ms)); document.querySelector('[data-mode=sandbox]').click(); for (let i = 0; i < 40 && !document.querySelector('.sb-dock'); i++) await w(250); await w(600); [...document.querySelectorAll('.sb-labrow button')].find(b => b.textContent.includes('임무 모드')).click(); await w(600); document.querySelector('.sb-lab .sb-go').click(); await w(500); const p = [...document.querySelectorAll('.sb-sel')][0]; const dv = document.querySelector('.sb-dvp'); dv.value = 2950; document.querySelector('.sb-burngo').click(); await w(6000); const t = document.querySelector('.sb-lab').innerText; console.log('[mission] ' + t.split('\\n').filter(l => /Δv|결과|거리/.test(l)).join(' | ')); return /2\\.95/.test(t) && !/실패/.test(t); })()"),
    'sbroche': ('app.html', "(async () => { const w = (ms) => new Promise(r => setTimeout(r, ms)); document.querySelector('[data-mode=sandbox]').click(); for (let i = 0; i < 40 && !document.querySelector('.sb-dock'); i++) await w(250); await w(600); [...document.querySelectorAll('.sb-scenbtn')].find(b => b.textContent.includes('로슈 한계')).click(); await w(400); for (let i = 0; i < 40 && !document.querySelector('.sb-toast:not([hidden])')?.textContent.includes('로슈'); i++) await w(250); await w(2500); return /로슈 한계/.test(document.querySelector('.sb-toast').textContent) || document.querySelectorAll('.sb-label').length > 100; })()"),
    'sbsuper': ('app.html', "(async () => { const w = (ms) => new Promise(r => setTimeout(r, ms)); document.querySelector('[data-mode=sandbox]').click(); for (let i = 0; i < 40 && !document.querySelector('.sb-dock'); i++) await w(250); await w(600); [...document.querySelectorAll('.sb-scenbtn')].find(b => b.textContent.includes('15 태양질량')).click(); await w(400); for (let i = 0; i < 60 && !/초신성 폭발/.test(document.querySelector('.sb-toast').textContent); i++) await w(250); await w(1500); return /중성자별/.test(document.querySelector('.sb-toast').textContent + document.body.innerText); })()"),
    'sbnuri': ('app.html', "(async () => { const w = (ms) => new Promise(r => setTimeout(r, ms)); document.querySelector('[data-mode=sandbox]').click(); for (let i = 0; i < 40 && !document.querySelector('.sb-dock'); i++) await w(250); await w(600); [...document.querySelectorAll('.sb-labrow button')].find(b => b.textContent.includes('누리호 발사 실습')).click(); await w(600); [...document.querySelectorAll('.sb-lab button')].find(b => b.textContent === '성공하는 예시 값').click(); await w(200); [...document.querySelectorAll('.sb-lab button')].find(b => b.textContent === '발사').click(); for (let i = 0; i < 80 && !/엔진 정지|추락|시간 초과/.test(document.querySelector('.sb-lab .sb-res').innerText); i++) await w(250); const t = document.querySelector('.sb-lab .sb-res').innerText; console.log('[nuri] ' + t.replace(/\\n/g, ' | ')); return /성공/.test(t); })()"),
    'sbhalo': ('app.html', "(async () => { const w = (ms) => new Promise(r => setTimeout(r, ms)); document.querySelector('[data-mode=sandbox]').click(); for (let i = 0; i < 40 && !document.querySelector('.sb-dock'); i++) await w(250); await w(600); [...document.querySelectorAll('.sb-labrow button')].find(b => b.textContent.includes('다양한 궤도 사례')).click(); await w(600); await w(1500); const t = document.querySelector('.sb-lab .sb-res').innerText; console.log('[halo] ' + t.replace(/\\n/g, ' | ')); const m = t.match(/주기 (?:약 )?([\\d.,]+)일/); return !!m && +m[1].replace(',', '') > 150 && +m[1].replace(',', '') < 200; })()"),
    # UX pass (feat/ux): ground at night and by day, the space default view, planet names from far out, a distant star flyTo then a rotate
    'groundnight': ('app.html#m=g&t=2026-10-31T13:00&lat=37.57&lon=126.98&az=200&alt=8&fov=80', READY + " && !!document.getElementById('first-btn')"),
    'groundday': ('app.html#m=g&t=2026-10-31T02:00&lat=37.57&lon=126.98&az=200&alt=8&fov=80', READY),
    'spacehome': ('app.html#m=s', "(async () => { const w = (ms) => new Promise(r => setTimeout(r, ms)); const c = document.getElementById('c'); c.setPointerCapture = () => {}; const pe = (t, x, y) => c.dispatchEvent(new PointerEvent(t, { pointerId: 7, clientX: x, clientY: y, bubbles: true, pointerType: 'mouse' })); pe('pointerdown', 640, 430); for (let k = 1; k <= 10; k++) { pe('pointermove', 640 + k * 18, 430 + k * 6); await w(30); } pe('pointerup', 820, 490); await w(800); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' })); await w(2500); return /지구|Earth/.test(document.getElementById('sp-target').textContent); })()"),
    'spacefar': ('app.html#m=s', "(async () => { const w = (ms) => new Promise(r => setTimeout(r, ms)); const c = document.getElementById('c'); for (let k = 0; k < 25; k++) { c.dispatchEvent(new WheelEvent('wheel', { deltaY: 400, clientX: 640, clientY: 430, bubbles: true, cancelable: true })); await w(40); } await w(2000); const L = [...document.querySelectorAll('.lbl.planet')].filter(l => l.style.display !== 'none').map(l => l.textContent); console.log('[HANGUL] labels: ' + L.join(',')); return ['목성', '토성', '해왕성', '천왕성'].every(n => L.includes(n)); })()"),
    'starfly': ('app.html#m=s', "(async () => { const w = (ms) => new Promise(r => setTimeout(r, ms)); const s = document.getElementById('search'); s.value = 'Sirius'; s.dispatchEvent(new Event('change')); await w(9000); const c = document.getElementById('c'); c.setPointerCapture = () => {}; const pe = (t, x, y) => c.dispatchEvent(new PointerEvent(t, { pointerId: 7, clientX: x, clientY: y, bubbles: true, pointerType: 'mouse' })); pe('pointerdown', 640, 430); for (let k = 1; k <= 10; k++) { pe('pointermove', 640 + k * 18, 430 + k * 6); await w(30); } pe('pointerup', 820, 490); await w(800); const r = document.getElementById('sel-ring'); console.log('[HANGUL] ring ' + r.hidden + ' ' + r.style.left + ',' + r.style.top); return !r.hidden; })()"),
    'tutorial': ('app.html', "(async () => { const w = (ms) => new Promise(r => setTimeout(r, ms)); document.getElementById('help-btn').click(); await w(300); const b = [...document.querySelectorAll('.ux-list button')]; b[4].click(); await w(1500); return b.length === 5 && !!document.querySelector('.guide-hl'); })()"),
    'uxphone': ('app.html#m=g&o=Jupiter', "(async () => { const w = (ms) => new Promise(r => setTimeout(r, ms)); await w(1500); document.querySelector('.menu-btn').click(); await w(400); return document.documentElement.scrollWidth <= innerWidth && !document.querySelector('.menu-pop:not([hidden])') === false; })()"),
    'uxmenu': ('app.html#m=g&o=Jupiter', "(async () => { const w = (ms) => new Promise(r => setTimeout(r, ms)); await w(1500); document.querySelector('.menu-btn').click(); await w(400); return !!document.querySelector('.menu-pop:not([hidden])'); })()"),
}
IGNORE = ('celestrak.org', 'wikipedia.org', 'wikimedia.org', 'fonts.g', 'alasky', 'hips2fits', 'swpc.noaa', 'open-meteo', 'ssd-api.jpl', 'gibs.earthdata', 'favicon.ico')

def browser():
    for p in (os.environ.get('QA_BROWSER'), r'C:\Program Files\Google\Chrome\Application\chrome.exe', r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
              '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', shutil.which('google-chrome'), shutil.which('chromium'), shutil.which('chromium-browser')):
        if p and os.path.exists(p): return p
    sys.exit('Chrome or Edge not found (set QA_BROWSER)')

def free_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

class Server(http.server.ThreadingHTTPServer):
    request_queue_size = 256  # the browser opens dozens of connections at once; the default backlog of 5 refuses some
    daemon_threads = True

class CDP:
    def __init__(self, url): self.ws = websocket.create_connection(url, timeout=60); self.n = 0; self.events = []
    def call(self, method, **params):
        self.n += 1; my = self.n; self.ws.send(json.dumps({'id': my, 'method': method, 'params': params}))
        while True:
            m = json.loads(self.ws.recv())
            if m.get('id') == my:
                if 'error' in m: raise RuntimeError(f"{method}: {m['error']}")
                return m.get('result', {})
            self.events.append(m)
    def pump(self, seconds):
        end = time.time() + seconds; self.ws.settimeout(0.2)
        while time.time() < end:
            try: self.events.append(json.loads(self.ws.recv()))
            except websocket.WebSocketTimeoutException: pass
        self.ws.settimeout(60)

def run(names):
    port, dport = free_port(), free_port()
    srv = Server(('127.0.0.1', port), functools.partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    prof = tempfile.mkdtemp(prefix='sc-qa-')
    proc = subprocess.Popen([browser(), '--headless=new', f'--remote-debugging-port={dport}', f'--user-data-dir={prof}', '--no-first-run',
                             '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--window-size=1280,860', 'about:blank'],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    OUT.mkdir(parents=True, exist_ok=True); failed = 0
    try:
        import urllib.request
        for _ in range(50):
            try: tabs = json.load(urllib.request.urlopen(f'http://127.0.0.1:{dport}/json')); break
            except OSError: time.sleep(0.2)
        page = next(t for t in tabs if t['type'] == 'page')
        c = CDP(page['webSocketDebuggerUrl'])
        for d in ('Runtime', 'Log', 'Network', 'Page'): c.call(d + '.enable')
        c.call('Network.setCacheDisabled', cacheDisabled=True)
        for name in names:
            path, check = SCENARIOS[name]
            phone = name in ('phone', 'sbphone', 'uxphone')
            c.call('Emulation.setDeviceMetricsOverride', width=375 if phone else 1280, height=812 if phone else 860, deviceScaleFactor=1, mobile=phone)
            c.events.clear(); t0 = time.time()
            c.call('Page.navigate', url=f'http://127.0.0.1:{port}/{path}')
            for _ in range(120):  # up to 60 s for the catalogues
                c.pump(0.5)
                if path.startswith(('index', 'tools/')) or c.call('Runtime.evaluate', expression=READY, returnByValue=True)['result'].get('value'): break
            c.pump(2)
            ok = c.call('Runtime.evaluate', expression=check, awaitPromise=True, returnByValue=True)
            passed = bool(ok['result'].get('value')) and 'exceptionDetails' not in ok
            c.pump(1.5)
            problems = []
            reqs = {}
            for e in c.events:
                m, p = e.get('method'), e.get('params', {})
                if m == 'Runtime.exceptionThrown':
                    d = p['exceptionDetails']; problems.append('exception: ' + (d.get('exception', {}).get('description') or d.get('text', '')).split('\n')[0])
                elif m == 'Runtime.consoleAPICalled' and p.get('type') == 'error':
                    txt = ' '.join(str(a.get('value', a.get('description', ''))) for a in p.get('args', []))
                    if not any(s in txt for s in IGNORE): problems.append('console.error: ' + txt[:200 if 'Shader' not in txt else 6000])
                elif m == 'Runtime.consoleAPICalled' and str(p.get('args', [{}])[0].get('value', '')).startswith(('[HANGUL]', '[LAND]')): print('        ' + p['args'][0]['value'])
                elif m == 'Network.requestWillBeSent': reqs[p['requestId']] = p['request']['url']
                elif m == 'Network.responseReceived':
                    u, st = p['response']['url'], p['response']['status']
                    if st >= 400 and f'127.0.0.1:{port}' in u: problems.append(f'{st}: {u.split(str(port))[1]}')
                elif m == 'Network.loadingFailed':
                    u = reqs.get(p['requestId'], '')
                    if f'127.0.0.1:{port}' in u and not p.get('canceled'): problems.append(f"failed: {u.split(str(port))[1]} {p.get('errorText', '')}")
            shot = c.call('Page.captureScreenshot', format='jpeg', quality=70)
            (OUT / f'{name}.jpg').write_bytes(base64.b64decode(shot['data']))
            good = passed and not problems
            failed += not good
            print(f"{'PASS' if good else 'FAIL'}  {name:8s} {time.time() - t0:5.1f}s" + ('' if passed else '  (check failed)'))
            for pr in dict.fromkeys(problems): print('        ' + pr)
    finally:
        proc.terminate(); srv.shutdown()
        try: proc.wait(5)
        except subprocess.TimeoutExpired: proc.kill()
        shutil.rmtree(prof, ignore_errors=True)
    print(f"\n{len(names) - failed}/{len(names)} passed, screenshots in {OUT.relative_to(ROOT)}")
    return failed

if __name__ == '__main__':
    names = sys.argv[1:] or list(SCENARIOS)
    bad = [n for n in names if n not in SCENARIOS]
    if bad: sys.exit(f"unknown scenario {bad}; choose from {', '.join(SCENARIOS)}")
    sys.exit(1 if run(names) else 0)
