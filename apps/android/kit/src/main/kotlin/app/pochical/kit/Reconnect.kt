package app.pochical.kit

/**
 * The most a device waits before a try to reconnect, [tries] counting the tries since a socket last
 * caught up, this one included: [firstMs] doubled for each try before it, up to [mostMs]
 * (spec/vectors/reconnect.json). The wait is drawn at random from 0 up to it.
 */
fun reconnectWaitMost(tries: Int, firstMs: Int, mostMs: Int): Int {
  var most = firstMs
  repeat(maxOf(tries, 1) - 1) { if (most < mostMs) most *= 2 }
  return minOf(most, mostMs)
}
