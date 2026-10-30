"""More sky cultures from Stellarium's sky-culture data, each kept as a separate file with its own licence.

data/culture-chinese.json  : Stellarium "chinese" sky culture, CC BY-SA 4.0
data/culture-egyptian.json : Stellarium "egyptian" sky culture, GNU GPL v2.0
Same shape as data/korean-constellations.json: {source, licence, constellations: [{id, native, en, lines}]}.
Run: python tools/fetch_skycultures.py
"""
import json, pathlib, urllib.request

OUT = pathlib.Path(__file__).resolve().parent.parent / 'data'
UA = {'User-Agent': 'SpaceCommons-tools/1.0 (https://github.com/radix24/space-commons)'}
CULTURES = {'chinese': 'CC BY-SA 4.0', 'egyptian': 'GNU GPL v2.0'}
for key, lic in CULTURES.items():
    url = f'https://raw.githubusercontent.com/Stellarium/stellarium/master/skycultures/{key}/index.json'
    src = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read().decode())
    cons = [{'id': c['id'], 'native': c['common_name'].get('native', ''), 'en': c['common_name'].get('english', ''), 'lines': c['lines']}
            for c in src['constellations'] if c.get('lines')]
    (OUT / f'culture-{key}.json').write_text(json.dumps({'source': f'Stellarium sky culture "{key}"', 'licence': lic, 'url': url, 'constellations': cons},
                                                        ensure_ascii=False, separators=(',', ':')), encoding='utf8')
    print(key, len(cons), 'constellations')
(OUT / 'LICENSE-skycultures.txt').write_text(
    'data/culture-chinese.json is derived from the Stellarium "chinese" sky culture, licensed CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/).\n'
    'data/culture-egyptian.json is derived from the Stellarium "egyptian" sky culture, licensed GNU GPL v2.0.\n'
    'Source: https://github.com/Stellarium/stellarium/tree/master/skycultures . Both remain under their licences and are loaded by the app as separate data.\n', encoding='utf8')
