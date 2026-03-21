// Core
export { flowring } from "./flowring";

// Types
export type {
  FlowringInstance,
  FlowringOptions,
  FlowringDatum,
  FlowringSource,
  FlowringColors,
  Point,
  Coordinate,
  ProjectionFn,
} from "./types";

// Blink utilities (for external sync, e.g., map layer fill colors)
export {
  getBlinkOpacity,
  getBlinkBounce,
  createBlinkTimer,
  BLINK_CYCLE,
  BLINK_DELAYS,
  BLINK_PATTERN,
} from "./blink";
