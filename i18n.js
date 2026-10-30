// English version. Content gets real English text at startup; UI strings go through a phrase dictionary.
// Language: ?lang=en|ko, then the saved choice, then the browser language.
import { TOURS, FLYBY_INFO, ECLIPSES, SHOWERS } from './content.js';
import { ORBITERS, SITES } from './content-missions.js';

const q = new URLSearchParams(location.search).get('lang');
let saved = null; try { saved = localStorage.getItem('space-commons-lang'); } catch {}
export const LANG = (q === 'en' || q === 'ko') ? q : (saved === 'en' || saved === 'ko') ? saved
  : ((navigator.language || 'ko').toLowerCase().startsWith('ko') ? 'ko' : 'en');
export const EN = LANG === 'en';
export const LOCALE = EN ? 'en-US' : 'ko-KR';
export function setLang(l) { try { localStorage.setItem('space-commons-lang', l); } catch {} const u = new URL(location.href); u.searchParams.set('lang', l); location.href = u.toString(); }
document.documentElement.lang = LANG;

// ---------- names of solar-system bodies and spacecraft ----------
export const EN_NAMES = {
  Sun: 'Sun', Moon: 'Moon', Earth: 'Earth', Mercury: 'Mercury', Venus: 'Venus', Mars: 'Mars', Jupiter: 'Jupiter', Saturn: 'Saturn', Uranus: 'Uranus', Neptune: 'Neptune',
  Halley: "Halley's Comet", JWST: 'James Webb Space Telescope', Danuri: 'Danuri (KPLO)', LRO: 'Lunar Reconnaissance Orbiter', MRO: 'Mars Reconnaissance Orbiter',
  TGO: 'ExoMars Trace Gas Orbiter', Hope: 'Hope (Emirates Mars Mission)', 'Chandrayaan-2': 'Chandrayaan-2 Orbiter',
};
export const EN_NOTES = {
  'Voyager 1': 'The first spacecraft to leave the heliosphere and enter interstellar space, in 2012.',
  'Voyager 2': 'The only spacecraft to have visited Uranus and Neptune.',
  'New Horizons': 'Flew past Pluto in 2015 and the Kuiper Belt object Arrokoth in 2019.',
  'Pioneer 10': 'First close look at Jupiter. Contact ended in 2003.',
  'Pioneer 11': 'First close look at Saturn. Contact ended in 1995.',
  JWST: 'Infrared space telescope on a halo orbit around the Sun-Earth L2 point.',
  Juno: 'Polar orbiter studying Jupiter.',
  'Parker Solar Probe': 'The closest any human-made object has come to the Sun. About 190 km/s at perihelion.',
  'Solar Orbiter': 'ESA/NASA mission imaging the Sun\'s poles.',
  BepiColombo: 'ESA/JAXA Mercury mission. Arrives in Mercury orbit in late 2026.',
  Juice: 'ESA mission to Jupiter\'s icy moons. Arrives at Jupiter in 2031.',
  'Europa Clipper': 'NASA mission to Jupiter\'s moon Europa. Arrives at Jupiter in 2030.',
  Lucy: 'Tour of Jupiter\'s Trojan asteroids.',
  Psyche: 'Mission to the metal-rich asteroid Psyche. Arrives in 2029.',
  Danuri: 'Korea\'s first lunar mission. Since December 2022 it has orbited about 100 km above the Moon in a polar orbit.',
  LRO: 'NASA. Mapping the whole Moon in high resolution since 2009.',
  'Chandrayaan-2': 'ISRO lunar orbiter. Also relayed signals for the Chandrayaan-3 lander.',
  CAPSTONE: 'NASA CubeSat that first tested the near-rectilinear halo orbit planned for Artemis. Data as of July 2026.',
  MRO: 'NASA. Its HiRISE camera photographs the surface of Mars and the landers on it.',
  MAVEN: 'NASA Mars atmosphere mission. Contact was lost in December 2025; shown on its last known orbit (January 2026 data).',
  'Mars Odyssey': 'NASA. The longest-serving spacecraft at Mars.',
  'Mars Express': 'ESA\'s first mission to Mars.',
  TGO: 'ESA/Roscosmos. Measures trace gases such as methane in the Martian atmosphere.',
  Hope: 'United Arab Emirates orbiter studying Martian weather.',
};
const SITE_EN = {
  'Apollo 11': 'Where people first walked on the Moon (Sea of Tranquility)', 'Apollo 12': 'Pinpoint landing next to Surveyor 3', 'Apollo 14': 'Fra Mauro highlands',
  'Apollo 15': 'First use of the Lunar Roving Vehicle', 'Apollo 16': 'Descartes Highlands', 'Apollo 17': 'The last crewed Moon landing so far',
  'Luna 9': 'First soft landing on the Moon (USSR)', 'Chang-e 3': 'China\'s first lunar lander and rover', 'Chang-e 4': 'First landing on the far side of the Moon',
  'Chang-e 5': 'Returned lunar samples to Earth', 'Chang-e 6': 'First samples from the far side', 'Chandrayaan-3': 'First landing near the lunar south pole (India)',
  SLIM: 'Japan\'s first Moon landing, within 100 m of its target', 'IM-1 Odysseus': 'First commercial Moon landing', 'Blue Ghost 1': 'First fully successful commercial Moon landing',
  'Viking 1': 'The first long-lived lander on Mars', 'Viking 2': 'Utopia Planitia', 'Mars Pathfinder': 'Carried Sojourner, the first Mars rover',
  Spirit: 'Gusev crater; operated for over six years', Opportunity: 'Drove more than 45 km over 14 years', Phoenix: 'Confirmed water ice in the Martian arctic',
  Curiosity: 'Climbing Mount Sharp in Gale crater, still operating', InSight: 'First to measure marsquakes',
  Perseverance: 'Collecting samples in Jezero crater, still operating. Landed with the Ingenuity helicopter', Zhurong: 'China\'s first Mars rover (Tianwen-1)',
  'Venera 7': 'First spacecraft to transmit from the surface of another planet', 'Venera 9': 'First pictures from the surface of Venus',
  'Venera 13': 'First colour pictures and soil analysis; worked for 127 minutes', 'Venera 14': 'Twin of Venera 13', 'Vega 1': 'Also released an atmospheric balloon',
  'Vega 2': 'The most recent landing on Venus', MESSENGER: 'Orbited Mercury for four years, then impacted the surface as planned',
};
const FLYBY_EN = {
  'v1-jupiter': ['Voyager 1 · Jupiter', 'March 5, 1979. Passed about 350,000 km from Jupiter\'s centre and discovered volcanoes on Io.'],
  'v2-jupiter': ['Voyager 2 · Jupiter', 'July 9, 1979. Detailed views of Europa\'s icy surface and Jupiter\'s rings.'],
  'v1-saturn': ['Voyager 1 · Saturn', 'November 12, 1980. A close look at Titan, then out of the ecliptic toward interstellar space.'],
  'v2-saturn': ['Voyager 2 · Saturn', 'August 26, 1981. Saturn\'s gravity bent its path toward Uranus.'],
  'v2-uranus': ['Voyager 2 · Uranus', 'January 24, 1986. Still the only spacecraft to visit Uranus.'],
  'v2-neptune': ['Voyager 2 · Neptune', 'August 25, 1989. Skimmed about 4,500 km above Neptune\'s cloud tops, then on to Triton.'],
  'nh-jupiter': ['New Horizons · Jupiter', 'February 28, 2007. Jupiter\'s gravity cut about three years off the trip to Pluto.'],
  'nh-pluto': ['New Horizons · Pluto', 'July 14, 2015. Passed about 12,500 km above the surface and imaged the heart-shaped plain.'],
  'juno-joi': ['Juno · Jupiter orbit insertion', 'July 5, 2016. A 35-minute engine burn put Juno into a polar orbit.'],
  'psp-perihelion': ['Parker · closest approach', 'December 24, 2024. About 6.1 million km from the Sun\'s surface at about 190 km/s.'],
  'bepi-mercury': ['BepiColombo · Mercury', 'January 8, 2025. About 300 km above the surface, imaging permanently shadowed polar craters.'],
  'clipper-mars': ['Europa Clipper · Mars', 'March 1, 2025. About 900 km above Mars, using its gravity to reshape the orbit.'],
};
const TOUR_EN = {
  highlights: ['Highlights', ['The Andromeda Galaxy, 2.5 million light-years away: the most distant thing you can see with the naked eye.',
    'The Orion Nebula, a gas cloud about 1,300 light-years away where stars are still being born.',
    'The Hercules Cluster: hundreds of thousands of old stars packed into about 150 light-years.',
    'Out into space. The Sun holds 99.8% of the Solar System\'s mass.', 'Earth. Day, night and rotation match this very moment; city lights glow on the night side.',
    'The James Webb Space Telescope circles the L2 point about 1.5 million km from Earth.', 'Saturn. The tilt of its rings matches what we see from Earth right now.',
    'Voyager 1, the most distant human-made object. Its signal takes almost a day to reach us.']],
  solar: ['Around the Solar System', ['The Sun: 109 times Earth\'s diameter, with a surface at about 5,500 °C.', 'Mercury, closest to the Sun; day and night differ by about 600 °C.',
    'Venus. Its thick CO2 atmosphere makes it hotter than Mercury, about 465 °C.', 'Earth. The day/night line you see matches the real time.',
    'The Moon, on average 384,000 km away, always shows Earth the same face.', 'Mars, home of Olympus Mons, the tallest volcano in the Solar System (about 22 km).',
    'Ceres, the largest body in the asteroid belt and a dwarf planet.', 'Jupiter: 2.5 times the mass of all other planets combined. Its four large moons are in their real positions.',
    'Saturn. Its rings span about 270,000 km but are mostly only tens of metres thick.', 'Titan, Saturn\'s largest moon, with a thick nitrogen atmosphere and methane lakes.',
    'Uranus, tilted about 98 degrees: it rolls around the Sun on its side.', 'Neptune has the fastest winds in the Solar System, about 600 m/s.', 'Pluto, reclassified as a dwarf planet in 2006.']],
  winter: ['Winter night sky', ['Mid-January, 9 pm. Betelgeuse, the red supergiant on Orion\'s shoulder.', 'Rigel, the blue supergiant at Orion\'s foot. Compare its colour with Betelgeuse.',
    'The Orion Nebula, faintly visible to the naked eye in Orion\'s sword.', 'Sirius, the brightest star in the night sky, 8.6 light-years away.', 'Aldebaran, the red eye of Taurus.',
    'The Pleiades: an open cluster where 6 or 7 stars are visible to the naked eye.', 'Capella in Auriga, a yellow star that is really two pairs of stars.',
    'Pollux and Castor in Gemini. With Sirius, Procyon, Rigel, Aldebaran and Capella they make the Winter Hexagon.']],
  exo: ['Exoplanets', ['51 Pegasi: in 1995 the first planet found around a Sun-like star.', 'Proxima Centauri, the nearest star (4.2 light-years), with a planet in its habitable zone.',
    'TRAPPIST-1: seven Earth-sized planets, all well inside the orbit Mercury would have.', 'Kepler-452, with a planet in the habitable zone of a Sun-like star.',
    'TOI-700, a red dwarf with an Earth-sized planet in its habitable zone, found by TESS.', 'HR 8799, a system with four directly imaged planets.', 'PSR B1257+12: in 1992 the first confirmed exoplanets, orbiting a pulsar.']],
  probes: ['History of space probes', ['Pioneer 10 (1972): first through the asteroid belt and first close look at Jupiter.', 'Voyager 2 (1977): the only probe to visit Jupiter, Saturn, Uranus and Neptune.',
    'Voyager 1 (1977): entered interstellar space in 2012.', 'New Horizons (2006): Pluto in 2015, the Kuiper Belt object Arrokoth in 2019.', 'Juno (2011): polar orbits of Jupiter, studying its interior and aurorae.',
    'Parker Solar Probe (2018): about 6.1 million km from the Sun\'s surface, the fastest object ever built.', 'James Webb Space Telescope (2021): infrared views of the earliest galaxies.',
    'Europa Clipper (2024): on its way to Europa, which hides an ocean under its ice.']],
  deep: ['Galaxies and nebulae', ['The Andromeda Galaxy, a spiral larger than ours, expected to merge with the Milky Way in about 4.5 billion years.', 'The Triangulum Galaxy, third largest in the Local Group.',
    'The Whirlpool Galaxy, its spiral arms sharpened by a small companion.', 'The Sombrero Galaxy: an edge-on disc crossed by a dark dust lane.', 'The Crab Nebula, remnant of the supernova seen in 1054, with a pulsar at its heart.',
    'The Ring Nebula, a shell of gas thrown off by a dying star.', 'The Lagoon Nebula, a vast star-forming cloud.', 'The Eagle Nebula, famous for Hubble\'s "Pillars of Creation".']],
};
const ECL_EN = { '개기일식': 'Total solar eclipse', '금환일식': 'Annular solar eclipse', '부분월식': 'Partial lunar eclipse', '개기월식': 'Total lunar eclipse' };
const PLACE_EN = { '스페인 부르고스': 'Burgos, Spain', '아르헨티나 멘도사 부근': 'near Mendoza, Argentina', '이집트 룩소르': 'Luxor, Egypt', '에콰도르 과야킬 부근': 'near Guayaquil, Ecuador',
  '호주 시드니': 'Sydney, Australia', '일본 삿포로': 'Sapporo, Japan', '남아프리카공화국 중부': 'central South Africa', '미국 알래스카 우트키아빅': 'Utqiagvik, Alaska', '차드': 'Chad', '평양': 'Pyongyang' };

