// Classroom sync (수업 동기화): a teacher opens a room and students' devices follow the teacher's view.
// Transport: WebRTC data channels through PeerJS (the public PeerJS server only does signalling), or, for
// tests, a BroadcastChannel between tabs of one browser (?sync=local). Both expose the same small interface.
// Only view state travels: mode, time, place, view, selection and caption, plus a nickname if a student types one.

const PEERJS = 'https://cdnjs.cloudflare.com/ajax/libs/peerjs/1.5.4/peerjs.min.js';
const PREFIX = 'spacecommons-class-';
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I: easy to read off a projector
const MSG = {
  closed: '선생님이 수업을 닫았습니다',
  blocked: '연결할 수 없습니다. 학교 네트워크가 막고 있을 수 있습니다',
  notfound: '이 코드의 수업을 찾을 수 없습니다. 코드를 다시 확인해 주세요',
  taken: '이 코드는 이미 쓰이고 있습니다. 다시 열어 주세요',
  lib: '연결 도구를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요',
};
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
export const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => ALPHA[b % ALPHA.length]).join('');

// ---------- transports: create(role, code, handlers) -> { send(msg, to?), close() } ----------
// handlers: open(), peer(id, hello), leave(id), data(msg, from), status(text|''), fail(kind)
let peerLib = null;
function loadPeer() {
  if (window.Peer) return Promise.resolve(window.Peer);
  return peerLib ||= new Promise((res, rej) => { const s = document.createElement('script'); s.src = PEERJS; s.crossOrigin = 'anonymous';
    s.onload = () => res(window.Peer); s.onerror = () => { peerLib = null; rej(new Error('lib')); }; document.head.append(s); });
}

function localTransport(role, code, h) { // same-browser tabs: for tests without the internet
  const ch = new BroadcastChannel('sc-sync-' + code), me = role + '-' + Math.random().toString(36).slice(2, 8);
  let alive = true, seen = 0, timer = 0;
  const post = (m) => alive && ch.postMessage({ ...m, from: me });
  ch.onmessage = ({ data: m }) => {
    if (!alive || (m.to && m.to !== me)) return;
    if (role === 'teacher') {
      if (m.k === 'hello') { post({ k: 'welcome', to: m.from }); h.peer(m.from, m.d || {}); }
      else if (m.k === 'leave') h.leave(m.from); else if (m.k === 'msg') h.data(m.d, m.from);
    } else if (m.from.startsWith('teacher')) {
      if (m.k === 'welcome') { clearInterval(timer); seen = 1; h.status(''); h.open(); }
      else if (m.k === 'msg') h.data(m.d, m.from);
    }
  };
  if (role === 'teacher') setTimeout(() => h.open(), 0);
  else { let n = 0; const hi = () => { post({ k: 'hello', d: h.hello }); if (++n > 20 && !seen) { clearInterval(timer); h.fail('notfound'); } }; hi(); timer = setInterval(hi, 500); }
  return { send: (d, to) => post({ k: 'msg', d, ...(to ? { to } : {}) }), close() { post({ k: 'leave' }); alive = false; clearInterval(timer); ch.close(); } };
}

