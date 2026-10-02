// What a device shows of one synced value while its own edits wait in the
// outbox (spec/sync-protocol.md, Outbox), as the native apps keep it; the
// web syncs nothing itself, and spec/vectors/local-edits.json checks this
// against them. A value is null when it is cleared or was never set.

export type LocalValue = {
  // The last change the server sent for the value.
  server: string | null;
  // The device's edits of it not yet acknowledged, in outbox order.
  waiting: { op: string; value: string | null }[];
};

export type LocalEvent =
  | { edit: { op: string; value: string | null } }
  | { change: string | null }
  | { acked: string[] }
  | { reset: true };

export const noValue: LocalValue = { server: null, waiting: [] };

// The latest waiting edit's value, else the server's. The device never
// compares clocks to choose: the server has, and its Changes come before
// the Acked that ends the wait.
export function shownValue({ server, waiting }: LocalValue) {
  const latest = waiting.at(-1);
  return latest === undefined ? server : latest.value;
}

export function takeEvent(state: LocalValue, event: LocalEvent): LocalValue {
  if ("edit" in event) {
    return { ...state, waiting: [...state.waiting, event.edit] };
  }
  if ("change" in event) {
    return { ...state, server: event.change };
  }
  if ("acked" in event) {
    const acked = new Set(event.acked);
    return {
      ...state,
      waiting: state.waiting.filter(({ op }) => !acked.has(op)),
    };
  }
  // A reset drops what the server sent; the outbox stays.
  return { ...state, server: null };
}
