package app.pochical.kit

/**
 * The most a device waits before a try to reconnect, [tries] counting the tries since a socket last
 * caught up, this one included: [firstMs] doubled for each try before it, up to [mostMs]
 * (spec/vectors/reconnect.json). The wait is drawn at random from 0 up to it.
 */
fun reconnectWaitMost(tries: Int, firstMs: Int, mostMs: Int): Int {
  // Past 31 doublings any wait in milliseconds is at its most.
  val doublings = (tries - 1).coerceIn(0, 31)
  return (firstMs.toLong() shl doublings).coerceAtMost(mostMs.toLong()).toInt()
}
