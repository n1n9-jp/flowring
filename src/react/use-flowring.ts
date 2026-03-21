import { useState, useEffect, useCallback, useRef } from "react";

interface UseFlowringOptions {
  /** Blink interval in ms. Default: 150 */
  blinkInterval?: number;
}

interface UseFlowringReturn {
  /** Current blink elapsed time in seconds */
  blinkTime: number;
  /** Reset the blink timer (call on source change) */
  resetBlink: () => void;
}

/**
 * React hook for managing flowring blink animation timing.
 * Provides blinkTime state that updates at the given interval.
 */
export function useFlowring(options?: UseFlowringOptions): UseFlowringReturn {
  const interval = options?.blinkInterval ?? 150;
  const [blinkTime, setBlinkTime] = useState(0);
  const t0Ref = useRef(0);

  const resetBlink = useCallback(() => {
    t0Ref.current = performance.now();
    setBlinkTime(0);
  }, []);

  useEffect(() => {
    t0Ref.current = performance.now();
    const timerId = setInterval(() => {
      setBlinkTime((performance.now() - t0Ref.current) / 1000);
    }, interval);
    return () => clearInterval(timerId);
  }, [interval]);

  return { blinkTime, resetBlink };
}
