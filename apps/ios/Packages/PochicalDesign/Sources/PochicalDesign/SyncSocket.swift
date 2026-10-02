// Code generated from design/ by `mise run gen`. Do not edit.

/// How the apps keep their sync sockets (spec/sync-protocol.md, Sockets); times in milliseconds.
public enum SyncSocket {
  public static let keepaliveEveryMs = 30000
  public static let keepaliveReply = "pong"
  public static let keepaliveText = "ping"
  public static let keepaliveWithinMs = 10000
  public static let reconnectFirstMs = 1000
  public static let reconnectMostMs = 60000
}
