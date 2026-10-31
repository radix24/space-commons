# Space Commons

**땅에서 올려다보고, 우주로 나아가는 모두의 하늘**

브라우저에서 바로 여는 플라네타리움이자 태양계 비행 서비스입니다. 설치 없이 열리고, 한 번 연 뒤에는 인터넷 없이도 실행됩니다.

| 항목 | 내용 |
|---|---|
| 서비스 | https://radix24.github.io/space-commons/ |
| 버전 | Alpha 0.0.3c |
| 언어 | 한국어, English (상단 버튼 또는 `?lang=en`) |
| 브랜드 | [BRAND.md](BRAND.md) |

---

## 보기 모드

- **지상**: 고른 장소와 시각에서 올려다본 하늘
- **우주**: 태양계 안을 자유롭게 비행. 수 m 거리의 탐사선부터 수십억 km 밖의 보이저까지 한 화면에서 다룹니다.
- **샌드박스**: 실제 태양계를 복사해 중력을 직접 계산하는 실험 공간과 궤도역학 실습. [명세](docs/SPEC-sandbox-astrophysics.md)

## 주요 기능

### 하늘
- 별 4만 1천 개, 88개 별자리(한국어 이름, 경계선)
- NGC/IC 딥스카이 천체 1만 2,519개, 선택하면 실제 망원경 사진
- 은하수, 유성우 13개, 외계행성 6,451개(항성계 지도와 생명 가능 지대)
- 실제 밝기: 거리와 위상으로 계산한 겉보기 등급, 대기 굴절과 소광, 광공해 단계
- 낮 하늘, 노을과 박명, 일식과 월식

### 태양계
- 태양, 행성, 위성 24개, 왜행성과 소행성, 핼리 혜성
- 실제 사진 지도, 실제 자전 각도, 지구의 낮밤과 도시 불빛

### 탐사선과 인공위성
- 심우주 탐사선 14기: 보이저, 뉴호라이즌스, JWST, 주노, 파커, 유로파 클리퍼 등
- 달·화성 궤도선 10기: 다누리, LRO, MRO 등
- 착륙 지점 32곳: 달, 화성, 금성, 수성. 지점까지 내려가 표면 위의 착륙선을 볼 수 있습니다.
- 한국 인공위성 68기: 우리별, 아리랑, 천리안, 무궁화, 차세대중형위성, 425 정찰위성 등
- ISS와 밝은 위성들의 실시간 위치와 통과 예보
- 명장면 12개: 보이저의 행성 통과, 뉴호라이즌스의 명왕성 통과 등을 실제 궤도로 재생

### 관측과 학습
- 오늘의 천문 정보, 90일 천문 달력, 지금 보이는 천체 목록
- 관측 목록, 쌍안경·망원경 시야, 야간 시야(붉은 화면)
- 주제별 투어 6개, 위키백과 요약, 두 천체 사이 각거리
- 화면 링크 공유, 캡처, 휴대폰 화면과 하늘 비추기

### 샌드박스와 궤도역학 실습
- 태양과 8행성의 N체 중력 계산(가변 시간 간격, 에너지 보존 오차 표시), 질량 바꾸기와 지우기, 역재생, 처음 상태로 되돌리기
- 탐사선 던지기: 궤도면을 눌러 끌면 궤적 미리보기와 그 자리의 원 궤도·탈출 속도가 나옵니다
- 실습 7개: 원 궤도와 탈출 속도, 활력 방정식(vis-viva), 호만 전이(지구→화성), 발사 시기와 포크찹 그림(램버트 문제), 플라이바이 설계(계산과 N체 비교), 여러 행성 경유 임무 설계(보이저·갈릴레오·카시니 일정), 라그랑주점과 트로이 소행성
- 우주동역학 개념 카드 15장(기초·교양·전공): 이체 문제, 보존량, 궤도 요소, 케플러 방정식, 호만과 이중 타원, 궤도면 변경, 오베르트 효과, 로켓 방정식, 영향권, 중력 도움, 램버트 문제, J2와 태양동기 궤도, 제한 삼체 문제와 야코비 상수, CW 상대 운동, 활력 방정식. 카드마다 직접 조작하는 그림, 전공 심화 유도, 관련 실습 바로가기
- 실습마다 목표, 조작, 측정, 확인, 해설과 "더 깊이"(전공 심화, KaTeX 수식), 기록지(브라우저 저장, 파일로 내보내기·불러오기)

