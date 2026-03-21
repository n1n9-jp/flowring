"use client";

import { Map, NavigationControl } from "react-map-gl/maplibre";
import type { MapRef } from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GeoJsonLayer } from "@deck.gl/layers";
import type { PickingInfo } from "@deck.gl/core";
import { useAppStore } from "@/stores/app-store";
import { INITIAL_VIEW_STATE } from "./map-constants";
import { DeckGLOverlay } from "./deckgl-overlay";
import { useFlowStore } from "@/stores/flow-store";
import { useAdmcenter } from "@/hooks/use-admcenter";
import { useEmdGeojson } from "@/hooks/use-emd-geojson";
import { useLoadStaticData } from "@/hooks/use-load-static-data";
import { FlowringIndicator, useFlowring } from "flowring/react";
import { getBlinkOpacity } from "flowring";

const ESRI_IMAGERY_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    "esri-imagery": {
      type: "raster",
      tiles: [
        "https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution: "© Esri",
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: "esri-imagery",
      type: "raster",
      source: "esri-imagery",
      paint: { "raster-saturation": -0.7 },
    },
  ],
};

const HILLSHADE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    hillshade: {
      type: "raster",
      tiles: [
        "https://services.arcgisonline.com/arcgis/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution: "© Esri",
      maxzoom: 16,
    },
  },
  layers: [{ id: "hillshade", type: "raster", source: "hillshade" }],
};

const DARK_STYLES = new Set([
  "esri-imagery",
  "dark-matter",
  "eclipse",
  "shadow",
]);

type StyleEntry = {
  id: string;
  label: string;
  style: string | maplibregl.StyleSpecification;
};

const MAP_STYLES: StyleEntry[] = [
  {
    id: "positron",
    label: "Positron",
    style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  },
  {
    id: "dark-matter",
    label: "Dark Matter",
    style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  },
  { id: "colorful", label: "Colorful", style: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/background/colorful.json` },
  { id: "neutrino", label: "Neutrino", style: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/background/neutrino.json` },
  { id: "graybeard", label: "Graybeard", style: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/background/graybeard.json` },
  { id: "eclipse", label: "Eclipse", style: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/background/eclipse.json` },
  { id: "shadow", label: "Shadow", style: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/background/shadow.json` },
  { id: "esri-imagery", label: "Esri Imagery", style: ESRI_IMAGERY_STYLE },
  { id: "hillshade", label: "Hillshade", style: HILLSHADE_STYLE },
];

const ADM_PMTILES_URL =
  "https://raw.githubusercontent.com/vuski/assets/refs/heads/main/map/adm.pmtiles";

function addAdmLayers(map: maplibregl.Map, dark: boolean) {
  if (map.getSource("adm")) return;

  const sidoFillColor = dark ? "#646464" : "#1c7057";
  const sidoColor = dark ? "#000000" : "#1c7057";
  const sggColor = dark ? "#000000" : "#7ab648";
  const emdColor = dark ? "#000000" : "#999999";

  map.addSource("adm", {
    type: "vector",
    url: `pmtiles://${ADM_PMTILES_URL}`,
  });

  map.addLayer({
    id: "sido-fill",
    source: "adm",
    "source-layer": "sido",
    type: "fill",
    minzoom: 1,
    maxzoom: 15,
    paint: { "fill-color": sidoFillColor, "fill-opacity": dark ? 0.3 : 0.08 },
  });

  map.addLayer({
    id: "emd-line",
    source: "adm",
    "source-layer": "emd_line",
    type: "line",
    minzoom: 10,
    paint: { "line-color": emdColor, "line-width": 0.5 },
  });

  map.addLayer({
    id: "sgg-line",
    source: "adm",
    "source-layer": "sgg_line",
    type: "line",
    minzoom: 7,
    paint: { "line-color": sggColor, "line-width": 1 },
  });

  map.addLayer({
    id: "sido-line",
    source: "adm",
    "source-layer": "sido_line",
    type: "line",
    minzoom: 1,
    paint: {
      "line-color": sidoColor,
      "line-width": ["interpolate", ["linear"], ["zoom"], 1, 1, 10, 2],
    },
  });
}

function applyKoreanLabels(map: maplibregl.Map) {
  map.getStyle().layers.forEach((layer) => {
    if (layer.type === "symbol" && layer.layout?.["text-field"]) {
      map.setLayoutProperty(layer.id, "text-field", [
        "coalesce",
        ["get", "name:ko"],
        ["get", "name_ko"],
        ["get", "name"],
      ]);
    }
  });
}

function applyOverlays(map: maplibregl.Map, dark: boolean) {
  applyKoreanLabels(map);
  addAdmLayers(map, dark);
}

