"""Stars in 3D for interstellar flight: every star within 100 light-years plus all naked-eye stars with a known distance.

data/stars3d.json: {"fields": "name,x,y,z,absmag,ci,con", "rows": [...]}; x, y, z are equatorial J2000 parsecs from the Sun.
Source: HYG database v4.1 (David Nash, https://github.com/astronexus/HYG-Database), CC BY-SA 4.0
        -> kept as a separate data file with its licence (data/LICENSE-stars3d.txt).
Run: python tools/fetch_nearby_stars.py
"""
import csv, io, json, pathlib, urllib.request

OUT = pathlib.Path(__file__).resolve().parent.parent / 'data'
URL = 'https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v41.csv'
rows = csv.DictReader(io.StringIO(urllib.request.urlopen(URL, timeout=300).read().decode()))
GREEK = dict(Alp='α', Bet='β', Gam='γ', Del='δ', Eps='ε', Zet='ζ', Eta='η', The='θ', Iot='ι', Kap='κ', Lam='λ', Mu='μ', Nu='ν', Xi='ξ',
             Omi='ο', Pi='π', Rho='ρ', Sig='σ', Tau='τ', Ups='υ', Phi='φ', Chi='χ', Psi='ψ', Ome='ω')
out = []
for r in rows:
    d = float(r['dist'])
    if r['proper'] == 'Sol' or d <= 0 or d >= 100000: continue
    near, eye = d <= 30.66, float(r['mag']) < 6.5
    if not (near or eye): continue
    name = r['proper'] or (f"{GREEK.get(r['bayer'][:3], r['bayer'])} {r['con']}" if r['bayer'] else '') or (f"{r['flam']} {r['con']}" if r['flam'] else '') \
        or r['gl'] or (f"HIP {r['hip']}" if r['hip'] else f"HYG {r['id']}")
    ci = float(r['ci']) if r['ci'] else 0.6
    out.append([name, round(float(r['x']), 4), round(float(r['y']), 4), round(float(r['z']), 4), round(float(r['absmag']), 2), round(ci, 2), r['con']])
(OUT / 'stars3d.json').write_text(json.dumps({'fields': 'name,x,y,z,absmag,ci,con', 'rows': out}, ensure_ascii=False, separators=(',', ':')), encoding='utf8')
(OUT / 'LICENSE-stars3d.txt').write_text(
    'data/stars3d.json is derived from the HYG database v4.1 by David Nash (https://github.com/astronexus/HYG-Database),\n'
    'licensed under Creative Commons Attribution-ShareAlike 4.0 (https://creativecommons.org/licenses/by-sa/4.0/).\n'
    'Changes: filtered to stars within 100 light-years and naked-eye stars, reduced to name, position, absolute magnitude, colour index and constellation.\n', encoding='utf8')
print(len(out), 'stars ->', (OUT / 'stars3d.json').stat().st_size // 1024, 'KB')
