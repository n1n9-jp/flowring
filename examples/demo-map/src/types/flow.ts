// 행정구역 중심좌표 (center.tsv)
export type AdmCenter = {
  admcd: number;
  admnm: string;
  lon: number;
  lat: number;
};

// 순이동 데이터 (JSON 응답 행)
export type NetflowDataRow = {
  id: string;
  ori: number;
  des: number;
  flow: number;
};

// 전체 모드 필터링 결과 행 (지역 hover 후 표시용)
export type FlowAllFilteredRow = {
  id: string;
  region: number; // 카운터파트 지역 코드
  regionName: string;
  count: number;
};
