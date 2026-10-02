// How long a device waits before it tries to reconnect a sync socket
// (spec/sync-protocol.md, Reconnecting), as the native apps work it out;
// the web keeps no socket itself, and spec/vectors/reconnect.json checks
// this against them.
import { socketRules } from "@pochical/design/socket";

// The most a device may wait before its `tries`th try since the last
// Welcome: the first wait doubled for each try before it, up to the most.
export function reconnectWaitMost(
  tries: number,
  firstMs: number = socketRules.reconnectFirstMs,
  mostMs: number = socketRules.reconnectMostMs
) {
  return Math.min(firstMs * 2 ** (tries - 1), mostMs);
}
