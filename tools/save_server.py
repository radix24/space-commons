"""Tiny local receiver for tools/convert-models.html: POST /save?name=x.glb writes the body to .cache/converted/x.glb.
Run: python tools/save_server.py   (listens on 127.0.0.1:8766 only)
"""
import http.server, pathlib, urllib.parse

OUT = pathlib.Path(__file__).resolve().parent.parent / '.cache' / 'converted'
OUT.mkdir(parents=True, exist_ok=True)

class H(http.server.BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', 'http://localhost:8765')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()
    def do_POST(self):
        name = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get('name', ['out.glb'])[0]
        name = pathlib.Path(name).name  # no directories
        data = self.rfile.read(int(self.headers['Content-Length']))
        (OUT / name).write_bytes(data)
        self.send_response(200); self._cors(); self.end_headers(); self.wfile.write(f'{name} {len(data)}'.encode())

http.server.HTTPServer(('127.0.0.1', 8766), H).serve_forever()
