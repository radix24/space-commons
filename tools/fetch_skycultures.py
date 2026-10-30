"""More sky cultures from Stellarium's sky-culture data, each kept as a separate file with its own licence.

data/culture-chinese.json  : Stellarium "chinese" sky culture, CC BY-SA 4.0
data/culture-egyptian.json : Stellarium "egyptian" sky culture, GNU GPL v2.0
Same shape as data/korean-constellations.json: {source, licence, constellations: [{id, native, en, lines}]}.
Run: python tools/fetch_skycultures.py
"""
import json, pathlib, urllib.request

OUT = pathlib.Path(__file__).resolve().parent.parent / 'data'
UA = {'User-Agent': 'SpaceCommons-tools/1.0 (https://github.com/radix24/space-commons)'}
CULTURES = {'chinese': 'CC BY-SA 4.0', 'egyptian': 'GNU GPL v2.0', 'japanese': 'CC BY-SA 4.0', 'indian': 'CC BY-SA 4.0', 'hawaiian_starlines': 'CC BY-SA 4.0', 'maori': 'CC BY-SA 4.0', 'norse': 'CC BY-SA 4.0', 'mongolian': 'CC BY-SA 4.0', 'tibetan': 'CC BY-SA 4.0', 'inuit': 'GNU GPL v2.0', 'navajo': 'GNU GPL v2.0', 'aztec': 'GNU GPL v2.0'}  # only licences that allow adapted redistribution (no -ND)
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
    + ''.join(f'data/culture-{k}.json is derived from the Stellarium "{k}" sky culture, licensed {l}.\n' for k, l in CULTURES.items() if k not in ('chinese', 'egyptian')) +
    'Source: https://github.com/Stellarium/stellarium/tree/master/skycultures . All remain under their licences and are loaded by the app as separate data.\n', encoding='utf8')
