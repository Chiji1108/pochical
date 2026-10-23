package app.pochical.kit

import app.pochical.v1.Hlc

/**
 * A clock as an edit carries it, ordered by physical time, then counter, then device, which only
 * breaks exact ties (spec/vectors/hlc.json). A device shows what the server has decided
 * (spec/vectors/local-edits.json) and compares clocks only for what a waiting order takes back
 * (spec/vectors/order-clears.json).
 */
data class Clock(val ms: Long, val counter: UInt, val device: String) : Comparable<Clock> {
  // Device ids are ASCII (spec/sync-protocol.md, HLC), where UTF-16 order is the characters' codes.
  override fun compareTo(other: Clock): Int =
    compareValuesBy(this, other, Clock::ms, Clock::counter, Clock::device)

  companion object {
    fun of(hlc: Hlc) = Clock(hlc.physicalMs, hlc.counter.toUInt(), hlc.deviceId)
  }
}

/** A device's last hybrid logical clock (spec/sync-protocol.md, HLC); its edits add the device's id. */
data class HlcTime(val ms: Long, val counter: UInt) {
  /** The clock of a local edit after this one, at the device's corrected [now]. */
  fun tick(now: Long): HlcTime =
    when {
      now > ms -> HlcTime(now, 0u)
      counter == UInt.MAX_VALUE -> HlcTime(ms + 1, 0u)
      else -> HlcTime(ms, counter + 1u)
    }

  /** The device's last clock once it takes a change, so its next edit orders after the change. */
  fun receiving(remote: HlcTime): HlcTime =
    if (remote.ms > ms || (remote.ms == ms && remote.counter > counter)) remote else this

  fun stamped(device: String): Hlc =
    Hlc.newBuilder().setPhysicalMs(ms).setCounter(counter.toInt()).setDeviceId(device).build()

  companion object {
    val start = HlcTime(0, 0u)

    fun of(hlc: Hlc) = HlcTime(hlc.physicalMs, hlc.counter.toUInt())
  }
}

/**
 * What the device adds to its own time to correct it: the server's time at Welcome against the
 * middle of the round trip from Hello, divided as whole numbers.
 */
fun clockOffset(sentMs: Long, receivedMs: Long, serverMs: Long): Long =
  serverMs - (sentMs + receivedMs) / 2