async function peerTransport(role, code, h) {
  let Peer; try { Peer = await loadPeer(); } catch { h.fail('lib'); return { send() {}, close() {} }; }
  const conns = new Map(); let peer, conn = null, closed = false, tries = 0, opened = false, retry = 0;
  const watchdog = setTimeout(() => { if (!opened && !closed) h.fail('blocked'); }, 20000);
  const make = () => {
    peer = role === 'teacher' ? new Peer(PREFIX + code, { debug: 0 }) : new Peer({ debug: 0 });
    peer.on('open', () => { tries = 0; if (role === 'teacher') { opened = true; clearTimeout(watchdog); h.status(''); h.open(); } else dial(); });
    peer.on('disconnected', () => { if (closed) return; h.status('연결이 잠시 끊겼습니다. 다시 잇는 중...'); setTimeout(() => !closed && peer && !peer.destroyed && peer.reconnect(), 1500); });
    peer.on('error', (e) => { if (closed) return; const t = e.type || '';
      if (t === 'unavailable-id') return h.fail('taken');
      if (t === 'peer-unavailable') { if (++tries > (opened ? 30 : 4)) return h.fail(opened ? 'closed' : 'notfound'); clearTimeout(retry); retry = setTimeout(dial, 2000); return; }
      if (t === 'browser-incompatible' || t === 'ssl-unavailable') return h.fail('blocked');
      if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(t)) { h.status('연결이 잠시 끊겼습니다. 다시 잇는 중...'); if (++tries > 10) return h.fail('blocked'); setTimeout(() => !closed && peer.disconnected && !peer.destroyed && peer.reconnect(), 2000); } });
    if (role === 'teacher') peer.on('connection', (c) => {
      c.on('open', () => { conns.set(c.peer, c); h.peer(c.peer, c.metadata || {}); });
      c.on('data', (d) => h.data(d, c.peer)); const gone = () => { if (conns.delete(c.peer)) h.leave(c.peer); }; c.on('close', gone); c.on('error', gone);
      c.peerConnection && c.peerConnection.addEventListener('iceconnectionstatechange', () => { if (c.peerConnection.iceConnectionState === 'failed') gone(); });
    });
  };
  const dial = () => { if (closed) return; if (conn) try { conn.close(); } catch {}
    conn = peer.connect(PREFIX + code, { reliable: true, metadata: h.hello });
    const iceFail = setTimeout(() => { if (!conn.open && !closed && !opened) h.fail('blocked'); }, 15000);
    conn.on('open', () => { clearTimeout(iceFail); clearTimeout(watchdog); opened = true; tries = 0; h.status(''); h.open(); });
    conn.on('data', (d) => h.data(d));
    conn.on('close', () => { if (closed) return; h.status('연결이 잠시 끊겼습니다. 다시 잇는 중...'); clearTimeout(retry); retry = setTimeout(dial, 1500); }); };
  make();
  return {
    send(d, to) { if (role === 'teacher') { for (const [id, c] of conns) if ((!to || id === to) && c.open) c.send(d); } else if (conn?.open) conn.send(d); },
    close() { closed = true; clearTimeout(watchdog); clearTimeout(retry); try { peer?.destroy(); } catch {} },
  };
}

export const createTransport = (role, code, h) => new URLSearchParams(location.search).get('sync') === 'local'
  ? Promise.resolve(localTransport(role, code, h)) : peerTransport(role, code, h);

