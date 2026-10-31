// Plain-language layer over app.js: everyday names and a one-line description for every menu item, small explanation
// boxes (hover or long-press), short guided tutorials on demand, and a short "first look" path.
// Everything works on the existing element ids, so app.js keeps all its handlers.
import { EN, tr } from './i18n.js';
const $ = (id) => document.getElementById(id);
const T = (s) => (EN ? tr(s) : s);

// id: [new label (or null to keep), one-line description in easy words]
const ITEMS = {
  'tonight-btn': ['지금 보이는 것', '지금 이 하늘에 떠 있는 별과 행성을 모아 보여 줍니다.'],
  'today-btn': ['해와 달 뜨는 시각', '해와 달이 뜨고 지는 시각, 별 보기 좋은 시간을 알려 줍니다.'],
  'cal-btn': ['곧 일어날 하늘 일', '앞으로 석 달 동안의 일식, 유성우 같은 일을 날짜순으로 봅니다.'],
  'obs-btn': ['내가 고른 천체', '보고 싶은 천체를 모아 두고, 오늘 밤 순서를 정합니다.'],
  'gyro': ['휴대폰으로 하늘 비추기', '휴대폰을 하늘로 들면 그쪽 별이 화면에 나옵니다.'],
  'ar': ['카메라 화면에 이름 겹치기', '카메라로 본 하늘 위에 별과 행성 이름을 보여 줍니다.'],
  'night': ['붉은 화면 (밤눈 지키기)', '화면을 붉게 바꿔 어둠에 익숙해진 눈을 지킵니다.'],
  'exp-btn': ['별 궤적 사진 찍어 보기', '카메라를 오래 열어 두면 별이 원을 그리는 모습을 만들어 봅니다.'],
  'cine-btn': ['행성 차례로 둘러보기', '지구에서 명왕성까지 행성을 하나씩 자동으로 날아갑니다.'],
  'flyby-btn': ['탐사선이 지나간 순간', '탐사선이 행성 옆을 지나간 실제 장면을 다시 봅니다.'],
  'help-btn': ['사용법 따라 하기', '짧은 안내를 따라 하며 화면 쓰는 법을 익힙니다.'],
  'cards-btn': ['개념 카드로 알아보기', '그림을 움직여 보며 우주의 원리를 하나씩 배웁니다.'],
  'tour-btn': ['유명한 천체 구경', '꼭 봐야 할 천체를 차례로 보여 줍니다.'],
  'sizes-btn': ['크기 비교하기', '행성과 별의 실제 크기를 나란히 놓고 봅니다.'],
  'hist-btn': ['우리 조상의 하늘', '첨성대와 옛 기록 속 하늘을 그날의 별과 함께 봅니다.'],
  'share': ['지금 화면 링크 복사', '보고 있는 하늘을 그대로 여는 주소를 복사합니다.'],
  'shot': ['사진으로 저장', '지금 화면을 그림 파일로 저장합니다.'],
  'rec-btn': ['영상으로 녹화', '화면을 동영상으로 녹화해 저장합니다.'],
  'ls-btn': ['수업 링크 만들기', '질문을 붙인 하늘 화면을 학생에게 링크로 나눠 줍니다.'],
  'tourmk-btn': ['나만의 발표 만들기', '보여 줄 장면을 차례로 담아 발표처럼 재생합니다.'],
  'addon-btn': ['발표 파일 열기', '저장해 둔 발표나 천체 목록 파일을 불러옵니다.'],
  'lang': [null, '한국어와 영어 화면을 바꿉니다.'],
  'full': ['화면 가득 보기', '하늘을 화면 전체에 크게 보여 줍니다.'],
  'offline-btn': ['인터넷 없이 쓰기', '기본 자료를 이 기기에 받아 두어 인터넷 없이도 씁니다.'],
};
// short explanation boxes for the controls that stay on screen
const TIPS = {
  'search': '천체 이름을 적으면 그쪽으로 갑니다. 예: 달, 토성, 시리우스',
  '[data-mode=ground]': '내가 선 곳에서 올려다본 하늘입니다.',
  '[data-mode=space]': '우주로 나가 태양계와 은하를 날아다닙니다.',
  '[data-mode=sandbox]': '행성과 별을 직접 놓아 보는 실험실입니다.',
  'now': '시계를 지금 이 순간으로 돌려놓습니다.',
  'dt': '보고 싶은 날짜와 시각을 고릅니다.',
  'scrub': '좌우로 끌어 시간을 앞뒤로 빨리 돌립니다.',
  'place': '하늘을 볼 도시를 고릅니다.',
  'eyepiece': '쌍안경이나 망원경으로 볼 때 보이는 크기를 원으로 보여 줍니다.',
  'bortle': '도시 불빛이 얼마나 밝은지 고릅니다. 숫자가 클수록 별이 적게 보입니다.',
  'lp-auto': '위성 사진으로 이곳 불빛 밝기를 알아서 정합니다.',
  'geo-btn': '이 기기가 있는 곳을 관측 장소로 씁니다.',
  'wx-btn': '오늘 밤 구름과 날씨를 봅니다.',
  'sp-free': '켜면 키보드(W A S D)로 자유롭게 날고, 끄면 가까운 천체 둘레로 돌아옵니다.',
  'galaxy-btn': '우리 은하 바깥으로 나가 은하 전체를 내려다봅니다.',
  'light-btn': '고른 천체에서 빛이 퍼져 나가는 속도를 보여 줍니다.',
  'info-goto': '이 천체 쪽으로 가서 크게 봅니다.',
  'obs-add': '이 천체를 내 목록에 담습니다.',
  'log-add': '본 것을 관측 일기에 적어 둡니다.',
  'panel-toggle': '설정을 더 보거나 접습니다.',
};
const SPEED_TIP = { '-3600': '1초에 1시간씩 시간을 거꾸로 돌립니다.', '-60': '1초에 1분씩 시간을 거꾸로 돌립니다.', '1': '시간이 실제와 같은 빠르기로 흐릅니다.',
  '60': '1초에 1분씩 시간을 빨리 돌립니다.', '3600': '1초에 1시간씩 시간을 빨리 돌립니다.', '86400': '1초에 하루씩 시간을 빨리 돌립니다.', '0': '시간을 멈춥니다.' };

