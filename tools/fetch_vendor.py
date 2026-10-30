"""Self-host the libraries and base catalogues the app used to load from CDNs, so it runs without outside servers.

vendor/three/   three.js 0.160.0 module build + the example add-ons the app imports (MIT)
vendor/draco/   Draco glTF decoder (Apache 2.0)
vendor/katex/   KaTeX 0.16.11 js, css and fonts (MIT)
vendor/satellite.min.js  satellite.js 5.0.0 (MIT)
vendor/pretendard/       Pretendard variable font 1.3.9 (SIL OFL 1.1)
data/celestial/ d3-celestial star, name, constellation line/boundary catalogues (BSD 3-Clause), OpenNGC (CC BY-SA 4.0)
Run: python tools/fetch_vendor.py
"""
import json, pathlib, re, urllib.request
ROOT = pathlib.Path(__file__).resolve().parent.parent
UA = {'User-Agent': 'SpaceCommons-tools/1.0 (https://github.com/radix24/space-commons)'}
J = 'https://cdn.jsdelivr.net/'
def get(url): return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300).read()
def save(rel, data): p = ROOT / rel; p.parent.mkdir(parents=True, exist_ok=True); p.write_bytes(data); return p

# three.js and the add-ons, following their relative imports
T = J + 'npm/three@0.160.0/'
save('vendor/three/build/three.module.js', get(T + 'build/three.module.js'))
todo, done = ['controls/OrbitControls.js', 'environments/RoomEnvironment.js', 'loaders/DRACOLoader.js', 'loaders/GLTFLoader.js', 'loaders/STLLoader.js'], set()
while todo:
    rel = todo.pop()
    if rel in done: continue
    done.add(rel); src = get(T + 'examples/jsm/' + rel); save('vendor/three/examples/jsm/' + rel, src)
    base = pathlib.PurePosixPath(rel).parent
    for m in re.findall(rb"from\s+'(\.{1,2}/[^']+)'", src):
        todo.append(str(pathlib.PurePosixPath(*[q for q in (base / m.decode()).parts]).as_posix()).replace('/./', '/'))
    todo = [str(pathlib.PurePosixPath(t)).replace('\\', '/') for t in todo]
    todo = [re.sub(r'[^/]+/\.\./', '', t) for t in todo]
for f in ['draco_decoder.js', 'draco_decoder.wasm', 'draco_wasm_wrapper.js']: save('vendor/draco/' + f, get(T + 'examples/jsm/libs/draco/gltf/' + f))

# KaTeX with its fonts (css refers to fonts/...)
K = J + 'npm/katex@0.16.11/dist/'
css = get(K + 'katex.min.css'); save('vendor/katex/katex.min.css', css); save('vendor/katex/katex.min.js', get(K + 'katex.min.js'))
for f in sorted(set(re.findall(rb'fonts/([A-Za-z0-9_-]+\.woff2)', css))): save('vendor/katex/fonts/' + f.decode(), get(K + 'fonts/' + f.decode()))

save('vendor/satellite.min.js', get(J + 'npm/satellite.js@5.0.0/dist/satellite.min.js'))
P = J + 'gh/orioncactus/pretendard@v1.3.9/dist/web/variable/'
pcss = get(P + 'pretendardvariable.min.css')  # it points at ../../../packages/.../PretendardVariable.woff2: fetch that and point the css next to it
save('vendor/pretendard/PretendardVariable.woff2', get(J + 'gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/web/variable/woff2/PretendardVariable.woff2'))
save('vendor/pretendard/pretendardvariable.min.css', re.sub(rb"url\('[^']*PretendardVariable\.woff2'\)", b"url('PretendardVariable.woff2')", pcss))

C = J + 'gh/ofrohn/d3-celestial@master/data/'
for f in ['stars.8.json', 'starnames.json', 'constellations.lines.json', 'constellations.json', 'constellations.bounds.json']: save('data/celestial/' + f, get(C + f))
save('data/celestial/NGC.csv', get(J + 'gh/mattiaverga/OpenNGC@master/database_files/NGC.csv'))
print('three add-ons:', sorted(done))