// ---------- QR code (byte mode, error level L, versions 1-9, mask 0): enough for a join link ----------
export function qrMatrix(text) {
  const data = [...new TextEncoder().encode(text)], ECC = [7, 10, 15, 20, 26, 18, 20, 24, 30], BLK = [1, 1, 1, 1, 1, 2, 2, 2, 2];
  const raw = (v) => { let r = (16 * v + 128) * v + 64; if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; } return r; };
  let ver = 1; while (ver <= 9 && Math.floor(raw(ver) / 8) - ECC[ver - 1] * BLK[ver - 1] < data.length + 2) ver++;
  if (ver > 9) throw new Error('QR text too long');
  const size = ver * 4 + 17, cap = Math.floor(raw(ver) / 8) - ECC[ver - 1] * BLK[ver - 1];
  const bits = []; const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  put(4, 4); put(data.length, 8); for (const b of data) put(b, 8); put(0, Math.min(4, cap * 8 - bits.length)); while (bits.length % 8) bits.push(0);
  const words = []; for (let i = 0; i < bits.length; i += 8) words.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let p = 0xEC; words.length < cap; p ^= 0xEC ^ 0x11) words.push(p);
  const mul = (x, y) => { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z & 255; };
  const n = ECC[ver - 1], div = Array(n).fill(0); div[n - 1] = 1; let root = 1;
  for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) { div[j] = mul(div[j], root); if (j + 1 < n) div[j] ^= div[j + 1]; } root = mul(root, 2); }
  const rs = (d) => { const r = Array(n).fill(0); for (const b of d) { const f = b ^ r.shift(); r.push(0); for (let i = 0; i < n; i++) r[i] ^= mul(div[i], f); } return r; };
  const nb = BLK[ver - 1], total = Math.floor(raw(ver) / 8), short = nb - total % nb, sl = Math.floor(total / nb), blocks = [];
  for (let i = 0, k = 0; i < nb; i++) { const d = words.slice(k, k += sl - n + (i < short ? 0 : 1)), e = rs(d); if (i < short) d.push(0); blocks.push(d.concat(e)); }
  const out = []; for (let i = 0; i < blocks[0].length; i++) for (let j = 0; j < nb; j++) if (i !== sl - n || j >= short) out.push(blocks[j][i]);
  const M = Array.from({ length: size }, () => Array(size).fill(false)), F = Array.from({ length: size }, () => Array(size).fill(false));
  const set = (x, y, v) => { M[y][x] = v; F[y][x] = true; };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
    const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy)); if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4); }
  if (ver > 1) { const na = Math.floor(ver / 7) + 2, step = Math.ceil((ver * 4 + 4) / (na * 2 - 2)) * 2, pos = [6]; for (let p = size - 7; pos.length < na; p -= step) pos.splice(1, 0, p);
    for (let i = 0; i < na; i++) for (let j = 0; j < na; j++) { if ((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1); } }
  { const d = (1 << 3) | 0; let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537); const b = ((d << 10) | r) ^ 0x5412, g = (i) => ((b >>> i) & 1) === 1; // level L, mask 0
    for (let i = 0; i <= 5; i++) set(8, i, g(i)); set(8, 7, g(6)); set(8, 8, g(7)); set(7, 8, g(8)); for (let i = 9; i < 15; i++) set(14 - i, 8, g(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, g(i)); for (let i = 8; i < 15; i++) set(8, size - 15 + i, g(i)); set(8, size - 8, true); }
  if (ver >= 7) { let r = ver; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1F25); const b = (ver << 12) | r;
    for (let i = 0; i < 18; i++) { const v = ((b >>> i) & 1) === 1, a = size - 11 + i % 3, c = Math.floor(i / 3); set(a, c, v); set(c, a, v); } }
  let i = 0; for (let right = size - 1; right >= 1; right -= 2) { if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) { const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
      if (!F[y][x] && i < out.length * 8) { M[y][x] = ((out[i >>> 3] >>> (7 - (i & 7))) & 1) === 1; i++; }
      if (!F[y][x] && (x + y) % 2 === 0) M[y][x] = !M[y][x]; } }
  return M;
}
export function qrSvg(text, px = 4) {
  const M = qrMatrix(text), n = M.length, q = 4; let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (M[y][x]) d += `M${x + q} ${y + q}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + 2 * q} ${n + 2 * q}" width="${(n + 2 * q) * px}" height="${(n + 2 * q) * px}" shape-rendering="crispEdges" role="img" aria-label="수업 참여 QR 코드"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#070A16"/></svg>`;
}

