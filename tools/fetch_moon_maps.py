"""Global surface maps (simple cylindrical, 2048x1024 JPEG in textures/) for the major moons and dwarf planets.

Sources on Wikimedia Commons: NASA/JPL/USGS mosaics (public domain); Ganymede and Callisto by Askaniy (CC BY-SA 3.0).
Io has no single global map there: its Galileo/Voyager Mercator band (+-49.6 deg) is joined to the two orthographic polar
views, whose rotation is fitted by matching the overlap at 40-48 deg latitude.
Run: python tools/fetch_moon_maps.py   (needs Pillow, numpy)
"""
import io, json, pathlib, urllib.parse, urllib.request
import numpy as np
from PIL import Image, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parent.parent
UA = {'User-Agent': 'SpaceCommons-tools/1.0 (https://github.com/radix24/space-commons)'}
W, H = 2048, 1024
PLAIN = {
    'europa': 'File:Europa Voyager GalileoSSI global mosaic.jpg',
    'ganymede': 'File:Ganymede map by Askaniy.png',
    'callisto': 'File:Callisto map by Askaniy.png',
    'titan': 'File:Titan map April 2011 full.png',
    'pluto': 'File:Pluto color mapmosaic.jpg',
    'ceres': 'File:Map of Ceres (PIA19625 cropped).png',
    'vesta': 'File:Vesta map for GeoHack.png',
}

def fetch(title, width):
    q = urllib.parse.urlencode({'action': 'query', 'titles': title, 'prop': 'imageinfo', 'iiprop': 'url', 'iiurlwidth': width, 'format': 'json'})
    ii = list(json.loads(urllib.request.urlopen(urllib.request.Request('https://commons.wikimedia.org/w/api.php?' + q, headers=UA)).read())['query']['pages'].values())[0]['imageinfo'][0]
    return Image.open(io.BytesIO(urllib.request.urlopen(urllib.request.Request(ii.get('thumburl') or ii['url'], headers=UA), timeout=300).read())).convert('RGB')

def save(key, im): im.save(ROOT / 'textures' / f'2k_{key}.jpg', 'JPEG', quality=86); print(key, 'ok')

for key, title in PLAIN.items(): save(key, fetch(title, W).resize((W, H), Image.LANCZOS))

# ---- Io ----
# base: a complete simple-cylindrical map (lon -180..180 east); its middle latitudes are replaced by the sharper
# Galileo/Voyager Mercator band (lon 0..360 east, +-49.6 deg), blended in between 36 and 44 deg
base = np.asarray(fetch('File:Io for GeoHacks.jpg', 1225).resize((W, H), Image.BICUBIC), np.float32)
band = np.asarray(fetch('File:Io from Galileo and Voyager missions.jpg', 6000).filter(ImageFilter.MedianFilter(5)), np.float32)[:, 3:-3]; bh, bw = band.shape[:2]  # median filter erases the 1-px graticule; trim the dark edge columns
ymax = np.pi * bh / (bw + 6)
lon = (np.arange(W) + 0.5) / W * 2 * np.pi - np.pi; lat = np.pi / 2 - (np.arange(H) + 0.5) / H * np.pi
LON, LAT = np.meshgrid(lon, lat)
y = np.log(np.tan(np.pi / 4 + np.clip(LAT, -1.2, 1.2) / 2))
bx = np.clip((np.mod(LON, 2 * np.pi) / (2 * np.pi) * bw).astype(int), 0, bw - 1); by = np.clip(((1 - y / ymax) / 2 * bh).astype(int), 0, bh - 1)
B = band[by, bx]
k = np.clip((np.radians(44) - np.abs(LAT)) / np.radians(8), 0, 1)[..., None]
save('io', Image.fromarray((base * (1 - k) + B * k).clip(0, 255).astype(np.uint8)))
