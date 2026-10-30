"""Extra sky data: Korean traditional constellations, asteroid belt / Kuiper belt orbits.

data/korean-constellations.json : Stellarium "korean" sky culture (Cheonsang Yeolcha Bunyajido), GNU GPL v2.0
                                  -> kept as a separate data file with its licence (data/LICENSE-korean-constellations.txt).
data/asteroids.json             : osculating elements of numbered asteroids brighter than H=13.6 and all TNOs with H<8 (JPL SBDB).
                                  JPL's API does not allow browser requests (no CORS), so this is fetched here.
Run: python tools/fetch_sky_extras.py
"""
import json, pathlib, urllib.parse, urllib.request

OUT = pathlib.Path(__file__).resolve().parent.parent / 'data'
get = lambda u: urllib.request.urlopen(u, timeout=300).read().decode()

# ---- Korean sky culture: keep names (native/english/pronunciation) and star lines (HIP numbers) ----
src = json.loads(get('https://raw.githubusercontent.com/Stellarium/stellarium/master/skycultures/korean/index.json'))
cons = [{'id': c['id'], 'ko': c['common_name'].get('native', ''), 'en': c['common_name'].get('english', ''), 'ro': c['common_name'].get('pronounce', ''),
         'lines': c['lines']} for c in src['constellations'] if c.get('lines')]
mans = src.get('lunar_system', {})
(OUT / 'korean-constellations.json').write_text(json.dumps({'source': 'Stellarium sky culture "korean" (GNU GPL v2.0)', 'constellations': cons,
  'mansions': {'stars': mans.get('defining_stars', []), 'names': mans.get('names', [])}}, ensure_ascii=False, separators=(',', ':')), encoding='utf8')
(OUT / 'LICENSE-korean-constellations.txt').write_text(
  'data/korean-constellations.json is derived from the Stellarium "korean" sky culture\n'
  '(https://github.com/Stellarium/stellarium/tree/master/skycultures/korean),\n'
  'distributed under the GNU General Public License v2.0 (https://www.gnu.org/licenses/old-licenses/gpl-2.0.html).\n'
  'It remains under that licence; it is loaded by the app as separate data.\n', encoding='utf8')
print(len(cons), 'Korean constellations')

# ---- asteroids ----
def query(extra):
    q = {'fields': 'a,e,i,om,w,ma,epoch,H', 'sb-ns': 'n', 'full-prec': 'false', **extra}
    return json.loads(get('https://ssd-api.jpl.nasa.gov/sbdb_query.api?' + urllib.parse.urlencode(q)))['data']
belt = query({'sb-kind': 'a', 'sb-cdata': json.dumps({'AND': ['H|LT|13.6', 'a|LT|6']})})
tno = query({'sb-kind': 'a', 'sb-cdata': json.dumps({'AND': ['a|GT|30', 'H|LT|9']})})
rows = []
for r in belt + tno:
    try: rows.append([round(float(x), 4) for x in r[:6]] + [round(float(r[6]), 1)])
    except (TypeError, ValueError): pass
(OUT / 'asteroids.json').write_text(json.dumps({'fields': 'a,e,i,om,w,ma,epoch', 'rows': rows}, separators=(',', ':')))
print(len(belt), 'belt +', len(tno), 'TNO ->', (OUT / 'asteroids.json').stat().st_size // 1024, 'KB')
