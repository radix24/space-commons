// "A universe for everyone": the sandbox library grouped by what people want to do (행성계 만들기, 실험해 보기, 궤도 배우기, 과제 풀기, 저장·공유),
// about five primary actions per group with the rest behind "더 보기", everyday names for jargon (the term kept in brackets, explained in its tooltip),
// and an on-demand tutorial (도움말·튜토리얼) that highlights the real controls. Nothing here starts by itself.
import { tr } from './i18n.js';

// lab and scenario names in everyday Korean; the technical term stays in brackets
export const RENAME = {
  '활력 방정식 (vis-viva)': '거리와 빠르기의 관계 (활력 방정식)', '호만 전이 (지구→화성)': '연료를 아끼는 화성 가는 길 (호만 전이)', '발사 시기와 포크찹': '언제 떠나면 좋을까 (발사 시기 그림)',
  '플라이바이 설계': '행성 곁을 지나며 빨라지기 (스윙바이)', '임무 설계 (여러 행성 경유)': '여러 행성 들르기 (임무 설계)', '라그랑주점과 트로이': '함께 도는 특별한 자리 (라그랑주점)',
  '케플러 2법칙: 같은 시간, 같은 넓이': '가까울 때 빨라지기 (케플러 2법칙)', '케플러 3법칙: 주기와 거리': '멀수록 느리게 돌기 (케플러 3법칙)', '원 궤도와 탈출 속도': '돌기와 떠나기 (탈출 속도)',
  '블랙홀의 빛 휘어짐': '블랙홀이 빛을 휘게 하기', '충돌 파편의 물리': '부딪힌 조각은 어디로', '은하의 적색편이 재기': '은하가 멀어지는 빠르기 재기', '가이아로 그린 H-R도': '별의 밝기와 색 지도 (H-R도)',
  '로슈 한계와 고리': '위성이 부서져 고리가 되기 (로슈 한계)', '조석 고정과 조석 가열 (이오)': '한쪽 면만 보이는 위성 (조석 고정)', '쌍성의 질량 이동과 신성': '별에서 별로 흐르는 가스 (신성)',
};
const GROUPS = [['make', '행성계 만들기'], ['scen', '실험해 보기'], ['learn', '궤도 배우기'], ['task', '과제 풀기'], ['save', '저장·공유'], ['view', '화면 설정']];
const TASKS = ['임무 모드 (목표 달성형 과제)', '누리호 발사 실습', '한국 위성 궤도 설계 실습'];

let A = null;
export function initGroups(api) {
  A = api; const R = A.root, q = (s) => R.querySelector(s), tabs = q('.sb-tabs'), drawer = q('.sb-drawer'); if (!tabs || !drawer) return;
  // renames (the original label is kept for tooltips and search)
  for (const b of R.querySelectorAll('.sb-labrow > button:first-child, .sb-scenbtn b')) { const t = b.textContent.trim(); if (RENAME[t]) { b.dataset.orig = t; b.textContent = RENAME[t]; } }
  // two new groups
  const mk = (id) => { const d = A.el('div', 'sb-tab'); d.dataset.tab = id; d.hidden = true; q('.sb-tab[data-tab=view]').before(d); return d; };
  const task = mk('task'), save = mk('save');
  task.append(A.el('h3', '', '과제 풀기'), A.el('div', 'small sb-sub', '목표가 있는 도전 과제입니다. 성공하면 바로 알려 줍니다.'));
  for (const t of TASKS) { const row = [...R.querySelectorAll('.sb-labrow')].find(r => r.textContent.includes(t)); if (row) task.append(row); }
  const quizRow = A.el('div', 'sb-labrow'); quizRow.append(A.btn('확인 문제 풀기 (테라포밍)', () => R.querySelector('[data-q=terra-mars]')?.click())); task.append(quizRow);
  save.append(A.el('h3', '', '저장·공유'), A.el('div', 'small sb-sub', '지금 장면을 저장하거나 링크로 친구에게 보냅니다.'));
  const line = q('.sb-save')?.parentElement; if (line) { line.previousElementSibling?.tagName === 'H3' && line.previousElementSibling.remove(); save.append(line); }
  const rec = q('.sb-recbtn'); if (rec) save.append(rec);
  // tab buttons in the new order and names; the two new ones need the same open/close behaviour as the others
  const btns = {}; for (const b of tabs.querySelectorAll('button')) btns[b.dataset.tab] = b;
  for (const [id, name] of GROUPS) { let b = btns[id]; if (!b) { b = A.el('button', '', name); b.dataset.tab = id; b.onclick = () => openTab(b); } b.textContent = name; tabs.append(b); }
  btns.view?.classList.add('sb-tabminor');
  // at most about five primary actions per group; the rest behind "더 보기"
  const fold = (parent, items, keep) => { if (items.length <= keep) return; const d = A.el('details', 'sb-more'); d.append(A.el('summary', '', '더 보기')); items[keep].before(d); for (const x of items.slice(keep)) d.append(x); };
  const quick = q('.sb-quick'); if (quick) { const li = [...quick.children]; if (li.length > 5) { const d = A.el('details', 'sb-more'); d.append(A.el('summary', '', '더 보기')); const ol = A.el('ol', 'sb-quick'); d.append(ol); quick.after(d); for (const x of li.slice(5)) ol.append(x); } }
  const make = q('.sb-tab[data-tab=make]'); if (make) { const rest = [...make.children].filter(x => x !== quick && !x.classList.contains('sb-more') && !(x.tagName === 'H3' && x.textContent === '바로 해 보기')); if (rest.length) { const d = A.el('details', 'sb-more'); d.append(A.el('summary', '', '더 보기: 천체 더하기, 고리, 소행성대')); make.append(d); for (const x of rest) d.append(x); } }
  const sc = q('.sb-scens'); if (sc) fold(sc, [...sc.children], 5);
  const labs = q('.sb-labs'); if (labs) { const kids = [...labs.children], cut = kids.findIndex((x, i) => i > 0 && x.classList.contains('sb-level') && /3단계/.test(x.textContent)); if (cut > 0) fold(labs, kids, cut); }
  // searching opens every "더 보기" so matches are not hidden
  q('.sb-find')?.addEventListener('input', (e) => { for (const d of R.querySelectorAll('.sb-more')) d.open = !!e.target.value.trim() || d.dataset.user === '1'; });
  // tutorial button at the bottom of the rail
  const help = A.el('button', 'sb-helpbtn', '도움말·튜토리얼'); help.onclick = () => tutorial(0); q('.sb-rail')?.append(help);
}
function openTab(b) { const R = A.root, open = !b.classList.contains('on');
  R.querySelectorAll('.sb-tabs button').forEach(x => x.classList.toggle('on', open && x === b)); R.querySelectorAll('.sb-tab').forEach(t => t.hidden = !open || t.dataset.tab !== b.dataset.tab); R.classList.toggle('drawer', open); }

