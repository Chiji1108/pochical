// Hybrid logical clocks as spec/sync-protocol.md (HLC) has them: compared
// by physical time, then counter, then device, which only breaks exact
// ties.

export type Clock = { ms: number; counter: number; device: string };

/** Negative when `a` is older than `b`, positive when newer, 0 when equal. */
export const compareClocks = (a: Clock, b: Clock): number => {
  if (a.ms !== b.ms) {
    return a.ms - b.ms;
  }
  if (a.counter !== b.counter) {
    return a.counter - b.counter;
  }
  if (a.device === b.device) {
    return 0;
  }
  return a.device < b.device ? -1 : 1;
};

// The largest counter an Hlc carries (uint32).
const MAX_COUNTER = 0xff_ff_ff_ff;

/** The device the server stamps its own corrections with. */
export const SERVER_DEVICE = "server";

/**
 * A clock just past `seen`, for the server to overwrite a value a device
 * set (spec/sync-protocol.md, Outbox step 5): after what the device wrote,
 * so it takes the correction, but before anything it does next, so its
 * later edits still win.
 */
export const clockAfter = (seen: Clock): Clock => {
  // The counter is a uint32 on the wire: at its end, the next millisecond.
  if (seen.counter >= MAX_COUNTER) {
    return { counter: 0, device: SERVER_DEVICE, ms: seen.ms + 1 };
  }
  return { counter: seen.counter + 1, device: SERVER_DEVICE, ms: seen.ms };
};
