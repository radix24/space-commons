"""Fetch confirmed exoplanets from the NASA Exoplanet Archive (pscomppars) and write data/exoplanets.json.

Grouped by host star: { hosts: [[name, ra, dec, dist_pc, vmag, teff, st_rad, st_lum_log, [planet, ...]], ...] }
planet = [name_suffix, a_au, period_d, radius_earth, mass_earth, eq_temp_k, disc_year, method_code]
Run: python tools/fetch_exoplanets.py
"""
import csv, io, json, pathlib, urllib.parse, urllib.request

Q = ("select pl_name,hostname,ra,dec,sy_dist,sy_vmag,st_teff,st_rad,st_lum,pl_orbsmax,pl_orbper,pl_rade,pl_bmasse,pl_eqt,disc_year,discoverymethod "
     "from pscomppars")
url = 'https://exoplanetarchive.ipac.caltech.edu/TAP/sync?' + urllib.parse.urlencode({'query': Q, 'format': 'csv'})
rows = list(csv.DictReader(io.StringIO(urllib.request.urlopen(url, timeout=180).read().decode())))
METHODS = ['Transit', 'Radial Velocity', 'Microlensing', 'Imaging', 'Transit Timing Variations', 'Eclipse Timing Variations',
           'Orbital Brightness Modulation', 'Pulsar Timing', 'Astrometry', 'Pulsation Timing Variations', 'Disk Kinematics']
f = lambda v, nd=3: round(float(v), nd) if v not in ('', None) else None
hosts = {}
for r in rows:
    h = hosts.setdefault(r['hostname'], [r['hostname'], f(r['ra'], 4), f(r['dec'], 4), f(r['sy_dist'], 2), f(r['sy_vmag'], 2),
                                          f(r['st_teff'], 0), f(r['st_rad'], 3), f(r['st_lum'], 3), []])
    suffix = r['pl_name'][len(r['hostname']):].strip() if r['pl_name'].startswith(r['hostname']) else r['pl_name']
    m = r['discoverymethod']
    h[8].append([suffix, f(r['pl_orbsmax'], 4), f(r['pl_orbper'], 3), f(r['pl_rade'], 2), f(r['pl_bmasse'], 2), f(r['pl_eqt'], 0),
                 int(r['disc_year']) if r['disc_year'] else None, METHODS.index(m) if m in METHODS else -1])
out = {'methods': METHODS, 'hosts': sorted(hosts.values(), key=lambda h: (h[4] is None, h[4] or 0))}
p = pathlib.Path(__file__).resolve().parent.parent / 'data' / 'exoplanets.json'
p.write_text(json.dumps(out, separators=(',', ':'), ensure_ascii=False), encoding='utf8')
print(len(rows), 'planets,', len(hosts), 'hosts ->', p, p.stat().st_size // 1024, 'KB')
