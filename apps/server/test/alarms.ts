import { runInDurableObject } from "cloudflare:test";
import type { DurableObject } from "cloudflare:workers";
import { afterAll, afterEach, beforeAll, vi } from "vitest";

import { GroupDO } from "../src/group-do";
import { UserDO } from "../src/user-do";

// Durable Objects' alarms in tests are run by the runtime alone, one at a
// time for each object, and no switch of the pool, Miniflare or workerd
// turns that off. Once the runtime takes one up it reads as none, though
// the pool begins it only after it has fetched the Worker's module from
// vitest's main process. So a test waits on runs as they begin and end,
// and sets an alarm itself when it reads none: the runtime runs that one
// after any it has taken up.

/** A Durable Object's alarm runs, as the runtime begins and ends them. */
type Runs = {
  ended: number;
  /** The run going: the runtime runs one at a time. */
  going: Promise<void> | undefined;
  /** How the last run ended: the alarm it left set, or why it threw. */
  last: { left: number | null; threw: false } | { error: unknown; threw: true };
  /** Woken as each run begins and ends. */
  next: PromiseWithResolvers<void>;
};

/** Each object's runs, by its id. */
const runsById = new Map<string, Runs>();

const runsOf = (id: DurableObjectId): Runs => {
  const key = id.toString();
  let runs = runsById.get(key);
  if (runs === undefined) {
    runs = {
      ended: 0,
      going: undefined,
      last: { left: null, threw: false },
      next: Promise.withResolvers(),
    };
    runsById.set(key, runs);
  }
  return runs;
};

const wake = (runs: Runs): void => {
  runs.next.resolve();
  runs.next = Promise.withResolvers();
};

/**
 * Due by `soon` or by the runtime's clock, whichever is later: the
 * runtime's, which a test holding Date does not stop.
 */
const isDue = (time: number | null, soon: number): boolean =>
  time !== null && time <= Math.max(soon, vi.getRealSystemTime());

type Alarm = (
  this: DurableObject,
  ...info: [AlarmInvocationInfo?]
) => Promise<void>;

/**
 * An alarm as the code has it, each run the runtime begins seen, and the
 * alarm it leaves read before it ends, while the runtime runs no other.
 * A test's own call, which carries nothing of what it was run for, is
 * left alone.
 */
const watched = (taken: Alarm): Alarm =>
  async function watchedAlarm(this: DurableObject, ...info) {
    if (info[0] === undefined) {
      await Reflect.apply(taken, this, info);
      return;
    }
    const runs = runsOf(this.ctx.id);
    const run = (async () => {
      await Reflect.apply(taken, this, info);
      runs.last = { left: await this.ctx.storage.getAlarm(), threw: false };
    })();
    runs.going = run;
    wake(runs);
    try {
      await run;
    } catch (error) {
      runs.last = { error, threw: true };
      throw error;
    } finally {
      runs.going = undefined;
      runs.ended += 1;
      wake(runs);
    }
  };

const noneGoing = async (runs: Runs): Promise<void> => {
  while (runs.going !== undefined) {
    // oxlint-disable-next-line no-await-in-loop -- until none is going
    await runs.going;
  }
};

/**
 * Inside the object, waits until no run of its alarm is going or due:
 * each the runtime has taken up among them, begun or not. "now" brings
 * one set for later to now first, as the runtime would run it then. A
 * run that throws fails the wait, as the runtime would only run it again.
 * Whether an alarm was set as it was called.
 *
 * Read as none, an alarm may be taken up and not yet begun, so one is
 * set for the next millisecond, which the runtime runs after it, or runs
 * with nothing to do. Not for now: one set for the very time of the run
 * taken up is kept but never run. One set for later, kept as it is,
 * hides a run taken up before a call set it (GroupDO's wakeBy).
 */
export const settle = async (
  state: DurableObjectState,
  when: "as set" | "now"
): Promise<boolean> => {
  const { storage } = state;
  const runs = runsOf(state.id);
  await noneGoing(runs);
  // No run begins while storage answers, so none is missed from here.
  const since = runs.ended;
  const soon = vi.getRealSystemTime() + 1;
  const set = await storage.getAlarm();
  const later = set !== null && !isDue(set, soon);
  if (set === null || (later && when === "now")) {
    await storage.setAlarm(soon);
  }
  const owed = !later || when === "now";
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- the run going ends
    await noneGoing(runs);
    const { last } = runs;
    if (runs.ended > since && last.threw) {
      throw new Error("An alarm's run threw", { cause: last.error });
    }
    const due =
      runs.ended === since ? owed : !last.threw && isDue(last.left, soon);
    if (!due) {
      return set !== null;
    }
    // oxlint-disable-next-line no-await-in-loop -- the runtime begins one
    await runs.next.promise;
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
