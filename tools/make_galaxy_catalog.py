"""Galaxies of the local universe for the 3D view: the 2MASS Redshift Survey (Huchra et al. 2012, ApJS 199, 26), about 43,500
galaxies brighter than Ks = 11.75 over the whole sky, each with a measured redshift.

data/galaxies.bin : 12 bytes per galaxy, little-endian:
  uint16 RA * 65535/360, int16 Dec * 32767/90, uint16 distance in units of 0.01 Mpc (capped at 655 Mpc),
  uint8 (Ks - 4) * 30, uint8 type (0 elliptical/S0, 1 spiral, 2 irregular, 3 unknown), uint8 axis ratio b/a * 255, uint8 pad, uint16 name index + 1 (0 = none)
data/galaxies-names.json : ["M 31", "NGC 253", ...] for the named ones, so a click can show a name.
Distance: recession velocity / H0 with H0 = 70 km/s/Mpc (peculiar velocities make the nearest few Mpc uncertain; below 1 Mpc we keep 1 Mpc).
Source file: http://tdc-www.harvard.edu/2mrs/2mrs_v240.tgz -> catalog/2mrs_1175_done.dat (use requires citing Huchra et al. 2012).
Run: python tools/make_galaxy_catalog.py <path to 2mrs_1175_done.dat>
"""
import json, pathlib, re, struct, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
rows, names = [], []
for line in open(sys.argv[1], encoding='latin-1'):
    if line.startswith('#') or not line.strip(): continue
    f = line.split()
    ra, dec, k, ba, typ, v = float(f[1]), float(f[2]), float(f[5]), float(f[20]), f[22], float(f[24])
    cat = f[28] if len(f) > 28 else ''
    d = max(1.0, v / 70.0)
    m = re.match(r'-?\d+', typ); T = int(m.group()) if m else 98   # de Vaucouleurs T-type: -5..0 E/S0, 1..9 spiral, 10 irregular, 98 unknown
    tcode = 0 if T <= 0 else 1 if T <= 9 else 2 if T == 10 else 3
    nm = ''
    for p, s in (('MESSIER_0', 'M '), ('MESSIER_', 'M '), ('NGC_', 'NGC '), ('IC_', 'IC ')):
        if cat.startswith(p): nm = s + cat[len(p):].lstrip('0'); break
    ni = 0
    if nm: names.append(nm); ni = len(names)
    rows.append(struct.pack('<HhHBBBBH', int(ra / 360 * 65535) % 65536, int(max(-90, min(90, dec)) / 90 * 32767), min(65535, int(d * 100)),
                            max(0, min(255, int((k - 4) * 30))), tcode, max(0, min(255, int(ba * 255))), 0, ni))
(ROOT / 'data' / 'galaxies.bin').write_bytes(b''.join(rows))
(ROOT / 'data' / 'galaxies-names.json').write_text(json.dumps(names, separators=(',', ':')), encoding='utf8')
print(len(rows), 'galaxies,', len(names), 'named,', round(len(rows) * 12 / 1e6, 2), 'MB')
