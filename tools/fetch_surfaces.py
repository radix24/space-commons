"""High-resolution Moon and Mars surfaces for close approach (S5).

textures/8k_moon.jpg, 8k_mars.jpg : Solar System Scope colour maps (CC BY 4.0), recompressed
textures/disp_moon.png             : LRO LOLA heights (NASA SVS CGI Moon Kit, ldem_16), 8-bit, -9.2 .. +10.8 km
textures/disp_mars.png             : MGS MOLA heights (PDS MEGDR 16 px/deg), 8-bit, -8.2 .. +21.3 km
Both height maps: 4096 x 2048, longitude 0 at the centre (like the colour maps).
Run: python tools/fetch_surfaces.py   (needs Pillow and numpy)
"""
import io, pathlib, urllib.request
import numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None

T = pathlib.Path(__file__).resolve().parent.parent / 'textures'
get = lambda u: urllib.request.urlopen(u, timeout=600).read()
for f in ('8k_moon.jpg', '8k_mars.jpg'):
    Image.open(io.BytesIO(get('https://www.solarsystemscope.com/textures/download/' + f))).convert('RGB').save(T / f, quality=80, optimize=True)

def save(h, lo, hi, name):  # h in metres, rows north->south, longitude 0 at centre
    a = np.clip((h - lo) / (hi - lo), 0, 1) * 255
    Image.fromarray(a.astype(np.uint8)).resize((4096, 2048), Image.LANCZOS).save(T / name, optimize=True)

# Moon: LOLA, uint16 in half-metres above 1727.4 km (CGI Moon Kit convention), already centred on 0 deg
m = np.array(Image.open(io.BytesIO(get('https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_16_uint.tif'))), dtype=np.float64)
save(m * 0.5 - 10000.0, -9200, 10800, 'disp_moon.png')
# Mars: MOLA MEGDR, big-endian int16 metres, columns from 0 deg E -> roll so 0 deg sits in the middle
r = np.frombuffer(get('https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg016/megt90n000eb.img'), dtype='>i2').reshape(2880, 5760).astype(np.float64)
save(np.roll(r, 2880, axis=1), -8200, 21300, 'disp_mars.png')
for f in ('8k_moon.jpg', '8k_mars.jpg', 'disp_moon.png', 'disp_mars.png'): print(f, (T / f).stat().st_size // 1024, 'KB')