## 조작

| 동작 | 지상 | 우주 |
|---|---|---|
| 드래그 | 하늘 둘러보기 | 천체 주위 돌기 |
| 휠 / 핀치 | 확대 | 거리 조절 |
| 더블클릭 | 그 천체로 이동 | 그 천체로 비행 |
| 키보드 | T 지금 하늘 · Y 오늘 천문 · O 관측 목록 | W A S D / Q E 이동 · Shift 가속 |

공통: F 전체 화면 · P 캡처 · N 야간 시야

## 자료 출처

| 자료 | 출처 |
|---|---|
| 별, 별자리 | Hipparcos, d3-celestial |
| 딥스카이 | OpenNGC, CDS hips2fits (DSS2) |
| 외계행성 | NASA Exoplanet Archive |
| 탐사선·위성·소천체 궤도 | NASA JPL Horizons, JPL SBDB, 지구 근접 소행성: NASA CNEOS |
| 별의 3차원 위치 | HYG 데이터베이스 v4.1 (CC BY-SA 4.0, 별도 데이터 파일과 라이선스 안내) |
| 수식 표시 | KaTeX (MIT) |
| 궤도역학 알고리즘 | Curtis, Orbital Mechanics for Engineering Students; Vallado, Fundamentals of Astrodynamics and Applications (램버트 문제, 범용 변수 케플러 전파) |
| 달 위치 | Meeus, Astronomical Algorithms 47장 (astronomia 라이브러리에서 이식, MIT) |
| 날씨 예보 | Open-Meteo (실시간) |
| 은하수 사진 | ESO/S. Brunier, The Milky Way panorama (eso0932a, CC BY 4.0) |
| 확대 시 어두운 별 | ESA Gaia DR3 (ESA/Gaia/DPAC, CC BY-SA 3.0 IGO): G 8~12등급 약 302만 개, 더 확대하면 G 12~13등급 약 428만 개 (NASA/IPAC 적외선 과학 아카이브 IRSA의 gaia_dr3_source 사본에서 받음). 하늘 1,668개 구역으로 나눠 저장 |
| 별자리 그림 | Johan Meuris, Stellarium "modern" 별자리 문화 (Free Art License 1.3, 별도 파일과 라이선스 안내) |
| 달·화성 고해상도 표면 | Solar System Scope 8k (CC BY 4.0), 고도: LRO LOLA (NASA SVS), MGS MOLA (NASA PDS) |
| 한국 별자리 그림 | 천상열차분야지도 (1395년 조선 태조 때 각석, 고구려 시대 원본 바탕) 목판본 (퍼블릭 도메인, Wikimedia Commons). 한국 별자리 선과 겹쳐 맞춘 극좌표 변환으로 하늘에 표시 | 채색 천문도 (조선 필사본, 퍼블릭 도메인, 인터넷 아카이브 / Wikimedia Commons)도 선택 가능
| 지평선 지형 | AWS Terrain Tiles (Mapzen Terrarium, SRTM 등 공개 고도 자료) |
| 인공위성 | CelesTrak |
| 한국 전통 별자리 | Stellarium "korean" 별자리 문화 (GPL v2.0, `data/LICENSE-korean-constellations.txt`) |
| 중국 전통 별자리, 고대 이집트 별자리 | Stellarium "chinese" (CC BY-SA 4.0), "egyptian" (GPL v2.0) 별자리 문화 (`data/LICENSE-skycultures.txt`) |
| 그 밖의 별자리 문화 10종 | Stellarium 별자리 문화: 일본·인도·하와이·마오리·북유럽·몽골·티베트 (CC BY-SA 4.0), 이누이트·나바호·아즈텍 (GPL v2.0). 변형 금지(ND) 자료는 쓰지 않음 (`data/LICENSE-skycultures.txt`) |
| 은하 사진 | DSS2 컬러 (STScI/NASA, Caltech/Palomar), CDS HiPS의 ESA ESASky 미러에서 잘라 냄 (`tools/make_galaxy_cutouts.py`) |
| 가까운 우주의 은하 4만 3천여 개 | 2MASS Redshift Survey v2.4 (Huchra et al. 2012, ApJS 199, 26; 이용 시 인용 조건) · 거리 = 후퇴 속도 / H₀(70) · `tools/make_galaxy_catalog.py` |
| 3D로 날아다니는 별 10만 7천여 개 | AT-HYG v3.2 (astronexus/HYG-Database, CC BY-SA 4.0) · `tools/make_stars3d_ext.py` |
| 3D 모델 | NASA 3D Resources, NASA Science (Europa Clipper), ESA SciFleet (Juice, BepiColombo, Solar Orbiter, Mars Express, ExoMars TGO), 공개 제원으로 만든 자체 모델 |
| 행성 텍스처, 은하수 | Solar System Scope (CC BY 4.0) |
| 위성·왜행성 표면 지도 | 이오·유로파·타이탄·명왕성·세레스·베스타: NASA/JPL/USGS (퍼블릭 도메인), 가니메데·칼리스토: Askaniy (CC BY-SA 3.0), Wikimedia Commons |
| 오늘의 지구 | NASA GIBS, VIIRS SNPP 보정 반사율 실제 색 (퍼블릭 도메인) |
| 오로라 예보 | NOAA SWPC OVATION 오로라 예보 (퍼블릭 도메인) |
| 광공해 판정 | NASA Black Marble (VIIRS 야간 영상, 퍼블릭 도메인), NASA GIBS |
| 사진 지평선 | ESO 360° 파노라마: 파라날 천문대, 세로 아르마소네스 (CC BY 4.0, Wikimedia Commons). 하늘을 지운 지평선 사진으로 가공 |
| 확대 사진 타일 | HiPS (CDS 제작, ESA ESASky 미러): DSS2 컬러 (STScI/NASA), 2MASS (UMass & IPAC/Caltech), SDSS 9 (SDSS), AllWISE (IPAC/NASA) |
| 한국 관측지 360° 능선 | Tilezen Terrain Tiles (AWS Open Data; SRTM, ETOPO1 등 공개 자료, 출처 표시) 지형으로 직접 그림 |
| 시간 정밀도 | ΔT: Espenak & Meeus 다항식 (NASA), 세차 IAU 1976, 장동 IAU 1980 주요 항 |
| 국부은하군 위치 | 각 은하의 좌표·거리: NASA/IPAC NED 및 McConnachie (2012) 목록 값 |
| 소천체 실제 모양 | 베스타·베누·에로스·아로코스: NASA 3D Resources (science.nasa.gov, 퍼블릭 도메인) · 궤도: JPL SBDB |
| 실제 관측 자료 실습 | Gaia DR3 (ESA/Gaia/DPAC, CC BY-SA 3.0 IGO), NASA TESS (exo.MAST, 퍼블릭 도메인), SDSS DR17 (CC BY 4.0) |
| 함께 배포하는 라이브러리·자료 (vendor/, data/celestial/) | three.js (MIT), KaTeX (MIT), satellite.js (MIT), Draco (Apache 2.0), Pretendard (SIL OFL 1.1), d3-celestial (BSD 3-Clause), OpenNGC (CC BY-SA 4.0) |
| 파장 바꿔 보기 | 전파: Parkes Radio Telescope/100-m Effelsberg/CSIRO/MPIfR · 마이크로파: ESA/NASA/JPL-Caltech/Planck Collaboration · 적외선: 2MASS/J. Carpenter/T. H. Jarrett/R. Hurt · H-알파: WHAM/VTSS/SHASSA/Douglas Finkbeiner · X선: eROSITA/MPE/IKI (모두 CC BY 4.0, Wikimedia Commons AllSky 시리즈) · 감마선: NASA/DOE/Fermi LAT Collaboration (퍼블릭 도메인) |

