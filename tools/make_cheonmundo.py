"""A hand-painted Korean celestial chart (Joseon, public domain; Internet Archive via Wikimedia Commons) as a second sky overlay.

Like tools/make_cheonsang.py: the chart is a polar map centred on the north celestial pole; centre, scale, mirror and
rotation were fitted by laying the Korean asterism lines over the chart's ink (best near star positions ~1,000 years
before J2000). Ink is redrawn light for a dark sky: black ink -> pale hanji, red star dots kept red, paper transparent.
Output: assets/cheonmundo.webp, data/cheonmundo.json.   Run: python tools/make_cheonmundo.py (needs Pillow, numpy)
"""
import io, json, pathlib, urllib.parse, urllib.request
import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
T = 'File:(Korean Celestial and zodiacal constellation chart). (IA dr korean-celestial-and-zodiacal-constellation-chart-11806001).jpg'
UA = {'User-Agent': 'SpaceCommons-tools/1.0 (https://github.com/radix24/space-commons)'}
q = urllib.parse.urlencode({'action': 'query', 'titles': T, 'prop': 'imageinfo', 'iiprop': 'url', 'iiurlwidth': 3840, 'format': 'json'})
url = list(json.loads(urllib.request.urlopen(urllib.request.Request('https://commons.wikimedia.org/w/api.php?' + q, headers=UA)).read())['query']['pages'].values())[0]['imageinfo'][0]['thumburl']
im = np.asarray(Image.open(io.BytesIO(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300).read())).convert('RGB')).astype(np.float32)
s = im.shape[1] / 3840
FIT = dict(cx=1938.0 * s, cy=1812.0 * s, k=9.6533 * s, mir=-1, rot=15.75, years=-1000)
half = int(FIT['k'] * 143); x0, y0 = int(FIT['cx']) - half, int(FIT['cy']) - half
crop = np.zeros((2 * half, 2 * half, 3), np.float32); sy0, sx0 = max(0, y0), max(0, x0)
part = im[sy0:y0 + 2 * half, sx0:x0 + 2 * half]; crop[sy0 - y0:sy0 - y0 + part.shape[0], sx0 - x0:sx0 - x0 + part.shape[1]] = part
R, G, B = crop[..., 0], crop[..., 1], crop[..., 2]; L = (R + G + B) / 3
red = np.clip((R - G - 45) / 50, 0, 1) * np.clip((R - 110) / 60, 0, 1)
dark = np.clip((150 - L) / 70, 0, 1) * (1 - red)
blue = np.clip((B - R + 5) / 25, 0, 1) * np.clip((200 - L) / 60, 0, 1) * (1 - dark)
col = np.zeros_like(crop); col[...] = [235, 222, 190]
col = col * (1 - red[..., None]) + np.array([255, 110, 90]) * red[..., None]
col = col * (1 - blue[..., None]) + np.array([150, 180, 210]) * blue[..., None]
alpha = np.clip(dark + red + 0.5 * blue, 0, 1)
yy, xx = np.mgrid[0:2 * half, 0:2 * half]; alpha *= np.clip((1 - np.hypot(xx - half, yy - half) / half) * 40, 0, 1)
size = 1536
Image.fromarray(np.dstack([col, alpha * 255]).astype(np.uint8), 'RGBA').resize((size, size), Image.LANCZOS).save(ROOT / 'assets' / 'cheonmundo.webp', 'WEBP', quality=82)
json.dump({'years': FIT['years'], 'mir': FIT['mir'], 'rot': FIT['rot'], 'k': FIT['k'] * size / (2 * half), 'size': size,
           'source': 'Korean celestial chart, hand-painted (Joseon), public domain, Internet Archive / Wikimedia Commons'}, open(ROOT / 'data' / 'cheonmundo.json', 'w', encoding='utf8'), ensure_ascii=False)
print('ok', (ROOT / 'assets' / 'cheonmundo.webp').stat().st_size // 1024, 'KB')
