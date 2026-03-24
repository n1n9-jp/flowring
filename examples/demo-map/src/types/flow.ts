// 行政区域の中心座標 (center.tsv)
export type AdmCenter = {
  admcd: number;
  admnm: string;
  lon: number;
  lat: number;
};

// 純移動データ (JSONレスポンス行)
export type NetflowDataRow = {
  id: string;
  ori: number;
  des: number;
  flow: number;
};

// 全体モードのフィルタリング結果行 (地域hover時の表示用)
export type FlowAllFilteredRow = {
  id: string;
  region: number; // カウンターパート地域コード
  regionName: string;
  count: number;
};