자료 갱신 스크립트는 `tools/` 폴더에 있습니다.

## 개발

설치나 빌드 없이 정적 파일로 동작합니다. 저장소 폴더에서 `python -m http.server`로 띄운 뒤 `http://localhost:8000/app.html`을 열면 됩니다.

올리기 전 점검: `python tools/qa.py`는 헤드리스 Chrome이나 Edge로 소개 페이지, 지상, 우주, 샌드박스, 한국 위성 카드, 영어, 임베드, 휴대폰 화면을 차례로 열어 보고, 스크립트 오류나 빠진 파일이 있으면 실패로 끝납니다. 각 화면의 캡처는 `.cache/qa/`에 남습니다. `websocket-client` 패키지가 필요합니다. `?fps=1`을 붙이거나 Shift+F를 누르면 프레임 속도와 현재 해상도 배율이 보입니다.

## 로드맵

- [다음 기능 명세 (관측·표현)](docs/SPEC-next.md)
- [샌드박스와 천체물리학 실습 명세](docs/SPEC-sandbox-astrophysics.md)
- [지상·우주 모드 고도화 명세](docs/SPEC-ground-space.md)

## 버전 기록

기능 묶음 하나를 마칠 때마다 마지막 글자를 올리고, 큰 단계가 바뀌면 가운데 숫자를 올립니다.

