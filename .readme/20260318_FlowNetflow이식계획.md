# Flow/Netflow 시각화 이식 계획

## 개요

korea-data-agent/frontend 프로젝트의 인구이동(flow/netflow) 조회 및 시각화 기능을 maplibre-test로 이식한다.

- **소스**: Next.js 15 + MUI + Redux Toolkit + DeckGL(root) + AG Grid
- **타겟**: Next.js 16 + shadcn/ui + Zustand + MapLibre + MapboxOverlay + AG Grid
- **데이터 소스**: Snowflake → AWS Lambda API (Arrow IPC 응답)

---

## 소스 프로젝트 분석

### 데이터 모델

```typescript
// 행정구역 중심좌표 (center.tsv에서 로딩)
type AdmCenter = { admcd: number; admnm: string; lon: number; lat: number }

// 순이동 데이터 (API 응답 → 테이블)
type NetflowDataRow = {
  id: string; ori: number; des: number; flow: number;
  oriName?: string; desName?: string; gender?: number; age_group?: number;
}

// 이동 데이터 (NetflowDataRow + direction)
type FlowDataRow = NetflowDataRow & { direction?: string } // "전입" | "전출"

// 지도 시각화용 (테이블 데이터에서 변환)
type NetflowDeckData = {
  path: number[][]; timestamps: number[]; value: number; maxValue: number;
}
```

### 핵심 함수

| 함수 | 소스 파일 | 기능 |
|---|---|---|
| `makePath(oripos, despos, flow)` | CombinedReduxSlice.ts | Bezier 곡선 15점 경로 생성. flow<0이면 방향 반전 |
| `convertAdmcd(admcd)` | RequestNetflow.tsx | 10자리 행정코드 → 시도(2자리)/시군구(5자리)/읍면동(10자리) 변환 |
| `get10DigitKey(num)` | CombinedReduxSlice.ts | 짧은 행정코드 → 10자리 패딩 |
| `zoomScale(zoom)` | DeckLayers.ts | 줌 레벨 기반 경로 너비 스케일링 |
| `transformRowsToDeckData` | CombinedReduxSlice.ts | 테이블 행 → ori-des 집계 → 좌표 조회 → path 생성 → NetflowDeckData[] |

### 커스텀 deck.gl 레이어: TripsLayerCustomNew

- PathLayer를 확장한 커스텀 셰이더 레이어
- 기능: 경로를 따라 이동하는 애니메이션 트레일 (fade 효과)
- 셰이더 주입: vertex에서 `vTime` 계산, fragment에서 `currentTime` 기반 알파 페이드
- 의존성: `@deck.gl/core`, `@deck.gl/layers`, `@luma.gl/shadertools`

```typescript
// 핵심 props
{ fadeTrail: true, trailLength: 0.2, currentTime: fract(Date.now()/10000) }
```

### 지도 레이어 구성 (DeckLayers.ts)

1. **PathLayer** (tripsBaseLine): 기본 경로선
   - 양수 flow → `[180,205,100,200]` (녹색계), 음수 → `[100,205,180,200]` (청녹색)
   - width: `sqrt(|value/maxValue|) * 100`, widthScale: `0.15 * zoomScale`
   - blend: `GL.FUNC_REVERSE_SUBTRACT`

2. **TripsLayerCustomNew** (tripsHeader): 애니메이션 헤드
   - 양수 flow → `[166,255,30,255]` (밝은 녹색), 음수 → `[255,180,40,255]` (주황)
   - 동일 width/scale, blend: `GL.FUNC_ADD`
   - 60FPS 렌더 루프로 `currentTime` 갱신

### 왼쪽 패널 (데이터 조회)

**순이동 탭 (RequestNetflow)**:
- Autocomplete: 기준 지역 검색 (행정구역명)
- Input: 시작/종료 연도 (2001-2024)
- Select: 출발지역 단위 (시군구/읍면동)
- Select: 연령 그룹 (5세/10세/20세 단위, 선택)
- Select: 성별 포함 여부 (선택)

**이동 탭 (RequestFlow)**:
- Autocomplete: 기준 지역 검색
- Input: 시작/종료 연도
- Checkbox: 전입/전출 선택 (다중)
- Select: 상대지역 단위, 연령, 성별

### API 엔드포인트

```
GET /netflow?des={code}&yearFrom=&yearTo=&oriAdmIsSgg=&format=arrow[&ageGroup=&gender=]
GET /flow?region={code}&yearFrom=&yearTo=&counterpartyIsSgg=&inflow=&outflow=&format=arrow[&ageGroup=&gender=]
```
- 응답: Apache Arrow IPC 바이너리 → `tableFromIPC(Uint8Array)` 파싱

### 오른쪽 패널 (AG Grid 테이블)

- 동적 컬럼: 데이터 첫 행 기반 (ori→출발지, des→도착지, direction, gender, age_group, flow)
- `valueGetter`로 행정코드 → 지역명 변환 (`getAdmNm`)
- floating filter, multi-row selection, sortable
- "filtered to map" / "selected to map" 토글 → 필터/선택 행만 지도 시각화
- CSV/Excel export (AG Grid API + xlsx 라이브러리)

### 데이터 흐름

```
사용자 폼 입력 → API 호출 → Arrow IPC 파싱
  → 테이블 데이터 (Zustand/Context)
  → 지도 데이터 (ori-des 집계 → path 생성 → DeckData[])
  → PathLayer + TripsLayerCustomNew 렌더링
  → 테이블 필터/선택 ↔ 지도 데이터 동기화
```

### 상태 관리 (소스: Redux → 타겟: Zustand)

```
Redux CombinedState → Zustand FlowStore:
  admcenter, admcenterMap
  activeDataType: "netflow" | "flow"
  netflowDeckData / flowDeckData (지도용)
  netflowTableData / flowTableData (테이블용)
  queryParams (UI 동기화용)
```

---

## 이식 시 주요 변환

| 소스 (korea-data-agent) | 타겟 (maplibre-test) |
|---|---|
| DeckGL as root | MapboxOverlay + useControl |
| Redux Toolkit | Zustand |
| MUI Autocomplete | shadcn Combobox (Popover+Command) |
| MUI Tabs | shadcn Tabs |
| MUI Select/Checkbox | shadcn Select/Checkbox |
| MUI ToggleButtonGroup | shadcn ToggleGroup |
| raw fetch | TanStack Query useMutation |
| 60fps setInterval | requestAnimationFrame |
| VWorld TileLayer 배경 | MapLibre 베이스맵 (기존 유지) |

---

## 추가 패키지

```
apache-arrow    # Arrow IPC 파싱
ag-grid-community ag-grid-react  # 테이블
xlsx            # Excel export
```

## 정적 데이터

- `public/center.tsv`: 행정구역 중심좌표 (korea-data-agent에서 복사)
- PMTiles 행정경계는 기존 것 유지
