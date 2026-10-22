import { createHistogram, performance } from "node:perf_hooks";

// Every Durable Object call in a test fetches the Worker's module from
// vitest's Node main process, so when its event loop stalls, every lane's
// DO calls wait together. A stall this long is past any a healthy CI run
// has shown (1.7 s), and long enough to count toward a 5 s test timeout.
const STALL_MS = 2000;
const TICK_MS = 10;

export default function setup() {
  const lateness = createHistogram();
  const stalls: { at: number; ms: number }[] = [];
  let last = performance.now();
  const timer = setInterval(() => {
    const now = performance.now();
    const late = Math.round(now - last - TICK_MS);
    lateness.record(Math.max(1, late));
    if (late >= STALL_MS) {
      stalls.push({ at: Date.now() - (now - last), ms: late });
    }
    last = now;
  }, TICK_MS);

  return () => {
    clearInterval(timer);
    console.log(
      `[event loop] ${stalls.length} stalls ≥${STALL_MS}ms, p50 ${lateness.percentile(50)}ms, p99 ${lateness.percentile(99)}ms, max ${lateness.max}ms`
    );
    for (const { at, ms } of stalls) {
      console.log(
        `[event loop] stalled ${ms}ms from ${new Date(at).toISOString()}`
      );
    }
  };
}
