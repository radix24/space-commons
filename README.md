# Space Commons

브라우저에서 보는 플라네타리움 — https://radix24.github.io/space-commons/

- 별: Hipparcos 기반 8등급까지 약 4만 개 (d3-celestial 데이터), 별 이름·별자리선
- 딥스카이: [OpenNGC](https://github.com/mattiaverga/OpenNGC) 전체 NGC/IC (~1.25만 개), 확대할수록 어두운 천체 표시
- 선택한 천체에 DSS2 실사 이미지(CDS hips2fits) 오버레이
- 탐사선 14기: 보이저 1·2호, 뉴호라이즌스, 파이어니어 10·11호, JWST, 주노, 파커, 솔라 오비터, 베피콜롬보, 주스, 유로파 클리퍼, 루시, 프시케. 위치는 JPL Horizons 궤도력(`data/probes.json`, `tools/fetch_probes.py`로 갱신), 모델은 NASA 3D Resources와 공개 제원 기반 자체 모델(`craft.js`), 실제 크기로 표시
- 지구: 실제 시각에 맞춘 자전과 낮밤, 밤쪽 도시 불빛
- 도구: 위키백과 요약(선택한 천체), 현재 화면 링크 공유, 시간 끌기 슬라이더, 날짜·시각 이동, 관측 장소 선택, 지금 하늘에 보이는 천체 목록(T), 화면 캡처(P), 전체 화면(F)
- 태양·달·8행성 3D 구체 (실시간 위치, 위상, 토성 고리)
- 지면/대기, 시간 배속, 관측 위치, 검색

두 가지 모드
- **지상**: 관측 위치에서 올려다보는 하늘 (Stellarium 방식). 지면과 언덕 실루엣 아래의 별은 가려집니다.
- **우주**: 태양계를 자유롭게 비행 (Celestia 방식). 천체 주위 공전, W A S D / Q E 이동, Shift 가속, 궤도선 표시.

조작(지상): 드래그 회전 · 휠/핀치 확대 · 클릭 선택 · 더블클릭 이동·확대

로컬 실행: `python -m http.server 8765` → http://localhost:8765

브랜드 가이드: [BRAND.md](BRAND.md) · 브랜드 시트: https://radix24.github.io/space-commons/brand.html · 은하수 파노라마·행성 텍스처 © Solar System Scope (CC BY 4.0)
