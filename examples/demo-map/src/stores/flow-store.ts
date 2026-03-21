import { create } from "zustand";
import type { AdmCenter, FlowAllFilteredRow, NetflowDataRow } from "@/types/flow";

function getAdmNm(admcenterMap: Map<number, AdmCenter>, code: number): string {
  const padded = Number(String(code).padEnd(10, "0"));
  return admcenterMap.get(padded)?.admnm ?? String(code);
}

// 사전 인덱스: code → [{counterpart, flow}] (양방향)
type RegionIndex = Map<number, { counterpart: number; flow: number }[]>;

function buildIndex(rawData: NetflowDataRow[]): {
  inbound: RegionIndex;
  outbound: RegionIndex;
} {
  const inbound: RegionIndex = new Map();
  const outbound: RegionIndex = new Map();

  for (const r of rawData) {
    // netflow-all: ori < des 정규화, 양방향 인덱스
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
  // 행정구역 중심좌표
  admcenter: AdmCenter[];
  admcenterMap: Map<number, AdmCenter>;

  // 데이터 설정
  counterpartyUnit: "시군구" | "읍면동";
  direction: "순유입" | "순유출";

  // 전체 모드 데이터
  netflowAllRawData: NetflowDataRow[] | null;
  netflowAllIndex: { inbound: RegionIndex; outbound: RegionIndex } | null;

  // 지도 hover 선택 지역
  selectedRegion: { code: number; name: string } | null;

  // 필터링 결과
  netflowAllFilteredData: FlowAllFilteredRow[] | null;

  // Actions
  setAdmcenter: (centers: AdmCenter[]) => void;
  setCounterpartyUnit: (unit: "시군구" | "읍면동") => void;
  setDirection: (dir: "순유입" | "순유출") => void;
  setNetflowAllRawData: (data: NetflowDataRow[] | null) => void;
  setSelectedRegion: (code: number, name: string) => void;
  clearSelectedRegion: () => void;
}

export const useFlowStore = create<FlowState>((set, get) => ({
  admcenter: [],
  admcenterMap: new Map(),

  counterpartyUnit: "시군구",
  direction: "순유입",

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
    // 방향 변경 시 현재 선택 지역 다시 필터링
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

    const isInbound = direction === "순유입";

    // O(1) lookup
    const entries = (isInbound ? index.inbound : index.outbound).get(code);

    if (!entries || entries.length === 0) {
      set({ selectedRegion: { code, name }, netflowAllFilteredData: [] });
      return;
    }

    // 방향 필터 (순유입: flow>0, 순유출: flow<0)
    const filtered = entries.filter((e) =>
      isInbound ? e.flow > 0 : e.flow < 0,
    );

    // 같은 counterpart 합산 + 지역명 + 정렬
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
