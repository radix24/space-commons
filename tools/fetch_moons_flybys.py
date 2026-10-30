"""JPL Horizons data for extra moons and spacecraft flyby replays.

data/moons.json   : one planet-centred state vector per moon (ICRF, km, km/s) at a common epoch, plus the period.
                    The app propagates each moon on the circular orbit defined by that state (good for weeks to months).
data/flybys.json  : planet-centred spacecraft tracks (10^6 km) at fine steps around famous encounters, so the craft
                    passes the planet correctly even where the planet's own position is only approximate.
Run: python tools/fetch_moons_flybys.py
"""
import json, pathlib, urllib.parse, urllib.request, time

API = 'https://ssd.jpl.nasa.gov/api/horizons.api'
OUT = pathlib.Path(__file__).resolve().parent.parent / 'data'

def query(cmd, center, start, stop, step, table='2'):
    q = dict(format='text', COMMAND=f"'{cmd}'", EPHEM_TYPE='VECTORS', CENTER=f"'500@{center}'", REF_PLANE='FRAME',
             START_TIME=f"'{start}'", STOP_TIME=f"'{stop}'", STEP_SIZE=f"'{step}'", VEC_TABLE=table, CSV_FORMAT='YES',
             OUT_UNITS='KM-S', MAKE_EPHEM='YES', OBJ_DATA='NO')
    txt = urllib.request.urlopen(API + '?' + urllib.parse.urlencode(q), timeout=180).read().decode()
    if '$$SOE' not in txt: raise RuntimeError(txt[:400])
    return [r.split(',') for r in txt.split('$$SOE')[1].split('$$EOE')[0].strip().splitlines()]

# ---- moons: (name, Horizons id, parent name, parent id, sidereal period in days) ----
MOONS = [('Phobos', 401, 'Mars', 499, 0.31891), ('Deimos', 402, 'Mars', 499, 1.26244),
         ('Mimas', 601, 'Saturn', 699, 0.942422), ('Enceladus', 602, 'Saturn', 699, 1.370218), ('Tethys', 603, 'Saturn', 699, 1.887802),
         ('Dione', 604, 'Saturn', 699, 2.736915), ('Rhea', 605, 'Saturn', 699, 4.517500), ('Iapetus', 608, 'Saturn', 699, 79.3215),
         ('Miranda', 705, 'Uranus', 799, 1.413479), ('Ariel', 701, 'Uranus', 799, 2.520379), ('Umbriel', 702, 'Uranus', 799, 4.144177),
         ('Titania', 703, 'Uranus', 799, 8.705872), ('Oberon', 704, 'Uranus', 799, 13.463239), ('Triton', 801, 'Neptune', 899, 5.876854)]
EPOCH = '2026-11-01'
moons = {}
for name, mid, parent, pid, period in MOONS:
    r = query(mid, pid, EPOCH, '2026-11-02', '1d')[0]
    moons[name] = {'parent': parent, 'jd': float(r[0]), 'r': [float(x) for x in r[2:5]], 'v': [float(x) for x in r[5:8]], 'P': period}
    print('moon', name); time.sleep(0.5)
(OUT / 'moons.json').write_text(json.dumps(moons, separators=(',', ':')))

# ---- flybys: (key, craft, craft id, planet, planet id, closest approach UTC, half-window days, step) ----
FLYBYS = [
    ('v1-jupiter', 'Voyager 1', -31, 'Jupiter', 599, '1979-03-05 12:05', 4, '10m'),
    ('v1-saturn', 'Voyager 1', -31, 'Saturn', 699, '1980-11-12 23:46', 4, '10m'),
    ('v2-jupiter', 'Voyager 2', -32, 'Jupiter', 599, '1979-07-09 22:29', 4, '10m'),
    ('v2-saturn', 'Voyager 2', -32, 'Saturn', 699, '1981-08-26 03:24', 4, '10m'),
    ('v2-uranus', 'Voyager 2', -32, 'Uranus', 799, '1986-01-24 17:59', 3, '10m'),
    ('v2-neptune', 'Voyager 2', -32, 'Neptune', 899, '1989-08-25 03:56', 3, '10m'),
    ('nh-jupiter', 'New Horizons', -98, 'Jupiter', 599, '2007-02-28 05:43', 4, '10m'),
    ('nh-pluto', 'New Horizons', -98, 'Pluto', 999, '2015-07-14 11:49', 2, '5m'),
    ('juno-joi', 'Juno', -61, 'Jupiter', 599, '2016-07-05 02:47', 3, '10m'),
    ('psp-perihelion', 'Parker Solar Probe', -96, 'Sun', 10, '2024-12-24 11:53', 3, '10m'),
    ('bepi-mercury', 'BepiColombo', -121, 'Mercury', 199, '2025-01-08 05:58', 2, '5m'),
    ('clipper-mars', 'Europa Clipper', -159, 'Mars', 499, '2025-03-01 17:57', 2, '5m'),
]
from datetime import datetime, timedelta
flybys = {}
for key, craft, cid, planet, pid, t, half, step in FLYBYS:
    t0 = datetime.strptime(t, '%Y-%m-%d %H:%M')
    try:
        rows = query(cid, pid, (t0 - timedelta(days=half)).strftime('%Y-%m-%d %H:%M'), (t0 + timedelta(days=half)).strftime('%Y-%m-%d %H:%M'), step, '1')
    except Exception as e:
        print('skip', key, str(e)[:120]); continue
    jd0 = float(rows[0][0]); jd1 = float(rows[1][0])
    xyz = []
    for r in rows: xyz += [round(float(r[2]) / 1e6, 6), round(float(r[3]) / 1e6, 6), round(float(r[4]) / 1e6, 6)]
    dmin = min((xyz[i] ** 2 + xyz[i + 1] ** 2 + xyz[i + 2] ** 2) ** 0.5 for i in range(0, len(xyz), 3)) * 1e6
    flybys[key] = {'craft': craft, 'center': planet, 'closest': t, 'jd0': jd0, 'step': round(jd1 - jd0, 8), 'xyz': xyz, 'dmin_km': round(dmin)}
    print('flyby', key, len(rows), 'pts, closest', round(dmin), 'km'); time.sleep(0.5)
(OUT / 'flybys.json').write_text(json.dumps(flybys, separators=(',', ':')))
print('done')
