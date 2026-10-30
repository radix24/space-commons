"""Korean satellites (CelesTrak TLE) and planetary orbiters (JPL Horizons state vectors).

data/korea.tle      : current TLEs for every Korean payload still in Earth orbit (owner SKOR in the CelesTrak SATCAT).
data/orbiters.json  : one body-centred ICRF state vector per orbiter (km, km/s) near today; the app propagates it
                      as a two-body Kepler orbit, which is good for hours to days.
Run: python tools/fetch_korea_orbiters.py
"""
import csv, io, json, pathlib, time, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone

OUT = pathlib.Path(__file__).resolve().parent.parent / 'data'
get = lambda url: urllib.request.urlopen(url, timeout=120).read().decode()

# ---- Korean satellites ----
cat = list(csv.DictReader(io.StringIO(get('https://celestrak.org/pub/satcat.csv'))))
ids = [r['NORAD_CAT_ID'] for r in cat if r['OWNER'] == 'SKOR' and r['OBJECT_TYPE'] == 'PAY' and not r['DECAY_DATE'] and r['ORBIT_CENTER'] == 'EA']
tle = []
for i in ids:
    try: t = get(f'https://celestrak.org/NORAD/elements/gp.php?CATNR={i}&FORMAT=tle').strip()
    except Exception: t = ''  # no published orbit yet (just launched, or not released)
    if t.count('\n') >= 2: tle.append(t)
    else: print('no TLE for', i)
    time.sleep(0.3)
(OUT / 'korea.tle').write_text('\n'.join(tle) + '\n')
print(len(tle), 'Korean TLEs of', len(ids))

# ---- orbiters: name, Horizons id, centre body name, centre id ----
ORB = [('LRO', -85, 'Moon', 301), ('Danuri', -155, 'Moon', 301), ('Chandrayaan-2', -152, 'Moon', 301), ('CAPSTONE', -1176, 'Moon', 301),
       ('MRO', -74, 'Mars', 499), ('MAVEN', -202, 'Mars', 499), ('Mars Odyssey', -53, 'Mars', 499), ('Mars Express', -41, 'Mars', 499),
       ('TGO', -143, 'Mars', 499), ('Hope', -62, 'Mars', 499)]
MON = {m: i for i, m in enumerate(['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'], 1)}
import re
def state(cid, center, t):
    q = dict(format='text', COMMAND=f"'{cid}'", EPHEM_TYPE='VECTORS', CENTER=f"'500@{center}'", REF_PLANE='FRAME', START_TIME=f"'{t}'",
             STOP_TIME=f"'{t[:10]} 23:59'", STEP_SIZE="'1d'", VEC_TABLE='2', CSV_FORMAT='YES', OUT_UNITS='KM-S', OBJ_DATA='NO')
    return get('https://ssd.jpl.nasa.gov/api/horizons.api?' + urllib.parse.urlencode(q))
orb = {}
now = datetime.now(timezone.utc).strftime('%Y-%m-%d 00:00')
for name, cid, cname, center in ORB:
    t = now
    for _ in range(14):
        txt = state(cid, center, t)
        if '$$SOE' in txt: break
        m = re.search(r'after A\.D\. (\d{4})-([A-Z]{3})-(\d{2}) (\d{2}:\d{2})', txt)  # prediction ends earlier: use its last state
        if not m and 'span' in txt:  # data stops before today: step back a month at a time to the last known orbit
            t = (datetime.strptime(t[:10], '%Y-%m-%d') - timedelta(days=30)).strftime('%Y-%m-%d 00:00'); continue
        if not m: break
        t = (datetime(int(m.group(1)), MON[m.group(2)], int(m.group(3))) - timedelta(hours=1)).strftime('%Y-%m-%d %H:%M')
    if '$$SOE' not in txt: print('skip', name, txt[:200].replace('\n', ' ')); continue
    r = txt.split('$$SOE')[1].split('$$EOE')[0].strip().splitlines()[0].split(',')
    orb[name] = {'center': cname, 'jd': float(r[0]), 'r': [float(x) for x in r[2:5]], 'v': [float(x) for x in r[5:8]]}
    print('orbiter', name, r[1].strip()); time.sleep(0.5)
(OUT / 'orbiters.json').write_text(json.dumps(orb, separators=(',', ':')))
print('done')
