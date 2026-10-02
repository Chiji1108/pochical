// Code generated from design/ by `mise run gen`. Do not edit.

package app.pochical.design

/** How the apps keep their sync sockets (spec/sync-protocol.md, Sockets); times in milliseconds. */
object SyncSocket {
  const val keepaliveEveryMs = 30000
  const val keepaliveReply = "pong"
  const val keepaliveText = "ping"
  const val keepaliveWithinMs = 10000
  const val reconnectFirstMs = 1000
  const val reconnectMostMs = 60000
}
