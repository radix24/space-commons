"""Proper motions for the sky catalogue: data/pm.json = {hip: [pm_ra_cosdec, pm_dec]} in mas/yr for Hipparcos stars brighter than mag 6.5 (naked eye).

Source: HYG database v4.1 (David Nash, https://github.com/astronexus/HYG-Database), CC BY-SA 4.0 (see data/LICENSE-stars3d.txt).
Used to move stars (and the constellation lines drawn through them) when the date is far from J2000.
Run: python tools/fetch_propermotion.py
"""
import csv, io, json, pathlib, urllib.request
ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = 'https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v41.csv'
txt = urllib.request.urlopen(urllib.request.Request(URL, headers={'User-Agent': 'SpaceCommons-tools/1.0 (https://github.com/radix24/space-commons)'}), timeout=600).read().decode()
out = {}
for r in csv.DictReader(io.StringIO(txt)):
    try:
        if not r['hip'] or float(r['mag']) > 6.5: continue
        a, d = float(r['pmra'] or 0), float(r['pmdec'] or 0)
        if abs(a) + abs(d) < 5: continue          # slower than 5 mas/yr hardly moves in a few thousand years
        out[int(r['hip'])] = [round(a, 1), round(d, 1)]
    except ValueError: pass
(ROOT / 'data' / 'pm.json').write_text(json.dumps(out, separators=(',', ':')))
print(len(out), 'stars', (ROOT / 'data' / 'pm.json').stat().st_size // 1024, 'KB')