// ---- tutorial: 5 short steps, each pointing at a real control ----
const STEPS = [
  ['.sb-dock [data-tool=play]', '시간 흐르게 하기', '이 버튼(또는 스페이스 키)으로 시간을 흐르게 하거나 멈춰요. 행성들이 태양 둘레를 도는 걸 볼 수 있어요.'],
  ['.sb-time', '시간 빠르기', '이 막대로 1초에 며칠이 흐를지 정해요. 오른쪽으로 갈수록 빨라져요.'],
  ['.sb-tabs', '하고 싶은 일 고르기', '행성계 만들기, 실험해 보기, 궤도 배우기, 과제 풀기, 저장·공유 중에서 골라요. 처음이라면 "실험해 보기"가 쉬워요.'],
  ['.sb-dock [data-tool=select]', '천체 고르기', '화면의 행성을 누르면 오른쪽에 정보 창이 열려요. 거기서 무게, 속도, 공기를 바꿔 볼 수 있어요.'],
  ['.sb-dock [data-tool=home]', '길을 잃었다면', '이 버튼(또는 Home 키)을 누르면 카메라가 처음 보던 자리로 돌아와요. 끌면 돌려 보고, 휠이나 두 손가락으로 크게 볼 수 있어요.'],
];
let tut = null;
export function tutorial(i) {
  const R = A.root; if (!tut) { tut = { hl: A.el('div', 'sb-tuthl'), card: A.el('div', 'sb-tutcard') }; R.append(tut.hl, tut.card); }
  if (i < 0 || i >= STEPS.length) { tut.hl.remove(); tut.card.remove(); tut = null; return; }
  const [sel, title, body] = STEPS[i], t = R.querySelector(sel), rr = R.getBoundingClientRect();
  tut.card.innerHTML = ''; tut.card.append(A.el('b', '', `${i + 1} / ${STEPS.length} · ${tr(title)}`), A.el('p', '', tr(body)));
  const row = A.el('div', 'sb-row'); if (i > 0) row.append(A.btn('이전', () => tutorial(i - 1))); row.append(A.btn(i + 1 < STEPS.length ? '다음' : '끝내기', () => tutorial(i + 1), 'sb-go'), A.btn('닫기', () => tutorial(-1))); tut.card.append(row);
  if (t) { const r = t.getBoundingClientRect(); Object.assign(tut.hl.style, { left: r.left - rr.left - 4 + 'px', top: r.top - rr.top - 4 + 'px', width: r.width + 8 + 'px', height: r.height + 8 + 'px' }); tut.hl.hidden = false;
    const w = Math.min(300, rr.width - 24); let x = r.right - rr.left + 12, y = r.top - rr.top; if (x + w > rr.width - 12) { x = Math.max(12, Math.min(rr.width - w - 12, r.left - rr.left)); y = r.top - rr.top - 150; if (y < 12) y = r.bottom - rr.top + 12; }
    Object.assign(tut.card.style, { left: x + 'px', top: Math.max(12, Math.min(y, rr.height - 170)) + 'px', width: w + 'px' }); }
  else tut.hl.hidden = true;
}