if (EN) { // content in English
  for (const t of TOURS) { const e = TOUR_EN[t.id]; if (e) { t.ko = e[0]; t.steps.forEach((s, i) => { if (e[1][i]) s.text = e[1][i]; }); } }
  for (const [k, v] of Object.entries(FLYBY_EN)) if (FLYBY_INFO[k]) { FLYBY_INFO[k].ko = v[0]; FLYBY_INFO[k].text = v[1]; }
  for (const e of ECLIPSES) { e.kind = ECL_EN[e.kind] || e.kind; if (e.place) e.place[2] = PLACE_EN[e.place[2]] || e.place[2]; }
  const PARENT_EN = { QUA: 'asteroid 2003 EH1', LYR: 'comet C/1861 G1 Thatcher', ETA: 'comet 1P/Halley', SDA: 'comet 96P/Machholz (probable)', CAP: 'comet 169P/NEAT',
    PER: 'comet 109P/Swift-Tuttle', DRA: 'comet 21P/Giacobini-Zinner', STA: 'comet 2P/Encke', ORI: 'comet 1P/Halley', NTA: 'comet 2P/Encke',
    LEO: 'comet 55P/Tempel-Tuttle', GEM: 'asteroid 3200 Phaethon', URS: 'comet 8P/Tuttle' };
  for (const sh of SHOWERS) { sh.ko = sh.en; sh.parent = PARENT_EN[sh.id] || sh.parent; }
  for (const o of ORBITERS) { o.ko = EN_NAMES[o.name] || o.name; o.note = EN_NOTES[o.name] || o.note; }
  for (const s of SITES) { s.ko = s.name.replace('Chang-e', "Chang'e"); s.note = SITE_EN[s.name] || s.note; }
}
export function englishBodies(PLANETS) { // planets, moons, probes: English names and notes
  if (!EN) return;
  for (const p of PLANETS) { p.ko = EN_NAMES[p.name] || p.name; if (EN_NOTES[p.name]) p.note = EN_NOTES[p.name]; if (p.small) p.small = { '왜행성': 'Dwarf planet', '소행성': 'Asteroid', '혜성 (1P)': 'Comet (1P)' }[p.small] || p.small; }
}

