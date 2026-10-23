import { runInDurableObject } from "cloudflare:test";
import type { DurableObject } from "cloudflare:workers";
import { afterAll, afterEach, beforeAll, vi } from "vitest";

import { GroupDO } from "../src/group-do";
import { UserDO } from "../src/user-do";

// Durable Objects' alarms in tests are run by the runtime alone, one at a
// time for each object, and no switch of the pool, Miniflare or workerd
// turns that off. Once the runtime takes one up it reads as none, though
// the pool begins it only after it has fetched the Worker's module from
// vitest's main process: nothing in the object shows such a run. One set
// for the very millisecond of a run taken up is kept, and never run. So a
// test waits only on runs of an alarm it set itself, a millisecond after
// any taken up, which the runtime runs after them. Where nothing was
// owed, that run is the object's alarm with nothing to do, as the runtime
// may run any alarm again.

/** A Durable Object's alarm runs, as the runtime begins and ends them. */
type Runs = {
  ended: number;
  /** Whether one is going: the runtime runs one at a time. */
  going: boolean;
  /**
   * What the last to end without throwing was set for, and the alarm it
   * left set, read before it ended.
   */
  last: { left: number | null; scheduled: number | undefined };
  /** The latest to throw, by how many had ended with it. */
  threw: { ended: number; error: unknown } | undefined;
  /** Woken as each run begins and ends. */
  next: PromiseWithResolvers<void>;
  /** The alarm settle set of its own, while it waits on it. */
  own: number | undefined;
};

/** Each object's runs, by its state, so they go with it. */
const runsByState = new WeakMap<DurableObjectState, Runs>();

const runsOf = (state: DurableObjectState): Runs => {
  let runs = runsByState.get(state);
  if (runs === undefined) {
    runs = {
      ended: 0,
      going: false,
      last: { left: null, scheduled: undefined },
      next: Promise.withResolvers(),
      own: undefined,
      threw: undefined,
    };
    runsByState.set(state, runs);
  }
  return runs;
};

const wake = (runs: Runs): void => {
  runs.next.resolve();
  runs.next = Promise.withResolvers();
};

type Alarm = (this: DurableObject, run: AlarmInvocationInfo) => Promise<void>;

/** What tests' own calls of an alarm pass, which the watch leaves alone. */
const ownRuns = new WeakSet<AlarmInvocationInfo>();

/**
 * What a test passes calling an object's alarm itself: a run set for
 * `at`, now unless given, as the runtime passes each run it begins.
 */
export const ownRun = (at = Date.now()): AlarmInvocationInfo => {
  const run = { isRetry: false, retryCount: 0, scheduledTime: at };
  ownRuns.add(run);
  return run;
};

/**
 * An alarm as the code has it, each run the runtime begins seen, and the
 * alarm it leaves read before it ends, while the runtime runs no other.
 * A test's own call (ownRun) is left alone.
 */
const watched = (taken: Alarm): Alarm =>
  async function watchedAlarm(this: DurableObject, invocation) {
    const info = [invocation];
    if (ownRuns.has(invocation)) {
      await Reflect.apply(taken, this, info);
      return;
    }
    const runs = runsOf(this.ctx);
    runs.going = true;
    wake(runs);
    try {
      // Settle's own alarm, set after the runtime took this run up, only
      // to wait on it: gone as it begins, as the run keeps an alarm set
      // before it ends and would run again for it.
      if (
        runs.own !== undefined &&
        invocation.scheduledTime !== runs.own &&
        (await this.ctx.storage.getAlarm()) === runs.own
      ) {
        await this.ctx.storage.deleteAlarm();
      }
      await Reflect.apply(taken, this, info);
      runs.last = {
        left: await this.ctx.storage.getAlarm(),
        scheduled: invocation.scheduledTime,
      };
    } catch (error) {
      runs.threw = { ended: runs.ended + 1, error };
      throw error;
    } finally {
      runs.going = false;
      runs.ended += 1;
      wake(runs);
    }
  };

/** Waits on the object's runs as they begin and end until `done`. */
const until = async (runs: Runs, done: () => boolean): Promise<void> => {
  while (!done()) {
    // oxlint-disable-next-line no-await-in-loop -- until it is done
    await runs.next.promise;
  }
};

