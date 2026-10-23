import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { Alarm } from "../src/alarm";

const HOUR_MS = 3_600_000;

/** A run of the alarm, as the runtime begins one, set for `at`. */
const runAt = (at: number): AlarmInvocationInfo => ({
  isRetry: false,
  retryCount: 0,
  scheduledTime: at,
});

/**
 * What a fresh object's storage holds as its alarm after `use` sets it
 * through an Alarm. Times are an hour ahead, so none is clamped to now.
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

// workerd keeps and never runs an alarm set for the time of the run it
// has taken up (cloudflare/workerd#7915), so none is ever set for it.
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
      await alarm.begin(runAt(time));
      await alarm.set(time);
    });
    expect(stored).toBe(at + 1);
  });

  it("asked for another time while a run goes, is set for it", async () => {
    const { at, stored } = await storedAfter(async (alarm, _, time) => {
      await alarm.begin(runAt(time));
      await alarm.set(time + 5);
    });
    expect(stored).toBe(at + 5);
  });

  it("found at its run's own time as the run begins, is set again a millisecond after it", async () => {
    const { at, stored } = await storedAfter(async (alarm, storage, time) => {
      // As a set kept when it came after the runtime took the run up.
      await storage.setAlarm(time);
      await alarm.begin(runAt(time));
    });
    expect(stored).toBe(at + 1);
  });

  it("is left as it is when a run begins with none set", async () => {
    const { stored } = await storedAfter(async (alarm, _, time) => {
      await alarm.begin(runAt(time));
    });
    expect(stored).toBeNull();
  });
});
