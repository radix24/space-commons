// Small explanation boxes for the sandbox rail and library buttons: one plain sentence on hover (or a long press on touch),
// with a "자세히" toggle for a little more. Written for middle-school readers. English lives in i18n-sandbox.js (PH_SB).
// Also the default view: a "기본 시점" rail button and the Home key move the camera back with a short, smooth transition, ecliptic up.
import { tr } from './i18n.js';

// button label (as written on the button) -> [one short sentence, a little more]
export const TIPS = {
  '고르기': ['천체를 눌러 고르면 정보를 볼 수 있어요.', '고른 천체의 질량, 속도, 대기를 오른쪽 창에서 바꿀 수 있어요.'],
  '놓기': ['화면을 눌러 새 천체를 놓아요.', '"원 궤도로 놓기"가 켜져 있으면 가장 세게 끌어당기는 천체 둘레를 저절로 돌아요.'],
  '던지기': ['눌렀다 끌어서 탐사선을 던져요.', '끄는 길이가 길수록 빠르게 날아가요. 점선은 앞으로 갈 길이에요.'],
  '자': ['두 천체를 차례로 눌러 거리를 재요.', '거리는 AU(지구와 태양 사이 거리)로 나와요.'],
  '소행성대': ['화성과 목성 사이에 작은 돌 수만 개를 뿌려요.', '시간을 오래 흘리면 목성 때문에 빈 줄(커크우드 간극)이 생겨요.'],
  '재생': ['시간을 흐르게 하거나 멈춰요.', '아래 막대로 1초에 며칠이 흐를지 정할 수 있어요.'],
  '처음으로': ['실험하기 전 처음 상태로 돌아가요.', '천체의 위치, 속도, 대기까지 처음 값으로 되돌려요.'],
  '기본 시점': ['카메라를 처음 보던 자리로 되돌려요.', '키보드의 Home 키로도 돼요. 궤도면(황도)이 위아래 기준이 돼요.'],
  '행성계 만들기': ['천체를 놓고 바꾸며 나만의 행성계를 만들어요.', '자주 쓰는 실험 다섯 개가 먼저 보이고, 나머지는 "더 보기"에 있어요.'],
  '실험해 보기': ['"만약에" 실험을 골라 바로 시작해요.', '태양이 사라지면? 목성이 별이라면? 같은 장면이 준비되어 있어요.'],
  '궤도 배우기': ['쉬운 것부터 차례로 궤도를 배워요.', '관찰, 측정, 계산, 설계 순서예요. 어려운 단계는 "더 보기"에 있어요.'],
  '과제 풀기': ['목표가 있는 도전 과제를 풀어요.', '정해진 연료 안에서 화성까지 가기, 누리호를 궤도에 올리기 같은 과제예요.'],
  '저장·공유': ['장면을 저장하거나 링크로 보내요.', '저장한 장면은 이 브라우저에 남고, JSON 파일로 주고받을 수 있어요.'],
  '화면 설정': ['화면에 무엇을 보일지 정해요.', '궤적, 이름, 온도 같은 표시를 켜고 끌 수 있어요.'],
  '도움말·튜토리얼': ['기본 사용법을 다섯 단계로 알려 줘요.', '실제 버튼을 하나씩 짚어 가며 설명해요. 언제든 닫을 수 있어요.'],
  '만들기': ['천체를 놓고, 바꾸고, 장면을 저장하는 곳이에요.', '빠른 실험 버튼으로 태양을 없애거나 행성을 옮겨 볼 수 있어요.'],
  '시나리오': ['준비된 "만약에" 실험을 골라요.', '태양이 사라지면? 목성이 별이라면? 같은 장면이 바로 시작돼요.'],
  '궤도 실습': ['단계별 궤도 실습과 과제를 골라요.', '관찰, 측정, 계산, 설계 순서로 조금씩 어려워져요.'],
  '보기': ['화면에 무엇을 보일지 정해요.', '궤적, 이름, 온도, 생명 가능 지대 같은 표시를 켜고 끌 수 있어요.'],
  '태양을 블랙홀로 바꾸기': ['태양을 같은 무게의 블랙홀로 바꿔요.', '무게가 같으면 행성 궤도는 그대로예요. 빛과 열만 사라져요.'],
  '태양 없애기': ['태양을 없애 봐요.', '행성들은 붙잡는 힘을 잃고 그때의 속도로 곧게 날아가요.'],
  '목성을 별로 키우기': ['목성을 작은 별로 키워요.', '태양이 두 개인 쌍성계가 되어 다른 행성 궤도가 흔들려요.'],
  '지구를 금성 자리로': ['지구를 금성 거리로 옮겨요.', '햇빛이 거의 두 배라 지구가 얼마나 더워지는지 볼 수 있어요.'],
  '화성에 1기압 공기': ['화성에 지구 같은 공기를 줘요.', '공기가 두꺼워지면 기온이 어떻게 바뀌는지 볼 수 있어요.'],
  '달 없애기': ['달을 없애 봐요.', '지구가 혼자 태양을 돌게 돼요.'],
  '새 행성계 만들기': ['새로운 행성계를 아무렇게나 만들어요.', '어떤 행성계는 오래 버티고, 어떤 행성계는 금방 흐트러져요.'],
  '화성 테라포밍': ['화성을 사람이 살 만한 곳으로 바꾸는 단계를 따라가요.', '따뜻해지는 것, 물이 생기는 것, 숨 쉴 수 있는 것은 서로 다른 조건이에요.'],
  '금성 테라포밍': ['너무 뜨거운 금성을 식히는 단계를 따라가요.', '햇빛 가리개, 이산화탄소 줄이기, 물 만들기 순서로 진행해요.'],
  '화면을 눌러 놓기': ['화면을 눌러 고른 천체를 놓아요.', '위의 그림에서 놓을 천체 종류를 골라요.'],
  '끌어서 던지기': ['끌어서 탐사선을 던져요.', '방향과 빠르기를 끄는 길이로 정해요.'],
  '소행성대 3만 개': ['소행성 3만 개를 뿌려요.', '그래픽 카드로 빠르게 계산해요.'],
  '고른 행성에 고리': ['고른 행성 둘레에 작은 알갱이 고리를 만들어요.', '점선(로슈 한계) 안쪽 알갱이는 뭉쳐서 위성이 되지 못해요.'],
  '저장': ['지금 장면을 이 브라우저에 저장해요.', '다음에 와서 "저장한 장면"에서 다시 열 수 있어요.'],
  '링크로 공유': ['지금 장면을 링크로 만들어 복사해요.', '링크를 연 친구도 같은 장면에서 시작해요.'],
  '장면 갤러리': ['장면에 이름과 설명을 붙여 모아 둬요.', '처음 조건과 설정도 함께 저장하고, JSON 파일로 주고받을 수 있어요.'],
  '개념 카드 68개 열기': ['궤도와 별에 관한 개념 카드를 열어요.', '카드마다 그림과 확인 문제가 있어요.'],
  '실습 기록지': ['실습에서 저장한 기록을 봐요.', '파일로 내보내 다른 기기에서 불러올 수 있어요.'],
  // scenarios
  '태양이 사라진다면': ['태양이 갑자기 없어지면 어떻게 될까요?', '행성들은 그 순간의 방향으로 곧게 날아가요.'],
  '태양이 블랙홀이라면': ['태양이 같은 무게의 블랙홀이 되면?', '궤도는 그대로지만 빛과 열이 사라져요.'],
  '태양 질량 2배': ['태양이 두 배 무거워지면?', '행성들이 더 빨리, 더 안쪽으로 돌아요.'],
  '태양 질량 절반': ['태양이 절반으로 가벼워지면?', '바깥 행성들은 붙잡히지 못하고 떠나요.'],
  '목성이 별이었다면': ['목성이 작은 별이라면?', '쌍성계가 되어 안쪽 행성 궤도가 흔들려요.'],
  '목성 질량 10배': ['목성이 열 배 무거워지면?', '이웃 행성들의 궤도가 천천히 흐트러져요.'],
  '떠돌이 별이 지나간다면': ['다른 별이 태양계 곁을 지나가면?', '바깥쪽 천체들이 흔들리거나 끌려가요.'],
  '블랙홀이 지나간다면': ['블랙홀이 태양계를 스쳐 가면?', '가까이 지나간 행성은 궤도가 크게 바뀌어요.'],
  '쌍성 둘레 행성': ['별 두 개를 함께 도는 행성을 봐요.', '너무 가까운 행성은 튕겨 나가고, 먼 행성은 안정해요.'],
  '달의 탄생: 거대 충돌': ['큰 천체가 지구에 부딪혀 달이 생기는 장면이에요.', '튀어 나간 조각이 원반을 만들고 모여서 달이 돼요.'],
  '소행성대와 목성': ['목성이 소행성대에 빈 줄을 만드는 걸 봐요.', '1,000년쯤 흘려 보내면 커크우드 간극이 보여요.'],
  '로슈 한계와 고리': ['위성이 행성에 너무 가까이 가면 부서져요.', '부서진 조각은 퍼져서 고리가 돼요.'],
  '초신성: 15 태양질량 별': ['무거운 별이 폭발하는 장면이에요.', '폭발 뒤 아주 작고 무거운 중성자별이 남아요.'],
  '초신성: 30 태양질량 별': ['더 무거운 별이 폭발하는 장면이에요.', '폭발 뒤 블랙홀이 남아요. 경계 질량은 대략값이에요.'],
  '쌍성의 질량 이동과 신성': ['가까운 두 별 사이로 가스가 흘러가요.', '가스가 짝별 둘레에 원반을 만들고, 쌓이면 신성으로 번쩍여요.'],
  '조석 고정과 조석 가열 (이오)': ['위성의 자전이 느려져 한쪽 면만 보이게 돼요.', '찌그러진 궤도 때문에 위성 속이 데워져요. 이오가 그래서 화산이 많아요.'],
  // labs
  '행성들의 빠르기 비교': ['어느 행성이 가장 빨리 도는지 봐요.', '태양에 가까울수록 빨리 돌아요.'],
  '태양 질량을 바꾸면?': ['태양 무게를 바꾸면 행성이 어떻게 될까요?', '무거우면 빨리, 가벼우면 느리게 돌아요.'],
  '케플러 2법칙: 같은 시간, 같은 넓이': ['같은 시간 동안 쓸고 가는 넓이를 재요.', '태양에 가까울 때 빨라지고 멀 때 느려져요.'],
  '케플러 3법칙: 주기와 거리': ['도는 시간과 거리의 관계를 찾아요.', '주기의 제곱은 거리의 세제곱에 비례해요.'],
  '목성의 질량 재기': ['위성의 움직임으로 목성의 무게를 재요.', '갈릴레이가 본 네 위성을 써요.'],
  '원 궤도와 탈출 속도': ['던지는 빠르기에 따라 궤도 모양이 바뀌어요.', '빠르기가 어느 이상이면 다시 돌아오지 않아요.'],
  '활력 방정식 (vis-viva)': ['거리와 궤도 크기로 빠르기를 구해요.', '궤도 위 어디서든 쓸 수 있는 식이에요.'],
  '호만 전이 (지구→화성)': ['연료를 가장 적게 써서 화성에 가요.', '두 번 분사해서 궤도를 옮겨요.'],
  '발사 시기와 포크찹': ['언제 출발하면 연료가 덜 드는지 찾아요.', '그림에서 색이 옅은 곳이 좋은 출발 날짜예요.'],
  '플라이바이 설계': ['행성 곁을 지나며 속도를 얻어요.', '행성 뒤로 지나가면 빨라져요.'],
  '임무 설계 (여러 행성 경유)': ['여러 행성을 차례로 들르는 길을 짜요.', '보이저처럼 행성의 도움을 받아 멀리 가요.'],
  '라그랑주점과 트로이': ['두 천체와 함께 도는 특별한 자리를 찾아요.', 'L4, L5에는 소행성들이 모여 있어요.'],
  '지구 둘레 궤도 설계': ['위성 궤도를 정하고 지나가는 길을 봐요.', '높이와 기울기에 따라 지상 궤적이 달라져요.'],
  '로켓 발사부터 궤도까지': ['로켓을 쏘아 궤도에 올려요.', '살짝 기울이면 중력이 알아서 눕혀 줘요.'],
  '태양의 일생': ['태양이 나이 들며 어떻게 변하는지 봐요.', '적색거성이 되었다가 백색왜성으로 남아요.'],
  '블랙홀의 빛 휘어짐': ['블랙홀이 빛을 휘게 하는 걸 봐요.', '뒤의 별이 고리나 두 개의 상으로 보여요.'],
  '은하 충돌': ['두 은하가 스쳐 지나가는 걸 봐요.', '별끼리는 거의 부딪히지 않고 긴 꼬리가 생겨요.'],
  '충돌 파편의 물리': ['천체가 부딪힐 때 파편이 어떻게 퍼지는지 봐요.', '비스듬히 부딪히면 원반이 생겨요.'],
  'TESS로 외계 행성 찾기': ['별빛이 살짝 어두워지는 것으로 행성을 찾아요.', '실제 TESS 망원경 자료를 써요.'],
  '은하의 적색편이 재기': ['은하가 얼마나 빨리 멀어지는지 재요.', '빛의 색이 붉은 쪽으로 밀린 정도를 봐요.'],
  '가이아로 그린 H-R도': ['별의 밝기와 색으로 그림을 그려요.', '가이아 위성이 잰 진짜 별 6,000개를 써요.'],
  '임무 모드 (목표 달성형 과제)': ['정해진 연료 안에서 목표를 이루는 과제예요.', '성공과 실패를 바로 알려 줘요. 선생님이 새 과제를 링크로 만들 수 있어요.'],
  '다양한 궤도 사례': ['실제 임무에 쓰이는 여러 궤도를 봐요.', '헤일로, 말굽, 몰니야, 자유 귀환 궤도 등이 있어요.'],
  '한국 위성 궤도 설계 실습': ['아리랑과 천리안 같은 궤도를 직접 설계해요.', '내 설계를 실제 위성과 비교해요.'],
  '누리호 발사 실습': ['누리호를 쏘아 목표 궤도에 올려요.', '연소 시간과 방향을 바꿔 가며 550 km 원 궤도를 노려요.'],
  '계절과 바다 (자전축·자전 주기)': ['자전축 기울기와 바다가 계절을 어떻게 바꾸는지 봐요.', '바다가 많으면 온도가 천천히 바뀌어요.'],
  '무엇이 달라졌나 (전후 비교)': ['실험 전과 후를 막대그래프로 비교해요.', '궤도 크기, 찌그러짐, 주기, 온도를 나란히 보여 줘요.'],
};