function apply() {
  for (const [id, [name, desc]] of Object.entries(ITEMS)) { const b = $(id); if (!b) continue;
    if (name) b.textContent = T(name); b.dataset.desc = T(desc); b.removeAttribute('title'); }
  for (const [sel, tip] of Object.entries(TIPS)) { const e = $(sel) || document.querySelector(sel); if (e) { e.dataset.tip = tip; e.removeAttribute('title'); } }
  for (const b of document.querySelectorAll('[data-speed]')) { b.dataset.tip = SPEED_TIP[b.dataset.speed] || ''; b.removeAttribute('title'); }
  // the remaining controls with a title: the title becomes the explanation box
  for (const e of document.querySelectorAll('#topbar [title], #panel [title], #info [title], .menu-pop [title]')) { if (!e.dataset.tip) e.dataset.tip = e.getAttribute('title'); e.removeAttribute('title'); }
  for (const l of document.querySelectorAll('#panel label')) { const i = l.querySelector('input,select'); if (i && !l.dataset.tip && i.dataset.tip) l.dataset.tip = i.dataset.tip; }
}

// ---------- explanation box: hover (desktop) or long-press (touch) ----------
const tip = document.createElement('div'); tip.id = 'ux-tip'; tip.hidden = true; tip.setAttribute('role', 'tooltip'); document.body.append(tip);
let tipT = 0, pressT = 0;
function showTip(el) { const s = el.dataset.tip || el.dataset.desc; if (!s) return; tip.textContent = T(s); tip.hidden = false;
  const r = el.getBoundingClientRect(), w = Math.min(260, innerWidth - 16); tip.style.maxWidth = w + 'px';
  const tw = tip.offsetWidth, th = tip.offsetHeight; let x = Math.max(8, Math.min(innerWidth - tw - 8, r.left + r.width / 2 - tw / 2)), y = r.bottom + 6;
  if (y + th > innerHeight - 8) y = r.top - th - 6; tip.style.left = x + 'px'; tip.style.top = Math.max(8, y) + 'px'; }
