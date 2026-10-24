import { runInDurableObject } from "cloudflare:test";
import type { DurableObject } from "cloudflare:workers";
import { afterAll, afterEach, beforeAll, vi } from "vitest";

import { Alarm } from "../src/alarm";
import { GroupDO } from "../src/group-do";
import { UserDO } from "../src/user-do";

// Durable Objects' alarms in tests are run by the runtime alone, one at a
// time for each object, and no switch of the pool, Miniflare or workerd
// turns that off. Once the runtime takes one up it reads as none, though
// the pool begins it only after it has fetched the Worker's module from
// vitest's main process: nothing in the object shows such a run. So a
// test asks for a run of its own, through the object's own Alarm, which
// the runtime runs after any it took up: whichever run begins first is
// the one waited on, and the asked-for alarm goes as it begins, since the
// run would keep it as one set earlier and run again for it.

/** A Durable Object's alarm runs, as the runtime begins and ends them. */
type Runs = {
  ended: number;
  /** Whether one is going: the runtime runs one at a time. */
  going: boolean;
  /** The alarm the last to end without throwing left set, read as it ended. */
  left: number | null;
  /** The latest to throw, by how many had ended with it. */
  threw: { ended: number; error: unknown } | undefined;
  /** Woken as each run begins and ends. */
  next: PromiseWithResolvers<void>;
  /** The alarm settle asked for, until a run begins. */
  asked: number | null;
};

/** Each object's runs, by its state, so they go with it. */
const runsByState = new WeakMap<DurableObjectState, Runs>();

const runsOf = (state: DurableObjectState): Runs => {
  let runs = runsByState.get(state);
  if (runs === undefined) {
    runs = {
      asked: null,
      ended: 0,
      going: false,
      left: null,
      next: Promise.withResolvers(),
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

type AlarmHandler = (
  this: DurableObject,
  run: AlarmInvocationInfo
) => Promise<void>;

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
const watched = (handler: AlarmHandler): AlarmHandler =>
  async function watchedAlarm(this: DurableObject, run) {
    if (ownRuns.has(run)) {
      await Reflect.apply(handler, this, [run]);
      return;
    }
    const runs = runsOf(this.ctx);
    runs.going = true;
    wake(runs);
    try {
      if (runs.asked !== null) {
        if ((await this.ctx.storage.getAlarm()) === runs.asked) {
          await this.ctx.storage.deleteAlarm();
        }
        runs.asked = null;
      }
      await Reflect.apply(handler, this, [run]);
      runs.left = await this.ctx.storage.getAlarm();
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

/** The object's own Alarm, which every alarm of it is set through. */
const alarmOfInstance = (instance: object): Alarm => {
  const alarm: unknown = Reflect.get(instance, "alarms");
  if (!(alarm instanceof Alarm)) {
    throw new TypeError("The object sets no alarm through an Alarm");
  }
  return alarm;
};

/**
 * Inside the object, waits until no run of its alarm is going or due:
 * each the runtime has taken up among them, begun or not. "now" runs the
 * alarm now even when it is set for later, as the runtime would run it
 * then; "as set" leaves one set for later, which hides a run taken up
 * before a call set it (Alarm.setBy, as GroupDO's photos are swept). A
 * run that ends throwing fails the wait, as the runtime would only run it
 * again.
 */
export const settle = async (
  instance: object,
  state: DurableObjectState,
  when: "as set" | "now"
): Promise<void> => {
  const runs = runsOf(state);
  await until(runs, () => !runs.going);
  // No run begins while storage answers, so none is missed from here.
  const since = runs.ended;
  const set = await state.storage.getAlarm();
  if (when === "as set" && set !== null && set > vi.getRealSystemTime()) {
    return;
  }
  alarmOfInstance(instance).set(vi.getRealSystemTime());
  runs.asked = await state.storage.getAlarm();
  do {
    const after = runs.ended;
    // oxlint-disable-next-line no-await-in-loop -- each run as it ends
    await until(runs, () => !runs.going && runs.ended > after);
    if (runs.threw !== undefined && runs.threw.ended > since) {
      throw new Error("An alarm's run threw", { cause: runs.threw.error });
    }
  } while (runs.left !== null && runs.left <= vi.getRealSystemTime());
};

/** The object's alarm run now, as the runtime runs it, and each due after it. */
export const runAlarm = async (stub: DurableObjectStub): Promise<void> => {
  await runInDurableObject(stub, async (instance, state) => {
    await settle(instance, state, "now");
  });
};

/** Waits until no run of the object's alarm is going or due (settle). */
export const alarmsSettled = async (stub: DurableObjectStub): Promise<void> => {
  await runInDurableObject(stub, async (instance, state) => {
    await settle(instance, state, "as set");
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
  // oxlint-disable-next-line typescript/unbound-method -- called with each object as this
  handler: kind.prototype.alarm,
  kind,
}));

/**
 * Watches every Durable Object's alarm in each test, for it to wait on:
 * the runtime still runs each at its time. Outside vi's mocks, so a test
 * restoring its own leaves it in place.
 */
export const watchAlarms = (): void => {
  beforeAll(() => {
    for (const { kind, handler } of classes) {
      kind.prototype.alarm = watched(handler);
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
    for (const { kind, handler } of classes) {
      kind.prototype.alarm = handler;
    }
  });
};
