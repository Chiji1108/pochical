package app.pochical.repeat

import androidx.compose.runtime.saveable.Saver
import java.time.LocalDate
import java.time.temporal.ChronoUnit

/**
 * An order being typed on a month (spec/shift-patterns.md, Typing an order): the shifts typed, the
 * order's 1st day ([anchor]), and the framed day among those typed, none for the day after them. It
 * is typed as ポチポチ入力 enters days: a key fills the framed day and the frame moves on, 翌日へ moves
 * it without typing, and 消す takes the framed day out, those after it closing up.
 */
data class OrderTyping(val sequence: List<String>, val anchor: LocalDate, val framed: Int? = null) {
  /** Where typing goes: the framed day, else the day after those typed. */
  val cursor: Int
    get() = framed ?: sequence.size

  /** The day typing goes to. */
  val cursorDay: LocalDate
    get() = anchor.plusDays(cursor.toLong())

  /** On the day after those typed, there is nothing to take out or move past. */
  val onTyped: Boolean
    get() = framed != null

  /** A key: on the framed day, the frame moving on. */
  fun pick(shift: String): OrderTyping {
    val at = framed
    val typed = if (at != null && at < sequence.size) sequence.toMutableList().apply { set(at, shift) } else sequence + shift
    return copy(sequence = typed).movedOn()
  }

  /** 翌日へ: the frame to the next day, at most the one after those typed. */
  fun movedOn(): OrderTyping {
    val next = cursor + 1
    return copy(framed = next.takeIf { it < sequence.size })
  }

  /** 消す: the framed day taken out, those after it closing up. */
  fun cleared(): OrderTyping {
    val at = framed ?: return this
    if (at >= sequence.size) return this
    val typed = sequence.toMutableList().apply { removeAt(at) }
    return copy(sequence = typed, framed = at.takeIf { it < typed.size })
  }

  /**
   * A day pressed: one typed takes the frame, as the day after them does; any other moves the order
   * to start there, what was typed kept.
   */
  fun pressed(day: LocalDate): OrderTyping {
    val index = ChronoUnit.DAYS.between(anchor, day)
    return when {
      index in 0 until sequence.size -> copy(framed = index.toInt())
      index == sequence.size.toLong() -> copy(framed = null)
      else -> copy(anchor = day, framed = null)
    }
  }

  companion object {
    /** Kept across a configuration change and the process's death. */
    val saver: Saver<OrderTyping, Any> =
      Saver(
        save = { arrayListOf(it.sequence.joinToString(" "), it.anchor.toString(), it.framed ?: -1) },
        restore = { saved ->
          val (sequence, anchor, framed) = saved as List<*>
          OrderTyping((sequence as String).split(" ").filter(String::isNotEmpty), LocalDate.parse(anchor as String), (framed as Int).takeIf { it >= 0 })
        },
      )
  }
}
