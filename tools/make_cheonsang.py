"""Cheonsang Yeolcha Bunyajido (woodcut print, public domain, Wikimedia Commons) as a sky overlay for the Korean sky culture.

The chart is a polar equidistant map centred on the north celestial pole. Its centre, scale, rotation and mirror were fitted
by laying the Korean asterism lines (data/korean-constellations.json) over the chart's own lines; the best match uses star
positions precessed about 1,400 years before J2000. Output:
  assets/cheonsang.webp   square crop around the pole, gold lines kept, dark paper made transparent
  data/cheonsang.json     { years, mir, rot (deg), k (px per deg of polar distance), size (px) } for the app's mapping
Run: python tools/make_cheonsang.py   (needs Pillow, numpy)
"""
import io, json, pathlib, urllib.request
import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = 'https://upload.wikimedia.org/wikipedia/commons/6/64/Cheonsang-yeolcha-bunya-jido_%28woodcut_version%29.png'
FIT = dict(cx=928.0, cy=1363.0, k=5.05, mir=-1, rot=37.75, years=-1400)  # see the docstring
req = urllib.request.Request(URL, headers={'User-Agent': 'SpaceCommons-tools/1.0 (https://github.com/radix24/space-commons)'})
im = np.asarray(Image.open(io.BytesIO(urllib.request.urlopen(req, timeout=300).read())).convert('RGB')).astype(np.float32)
half = int(FIT['k'] * 143)
x0, y0 = int(FIT['cx']) - half, int(FIT['cy']) - half
crop = im[y0:y0 + 2 * half, x0:x0 + 2 * half]
R, G, B = crop[..., 0], crop[..., 1], crop[..., 2]
alpha = np.clip((R - B - 35) / 90, 0, 1) * np.clip((R - 70) / 80, 0, 1)  # gold ink -> opaque, dark paper -> clear
yy, xx = np.mgrid[0:2 * half, 0:2 * half]; rr = np.hypot(xx - half, yy - half) / half
alpha *= np.clip((1.0 - rr) * 40, 0, 1)  # nothing outside the outer ring
rgba = np.dstack([R, G, B, alpha * 255]).astype(np.uint8)
size = 1536
Image.fromarray(rgba, 'RGBA').resize((size, size), Image.LANCZOS).save(ROOT / 'assets' / 'cheonsang.webp', 'WEBP', quality=82)
json.dump({'years': FIT['years'], 'mir': FIT['mir'], 'rot': FIT['rot'], 'k': FIT['k'] * size / (2 * half), 'size': size,
           'source': 'Cheonsang Yeolcha Bunyajido, woodcut version (public domain), Wikimedia Commons'}, open(ROOT / 'data' / 'cheonsang.json', 'w', encoding='utf8'), ensure_ascii=False)
print('ok', (ROOT / 'assets' / 'cheonsang.webp').stat().st_size // 1024, 'KB')
