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
# name: (path, check run after load, expected to be truthy)
SCENARIOS = {
    'intro':   ('index.html', "document.title.length > 0"),
    'ground':  ('app.html', READY + " && !!document.querySelector('canvas')"),
    'space':   ('app.html#m=s', READY + " && document.body.classList.contains('space')"),
    'sandbox': ('app.html', "(async () => { document.querySelector('[data-mode=sandbox]').click(); for (let i = 0; i < 40 && !document.querySelector('.sb-dock'); i++) await new Promise(r => setTimeout(r, 250)); return !!document.querySelector('.sb-dock'); })()"),
    'kr':      ('app.html#o=' + '%EC%B2%9C%EB%A6%AC%EC%95%88%202A%ED%98%B8', "(async () => { for (let i = 0; i < 60 && !document.querySelector('.krcard'); i++) await new Promise(r => setTimeout(r, 250)); return !!document.querySelector('.krcard b'); })()"),
    'venus':   ('app.html', "(async () => { const w = (ms) => new Promise(r => setTimeout(r, ms)); document.querySelector('[data-mode=sandbox]').click(); for (let i = 0; i < 40 && !document.querySelector('.sb-dock'); i++) await w(250); [...document.querySelectorAll('button')].find(b => /금성 테라포밍/.test(b.textContent)).click(); await w(800); for (let k = 0; k < 5; k++) { document.querySelector('.sb-terra .sb-tgo')?.click(); await w(500); } const sea = document.querySelector('.sb-seam')?.value; document.querySelector('.sb-terra .sb-tx').click(); await w(3000); return sea === '400'; })()"),
    'sblib':   ('app.html', "(async () => { const w = (ms) => new Promise(r => setTimeout(r, ms)); document.querySelector('[data-mode=sandbox]').click(); for (let i = 0; i < 40 && !document.querySelector('.sb-dock'); i++) await w(250); document.querySelector('.sb-tabs [data-tab=make]').click(); const f = document.querySelector('.sb-find'); f.value = '궤도'; f.dispatchEvent(new Event('input')); await w(600); return !document.querySelector('.sb-drawer').hidden && document.querySelectorAll('.sb-miss').length > 0; })()"),
    'sbphone': ('app.html', "(async () => { const w = (ms) => new Promise(r => setTimeout(r, ms)); document.querySelector('[data-mode=sandbox]').click(); for (let i = 0; i < 40 && !document.querySelector('.sb-dock'); i++) await w(250); [...document.querySelectorAll('button')].find(b => /화성 테라포밍/.test(b.textContent)).click(); await w(800); document.querySelector('.sb-terra .sb-tgo')?.click(); await w(1500); return !document.querySelector('.sb-terra').hidden && document.documentElement.scrollWidth <= innerWidth; })()"),
    'sbsys':   ('app.html', "(async () => { const w = (ms) => new Promise(r => setTimeout(r, ms)); document.querySelector('[data-mode=sandbox]').click(); for (let i = 0; i < 40 && !document.querySelector('.sb-dock'); i++) await w(250); await w(800); const c = document.querySelector('.sb-root canvas'); for (let k = 0; k < 14; k++) { c.dispatchEvent(new WheelEvent('wheel', { deltaY: 300, clientX: 640, clientY: 430, bubbles: true, cancelable: true })); await w(60); } await w(1500); return [...document.querySelectorAll('.sb-label')].filter(l => /해왕성|Neptune/.test(l.textContent) && l.style.display !== 'none').length > 0; })()"),
    'models':  ('tools/model-sheet.html?only=kr', "(() => { const bad = window.__report.filter(r => r.issues.length); for (const r of bad) console.error('model ' + r.name + ': ' + r.issues.join(', ')); return !bad.length; })()"),
    'nuri':    ('tools/model-sheet.html?only=Nuri', "(async () => { for (let i = 0; i < 80 && !window.__report; i++) await new Promise(r => setTimeout(r, 250)); return window.__report.every(r => !r.issues.length); })()"),
    'nurireplay': ('app.html#o=' + '%EC%B2%9C%EB%A6%AC%EC%95%88%202A%ED%98%B8', "(async () => { const w = (ms) => new Promise(r => setTimeout(r, ms)); for (let i = 0; i < 60 && !document.querySelector('.kracts'); i++) await w(250); [...document.querySelectorAll('.kracts button')].find(b => /누리호/.test(b.textContent)).click(); await w(12000); return /누리호/.test(document.getElementById('status').textContent); })()"),
    'daymoon': ('app.html#m=g&t=2026-10-31T00:30&lat=37.57&lon=126.98&az=280.3&alt=31&fov=4&o=Moon', READY),
    'nuribase': ('tools/model-sheet.html?only=Nuri&focus=-3,6', "(async () => { for (let i = 0; i < 80 && !window.__report; i++) await new Promise(r => setTimeout(r, 250)); return window.__report.every(r => !r.issues.length); })()"),
    'nurimid': ('tools/model-sheet.html?only=Nuri&focus=8,24', "(async () => { for (let i = 0; i < 80 && !window.__report; i++) await new Promise(r => setTimeout(r, 250)); return window.__report.every(r => !r.issues.length); })()"),
    'english': ('app.html?lang=en', READY),
    'embed':   ('app.html?embed=1', READY + " && document.body.classList.contains('embed')"),
    'phone':   ('app.html', READY + " && document.documentElement.scrollWidth <= innerWidth"),
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
            phone = name in ('phone', 'sbphone')
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
                    if not any(s in txt for s in IGNORE): problems.append('console.error: ' + txt[:200])
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