export default function MapContainer() {
  const [styleId, setStyleId] = useState("positron");
  const [styleMenuOpen, setStyleMenuOpen] = useState(false);
  const mapRef = useRef<MapRef>(null);

  // 행정구역 중심좌표 로딩
  useAdmcenter();

  // 정적 데이터 로딩 (counterpartyUnit 변경 시 자동 전환)
  useLoadStaticData();

  // 읍면동 GeoJSON (hover 감지용)
  const emdGeojson = useEmdGeojson();

  // Store 구독
  const netflowAllRawData = useFlowStore((s) => s.netflowAllRawData);
  const setSelectedRegion = useFlowStore((s) => s.setSelectedRegion);
  const admcenterMap = useFlowStore((s) => s.admcenterMap);
  const selectedRegion = useFlowStore((s) => s.selectedRegion);
  const netflowAllFilteredData = useFlowStore((s) => s.netflowAllFilteredData);
  const counterpartyUnit = useFlowStore((s) => s.counterpartyUnit);
  const direction = useFlowStore((s) => s.direction);
  const setCounterpartyUnit = useFlowStore((s) => s.setCounterpartyUnit);
  const setDirection = useFlowStore((s) => s.setDirection);

  const hasRawData = !!netflowAllRawData;

  const [lastHoverCode, setLastHoverCode] = useState<number | null>(null);
  const [admLayersReady, setAdmLayersReady] = useState(false);
  const { blinkTime, resetBlink } = useFlowring();

  useEffect(() => {
    const protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);
    return () => {
      maplibregl.removeProtocol("pmtiles");
    };
  }, []);

  // 깜빡임 타이머 리셋 (selectedRegion 변경 시)
  useEffect(() => {
    resetBlink();
  }, [selectedRegion, resetBlink]);

  // 스타일 변경 시 idle 이벤트로 오버레이 재적용
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    const dark = DARK_STYLES.has(styleId);
    const onIdle = () => {
      applyOverlays(map, dark);
      setAdmLayersReady(true);
      setLastHoverCode(null);
      map.off("idle", onIdle);
    };
    map.on("idle", onIdle);

    return () => {
      map.off("idle", onIdle);
    };
  }, [styleId]);

  const mapStyle = MAP_STYLES.find((s) => s.id === styleId)!.style;

  const setMapInstance = useAppStore((s) => s.setMapInstance);
  const handleLoad = useCallback(
    (e: { target: maplibregl.Map }) => {
      applyOverlays(e.target, DARK_STYLES.has(styleId));
      setAdmLayersReady(true);
      setMapInstance(e.target);
    },
    [styleId, setMapInstance],
  );

  // deck.gl GeoJsonLayer onHover 핸들러
  const handleEmdHover = useCallback(
    (info: PickingInfo) => {
      if (!info.object) {
        if (lastHoverCode !== null) {
          setLastHoverCode(null);
        }
        return;
      }
      const props = info.object.properties;
      let code: number;
      let name: string;

      if (counterpartyUnit === "시군구") {
        code = Number(props?.sggcd);
        name = props?.sggnm || String(code);
      } else {
        code = Number(props?.emdcd);
        name = props?.emdnm || String(code);
      }

      if (code === lastHoverCode) return;
      setLastHoverCode(code);
      setSelectedRegion(code, name);
    },
    [counterpartyUnit, setSelectedRegion, lastHoverCode],
  );

  // code → 순위(0-based) 매핑
  const top10RankMap = useMemo(() => {
    if (!netflowAllFilteredData) return new globalThis.Map<number, number>();
    const m = new globalThis.Map<number, number>();
    netflowAllFilteredData.slice(0, 10).forEach((r, i) => m.set(r.region, i));
    return m;
  }, [netflowAllFilteredData]);

  const hoverCode = selectedRegion?.code ?? null;

  const codeKey = counterpartyUnit === "시군구" ? "sggcd" : "emdcd";

  const emdLayer =
    emdGeojson && hasRawData
      ? new GeoJsonLayer({
          id: "emd-hover",
          data: emdGeojson,
          stroked: false,
          filled: true,
          ...(admLayersReady ? { beforeId: "emd-line" } : {}),
          lineWidthMinPixels: 1,
          getLineWidth: 1,
          lineWidthUnits: "pixels" as const,
          pickable: true,
          getLineColor: [80, 80, 80, 100] as [number, number, number, number],
          getFillColor: (d: GeoJSON.Feature) => {
            const code = Number(d.properties?.[codeKey]);
            if (code === hoverCode)
              return [23, 115, 58, 255] as [number, number, number, number];
            const rankIdx = top10RankMap.get(code);
            if (rankIdx !== undefined) {
              const opacity =
                rankIdx < 3 ? getBlinkOpacity(blinkTime, rankIdx) : 1;
              return [174, 242, 2, 180 * opacity] as [
                number,
                number,
                number,
                number,
              ];
            }
            return [0, 0, 0, 0] as [number, number, number, number];
          },
          onHover: handleEmdHover,
          updateTriggers: {
            getFillColor: [hoverCode, top10RankMap, blinkTime],
          },
        })
      : null;

  const deckLayers = emdLayer ? [emdLayer] : [];

  const showSvgOverlay =
    selectedRegion &&
    netflowAllFilteredData &&
    netflowAllFilteredData.length > 0;

  return (
    <div className="relative w-full h-full">
      <Map
        ref={mapRef}
        initialViewState={INITIAL_VIEW_STATE}
        mapStyle={mapStyle}
        mapLib={{
          ...maplibregl,
          Map: class extends maplibregl.Map {
            constructor(options: maplibregl.MapOptions) {
              super({ ...options, preserveDrawingBuffer: true } as maplibregl.MapOptions);
            }
          },
        } as typeof maplibregl}
        style={{ width: "100%", height: "100%" }}
        onLoad={handleLoad}
      >
        <DeckGLOverlay layers={deckLayers} />
        <NavigationControl
          position="top-right"
          style={{ marginTop: 55, marginRight: 16 }}
        />
      </Map>

      {showSvgOverlay && (() => {
        const padCode = (code: number) => Number(String(code).padEnd(10, "0"));
        const oriCenter = admcenterMap.get(padCode(selectedRegion.code));
        if (!oriCenter) return null;
        return (
          <FlowringIndicator
            mapRef={mapRef}
            source={{
              id: selectedRegion.code,
              label: selectedRegion.name,
              coord: [oriCenter.lon, oriCenter.lat],
            }}
            data={netflowAllFilteredData.slice(0, 12).map((r) => {
              const c = admcenterMap.get(padCode(r.region));
              return {
                id: r.region,
                label: r.regionName,
                coord: (c ? [c.lon, c.lat] : [0, 0]) as [number, number],
                value: r.count,
              };
            }).filter((d) => d.coord[0] !== 0)}
            blinkTime={blinkTime}
            direction={direction === "순유입" ? "inbound" : "outbound"}
            subtitle={`${direction} 인구 순위`}
            colors={{
              stroke: DARK_STYLES.has(styleId) ? "white" : "black",
              buffer: DARK_STYLES.has(styleId) ? "black" : "white",
              dim: DARK_STYLES.has(styleId) ? "#cccccc" : "#666666",
            }}
            total={netflowAllFilteredData.reduce((acc, r) => acc + r.count, 0)}
            animate={true}
            blinkCount={3}
            formatLabel={(d, rank) => `${d.label} ${d.value.toLocaleString()}명`}
          />
        );
      })()}

      {/* 데이터 스위처 (시군구/읍면동 + 순유입/순유출) */}
      <div className="absolute top-4 left-4 z-10 flex gap-2">
        <div className="flex rounded shadow bg-background/90 text-xs overflow-hidden">
          {(["시군구", "읍면동"] as const).map((unit) => (
            <button
              key={unit}
              onClick={() => setCounterpartyUnit(unit)}
              className={`px-3 py-1.5 transition-colors ${
                counterpartyUnit === unit
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
            >
              {unit}
            </button>
          ))}
        </div>
        <div className="flex rounded shadow bg-background/90 text-xs overflow-hidden">
          {(["순유입", "순유출"] as const).map((dir) => (
            <button
              key={dir}
              onClick={() => setDirection(dir)}
              className={`px-3 py-1.5 transition-colors ${
                direction === dir
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
            >
              {dir}
            </button>
          ))}
        </div>
      </div>

      {/* 스타일 스위처 */}
      <div className="absolute bottom-6 left-2 z-10">
        <div className="relative">
          <button
            onClick={() => setStyleMenuOpen((v) => !v)}
            className="px-3 py-1.5 text-xs rounded shadow bg-background/90 text-foreground hover:bg-background flex items-center gap-1"
          >
            {MAP_STYLES.find((s) => s.id === styleId)?.label}
            <span className="text-[10px]">▲</span>
          </button>
          {styleMenuOpen && (
            <ul className="absolute bottom-full left-0 mb-1 rounded shadow-lg bg-background/95 backdrop-blur-sm border text-xs min-w-[130px] py-1">
              {MAP_STYLES.map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => {
                      setStyleId(s.id);
                      setStyleMenuOpen(false);
                      setAdmLayersReady(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 hover:bg-muted transition-colors ${
                      styleId === s.id ? "font-semibold" : ""
                    }`}
                  >
                    {s.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
