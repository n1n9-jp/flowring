import { useRef, useEffect, useState, memo } from "react";
import { computeLayout } from "../layout";
import { renderToSvg, type RenderConfig } from "../render";
import { DEFAULT_COLORS, DEFAULT_OPTIONS, defaultFormatLabel } from "../defaults";
import type {
  FlowringColors,
  FlowringDatum,
  FlowringSource,
  Point,
  ProjectionFn,
} from "../types";

/** Minimal map interface — only requires project() method */
interface MapLike {
  getMap(): {
    project(coord: [number, number]): { x: number; y: number };
    on(event: string, fn: () => void): void;
    off(event: string, fn: () => void): void;
  };
}

export interface FlowringIndicatorProps {
  mapRef?: React.RefObject<MapLike | null>;
  projection?: ProjectionFn;
  source: FlowringSource;
  data: FlowringDatum[];
  blinkTime: number;
  topN?: number;
  blinkCount?: number;
  direction?: "inbound" | "outbound";
  subtitle?: string;
  colors?: FlowringColors;
  animate?: boolean;
  arcThickness?: number;
  radiusFraction?: number;
  total?: number;
  formatLabel?: (datum: FlowringDatum, rank: number) => string;
  formatTitle?: (source: FlowringSource, subtitle: string) => string[];
}

/**
 * React component that renders the flowring SVG overlay.
 * Follows the same pattern as the original SvgMoveIndicatorInner:
 * re-draws on every render via useEffect.
 */
function FlowringIndicatorInner({
  mapRef,
  projection,
  source,
  data,
  blinkTime,
  topN = DEFAULT_OPTIONS.topN,
  blinkCount = DEFAULT_OPTIONS.blinkCount,
  direction = DEFAULT_OPTIONS.direction,
  subtitle = DEFAULT_OPTIONS.subtitle,
  colors,
  animate = DEFAULT_OPTIONS.animate,
  arcThickness = DEFAULT_OPTIONS.arcThickness,
  radiusFraction = DEFAULT_OPTIONS.radiusFraction,
  total,
  formatLabel,
  formatTitle,
}: FlowringIndicatorProps) {
  const [svgEl, setSvgEl] = useState<SVGSVGElement | null>(null);
  const [, setTick] = useState(0);

  // Sync with map movement (zoom/pan)
  useEffect(() => {
    const map = mapRef?.current?.getMap();
    if (!map) return;
    const onMove = () => setTick((t) => t + 1);
    map.on("move", onMove);
    return () => {
      map.off("move", onMove);
    };
  }, [mapRef]);

  // Build projection function
  const projFn: ProjectionFn | undefined =
    projection ??
    (mapRef?.current
      ? (coord) => {
          const map = mapRef.current!.getMap();
          const p = map.project(coord);
          return { x: p.x, y: p.y } as Point;
        }
      : undefined);

  // Re-draw on every render (same pattern as original SvgMoveIndicator)
  useEffect(() => {
    if (!svgEl || data.length === 0) return;

    const { width, height } = svgEl.getBoundingClientRect();
    if (width === 0 || height === 0) return;

    const layout = computeLayout(
      source,
      data,
      topN,
      radiusFraction,
      projFn,
      { width, height },
      total,
    );

    if (!layout) return;

    const renderConfig: RenderConfig = {
      direction,
      colors: {
        arc: colors?.arc ?? DEFAULT_COLORS.arc,
        stroke: colors?.stroke ?? DEFAULT_COLORS.stroke,
        buffer: colors?.buffer ?? DEFAULT_COLORS.buffer,
        dim: colors?.dim ?? DEFAULT_COLORS.dim,
        arcByRank: colors?.arcByRank,
      },
      arcThickness,
      animate,
      blinkCount,
      subtitle,
      formatLabel: formatLabel ?? defaultFormatLabel,
      formatTitle,
    };

    renderToSvg(svgEl, layout, renderConfig, blinkTime);
  });

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 300,
      }}
    >
      <svg ref={setSvgEl} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}

export const FlowringIndicator = memo(FlowringIndicatorInner);
