import { env } from "cloudflare:workers";
import { expect, it } from "vitest";

// Calls one User DO over and over while the rest of the suite runs, and
// reports every call slower than 500 ms with when it started.
it("probe: DO call latency during the suite", { timeout: 120_000 }, async () => {
  const slow: string[] = [];
  let worst = 0;
  let calls = 0;
  const end = Date.now() + 45_000;
  while (Date.now() < end) {
    const start = Date.now();
    // oxlint-disable-next-line no-await-in-loop -- one call at a time
    await env.USERS.getByName("probe").isMember("x");
    const took = Date.now() - start;
    calls += 1;
    worst = Math.max(worst, took);
    if (took > 500) {
      slow.push(`${new Date(start).toISOString()} ${took}ms`);
    }
  }
  expect({ calls, from: new Date(end - 45_000).toISOString(), slow, to: new Date().toISOString(), worst }).toStrictEqual({});
});
