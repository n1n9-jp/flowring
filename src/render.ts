import { select } from "d3-selection";
import { arc as d3Arc } from "d3-shape";
import { path as d3Path } from "d3-path";
import type { LayoutResult, RankEntry } from "./layout";
import type { FlowringColors, FlowringDatum, FlowringSource, Point } from "./types";
import { getBlinkBounce, getBlinkOpacity } from "./blink";
import { DEFAULT_COLORS, defaultFormatLabel } from "./defaults";

type D3Svg = ReturnType<typeof select<SVGSVGElement, unknown>>;

export interface RenderConfig {
  direction: "inbound" | "outbound";
  colors: Required<Omit<FlowringColors, "arcByRank">> & {
    arcByRank?: (rankIndex: number) => string;
  };
  arcThickness: number;
  animate: boolean;
  blinkCount: number;
  subtitle: string;
  formatLabel: (datum: FlowringDatum, rank: number) => string;
  formatTitle?: (source: FlowringSource, subtitle: string) => string[];
}

function getNormalVector(origin: Point, destination: Point): Point {
  const dx = destination.x - origin.x;
  const dy = destination.y - origin.y;
  const mag = Math.sqrt(dx * dx + dy * dy);
  if (mag === 0) return { x: 0, y: 0 };
  return { x: dx / mag, y: dy / mag };
}

export function renderToSvg(
  svgEl: SVGSVGElement,
  layout: LayoutResult,
  config: RenderConfig,
  blinkTime: number,
) {
  const svg = select(svgEl);
  svg.selectAll("*").remove();

  const { colors } = config;

  // Arrow marker
  const defs = svg.append("defs");
  defs
    .append("marker")
    .attr("id", "flowring-arrow")
    .attr("viewBox", "0 0 10 10")
    .attr("refX", 5)
    .attr("refY", 5)
    .attr("markerWidth", 12)
    .attr("markerHeight", 12)
    .attr("markerUnits", "userSpaceOnUse")
    .attr("orient", "auto-start-reverse")
    .append("path")
    .attr("d", "M 0 0 L 10 5 L 0 10 z")
    .attr("fill", colors.stroke);

  const { orixy_scr, entries, outerRadius, viewport } = layout;
  const isInbound = config.direction === "inbound";

  drawOriToDesLine(svg, orixy_scr, entries, outerRadius, colors.stroke, isInbound);
  drawPieChart(svg, orixy_scr, entries, outerRadius, config, blinkTime);

  const dimLineRadius = outerRadius + 10;
  const dimLineOffset = 20;
  drawDimLine(svg, orixy_scr, entries, outerRadius, dimLineRadius, dimLineOffset, config, blinkTime);

  drawTitle(svg, viewport.width, layout.source, config);
}

// ── Direction lines ──────────────────────────────────────────────────────────

