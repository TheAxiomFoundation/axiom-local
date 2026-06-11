"use client";

import { useEffect, useState } from "react";

/**
 * Counts page-initiated network requests that *start* after the sentinel is
 * armed (we arm it the moment the engine reports ready). The point of the
 * playground is that this number stays at zero no matter how many
 * determinations run — and the counter is observable, not asserted: it is
 * the browser's own resource timeline.
 */
export function useNetworkSentinel(armed: boolean): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!armed || typeof PerformanceObserver === "undefined") return;
    const armedAt = performance.now();
    const observer = new PerformanceObserver((list) => {
      const fresh = list.getEntries().filter((entry) => entry.startTime > armedAt);
      if (fresh.length > 0) setCount((current) => current + fresh.length);
    });
    try {
      observer.observe({ type: "resource", buffered: false });
    } catch {
      return;
    }
    return () => observer.disconnect();
  }, [armed]);

  return count;
}
