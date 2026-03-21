# Flow/Netflow 시각화 구현 결과

## 개요

korea-data-agent/frontend의 인구이동(flow/netflow) 조회·시각화 기능을 maplibre-test로 이식 완료.
데이터 소스를 기존 FastAPI 백엔드에서 Snowflake SQL API(AWS Lambda)로 전환.

---

## 구현 내역

### 1. 데이터 조회 (Snowflake SQL API)

- **API 방식**: POST `https://...execute-api.../prod/query` + API Key 인증
- **요청**: `{ sql: "SELECT ...", limit: 100000 }` → 응답: `{ columns, rows, row_count, elapsed_ms }`
- **인증 정보**: `.env.local`에 `NEXT_PUBLIC_SNOWFLAKE_API_URL`, `NEXT_PUBLIC_SNOWFLAKE_API_KEY` 분리
- **기존 Arrow IPC 방식 제거**: `apache-arrow` 패키지 삭제

#### 순이동 (NETFLOW) 쿼리 구조
```sql
SELECT FLOOR(ORI / 100000) * 100000 AS ORI, {desCode} AS DES, SUM(FLOW) AS NET_FLOW
FROM NETFLOW
WHERE {desCondition} AND YEAR BETWEEN {from} AND {to}
GROUP BY FLOOR(ORI / 100000) * 100000
```
- `SUM(FLOW) AS FLOW`는 Snowflake에서 컬럼명 충돌 → `NET_FLOW`로 alias 변경
- DES 조건: 선택한 지역 단위에 따라 `FLOOR(DES / 100000) * 100000 = ...` 또는 `DES = ...`
- DES 값: 시군구 선택 시 고정값으로 집계 (읍면동 단위 분산 방지)

#### 이동 (FLOW) 쿼리 구조
```sql
-- 전입
SELECT {counterpartExpr} AS ORI, FLOOR(DES / 100000) * 100000 AS DES, COUNT(*) AS FLOW
FROM FLOW WHERE {desCondition} AND YEAR BETWEEN ...
-- 전출
SELECT FLOOR(ORI / 100000) * 100000 AS ORI, {counterpartExpr} AS DES, COUNT(*) AS FLOW
FROM FLOW WHERE {oriCondition} AND YEAR BETWEEN ...
```
- 전입/전출 별도 쿼리 → `Promise.all`로 병렬 실행
- 전출 데이터: flow 음수 + ori/des swap 처리

### 2. 왼쪽 패널 (데이터 조회 UI)

- **탭**: shadcn Tabs — "순이동" / "이동"
- **행정구역 검색**: shadcn Combobox (Popover + Command) — `center.tsv` 기반 3,500+ 항목
- **옵션**: 연도 범위, 출발/상대지역 단위 (시군구/읍면동), 연령 그룹, 성별
- **shadcn v4 (base-ui) 주의사항**:
  - `PopoverTrigger`에 `asChild` 없음 — 직접 렌더링
  - `Select`의 `onValueChange`는 `string | null` 타입
  - `SelectValue`는 선택된 item의 `value` 값을 그대로 표시 — value를 한글 텍스트로 설정

### 3. 오른쪽 패널 (AG Grid 테이블)

- **AG Grid v35**: `ModuleRegistry.registerModules([AllCommunityModule])` 필수
- **Theming**: `themeQuartz` prop 사용 (CSS 파일 import 제거, v35 Theming API)
- **동적 컬럼**: 데이터 첫 행 기반 (ori→출발지, des→도착지, direction, gender, age_group, flow)
- **행정코드 → 지역명 변환**: `getAdmNm()` — admcenterMap에서 10자리 패딩 후 조회
- **테이블→지도 동기화**: "filtered" / "selected" 토글 버튼
- **Export**: CSV (AG Grid API), Excel (xlsx 라이브러리)
- **패널**: 540px 폭, 데이터 로드 시 자동 열림, X 버튼으로 닫기

### 4. 지도 시각화 (deck.gl)

#### PathLayer (기본선)
- 역상 색상 사용 (투명 overlay 위에서 원본 프로젝트와 유사한 톤 재현)
- `tripsBaseInv` / `tripsBase2Inv`: 원본 색상의 보색을 절반 밝기로 조정
- 블렌딩: 기본 (parameters 주석 처리, overlay 투명 배경에서 정상 표시)

#### TripsLayerCustomNew (애니메이션 트레일)
- PathLayer 확장, 커스텀 셰이더 주입
- `fade trail` 효과: `fract(currentTime - offsetPos - vTime)` 기반 알파 페이드
- `requestAnimationFrame` 기반 60fps 루프 (flow 데이터 있을 때만)
- `getTimestamps` accessor: `new Float32Array(d.timestamps)` 변환 필수