// ---------- UI phrases (longest first) ----------
const PH = [
  ['땅에서 올려다보고, 우주로 나아가는 모두의 하늘', 'A sky for everyone, from the ground up and out into space'],
  ['검색: M31, NGC 7000, Jupiter, Sirius…', 'Search: M31, NGC 7000, Jupiter, Sirius…'], ['카탈로그 불러오는 중…', 'Loading catalogues…'],
  ['우주를 당신에게 가져오는 중', 'Bringing the universe to you'], ['별 4만 1천 개를 하늘에 거는 중', 'Hanging 41,000 stars in the sky'],
  ['은하 1만 2천 개의 먼지를 터는 중', 'Dusting off 12,000 galaxies'], ['보이저 1호에게 안부를 묻는 중', 'Saying hello to Voyager 1'],
  ['달을 지구 쪽으로 돌려놓는 중', 'Turning the Moon to face Earth'], ['토성 고리를 닦는 중', 'Polishing Saturn\'s rings'],
  ['외계행성 6천 개의 주소를 확인하는 중', 'Checking the addresses of 6,000 exoplanets'], ['다누리와 교신하는 중', 'Talking to Danuri'],
  ['화성 탐사차를 깨우는 중', 'Waking up the Mars rovers'], ['은하수를 펼치는 중', 'Unrolling the Milky Way'],
  ['드래그: 회전 · 휠/핀치: 확대 · 클릭: 선택 · 더블클릭: 이동·확대', 'Drag: look around · Wheel/pinch: zoom · Click: select · Double-click: go to'],
  ['드래그: 공전/시점 · 휠: 거리 · W A S D / Q E: 이동 · Shift: 가속 · 더블클릭: 천체로 비행', 'Drag: orbit/look · Wheel: distance · W A S D / Q E: move · Shift: faster · Double-click: fly to'],
  ['탐사선은 너무 어두워 실제로는 보이지 않습니다. 위치만 표시합니다.', 'Spacecraft are far too faint to see; this only marks their positions.'],
  ['지평선 아래 (아래 표에서 다음 통과 시각을 확인하세요)', 'Below the horizon (see the next passes below)'],
  ['복사점이 높이 뜰수록, 하늘이 어두울수록 실제로 보이는 수가 많습니다', 'You see more meteors the higher the radiant and the darker the sky'],
  ['오늘 밤은 달빛이나 박명 때문에 완전히 어두운 시간이 없습니다', 'No fully dark time tonight because of moonlight or twilight'],
  ['관측하기 가장 좋은 시간 (해와 달이 모두 없음)', 'Best time to observe (no Sun, no Moon)'],
  ['낮 12시부터 24시간 · 시각은 이 기기의 시간대', '24 hours from noon · times in this device\'s time zone'],
  ['궤도 자료로 최근접 2시간 전부터 120배속으로 재생합니다', 'Replays real trajectories from 2 hours before closest approach at 120×'],
  ['앞으로 90일 · 누르면 그 순간으로 이동합니다', 'Next 90 days · tap to jump to that moment'],
  ['지평선 위 15° 이상에 밝은 천체가 없습니다', 'Nothing bright more than 15° above the horizon'],
  ['통과 예보는 지상 모드에서 볼 수 있습니다', 'Pass predictions are shown in Ground mode'],
  ['일 안에 10° 위로 지나가지 않습니다', ' days: no passes above 10°'], ['이 브라우저에만 저장됩니다', 'saved in this browser only'],
  ['천체 주위 공전', 'orbiting'], ['주위 공전', '· orbiting'], ['공전', 'orbit'], ['현재 화면 링크를 복사했습니다', 'Link to this view copied'], ['이 링크를 복사하세요', 'Copy this link'],
  ['이 시각의 위치 자료가 없습니다', 'no position data for this time'], ['우주 모드에서 볼 수 있습니다', 'visible in Space mode'], ['우주 모드에서 볼 수 있음', 'Visible in Space mode'],
  ['받는 중 · 지금 맨눈으로 보일 수 있음', 'in sunlight · may be visible to the naked eye now'], ['지금은 하늘이 밝습니다', 'the sky is bright now'],
  ['보틀 척도: 1 아주 어두운 하늘 ~ 9 도심', 'Bortle scale: 1 darkest sky ~ 9 inner city'], ['해가 떠 있을 때 하늘을 어떻게 보여 줄지', 'How to show the sky while the Sun is up'],
  ['지평선 근처의 굴절과 소광', 'Refraction and extinction near the horizon'], ['눈의 암순응을 지키는 붉은 화면 (N)', 'Red screen that keeps your night vision (N)'],
  ['휴대폰을 하늘에 비추면 그 방향을 보여 줍니다', 'Point your phone at the sky to see that direction'], ['탐사선이 행성을 지나간 순간을 실제 궤도로 재생', 'Replay real spacecraft encounters'],
  ['일출·일몰, 박명, 달, 관측하기 좋은 시간 (Y)', 'Sunrise/sunset, twilight, Moon, best viewing time (Y)'], ['앞으로 90일의 천문 현상', 'Sky events for the next 90 days'],
  ['지금 볼 수 있는 천체 (T)', 'What you can see now (T)'], ['주요 천체를 차례로 둘러봅니다', 'Guided tours of the sky'], ['지금 보는 화면의 링크 복사', 'Copy a link to this view'],
  ['실제 낮 하늘 (별 안 보임)', 'Real daytime sky (no stars)'], ['천문 박명 끝 (완전히 어두워짐)', 'End of astronomical twilight (fully dark)'],
  ['충 (밤새 보이고 가장 밝음)', 'at opposition (up all night, brightest)'], ['지금 하늘에 보이는 천체', 'Visible in the sky now'], ['달이 떠 있는 곳 어디서나', 'anywhere the Moon is up'],
  ['다가오는 일식·월식', 'Upcoming eclipses'], ['광공해 1 · 최상의 암흑', 'Light pollution 1 · pristine dark'], ['아타카마 (칠레)', 'Atacama (Chile)'], ['마우나케아 (하와이)', 'Mauna Kea (Hawaii)'],
  ['시골과 교외 사이', 'rural/suburban'], ['아주 어두운 산골', 'very dark rural'], ['쌍안경 7×50 (7°)', 'Binoculars 7×50 (7°)'], ['쌍안경 15×70 (2.6°)', 'Binoculars 15×70 (2.6°)'],
  ['80mm 굴절 · 25mm 접안 (1.6°)', '80 mm refractor · 25 mm eyepiece (1.6°)'], ['200mm 돕소니안 · 25mm (0.82°)', '200 mm Dobsonian · 25 mm (0.82°)'],
  ['200mm 돕소니안 · 10mm (0.33°)', '200 mm Dobsonian · 10 mm (0.33°)'], ['200mm · 4mm 고배율 (0.12°)', '200 mm · 4 mm high power (0.12°)'],
  ['1초에 1시간씩 거꾸로', '1 hour per second, backwards'], ['1초에 1분씩 거꾸로', '1 minute per second, backwards'], ['1초에 1시간씩', '1 hour per second'], ['1초에 1분씩', '1 minute per second'], ['1초에 하루씩', '1 day per second'],
  ['외계행성계 · 행성', 'Planetary system · planets:'], ['개 · NASA Exoplanet Archive', ' · NASA Exoplanet Archive'], ['착륙 지점으로 비행', 'Fly to landing site'], ['탐사선으로 비행', 'Fly to spacecraft'],
  ['관측 목록에 담기', 'Add to observing list'], ['목록에서 빼기', 'Remove from list'], ['위키백과에서 더 보기', 'More on Wikipedia'], ['영어 위키백과에서 더 보기', 'More on Wikipedia'],
  ['궤도선 · JPL 궤도로 계산', 'orbiter · orbit from JPL'], ['탐사선 · 위치: JPL Horizons', 'Spacecraft · position: JPL Horizons'], ['궤도: JPL SBDB', 'orbit: JPL SBDB'], ['궤도: CelesTrak', 'orbit: CelesTrak'],
  ['의 위성 · 위치 근사', ' moon · approximate position'], ['한국 인공위성', 'Korean satellite'], ['인공위성', 'Satellites'], ['다음 통과 (10° 이상)', 'Next passes (above 10°)'],
  ['별자리 · IAU 약자', 'Constellation · IAU'], ['유성우 · ', 'Meteor shower · '], ['시간당 유성 수 (ZHR)', 'Hourly rate (ZHR)'], ['시간당 최대 약', 'up to about'], ['활동 중 · 극대', 'active · peak'],
  ['별의 겉보기 등급', 'Star magnitude'], ['별의 표면 온도', 'Star temperature'], ['별의 밝기 (태양=1)', 'Star luminosity (Sun = 1)'], ['맨눈으로 안 보임', 'not visible to the naked eye'],
  ['대기를 거친 밝기', 'Through the atmosphere'], ['위상 (밝은 면)', 'Phase (lit)'], ['지구로부터 거리', 'Distance from Earth'], ['고도 (지표면 위)', 'Altitude (above surface)'], ['표면 위 고도', 'altitude above surface'],
  ['신호가 닿는 시간', 'Signal travel time'], ['태양 기준 속도', 'Speed (Sun-relative)'], ['현재 위치에서', 'From here'], ['지구 그림자 안', 'in Earth\'s shadow'], ['지금 활동 중', 'Active now'],
  ['생명 가능 지대', 'habitable zone'], ['라틴어 이름', 'Latin name'], ['허블 분류', 'Hubble type'], ['적색편이 z', 'Redshift z'], ['적경 (J2000)', 'RA (J2000)'], ['적위 (J2000)', 'Dec (J2000)'],
  ['방위 / 고도', 'Azimuth / altitude'], ['까지 각거리', ': angular distance'], ['공전 주기', 'Period'], ['최고 고도', 'Max alt.'], ['태양으로부터', 'From the Sun'], ['지구로부터', 'From Earth'],
  ['B−V 색지수', 'B−V colour'], ['겉보기 등급', 'Magnitude'], ['오늘의 천문 정보', 'Today\'s sky'], ['천문 달력', 'Sky calendar'], ['탐사선 명장면', 'Spacecraft encounters'], ['오늘 천문', 'Today'],
  ['지금 하늘', 'Up now'], ['관측 목록', 'Observing list'], ['하늘 비추기', 'Point at sky'], ['야간 시야 끄기', 'Night vision off'], ['야간 시야', 'Night vision'], ['전체 화면', 'Full screen'],
  ['날짜·시각', 'Date/time'], ['시간 끌기', 'Scrub time'], ['지구 주위 공전', 'Orbiting Earth'], ['자유 비행', 'Free flight'], ['장소 선택', 'Choose place'], ['장비 시야 없음', 'No eyepiece'],
  ['밝은 교외', 'bright suburban'], ['도시 외곽', 'city edge'], ['낮에도 별 보기', 'Stars in daytime'], ['파란 하늘 + 별', 'Blue sky + stars'], ['대기 효과', 'Atmosphere'], ['별자리선', 'Lines'],
  ['별자리 경계', 'Boundaries'], ['적도 격자', 'Grid'], ['탐사선 위치', 'Spacecraft'], ['이동 · 확대', 'Go to'], ['투어 고르기', 'Choose a tour'], ['명장면: ', 'Encounter: '], ['최근접', 'closest'],
  ['착륙 지점', 'landing site'], ['계산 중…', 'Calculating…'], ['천체를 선택하고', 'Select an object and press'], ['를 누르세요', ''], ['개 관측함', ' observed'], ['개 중', ' of '],
  ['천문 박명 시작', 'Astronomical dawn'], ['항해 박명 시작', 'Nautical dawn'], ['시민 박명 시작', 'Civil dawn'], ['시민 박명 끝', 'Civil dusk'], ['항해 박명 끝', 'Nautical dusk'],
  ['삭 (신월)', 'New Moon'], ['차오르는 달', 'Waxing gibbous'], ['기우는 달', 'Waning gibbous'], ['초승달', 'Waxing crescent'], ['상현달', 'First quarter'], ['보름달', 'Full Moon'], ['하현달', 'Last quarter'], ['그믐달', 'Waning crescent'],
  ['최대 동방 이각', 'greatest eastern elongation'], ['최대 서방 이각', 'greatest western elongation'], ['저녁 하늘', 'evening sky'], ['새벽 하늘', 'morning sky'], ['극대 (시간당 최대 약', 'peak (up to about'],
  ['밤새', 'all night'], ['오늘 극대', 'peak tonight'], ['극대', 'peak'], ['근접', 'close approach'], ['월령', 'age'], ['밝은 면', 'lit'], ['일몰', 'Sunset'], ['일출', 'Sunrise'], ['월출', 'Moonrise'], ['월몰', 'Moonset'],
  ['춘분', 'March equinox'], ['하지', 'June solstice'], ['추분', 'September equinox'], ['동지', 'December solstice'], ['계절', 'season'], ['유성우', 'Meteor showers'], ['외계행성', 'Exoplanets'],
  ['은하수', 'Milky Way'], ['궤도', 'Orbits'], ['지면', 'Ground'], ['이름', 'Labels'], ['위도', 'Lat'], ['경도', 'Lon'], ['광공해', 'Light pollution'], ['시골', 'rural'], ['교외', 'suburban'],
  ['도심', 'inner city'], ['도시', 'city'], ['서울', 'Seoul'], ['부산', 'Busan'], ['제주', 'Jeju'], ['도쿄', 'Tokyo'], ['뉴욕', 'New York'], ['런던', 'London'], ['시드니', 'Sydney'], ['북극', 'North Pole'],
  ['실시간', 'Live'], ['정지', 'Pause'], ['지금', 'Now'], ['−1시간', '−1 h'], ['−1분', '−1 min'], ['+1시간', '+1 h'], ['+1분', '+1 min'], ['+1일', '+1 day'], ['더 보기', 'More'], ['접기', 'Less'],
  ['지상', 'Ground'], ['우주', 'Space'], ['명장면', 'Encounters'], ['투어', 'Tours'], ['링크', 'Link'], ['캡처', 'Capture'], ['이전', 'Back'], ['다음', 'Next'], ['끝', 'Done'], ['메모', 'Note'],
  ['행성 텍스처', 'Planet textures'], ['대기 때문에 별이 반짝이는 모습', 'Stars twinkling through the air'], ['반짝임', 'Twinkle'], ['한국 전통 별자리', 'Korean traditional'], ['서양 별자리', 'Western'],
  ['12° 이하로 확대하면 실제 망원경 사진이 하늘에 겹칩니다 (DSS2)', 'Zoom below 12° to overlay real telescope imagery (DSS2)'], ['실사 하늘', 'Photo sky'], ['소행성대', 'Asteroids'], ['선택하지 않은 탐사선의 지나온 길도 모두 표시', 'Show every spacecraft path, not only the selected one'], ['탐사선 경로', 'Probe paths'],
  ['지금 보고 있는 천체(없으면 태양)에서 빛이 퍼져 나가는 모습', 'Watch light spread from the body you are viewing (or the Sun)'], ['빛 출발', 'Emit light'], ['빛 지우기', 'Clear light'],
  ['에서 빛이 출발했습니다. 시간을 빠르게 하면 퍼지는 모습이 잘 보입니다.', ': light emitted. Speed up time to watch it spread.'], ['의 빛이 ', ' light reached '], ['에 닿았습니다', ''], ['별자리 문화', 'Sky culture'], ['지구', 'Earth'], ['발사', 'Launched'], ['설명', 'About'], ['도착', 'Arrived'], ['위치', 'Location'], ['속도', 'Speed'], ['햇빛', 'Sunlight'], ['받는 중', 'in sunlight'], ['보임', 'Visible'], ['예', 'yes'], ['아니오', 'no'],
  ['소유격', 'Genitive'], ['약자', 'Abbreviation'], ['복사점', 'radiant'], ['활동 기간', 'Active'], ['모천체', 'Parent body'], ['참고', 'Note'], ['거리', 'Distance'], ['광년', 'light-years'],
  ['별자리', 'Constellation'], ['등급', 'Magnitude'], ['크기', 'Size'], ['위치각', 'Position angle'], ['시직경', 'Apparent size'], ['반지름', 'Radius'], ['온도', 'Temp.'], ['발견', 'Found'],
  ['항성', 'Star'], ['행성', 'planet'], ['위성', 'moon'], ['주위', '· nearby'], ['달', 'Moon'], ['식', 'eclipse'], ['고도', 'alt'], ['시야', 'Field'], ['방위', 'az'], ['실시야', 'true field'],
  ['태양에서', 'From the Sun'], ['가장 가까운 천체', 'nearest:'], ['별 카탈로그 실패', 'star catalogue failed'], ['천체', 'objects'], ['별 ', 'Stars '], ['개', ''], ['실패', 'failed'],
  ['횡단 시각 변화', 'TTV'], ['식 시각 변화', 'ETV'], ['밝기 변조', 'Brightness mod.'], ['펄서 시각', 'Pulsar timing'], ['위치 측정', 'Astrometry'], ['맥동 시각', 'Pulsation timing'], ['원반 운동', 'Disk kinematics'],
  ['미세중력렌즈', 'Microlensing'], ['직접 촬영', 'Imaging'], ['시선속도', 'Radial velocity'], ['횡단', 'Transit'],
  ['은하 쌍', 'Galaxy pair'], ['은하 삼중', 'Galaxy triplet'], ['은하군', 'Galaxy group'], ['발광성운', 'Emission nebula'], ['반사성운', 'Reflection nebula'], ['초신성 잔해', 'Supernova remnant'],
  ['성단+성운', 'Cluster + nebula'], ['행성상성운', 'Planetary nebula'], ['산개성단', 'Open cluster'], ['구상성단', 'Globular cluster'], ['성협', 'Association'], ['성운', 'Nebula'], ['은하', 'Galaxy'], ['기타', 'Other'],
].sort((a, b) => b[0].length - a[0].length);
const RX = [
  [/(\d[\d,.]*)만 km/g, (m, n) => `${Math.round(parseFloat(n.replace(/,/g, '')) * 1e4).toLocaleString('en-US')} km`],
  [/(\d+)일 뒤/g, 'in $1 days'], [/(\d+)일 지남/g, '$1 days ago'], [/극대 (\d+)일 전/g, 'peak in $1 days'], [/(\d+(?:\.\d+)?)일/g, '$1 d'],
  [/(\d+(?:\.\d+)?)시간/g, '$1 h'], [/(\d+(?:\.\d+)?)분/g, '$1 min'], [/(\d+(?:\.\d+)?)초/g, '$1 s'], [/(\d{4})년/g, '$1'], [/(\d+)월 /g, (m, n) => ['', 'Jan ', 'Feb ', 'Mar ', 'Apr ', 'May ', 'Jun ', 'Jul ', 'Aug ', 'Sep ', 'Oct ', 'Nov ', 'Dec '][+n]],
  [/약 /g, 'about '], [/(\d+)배속/g, '$1×'], [/"(.+)" 를 찾지 못했습니다/, 'No match for "$1"'],
];
const cache = new Map();
export function tr(t) {
  if (!EN || !t || !/[가-힣]/.test(t)) return t;
  if (cache.has(t)) return cache.get(t);
  let o = t.replace(/극대 (\d+)일 전/g, 'peak in $1 days'); // whole phrases first, then numbers with units
  for (const [k, v] of PH) if (o.includes(k)) o = o.split(k).join(v);
  for (const [re, f] of RX) o = o.replace(re, f);
  o = o.replace(/\s{2,}/g, ' ');
  if (cache.size < 5000) cache.set(t, o);
  return o;
}
export function startTranslator() { // static page + anything the app writes later (labels are translated at the source)
  if (!EN) return;
  const fix = (node) => {
    if (node.nodeType === 3) { const v = tr(node.nodeValue); if (v !== node.nodeValue) node.nodeValue = v; return; }
    if (node.nodeType !== 1 || node.id === 'labels') return;
    for (const a of ['placeholder', 'title', 'aria-label']) if (node.hasAttribute?.(a)) { const v = tr(node.getAttribute(a)); if (v !== node.getAttribute(a)) node.setAttribute(a, v); }
    if (node.tagName === 'OPTION' && node.parentNode?.id === 'search-list') return;
    for (const c of node.childNodes) fix(c);
  };
  fix(document.body);
  new MutationObserver((ms) => { for (const m of ms) { if (m.target.closest?.('#labels') || m.target.parentElement?.closest?.('#labels')) continue;
    if (m.type === 'characterData') fix(m.target); else for (const n of m.addedNodes) fix(n); } })
    .observe(document.body, { childList: true, subtree: true, characterData: true });
}