const hideTip = () => { clearTimeout(tipT); clearTimeout(pressT); tip.hidden = true; };
const tipTarget = (e) => e.target.closest?.('[data-tip], .menu-pop [data-desc]');
document.addEventListener('pointerover', (e) => { if (e.pointerType !== 'mouse') return; const el = tipTarget(e); if (!el) return; clearTimeout(tipT); tipT = setTimeout(() => showTip(el), 450); });
document.addEventListener('pointerout', (e) => { if (e.pointerType === 'mouse' && tipTarget(e)) hideTip(); });
document.addEventListener('pointerdown', (e) => { hideTip(); if (e.pointerType === 'mouse') return; const el = tipTarget(e); if (el) pressT = setTimeout(() => showTip(el), 500); });
document.addEventListener('pointerup', () => clearTimeout(pressT));
document.addEventListener('scroll', hideTip, true);
document.addEventListener('focusin', (e) => { const el = tipTarget(e); if (el && e.target.matches(':focus-visible')) showTip(el); });
document.addEventListener('focusout', hideTip);

// ---------- tutorials: short tours that point at the real control ----------
const click = (sel) => document.querySelector(sel)?.click();
const ground = () => { if (window.SC?.space) click('[data-mode=ground]'); };
const space = () => { if (!window.SC?.space) click('[data-mode=space]'); };
const search = (q) => { const s = $('search'); s.value = q; s.dispatchEvent(new Event('change')); };
const TOURS = {
  first: { name: '나는 처음이에요', steps: [
    { sel: '#c', t: '1. 지금 밤하늘', d: '이 화면은 지금 내가 선 곳의 하늘입니다. 화면을 끌면 둘러보고, 휠이나 두 손가락으로 크게 볼 수 있어요.', run: ground },
    { sel: '#info', t: '2. 달 찾기', d: '검색 칸에 "달"을 적으면 달로 갑니다. 지금 바로 찾아 드릴게요. 오른쪽 상자에 쉬운 설명이 나옵니다.', run: () => { ground(); search('달'); } },
    { sel: '#info', t: '3. 행성 찾기', d: '이번에는 목성입니다. 별처럼 보이지만 지구보다 11배 큰 행성이에요.', run: () => { ground(); search('목성'); } },
    { sel: '#c', t: '4. 토성으로 날아가기', d: '우주로 나가 토성 가까이 날아갑니다. 고리를 끌어서 돌려 보세요. "기본 시점"을 누르면 지구 옆으로 돌아옵니다.', run: () => { space(); setTimeout(() => window.SC?.goBody('Saturn'), 300); } },
  ] },
  look: { name: '하늘 둘러보기', steps: [
    { sel: '#c', t: '끌어서 둘러보기', d: '화면을 누른 채 끌면 고개를 돌리듯 하늘을 둘러봅니다.', run: ground },
    { sel: '#c', t: '크게 보기', d: '마우스 휠을 돌리거나 두 손가락을 벌리면 크게 보입니다.' },
    { sel: '#c', t: '눌러서 알아보기', d: '별이나 행성을 누르면 오른쪽에 쉬운 설명이 나옵니다. 두 번 누르면 그쪽으로 갑니다.' },
    { sel: '#panel .toggles', t: '보이는 것 고르기', d: '별자리 선, 이름, 땅을 켜고 끌 수 있습니다.' },
  ] },
  find: { name: '천체 찾기', steps: [
    { sel: '#search', t: '이름으로 찾기', d: '검색 칸에 "토성", "북극성", "M31"처럼 적고 고르면 그쪽으로 갑니다.', run: ground },
    { sel: '.menu-btn[data-menu="오늘 밤 볼 것"]', t: '지금 보이는 것', d: '"오늘 밤 볼 것" 안의 "지금 보이는 것"은 지금 떠 있는 천체를 모아 보여 줍니다.' },
    { sel: '#info', t: '설명 읽기', d: '고른 천체의 중요한 내용 몇 가지가 먼저 나오고, "자세히 보기"를 누르면 더 볼 수 있어요.', run: () => search('목성') },
  ] },
  fly: { name: '우주 여행', steps: [
    { sel: '[data-mode=space]', t: '우주로 나가기', d: '"우주"를 누르면 지구 옆 우주로 나갑니다.', run: space },
    { sel: '#sp-sun', t: '바로 가기 단추', d: '"지구로", "태양으로"를 누르면 그곳까지 날아갑니다. 다른 천체는 검색해서 "이동"을 누르세요.' },
    { sel: '#sp-home', t: '처음 자리로', d: '길을 잃으면 "기본 시점"(또는 Home 키)을 누르세요. 지구 옆으로 돌아옵니다.' },
    { sel: '#sp-free', t: '자유 비행', d: '켜면 W A S D 키로 우주선처럼 날고, 한 번 더 누르면 가까운 천체 둘레로 돌아옵니다.' },
  ] },
  time: { name: '시간 바꾸기', steps: [
    { sel: '#panel [data-speed="3600"]', t: '시간 빨리 돌리기', d: '이 단추를 누르면 1초에 1시간씩 흘러 별이 도는 모습을 볼 수 있습니다.', run: ground },
    { sel: '#scrub', t: '시간 끌기', d: '막대를 좌우로 끌면 시간을 앞뒤로 돌립니다.' },
    { sel: '#dt', t: '날짜 고르기', d: '생일이나 일식 날처럼 원하는 날짜와 시각을 고를 수 있어요.' },
    { sel: '#now', t: '지금으로', d: '"지금"을 누르면 원래 시각으로 돌아옵니다.' },
  ] },
};
let tourEl = null;
function endTour() { tourEl?.remove(); tourEl = null; document.querySelectorAll('.guide-hl').forEach(e => e.classList.remove('guide-hl')); }
function runTour(key, k = 0) {
  endTour(); const tour = TOURS[key], st = tour.steps[k]; if (!st) return;
  st.run?.();
  setTimeout(() => {
    tourEl = document.createElement('div'); tourEl.className = 'guide';
    tourEl.innerHTML = `<div class="guide-box"><div class="small ux-tname"></div><b></b><p></p><div class="row"><span class="small">${k + 1} / ${tour.steps.length}</span><button class="g-prev">이전</button><button class="g-skip">닫기</button><button class="g-next"></button></div></div>`;
    const box = tourEl.querySelector('.guide-box'); box.querySelector('.ux-tname').textContent = T(tour.name); box.querySelector('b').textContent = T(st.t); box.querySelector('p').textContent = T(st.d);
    box.querySelector('.g-next').textContent = T(k < tour.steps.length - 1 ? '다음' : '끝내기'); box.querySelector('.g-prev').hidden = !k;
    box.querySelector('.g-skip').textContent = T('닫기'); box.querySelector('.g-prev').textContent = T('이전');
    document.body.append(tourEl);
    const tgt = document.querySelector(st.sel), r = tgt && !tgt.hidden && tgt.getClientRects().length ? tgt.getBoundingClientRect() : null;
    if (r && st.sel !== '#c') { tgt.classList.add('guide-hl'); const bw = box.offsetWidth, bh = box.offsetHeight;
      let y = r.bottom + 10; if (y + bh > innerHeight - 8) y = Math.max(8, r.top - bh - 10);
      box.style.left = Math.max(8, Math.min(innerWidth - bw - 8, r.left)) + 'px'; box.style.top = y + 'px'; }
    else { box.style.left = Math.max(8, (innerWidth - box.offsetWidth) / 2) + 'px'; box.style.top = Math.round(innerHeight * 0.32) + 'px'; }
    box.querySelector('.g-next').onclick = () => k < tour.steps.length - 1 ? runTour(key, k + 1) : endTour();
    box.querySelector('.g-prev').onclick = () => runTour(key, k - 1); box.querySelector('.g-skip').onclick = endTour;
  }, st.run ? 900 : 0);
}
addEventListener('keydown', (e) => { if (e.key === 'Escape' && tourEl) endTour(); });
// the tutorial picker
function picker() {
  endTour(); tourEl = document.createElement('div'); tourEl.className = 'guide';
  tourEl.innerHTML = `<div class="guide-box ux-pick"><b></b><p class="small"></p><div class="ux-list"></div><div class="row"><button class="g-skip"></button></div></div>`;
  const box = tourEl.querySelector('.guide-box'); box.querySelector('b').textContent = T('도움말·튜토리얼'); box.querySelector('p').textContent = T('무엇을 해 보고 싶나요? 하나를 고르면 짧게 따라 해 봅니다.');
  const DESC = { first: '지금 하늘, 달과 목성 찾기, 토성으로 날아가기를 차례로 해 봅니다.', look: '끌기, 크게 보기, 눌러서 알아보기', find: '이름으로 찾고 설명을 읽는 법', fly: '우주로 나가 행성까지 날아가는 법', time: '시간을 빨리 돌리거나 날짜를 바꾸는 법' };
  for (const k of Object.keys(TOURS)) { const b = document.createElement('button'); b.textContent = T(TOURS[k].name); b.dataset.desc = T(DESC[k]); b.onclick = () => runTour(k); box.querySelector('.ux-list').append(b); }
  box.querySelector('.g-skip').textContent = T('닫기'); box.querySelector('.g-skip').onclick = endTour;
  document.body.append(tourEl); box.style.left = Math.max(8, (innerWidth - box.offsetWidth) / 2) + 'px'; box.style.top = Math.max(60, Math.round(innerHeight * 0.18)) + 'px';
}
window.scTutorial = picker;