function drawOriToDesLine(
  svg: D3Svg,
  orixy_scr: Point,
  entries: RankEntry[],
  outerRadius: number,
  color: string,
  isInbound: boolean,
) {
  for (const entry of entries) {
    const distToDesxy = Math.sqrt(
      (orixy_scr.x - entry.desxy_scr.x) ** 2 +
        (orixy_scr.y - entry.desxy_scr.y) ** 2,
    );

    let ctnLineOri: Point, ctnLineDes: Point;
    let dshLineOri: Point, dshLineDes: Point;

    if (distToDesxy <= outerRadius) {
      ctnLineOri = orixy_scr;
      ctnLineDes = entry.desxy_scr;
      dshLineOri = entry.desxy_scr;
      dshLineDes = entry.adjustedOuter;
    } else {
      ctnLineOri = entry.adjustedOuter;
      ctnLineDes = entry.desxy_scr;
      dshLineOri = orixy_scr;
      dshLineDes = entry.adjustedOuter;
    }

    const midPoint: Point = {
      x: (ctnLineOri.x + ctnLineDes.x) / 2,
      y: (ctnLineOri.y + ctnLineDes.y) / 2,
    };

    // Solid line
    const p = d3Path();
    p.moveTo(ctnLineOri.x, ctnLineOri.y);
    p.lineTo(ctnLineDes.x, ctnLineDes.y);
    svg
      .append("path")
      .attr("d", p.toString())
      .attr("fill", "none")
      .attr("stroke", color)
      .attr("stroke-width", 2);

    // Arrow at midpoint
    const arrowFrom: Point = isInbound
      ? { x: ctnLineDes.x, y: ctnLineDes.y }
      : { x: ctnLineOri.x, y: ctnLineOri.y };
    svg
      .append("line")
      .attr("x1", arrowFrom.x)
      .attr("y1", arrowFrom.y)
      .attr("x2", midPoint.x)
      .attr("y2", midPoint.y)
      .attr("stroke", "none")
      .attr("marker-end", "url(#flowring-arrow)");

    // Dot at destination
    svg
      .append("circle")
      .attr("cx", ctnLineDes.x)
      .attr("cy", ctnLineDes.y)
      .attr("r", 3)
      .attr("fill", color);

    // Dashed line
    svg
      .append("line")
      .attr("x1", dshLineOri.x)
      .attr("y1", dshLineOri.y)
      .attr("x2", dshLineDes.x)
      .attr("y2", dshLineDes.y)
      .attr("stroke", color)
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "5,5");
  }
}

// ── Donut arcs ───────────────────────────────────────────────────────────────

function drawPieChart(
  svg: D3Svg,
  orixy_scr: Point,
  entries: RankEntry[],
  outerRadius: number,
  config: RenderConfig,
  blinkTime: number,
) {
  const thickness = config.arcThickness;
  const edgeThickness = thickness * 0.2;

  for (const entry of entries) {
    const angle = Math.atan2(
      entry.adjustedOuter.y - orixy_scr.y,
      entry.adjustedOuter.x - orixy_scr.x,
    );

    const ratio = entry.ratio;
    const startAngle = -Math.PI * ratio;
    const endAngle = Math.PI * ratio;

    const arcGen = d3Arc();
    const arcPath = arcGen({
      innerRadius: outerRadius - thickness,
      outerRadius,
      startAngle,
      endAngle,
    });

    const rank = entry.rank;
    const arcColor =
      config.colors.arcByRank?.(rank) ?? config.colors.arc;
    const transform = `translate(${orixy_scr.x}, ${orixy_scr.y}) rotate(${
      angle * (180 / Math.PI) + 90
    })`;

    const shouldBlink = config.animate && rank < config.blinkCount;
    const opacity = shouldBlink ? getBlinkOpacity(blinkTime, rank) : 1;

    svg
      .append("path")
      .attr("d", arcPath)
      .attr("fill", arcColor)
      .attr("transform", transform)
      .attr("opacity", opacity);

    // Edge border for blinking ranks
    if (shouldBlink) {
      const edgeArcPath = arcGen({
        innerRadius: outerRadius - edgeThickness,
        outerRadius,
        startAngle,
        endAngle,
      });
      svg
        .append("path")
        .attr("d", edgeArcPath)
        .attr("fill", config.colors.stroke)
        .attr("transform", transform)
        .attr("opacity", opacity);
    }
  }
}

// ── Leader lines + rank labels ───────────────────────────────────────────────

interface DimEntry {
  index: number;
  dimLineDes: Point;
}

