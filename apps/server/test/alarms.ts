import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import type { DurableObject } from "cloudflare:workers";
import { afterAll, afterEach, beforeAll, vi } from "vitest";

import { GroupDO } from "../src/group-do";
import { UserDO } from "../src/user-do";

// Durable Objects' alarms in tests, run by the runtime alone: each one set
// is taken up once due, begins, and ends, and a test waits on those steps.
// Taken up, an alarm reads as none, though the pool begins it only once
// it has fetched the Worker's module from vitest's main process; so each
// is followed from when it is set, not only from when it begins.

/**
 * A Durable Object's alarm, by its storage: when the one set and not yet
 * begun is due, how many runs the runtime has begun, those still going,
 * and who waits for the next to begin.
 */
type Alarm = {
  begun: number;
  due: number | undefined;
  running: Set<Promise<void>>;
  waiting: Set<() => void>;
};

const alarms = new WeakMap<DurableObjectStorage, Alarm>();

/** The alarms the running test has set or run, settled after it. */
const touched = new Set<Alarm>();

const alarmOf = (storage: DurableObjectStorage): Alarm => {
  let alarm = alarms.get(storage);
  if (alarm === undefined) {
    alarm = {
      begun: 0,
      due: undefined,
      running: new Set(),
      waiting: new Set(),
    };
    alarms.set(storage, alarm);
  }
  touched.add(alarm);
  return alarm;
};

const dueOf = (time: number | Date | null): number | undefined =>
  time === null ? undefined : new Date(time).getTime();

/** Due by the runtime's clock, which a test holding Date does not stop. */
const isDue = ({ due }: Alarm): boolean =>
  due !== undefined && due <= vi.getRealSystemTime();

const nextBegun = async (alarm: Alarm): Promise<void> => {
  const { promise, resolve } = Promise.withResolvers<undefined>();
  alarm.waiting.add(() => {
    resolve(undefined);
  });
  await promise;
};

/**
 * Waits until no run of the alarm is going and none set is due: each run
 * the runtime has taken up ended, begun or not. A run that threw fails
 * the wait, as the runtime would only run it again.
 */
const settled = async (alarm: Alarm): Promise<void> => {
  for (;;) {
    if (alarm.running.size > 0) {
      // oxlint-disable-next-line no-await-in-loop -- until none runs
      for (const run of await Promise.allSettled(alarm.running)) {
        if (run.status === "rejected") {
          throw new Error("An alarm's run threw", { cause: run.reason });
        }
      }
    } else if (isDue(alarm)) {
      // oxlint-disable-next-line no-await-in-loop -- the runtime begins it
      await nextBegun(alarm);
    } else {
      return;
    }
  }
};

type Run = (
  this: DurableObject,
  ...info: [AlarmInvocationInfo?]
) => Promise<void>;

/**
 * An alarm as the code has it, each run the runtime begins seen. A test's
 * own call, which carries nothing of what it was run for, is left alone.
 */
const watched = (taken: Run): Run =>
  async function watchedAlarm(this: DurableObject, ...info) {
    if (info[0] === undefined) {
      await Reflect.apply(taken, this, info);
      return;
    }
    const { storage } = this.ctx;
    const alarm = alarmOf(storage);
    alarm.begun += 1;
    for (const wake of alarm.waiting) {
      wake();
    }
    alarm.waiting.clear();
    const run = (async () => {
      // Taken up, it reads as none, unless set again since.
      alarm.due = dueOf(await storage.getAlarm());
      await Reflect.apply(taken, this, info);
    })();
    alarm.running.add(run);
    try {
      await run;
    } finally {
      alarm.running.delete(run);
    }
  };

/** The classes whose alarms are watched, with each alarm as the code has it. */
const classes = [GroupDO, UserDO].map((kind) => ({
  kind,
  // oxlint-disable-next-line typescript/unbound-method -- called with each object as this
  taken: kind.prototype.alarm,
}));