let A = null, box = null, timer = 0, cur = null;
export function initHelp(api) {
  A = api; box = A.el('div', 'sb-tip'); box.hidden = true; A.root.append(box);
  box.addEventListener('mouseenter', () => clearTimeout(timer)); box.addEventListener('mouseleave', () => hideSoon());
  const attach = () => { for (const b of A.root.querySelectorAll('.sb-dock button, .sb-tabs button, .sb-scenbtn, .sb-labrow > button:first-child, .sb-quick button, .sb-tab .sb-line button, .sb-bigcard, .sb-recbtn, .sb-helpbtn')) wire(b); };
  attach(); setTimeout(attach, 0);
  // the default view
  const dock = A.root.querySelector('.sb-dock'); if (dock) { const hb = A.el('button', '', '<b>기본 시점</b><span>Home</span>'); hb.dataset.tool = 'home'; hb.title = ''; hb.onclick = homeView; dock.append(hb); wire(hb); }
  addEventListener('keydown', (e) => { if (e.key !== 'Home' || !document.body.classList.contains('sandbox') || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return; e.preventDefault(); homeView(); });
}
const label = (b) => (b.querySelector('b')?.dataset.orig || b.dataset.orig || b.querySelector('b')?.textContent || b.textContent).trim();
function wire(b) {
  if (b.dataset.tipped) return; const t = TIPS[label(b)] || (b.classList.contains('sb-scenbtn') ? [b.querySelector('span')?.textContent || '', ''] : null); if (!t || !t[0]) return;
  b.dataset.tipped = 1; if (b.title) { b.dataset.tipTitle = b.title; b.removeAttribute('title'); }
  b.addEventListener('mouseenter', () => { clearTimeout(timer); timer = setTimeout(() => show(b, t), 350); });
  b.addEventListener('mouseleave', hideSoon);
  let lp = 0; b.addEventListener('touchstart', () => { lp = setTimeout(() => show(b, t), 500); }, { passive: true });
  for (const ev of ['touchend', 'touchmove', 'touchcancel']) b.addEventListener(ev, () => clearTimeout(lp), { passive: true });
}
function hideSoon() { clearTimeout(timer); timer = setTimeout(() => { box.hidden = true; cur = null; }, 250); }
function show(b, [simple, more]) {
  cur = b; box.innerHTML = ''; box.append(A.el('div', '', tr(simple)));
  if (more) { const d = A.el('details'); d.append(A.el('summary', '', tr('자세히')), A.el('div', 'small', tr(more))); box.append(d); }
  box.hidden = false; const r = b.getBoundingClientRect(), R = A.root.getBoundingClientRect(), w = Math.min(260, R.width - 16);
  box.style.width = w + 'px'; let x = r.right - R.left + 8, y = r.top - R.top; if (x + w > R.width - 8) { x = Math.max(8, r.left - R.left); y = r.bottom - R.top + 6; }
  box.style.transform = `translate(${x}px, ${Math.min(y, R.height - 120)}px)`;
}

// ---- default view: the main star (or the first body) from above at an angle, sized to the scene, ecliptic up ----
const anim = { on: false, t: 0, p0: null, p1: null, q0: null, q1: null, u0: null, focus: null };
export function homeView() {
  const B = A.sim.bodies.filter(b => !b.dead && !b.test); if (!B.length) return;
  const c = B.filter(b => b.kind === 'star' || b.kind === 'bh').sort((a, b) => b.m - a.m)[0] || B.sort((a, b) => b.m - a.m)[0];
  let ext = 0; for (const b of B) if (b !== c) ext = Math.max(ext, Math.hypot(b.r[0] - c.r[0], b.r[1] - c.r[1], b.r[2] - c.r[2]));
  const d = Math.min(Math.max(ext > 0 ? ext * 1.6 : 4, 1e-4), 300), V = A.THREE.Vector3;
  anim.p0 = A.camera.position.clone(); anim.q0 = A.controls.target.clone(); anim.u0 = A.camera.up.clone();
  anim.q1 = new V(...c.r); anim.p1 = new V(c.r[0] + d * 0.25, c.r[1] - d * 0.8, c.r[2] + d * 0.55); anim.focus = c.name; anim.t = 0; anim.on = true; A.view.focus = null;
}
export function tickHelp(dt) {
  if (!anim.on) return; anim.t = Math.min(1, anim.t + dt / 0.6); const k = anim.t * anim.t * (3 - 2 * anim.t), c = A.byName(anim.focus);
  if (c) { anim.q1.set(c.r[0], c.r[1], c.r[2]); }
  A.controls.target.lerpVectors(anim.q0, anim.q1, k); A.camera.position.lerpVectors(anim.p0, c ? anim.p1.clone().add(anim.q1).sub(new A.THREE.Vector3(...(c ? c.r : [0, 0, 0]))) : anim.p1, k);
  A.camera.up.copy(anim.u0).lerp(new A.THREE.Vector3(0, 0, 1), k).normalize(); A.camera.lookAt(A.controls.target);
  if (anim.t >= 1) { anim.on = false; A.camera.up.set(0, 0, 1); A.view.focus = anim.focus; }
}
