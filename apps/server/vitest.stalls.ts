import { monitorEventLoopDelay, performance } from "node:perf_hooks";

// Every Durable Object call in a test fetches the Worker's module from
// vitest's Node main process, so when its event loop stalls, every lane's
// DO calls wait together. A stall this long is past any a healthy CI run
// has shown (1.7 s), and long enough to count toward a 5 s test timeout.
const STALL_MS = 2000;
const TICK_MS = 10;
// The histogram records each whole interval, not only how late it ran.
const lateMs = (ns: number) => Math.round(ns / 1e6) - TICK_MS;

export default function setup() {
  const delay = monitorEventLoopDelay({ resolution: TICK_MS });
  delay.enable();
  let stalls = 0;
  let last = performance.now();
  const timer = setInterval(() => {
    const now = performance.now();
    const late = Math.round(now - last - TICK_MS);
    if (late >= STALL_MS) {
      stalls += 1;
      // Printed as it happens, so a run killed before teardown keeps it.
      console.log(
        `[event loop] stalled ${late}ms from ${new Date(Date.now() - (now - last)).toISOString()}`
      );
    }
    last = now;
  }, TICK_MS).unref();

  return () => {
    clearInterval(timer);
    delay.disable();
    console.log(
      `[event loop] ${stalls} stalls ≥${STALL_MS}ms, p50 ${lateMs(delay.percentile(50))}ms, p99 ${lateMs(delay.percentile(99))}ms, max ${lateMs(delay.max)}ms`
    );
  };
}
