import { describe, expect, it } from "vitest";

import { UserDO } from "../src/user-do";
import { call } from "./helpers";
import { pair, push } from "./sync-helpers";

describe("a user's push in a test", () => {
  // The runtime takes up an alarm set for now on its own, and the pool
  // begins it only once it has fetched the Worker's module from vitest's
  // main process: push waits for each run so taken up, begun or not.
  it("returns once the runs the runtime took up have ended, though none had begun", async () => {
    const { maker, makerId } = await pair();
    const seen: string[] = [];
    const runs: Promise<void>[] = [];
    // oxlint-disable-next-line typescript/unbound-method -- called with each user as this
    const taken = UserDO.prototype.alarm;
    UserDO.prototype.alarm = async function alarm(
      this: UserDO,
      ...info: unknown[]
    ): Promise<void> {
      // Only the runtime's runs carry what it ran them for.
      if (info.length === 0) {
        await Reflect.apply(taken, this, info);
        return;
      }
      const run = (async () => {
        await scheduler.wait(300);
        await Reflect.apply(taken, this, info);
        seen.push("run ended");
      })();
      runs.push(run);
      await run;
    };
    try {
      await call("UserService/SetProfile", { name: "さくら" }, maker);
      await push(makerId);
      seen.push("pushed");
      await Promise.all(runs);
    } finally {
      UserDO.prototype.alarm = taken;
    }
    expect(seen.at(-1)).toBe("pushed");
  });
});