// "나는 처음이에요": one button on the bar
{ const b = document.createElement('button'); b.id = 'first-btn'; b.textContent = T('나는 처음이에요'); b.dataset.tip = '처음이라면 여기부터. 가장 재미있는 세 가지를 차례로 보여 줍니다.'; b.onclick = () => runTour('first');
  const tools = $('tools'); tools?.prepend(b); }

// first visit: one small, dismissible hint (never a tour by itself)
function hint() {
  let seen = false; try { seen = !!localStorage.getItem('space-commons-hint'); } catch {}
  if (seen || location.hash.includes('lesson=') || document.body.classList.contains('embed') || document.body.classList.contains('sandbox')) return;
  const h = document.createElement('div'); h.id = 'ux-hint'; h.innerHTML = '<span></span><button class="go"></button><button class="x" aria-label="닫기">×</button>';
  h.querySelector('span').textContent = T('처음이세요? 짧은 안내 보기'); h.querySelector('.go').textContent = T('보기');
  const done = () => { h.remove(); try { localStorage.setItem('space-commons-hint', '1'); } catch {} };
  h.querySelector('.go').onclick = () => { done(); runTour('first'); }; h.querySelector('.x').onclick = done; document.body.append(h);
  setTimeout(() => h.isConnected && h.classList.add('fade'), 20000);
}

