// Logs, with wall-clock time, each time the vitest main process's event
// loop is late by more than LAG_MS, and the worst lag at the end.
export default function setup() {
  const limit = Number(process.env.LAG_MS ?? 1000);
  let last = Date.now();
  let worst = 0;
  const timer = setInterval(() => {
    const now = Date.now();
    const late = now - last - 10;
    worst = Math.max(worst, late);
    if (late > limit) {
      console.error(
        `[lag] ${new Date(last).toISOString()} node late ${late}ms`
      );
    }
    last = now;
  }, 10);
  return () => {
    clearInterval(timer);
    console.error(`[lag] worst ${worst}ms`);
  };
}
