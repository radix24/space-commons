"""More stars for flying among them in 3D: the AT-HYG v3.2 HYG-like catalogue (Hipparcos, Gliese, Yale, with Gaia DR3 and Tycho-2
positions and distances; astronexus/HYG-Database, CC BY-SA 4.0), about 119,000 stars with distances.

data/stars3d-ext.bin : 14 bytes per star, little-endian: float32 x, y, z (parsecs, equatorial J2000, Sun at origin),
                       uint8 (absolute magnitude + 10) * 10, uint8 (colour index B-V + 0.5) * 80.
Stars already in data/stars3d.json (named, with planets) are left out, as are distances beyond 1,000 pc (too uncertain).
Source: https://github.com/astronexus/HYG-Database (hyg/athyg_v3/hyglike_from_athyg_v32.csv.gz)
Run: python tools/make_stars3d_ext.py <path to hyglike_from_athyg_v32.csv.gz>
"""
import csv, gzip, json, pathlib, struct, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
have = {r[0] for r in json.loads((ROOT / 'data' / 'stars3d.json').read_text(encoding='utf8'))['rows']}
out, n = bytearray(), 0
with gzip.open(sys.argv[1], 'rt', encoding='utf8') as f:
    for r in csv.DictReader(f):
        try: d, x, y, z, M = float(r['dist']), float(r['x']), float(r['y']), float(r['z']), float(r['absmag'])
        except ValueError: continue
        if not 0 < d < 1000 or (r['hip'] and f"HIP {r['hip']}" in have) or d == 0: continue
        ci = float(r['ci']) if r['ci'] else 0.65
        out += struct.pack('<fffBB', x, y, z, max(0, min(255, int((M + 10) * 10))), max(0, min(255, int((ci + 0.5) * 80))))
        n += 1
(ROOT / 'data' / 'stars3d-ext.bin').write_bytes(bytes(out))
print(n, 'stars', round(len(out) / 1e6, 2), 'MB')
