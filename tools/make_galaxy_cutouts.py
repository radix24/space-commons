"""Photos of Local Group galaxies for the 3D galaxy view, cut from DSS2 colour HiPS tiles (ESA ESASky mirror of the CDS HiPS).

textures/gal_<key>.jpg : 512x512 gnomonic (TAN) cutouts, north up, east left, as seen from Earth.
HEALPix nested indexing is done here directly (numpy), so no astro libraries are needed.
Credit: DSS2 (STScI/NASA, Caltech/Palomar), HiPS by CDS.   Run: python tools/make_galaxy_cutouts.py
"""
import io, pathlib, urllib.request
import numpy as np
from PIL import Image
ROOT = pathlib.Path(__file__).resolve().parent.parent
UA = {'User-Agent': 'SpaceCommons-tools/1.0 (https://github.com/radix24/space-commons)'}
HIPS = 'https://skies.esac.esa.int/DSSColor/'
GAL = {'m31': (10.68, 41.27, 3.4), 'm33': (23.46, 30.66, 1.1), 'lmc': (80.89, -69.76, 11.0), 'smc': (13.19, -72.83, 5.0),
       'm81': (148.89, 69.07, 0.5), 'm82': (148.97, 69.68, 0.25), 'm51': (202.47, 47.20, 0.25), 'm101': (210.80, 54.35, 0.5),
       'm104': (190.00, -11.62, 0.2), 'cena': (201.37, -43.02, 0.5), 'm87': (187.71, 12.39, 0.15), 'n253': (11.89, -25.29, 0.6)}  # ra, dec, field (deg)
W = 512

def spread(v):  # interleave the bits of v with zeros (x -> even bits)
    v = v.astype(np.int64); out = np.zeros_like(v)
    for b in range(20): out |= ((v >> b) & 1) << (2 * b)
    return out

def ang2xyf(nside, z, phi):  # HEALPix nested: face and (ix, iy) inside it
    za = np.abs(z); tt = np.mod(phi, 2 * np.pi) * 2 / np.pi
    face = np.zeros(z.shape, np.int64); ix = np.zeros(z.shape, np.int64); iy = np.zeros(z.shape, np.int64)
    eq = za <= 2 / 3
    t1 = nside * (0.5 + tt[eq]); t2 = nside * z[eq] * 0.75
    jp = (t1 - t2).astype(np.int64); jm = (t1 + t2).astype(np.int64); ifp = jp // nside; ifm = jm // nside
    face[eq] = np.where(ifp == ifm, ifp | 4, np.where(ifp < ifm, ifp, ifm + 8))
    ix[eq] = jm & (nside - 1); iy[eq] = nside - (jp & (nside - 1)) - 1
    po = ~eq; ntt = np.minimum(3, tt[po].astype(np.int64)); tp = tt[po] - ntt; tmp = nside * np.sqrt(3 * (1 - za[po]))
    jp = np.minimum((tp * tmp).astype(np.int64), nside - 1); jm = np.minimum(((1 - tp) * tmp).astype(np.int64), nside - 1)
    north = z[po] >= 0
    face[po] = np.where(north, ntt, ntt + 8)
    ix[po] = np.where(north, nside - jm - 1, jp); iy[po] = np.where(north, nside - jp - 1, jm)
    return face, ix, iy

cache = {}
def tile(order, npix):
    k = (order, int(npix))
    if k not in cache:
        u = f'{HIPS}Norder{order}/Dir{(int(npix) // 10000) * 10000}/Npix{int(npix)}.jpg'
        try: cache[k] = np.asarray(Image.open(io.BytesIO(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60).read())).convert('RGB'))
        except Exception: cache[k] = np.zeros((512, 512, 3), np.uint8)
    return cache[k]

for key, (ra0, dec0, fov) in GAL.items():
    order = int(np.clip(np.floor(np.log2(W / fov * 58.6 / 512)), 3, 9))  # DSS colour HiPS goes to order 9  # tile pixels about as fine as the cutout
    nside = (2 ** order) * 512
    s = np.tan(np.radians(fov / 2)); g = (np.arange(W) + 0.5) / W * 2 - 1
    X, Y = np.meshgrid(-g * s, -g * s)          # x east-positive to the left, y north up (row 0 = top)
    a0, d0 = np.radians(ra0), np.radians(dec0)
    rho = np.hypot(X, Y); c = np.arctan(rho); sc, cc = np.sin(c), np.cos(c)
    dec = np.arcsin(cc * np.sin(d0) + np.where(rho > 0, Y * sc * np.cos(d0) / np.maximum(rho, 1e-12), 0))
    ra = a0 + np.arctan2(X * sc, rho * np.cos(d0) * cc - Y * np.sin(d0) * sc)
    face, ix, iy = ang2xyf(nside, np.sin(dec), ra)
    tpix = face * (4 ** order) + (spread(ix >> 9) | (spread(iy >> 9) << 1))
    px, py = ix & 511, iy & 511
    out = np.zeros((W, W, 3), np.uint8)
    for t in np.unique(tpix):
        m = tpix == t; im = tile(order, t)
        out[m] = im[px[m], py[m]]   # tile image: row along HEALPix x, column along y (same as hipsTile in app.js)
    Image.fromarray(out).save(ROOT / 'textures' / f'gal_{key}.jpg', quality=88)
    print(key, 'order', order, 'tiles', len(np.unique(tpix)))
