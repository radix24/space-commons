"""Make the Milky Way photograph line up with the sky and drop its stars.

The ESO/S. Brunier all-sky panorama (CC BY 4.0) is a hand-stitched mosaic. Its galactic grid drifts by 2-4 degrees in
places (M31 sat 3.5 degrees off), so photo stars and galaxies appeared beside the app's own, correctly placed ones.
1. Find bright stars in the photo and pair each with a catalogue star (data/celestial/stars.8.json, mag < 4.5).
2. Fit a smooth correction (2D polynomial in l, b, robust against bad pairs) from true position to photo pixel.
3. Resample the photo onto an exact galactic plate carree.
4. Remove point stars (grey-scale opening, then blend back where the photo is smooth), so only the diffuse light,
   dust lanes, nebulae and galaxies remain; the app draws every star itself from catalogues.

Run: python tools/fix_milkyway.py [--keep-stars]  (reads textures/eso_milkyway_4k.jpg, writes the 4k and 2k files)
"""
import json, math, pathlib, sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'textures' / 'eso_milkyway_4k.jpg'
keep_stars = '--keep-stars' in sys.argv

def gal(ra, dec):  # degrees -> galactic l (-180..180), b
    ra, dec = np.radians(ra), np.radians(dec)
    rag, decg, l0 = math.radians(192.85948), math.radians(27.12825), math.radians(122.93192)
    b = np.arcsin(np.sin(dec) * math.sin(decg) + np.cos(dec) * math.cos(decg) * np.cos(ra - rag))
    y = np.cos(dec) * np.sin(ra - rag); x = np.sin(dec) * math.cos(decg) - np.cos(dec) * math.sin(decg) * np.cos(ra - rag)
    return (np.degrees(l0 - np.arctan2(y, x)) + 180) % 360 - 180, np.degrees(b)

im = Image.open(SRC).convert('RGB'); W, H = im.size
rgb = np.asarray(im).astype(np.float32)
lum = rgb.mean(2)
px = lambda l, b: (W / 2 - l / 360 * W, H / 2 - b / 180 * H)  # the app's mapping (uv = 0.5 - l/2pi, 0.5 + b/pi, image rows top-down)

# --- 1. pairs: catalogue star -> brightest compact peak within 6 degrees in the photo
feats = json.loads((ROOT / 'data' / 'celestial' / 'stars.8.json').read_text(encoding='utf8'))['features']
cat = np.array([[f['geometry']['coordinates'][0], f['geometry']['coordinates'][1], f['properties']['mag']] for f in feats if f['properties']['mag'] < 4.5])
L, B = gal(cat[:, 0], cat[:, 1])
keep = np.abs(B) < 80
L, B, mag = L[keep], B[keep], cat[keep, 2]
top = lum - ndimage.uniform_filter(lum, 25)  # point sources stand out above the local background
def design(l, b):
    u, v = l / 180, b / 90
    return np.stack([np.ones_like(u), u, v, u * v, u * u, v * v, u ** 3, v ** 3, u * u * v, u * v * v], -1)
