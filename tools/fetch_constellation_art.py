"""Constellation illustrations: Stellarium "modern" sky culture artwork by Johan Meuris (Free Art License 1.3).

Writes assets/constellations/<name>.webp (luminance only, for the Space Commons line-art tint in the app)
and data/constellation-art.json: [{"id", "file", "size": [w, h], "anchors": [[x, y, hip], x3]}].
Kept as separate files with their licence (assets/constellations/LICENSE.txt).
Run: python tools/fetch_constellation_art.py   (needs Pillow)
"""
import io, json, pathlib, urllib.request
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASE = 'https://raw.githubusercontent.com/Stellarium/stellarium/master/skycultures/modern/'
OUT = ROOT / 'assets' / 'constellations'; OUT.mkdir(parents=True, exist_ok=True)
idx = json.loads(urllib.request.urlopen(BASE + 'index.json', timeout=120).read())
art = []
for c in idx['constellations']:
    im = c.get('image')
    if not im: continue
    name = pathlib.Path(im['file']).stem
    img = Image.open(io.BytesIO(urllib.request.urlopen(BASE + im['file'], timeout=120).read())).convert('L')
    k = min(1.0, 512 / max(img.size))  # half resolution is plenty for faint overlay art
    if k < 1: img = img.resize((round(img.width * k), round(img.height * k)), Image.LANCZOS)
    img.save(OUT / f'{name}.webp', 'WEBP', quality=70)
    art.append({'id': c['id'].split()[-1], 'file': f'{name}.webp', 'size': [img.width, img.height],
                'anchors': [[round(a['pos'][0] * k, 1), round(a['pos'][1] * k, 1), a['hip']] for a in im['anchors']]})
(ROOT / 'data' / 'constellation-art.json').write_text(json.dumps(art, separators=(',', ':')))
(OUT / 'LICENSE.txt').write_text(
    'Constellation illustrations by Johan Meuris, from the Stellarium "modern" sky culture\n'
    '(https://github.com/Stellarium/stellarium/tree/master/skycultures/modern).\n'
    'Licensed under the Free Art License 1.3 (https://artlibre.org/licence/lal/en/).\n'
    'Changes: converted to greyscale WebP and reduced to at most 512 px; the app tints them in its own colours.\n', encoding='utf8')
print(len(art), 'illustrations', sum(f.stat().st_size for f in OUT.glob('*.webp')) // 1024, 'KB')
