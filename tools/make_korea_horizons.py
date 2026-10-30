"""Korean observing sites as 360-degree horizons rendered from terrain (no photographs, so no image licence to worry about).

Elevation: Mapzen/Tilezen Terrain Tiles on AWS Open Data (Terrarium PNG, zoom 11, ~60 m per pixel here; sources include
SRTM and other public data; attribution required). For each azimuth column the terrain is walked outwards to 80 km;
each ridge paints the band between the highest angle so far and its own angle, coloured by distance (near: dark forest,
far: hazy blue) and lit by a low western sun, so the layered ridgelines read like a real view.
Output: textures/land_<key>.webp (4096x2048 RGBA, same layout as tools/make_landscapes.py) and entries merged into
data/landscapes.json.   Run: python tools/make_korea_horizons.py   (needs Pillow, numpy)
"""
import io, json, math, pathlib, urllib.request
import numpy as np
from PIL import Image, ImageFilter
ROOT = pathlib.Path(__file__).resolve().parent.parent
UA = {'User-Agent': 'SpaceCommons-tools/1.0 (https://github.com/radix24/space-commons)'}
SITES = {
    'bohyunsan': ('경북 영천 보현산천문대', 36.1645, 128.9763),
    'sobaeksan': ('충북 단양 소백산천문대', 36.9339, 128.4577),
    'jeju1100': ('제주 한라산 1100고지', 33.3577, 126.4627),
    'namsan': ('서울 남산', 37.5512, 126.9882),
    'chiak': ('강원 원주 치악산 (관측 명소)', 37.3653, 128.0507),
}
Z, W, H, RMAX = 11, 4096, 2048, 80.0
cache = {}
def tile(x, y):
    if (x, y) not in cache:
        u = f'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{Z}/{x}/{y}.png'
        a = np.asarray(Image.open(io.BytesIO(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60).read())).convert('RGB'), np.float32)
        cache[(x, y)] = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
    return cache[(x, y)]
def grid(lat, lon):  # one mosaic covering RMAX around the site
    n = 2 ** Z; fx = (lon + 180) / 360 * n; fy = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    span = RMAX / (40075 * math.cos(math.radians(lat)) / n) + 1; x0, x1, y0, y1 = int(fx - span), int(fx + span), int(fy - span), int(fy + span)
    m = np.vstack([np.hstack([tile(x, y) for x in range(x0, x1 + 1)]) for y in range(y0, y1 + 1)])
    m[m < 0] = 0  # sea level
    def h(la, lo):
        px = ((lo + 180) / 360 * n - x0) * 256; py = ((1 - np.arcsinh(np.tan(np.radians(la))) / np.pi) / 2 * n - y0) * 256
        i, j = np.clip(py.astype(int), 0, m.shape[0] - 2), np.clip(px.astype(int), 0, m.shape[1] - 2); fy_, fx_ = py - i, px - j
        return (m[i, j] * (1 - fx_) + m[i, j + 1] * fx_) * (1 - fy_) + (m[i + 1, j] * (1 - fx_) + m[i + 1, j + 1] * fx_) * fy_
    return h
NEAR, FAR, HAZE = np.array([34, 46, 32.]), np.array([92, 112, 140.]), np.array([150, 166, 190.])
meta = json.loads((ROOT / 'data' / 'landscapes.json').read_text(encoding='utf8'))
for key, (ko, lat, lon) in SITES.items():
    h = grid(lat, lon); rr = np.linspace(-0.0015, 0.0015, 7); h0 = float(h(lat + rr[:, None], lon + rr[None, :]).max()) + 3.0   # stand on the highest point within ~150 m (the DEM smooths summits)
    az = (np.arange(W) / W - 0.5) * 2 * math.pi            # column x <-> azimuth, north in the middle (shader: u = 0.5 + az / 2pi)
    d = np.concatenate([np.arange(0.25, 2, 0.02), np.arange(2, 15, 0.08), np.arange(15, RMAX, 0.3)])  # km
    la = lat + np.outer(d, np.cos(az)) / 111.2; lo = lon + np.outer(d, np.sin(az)) / (111.2 * math.cos(math.radians(lat)))
    hh = h(la, lo); dm = d[:, None] * 1000
    ang = np.arctan2(hh - h0 - dm * dm / (2 * 6371000) * 0.87, dm)   # elevation angle with curvature and refraction
    slope = np.vstack([np.diff(hh, axis=0), np.zeros((1, W))]) / np.maximum(np.gradient(dm, axis=0), 1)
    img = np.zeros((H, W, 4), np.uint8); rows = lambda a: np.clip((H / 2 - a / math.pi * H).round().astype(int), 0, H)
    for x in range(W):
        top = rows(np.array([-0.02]))[0]; img[top:, x, :3] = NEAR * 0.7; img[top:, x, 3] = 255; best = -0.02
        for k in range(len(d)):
            a = ang[k, x]
            if a <= best: continue
            t = min(d[k] / 40, 1); c = NEAR * (1 - t) + FAR * t
            light = 0.75 + 0.6 * np.clip(-slope[k, x] * math.sin(az[x] - 4.4), -0.5, 0.5)   # low sun in the west-southwest
            c = c * light; c = c * (1 - 0.55 * t * t) + HAZE * 0.55 * t * t
            r0, r1 = rows(np.array([a]))[0], rows(np.array([best]))[0]
            img[r0:r1 + 1, x, :3] = np.clip(c, 0, 255); img[r0:r1 + 1, x, 3] = 255; best = a
    alpha = np.asarray(Image.fromarray(img[..., 3]).filter(ImageFilter.GaussianBlur(0.8)))
    img[..., 3] = alpha
    Image.fromarray(img).save(ROOT / 'textures' / f'land_{key}.webp', 'WEBP', quality=82)
    meta[key] = {'ko': ko, 'lat': lat, 'lon': lon, 'elev': round(h0 - 2), 'credit': 'Tilezen Terrain Tiles (AWS Open Data: SRTM 등) 지형으로 그림', 'licence': '출처 표시', 'source': 'https://registry.opendata.aws/terrain-tiles/', 'north': 0, 'dem': True}
    print(key, round(h0 - 2), 'm', round(float(np.degrees(ang.max())), 1), 'deg max', (ROOT / 'textures' / f'land_{key}.webp').stat().st_size // 1024, 'KB')
(ROOT / 'data' / 'landscapes.json').write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding='utf8')