// ---------- session logic ----------
// app: { snapshot() -> state object, apply(state, prev), status(text) }
export function initClassSync(app) {
  const S = { role: null, code: '', tx: null, students: new Map(), paused: false, away: false, last: null, lastJson: '', lastSent: 0, timer: 0, applied: null };
  const say = (t) => app.status?.(t);
  const banner = () => {
    let b = $('sync-banner'); if (!b) { b = el('div', 'sync-banner'); b.id = 'sync-banner'; b.hidden = true; document.body.append(b); }
    return b; };
  const showBanner = () => { const b = banner(); b.replaceChildren(); if (S.role !== 'student') { b.hidden = true; return; } b.hidden = false;
    if (S.paused) { b.append(el('span', '', '선생님이 자유롭게 둘러보게 했습니다')); return; }
    if (S.away) { b.append(el('span', '', '내 마음대로 보는 중')); const r = el('button', '', '선생님 화면으로 돌아가기'); r.onclick = () => { S.away = false; if (S.last) app.apply(S.last, null); S.applied = S.last; showBanner(); }; b.append(r); }
    else { b.append(el('span', '', '선생님 화면을 따라가는 중')); const f = el('button', '', '내 마음대로 보기'); f.onclick = () => { S.away = true; showBanner(); }; b.append(f); }
    const x = el('button', 'sync-leave', '나가기'); x.onclick = () => stop(); b.append(x); };

  const panel = () => { let p = $('sync-panel'); if (!p) { p = el('div', 'panel sync-panel'); p.id = 'sync-panel'; document.body.append(p); } return p; };
  const render = () => {
    const p = panel(); p.hidden = false; p.replaceChildren();
    const head = el('header'); head.append(el('b', '', '수업 동기화')); const x = el('button', 'sync-x', '닫기'); x.title = '닫기'; x.onclick = () => { p.hidden = true; }; head.append(x); p.append(head);
    if (S.role === 'teacher') {
      const url = location.origin + location.pathname + '?join=' + S.code + (new URLSearchParams(location.search).get('sync') === 'local' ? '&sync=local' : '');
      p.append(el('p', 'small', '학생들이 QR 코드를 찍거나 수업 코드를 입력하면 이 화면을 따라옵니다.'));
      const code = el('div', 'sync-code', S.code); code.setAttribute('aria-label', '수업 코드'); p.append(code);
      const qr = el('div', 'sync-qr'); try { qr.innerHTML = qrSvg(url, 4); } catch {} p.append(qr);
      const cnt = el('p', 'sync-count'); cnt.append(el('span', '', '연결된 학생'), el('b', '', String(S.students.size))); p.append(cnt);
      const names = [...S.students.values()].map(s => s.nick).filter(Boolean); if (names.length) p.append(el('p', 'small sync-names', names.join(', ')));
      const row = el('div', 'row');
      const pause = el('button', S.paused ? 'on' : '', S.paused ? '따라오기 다시 시작' : '따라오기 잠시 멈춤'); pause.onclick = () => { S.paused = !S.paused; S.tx.send({ k: 'pause', on: S.paused }); if (!S.paused) push(true); render(); };
      const gather = el('button', '', '다시 모으기'); gather.onclick = () => { S.paused = false; S.tx.send({ k: 'gather', s: app.snapshot() }); say('학생들을 지금 화면으로 모았습니다'); render(); };
      const end = el('button', '', '수업 닫기'); end.onclick = () => stop(); row.append(pause, gather, end); p.append(row);
      p.append(el('p', 'small', '보내는 것은 화면 상태(모드, 시각, 장소, 보는 방향, 선택한 천체, 자막)뿐입니다. 연결은 기기끼리 직접 이어집니다.'));
    } else if (S.role === 'student') {
      p.append(el('p', '', '수업에 참여했습니다'), el('div', 'sync-code', S.code));
      const row = el('div', 'row'), leave = el('button', '', '수업에서 나가기'); leave.onclick = () => stop(); row.append(leave); p.append(row);
    } else {
      p.append(el('p', 'small', '선생님 화면을 학생 기기가 실시간으로 따라옵니다. 같은 교실이 아니어도 인터넷만 되면 됩니다.'));
      const open = el('button', 'sync-open', '수업 열기'); open.onclick = () => startTeacher(); p.append(open);
      p.append(el('h4', '', '수업 참여'));
      const f = el('form', 'sync-join'); const code = el('input'); code.placeholder = '수업 코드 6자리'; code.maxLength = 6; code.autocomplete = 'off'; code.setAttribute('aria-label', '수업 코드');
      const nick = el('input'); nick.placeholder = '별명 (적지 않아도 됩니다)'; nick.maxLength = 12; nick.setAttribute('aria-label', '별명');
      const go = el('button', '', '참여'); go.type = 'submit'; f.append(code, nick, go);
      f.onsubmit = (e) => { e.preventDefault(); const c = code.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); if (c.length !== 6) { say('수업 코드는 6자리입니다'); return; } startStudent(c, nick.value.trim()); };
      p.append(f);
    }
    if (S.err) p.append(el('p', 'sync-err', S.err));
  };
  const fail = (kind) => { const t = MSG[kind] || MSG.blocked; stop(true); S.err = t; say(t); render(); };

  function push(force) { // teacher: at most 10 a second, only on change, plus a slow heartbeat so the clock never drifts
    if (S.role !== 'teacher' || S.paused || !S.students.size) return;
    const s = app.snapshot(), { t, ...rest } = s, j = JSON.stringify(rest), now = performance.now();
    if (!force && j === S.lastJson && now - S.lastSent < 2000) return;
    S.lastJson = j; S.lastSent = now; S.tx.send({ k: 'state', s });
  }
  async function startTeacher() {
    stop(true); S.err = ''; S.role = 'teacher'; S.code = newCode(); S.paused = false; render(); say('수업을 여는 중...');
    S.tx = await createTransport('teacher', S.code, {
      open: () => { say('수업을 열었습니다: ' + S.code); render(); },
      peer: (id, hello) => { S.students.set(id, { nick: String(hello.nick || '').slice(0, 12) }); render(); S.tx.send({ k: S.paused ? 'pause' : 'state', on: true, s: app.snapshot() }, id); },
      leave: (id) => { S.students.delete(id); render(); },
      data: () => {}, status: (t) => t && say(t), fail,
    });
    S.timer = setInterval(() => push(false), 100);
    addEventListener('pagehide', bye);
  }
  async function startStudent(code, nick) {
    stop(true); S.err = ''; S.role = 'student'; S.code = code; S.away = false; S.paused = false; S.applied = null; render(); say('수업에 연결하는 중...');
    S.tx = await createTransport('student', code, {
      hello: nick ? { nick: nick.slice(0, 12) } : {},
      open: () => { say('수업에 참여했습니다'); showBanner(); if ($('sync-panel')) $('sync-panel').hidden = true; }, // the banner is enough while following
      peer: () => {}, leave: () => {},
      data: (m) => { if (!m || typeof m !== 'object') return;
        if (m.k === 'bye') return fail('closed');
        if (m.k === 'pause') { S.paused = !!m.on; if (m.s) S.last = m.s; showBanner(); return; }
        if (m.k === 'gather') { S.away = false; S.paused = false; }
        if (m.s && typeof m.s === 'object') { S.last = m.s; if (m.k === 'state') S.paused = false; if (!S.away && !S.paused) { app.apply(m.s, m.k === 'gather' ? null : S.applied); S.applied = m.s; } showBanner(); } },
      status: (t) => say(t || '수업에 다시 연결했습니다'), fail,
    });
  }
  function bye() { if (S.role === 'teacher') try { S.tx?.send({ k: 'bye' }); } catch {} }
  function stop(quiet) {
    bye(); clearInterval(S.timer); removeEventListener('pagehide', bye);
    const tx = S.tx; S.tx = null; if (tx) setTimeout(() => tx.close(), S.role === 'teacher' ? 300 : 0); // let the goodbye leave first
    const was = S.role; S.role = null; S.students.clear(); S.lastJson = ''; showBanner();
    if (!quiet) { say(was === 'teacher' ? '수업을 닫았습니다' : '수업에서 나왔습니다'); S.err = ''; render(); }
  }
  const join = new URLSearchParams(location.search).get('join');
  return {
    open: () => { if ($('sync-panel') && !$('sync-panel').hidden) { $('sync-panel').hidden = true; return; } render(); if (new URLSearchParams(location.search).get('sync') !== 'local') loadPeer().catch(() => {}); },
    joinFromLink: () => { const c = (join || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); if (c.length === 6) startStudent(c, ''); },
    state: S,
  };
}
