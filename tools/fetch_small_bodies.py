"""Named bright asteroids and currently active comets for the sky (JPL SBDB Query API, public domain).

data/smallbodies.json
  ast: [name, H, G, a, e, i, om, w, ma, epoch]        asteroids with H < 9 (bright enough for binoculars at opposition)
  com: [name, M1, K1, q, e, i, om, w, tp]             comets with perihelion within ~14 months of the run date and q < 4 AU
Angles in degrees (J2000 ecliptic), epoch and tp as Julian dates.   Run: python tools/fetch_small_bodies.py
"""
import json, math, pathlib, time, urllib.parse, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
UA = {'User-Agent': 'SpaceCommons-tools/1.0 (https://github.com/radix24/space-commons)'}

def query(fields, kind, cond, extra=None):
    q = {'fields': ','.join(fields), 'sb-kind': kind, 'sb-cdata': json.dumps({'AND': cond})}
    q.update(extra or {})
    js = json.loads(urllib.request.urlopen(urllib.request.Request('https://ssd-api.jpl.nasa.gov/sbdb_query.api?' + urllib.parse.urlencode(q), headers=UA), timeout=120).read())
    return js.get('data') or []

def num(x, d=None):
    try: return float(x)
    except (TypeError, ValueError): return d

jd_now = time.time() / 86400 + 2440587.5
ast = []
for r in query(['full_name', 'H', 'G', 'a', 'e', 'i', 'om', 'w', 'ma', 'epoch'], 'a', ['H|LT|9'], {'sb-ns': 'n'}):
    name = r[0].strip(); name = name.split('(')[0].strip()             # "4 Vesta (A807 FA)" -> "4 Vesta"
    ast.append([name, num(r[1]), num(r[2], 0.15)] + [round(num(v), 6) for v in r[3:]])
com = []
for r in query(['full_name', 'M1', 'K1', 'q', 'e', 'i', 'om', 'w', 'tp'], 'c', ['q|LT|4', f'tp|RG|{jd_now - 420:.1f}|{jd_now + 420:.1f}']):
    M1, K1 = num(r[1]), num(r[2])
    if M1 is None: continue
    q = num(r[3])
    if M1 + (K1 or 10) * math.log10(max(q, 0.05)) > 15: continue   # never brighter than ~15 mag even at perihelion (taking delta = 1 AU)
    com.append([r[0].strip(), M1, K1 or 10.0] + [round(num(v), 6) for v in r[3:]])
out = {'made': time.strftime('%Y-%m-%d'), 'ast': ast, 'com': com}
(ROOT / 'data' / 'smallbodies.json').write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf8')
print(len(ast), 'asteroids,', len(com), 'comets ->', (ROOT / 'data' / 'smallbodies.json').stat().st_size // 1024, 'KB')