#### 블렌딩 차이 (소스 vs 타겟)
| 항목 | 소스 (korea-data-agent) | 타겟 (maplibre-test) |
|---|---|---|
| deck.gl 모드 | DeckGL as root | MapboxOverlay (투명 overlay) |
| 배경 | VWorld TileLayer (밝은 지도) | MapLibre 베이스맵 (아래 레이어) |
| 기본선 블렌딩 | FUNC_REVERSE_SUBTRACT (배경색 - 레이어색) | 기본 블렌딩 + 역상 색상 |
| 헤더 블렌딩 | FUNC_ADD | FUNC_ADD (동일) |

### 5. 데이터 변환 파이프라인

```
SQL 응답 (columns + rows)
  → rowsToObjects() (컬럼명 소문자 매핑)
  → cleanData (id 부여, BigInt→Number)
  → Zustand: setNetflowTableData (테이블용)
  → Zustand: setNetflowDeckData (지도용)
    → transformRowsToDeckData()
      → ori-des 재집계
      → resolvePosition() (admcenterMap에서 좌표 조회)
      → makePath() (Bezier 곡선 15점 + timestamps)
      → NaN 필터링 (좌표 동일/미매칭 방어)
    → NetflowDeckData[]
  → makeFlowLayers()
    → PathLayer (기본선) + TripsLayerCustomNew (애니메이션)
```

---

## 해결한 이슈

| 이슈 | 원인 | 해결 |
|---|---|---|
| Snowflake `SUM(FLOW)` 중첩 에러 | `SUM(FLOW) AS FLOW` alias가 원본 컬럼명과 충돌 | `SUM(FLOW) AS NET_FLOW`로 변경 |
| NETFLOW 0건 조회 | YEAR 컬럼이 null (테이블 업로드 오류) | 사용자가 테이블 재업로드 |
| DES가 읍면동 단위로 분산 | GROUP BY에서 DES를 원본 그대로 사용 | DES를 기준 지역 단위로 고정값 처리 |
| AG Grid 모듈 미등록 | v35부터 `AllCommunityModule` 등록 필수 | `ModuleRegistry.registerModules()` 추가 |
| AG Grid CSS 충돌 | Theming API와 CSS 파일 동시 사용 | CSS import 제거, `themeQuartz` prop 사용 |
| TripsLayer timestamps 에러 | `_checkAttributeArray`에서 NaN 감지 | `center.tsv` 파싱 시 `\r` 제거, NaN path 필터링, accessor에서 Float32Array 변환 |
| center.tsv lat=NaN | Windows `\r\n` 줄바꿈 → 헤더 `"lat\r"` !== `"lat"` → latIdx=-1 | `text.replace(/\r/g, "")` 전처리 |
| PathLayer 기본선 안 보임 | `FUNC_REVERSE_SUBTRACT`가 투명 overlay에서 무효 | 역상 색상 + 기본 블렌딩으로 전환 |
| shadcn Select 값 표시 | base-ui Select는 value 값 자체를 표시 | value를 한글 텍스트로 설정 |

---

## 파일 구조 (신규/수정)

```
src/
  types/
    flow.ts                    # NEW: 데이터 타입
    constants.ts               # NEW: FLOW_CONST, SNOWFLAKE_API, FLOW_COLOR
  stores/
    app-store.ts               # MOD: +isRightPanelOpen
    flow-store.ts              # NEW: Zustand flow/netflow 전체 상태
  lib/
    flow-utils.ts              # NEW: makePath, convertAdmcd, transformRowsToDeckData
    snowflake-api.ts           # NEW: querySnowflake(), rowsToObjects()
  hooks/
    use-admcenter.ts           # NEW: center.tsv 로딩 (\r 제거)
  components/
    map/
      map-container.tsx        # MOD: 애니메이션 루프, flow 레이어, zoom 추적
      map-layers.ts            # MOD: makeFlowLayers (PathLayer + TripsLayerCustomNew)
      trips-layer-custom.ts    # NEW: 커스텀 셰이더 레이어 (korea-data-agent에서 이식)
    layout/
      app-shell.tsx            # MOD: 우측 패널 추가, 데이터 로드 시 자동 열림
      sidebar-panel.tsx        # MOD: DataOptionTabs 삽입
      right-panel.tsx          # NEW: 540px 접이식 우측 패널
    flow/
      data-option-tabs.tsx     # NEW: 순이동/이동 탭
      adm-combobox.tsx         # NEW: 행정구역 검색 Combobox
      request-netflow.tsx      # NEW: 순이동 조회 폼 (Snowflake SQL)
      request-flow.tsx         # NEW: 이동 조회 폼 (Snowflake SQL)
      table-container.tsx      # NEW: AG Grid v35 테이블
    ui/
      tabs, select, input, label, checkbox,
      command, popover, toggle-group, ...  # NEW: shadcn v4 컴포넌트
public/
  center.tsv                   # NEW: 행정구역 중심좌표 (3,500+건)
.env.local                     # NEW: API URL + Key (gitignore 대상)
```

## 추가된 패키지

```
ag-grid-community, ag-grid-react  # 테이블
xlsx                               # Excel export
```

## 제거된 패키지

```
apache-arrow      # Arrow IPC 불필요 (Snowflake SQL API로 전환)
@versatiles/style  # 미사용 (이전 세션에서 Carto로 전환)
```
