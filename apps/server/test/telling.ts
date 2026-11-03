import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterAll, beforeAll } from "vitest";

import { GroupDO } from "../src/group-do";

// A group tells its members' own DOs of a chat's change after it answers
// (GroupDO.tellUnread), and each sends the pushes it sets off before it
// answers the group. A test waits on those tellings, not on time, before
// it looks at what reached a push service, or that nothing did.

/** GroupDO's tellUnread, as the code has it: private, so looked up. */
const lookedUp: unknown = Reflect.get(GroupDO.prototype, "tellUnread");
if (typeof lookedUp !== "function") {
  // Else membersTold would wait on nothing, and pass whatever came.
  throw new TypeError("GroupDO has no tellUnread to watch");
}
const taken = lookedUp;

/** Each group's tellings going, by its state, so they go with it. */
const goingByState = new WeakMap<DurableObjectState, Set<Promise<unknown>>>();

const goingOf = (state: DurableObjectState): Set<Promise<unknown>> => {
  let going = goingByState.get(state);
  if (going === undefined) {
    going = new Set();
    goingByState.set(state, going);
  }
  return going;
};

async function watchedTellUnread(
  this: GroupDO,
  ...told: unknown[]
): Promise<void> {
  const telling = Promise.resolve<unknown>(Reflect.apply(taken, this, told));
  const going = goingOf(this.ctx);
  going.add(telling);
  try {
    await telling;
  } finally {
    going.delete(telling);
  }
}

/**
 * Waits until the group's members' own DOs have taken every change it
 * told them of, and sent the pushes it set off: each telling begins as
 * the group takes the change, before the frames it sends for it arrive.
 */
export const membersTold = async (groupId: string): Promise<void> => {
  await runInDurableObject(env.GROUPS.getByName(groupId), async (_, state) => {
    const going = goingOf(state);
    while (going.size > 0) {
      // oxlint-disable-next-line no-await-in-loop -- and any begun meanwhile
      await Promise.all(going);
    }
  });
};

/** Watches each group's tellings in each test, for it to wait on. */
export const watchTelling = (): void => {
  beforeAll(() => {
    Reflect.set(GroupDO.prototype, "tellUnread", watchedTellUnread);
  });
  afterAll(() => {
    Reflect.set(GroupDO.prototype, "tellUnread", taken);
  });
};
