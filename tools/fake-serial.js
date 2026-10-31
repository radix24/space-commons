// Fake Web Serial ports for tools/qa.py: they answer like a Celestron NexStar, a Sky-Watcher SynScan or a Meade LX200
// hand controller, so telescope.js can be tested without hardware. Slews finish after a few "is it slewing?" polls.
const hex8 = (d) => (Math.round((((d % 360) + 360) % 360) / 360 * 4294967296) % 4294967296 >>> 0).toString(16).toUpperCase().padStart(8, '0');
const unhex = (h) => parseInt(h, 16) / 4294967296 * 360;
const pad = (n, k) => String(Math.floor(n)).padStart(k, '0');

export class FakePort {
  constructor(kind) { this.kind = kind; this.ra = 10; this.dec = 20; this.target = null; this.polls = 0; this.log = []; this.opened = false; this.pending = {}; }
  async open(opts) { if (opts?.baudRate !== 9600) throw new Error('baud'); this.opened = true; const me = this;
    this.readable = new ReadableStream({ start(c) { me.out = c; } });
    this.writable = new WritableStream({ write(chunk) { me.handle(String.fromCharCode(...chunk)); } }); }
  async close() { this.opened = false; }
  send(s) { this.out.enqueue(Uint8Array.from(s, c => c.charCodeAt(0))); }
  slewDone() { if (this.target && ++this.polls >= 3) { ({ ra: this.ra, dec: this.dec } = this.target); this.target = null; } return !this.target; }
  handle(s) {
    this.log.push(s);
    if (this.kind === 'lx200') return this.lx(s);
    const c = s[0];
    if (c === 'K') return this.send(s[1] + '#');
    if (c === 'V') return this.send(this.kind === 'synscan' ? '040A0F#' : '\x05\x17#');
    if (c === 'e') return this.send(`${hex8(this.ra)},${hex8(this.dec)}#`);
    if (c === 'r' || c === 's') { const [a, b] = s.slice(1).split(','); const p = { ra: unhex(a), dec: unhex(b) > 180 ? unhex(b) - 360 : unhex(b) };
      if (c === 'r') { this.target = p; this.polls = 0; } else { this.ra = p.ra; this.dec = p.dec; } return this.send('#'); }
    if (c === 'L') return this.send(this.slewDone() ? '0#' : '1#');
    if (c === 'M') { this.target = null; return this.send('#'); }
    if (c === 'P' && s.length === 8) return this.send('#');
  }
  lx(s) {
    for (const m of s.match(/:[^#]*#/g) || []) {
      if (m === ':GR#') { const t = Math.round(this.ra / 15 * 3600); this.send(`${pad(t / 3600, 2)}:${pad(t % 3600 / 60, 2)}:${pad(t % 60, 2)}#`); }
      else if (m === ':GD#') { const t = Math.round(Math.abs(this.dec) * 3600); this.send(`${this.dec < 0 ? '-' : '+'}${pad(t / 3600, 2)}*${pad(t % 3600 / 60, 2)}'${pad(t % 60, 2)}#`); }
      else if (m.startsWith(':Sr')) { const [h, mi, se] = m.slice(3, -1).split(':').map(Number); this.pending.ra = (h + mi / 60 + se / 3600) * 15; this.send('1'); }
      else if (m.startsWith(':Sd')) { const q = m.slice(3, -1).match(/([+-])(\d+)\*(\d+):(\d+)/); const v = +q[2] + +q[3] / 60 + +q[4] / 3600; this.pending.dec = q[1] === '-' ? -v : v; this.send('1'); }
      else if (m === ':MS#') { this.target = { ...this.pending }; this.polls = 0; this.send('0'); }
      else if (m === ':CM#') { this.ra = this.pending.ra; this.dec = this.pending.dec; this.send('Coordinates matched#'); }
      else if (m === ':D#') this.send(this.slewDone() ? '#' : '\x7f#');
    }
  }
}