| 버전 | 내용 |
|---|---|
| 0.0.2c | 확대하면 실사 하늘(DSS2), 별의 반짝임, 한국 전통 별자리(천상열차분야지도 312개), 소행성대·카이퍼대 1만 6천 개, 대기 테두리·지구 구름·토성 고리 그림자·위성 그림자, ISS·톈궁 3D와 한국 위성 궤도, 빛의 속도 보기 |
| 0.0.2d | 정밀한 달 위치(Meeus 47장, 일식 최대 시각 수 초 단위), 내 위치, 관측지 날씨(Open-Meteo), 천체 고도 그래프, 내 망원경·카메라 시야와 사진 구도, 달 엄폐 예보, 지구 근접 소행성 40건 재생(아포피스 2029 포함) |
| 0.0.2e | 위성 이름 정리(주요 위성 우선, 겹침 회피), 가까운 별 사이 비행(100광년 안의 별과 맨눈 별 1만 2천 개를 실제 3차원 위치에), 외계행성계 방문(행성 궤도, 생명 가능 지대, 그 별에서 본 태양의 위치와 밝기) |
| 0.0.2f | 탐사선 전체 여정: 발사부터 예정 궤도 끝까지(보이저·파이어니어는 발사 시점부터), 지나온 길과 앞으로의 경로(주황 점선), 주요 사건 타임라인 14기 · 누르면 그 순간으로 이동 |
| 0.0.2g | 확대하면 Gaia 별 302만 개, 실제 지형 지평선, 별자리 그림 85개, 달·화성 근접 시 8k 표면과 실제 고도 음영, 외곽 태양계에서 본 태양 표시 정리, 별 클릭은 맨눈 별만 |
| 0.0.3a | 샌드박스 모드: N체 중력 엔진, 탐사선 던지기, 궤도역학 실습 7개(vis-viva, 호만, 포크찹, 플라이바이, 임무 설계, 라그랑주점), 실습 기록지, KaTeX 수식 |
| 0.0.3b | 우주동역학 개념 카드 15장, 같은 자리 위성 이름 묶기(무궁화 7호 외 3기), 성단 표시 개선, 한국 별자리 그림 안내, 느린 위성 서버가 로딩을 막지 않게 |
| 0.0.3c | 한국 전통 별자리를 고르고 별자리 그림을 켜면 천상열차분야지도가 하늘에 겹쳐집니다 |
| 0.0.2b | 탐사선 공식 3D 모델 확대: 유로파 클리퍼, 주스, 베피콜롬보, 솔라 오비터, 마스 익스프레스, 엑소마스 TGO, 메이븐, 마스 오디세이 (가까이 갈 때 불러옴) |
| 0.0.2a | 착륙 지점 땅 흔들림 수정, 주노 고해상도 모델, 탐사선 단열재 질감, 오프라인 저장이 옛 버전을 보여 주던 문제 수정 |
| 0.0.1e | 영어 버전, 착륙 지점 지형, 행성에 다가가면 착륙선 표시 |
| 0.0.1d | 한국 인공위성, 달·화성 궤도선, 착륙 지점, 행성 실제 자전 |
| 0.0.1c | 하늘색, 일식·월식, 천문 달력, 인공위성, 명장면, 위성 추가, 별자리 경계, 설치형 앱 |
| 0.0.1b | 대기 효과, 광공해, 오늘의 천문, 유성우, 관측 목록, 투어, 휴대폰 화면 |
| 0.0.1a | 지상·우주 모드, 탐사선, 외계행성, 실제 밝기 |
