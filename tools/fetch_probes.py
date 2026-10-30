"""Fetch heliocentric spacecraft positions from JPL Horizons and write data/probes.json.

Whole journeys: from launch to the end of the predicted trajectory.
Positions: ICRF/J2000 equatorial, Sun-centred, in 10^6 km, sampled at a fixed step.
Run: python tools/fetch_probes.py            (all)
     python tools/fetch_probes.py Cassini Dawn (only these, merged into the existing file)
"""
import json, re, urllib.parse, urllib.request, time, pathlib

API = 'https://ssd.jpl.nasa.gov/api/horizons.api'
# name, Horizons id, start, stop, step
PROBES = [
    ('Voyager 1', '-31', '1977-09-06', '2040-01-01', '10d'),
    ('Voyager 2', '-32', '1977-08-21', '2040-01-01', '10d'),
    ('Pioneer 10', '-23', '1972-03-04', '2040-01-01', '15d'),
    ('Pioneer 11', '-24', '1973-04-07', '2040-01-01', '15d'),
    ('New Horizons', '-98', '2006-01-20', '2040-01-01', '5d'),
    ('JWST', '-170', '2021-12-26', '2035-01-01', '1d'),
    ('Juno', '-61', '2011-08-06', '2030-01-01', '12h'),
    ('Parker Solar Probe', '-96', '2018-08-13', '2030-01-01', '12h'),
    ('Solar Orbiter', '-144', '2020-02-11', '2031-01-01', '1d'),
    ('BepiColombo', '-121', '2018-10-21', '2030-01-01', '1d'),
    ('Juice', '-28', '2023-04-15', '2036-01-01', '2d'),
    ('Europa Clipper', '-159', '2024-10-15', '2035-01-01', '2d'),
    ('Lucy', '-49', '2021-10-17', '2034-01-01', '2d'),
    ('Psyche', '-255', '2023-10-14', '2030-01-01', '2d'),
    # finished or long missions, whole flown trajectories
    ('Cassini', '-82', '1997-10-16', '2017-09-15', '1d'),
    ('Galileo', '-77', '1989-10-19', '2003-09-21', '2d'),
    ('Rosetta', '-226', '2004-03-03', '2016-09-30', '1d'),
    ('Dawn', '-203', '2007-09-28', '2018-10-31', '2d'),
    ('MESSENGER', '-236', '2004-08-04', '2015-04-30', '1d'),
    ('OSIRIS-REx', '-64', '2016-09-09', '2029-04-13', '1d'),
    ('Hayabusa2', '-37', '2014-12-04', '2031-07-01', '2d'),
    ('DART', '-135', '2021-11-25', '2022-09-26', '6h'),
    ('Ulysses', '-55', '1990-10-07', '2009-06-30', '3d'),
]
import sys
ONLY = set(sys.argv[1:])  # names to (re)fetch; the rest are kept from the existing file
MON = {m: i for i, m in enumerate(['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'], 1)}

def query(pid, start, stop, step):
    q = dict(format='text', COMMAND=f"'{pid}'", EPHEM_TYPE='VECTORS', CENTER="'500@10'", REF_PLANE='FRAME',
             START_TIME=f"'{start}'", STOP_TIME=f"'{stop}'", STEP_SIZE=f"'{step}'", VEC_TABLE='1', CSV_FORMAT='YES',
             OUT_UNITS='KM-S', MAKE_EPHEM='YES', OBJ_DATA='NO')
    with urllib.request.urlopen(urllib.request.Request(API + '?' + urllib.parse.urlencode(q), headers={'User-Agent': 'SpaceCommons-tools/1.0 (https://github.com/radix24/space-commons)'}), timeout=120) as r:
        return r.read().decode()

def iso(m):  # 'A.D. 2025-SEP-16 00:00:00' -> '2025-09-16 00:00'
    y, mo, d, hm = m.group(1), MON[m.group(2).upper()], m.group(3), m.group(4)
    return f'{y}-{mo:02d}-{d} {hm}'

p = pathlib.Path(__file__).resolve().parent.parent / 'data' / 'probes.json'
out = json.loads(p.read_text()) if p.exists() and ONLY else {}
for name, pid, start, stop, step in PROBES:
    if ONLY and name not in ONLY: continue
    for attempt in range(4):
        txt = query(pid, start, stop, step)
        if '$$SOE' in txt: break
        # trim the window to the span Horizons has data for
        a = re.search(r'prior to A\.D\. (\d{4})-([A-Z]{3})-(\d{2}) (\d{2}:\d{2})', txt)
        b = re.search(r'after A\.D\. (\d{4})-([A-Z]{3})-(\d{2}) (\d{2}:\d{2})', txt)
        if a: start = iso(a)
        if b: stop = iso(b)
        if not (a or b): print(name, 'FAILED:', txt[:300].replace('\n', ' ')); break
        time.sleep(1)
    if '$$SOE' not in txt: continue
    rows = txt.split('$$SOE')[1].split('$$EOE')[0].strip().splitlines()
    jd0 = float(rows[0].split(',')[0])
    jd1 = float(rows[1].split(',')[0]) if len(rows) > 1 else jd0 + 1
    xyz = []
    for r in rows:
        c = r.split(',')
        xyz += [round(float(c[2]) / 1e6, 4), round(float(c[3]) / 1e6, 4), round(float(c[4]) / 1e6, 4)]
    out[name] = {'jd0': jd0, 'step': round(jd1 - jd0, 6), 'xyz': xyz}
    print(f'{name}: {len(rows)} points, {rows[0].split(",")[1].strip()} .. {rows[-1].split(",")[1].strip()}')
    time.sleep(1)

p.parent.mkdir(exist_ok=True)
p.write_text(json.dumps(out, separators=(',', ':')))
print('wrote', p, p.stat().st_size // 1024, 'KB')
