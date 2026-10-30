"""List of files to store for offline use (data/offline-pack.json): libraries, catalogues, textures, models and sky-culture art.
Live data (satellites, aurora, weather, satellite photos, survey tiles) is not in the pack; the service worker keeps its last copy.
Run after adding assets: python tools/make_offline_pack.py
"""
import json, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
skip_tex = ('8k_', 'disp_', 'eso_milkyway_4k', 'allsky_', '4k_')     # the biggest images stay on demand
files = []
for d, pat in [('vendor', '**/*'), ('data', '**/*.json'), ('data', '**/*.tle'), ('data', 'celestial/*'), ('data/gaia', 'index.json'), ('textures', '*'), ('models', '*'), ('assets', '**/*')]:
    for p in sorted((ROOT / d).glob(pat)):
        if not p.is_file(): continue
        rel = p.relative_to(ROOT).as_posix()
        if rel.startswith('textures/') and p.name.startswith(skip_tex): continue
        if rel.startswith('data/gaia/') and p.name != 'index.json': continue
        if rel.startswith('models/') and p.stat().st_size > 1_000_000: continue   # detailed spacecraft models load when visited; a simple model stands in offline
        if rel not in [f for f, _ in files]: files.append((rel, p.stat().st_size))
total = sum(s for _, s in files)
(ROOT / 'data' / 'offline-pack.json').write_text(json.dumps({'bytes': total, 'files': [f for f, _ in files]}, separators=(',', ':')))
print(len(files), 'files', round(total / 1e6, 1), 'MB')