# Pairing single stars fails in the dense Milky Way, so measure shifts tile by tile instead: draw the catalogue as a synthetic
# star image and cross-correlate it with the photo's point sources in 256 px tiles; each tile gives one robust local shift.
allc = np.array([[f['geometry']['coordinates'][0], f['geometry']['coordinates'][1], f['properties']['mag']] for f in feats if f['properties']['mag'] < 7.5])
La, Ba = gal(allc[:, 0], allc[:, 1]); xa, ya = px(La, Ba)
synth = np.zeros((H, W), np.float32)
ok_ = (ya >= 0) & (ya < H)
np.add.at(synth, (ya[ok_].astype(int), xa[ok_].astype(int) % W), 10 ** (-0.4 * (allc[ok_, 2] - 6)))
synth = ndimage.gaussian_filter(synth, 1.5)
ptop = ndimage.gaussian_filter(np.clip(top, 0, None), 1.5)
T, S = 256, 48  # tile size, largest shift searched (px)
shifts = []
for y0 in range(0, H - T + 1, T // 2):
    for x0 in range(0, W - T + 1, T // 2):
        a = ptop[y0:y0 + T, x0:x0 + T]; b = synth[y0:y0 + T, x0:x0 + T]
        if b.sum() < 5 or a.std() < 1: continue
        a = (a - a.mean()) / a.std(); b = (b - b.mean()) / b.std()
        cc = np.real(np.fft.ifft2(np.fft.fft2(a) * np.conj(np.fft.fft2(b)))); cc = np.fft.fftshift(cc)
        c0 = T // 2; win = cc[c0 - S:c0 + S + 1, c0 - S:c0 + S + 1]; py_, px_ = np.unravel_index(win.argmax(), win.shape)
        peak = win[py_, px_]; snr = (peak - win.mean()) / (win.std() + 1e-6)
        if snr < 6: continue
        xc, yc = x0 + T / 2, y0 + T / 2
        shifts.append(((W / 2 - xc) / W * 360, (H / 2 - yc) / H * 180, px_ - S, py_ - S, snr))
shifts = np.array(shifts); print(len(shifts), 'tiles with a clear match, median shift', np.median(shifts[:, 2:4], axis=0).round(1), 'px')
A = design(shifts[:, 0], shifts[:, 1]); wts = np.sqrt(shifts[:, 4]); ok = np.ones(len(shifts), bool)
for _ in range(8):
    cx, *_ = np.linalg.lstsq(A[ok] * wts[ok, None], shifts[ok, 2] * wts[ok], rcond=None); cy, *_ = np.linalg.lstsq(A[ok] * wts[ok, None], shifts[ok, 3] * wts[ok], rcond=None)
    res = np.hypot(A @ cx - shifts[:, 2], A @ cy - shifts[:, 3]); ok = res < max(2.5, 2.5 * np.median(res[ok]))
print('fit on', ok.sum(), 'tiles, residual median', np.median(res[ok]).round(2), 'px')
for n, ra, dec in [('M31', 10.68, 41.27), ('LMC', 80.9, -69.75), ('SMC', 13.2, -72.8)]:
    l, b = gal(np.array([ra]), np.array([dec])); d = design(l, b)[0]; print(n, 'fitted shift', (d @ cx).round(1), (d @ cy).round(1), 'px')

# --- 3. resample onto the exact grid: output pixel (l, b) takes the photo at its true pixel plus the fitted shift
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
lg = (W / 2 - xx) / W * 360; bg = (H / 2 - yy) / H * 180
D = design(lg.ravel(), bg.ravel())
sx = (D @ cx).reshape(H, W); sy = (D @ cy).reshape(H, W)
fade = np.clip((90 - np.abs(bg)) / 10, 0, 1)  # the fit is unconstrained near the poles: let the shift fade out
X = (xx + sx * fade) % W; Y = np.clip(yy + sy * fade, 0, H - 1)
out = np.stack([ndimage.map_coordinates(rgb[..., k], [Y, X], order=1, mode='wrap') for k in range(3)], -1)

# --- 4. remove point stars: only pixels that stand clearly above their surroundings (resolved stars) are replaced, with the
# median of the sky around them; the unresolved glow, dust lanes, nebulae and galaxies keep their original pixels
if not keep_stars:
    lumo = out.mean(2)
    bg = ndimage.median_filter(lumo, size=9)
    star = (lumo - bg) > 70  # only the conspicuous stars, which the app draws itself; the faint ones are the texture of the Milky Way
    star = ndimage.binary_dilation(star, iterations=2)
    big = ndimage.uniform_filter(lumo, 31)
    star &= ~(ndimage.gaussian_filter(lumo, 6) - big > 25)  # leave extended bright objects (M31, the Magellanic Clouds, nebula cores)
    fill = np.stack([ndimage.median_filter(out[..., k], size=13) for k in range(3)], -1)
    soft = ndimage.gaussian_filter(star.astype(np.float32), 1.0)[..., None]
    out = out * (1 - soft) + fill * soft
    print('replaced', round(star.mean() * 100, 1), '% of pixels as stars')

out = np.clip(out, 0, 255).astype(np.uint8)
Image.fromarray(out).save(ROOT / 'textures' / 'eso_milkyway_4k.jpg', quality=84, optimize=True, progressive=True)
Image.fromarray(out).resize((W // 2, H // 2), Image.LANCZOS).save(ROOT / 'textures' / 'eso_milkyway_2k.jpg', quality=84, optimize=True, progressive=True)
print('wrote 4k and 2k')