function drawDimLine(
  svg: D3Svg,
  orixy_scr: Point,
  entries: RankEntry[],
  outerRadius: number,
  dimLineRadius: number,
  dimLineOffset: number,
  config: RenderConfig,
  blinkTime: number,
) {
  const { colors } = config;
  const upperLeftDim: DimEntry[] = [];
  const upperRightDim: DimEntry[] = [];
  const lowerLeftDim: DimEntry[] = [];
  const lowerRightDim: DimEntry[] = [];

  for (let i = 0; i < entries.length; i++) {
    const desxy_scr_outer = entries[i].adjustedOuter;
    const normal = getNormalVector(orixy_scr, desxy_scr_outer);

    const dimLineOri: Point = { x: desxy_scr_outer.x, y: desxy_scr_outer.y };
    const dimLineDes: Point = {
      x: desxy_scr_outer.x + normal.x * dimLineOffset,
      y: desxy_scr_outer.y + normal.y * dimLineOffset,
    };

    svg
      .append("line")
      .attr("x1", dimLineOri.x)
      .attr("y1", dimLineOri.y)
      .attr("x2", dimLineDes.x)
      .attr("y2", dimLineDes.y)
      .attr("stroke", colors.dim)
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "2,4");

    svg
      .append("circle")
      .attr("cx", dimLineOri.x)
      .attr("cy", dimLineOri.y)
      .attr("r", Math.max(2, 10 - 2 * entries[i].rank))
      .attr("fill", colors.stroke)
      .attr("stroke", colors.stroke)
      .attr("stroke-width", 1);

    if (dimLineDes.x < orixy_scr.x) {
      if (dimLineDes.y < orixy_scr.y) {
        upperLeftDim.push({ index: i, dimLineDes });
      } else {
        lowerLeftDim.push({ index: i, dimLineDes });
      }
    } else {
      if (dimLineDes.y < orixy_scr.y) {
        upperRightDim.push({ index: i, dimLineDes });
      } else {
        lowerRightDim.push({ index: i, dimLineDes });
      }
    }
  }

  upperLeftDim.sort((a, b) => b.dimLineDes.y - a.dimLineDes.y);
  upperRightDim.sort((a, b) => b.dimLineDes.y - a.dimLineDes.y);
  lowerLeftDim.sort((a, b) => a.dimLineDes.y - b.dimLineDes.y);
  lowerRightDim.sort((a, b) => a.dimLineDes.y - b.dimLineDes.y);

  const textGap = 30;

  const drawQuadrant = (
    quadrant: DimEntry[],
    anchor: string,
    xBase: number,
    isUpper: boolean,
  ) => {
    let prev_y = 0;
    quadrant.forEach((d, i) => {
      const textLoc: Point = { x: xBase, y: d.dimLineDes.y };
      if (i === 0) {
        prev_y = textLoc.y;
      } else if (isUpper) {
        if (prev_y - textLoc.y < textGap) {
          textLoc.y = Math.min(textLoc.y, prev_y - textGap);
        }
        prev_y = textLoc.y;
      } else {
        if (textLoc.y - prev_y < textGap) {
          textLoc.y = Math.max(textLoc.y, prev_y + textGap);
        }
        prev_y = textLoc.y;
      }
      drawLineAndText(svg, d.dimLineDes, textLoc, anchor, entries, d.index, config, blinkTime);
    });
  };

  const leftX = orixy_scr.x - dimLineRadius - dimLineOffset * 2;
  const rightX = orixy_scr.x + dimLineRadius + dimLineOffset * 2;

  drawQuadrant(upperLeftDim, "end", leftX, true);
  drawQuadrant(upperRightDim, "start", rightX, true);
  drawQuadrant(lowerLeftDim, "end", leftX, false);
  drawQuadrant(lowerRightDim, "start", rightX, false);
}

