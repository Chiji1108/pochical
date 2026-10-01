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

/** The device the server stamps its own corrections with. */
export const SERVER_DEVICE = "server";

/**
 * A clock just past `seen`, for the server to overwrite a value a device
 * set: never before now, and always after what the device wrote.
 */
export const clockAfter = (seen: Clock, now: number): Clock =>
  now > seen.ms
    ? { counter: 0, device: SERVER_DEVICE, ms: now }
    : { counter: seen.counter + 1, device: SERVER_DEVICE, ms: seen.ms };
