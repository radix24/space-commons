"""All-sky maps in other wavelengths (A1), galactic plate carree, centre l=0, l increasing to the left. textures/allsky_<key>.jpg at 4096x2048.

Wikimedia Commons "AllSky" series (CC BY 4.0, credits printed below and in data/allsky.json) and NASA Fermi (public domain).
Run: python tools/fetch_allsky.py   (needs Pillow)
"""
import html, io, json, pathlib, re, urllib.parse, urllib.request
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
ROOT = pathlib.Path(__file__).resolve().parent.parent
UA = {'User-Agent': 'SpaceCommons-tools/1.0 (https://github.com/radix24/space-commons)'}
MAPS = {
    'radio': ('File:Parkes-Effelsberg Radio All Sky (AllSky-01 Radio21cm-hi4pi nhi k on w inferno).jpg', '전파 21 cm (중성 수소)'),
    'micro': ('File:Planck Microwave All Sky (AllSky-10 Micro05-10mm-Planck-Radio-multiband).jpg', '마이크로파 (Planck)'),
    'ir': ('File:2MASS Infrared All Sky (AllSky-14 IR2μm-2mass).jpg', '근적외선 2 μm (2MASS)'),
    'halpha': ('File:WHAM Visible Light H-alpha All Sky (AllSky-17 Optical656nm-Halpha-WHAM-SHASSA-VTSS).jpg', 'H-알파 656 nm (전리 수소)'),
    'xray': ('File:EROSITA X-ray All Sky (erass1-car-rgb-gal-10K).jpg', 'X선 (eROSITA, 하늘 절반)'),
    'gamma': ("File:Fermi's 12-year View of the Gamma-ray Sky (SVS14090 - Fermi 144 month all-sky-cyl 4000x2000).png", '감마선 (Fermi)'),
}
out = {}
for key, (title, ko) in MAPS.items():
    q = urllib.parse.urlencode({'action': 'query', 'titles': title, 'prop': 'imageinfo', 'iiprop': 'url|extmetadata', 'iiurlwidth': 4096, 'format': 'json'})
    ii = list(json.loads(urllib.request.urlopen(urllib.request.Request('https://commons.wikimedia.org/w/api.php?' + q, headers=UA)).read())['query']['pages'].values())[0]['imageinfo'][0]
    em = ii['extmetadata']; strip = lambda s: html.unescape(re.sub('<[^>]+>', '', s or '')).strip()
    credit = strip(em.get('Artist', {}).get('value')) or strip(em.get('Credit', {}).get('value'))
    lic = strip(em.get('LicenseShortName', {}).get('value'))
    im = Image.open(io.BytesIO(urllib.request.urlopen(urllib.request.Request(ii.get('thumburl') or ii['url'], headers=UA), timeout=600).read())).convert('RGB').resize((4096, 2048), Image.LANCZOS)
    im.save(ROOT / 'textures' / f'allsky_{key}.jpg', 'JPEG', quality=82)
    out[key] = {'ko': ko, 'credit': credit[:200], 'licence': lic, 'source': ii['descriptionurl']}
    print(key, lic, '|', credit[:120])
(ROOT / 'data' / 'allsky.json').write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding='utf8')
