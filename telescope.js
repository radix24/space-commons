// Telescope connection (망원경 연결) for Space Commons: a step-by-step wizard for people who have never used a go-to mount.
// Links: Web Serial (Celestron NexStar and Sky-Watcher SynScan hand controllers, Meade LX200), ASCOM Alpaca over HTTP,
// and a built-in practice mount. SynScan WiFi talks UDP, which browsers cannot send, so that case is detected and explained.
// Mounts work in the equinox of date; the app's catalogue is J2000, so coordinates are precessed both ways.

const D2R = Math.PI / 180, R2D = 180 / Math.PI, wrap = (a) => ((a % 360) + 360) % 360;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---------- angle encodings ----------
export const nexHex = (deg) => Math.round(wrap(deg) / 360 * 4294967296) % 4294967296 >>> 0;
export const hex8 = (deg) => nexHex(deg).toString(16).toUpperCase().padStart(8, '0');
export const fromHex = (h) => parseInt(h, 16) / 4294967296 * 360;
const decFromHex = (h) => { const d = fromHex(h); return d > 180 ? d - 360 : d; };
const pad = (n, k) => String(Math.floor(n)).padStart(k, '0');
export function lxRa(ra) { const s = Math.round(wrap(ra) / 15 * 3600) % 86400; return `${pad(s / 3600, 2)}:${pad(s % 3600 / 60, 2)}:${pad(s % 60, 2)}`; }
export function lxDec(dec) { const s = Math.round(Math.abs(dec) * 3600); return `${dec < 0 ? '-' : '+'}${pad(s / 3600, 2)}*${pad(s % 3600 / 60, 2)}:${pad(s % 60, 2)}`; }
const parseLxRa = (t) => { const [h, m, s] = t.replace('#', '').split(':').map(Number); return (h + m / 60 + (s || 0) / 3600) * 15; };
const parseLxDec = (t) => { const m = t.replace('#', '').match(/([+-]?)(\d+)\D(\d+)(?:\D(\d+))?/); const v = +m[2] + +m[3] / 60 + (+m[4] || 0) / 3600; return m[1] === '-' ? -v : v; };

// ---------- a serial line: write a command, read until '#' ----------
class SerialLine {
  constructor(port) { this.port = port; this.buf = ''; this.queue = Promise.resolve(); }
  async open() {
    await this.port.open({ baudRate: 9600 }); // NexStar, SynScan and LX200 hand controllers all talk at 9600
    this.writer = this.port.writable.getWriter(); this.reader = this.port.readable.getReader();
    (async () => { const dec = new TextDecoder('latin1'); try { for (;;) { const { value, done } = await this.reader.read(); if (done) break; this.buf += dec.decode(value); } } catch {} })();
  }
  cmd(data, { end = '#', n = 0, timeout = 2500 } = {}) { // n > 0: fixed-length reply instead of a terminator
    const run = async () => { this.buf = ''; const bytes = typeof data === 'string' ? Uint8Array.from(data, c => c.charCodeAt(0)) : data;
      await this.writer.write(bytes); const t0 = performance.now();
      while (performance.now() - t0 < timeout) { if (n ? this.buf.length >= n : end && this.buf.includes(end)) { const r = n ? this.buf.slice(0, n) : this.buf.slice(0, this.buf.indexOf(end) + 1); this.buf = ''; return r; } await sleep(15); }
      const e = new Error('timeout'); e.code = 'timeout'; throw e; };
    const p = this.queue.then(run, run); this.queue = p.catch(() => {}); return p;
  }
  async close() { try { await this.reader.cancel(); this.reader.releaseLock(); } catch {} try { this.writer.releaseLock(); } catch {} try { await this.port.close(); } catch {} }
}

