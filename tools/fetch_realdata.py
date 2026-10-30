"""Real observation data for the E1 labs, baked into small JSON files (data/real-*.json).

real-gaia-hr.json   : Gaia DR3 stars within 100 pc with good photometry: [BP-RP, absolute G]  (ESA/Gaia/DPAC, CC BY-SA 3.0 IGO)
real-tess-wasp18.json: TESS sector 2 light curve of WASP-18 (TIC 100100827), detrended, 10-minute bins, from the exo.MAST
                       DV time series (phase only): times rebuilt by unwrapping the phase with the planet's period (public domain, NASA)
real-sdss-galaxy.json: SDSS DR17 optical spectrum of a galaxy (plate 1198, MJD 52669, fiber 61, z = 0.0941), 4 A bins (SDSS, CC BY 4.0)
Run: python tools/fetch_realdata.py   (no astropy needed: the FITS table is read directly)
"""
import io, json, math, pathlib, struct, sys, urllib.parse, urllib.request
ROOT = pathlib.Path(__file__).resolve().parent.parent / 'data'
UA = {'User-Agent': 'SpaceCommons-tools/1.0 (https://github.com/radix24/space-commons)'}
get = lambda url, data=None: urllib.request.urlopen(urllib.request.Request(url, data=data, headers=UA), timeout=300).read()

# ---- Gaia H-R diagram ----
q = ("SELECT TOP 6000 bp_rp, phot_g_mean_mag + 5*log10(parallax/100) AS mg FROM gaiadr3.gaia_source WHERE parallax > 10 AND parallax_over_error > 20 "
     "AND phot_g_mean_flux_over_error > 50 AND phot_bp_mean_flux_over_error > 20 AND phot_rp_mean_flux_over_error > 20 AND bp_rp IS NOT NULL ORDER BY random_index")
csv = get('https://gea.esac.esa.int/tap-server/tap/sync', urllib.parse.urlencode({'REQUEST': 'doQuery', 'LANG': 'ADQL', 'FORMAT': 'csv', 'QUERY': q}).encode()).decode().splitlines()[1:]
pts = [[round(float(a), 3), round(float(b), 2)] for a, b in (l.split(',') for l in csv if l)]
(ROOT / 'real-gaia-hr.json').write_text(json.dumps({'source': 'ESA/Gaia/DPAC, Gaia DR3 (CC BY-SA 3.0 IGO)', 'fields': 'bp_rp,abs_g', 'rows': pts}, separators=(',', ':')))
print('gaia', len(pts))

# ---- TESS: WASP-18 ----
P = 0.94145223
d = json.loads(get('https://exo.mast.stsci.edu/api/v0.1/dvdata/tess/100100827/table/?tce=TCE_1&sector=2'))['data']
t, n, prev, rows = 0, 0, None, []
for r in d:
    ph, f = r['PHASE'], r['LC_DETREND']
    if prev is not None and ph < prev - P / 2: n += 1
    prev = ph
    if f is not None: rows.append((ph + n * P, f))
t0 = rows[0][0]; bins = {}
for tt, f in rows: k = int((tt - t0) * 144); bins.setdefault(k, []).append(f)  # 10-minute bins
lc = [[round(k / 144, 4), round(sum(v) / len(v) * 1e3, 3)] for k, v in sorted(bins.items())]  # days, parts per thousand
(ROOT / 'real-tess-wasp18.json').write_text(json.dumps({'source': 'NASA TESS, exo.MAST DV time series (public domain)', 'target': 'WASP-18 (TIC 100100827), sector 2', 'period_days': P, 'fields': 'days,dflux_ppt', 'rows': lc}, separators=(',', ':')))
print('tess', len(lc))

# ---- SDSS spectrum: read the FITS binary table (HDU 1: flux, loglam) ----
try: raw = get('https://data.sdss.org/sas/dr17/sdss/spectro/redux/26/spectra/lite/1198/spec-1198-52669-0061.fits')
except Exception: raw = open(sys.argv[1], 'rb').read()  # a copy fetched another way (e.g. curl) when Python cannot reach the server
def header(pos):
    h = {}
    while True:
        block = raw[pos:pos + 2880].decode('ascii'); pos += 2880
        for i in range(0, 2880, 80):
            card = block[i:i + 80]; key = card[:8].strip()
            if key == 'END': return h, pos
            if card[8:10] == '= ': h[key] = card[10:].split('/')[0].strip().strip("'").strip()
h0, pos = header(0)
h1, pos = header(pos)
nrow, rowlen, ncol = int(h1['NAXIS2']), int(h1['NAXIS1']), int(h1['TFIELDS'])
fmt = {'E': ('>f', 4), 'D': ('>d', 8), 'J': ('>i', 4), 'I': ('>h', 2), 'K': ('>q', 8)}
cols, off = {}, 0
for i in range(1, ncol + 1):
    tf = h1['TFORM%d' % i]; code = tf[-1]; rep = int(tf[:-1] or 1); cols[h1['TTYPE%d' % i].strip()] = (off, code); off += rep * fmt[code][1]
spec = []
for r in range(nrow):
    base = pos + r * rowlen; v = {}
    for name in ('flux', 'loglam'):
        o, code = cols[name]; v[name] = struct.unpack(fmt[code][0], raw[base + o:base + o + fmt[code][1]])[0]
    spec.append((10 ** v['loglam'], v['flux']))
binned, cur = [], []
for lam, f in spec:
    cur.append((lam, f))
    if cur[-1][0] - cur[0][0] >= 4: binned.append([round(sum(a for a, _ in cur) / len(cur), 1), round(sum(b for _, b in cur) / len(cur), 2)]); cur = []
(ROOT / 'real-sdss-galaxy.json').write_text(json.dumps({'source': 'SDSS DR17 (CC BY 4.0)', 'object': 'plate 1198, MJD 52669, fiber 61', 'z_pipeline': 0.09409, 'fields': 'lambda_A,flux_1e-17', 'rows': binned}, separators=(',', ':')))
print('sdss', len(binned))
