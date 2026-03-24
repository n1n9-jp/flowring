import { create } from "zustand";
import type { AdmCenter, FlowAllFilteredRow, NetflowDataRow } from "@/types/flow";

function getAdmNm(admcenterMap: Map<number, AdmCenter>, code: number): string {
  const padded = Number(String(code).padEnd(10, "0"));
  return admcenterMap.get(padded)?.admnm ?? String(code);
}

// 事前インデックス: code → [{counterpart, flow}] (双方向)
type RegionIndex = Map<number, { counterpart: number; flow: number }[]>;

function buildIndex(rawData: NetflowDataRow[]): {
  inbound: RegionIndex;
  outbound: RegionIndex;
} {
  const inbound: RegionIndex = new Map();
  const outbound: RegionIndex = new Map();

  for (const r of rawData) {
    // netflow-all: ori < des 正規化、双方向インデックス
    if (!inbound.has(r.des)) inbound.set(r.des, []);
    inbound.get(r.des)!.push({ counterpart: r.ori, flow: r.flow });
    if (!inbound.has(r.ori)) inbound.set(r.ori, []);
    inbound.get(r.ori)!.push({ counterpart: r.des, flow: -r.flow });

    if (!outbound.has(r.des)) outbound.set(r.des, []);
    outbound.get(r.des)!.push({ counterpart: r.ori, flow: r.flow });
    if (!outbound.has(r.ori)) outbound.set(r.ori, []);
    outbound.get(r.ori)!.push({ counterpart: r.des, flow: -r.flow });
  }

  return { inbound, outbound };
}

interface FlowState {
  // 行政区域の中心座標
  admcenter: AdmCenter[];
  admcenterMap: Map<number, AdmCenter>;

  // データ設定
  counterpartyUnit: "市郡区" | "邑面洞";
  direction: "純流入" | "純流出";

  // 全体モードデータ
  netflowAllRawData: NetflowDataRow[] | null;
  netflowAllIndex: { inbound: RegionIndex; outbound: RegionIndex } | null;

  // 地図hover選択地域
  selectedRegion: { code: number; name: string } | null;

  // フィルタリング結果
  netflowAllFilteredData: FlowAllFilteredRow[] | null;

  // Actions
  setAdmcenter: (centers: AdmCenter[]) => void;
  setCounterpartyUnit: (unit: "市郡区" | "邑面洞") => void;
  setDirection: (dir: "純流入" | "純流出") => void;
  setNetflowAllRawData: (data: NetflowDataRow[] | null) => void;
  setSelectedRegion: (code: number, name: string) => void;
  clearSelectedRegion: () => void;
}

export const useFlowStore = create<FlowState>((set, get) => ({
  admcenter: [],
  admcenterMap: new Map(),

  counterpartyUnit: "市郡区",
  direction: "純流入",

  netflowAllRawData: null,
  netflowAllIndex: null,

  selectedRegion: null,

  netflowAllFilteredData: null,

  // --- Actions ---

  setAdmcenter: (centers) => {
    const map = new Map<number, AdmCenter>();
    for (const c of centers) {
      map.set(c.admcd, c);
    }
    set({ admcenter: centers, admcenterMap: map });
  },

  setCounterpartyUnit: (unit) => set({ counterpartyUnit: unit }),

  setDirection: (dir) => {
    set({ direction: dir });
    // 方向変更時に現在の選択地域を再フィルタリング
    const state = get();
    if (state.selectedRegion) {
      get().setSelectedRegion(state.selectedRegion.code, state.selectedRegion.name);
    }
  },

  setNetflowAllRawData: (data) =>
    set({
      netflowAllRawData: data,
      netflowAllIndex: data ? buildIndex(data) : null,
      netflowAllFilteredData: null,
      selectedRegion: null,
    }),

  setSelectedRegion: (code, name) => {
    const state = get();
    const { netflowAllIndex: index, admcenterMap, direction } = state;

    if (!index) {
      set({ selectedRegion: { code, name } });
      return;
    }

    const isInbound = direction === "純流入";

    // O(1) lookup
    const entries = (isInbound ? index.inbound : index.outbound).get(code);

    if (!entries || entries.length === 0) {
      set({ selectedRegion: { code, name }, netflowAllFilteredData: [] });
      return;
    }

    // 方向フィルタ (純流入: flow>0, 純流出: flow<0)
    const filtered = entries.filter((e) =>
      isInbound ? e.flow > 0 : e.flow < 0,
    );

    // 同一counterpartを合算 + 地域名 + ソート
    const merged = new Map<number, { region: number; regionName: string; count: number }>();
    for (const e of filtered) {
      const prev = merged.get(e.counterpart);
      if (prev) {
        prev.count += Math.abs(e.flow);
      } else {
        merged.set(e.counterpart, {
          region: e.counterpart,
          regionName: getAdmNm(admcenterMap, e.counterpart),
          count: Math.abs(e.flow),
        });
      }
    }

    const result = Array.from(merged.values())
      .sort((a, b) => b.count - a.count)
      .map((r, i) => ({ ...r, id: String(i + 1) }));

    set({
      selectedRegion: { code, name },
      netflowAllFilteredData: result,
    });
  },

  clearSelectedRegion: () =>
    set({ selectedRegion: null, netflowAllFilteredData: null }),
}));
