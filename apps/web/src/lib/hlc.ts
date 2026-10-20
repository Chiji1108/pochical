// A device's hybrid logical clock (spec/sync-protocol.md, HLC), as the
// native apps keep it; the web syncs nothing itself, and
// spec/vectors/hlc.json checks this against them.

// A device's last clock: its edits add their device id.
export type HlcTime = { ms: number; counter: number };

// A clock's counter is a uint32 on the wire.
const MAX_COUNTER = 0xff_ff_ff_ff;

const isAfter = (a: HlcTime, b: HlcTime) =>
  a.ms > b.ms || (a.ms === b.ms && a.counter > b.counter);

// The clock of a local edit, after the device's last one, at its
// corrected now.
export function tick(last: HlcTime, now: number): HlcTime {
  if (now > last.ms) {
    return { counter: 0, ms: now };
  }
  if (last.counter >= MAX_COUNTER) {
    return { counter: 0, ms: last.ms + 1 };
  }
  return { counter: last.counter + 1, ms: last.ms };
}

// The device's last clock once it takes a change, so its next edit
// orders after the change.
export function receive(last: HlcTime, remote: HlcTime): HlcTime {
  return isAfter(remote, last)
    ? { counter: remote.counter, ms: remote.ms }
    : last;
}

// What the device adds to its own time to correct it, from when it sent
// Hello, when Welcome arrived and Welcome's server_ms: the server's time
// against the middle of the round trip.
export function clockOffset({
  sentMs,
  receivedMs,
  serverMs,
}: {
  sentMs: number;
  receivedMs: number;
  serverMs: number;
}) {
  return serverMs - Math.floor((sentMs + receivedMs) / 2);
}
