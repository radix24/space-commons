"""Second, deeper layer for deep zoom: Gaia DR3 stars with 12 <= G < 13 (about 6 million), same ~5 x 5 degree tiles as data/gaia.
Served by the NASA/IPAC IRSA TAP copy of Gaia DR3 (the ESA archive is not reachable from everywhere). Magnitude byte: (G - 12) * 250.

data/gaia13/index.json : {"band": 5, "tiles": [[dec0, nRA, [count per RA tile]], ...]}
data/gaia13/{b}_{i}.bin: 6 bytes per star -> uint16 RA offset, uint16 Dec offset (tile-relative, 0..65535),
                       uint8 (G - 8) * 60, uint8 (BP-RP + 0.5) * 60
Source: ESA Gaia DR3 (https://www.cosmos.esa.int/gaia), Gaia Collaboration 2023. The ESA archive answers browser requests
slowly and caps rows, so tiles are baked here. Resumable: existing tiles are skipped.
Run: python tools/fetch_gaia_tiles.py
"""
import concurrent.futures as cf, json, math, pathlib, struct, time, urllib.parse, urllib.request

OUT = pathlib.Path(__file__).resolve().parent.parent / 'data' / 'gaia13'; OUT.mkdir(parents=True, exist_ok=True)
BAND = 5
bands = []
for b in range(180 // BAND):
    d0 = -90 + b * BAND; n = max(1, math.ceil(360 / BAND * math.cos(math.radians(d0 + BAND / 2))))
    bands.append((b, d0, n))

def fetch(b, d0, n, i):
    f = OUT / f'{b}_{i}.bin'
    if f.exists(): return f.stat().st_size // 6
    w = 360 / n; r0 = i * w
    q = (f'SELECT ra,dec,phot_g_mean_mag,bp_rp FROM gaia_dr3_source WHERE phot_g_mean_mag>=12 AND phot_g_mean_mag<13 '
         f'AND ra>={r0} AND ra<{r0 + w} AND dec>={d0} AND dec<{d0 + BAND}')
    url = 'https://irsa.ipac.caltech.edu/TAP/sync?' + urllib.parse.urlencode({'LANG': 'ADQL', 'FORMAT': 'csv', 'QUERY': q})
    for k in range(5):
        try: txt = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'SpaceCommons-tools/1.0 (https://github.com/radix24/space-commons)'}), timeout=300).read().decode(); break
        except Exception as e: time.sleep(5 * (k + 1))
    else: raise RuntimeError(f'tile {b}_{i} failed')
    rows = txt.strip().splitlines()[1:]
    
    buf = bytearray()
    for r in rows:
        ra, de, g, c = r.split(',')
        c = float(c) if c else 0.8
        buf += struct.pack('<HHBB', min(65535, int((float(ra) - r0) / w * 65535)), min(65535, int((float(de) - d0) / BAND * 65535)),
                           max(0, min(255, int((float(g) - 12) * 250))), max(0, min(255, int((c + 0.5) * 60))))
    f.write_bytes(bytes(buf)); return len(rows)

jobs = [(b, d0, n, i) for b, d0, n in bands for i in range(n)]
counts = {}
with cf.ThreadPoolExecutor(6) as ex:
    futs = {ex.submit(fetch, *j): j for j in jobs}
    for k, fu in enumerate(cf.as_completed(futs)):
        j = futs[fu]; counts[(j[0], j[3])] = fu.result()
        if k % 100 == 0: print(k, '/', len(jobs), flush=True)
index = {'band': BAND, 'tiles': [[d0, n, [counts[(b, i)] for i in range(n)]] for b, d0, n in bands]}
(OUT / 'index.json').write_text(json.dumps(index, separators=(',', ':')))
print(sum(counts.values()), 'stars in', len(jobs), 'tiles')
