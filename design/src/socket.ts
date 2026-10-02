// How the apps keep their sync sockets (spec/sync-protocol.md, Sockets),
// in one place: apps/server imports them, and `mise run gen` writes them
// out for the native apps (SyncSocket.swift, SyncSocket.kt) and as JSON
// (spec/design-tokens.json).
export const socketRules = {
  // How often, in milliseconds, a device sends keepaliveText while a
  // socket is open, well inside the idle time networks close a quiet
  // connection after.
  keepaliveEveryMs: 30_000,
  // The server's answer to keepaliveText, given without waking the
  // Durable Object.
  keepaliveReply: "pong",
  // The text message a device sends to keep a socket alive; the one text
  // message the protocol allows.
  keepaliveText: "ping",
  // How long, in milliseconds, a device waits for keepaliveReply before it
  // takes the socket for dead, closes it and reconnects.
  keepaliveWithinMs: 10_000,
  // The most a device waits before its first try to reconnect, in
  // milliseconds; twice as long each try that fails in a row, up to
  // reconnectMostMs. Each wait is drawn at random up to that most, so
  // devices cut off together do not come back together.
  reconnectFirstMs: 1000,
  reconnectMostMs: 60_000,
} as const;
