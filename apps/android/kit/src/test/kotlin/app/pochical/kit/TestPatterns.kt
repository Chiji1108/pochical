package app.pochical.kit

import app.pochical.v1.Pattern
import app.pochical.v1.PatternKt
import app.pochical.v1.pattern

/** A pattern named [name] with a star for its mark, as the server takes one, and [more] set. */
fun markedPattern(name: String, more: PatternKt.Dsl.() -> Unit = {}): Pattern = pattern {
  this.name = name
  emoji = "⭐️"
  symbol = firstCharacter(name)
  icon = "star"
  more()
}
