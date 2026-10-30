// E4: a timeline of astronomy in Korea; where it applies, a button puts the sky back to that night (date, place, direction, the object)
// Dates of events before 1582 are given in the proleptic Gregorian calendar used by the app.
const SEOUL = [37.57, 126.98], GYEONGJU = [35.835, 129.219];
export const HISTORY = [
  { y: '4~5세기', t: '고구려 고분 벽화의 별자리', d: '덕흥리 고분(408년) 같은 고구려 무덤 천장에는 해와 달, 북두칠성과 견우·직녀가 그려져 있습니다. 하늘을 땅 위의 질서와 함께 보던 생각이 담겨 있습니다.' },
  { y: '7세기', t: '첨성대', d: '신라 선덕여왕 때(재위 632~647년) 경주에 세운 돌 구조물로, 남아 있는 동아시아 천문 관측 시설 가운데 가장 오래된 것으로 꼽힙니다. 쓰임새를 두고는 관측대라는 설과 상징물이라는 설이 함께 있습니다.',
    sky: { date: '0640-06-21T20:30:00+08:37', at: GYEONGJU, az: 180, alt: 40, fov: 100, note: '경주의 여름 저녁 남쪽 하늘' } },
  { y: '1395', t: '천상열차분야지도 각석', d: '조선 태조 4년, 고구려 때의 천문도 탁본을 바탕으로 돌에 새긴 별 지도입니다. 1,467개의 별과 별자리, 28수가 담겼습니다. 앱에서 "한국 전통 별자리"를 고르고 별자리 그림을 켜면 이 지도를 하늘에 겹쳐 볼 수 있습니다.',
    sky: { date: '1395-12-01T21:00:00+08:28', at: SEOUL, az: 0, alt: 45, fov: 110, culture: 'korean', note: '한양의 겨울 밤, 북쪽 하늘과 한국 전통 별자리' } },
  { y: '1433~1438', t: '세종의 천문 기구', d: '세종 때 혼천의(1433), 해시계 앙부일구(1434), 밤낮 시각을 재는 일성정시의(1437), 물시계 자격루(1434)를 만들고, 경복궁에 간의대를 세웠습니다.' },
  { y: '1442', t: '칠정산 내편', d: '해와 달, 다섯 행성(칠정)의 위치를 한양을 기준으로 계산하는 역법서입니다. 중국 역법을 그대로 쓰지 않고 우리 위치에 맞게 고쳐 일식과 월식을 예보할 수 있게 되었습니다.' },
  { y: '1572', t: '조선왕조실록의 객성: 티코 초신성', d: '선조 5년(1572년 11월) 실록에 왕량성(카시오페이아자리) 근처에 객성이 나타났다는 기록이 있습니다. 유럽에서 티코 브라헤가 관측한 바로 그 초신성(SN 1572)입니다.',
    sky: { date: '1572-11-20T19:00:00+08:28', at: SEOUL, az: 20, alt: 60, fov: 80, target: { name: '티코 초신성 (SN 1572)', ra: 6.33, dec: 64.14, mag: -4, note: '최대 밝기 약 −4등급으로 낮에도 보였습니다. 지금은 X선으로 빛나는 잔해만 남았습니다.' } } },
  { y: '1604', t: '조선왕조실록의 객성: 케플러 초신성', d: '선조 37년(1604년 10월) 미수(전갈자리 꼬리) 근처에 객성이 나타나 여러 달 관측했다는 기록이 남아 있습니다. 케플러가 유럽에서 관측한 우리 은하의 마지막 맨눈 초신성(SN 1604)이며, 조선의 기록은 밝기 변화를 날마다 적어 오늘날 연구에도 쓰입니다.',
    sky: { date: '1604-10-20T18:45:00+08:28', at: SEOUL, az: 230, alt: 15, fov: 70, target: { name: '케플러 초신성 (SN 1604)', ra: 262.675, dec: -21.487, mag: -2.5, note: '최대 밝기 약 −2.5등급. 저녁 남서쪽 하늘, 목성과 토성 가까이에 나타났습니다.' } } },
  { y: '1759', t: '성변측후단자의 핼리 혜성', d: '영조 35년(1759년) 관상감은 핼리 혜성을 매일 관측해 위치와 꼬리 길이를 기록했습니다(성변측후단자). 핼리가 예측한 혜성의 귀환을 동아시아에서 정밀하게 남긴 기록입니다.',
    sky: { date: '1759-04-01T04:30:00+08:28', at: SEOUL, az: 120, alt: 10, fov: 90, planet: 'Halley', note: '새벽 동남쪽 하늘의 핼리 혜성' } },
  { y: '1910', t: '근대 천문학의 시작', d: '대한제국 말기부터 일제 강점기에 근대 기상·천문 관측이 시작되었고, 1974년 국립천문대(지금의 한국천문연구원)가 세워졌습니다.' },
  { y: '2022', t: '다누리, 한국의 첫 달 탐사선', d: '2022년 8월 발사되어 12월 달 궤도에 들어갔습니다. 섀도캠으로 달 극지방의 영구 음영 지역을 찍고 있습니다. 우주 모드에서 다누리를 검색해 보세요.' },
];
let root = null;
export function openHistory(api) {
  if (!root) { root = document.createElement('div'); root.className = 'cc-root'; document.body.append(root); root.onclick = (e) => { if (e.target === root) root.hidden = true; }; }
  root.innerHTML = '<div class="cc-win"><div class="cc-head"><b>한국 천문학의 역사</b><span class="small">기록과 유물, 그리고 그날의 하늘</span><button class="cc-x">×</button></div><ol class="hist"></ol></div>';
  root.querySelector('.cc-x').onclick = () => root.hidden = true;
  const ol = root.querySelector('.hist');
  for (const e of HISTORY) { const li = document.createElement('li'); li.innerHTML = `<span class="hist-y">${e.y}</span><div><b>${e.t}</b><p>${e.d}</p></div>`;
    if (e.sky) { const b = document.createElement('button'); b.textContent = `그날의 하늘 보기${e.sky.note ? ' · ' + e.sky.note : e.sky.target ? ' · ' + e.sky.target.name : ''}`; b.onclick = () => { root.hidden = true; api.goTo(e.sky); }; li.querySelector('div').append(b); }
    ol.append(li); }
  root.hidden = false;
}
