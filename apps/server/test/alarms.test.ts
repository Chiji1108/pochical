import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { UserDO } from "../src/user-do";
import { alarmsSettled, runAlarm } from "./alarms";
import { call } from "./helpers";
import { pair } from "./sync-helpers";

describe("a Durable Object's alarm in a test", () => {
  // The runtime takes up an alarm set for now on its own, and the pool
  // begins it only once it has fetched the Worker's module from vitest's
  // main process; until then the alarm reads as none.
  it("is waited for once the runtime has taken it up, though it has not begun", async () => {
    const { maker, makerId } = await pair();
    const user = env.USERS.getByName(makerId);
    const seen: string[] = [];
    const taken = Promise.withResolvers<undefined>();
    const begin = Promise.withResolvers<undefined>();
    // oxlint-disable-next-line typescript/unbound-method -- called with the user as this
    const watched = UserDO.prototype.alarm;
    let holding = true;
    // Held before the watched alarm, as the pool holds it.
    UserDO.prototype.alarm = async function alarm(
      this: UserDO,
      ...info: [AlarmInvocationInfo?]
    ): Promise<void> {
      if (!holding || info[0] === undefined) {
        await Reflect.apply(watched, this, info);
        return;
      }
      holding = false;
      taken.resolve(undefined);
      await begin.promise;
      await Reflect.apply(watched, this, info);
      seen.push("run ended");
    };
    try {
      await call("UserService/SetProfile", { name: "さくら" }, maker);
      await runInDurableObject(user, async () => {
        await taken.promise;
      });
      await expect(
        runInDurableObject(
          user,
          async (_, state) => await state.storage.getAlarm()
        )
      ).resolves.toBeNull();
      const ran = runAlarm(user).then(() => {
        seen.push("returned");
      });
      // Taken after runAlarm's own call on the same stub, so once it waits.
      await runInDurableObject(user, () => {
        begin.resolve(undefined);
      });
      await ran;
    } finally {
      begin.resolve(undefined);
      UserDO.prototype.alarm = watched;
    }
    expect(seen).toStrictEqual(["run ended", "returned"]);
  });

  it("is waited for, not failed on, when a run going as it is called throws", async () => {
    const user = env.USERS.getByName(crypto.randomUUID());
    const entered = Promise.withResolvers<undefined>();
    const fail = Promise.withResolvers<undefined>();
    await runInDurableObject(user, async (instance, state) => {
      Reflect.set(instance, "deleteGoingPhotos", async () => {
        Reflect.deleteProperty(instance, "deleteGoingPhotos");
        entered.resolve(undefined);
        await fail.promise;
        throw new Error("R2 out of reach");
      });
      await state.storage.setAlarm(Date.now());
    });
    try {
      await runInDurableObject(user, async () => {
        await entered.promise;
      });
      const settled = alarmsSettled(user);
      // Taken after alarmsSettled's own call on the same stub, so once it
      // waits.
      await runInDurableObject(user, () => {
        fail.resolve(undefined);
      });
      await expect(settled).resolves.toBeUndefined();
    } finally {
      fail.resolve(undefined);
    }
  });
});
