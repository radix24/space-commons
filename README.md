# Space Commons

브라우저에서 보는 플라네타리움 — https://radix24.github.io/web-planetarium/

- 별: Hipparcos 기반 8등급까지 약 4만 개 (d3-celestial 데이터), 별 이름·별자리선
- 딥스카이: [OpenNGC](https://github.com/mattiaverga/OpenNGC) 전체 NGC/IC (~1.25만 개), 확대할수록 어두운 천체 표시
- 선택한 천체에 DSS2 실사 이미지(CDS hips2fits) 오버레이
- 태양·달·8행성 3D 구체 (실시간 위치, 위상, 토성 고리)
- 지면/대기, 시간 배속, 관측 위치, 검색

조작: 드래그 회전 · 휠/핀치 확대 · 클릭 선택 · 더블클릭 이동·확대

로컬 실행: `python -m http.server 8765` → http://localhost:8765
