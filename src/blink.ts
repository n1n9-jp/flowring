/** Full blink cycle duration in seconds */
export const BLINK_CYCLE = 6;

/** Per-rank start delays in seconds (staggered) */
export const BLINK_DELAYS = [1.5, 3, 4.5];

/** Blink pattern within one cycle: [opacity, duration(sec)] pairs */
export const BLINK_PATTERN: [number, number][] = [
  [0, 0.15],
  [1, 0.15],
  [0, 0.15],
  [1, 1.05],
];

const BOUNCE_OFFSET = -3;

/**
 * Returns opacity (0 or 1) for a given rank at a given time.
 * Exported for external sync (e.g., map layer fill colors).
 */
export function getBlinkOpacity(timeSec: number, rankIndex: number): number {
  if (rankIndex < 0 || rankIndex >= BLINK_DELAYS.length) return 1;
  const local =
    (((timeSec - BLINK_DELAYS[rankIndex]) % BLINK_CYCLE) + BLINK_CYCLE) %
    BLINK_CYCLE;
  let cursor = 0;
  for (const [opacity, dur] of BLINK_PATTERN) {
    cursor += dur;
    if (local < cursor) return opacity;
  }
  return 1;
}

/**
 * Returns Y bounce offset (-3 or 0) for a given rank at a given time.
 */
export function getBlinkBounce(timeSec: number, rankIndex: number): number {
  if (rankIndex < 0 || rankIndex >= BLINK_DELAYS.length) return 0;
  const local =
    (((timeSec - BLINK_DELAYS[rankIndex]) % BLINK_CYCLE) + BLINK_CYCLE) %
    BLINK_CYCLE;
  let cursor = 0;
  for (const [opacity, dur] of BLINK_PATTERN) {
    cursor += dur;
    if (local < cursor) return opacity === 0 ? BOUNCE_OFFSET : 0;
  }
  return 0;
}

/**
 * Creates a managed blink timer.
 * Calls onTick with elapsed seconds at the given interval.
 */
export function createBlinkTimer(opts: {
  interval?: number;
  onTick: (elapsedSec: number) => void;
}): { start: () => void; stop: () => void; reset: () => void; elapsed: () => number } {
  const interval = opts.interval ?? 150;
  let t0 = 0;
  let timerId: ReturnType<typeof setInterval> | null = null;

  return {
    start() {
      if (timerId) return;
      t0 = performance.now();
      timerId = setInterval(() => {
        opts.onTick((performance.now() - t0) / 1000);
      }, interval);
    },
    stop() {
      if (timerId) {
        clearInterval(timerId);
        timerId = null;
      }
    },
    reset() {
      t0 = performance.now();
    },
    elapsed() {
      return (performance.now() - t0) / 1000;
    },
  };
}
