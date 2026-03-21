/** Screen-space point in pixels */
export interface Point {
  x: number;
  y: number;
}

/** A coordinate — either [lon, lat] for geographic use, or [x, y] for screen-space */
export type Coordinate = [number, number];

/** Converts a coordinate to screen pixels */
export type ProjectionFn = (coord: Coordinate) => Point;

/** The source (center) region */
export interface FlowringSource {
  id: string | number;
  label: string;
  coord: Coordinate;
}

/** A single ranked counterpart datum. Array order = rank order. */
export interface FlowringDatum {
  id: string | number;
  label: string;
  coord: Coordinate;
  value: number;
}

/** Color configuration (all optional, sensible defaults provided) */
export interface FlowringColors {
  /** Donut arc fill color. Default: "rgb(242, 45, 10)" */
  arc?: string;
  /** Lines, arrows, rank circles. Default: "black" */
  stroke?: string;
  /** Text halo/buffer. Default: "white" */
  buffer?: string;
  /** Leader/dim lines. Default: "#666666" */
  dim?: string;
  /** Per-rank arc color override */
  arcByRank?: (rankIndex: number) => string;
}

/** Configuration options for a flowring instance */
export interface FlowringOptions {
  /** Max ranked items to display. Default: 12 */
  topN?: number;
  /** How many top ranks get blink animation (when animate=true). Default: 3 */
  blinkCount?: number;
  /** Arrow direction. Default: "inbound" */
  direction?: "inbound" | "outbound";
  /** Second line of title text. Default: "" */
  subtitle?: string;
  /** Color overrides */
  colors?: FlowringColors;
  /** Coordinate → screen projection. If undefined, coord is treated as screen pixels. */
  projection?: ProjectionFn;
  /** Donut radius as fraction of min(width, height). Default: 0.3 */
  radiusFraction?: number;
  /** Arc thickness in px. Default: 20 */
  arcThickness?: number;
  /** Total value for ratio calculation. If omitted, sum of all data values is used.
   *  Set this to the grand total (e.g., all regions, not just top N) so arcs
   *  don't fill the full 360 degrees. */
  total?: number;
  /** Blink tick interval in ms (only used when animate=true). Default: 150 */
  blinkInterval?: number;
  /** Enable blink animation for top ranks. Default: false */
  animate?: boolean;

  /** Called after each render with current blink time */
  onRender?: (time: number) => void;
  /** Called on each blink tick with opacity array for top ranks */
  onBlink?: (opacities: number[]) => void;
  /** Custom label formatter. Default: `${datum.label} ${datum.value.toLocaleString()}` */
  formatLabel?: (datum: FlowringDatum, rank: number) => string;
  /** Custom title formatter. Return [line1, line2]. */
  formatTitle?: (source: FlowringSource, subtitle: string) => string[];
}

/** A flowring instance returned by the factory function */
export interface FlowringInstance {
  /** Update source and data, triggers render */
  update(source: FlowringSource, data: FlowringDatum[]): void;
  /** Change options (partial merge), triggers render */
  setOptions(opts: Partial<FlowringOptions>): void;
  /** Manual render trigger (e.g., on map pan/zoom) */
  render(): void;
  /** Render at a specific blink time (for external timer control) */
  renderAt(time: number): void;
  /** Get the SVG element */
  svg(): SVGSVGElement | null;
  /** Resize SVG to match container */
  resize(): void;
  /** Destroy: stop timers, remove SVG, release references */
  destroy(): void;
}
