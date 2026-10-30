# Space Commons 애드온 형식

`저장·공유 → 애드온·발표 불러오기`로 JSON 파일 하나를 불러오면 하늘에 내 천체를 더하고, 정해 둔 순서대로 발표를 자동으로 진행할 수 있습니다. 예제: [`examples/addon-example.json`](../examples/addon-example.json)

```json
{
  "name": "애드온 이름",
  "objects": [ ... ],
  "bodies":  [ ... ],
  "script":  [ ... ]
}
```

세 부분은 모두 선택입니다. 필요한 것만 넣으면 됩니다.

## objects: 하늘에 고정된 점

별, 성운, 관측 목표처럼 하늘에서 움직이지 않는 점입니다. 파란 점으로 그려지고 검색할 수 있습니다.

| 키 | 뜻 |
|---|---|
| `name` | 이름 (60자까지) |
| `ra`, `dec` | 적경·적위, 도 단위 (J2000) |
| `note` | 고르면 정보 창에 나오는 설명 (300자까지) |

## bodies: 궤도를 도는 천체

실제 궤도 요소를 주면 날짜에 따라 움직이고, 우주 모드에서도 보이며 검색됩니다. 요소는 JPL Small-Body Database에서 그대로 옮기면 됩니다.

소행성형 (타원 궤도):

| 키 | 뜻 |
|---|---|
| `a` | 긴반지름 (AU) |
| `e` | 이심률 |
| `i`, `om`, `w` | 궤도 경사, 승교점 경도, 근일점 인수 (도, 황도 J2000) |
| `ma`, `epoch` | 기준 시각의 평균 근점 이각 (도)과 그 시각 (율리우스일) |
| `H` | 절대 등급 (밝기 계산용, 생략하면 15) |

혜성형 (포물선·쌍곡선 포함): `q` (근일점 거리, AU), `e`, `i`, `om`, `w`, `tp` (근일점 통과 시각, 율리우스일), 밝기 `M1`, `K1`.

## script: 발표 순서

각 단계에서 시각·장소·시선을 바꾸고, 천체를 고르고, 자막을 띄운 뒤 정해진 초만큼 기다립니다. 실행 중 Esc를 누르면 멈춥니다.

| 키 | 뜻 |
|---|---|
| `t` | 시각, UTC (`2027-08-02T10:07`) |
| `lat`, `lon` | 관측 장소 |
| `az`, `alt`, `fov` | 바라보는 방위·고도·시야 (도) |
| `o` | 고를 천체 이름 (검색창에 쓰는 이름, 애드온 천체 포함) |
| `say` | 화면 아래에 띄울 설명 |
| `wait` | 다음 단계까지 기다릴 초 (1~600, 기본 6) |
| `pan` | 시선을 이 초에 걸쳐 천천히 옮김 (`az`, `alt`, `fov`와 함께). 없으면 바로 바뀜 |
| `speed` | 시간 흐름 배율. 1은 실제 속도, 3600은 1초에 1시간, 0은 멈춤, 음수는 거꾸로 |
| `show` | 표시 켜고 끄기: `lines`, `labels`, `mw`, `ground`, `atmosphere`, `grid`, `dso`, `satellites`, `orbits` (예: `{"lines": true, "mw": false}`) |
| `at` | 자막 위치: `bottom`(기본) 또는 `top` |

수업용 예제: [`examples/lesson-eclipse.json`](../examples/lesson-eclipse.json) (개기일식), [`examples/lesson-retrograde.json`](../examples/lesson-retrograde.json) (화성의 역행), [`examples/lesson-diurnal.json`](../examples/lesson-diurnal.json) (별의 일주 운동)

## 라이선스

애드온에 넣는 자료의 저작권과 라이선스는 애드온을 만든 사람에게 있습니다. 다른 사람의 자료를 넣을 때는 `name`이나 `note`에 출처를 적어 주세요. 애드온 파일은 내 기기에서만 읽히며 어디로도 보내지지 않습니다.
