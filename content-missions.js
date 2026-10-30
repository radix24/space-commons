// Korean satellites, planetary orbiters and landing sites.

// Korean satellites: NORAD id -> Korean name (others keep their CelesTrak name). TLEs: data/korea.tle (tools/fetch_korea_orbiters.py).
export const KR_SATS = {
  22077: '우리별 1호', 22828: '우리별 2호', 23639: '무궁화 1호', 25756: '우리별 3호', 26032: '아리랑 1호', 27945: '과학기술위성 1호',
  29268: '아리랑 2호', 29349: '무궁화 5호', 36744: '천리안 1호', 37265: '무궁화 6호', 38338: '아리랑 3호', 39227: '아리랑 5호',
  39422: '과학기술위성 3호', 40536: '아리랑 3A호', 42691: '무궁화 7호', 42984: '무궁화 5A호', 43811: '차세대소형위성 1호',
  43823: '천리안 2A호', 45246: '천리안 2B호', 45920: '무궁화 116호', 47932: '차세대중형위성 1호', 52894: '누리호 성능검증위성',
  52895: '누리호 위성모사체', 56743: '차세대소형위성 2호', 56744: '도요샛 4호', 56745: '도요샛 2호', 58463: '425 정찰위성 1호',
  58500: '두리샛', 59452: '425 정찰위성 2호', 59587: '네온샛 1호', 61910: '무궁화 6A호', 62377: '425 정찰위성 3호',
  63630: '425 정찰위성 4호', 66293: '425 정찰위성 5호', 66655: '차세대중형위성 3호', 66771: '경기샛 1호', 66820: '아리랑 7호',
  67614: '네온샛 1A호', 68989: '부산샛', 69013: '차세대중형위성 2호', 69869: '차세대중형위성 4호', 100950: '경기샛 2A호',
  100955: '네온샛 2호', 100961: '네온샛 3호', 100962: '네온샛 4호', 100963: '네온샛 5호', 100967: '대전샛', 100968: '네온샛 6호',
};

// Orbiters around the Moon and Mars. Orbit: one JPL state vector (data/orbiters.json) propagated as a Kepler orbit.
export const ORBITERS = [
  { name: 'Danuri', ko: '다누리 (KPLO)', center: 'Moon', size: 3.5, launch: 2022, korea: true, note: '한국 최초의 달 탐사선. 2022년 12월부터 달 상공 약 100 km의 극궤도를 돌며 달 표면을 관측합니다.' },
  { name: 'LRO', ko: '달 정찰 궤도선 (LRO)', model: 'lro', center: 'Moon', size: 7, launch: 2009, note: 'NASA. 2009년부터 달 전체를 고해상도로 지도화하고 있습니다.' },
  { name: 'Chandrayaan-2', ko: '찬드라얀 2호 궤도선', center: 'Moon', size: 5, launch: 2019, note: '인도 ISRO의 달 궤도선. 찬드라얀 3호 착륙선과의 통신 중계도 맡았습니다.' },
  { name: 'CAPSTONE', ko: '캡스톤', center: 'Moon', size: 1, launch: 2022, note: 'NASA 초소형 위성. 아르테미스 계획의 달 근직선 헤일로 궤도(NRHO)를 처음 시험했습니다. 2026년 7월 자료 기준.' },
  { name: 'MRO', ko: '화성 정찰 궤도선 (MRO)', model: 'mro', center: 'Mars', size: 7, launch: 2005, note: 'NASA. 고해상도 카메라 HiRISE로 화성 표면과 착륙선들을 촬영합니다.' },
  { name: 'MAVEN', ko: '메이븐', center: 'Mars', size: 6, launch: 2013, note: 'NASA 화성 대기 탐사선. 2025년 12월 교신이 끊겼습니다. 2026년 1월 자료의 마지막 궤도를 표시합니다.' },
  { name: 'Mars Odyssey', ko: '마스 오디세이', center: 'Mars', size: 4, launch: 2001, note: 'NASA. 가장 오래 운용 중인 화성 궤도선입니다.' },
  { name: 'Mars Express', ko: '마스 익스프레스', center: 'Mars', size: 6, launch: 2003, note: 'ESA의 첫 화성 탐사선입니다.' },
  { name: 'TGO', ko: '엑소마스 TGO', center: 'Mars', size: 9, launch: 2016, note: 'ESA·러시아. 화성 대기의 미량 기체(메탄 등)를 측정합니다.' },
  { name: 'Hope', ko: '아말 (희망호)', center: 'Mars', size: 4, launch: 2020, note: '아랍에미리트의 화성 기상 관측 궤도선입니다.' },
];

