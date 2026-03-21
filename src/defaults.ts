import type { FlowringColors, FlowringDatum, FlowringOptions } from "./types";

export const DEFAULT_COLORS: Required<Omit<FlowringColors, "arcByRank">> = {
  arc: "rgb(242, 45, 10)",
  stroke: "black",
  buffer: "white",
  dim: "#666666",
};

export const DEFAULT_OPTIONS: Required<
  Omit<
    FlowringOptions,
    | "colors"
    | "projection"
    | "onRender"
    | "onBlink"
    | "formatLabel"
    | "formatTitle"
  >
> = {
  topN: 12,
  blinkCount: 3,
  direction: "inbound",
  subtitle: "",
  radiusFraction: 0.3,
  arcThickness: 20,
  blinkInterval: 150,
  animate: false,
};

export function defaultFormatLabel(datum: FlowringDatum, _rank: number): string {
  return `${datum.label} ${datum.value.toLocaleString()}`;
}