// ---------- info panel: a few plain facts first, the full table behind "자세히 보기", each term explained in one line ----------
const TERMS = {
  '적경': '하늘의 경도 같은 좌표', '적위': '하늘의 위도 같은 좌표', '겉보기 등급': '눈에 보이는 밝기. 숫자가 작을수록 밝아요', '등급': '밝기. 숫자가 작을수록 밝아요',
  '절대 등급': '모든 별을 같은 거리에 두었을 때의 밝기', '시직경': '하늘에서 보이는 크기 (각도)', '위상 (밝은 면)': '햇빛을 받아 밝게 보이는 부분의 비율',
  '이심률': '궤도가 얼마나 찌그러졌는지. 0이면 동그라미', '근일점': '태양에 가장 가까워지는 곳', '공전 주기': '태양을 한 바퀴 도는 데 걸리는 시간',
  '적색편이': '멀어지는 속도 때문에 빛이 붉게 늘어난 정도', '허블': '우주가 팽창하는 빠르기와 관련된 값', '방위': '북쪽에서 시계 방향으로 잰 방향',
  '고도': '지평선에서 잰 높이 (각도)', '위치각': '북쪽에서 동쪽으로 잰 방향 각도', 'B−V': '별의 색을 나타내는 수. 클수록 붉어요', 'HIP': '히파르코스 위성 별 목록 번호',
  '모천체': '이 유성우를 만든 혜성이나 소행성', '시간당': '한 시간에 볼 수 있는 수', '극대': '가장 많이 보이는 때', '대기를 거친 밝기': '공기를 지나며 조금 어두워진 밝기',
  '반지름': '중심에서 표면까지의 길이', 'AU': '지구와 태양 사이 거리 (약 1억 5천만 km)', '광년': '빛이 1년 동안 가는 거리',
};
const BRIEF = ['설명', '지구로부터 거리', '지구로부터', '거리', '태양으로부터', '반지름', '크기', '겉보기 등급', '별자리', '지금'];
const termOf = (k) => Object.keys(TERMS).find(t => k === t || k.startsWith(t));
let busy = false;
function briefInfo() {
  const t = $('info-table'); if (!t || busy) return; busy = true;
  try {
    let brief = $('info-brief'); if (!brief) { brief = document.createElement('ul'); brief.id = 'info-brief'; t.before(brief);
      const d = document.createElement('details'); d.id = 'info-more'; const s = document.createElement('summary'); s.textContent = T('자세히 보기'); d.append(s); brief.after(d); d.append(t); }
    brief.innerHTML = ''; const rows = [...t.rows], picked = [];
    for (const key of BRIEF) { const r = rows.find(r => !picked.includes(r) && r.cells[0]?.textContent.startsWith(EN ? tr(key) : key)); if (r) picked.push(r); if (picked.length >= 4) break; }
    for (const r of rows) { if (picked.length >= 3) break; if (!picked.includes(r)) picked.push(r); }
    for (const r of picked.slice(0, 4)) { const li = document.createElement('li'), k = (r.cells[0]?.firstChild?.textContent || '').trim(), v = r.cells[1]?.textContent || '', term = termOf(k);
      const kk = document.createElement('span'); kk.className = 'k'; kk.textContent = k; if (term) { const e = document.createElement('small'); e.textContent = T(TERMS[term]); kk.append(e); } const vv = document.createElement('span'); vv.className = 'v'; vv.textContent = v; li.append(kk, vv); brief.append(li); }
    for (const r of rows) { const c = r.cells[0]; if (!c || c.querySelector('.term')) continue; const term = termOf((c.firstChild?.textContent || '').trim()); if (!term) continue;
      const e = document.createElement('div'); e.className = 'term'; e.textContent = T(TERMS[term]); c.append(e); }
    $('info-more').hidden = rows.length <= picked.length;
  } finally { busy = false; }
}
function watchInfo() { const t = $('info-table'); if (!t) return; new MutationObserver(() => { if (!busy) queueMicrotask(briefInfo); }).observe(t, { childList: true, subtree: true }); }

apply(); watchInfo();
const ready = () => document.body.classList.contains('ready');
(function wait() { if (ready()) { apply(); setTimeout(hint, 1500); } else setTimeout(wait, 500); })();