// Landing / impact sites. lat, lon: planetocentric degrees, east longitude. model: NASA model key (loaded when you fly there).
export const SITES = [
  { body: 'Moon', name: 'Apollo 11', ko: '아폴로 11호', lat: 0.674, lon: 23.473, date: '1969-07-20', model: 'apollo-lm', size: 4.5, note: '사람이 처음으로 달에 내린 곳 (고요의 바다)' },
  { body: 'Moon', name: 'Apollo 12', ko: '아폴로 12호', lat: -3.012, lon: -23.422, date: '1969-11-19', model: 'apollo-lm', size: 4.5, note: '서베이어 3호 근처에 정밀 착륙' },
  { body: 'Moon', name: 'Apollo 14', ko: '아폴로 14호', lat: -3.645, lon: -17.471, date: '1971-02-05', model: 'apollo-lm', size: 4.5, note: '프라 마우로 고지' },
  { body: 'Moon', name: 'Apollo 15', ko: '아폴로 15호', lat: 26.132, lon: 3.634, date: '1971-07-30', model: 'apollo-lm', size: 4.5, note: '월면차를 처음 사용' },
  { body: 'Moon', name: 'Apollo 16', ko: '아폴로 16호', lat: -8.973, lon: 15.500, date: '1972-04-21', model: 'apollo-lm', size: 4.5, note: '데카르트 고지' },
  { body: 'Moon', name: 'Apollo 17', ko: '아폴로 17호', lat: 20.191, lon: 30.772, date: '1972-12-11', model: 'apollo-lm', size: 4.5, note: '지금까지 마지막 유인 달 착륙' },
  { body: 'Moon', name: 'Luna 9', ko: '루나 9호', lat: 7.08, lon: -64.37, date: '1966-02-03', size: 1, note: '처음으로 달에 연착륙한 탐사선 (소련)' },
  { body: 'Moon', name: 'Chang-e 3', ko: '창어 3호 · 옥토끼', lat: 44.12, lon: -19.51, date: '2013-12-14', size: 2, note: '중국 첫 달 착륙선과 탐사차' },
  { body: 'Moon', name: 'Chang-e 4', ko: '창어 4호 · 옥토끼 2호', lat: -45.44, lon: 177.60, date: '2019-01-03', size: 2, note: '처음으로 달의 뒷면에 착륙' },
  { body: 'Moon', name: 'Chang-e 5', ko: '창어 5호', lat: 43.06, lon: -51.92, date: '2020-12-01', size: 2, note: '달 시료를 지구로 가져옴' },
  { body: 'Moon', name: 'Chang-e 6', ko: '창어 6호', lat: -41.64, lon: -153.99, date: '2024-06-01', size: 2, note: '처음으로 달 뒷면 시료를 가져옴' },
  { body: 'Moon', name: 'Chandrayaan-3', ko: '찬드라얀 3호 · 비크람', lat: -69.37, lon: 32.32, date: '2023-08-23', size: 2, note: '달 남극 부근 첫 착륙 (인도)' },
  { body: 'Moon', name: 'SLIM', ko: 'SLIM', lat: -13.32, lon: 25.25, date: '2024-01-19', size: 1.5, note: '일본 첫 달 착륙, 목표 지점 100 m 이내 정밀 착륙' },
  { body: 'Moon', name: 'IM-1 Odysseus', ko: '오디세우스 (IM-1)', lat: -80.13, lon: 1.44, date: '2024-02-22', size: 2, note: '민간 기업의 첫 달 착륙' },
  { body: 'Moon', name: 'Blue Ghost 1', ko: '블루 고스트 1호', lat: 18.56, lon: 61.81, date: '2025-03-02', size: 2, note: '민간 기업의 첫 완전 성공 달 착륙' },
  { body: 'Mars', name: 'Viking 1', ko: '바이킹 1호', lat: 22.27, lon: -47.95, date: '1976-07-20', model: 'viking', size: 2, note: '화성 표면에서 처음으로 장기간 운용된 착륙선' },
  { body: 'Mars', name: 'Viking 2', ko: '바이킹 2호', lat: 47.64, lon: 134.29, date: '1976-09-03', model: 'viking', size: 2, note: '유토피아 평원' },
  { body: 'Mars', name: 'Mars Pathfinder', ko: '마스 패스파인더 · 소저너', lat: 19.13, lon: -33.22, date: '1997-07-04', size: 1.5, note: '첫 화성 탐사차 소저너' },
  { body: 'Mars', name: 'Spirit', ko: '스피릿', lat: -14.57, lon: 175.47, date: '2004-01-04', model: 'mer', size: 1.6, note: '구세프 충돌구, 6년 넘게 운용' },
  { body: 'Mars', name: 'Opportunity', ko: '오퍼튜니티', lat: -1.95, lon: -5.53, date: '2004-01-25', model: 'mer', size: 1.6, note: '14년 동안 45 km 넘게 주행' },
  { body: 'Mars', name: 'Phoenix', ko: '피닉스', lat: 68.22, lon: -125.70, date: '2008-05-25', size: 2.5, note: '화성 북극 지역에서 얼음을 확인' },
  { body: 'Mars', name: 'Curiosity', ko: '큐리오시티', lat: -4.59, lon: 137.44, date: '2012-08-06', model: 'perseverance', size: 1.8, note: '게일 충돌구의 샤프 산을 오르며 운용 중' },
  { body: 'Mars', name: 'InSight', ko: '인사이트', lat: 4.50, lon: 135.62, date: '2018-11-26', size: 3, note: '화성 지진(화진)을 처음 측정' },
  { body: 'Mars', name: 'Perseverance', ko: '퍼서비어런스', lat: 18.44, lon: 77.45, date: '2021-02-18', model: 'perseverance', size: 1.8, note: '예제로 충돌구에서 시료를 모으며 운용 중. 헬기 인저뉴어티와 함께 착륙' },
  { body: 'Mars', name: 'Zhurong', ko: '주룽 (톈원 1호)', lat: 25.07, lon: 109.93, date: '2021-05-15', size: 1.5, note: '중국 첫 화성 탐사차' },
  { body: 'Venus', name: 'Venera 7', ko: '베네라 7호', lat: -5, lon: 351, date: '1970-12-15', size: 1, note: '다른 행성 표면에서 처음으로 신호를 보낸 탐사선' },
  { body: 'Venus', name: 'Venera 9', ko: '베네라 9호', lat: 31.01, lon: 291.64, date: '1975-10-22', size: 1.5, note: '금성 표면 사진을 처음 전송' },
  { body: 'Venus', name: 'Venera 13', ko: '베네라 13호', lat: -7.5, lon: 303.0, date: '1982-03-01', size: 1.5, note: '첫 컬러 사진과 토양 분석, 127분 동안 작동' },
  { body: 'Venus', name: 'Venera 14', ko: '베네라 14호', lat: -13.25, lon: 310.0, date: '1982-03-05', size: 1.5, note: '베네라 13호의 쌍둥이' },
  { body: 'Venus', name: 'Vega 1', ko: '베가 1호', lat: 7.2, lon: 177.8, date: '1985-06-11', size: 1.5, note: '착륙선과 함께 대기 기구를 띄움' },
  { body: 'Venus', name: 'Vega 2', ko: '베가 2호', lat: -7.14, lon: 177.67, date: '1985-06-15', size: 1.5, note: '지금까지 마지막 금성 착륙' },
  { body: 'Mercury', name: 'MESSENGER', ko: '메신저 충돌 지점', lat: 54.4, lon: 210.1, date: '2015-04-30', size: 1.5, note: '4년 동안 수성 궤도를 돈 뒤 계획대로 표면에 충돌' },
];