/** Storage's alarm writes as the runtime has them. */
type Writes = Pick<
  DurableObjectStorage,
  "deleteAlarm" | "deleteAll" | "getAlarm" | "setAlarm"
>;

/** Storage's class, while watched, with its writes as the runtime has them. */
let storageClass: { prototype: object; taken: Writes } | undefined;

/**
 * An alarm write as the runtime has it, its alarm told: one set and not
 * yet taken up never runs once deleted, while one taken up still does.
 */
const watchedWrites = ({
  deleteAlarm,
  deleteAll,
  getAlarm,
  setAlarm,
}: Writes) => {
  const deleting = <Options>(
    write: (this: DurableObjectStorage, options?: Options) => Promise<void>
  ) =>
    async function deleted(this: DurableObjectStorage, options?: Options) {
      const set = await Reflect.apply(getAlarm, this, []);
      const written = Reflect.apply(write, this, [options]);
      if (set !== null) {
        alarmOf(this).due = undefined;
      }
      await written;
    };
  return {
    deleteAlarm: deleting(deleteAlarm),
    deleteAll: deleting(deleteAll),
    async setAlarm(
      this: DurableObjectStorage,
      ...args: Parameters<DurableObjectStorage["setAlarm"]>
    ) {
      alarmOf(this).due = dueOf(args[0]);
      await Reflect.apply(setAlarm, this, args);
    },
  };
};

/**
 * Watches every Durable Object's alarm in each test, for it to wait on
 * (runAlarm, alarmsSettled): the runtime still runs each at its time, one
 * at a time. Outside vi's mocks, so a test restoring its own leaves it in
 * place. After each test, its alarms are left with no run going or due: a
 * run that outlived its test would call the next test's spies.
 */
export const watchAlarms = (): void => {
  beforeAll(async () => {
    for (const { kind, taken } of classes) {
      kind.prototype.alarm = watched(taken);
    }
    // Storage's class is reached only through an object's.
    storageClass = await runInDurableObject(
      env.GROUPS.getByName("watchAlarms"),
      (_, { storage }) => {
        // oxlint-disable-next-line typescript/unbound-method -- called with each storage as this
        const { deleteAlarm, deleteAll, getAlarm, setAlarm } = storage;
        const prototype = Reflect.getPrototypeOf(storage);
        if (prototype === null) {
          throw new TypeError("Storage is of no class");
        }
        return {
          prototype,
          taken: { deleteAlarm, deleteAll, getAlarm, setAlarm },
        };
      }
    );
    Object.assign(storageClass.prototype, watchedWrites(storageClass.taken));
  });
  afterEach(async () => {
    for (const alarm of touched) {
      // oxlint-disable-next-line no-await-in-loop -- one alarm at a time
      await settled(alarm);
    }
    touched.clear();
  });
  afterAll(() => {
    if (storageClass !== undefined) {
      Object.assign(storageClass.prototype, storageClass.taken);
    }
    for (const { kind, taken } of classes) {
      kind.prototype.alarm = taken;
    }
  });
};

/**
 * Waits until no run of the object's alarm is going or due, each the
 * runtime has taken up among them, begun or not.
 */
export const alarmsSettled = async (stub: DurableObjectStub): Promise<void> => {
  await runInDurableObject(stub, async (_, state) => {
    await settled(alarmOf(state.storage));
  });
};

/**
 * The object's alarm run now, as the runtime runs it: any run due waited
 * for, then one set for later brought to now, and each run after it. How
 * many runs began meanwhile.
 */
export const runAlarm = async (stub: DurableObjectStub): Promise<number> =>
  await runInDurableObject(stub, async (_, state) => {
    const alarm = alarmOf(state.storage);
    const { begun } = alarm;
    await settled(alarm);
    if ((await state.storage.getAlarm()) !== null) {
      await state.storage.setAlarm(vi.getRealSystemTime());
      await settled(alarm);
    }
    return alarm.begun - begun;
  });
