import type {
  Coordinate,
  FlowringDatum,
  FlowringSource,
  Point,
  ProjectionFn,
} from "./types";

/** Internal rank entry with computed geometry */
export interface RankEntry {
  id: string | number;
  label: string;
  coord: Coordinate;
  value: number;
  ratio: number;
  rank: number;
  isInner: boolean;
  angle: number;
  desxy_scr: Point;
  desxy_scr_outer: Point;
  normal: Point;
  adjustedOuter: Point;
}

/** Layout computation result */
export interface LayoutResult {
  source: FlowringSource;
  orixy_scr: Point;
  entries: RankEntry[];
  outerRadius: number;
  viewport: { width: number; height: number };
}

function projectCoord(
  coord: Coordinate,
  projFn: ProjectionFn | undefined,
): Point {
  if (projFn) return projFn(coord);
  return { x: coord[0], y: coord[1] };
}

function getNormalVector(origin: Point, destination: Point): Point {
  const dx = destination.x - origin.x;
  const dy = destination.y - origin.y;
  const mag = Math.sqrt(dx * dx + dy * dy);
  if (mag === 0) return { x: 0, y: 0 };
  return { x: dx / mag, y: dy / mag };
}

/**
 * Compute the full layout for rendering.
 * Pure function — no side effects, no DOM access.
 */
export function computeLayout(
  source: FlowringSource,
  data: FlowringDatum[],
  topN: number,
  radiusFraction: number,
  projFn: ProjectionFn | undefined,
  viewport: { width: number; height: number },
  total?: number,
): LayoutResult | null {
  if (data.length === 0) return null;

  const orixy_scr = projectCoord(source.coord, projFn);
  const outerRadius = Math.min(viewport.width, viewport.height) * radiusFraction;

  const sliced = data.slice(0, topN);
  const totalValue = total ?? data.reduce((acc, cur) => acc + cur.value, 0);

  const entries: RankEntry[] = sliced.map((d, i) => {
    const desxy_scr = projectCoord(d.coord, projFn);
    const normal = getNormalVector(orixy_scr, desxy_scr);
    const desxy_scr_outer: Point = {
      x: orixy_scr.x + normal.x * outerRadius,
      y: orixy_scr.y + normal.y * outerRadius,
    };

    return {
      id: d.id,
      label: d.label,
      coord: d.coord,
      value: d.value,
      ratio: totalValue > 0 ? d.value / totalValue : 0,
      rank: i,
      isInner: false,
      angle: 0,
      desxy_scr,
      desxy_scr_outer,
      normal,
      adjustedOuter: { ...desxy_scr_outer },
    };
  });

  adjustRatioBarLocation(orixy_scr, entries, outerRadius);

  return { source, orixy_scr, entries, outerRadius, viewport };
}

// ── Angle adjustment algorithms ──────────────────────────────────────────────

function adjustRatioBarLocation(
  orixy_scr: Point,
  entries: RankEntry[],
  outerRadius: number,
) {
  // Assign ranks and compute isInner / initial angles
  entries.forEach((d, i) => {
    d.rank = i;
    const dist = Math.sqrt(
      (orixy_scr.x - d.desxy_scr.x) ** 2 +
        (orixy_scr.y - d.desxy_scr.y) ** 2,
    );
    d.isInner = dist <= outerRadius;
    d.angle = Math.atan2(
      d.desxy_scr_outer.y - orixy_scr.y,
      d.desxy_scr_outer.x - orixy_scr.x,
    );
  });

  rearrangeOverlap(orixy_scr, entries, outerRadius);
  unravelLines(orixy_scr, entries, outerRadius);
}

