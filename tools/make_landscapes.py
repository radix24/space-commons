"""Photo horizons: 360x180 panoramas with the sky cut away, for the ground view.

textures/land_<key>.webp  (4096x2048, RGBA: landscape opaque, sky transparent) and data/landscapes.json (place, credit, licence).
Sources (Wikimedia Commons): ESO panoramas of Paranal and Cerro Armazones (CC BY 4.0).
Sky detection: for each column, walk down from the zenith while the pixel still looks like sky (bright, or blue-dominant,
smoothly varying); the first run of non-sky pixels is the skyline, everything below it is kept. A small vertical smoothing
of the skyline removes single-column spikes.   Run: python tools/make_landscapes.py   (needs Pillow, numpy)
"""
import html, io, json, pathlib, re, urllib.parse, urllib.request
import numpy as np
from PIL import Image, ImageFilter
Image.MAX_IMAGE_PIXELS = None
ROOT = pathlib.Path(__file__).resolve().parent.parent
UA = {'User-Agent': 'SpaceCommons-tools/1.0 (https://github.com/radix24/space-commons)'}
LAND = {
    'paranal': ('File:Panoramic view of Paranal (res-mount-sunrise-pan).jpg', '칠레 파라날 천문대 (ESO VLT)', -24.627, -70.404, 2635),
    'armazones': ('File:Road to Cerro Armazones (armaz-acc-road-pano2-ext).jpg', '칠레 세로 아르마소네스 (초대형 망원경 ELT 자리)', -24.589, -70.192, 3046),
}
W, H = 4096, 2048
meta = {}
for key, (title, ko, lat, lon, elev) in LAND.items():
    q = urllib.parse.urlencode({'action': 'query', 'titles': title, 'prop': 'imageinfo', 'iiprop': 'url|extmetadata', 'iiurlwidth': W, 'format': 'json'})
    ii = list(json.loads(urllib.request.urlopen(urllib.request.Request('https://commons.wikimedia.org/w/api.php?' + q, headers=UA)).read())['query']['pages'].values())[0]['imageinfo'][0]
    em = ii['extmetadata']; strip = lambda s: html.unescape(re.sub('<[^>]+>', '', s or '')).strip()
    im = Image.open(io.BytesIO(urllib.request.urlopen(urllib.request.Request(ii.get('thumburl') or ii['url'], headers=UA), timeout=600).read())).convert('RGB').resize((W, H), Image.LANCZOS)
    a = np.asarray(im, np.float32); r, g, b = a[..., 0], a[..., 1], a[..., 2]; L = 0.3 * r + 0.59 * g + 0.11 * b
    sky_like = (L > 150) | ((b > r * 0.95) & (b > g * 0.9) & (L > 60)) | ((b > r * 1.4) & (b > g * 1.1) & (b > 40))  # the last: deep blue high-altitude sky
    sm = np.asarray(Image.fromarray(L.astype(np.uint8)).filter(ImageFilter.FIND_EDGES), np.float32)   # skies are smooth; ground has texture
    sky_like &= sm < 28
    top = int(H * 0.08); sky_like[:top] |= L[:top] < 25  # stitched panoramas often fill the zenith with black
    line = np.full(W, H // 2)
    for x in range(W):
        col = sky_like[: int(H * 0.62), x]; run = 0; y_end = 0
        for y in range(col.shape[0]):
            if col[y]: run = 0; y_end = y
            else:
                run += 1
                if run >= 4: break
        line[x] = y_end + 1
    line = np.round(np.convolve(np.pad(line, 6, mode='wrap'), np.ones(13) / 13, mode='valid')).astype(int)
    alpha = (np.arange(H)[:, None] >= line[None, :]).astype(np.float32)
    alpha = np.asarray(Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2)))
    Image.fromarray(np.dstack([a.astype(np.uint8), alpha])).save(ROOT / 'textures' / f'land_{key}.webp', 'WEBP', quality=80)
    meta[key] = {'ko': ko, 'lat': lat, 'lon': lon, 'elev': elev, 'credit': strip(em.get('Artist', {}).get('value'))[:160], 'licence': strip(em.get('LicenseShortName', {}).get('value')), 'source': ii['descriptionurl'], 'north': 0}
    print(key, meta[key]['licence'], meta[key]['credit'][:60], (ROOT / 'textures' / f'land_{key}.webp').stat().st_size // 1024, 'KB')
(ROOT / 'data' / 'landscapes.json').write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding='utf8')
