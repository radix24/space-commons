"""One step for every update: bump the version, refresh the offline cache, and write the notes in two places.

  python tools/release.py "한 줄 요약" "바뀐 점 1" "바뀐 점 2" ...

What it does:
  version.js    next letter (Alpha 0.0.12s -> 0.0.12t; after z the middle number goes up and the letter starts at a)
  sw.js         cache name +1, so browsers drop the old offline copy
  README.md     updates the version line at the top and adds a row at the top of the "버전 기록" table (version | summary)
  CHANGELOG.md  adds a dated section at the top with the summary and every bullet
Options: --version "Alpha 0.1.0a" sets the version instead of the next letter; --dry prints without writing.
Then commit as usual; the commit message can reuse the summary.
"""
import datetime, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
args = sys.argv[1:]
dry = '--dry' in args; args = [a for a in args if a != '--dry']
forced = None
if '--version' in args: i = args.index('--version'); forced = args[i + 1]; del args[i:i + 2]
if not args: sys.exit(__doc__)
summary, items = args[0].strip(), [a.strip() for a in args[1:] if a.strip()]

def read(p): return (ROOT / p).read_text(encoding='utf8')
def write(p, s):
    if dry: print(f'--- {p}\n{s[:600]}\n'); return
    (ROOT / p).write_text(s, encoding='utf8', newline='\n')

vj = read('version.js'); cur = re.search(r"Alpha (\d+)\.(\d+)\.(\d+)([a-z])", vj)
if forced: new = forced
else:
    a, b, c, l = int(cur[1]), int(cur[2]), int(cur[3]), cur[4]
    new = f'Alpha {a}.{b}.{c}{chr(ord(l) + 1)}' if l != 'z' else f'Alpha {a}.{b}.{c + 1}a'
short = new.replace('Alpha ', '')
write('version.js', vj.replace(cur[0], new, 1))

sw = read('sw.js'); m = re.search(r"space-commons-v(\d+)", sw)
write('sw.js', sw.replace(m[0], f'space-commons-v{int(m[1]) + 1}', 1))

rd = re.sub(r'\| 버전 \| Alpha [0-9.]+[a-z] \|', f'| 버전 | {new} |', read('README.md'), count=1)  # the version line at the top
h = rd.index('## 버전 기록'); t = rd.index('|---|---|', h) + len('|---|---|')
row = f"\n| {short} | {summary.replace('|', '/')} |"
write('README.md', rd[:t] + row + rd[t:])

cl = ROOT / 'CHANGELOG.md'
head = '# 업데이트 노트\n\nSpace Commons의 버전별 변경 내용입니다. 새 버전이 위에 옵니다. 버전 번호는 기능 묶음 하나를 마칠 때마다 마지막 글자를 올립니다.\n'
body = cl.read_text(encoding='utf8')[len(head):] if cl.exists() else ''
sec = f"\n## {short} · {datetime.date.today().isoformat()}\n\n{summary}\n" + (''.join(f'\n- {x}' for x in items) + '\n' if items else '')
write('CHANGELOG.md', head + sec + body)
print(f'{cur[0]} -> {new}, sw v{int(m[1]) + 1}, README row and CHANGELOG section added' + (' (dry run)' if dry else ''))