function rearrangeOverlap(
  orixy_scr: Point,
  entries: RankEntry[],
  outerRadius: number,
) {
  entries.sort((a, b) => a.angle - b.angle);
  const buffer = 0.03;
  const moveLimit = 0.03;

  for (let i = 0; i < 800; i++) {
    let moveCnt = 0;
    for (let prev = 0; prev < entries.length; prev++) {
      for (let next = prev + 1; next < entries.length; next++) {
        const angleDiff = angleDifference(entries[prev].angle, entries[next].angle);

        let moveDirection = 1;
        const isPrevCW =
          Math.abs(entries[prev].angle - entries[next].angle) < Math.PI;
        if (isPrevCW) moveDirection = -1;

        const prevWidthHalf = entries[prev].ratio * Math.PI;
        const nextWidthHalf = entries[next].ratio * Math.PI;

        const overlap =
          prevWidthHalf + nextWidthHalf + buffer - Math.abs(angleDiff);

        if (overlap > 0) {
          const move = Math.min(moveLimit, Math.abs(overlap));
          const weight_prev =
            entries[next].ratio / (entries[prev].ratio + entries[next].ratio);
          const weight_next =
            entries[prev].ratio / (entries[prev].ratio + entries[next].ratio);

          entries[prev].angle += moveDirection * move * weight_prev;
          entries[next].angle -= moveDirection * move * weight_next;
          if (move > 0.001) moveCnt++;
        }
      }
    }
    if (moveCnt === 0) break;
  }

  entries.forEach((d) => {
    d.adjustedOuter = {
      x: orixy_scr.x + outerRadius * Math.cos(d.angle),
      y: orixy_scr.y + outerRadius * Math.sin(d.angle),
    };
  });
}

function unravelLines(
  orixy_scr: Point,
  entries: RankEntry[],
  outerRadius: number,
) {
  entries.sort((a, b) => a.angle - b.angle);
  let crossCnt = 1;
  while (crossCnt > 0) {
    crossCnt = 0;
    for (let j = 0; j < entries.length; j++) {
      const p0 = entries[j];
      const p1 = j === entries.length - 1 ? entries[0] : entries[j + 1];

      const line0_ori = p0.isInner ? p0.desxy_scr : orixy_scr;
      const line0_des = p0.adjustedOuter;
      const line1_ori = p1.isInner ? p1.desxy_scr : orixy_scr;
      const line1_des = p1.adjustedOuter;

      if (checkLineCross(line0_ori, line0_des, line1_ori, line1_des)) {
        swapAngle(p0, p1);
        crossCnt++;
        p0.adjustedOuter = {
          x: orixy_scr.x + outerRadius * Math.cos(p0.angle),
          y: orixy_scr.y + outerRadius * Math.sin(p0.angle),
        };
        p1.adjustedOuter = {
          x: orixy_scr.x + outerRadius * Math.cos(p1.angle),
          y: orixy_scr.y + outerRadius * Math.sin(p1.angle),
        };
        entries.sort((a, b) => a.angle - b.angle);
      }
    }
  }
}

function angleDifference(angle1: number, angle2: number) {
  let diff = angle2 - angle1;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return diff;
}

function swapAngle(p0: RankEntry, p1: RankEntry) {
  const angle0 = p0.angle;
  const angle1 = p1.angle;
  const offset0 = p0.ratio * Math.PI;
  const offset1 = p1.ratio * Math.PI;

  let diff = angle1 - angle0;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  const isAngle0CW = diff <= 0;

  const angle0_outer = isAngle0CW ? angle0 + offset0 : angle0 - offset0;
  const angle1_outer = isAngle0CW ? angle1 - offset1 : angle1 + offset1;

  p0.angle = isAngle0CW ? angle1_outer + offset0 : angle1_outer - offset0;
  p1.angle = isAngle0CW ? angle0_outer - offset1 : angle0_outer + offset1;
}

function checkLineCross(p0: Point, p1: Point, p2: Point, p3: Point): boolean {
  const ccw = (a: Point, b: Point, c: Point) =>
    (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
  return (
    ccw(p0, p2, p3) !== ccw(p1, p2, p3) &&
    ccw(p0, p1, p2) !== ccw(p0, p1, p3)
  );
}
