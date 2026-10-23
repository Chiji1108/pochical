import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Alarm } from "../src/alarm";
import { ownRun } from "./alarms";

// workerd keeps and never runs an alarm set for the time of the run it
// has taken up (cloudflare/workerd#7915), so none is ever set for it.
// Times here are an hour ahead, so the runtime clamps none to now.
const HOUR_MS = 3_600_000;

/**
 * What a fresh object's storage holds as its alarm after `use` sets it
 * through an Alarm, `at` an hour ahead.
 */
const storedAfter = async (
  use: (
    alarm: Alarm,
    storage: DurableObjectStorage,
    at: number
  ) => Promise<void>
): Promise<{ at: number; stored: number | null }> =>
  await runInDurableObject(
    env.USERS.getByName(crypto.randomUUID()),
    async (_, state) => {
      const at = Date.now() + HOUR_MS;
      await use(new Alarm(state.storage), state.storage, at);
      const stored = await state.storage.getAlarm();
      await state.storage.deleteAlarm();
      return { at, stored };
    }
  );

describe("a Durable Object's alarm", () => {
  it("is set for the time asked", async () => {
    const { at, stored } = await storedAfter(async (alarm, _, time) => {
      await alarm.set(time);
    });
    expect(stored).toBe(at);
  });

  it("is set for now when the time asked is past", async () => {
    const before = Date.now();
    const { stored } = await storedAfter(async (alarm) => {
      await alarm.set(0);
    });
    expect(stored).toBeGreaterThanOrEqual(before);
    expect(stored).toBeLessThanOrEqual(Date.now());
  });

  it("asked for the time of the run going, is set a millisecond after it", async () => {
    const { at, stored } = await storedAfter(async (alarm, _, time) => {
      alarm.begin(ownRun(time));
      await alarm.set(time);
    });
    expect(stored).toBe(at + 1);
  });

  it("asked for another time while a run goes, is set for it", async () => {
    const { at, stored } = await storedAfter(async (alarm, _, time) => {
      alarm.begin(ownRun(time));
      await alarm.set(time + 5);
    });
    expect(stored).toBe(at + 5);
  });

  it("asked for by a time, keeps one set earlier and moves one set later", async () => {
    const kept = await storedAfter(async (alarm, _, time) => {
      await alarm.set(time);
      await alarm.setBy(time + 5);
    });
    const moved = await storedAfter(async (alarm, _, time) => {
      await alarm.set(time + 5);
      await alarm.setBy(time);
    });
    expect([kept.stored, moved.stored]).toStrictEqual([kept.at, moved.at]);
  });

  it("asked for by a time, takes the run's own time left in storage as none", async () => {
    const { at, stored } = await storedAfter(async (alarm, storage, time) => {
      // As a set kept when it came after the runtime took the run up.
      await storage.setAlarm(time);
      alarm.begin(ownRun(time));
      await alarm.setBy(time + 5);
    });
    expect(stored).toBe(at + 5);
  });

  it("as a run ends, keeps one set earlier while it ran", async () => {
    const { at, stored } = await storedAfter(async (alarm, _, time) => {
      alarm.begin(ownRun(time - 10));
      await alarm.set(time);
      await alarm.end(time + 5);
    });
    expect(stored).toBe(at);
  });

  it("as a run ends with nothing to do, deletes the run's own time left, and keeps any other", async () => {
    const left = await storedAfter(async (alarm, storage, time) => {
      await storage.setAlarm(time);
      alarm.begin(ownRun(time));
      await alarm.end(undefined);
    });
    const other = await storedAfter(async (alarm, _, time) => {
      alarm.begin(ownRun(time - 10));
      await alarm.set(time);
      await alarm.end(undefined);
    });
    expect([left.stored, other.stored]).toStrictEqual([null, other.at]);
  });
});

describe("a change made while a User DO's alarm runs", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("in the millisecond the run was set for, still has a run of its own", async () => {
    const user = env.USERS.getByName(crypto.randomUUID());
    const { at, stored } = await runInDurableObject(
      user,
      async (instance, state) => {
        const time = Date.now() + HOUR_MS;
        const entered = Promise.withResolvers<undefined>();
        const release = Promise.withResolvers<undefined>();
        Reflect.set(instance, "deleteGoingPhotos", async () => {
          entered.resolve(undefined);
          await release.promise;
        });
        const running = instance.alarm(ownRun(time));
        await entered.promise;
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(time);
        instance.setMarkLook("round", true);
        vi.useRealTimers();
        release.resolve(undefined);
        await running;
        Reflect.deleteProperty(instance, "deleteGoingPhotos");
        const left = await state.storage.getAlarm();
        await state.storage.deleteAlarm();
        return { at: time, stored: left };
      }
    );
    // Not the run's own time, which the runtime would keep and never run,
    // and kept as the run ended.
    expect(stored).toBe(at + 1);
  });

  it("before the run began, in its millisecond, leaves no alarm once the run has taken it", async () => {
    const user = env.USERS.getByName(crypto.randomUUID());
    const stored = await runInDurableObject(user, async (instance, state) => {
      const at = Date.now() + HOUR_MS;
      // As the runtime keeps a set for the run's time it has taken up.
      await state.storage.setAlarm(at);
      await instance.alarm(ownRun(at));
      return await state.storage.getAlarm();
    });
    expect(stored).toBeNull();
  });
});
