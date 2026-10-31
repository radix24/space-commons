"""Venus elevation for the sandbox's terraforming oceans: Magellan global topography (NASA/JPL, USGS Astrogeology mosaic,
public domain), 4,641 m per pixel, signed 16-bit metres relative to a 6,051 km sphere.

Source: https://planetarymaps.usgs.gov/mosaic/Venus_Magellan_Topography_Global_4641m_v02.tif (8192 x 4096, 67 MB)
Output: textures/disp_venus.png, 4096 x 2048 greyscale like disp_mars.png: 0..255 spans LO..LO+SPAN metres (printed at the end,
        copied into sandbox.js as VENUS_H). Gaps in the data (strips Magellan missed, and the polar caps) are filled from the row average, or the global median.
Run:    python tools/make_venus_height.py <path to the .tif>
"""
import pathlib, sys
import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
Image.MAX_IMAGE_PIXELS = None
im = Image.open(sys.argv[1]); t = im.tag_v2; W, H = im.size
assert t[258] == (16,) and t[339] == (2,) and t[259] == 1, 'expected uncompressed signed 16-bit'
order = '<' if open(sys.argv[1], 'rb').read(2) == b'II' else '>'
raw = open(sys.argv[1], 'rb').read()
off = t[273][0]
a = np.frombuffer(raw, dtype=order + 'i2', count=W * H, offset=off).reshape(H, W).astype(np.float32)
bad = a < -15000  # no-data markers
if bad.any():
    m = np.where(bad, np.nan, a); med = float(np.nanmedian(m))
    with np.errstate(all='ignore'): rowmean = np.nanmean(m, axis=1, keepdims=True)
    a = np.where(bad, np.nan_to_num(rowmean, nan=med), a)  # rows with no data at all (near the poles) get the global median
a = a.reshape(H // 2, 2, W // 2, 2).mean(axis=(1, 3))  # 4096 x 2048
LO, HI = float(np.floor(a.min() / 100) * 100), float(np.ceil(a.max() / 100) * 100)
img = np.clip((a - LO) / (HI - LO) * 255 + 0.5, 0, 255).astype(np.uint8)
Image.fromarray(img, 'L').save(ROOT / 'textures' / 'disp_venus.png', optimize=True)
p = np.percentile(a, [10, 50, 80, 90])
print(f'VENUS_H = {{ lo: {LO:.0f}, span: {HI - LO:.0f} }}  percentiles 10/50/80/90: {p.round(0)}  no-data px: {int(bad.sum())}')