function drawLineAndText(
  svg: D3Svg,
  ori: Point,
  des: Point,
  anchor: string,
  entries: RankEntry[],
  index: number,
  config: RenderConfig,
  blinkTime: number,
) {
  const entry = entries[index];
  const rank = entry.rank + 1;
  const isRight = anchor === "start";
  const circleR = 13;
  const gap = 5;
  const { colors } = config;

  // Dashed leader line
  svg
    .append("line")
    .attr("x1", ori.x)
    .attr("y1", ori.y)
    .attr("x2", des.x)
    .attr("y2", des.y)
    .attr("stroke", colors.dim)
    .attr("stroke-width", 1)
    .attr("stroke-dasharray", "2,4");

  // Bounce animation for top ranks
  const rankIdx = rank - 1;
  const shouldBlink = config.animate && rankIdx < config.blinkCount;
  const bounceY = shouldBlink ? getBlinkBounce(blinkTime, rankIdx) : 0;

  const circleX = isRight ? des.x + circleR : des.x - circleR;
  const circleY = des.y + bounceY;

  // Rank circle
  svg
    .append("circle")
    .attr("cx", circleX)
    .attr("cy", circleY)
    .attr("r", circleR)
    .attr("fill", colors.stroke);

  // Rank number
  svg
    .append("text")
    .attr("x", circleX)
    .attr("y", circleY - 1)
    .text(rank)
    .attr("fill", colors.buffer)
    .attr("font-size", "0.85em")
    .attr("font-weight", "bold")
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "central");

  // Label
  const datum: FlowringDatum = {
    id: entry.id,
    label: entry.label,
    coord: entry.coord,
    value: entry.value,
  };
  const label = (config.formatLabel ?? defaultFormatLabel)(datum, rank);
  const textX = isRight ? circleX + circleR + gap : circleX - circleR - gap;
  const textAnchor = isRight ? "start" : "end";

  appendBufferedText(svg, textX, circleY, label, "1.0em", textAnchor, colors.stroke, colors.buffer, "central");
}

// ── Title ────────────────────────────────────────────────────────────────────

function drawTitle(
  svg: D3Svg,
  svgWidth: number,
  source: FlowringSource,
  config: RenderConfig,
) {
  const { colors } = config;
  let lines: string[];

  if (config.formatTitle) {
    lines = config.formatTitle(source, config.subtitle);
  } else {
    lines = [source.label];
    if (config.subtitle) lines.push(config.subtitle);
  }

  if (lines.length === 0) return;

  const cx = svgWidth / 2;
  const topY = 30;
  const lineHeight = 28;
  const paddingX = 20;
  const paddingY = 10;
  const maxLen = Math.max(...lines.map((l) => l.length));
  const rectW = maxLen * 18 + paddingX * 2;
  const rectH = lineHeight * lines.length + paddingY * 2;
  const bgColor =
    colors.stroke === "white" ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.45)";

  svg
    .append("rect")
    .attr("x", cx - rectW / 2)
    .attr("y", topY - paddingY)
    .attr("width", rectW)
    .attr("height", rectH)
    .attr("rx", 8)
    .attr("ry", 8)
    .attr("fill", bgColor);

  lines.forEach((text, i) => {
    svg
      .append("text")
      .attr("x", cx)
      .attr("y", topY + lineHeight * (i + 0.5))
      .text(text)
      .attr("fill", colors.stroke)
      .attr("font-size", "1.5em")
      .attr("font-weight", i === 0 ? "bold" : "normal")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "central");
  });
}

// ── Buffered text utility ────────────────────────────────────────────────────

function appendBufferedText(
  svg: D3Svg,
  x: number,
  y: number,
  text: string,
  fontSize: string,
  anchor: string,
  fillColor: string,
  bufferColor: string,
  baseline?: string,
) {
  const buf = svg
    .append("text")
    .attr("x", x)
    .attr("y", y)
    .text(text)
    .attr("fill", "none")
    .attr("stroke", bufferColor)
    .attr("stroke-width", 4)
    .attr("stroke-linejoin", "round")
    .attr("font-size", fontSize)
    .attr("text-anchor", anchor);
  if (baseline) buf.attr("dominant-baseline", baseline);

  const txt = svg
    .append("text")
    .attr("x", x)
    .attr("y", y)
    .text(text)
    .attr("fill", fillColor)
    .attr("font-size", fontSize)
    .attr("text-anchor", anchor);
  if (baseline) txt.attr("dominant-baseline", baseline);
}