/**
 * Inside the object, waits until no run of its alarm is going or due:
 * each the runtime has taken up among them, begun or not. "now" brings
 * one set for later to now first, as the runtime would run it then; one
 * for later is otherwise kept, and hides a run taken up before a call set
 * it (Alarm.setBy, as GroupDO's photos are swept). A run that ends
 * throwing after it is called fails the wait, as the runtime would only
 * run it again. Whether an alarm was set as it was called.
 */
export const settle = async (
  state: DurableObjectState,
  when: "as set" | "now"
): Promise<boolean> => {
  const { storage } = state;
  const runs = runsOf(state);
  await until(runs, () => !runs.going);
  // No run begins while storage answers, so none is missed from here.
  const since = runs.ended;
  const set = await storage.getAlarm();
  if (when === "as set" && set !== null && set > vi.getRealSystemTime()) {
    return true;
  }
  for (;;) {
    const own = vi.getRealSystemTime() + 1;
    runs.own = own;
    let left: number | null;
    try {
      // oxlint-disable-next-line no-await-in-loop -- again for one left due
      await storage.setAlarm(own);
      do {
        const after = runs.ended;
        // oxlint-disable-next-line no-await-in-loop -- each run as it ends
        await until(runs, () => !runs.going && runs.ended > after);
        if (runs.threw !== undefined && runs.threw.ended > since) {
          throw new Error("An alarm's run threw", { cause: runs.threw.error });
        }
        ({ left } = runs.last);
      } while (left === own && runs.last.scheduled !== own);
    } finally {
      runs.own = undefined;
    }
    if (left === null || left > vi.getRealSystemTime()) {
      return set !== null;
    }
  }
};

/**
 * The object's alarm run now, as the runtime runs it, and each due after
 * it: whether one was set (settle).
 */
export const runAlarm = async (stub: DurableObjectStub): Promise<boolean> =>
  await runInDurableObject(
    stub,
    async (_, state) => await settle(state, "now")
  );

/** Waits until no run of the object's alarm is going or due (settle). */
export const alarmsSettled = async (stub: DurableObjectStub): Promise<void> => {
  await runInDurableObject(stub, async (_, state) => {
    await settle(state, "as set");
  });
};

/** The object's alarm, as set now. */
export const alarmOf = async (
  stub: DurableObjectStub
): Promise<number | null> =>
  await runInDurableObject(
    stub,
    async (_, state) => await state.storage.getAlarm()
  );

/** How many runs of the object's alarm the runtime has ended. */
export const alarmRunsOf = async (stub: DurableObjectStub): Promise<number> =>
  await runInDurableObject(stub, (_, state) => runsOf(state).ended);

/** The objects the running test leaves with no run going or due. */
const afterTest = new Map<string, () => DurableObjectStub>();

/**
 * Has the object settled after the running test: a run that outlived its
 * test would call the next test's spies.
 */
export const settleAfterTest = (
  name: string,
  stub: () => DurableObjectStub
) => {
  afterTest.set(name, stub);
};

/** The classes whose alarms are watched, with each alarm as the code has it. */
const classes = [GroupDO, UserDO].map((kind) => ({
  kind,
  // oxlint-disable-next-line typescript/unbound-method -- called with each object as this
  taken: kind.prototype.alarm,
}));

/**
 * Watches every Durable Object's alarm in each test, for it to wait on:
 * the runtime still runs each at its time. Outside vi's mocks, so a test
 * restoring its own leaves it in place.
 */
export const watchAlarms = (): void => {
  beforeAll(() => {
    for (const { kind, taken } of classes) {
      kind.prototype.alarm = watched(taken);
    }
  });
  afterEach(async () => {
    for (const stub of afterTest.values()) {
      // oxlint-disable-next-line no-await-in-loop -- one object at a time
      await alarmsSettled(stub());
    }
    afterTest.clear();
  });
  afterAll(() => {
    for (const { kind, taken } of classes) {
      kind.prototype.alarm = taken;
    }
  });
};
