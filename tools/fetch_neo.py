"""Near-Earth asteroid close approaches (NASA CNEOS) with geocentric JPL tracks around each approach.

data/neo.json: approaches within 0.05 AU from 2025 to 2035 for objects larger than ~100 m (H < 22),
               plus Apophis 2029. Each has a geocentric ICRF track (10^6 km) for +-2 days at 30-minute steps.
The CNEOS and Horizons APIs do not allow browser requests (no CORS), so this runs here.
Run: python tools/fetch_neo.py
"""
import json, pathlib, time, urllib.parse, urllib.request
from datetime import datetime, timedelta

OUT = pathlib.Path(__file__).resolve().parent.parent / 'data' / 'neo.json'
get = lambda u: urllib.request.urlopen(u, timeout=180).read().decode()
cad = json.loads(get('https://ssd-api.jpl.nasa.gov/cad.api?' + urllib.parse.urlencode(
    {'dist-max': '0.05', 'date-min': '2025-01-01', 'date-max': '2035-12-31', 'h-max': '22', 'sort': 'dist', 'fullname': 'true', 'diameter': 'true'})))
F = cad['fields']; rows = [dict(zip(F, r)) for r in cad['data']][:40]
out = []
for r in rows:
    t = datetime.strptime(r['cd'], '%Y-%b-%d %H:%M')
    q = dict(format='text', COMMAND=(f"'{r['des']};'" if r['des'].isdigit() else f"'DES={r['des']};'"), EPHEM_TYPE='VECTORS', CENTER="'500@399'", REF_PLANE='FRAME',
             START_TIME=f"'{(t - timedelta(days=2)):%Y-%m-%d %H:%M}'", STOP_TIME=f"'{(t + timedelta(days=2)):%Y-%m-%d %H:%M}'",
             STEP_SIZE="'30m'", VEC_TABLE='1', CSV_FORMAT='YES', OUT_UNITS='KM-S', OBJ_DATA='NO')
    txt = get('https://ssd.jpl.nasa.gov/api/horizons.api?' + urllib.parse.urlencode(q))
    if '$$SOE' not in txt: print('skip', r['des']); continue
    rs = [x.split(',') for x in txt.split('$$SOE')[1].split('$$EOE')[0].strip().splitlines()]
    xyz = []
    for x in rs: xyz += [round(float(x[2]) / 1e6, 6), round(float(x[3]) / 1e6, 6), round(float(x[4]) / 1e6, 6)]
    H = float(r['h']); diam = float(r['diameter']) if r.get('diameter') else round(1329 / (0.14 ** 0.5) * 10 ** (-H / 5) * 1000)  # metres
    out.append({'name': r['fullname'].strip(), 'des': r['des'], 'cd': r['cd'], 'dist_km': round(float(r['dist']) * 149597870.7), 'v_kms': round(float(r['v_rel']), 2),
                'H': H, 'diam_m': diam if r.get('diameter') is None else round(float(r['diameter']) * 1000), 'jd0': float(rs[0][0]), 'step': round(float(rs[1][0]) - float(rs[0][0]), 8), 'xyz': xyz})
    print(r['cd'], r['fullname'].strip(), round(float(r['dist']) * 149597870.7), 'km'); time.sleep(0.4)
OUT.write_text(json.dumps(out, separators=(',', ':'), ensure_ascii=False))
print(len(out), 'approaches ->', OUT.stat().st_size // 1024, 'KB')