// ---------- protocols: all angles here are RA/Dec of date, degrees ----------
// Celestron NexStar hand controller (NexStar+, StarSense): precise 32-bit commands e/r/s, L, M, K, V, P passthrough
// Sky-Watcher SynScan hand controller: the same command set (SynScan mirrors NexStar); its V reply is six hex digits
const nexPassthrough = (axis, dir, rate) => Uint8Array.from([80, 2, axis ? 17 : 16, dir > 0 ? 36 : 37, rate, 0, 0, 0]);
class NexStarLike {
  constructor(line, kind) { this.line = line; this.kind = kind; this.name = kind === 'synscan' ? 'Sky-Watcher SynScan' : 'Celestron NexStar'; }
  async hello() { const r = await this.line.cmd('Kx', { timeout: 2000 }); if (r !== 'x#') throw Object.assign(new Error('bad echo'), { code: 'timeout' });
    try { const v = await this.line.cmd('V', { timeout: 1500 }); this.version = this.kind === 'synscan' && /^[0-9A-F]{6}#$/i.test(v) ? [0, 2, 4].map(i => parseInt(v.slice(i, i + 2), 16)).join('.') : v.length >= 3 ? `${v.charCodeAt(0)}.${v.charCodeAt(1)}` : '?'; } catch { this.version = '?'; } }
  async getRaDec() { const r = await this.line.cmd('e'); const [a, b] = r.replace('#', '').split(','); return { ra: fromHex(a), dec: decFromHex(b) }; }
  async goto(ra, dec) { await this.line.cmd(`r${hex8(ra)},${hex8(dec)}`); }
  async sync(ra, dec) { await this.line.cmd(`s${hex8(ra)},${hex8(dec)}`); }
  async slewing() { return (await this.line.cmd('L')).startsWith('1'); }
  async stop() { await this.line.cmd('M'); }
  async move(axis, dir, rate) { await this.line.cmd(nexPassthrough(axis, dir, rate)); } // rate 0 stops that axis
  async close() { await this.line.close(); }
}
// Meade LX200 (and the many mounts that copy it)
class LX200 {
  constructor(line) { this.line = line; this.name = 'Meade LX200'; }
  async hello() { await this.line.cmd(':GR#', { timeout: 2000 }); this.version = '?'; }
  async getRaDec() { return { ra: parseLxRa(await this.line.cmd(':GR#')), dec: parseLxDec(await this.line.cmd(':GD#')) }; }
  async goto(ra, dec) { await this.line.cmd(`:Sr${lxRa(ra)}#`, { n: 1 }); await this.line.cmd(`:Sd${lxDec(dec)}#`, { n: 1 }); const r = await this.line.cmd(':MS#', { n: 1 });
    if (r !== '0') throw Object.assign(new Error('below'), { code: 'lx-refused' }); }
  async sync(ra, dec) { await this.line.cmd(`:Sr${lxRa(ra)}#`, { n: 1 }); await this.line.cmd(`:Sd${lxDec(dec)}#`, { n: 1 }); await this.line.cmd(':CM#'); }
  async slewing() { const r = await this.line.cmd(':D#'); return r.replace('#', '').trim().length > 0; }
  async stop() { await this.line.cmd(':Q#', { end: null, timeout: 50 }).catch(() => {}); }
  async move(axis, dir, rate) { const c = rate ? `:M${axis ? (dir > 0 ? 'n' : 's') : (dir > 0 ? 'e' : 'w')}#` : `:Q${axis ? (dir > 0 ? 'n' : 's') : (dir > 0 ? 'e' : 'w')}#`; await this.line.cmd(c, { end: null, timeout: 30 }).catch(() => {}); }
  async close() { await this.line.close(); }
}
export async function openSerialMount(port, kind) {
  const line = new SerialLine(port); await line.open();
  const m = kind === 'lx200' ? new LX200(line) : new NexStarLike(line, kind);
  try { await m.hello(); } catch (e) { await line.close(); throw e; }
  return m;
}

// ---------- ASCOM Alpaca over HTTP ----------
class Alpaca {
  constructor(base) { this.base = base.replace(/\/$/, '') + '/api/v1/telescope/0/'; this.name = 'ASCOM Alpaca'; this.tid = 1; }
  async call(method, what, params) {
    const q = new URLSearchParams({ ClientID: '7', ClientTransactionID: String(this.tid++), ...(params || {}) });
    const r = await fetch(this.base + what + (method === 'GET' ? '?' + q : ''), method === 'GET' ? {} : { method: 'PUT', body: q });
    const j = await r.json(); if (j.ErrorNumber) throw Object.assign(new Error(j.ErrorMessage), { code: 'alpaca', alpaca: j.ErrorMessage }); return j.Value;
  }
  async hello() { await this.call('PUT', 'connected', { Connected: 'true' }); this.version = String(await this.call('GET', 'interfaceversion').catch(() => '?'));
    if (await this.call('GET', 'cansettracking').catch(() => false)) await this.call('PUT', 'tracking', { Tracking: 'true' }).catch(() => {}); }
  async getRaDec() { return { ra: (await this.call('GET', 'rightascension')) * 15, dec: await this.call('GET', 'declination') }; }
  async goto(ra, dec) { await this.call('PUT', 'slewtocoordinatesasync', { RightAscension: (wrap(ra) / 15).toFixed(6), Declination: dec.toFixed(6) }); }
  async sync(ra, dec) { await this.call('PUT', 'synctocoordinates', { RightAscension: (wrap(ra) / 15).toFixed(6), Declination: dec.toFixed(6) }); }
  async slewing() { return !!(await this.call('GET', 'slewing')); }
  async stop() { await this.call('PUT', 'abortslew'); }
  async move(axis, dir, rate) { await this.call('PUT', 'moveaxis', { Axis: String(axis), Rate: String(rate ? dir * rate * 0.25 : 0) }); }
  async close() { await this.call('PUT', 'connected', { Connected: 'false' }).catch(() => {}); }
}

// ---------- practice mount: slews at 4°/s per axis, tracks the sky, starts with a pointing error that sync removes ----------
export class SimMount {
  constructor(start = { ra: 0, dec: 89 }, err = { ra: 0.45, dec: -0.35 }) { this.name = '연습용 가대'; this.version = 'sim'; this.pos = { ...start }; this.err = { ...err }; this.target = null; this.rates = [0, 0];
    this.t = performance.now(); this.timer = setInterval(() => this.step(), 50); }
  step() { const now = performance.now(), dt = Math.min(0.5, (now - this.t) / 1000); this.t = now;
    if (this.target) { let dRa = ((this.target.ra - this.pos.ra + 540) % 360) - 180, dDec = this.target.dec - this.pos.dec, k = 4 * dt;
      this.pos.ra = wrap(this.pos.ra + Math.sign(dRa) * Math.min(Math.abs(dRa), k)); this.pos.dec += Math.sign(dDec) * Math.min(Math.abs(dDec), k);
      if (Math.abs(dRa) <= k && Math.abs(dDec) <= k) { this.pos = { ...this.target }; this.target = null; } }
    this.pos.ra = wrap(this.pos.ra + this.rates[0] * dt); this.pos.dec = Math.max(-90, Math.min(90, this.pos.dec + this.rates[1] * dt)); }
  hello() {} // the mount reports where it thinks it points; where the tube really points is that plus the alignment error
  async getRaDec() { return { ...this.pos }; }
  trueRaDec() { return { ra: wrap(this.pos.ra + this.err.ra), dec: this.pos.dec + this.err.dec }; }
  async goto(ra, dec) { this.target = { ra: wrap(ra), dec }; }
  async sync(ra, dec) { const t = this.trueRaDec(); this.err = { ra: ((t.ra - ra + 540) % 360) - 180, dec: t.dec - dec }; this.pos = { ra: wrap(ra), dec }; }
  async slewing() { return !!this.target; }
  async stop() { this.target = null; this.rates = [0, 0]; }
  async move(axis, dir, rate) { this.rates[axis] = rate ? dir * [0, 0.004, 0.008, 0.016, 0.03, 0.06, 0.12, 0.5, 1.5, 3][rate] : 0; }
  async close() { clearInterval(this.timer); }
}

// ---------- plain-language errors, each with a fix ----------
export function explain(e, how) {
  const n = e?.name, c = e?.code;
  if (c === 'no-serial') return ['이 브라우저는 USB 연결을 지원하지 않습니다. Chrome이나 Edge로 열어 주세요.', '휴대폰과 사파리, 파이어폭스는 USB 연결을 할 수 없습니다. 컴퓨터의 Chrome이나 Edge가 필요합니다.'];
  if (n === 'NotFoundError') return ['포트를 고르지 않았습니다.', '다시 눌러 목록에서 망원경을 골라 주세요. 보통 이름에 USB Serial, Prolific, CP210x, FTDI가 들어 있습니다. 목록이 비어 있으면 케이블이 꽂혔는지 확인해 주세요.'];
  if (n === 'InvalidStateError' || n === 'NetworkError') return ['다른 프로그램이 이 포트를 쓰고 있습니다.', 'SynScan 앱, 스텔라리움 같은 다른 천문 프로그램을 닫고 케이블을 뺐다가 다시 꽂은 뒤 시도해 주세요.'];
  if (c === 'timeout') return ['망원경이 대답하지 않습니다.', '가대 전원이 켜졌는지, 핸드 컨트롤러 화면이 처음 설정을 끝냈는지, 케이블이 핸드 컨트롤러 아래쪽 단자에 꽂혔는지, 앞 단계에서 제조사를 맞게 골랐는지 확인해 주세요.'];
  if (c === 'synscan-wifi') return ['SynScan 와이파이는 브라우저에서 바로 연결할 수 없습니다.', '와이파이 망원경은 UDP라는 방식으로만 대화하는데, 보안 때문에 브라우저는 UDP를 보낼 수 없습니다. 아래의 다른 방법을 써 주세요.'];
  if (c === 'mixed') return ['보안 연결(https) 페이지라 http 주소의 망원경 서버에 닿을 수 없습니다.', 'Chrome 주소창 왼쪽 아이콘 > 사이트 설정 > 안전하지 않은 콘텐츠를 허용으로 바꾸거나, PC에서 Space Commons를 내려받아 http로 열어 주세요.'];
  if (c === 'alpaca') return ['망원경 서버가 명령을 거절했습니다: ' + e.alpaca, '서버 프로그램 화면에서 망원경이 연결됨으로 보이는지 확인해 주세요.'];
  if (c === 'lx-refused') return ['망원경이 그쪽으로 갈 수 없다고 답했습니다.', '대상이 지평선 아래이거나 가대가 움직일 수 있는 범위 밖입니다. 다른 천체를 골라 주세요.'];
  if (how === 'alpaca') return ['망원경 서버(Alpaca)에 닿지 못했습니다.', 'PC에서 서버 프로그램이 켜져 있는지, 이 기기와 같은 와이파이인지, 주소와 포트(보통 11111)가 맞는지 확인해 주세요. 서버 설정에서 다른 기기의 접속(CORS)을 허용해야 할 수도 있습니다.'];
  return ['연결 중 문제가 생겼습니다: ' + (e?.message || e), '케이블을 뺐다가 다시 꽂고, 가대 전원을 껐다 켠 뒤 다시 시도해 주세요.'];
}

const STARS = [ // bright, easy alignment stars (J2000)
  ['시리우스', 'Sirius', 101.287, -16.716], ['베가 (직녀성)', 'Vega', 279.234, 38.784], ['아르크투루스', 'Arcturus', 213.915, 19.182], ['카펠라', 'Capella', 79.172, 45.998],
  ['리겔', 'Rigel', 78.634, -8.202], ['프로키온', 'Procyon', 114.825, 5.225], ['베텔게우스', 'Betelgeuse', 88.793, 7.407], ['알타이르 (견우성)', 'Altair', 297.696, 8.868],
  ['알데바란', 'Aldebaran', 68.980, 16.509], ['스피카', 'Spica', 201.298, -11.161], ['안타레스', 'Antares', 247.352, -26.432], ['폴룩스', 'Pollux', 116.329, 28.026],
  ['데네브', 'Deneb', 310.358, 45.280], ['레굴루스', 'Regulus', 152.093, 11.967], ['포말하우트', 'Fomalhaut', 344.413, -29.622]];
const DIR8 = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
const sep = (a, b) => { const c = Math.sin(a.dec * D2R) * Math.sin(b.dec * D2R) + Math.cos(a.dec * D2R) * Math.cos(b.dec * D2R) * Math.cos((a.ra - b.ra) * D2R); return Math.acos(Math.max(-1, Math.min(1, c))) * R2D; };

// ---------- simple line drawings for "I don't know my telescope" ----------
const SVG = (inner) => `<svg viewBox="0 0 120 90" width="120" height="90" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2">${inner}</svg>`;
const DRAW = {
  refractor: SVG('<path d="M20 52 L96 22 L100 32 L24 62 Z"/><path d="M60 46 L48 84 M60 46 L72 84 M60 46 L60 84"/><rect x="92" y="18" width="10" height="16"/>'),
  dob: SVG('<rect x="34" y="56" width="52" height="28"/><path d="M40 60 L84 10 L96 20 L52 70 Z"/><circle cx="60" cy="58" r="4"/>'),
  sct: SVG('<rect x="38" y="22" width="44" height="36"/><path d="M50 58 L40 84 M70 58 L80 84 M60 58 L60 84"/><path d="M82 30 L92 30 L92 50 L82 50"/><circle cx="60" cy="40" r="10"/>'),
  eq: SVG('<path d="M24 34 L92 14 L96 24 L28 44 Z"/><path d="M58 30 L58 48 L72 62"/><path d="M72 62 L84 74"/><circle cx="86" cy="76" r="5"/><path d="M58 48 L46 84 M58 48 L70 84"/>'),
};

// ---------- the wizard ----------
let C = null, mount = null, how = null, kind = 'nexstar', step = 'start', align = null, gotoBusy = false, sunOK = false, posJ = null, maker = null;
const W = { state: 'idle' };
const ui = () => C.$('tel-body');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const term = (word, meaning) => `<dfn title="${esc(meaning)}">${word}</dfn><span class="tel-gloss"> (${meaning})</span>`;
const steps = ['켜기', '연결', '맞추기', '돌리기'];
function frame(n, title, body) {
  const bar = n ? `<ol class="tel-steps">${steps.map((s, i) => `<li class="${i + 1 < n ? 'done' : i + 1 === n ? 'on' : ''}">${i + 1}. ${s}</li>`).join('')}</ol>` : '';
  ui().innerHTML = `${bar}<h3>${title}</h3>${body}<div id="tel-err" class="tel-err" hidden></div>`;
  for (const b of ui().querySelectorAll('[data-go]')) b.onclick = () => go(b.dataset.go);
}
function showErr(e) { const [msg, fix] = explain(e, how); const el = C.$('tel-err'); if (!el) return; el.hidden = false; el.innerHTML = `<b></b><div></div>`; el.firstChild.textContent = msg; el.lastChild.textContent = fix; }

function go(s) { step = s; W.state = s; render(); }
function render() {
  if (step === 'start') return frame(0, '망원경 연결하기', `<p>${term('고투 가대', '원하는 천체로 스스로 돌아가는 망원경 받침대')}가 있는 망원경을 이 앱으로 움직입니다. 어떻게 연결할지 골라 주세요.</p>
    <div class="tel-choices"><button data-go="usb">USB 케이블<span>망원경과 컴퓨터를 케이블로 잇습니다 (Chrome, Edge)</span></button>
    <button data-go="wifi">와이파이<span>망원경이나 PC 프로그램에 무선으로 잇습니다</span></button>
    <button data-go="sim">연습 모드<span>망원경 없이 진짜처럼 움직이는 연습용 가대로 해 봅니다</span></button></div>
    <button class="tel-link" data-go="pick">내 망원경이 뭔지 모르겠어요</button>`);
  if (step === 'pick') return frame(0, '내 망원경 찾기', `<p>망원경을 만든 회사 이름은 보통 경통(긴 통)이나 받침대에 적혀 있습니다.</p>
    <div class="tel-choices">${[['celestron', 'Celestron (셀레스트론)'], ['skywatcher', 'Sky-Watcher (스카이워처)'], ['meade', 'Meade (미드)'], ['other', '다른 회사이거나 모르겠어요']].map(([k, t]) => `<button data-maker="${k}">${t}</button>`).join('')}</div>
    <button class="tel-link" data-go="start">처음으로</button>`), ui().querySelectorAll('[data-maker]').forEach(b => b.onclick = () => { maker = b.dataset.maker; go('shape'); });
  if (step === 'shape') return frame(0, '어떻게 생겼나요?', `<p>가장 비슷한 그림을 골라 주세요.</p><div class="tel-shapes">
    <button data-shape="refractor">${DRAW.refractor}<b>긴 통 + 세 다리</b><span>${term('굴절 망원경', '앞쪽 렌즈로 빛을 모으는 망원경')}</span></button>
    <button data-shape="sct">${DRAW.sct}<b>짧고 굵은 통 + 한 팔</b><span>${term('슈미트-카세그레인', '거울과 렌즈를 함께 쓰는 짧은 망원경')}</span></button>
    <button data-shape="eq">${DRAW.eq}<b>기울어진 축 + 무거운 추</b><span>${term('적도의', '별의 움직임을 따라가는 받침대')}</span></button>
    <button data-shape="dob">${DRAW.dob}<b>상자 받침 + 굵은 통</b><span>${term('돕소니안', '상자 받침 위에 올린 반사 망원경')}</span></button></div>
    <button class="tel-link" data-go="pick">뒤로</button>`), ui().querySelectorAll('[data-shape]').forEach(b => b.onclick = () => advise(b.dataset.shape));
  if (step === 'usb') return frame(1, '1단계: 전원을 켜고 케이블을 꽂으세요', `<ol class="tel-list"><li>망원경을 평평한 곳에 세우고 가대 전원을 켭니다.</li>
    <li>${term('핸드 컨트롤러', '망원경에 달린 버튼 달린 리모컨')} 화면이 시각·장소를 물으면 끝까지 입력해 시작 상태로 둡니다.</li>
    <li>핸드 컨트롤러 아래쪽 단자와 컴퓨터를 USB 케이블로 잇습니다. 오래된 모델은 직렬(RS-232)-USB 변환 케이블이 필요합니다.</li></ol>
    <p>망원경을 만든 회사를 골라 주세요. 회사마다 쓰는 말(${term('프로토콜', '기계끼리 주고받는 명령의 약속')})이 다릅니다.</p>
    <div class="tel-choices tel-row">${[['nexstar', 'Celestron'], ['synscan', 'Sky-Watcher'], ['lx200', 'Meade']].map(([k, t]) => `<label><input type="radio" name="tel-kind" value="${k}"${kind === k ? ' checked' : ''}> ${t}</label>`).join('')}</div>
    <div class="tel-nav"><button data-go="start">뒤로</button><button class="primary" data-next="connect">다 했어요</button></div>`), after(() => { how = 'usb'; ui().querySelectorAll('[name=tel-kind]').forEach(r => r.onchange = () => kind = r.value); });
  if (step === 'wifi') return frame(1, '1단계: 어떤 와이파이 연결인가요?', `<div class="tel-choices">
    <button data-go="synscanwifi">스카이워처 SynScan 와이파이<span>망원경이 만든 와이파이(SynScan_로 시작)에 휴대폰을 잇는 방식</span></button>
    <button data-go="alpaca">PC의 망원경 서버 (ASCOM Alpaca)<span>망원경을 PC에 잇고, PC 프로그램이 주소를 알려 주는 방식</span></button></div>
    <button class="tel-link" data-go="start">뒤로</button>`);
  if (step === 'synscanwifi') return frame(1, '와이파이 망원경은 브라우저와 바로 이어지지 않습니다', `<p>SynScan 와이파이는 UDP라는 방식으로만 대화합니다. 보안을 위해 웹 브라우저는 UDP를 보낼 수 없어서, 이 앱이 망원경과 직접 이야기할 수 없습니다.</p>
    <p><b>대신 이렇게 할 수 있습니다</b></p><ol class="tel-list"><li>휴대폰의 SynScan Pro 앱으로 망원경을 움직이고, 이 앱은 어디를 볼지 고르는 별지도로 씁니다.</li>
    <li>PC에 SynScan Pro 앱과 ASCOM Remote(무료)를 설치하면 PC가 ${term('Alpaca 서버', '망원경을 웹 주소로 움직이게 해 주는 PC 프로그램')}가 됩니다. 그 주소로 이 앱을 연결할 수 있습니다.</li>
    <li>USB 단자가 있는 핸드 컨트롤러라면 USB 케이블로 연결합니다.</li></ol>
    <div class="tel-nav"><button data-go="wifi">뒤로</button><button data-go="alpaca">Alpaca 서버가 있어요</button><button data-go="usb">USB로 할게요</button></div>`);
  if (step === 'alpaca') return frame(1, '1단계: PC의 망원경 서버 주소를 적어 주세요', `<p>PC의 서버 프로그램(ASCOM Remote 등) 화면에 나오는 주소입니다. 이 기기와 PC가 같은 와이파이에 있어야 합니다.</p>
    <input id="tel-url" class="tel-input" placeholder="http://192.168.0.10:11111" value="${esc(localStorage.getItem('sc-alpaca') || '')}">
    <p class="small">주소는 이 기기에만 저장되고 다른 곳으로 보내지 않습니다.</p>
    <div class="tel-nav"><button data-go="wifi">뒤로</button><button class="primary" data-next="connect">다 했어요</button></div>`), after(() => how = 'alpaca');
  if (step === 'sim') { how = 'sim'; return frame(1, '1단계: 연습 모드', `<p>진짜 망원경 대신 이 앱 안의 연습용 가대를 씁니다. 진짜처럼 천천히 돌고, 처음에는 조금 어긋나 있어서 별 맞추기를 해야 정확해집니다.</p>
    <div class="tel-nav"><button data-go="start">뒤로</button><button class="primary" data-next="connect">시작</button></div>`), after(); }
  if (step === 'connect') return frame(2, '2단계: 연결하기', `<p>${how === 'usb' ? '아래 단추를 누르면 브라우저가 포트 목록을 보여 줍니다. 망원경을 골라 연결을 눌러 주세요.' : how === 'alpaca' ? 'PC의 서버에 연결합니다.' : '연습용 가대를 켭니다.'}</p>
    <div class="tel-nav"><button data-go="${how === 'sim' ? 'sim' : how === 'alpaca' ? 'alpaca' : 'usb'}">뒤로</button><button class="primary" id="tel-connect">연결하기</button></div><div id="tel-st" class="small"></div>`), C.$('tel-connect').onclick = connect;
  if (step === 'sun') return frame(2, '시작하기 전에: 태양을 조심하세요', `<div class="tel-warn"><b>망원경으로 태양을 보면 한순간에 눈을 잃을 수 있습니다.</b>
    <p>망원경 앞쪽에 전용 태양 필터를 끼우지 않았다면 낮에는 망원경을 쓰지 마세요. 파인더(작은 보조 망원경)도 뚜껑을 닫아 두세요. 이 앱은 태양에서 10° 안쪽으로는 망원경을 보내지 않습니다.</p></div>
    <div class="tel-nav"><button class="primary" data-go="align">알겠습니다</button></div>`);
  if (step === 'align') return renderAlign();
  if (step === 'ready') return renderReady();
}
function after(fn) { fn?.(); const n = ui().querySelector('[data-next]'); if (n) n.onclick = () => { if (how === 'alpaca') { const u = C.$('tel-url').value.trim(); try { localStorage.setItem('sc-alpaca', u); } catch {} } go(n.dataset.next); }; }

function advise(shape) {
  const m = maker;
  let rec, next = 'usb';
  if (shape === 'dob' && m !== 'celestron' && m !== 'skywatcher') { rec = '상자 받침 돕소니안은 대부분 모터가 없어 컴퓨터로 움직일 수 없습니다. 손으로 움직이면서 이 앱의 별지도로 위치를 찾으세요. 받침에 버튼 달린 리모컨이 있다면 고투 모델이니 USB 케이블로 연결해 보세요.'; next = 'sim'; }
  else if (m === 'celestron') { kind = 'nexstar'; rec = '셀레스트론 망원경은 NexStar 핸드 컨트롤러를 씁니다. 컨트롤러 아래쪽 단자(새 모델은 미니 USB)를 컴퓨터에 USB 케이블로 이어 연결합니다. 와이파이 모델(SkyPortal)도 USB가 더 쉽습니다.'; }
  else if (m === 'skywatcher') { kind = 'synscan'; rec = '스카이워처 망원경은 SynScan 핸드 컨트롤러를 씁니다. 컨트롤러의 USB 단자(오래된 모델은 직렬-USB 케이블)로 컴퓨터에 이어 연결합니다. 핸드 컨트롤러 없이 와이파이만 있는 모델은 와이파이 안내를 보세요.'; }
  else if (m === 'meade') { kind = 'lx200'; rec = '미드 망원경은 오토스타(Autostar) 리모컨을 쓰고, LX200 명령으로 연결합니다. 리모컨의 직렬 단자에 직렬-USB 케이블을 이어 주세요.'; }
  else { rec = '많은 고투 망원경이 Celestron 또는 Sky-Watcher 방식을 씁니다. 리모컨에 적힌 이름이 NexStar면 Celestron, SynScan이면 Sky-Watcher를 고르세요. 모르겠다면 연습 모드로 먼저 익혀 보세요.'; next = 'sim'; }
  if (shape === 'eq') rec += ' 적도의는 북극성 쪽으로 축을 맞춰야(극축 정렬) 별을 잘 따라갑니다. 처음에는 축을 대략 북쪽으로만 향해도 됩니다.';
  frame(0, '이렇게 연결하세요', `<p>${rec}</p><div class="tel-nav"><button data-go="shape">뒤로</button><button data-go="sim">연습 모드</button>${next === 'usb' ? '<button class="primary" data-go="usb">USB로 연결</button>' : ''}</div>`);
}

async function connect() {
  const st = C.$('tel-st'); st.textContent = '연결하는 중…';
  try {
    if (how === 'usb') { if (!navigator.serial) throw Object.assign(new Error(''), { code: 'no-serial' }); const port = await navigator.serial.requestPort(); mount = await openSerialMount(port, kind); }
    else if (how === 'alpaca') { const u = (localStorage.getItem('sc-alpaca') || '').trim();
      if (/192\.168\.4\.1\b|:11880\b/.test(u)) throw Object.assign(new Error(''), { code: 'synscan-wifi' });
      if (!/^https?:\/\//.test(u)) throw Object.assign(new Error('주소는 http:// 로 시작해야 합니다'), { code: 'addr' });
      if (location.protocol === 'https:' && u.startsWith('http:') && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(u)) { try { const m = new Alpaca(u); await m.hello(); mount = m; } catch { throw Object.assign(new Error(''), { code: 'mixed' }); } }
      else { mount = new Alpaca(u); await mount.hello(); } }
    else { const z = C.zenithJ2000(); const s = C.precessToDate(z.ra, z.dec, C.state.time); mount = new SimMount({ ra: s.ra, dec: Math.min(89, s.dec) }); }
  } catch (e) { mount = null; st.textContent = ''; if (e.code === 'synscan-wifi') return go('synscanwifi'); return showErr(e); }
  W.state = 'connected'; startReticle(); C.$('tel-btn').classList.add('on');
  let seen = false; try { seen = sessionStorage.getItem('sc-sun-ok') === '1'; } catch {}
  try { sessionStorage.setItem('sc-sun-ok', '1'); } catch {}
  go(seen ? 'align' : 'sun');
}

function pickStar(skip = 0) {
  const t = C.state.time, sun = C.sunRaDec(), moon = C.moonRaDec();
  const c = STARS.map(([ko, en, ra, dec]) => { const aa = C.azAlt(ra, dec, t); return { ko, en, ra, dec, ...aa, score: -Math.abs(aa.alt - 45) - (sep({ ra, dec }, moon) < 20 ? 40 : 0) }; })
    .filter(s => s.alt > 15 && s.alt < 80 && sep(s, sun) > 30).sort((a, b) => b.score - a.score);
  return c.length ? c[skip % c.length] : null;
}
function padHtml() { return `<div class="tel-pad"><span></span><button data-mv="1,1">위</button><span></span><button data-mv="0,-1">왼쪽</button><select id="tel-rate" title="움직이는 빠르기">${[2, 4, 6, 8].map(r => `<option value="${r}"${r === 4 ? ' selected' : ''}>빠르기 ${r}</option>`).join('')}</select><button data-mv="0,1">오른쪽</button><span></span><button data-mv="1,-1">아래</button><span></span></div>`; }
function bindPad() {
  for (const b of ui().querySelectorAll('[data-mv]')) { const [ax, dir] = b.dataset.mv.split(',').map(Number);
    const startMv = (e) => { e.preventDefault(); mount?.move(ax, dir, +C.$('tel-rate').value).catch(showErr); }, stopMv = () => mount?.move(ax, dir, 0).catch(() => {});
    b.onpointerdown = startMv; b.onpointerup = b.onpointerleave = stopMv; }
}
function renderAlign() {
  align = align || { skip: 0 }; const s = pickStar(align.skip); align.star = s;
  if (!s) return frame(3, '3단계: 별 맞추기', `<p>지금 하늘 높이 뜬 밝은 별이 없습니다 (낮이거나 별이 지평선 근처). 밤에 다시 해 주세요. 맞추지 않아도 돌리기는 되지만 조금 어긋날 수 있습니다.</p><div class="tel-nav"><button data-go="ready">건너뛰기</button></div>`);
  frame(3, '3단계: 별 하나로 맞추기', `<p>${term('정렬', '망원경에게 지금 하늘의 어디를 보고 있는지 알려 주는 일')}을 합니다. 밝은 별 하나만 있으면 됩니다.</p>
    <p class="tel-star"><b>${s.ko}</b> · ${DIR8[Math.round(s.az / 45) % 8]}쪽, 높이 ${Math.round(s.alt)}° (주먹을 쥐고 팔을 뻗으면 주먹 하나가 약 10°)</p>
    <ol class="tel-list"><li>"그 별로 돌리기"를 누르면 망원경이 별 근처로 갑니다.</li><li>접안렌즈(눈 대는 곳)를 보면서 아래 화살표로 별을 시야 한가운데로 옮깁니다.</li><li>한가운데 오면 "맞췄어요"를 누릅니다.</li></ol>
    ${how === 'sim' ? '<div class="tel-eyepiece" title="연습용 접안렌즈 시야 (지름 2°)"><i id="tel-ep-star"></i><b></b></div>' : ''}
    <div class="tel-nav"><button id="tel-astar">그 별로 돌리기</button><button data-skip>다른 별</button></div>${padHtml()}
    <div class="tel-nav"><button data-go="ready">건너뛰기</button><button class="primary" id="tel-aligned">맞췄어요</button></div><div id="tel-st" class="small"></div>`);
  ui().querySelector('[data-skip]').onclick = () => { align.skip++; renderAlign(); };
  C.$('tel-astar').onclick = () => slewTo({ ra: s.ra, dec: s.dec }, s.ko, true);
  C.$('tel-aligned').onclick = async () => { try { const d = C.precessToDate(s.ra, s.dec, C.state.time); await mount.sync(d.ra, d.dec); C.$('tel-st').textContent = `${s.ko}에 맞췄습니다.`; go('ready'); } catch (e) { showErr(e); } };
  bindPad();
}
function renderReady() {
  const o = C.selected(); W.target = o ? C.label(o) : null;
  frame(4, '4단계: 보고 싶은 천체로 돌리기', `<p>하늘에서 천체를 누른 다음 "이쪽으로 돌리기"를 누르세요. 하늘 위의 파란 십자(조준점)가 망원경이 보는 곳입니다.</p>
    <p class="tel-star" id="tel-target">${o ? '고른 천체: <b></b>' : '아직 고른 천체가 없습니다'}</p>
    <div class="tel-nav"><button class="primary" id="tel-goto">이쪽으로 돌리기</button><button id="tel-stop">멈추기</button></div>
    <div id="tel-sunq"></div>${padHtml()}<div id="tel-pos" class="small"></div><div id="tel-st" class="small"></div>
    <div class="tel-nav"><button data-go="align">다시 맞추기</button><button id="tel-off">연결 끊기</button></div>`);
  if (o) C.$('tel-target').querySelector('b').textContent = C.label(o);
  C.$('tel-goto').onclick = () => { const o2 = C.selected(); if (!o2) { C.$('tel-st').textContent = '하늘에서 천체를 먼저 눌러 고르세요.'; return; } const j = C.selRaDec(o2); if (!j) { C.$('tel-st').textContent = '이 천체는 위치를 망원경으로 보낼 수 없습니다.'; return; } slewTo(j, C.label(o2)); };
  C.$('tel-stop').onclick = () => mount?.stop().then(() => C.$('tel-st').textContent = '멈췄습니다.').catch(showErr);
  C.$('tel-off').onclick = disconnect; bindPad();
}

// the Sun guard: within 10 degrees needs two separate confirmations that a solar filter is fitted
async function slewTo(j, name, isAlign = false) {
  const st = C.$('tel-st'), sun = C.sunRaDec(), d = sep(j, sun), alt = C.azAlt(j.ra, j.dec, C.state.time).alt;
  if (d < 10 && !sunOK) { const q = C.$('tel-sunq') || st;
    q.innerHTML = `<div class="tel-warn"><b>${esc(name)}은(는) 태양에서 ${d.toFixed(1)}°밖에 떨어져 있지 않습니다.</b><p>태양 필터 없이 보내면 눈과 망원경이 상합니다. 망원경 앞쪽 전체를 덮는 전용 태양 필터를 끼웠을 때만 계속하세요.</p><button id="tel-f1">태양 필터를 끼웠습니다</button></div>`;
    C.$('tel-f1').onclick = () => { q.querySelector('.tel-warn').innerHTML = '<b>한 번 더 확인합니다.</b><p>필터가 망원경 앞쪽을 빈틈없이 덮고 있고, 파인더(작은 보조 망원경)는 뚜껑을 닫았나요?</p><button id="tel-f2">네, 둘 다 확인했습니다</button> <button id="tel-fno">취소</button>';
      C.$('tel-fno').onclick = () => q.innerHTML = ''; C.$('tel-f2').onclick = () => { sunOK = true; q.innerHTML = ''; slewTo(j, name, isAlign).finally(() => sunOK = false); }; };
    return; }
  if (alt < 0) { st.textContent = `${name}은(는) 지금 지평선 아래에 있어 보낼 수 없습니다.`; return; }
  if (!mount) return; const dt = C.precessToDate(j.ra, j.dec, C.state.time);
  try { gotoBusy = true; W.state = 'slewing'; st.textContent = `${name} 쪽으로 도는 중…`; await mount.goto(dt.ra, dt.dec);
    for (let i = 0; i < 600 && await mount.slewing(); i++) await sleep(250);
    st.textContent = isAlign ? `${name} 근처에 왔습니다. 접안렌즈를 보며 별을 한가운데로 옮겨 주세요.` : `${name}에 도착했습니다. 가대가 별을 따라 천천히 움직입니다.`; W.state = 'arrived'; }
  catch (e) { showErr(e); st.textContent = ''; } finally { gotoBusy = false; }
}

async function disconnect() { try { await mount?.close(); } catch {} mount = null; posJ = null; align = null; W.state = 'idle'; C.$('tel-btn').classList.remove('on'); C.$('tel-reticle').hidden = true; go('start'); }

// where the tube points: poll the mount and draw a reticle on the sky (the inverse precession is iterated)
function toJ2000(p, t) { let g = { ...p }; for (let i = 0; i < 3; i++) { const f = C.precessToDate(g.ra, g.dec, t); g = { ra: wrap(g.ra - (((f.ra - p.ra + 540) % 360) - 180)), dec: g.dec - (f.dec - p.dec) }; } return g; }
let polling = false;
function startReticle() {
  if (polling) return; polling = true; let last = 0;
  const loop = async (now) => {
    if (!mount) { polling = false; return; }
    if (now - last > (how === 'sim' ? 100 : 700)) { last = now; try { const p = await mount.getRaDec(); posJ = toJ2000(p, C.state.time); W.pos = posJ;
      const pe = C.$('tel-pos'); if (pe) { const aa = C.azAlt(posJ.ra, posJ.dec, C.state.time); pe.textContent = `망원경 방향: ${DIR8[Math.round(aa.az / 45) % 8]}쪽, 높이 ${Math.round(aa.alt)}°`; }
      if (how === 'sim' && align?.star && C.$('tel-ep-star')) { const tr = toJ2000(mount.trueRaDec(), C.state.time), s = align.star, cd = Math.cos(s.dec * D2R);
        const dx = (((s.ra - tr.ra + 540) % 360) - 180) * cd, dy = s.dec - tr.dec, el = C.$('tel-ep-star'); el.style.display = Math.hypot(dx, dy) < 1 ? '' : 'none';
        el.style.left = `${50 - dx * 50}%`; el.style.top = `${50 - dy * 50}%`; } } catch {} }
    const r = C.$('tel-reticle'), sc = posJ && C.isGround() ? C.raDecToScreen(posJ.ra, posJ.dec) : null;
    r.hidden = !sc; if (sc) r.style.transform = `translate(${sc[0]}px, ${sc[1]}px)`;
    requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}

export function initTelescope(ctx) {
  C = ctx;
  const r = document.createElement('div'); r.id = 'tel-reticle'; r.hidden = true; r.innerHTML = '<i></i><b>망원경</b>'; document.body.append(r);
  C.$('tel-btn').onclick = () => { const p = C.$('tel'); p.hidden = !p.hidden; if (!p.hidden) C.$('obs-score').hidden = true; if (!p.hidden && !mount) go(step === 'ready' || step === 'align' ? 'start' : step); else if (!p.hidden) render(); };
  C.$('tel-close').onclick = () => C.$('tel').hidden = true;
  render();
}
// for tools/qa.py
export const _qa = { W, get mount() { return mount; }, get posJ() { return posJ; }, go };
