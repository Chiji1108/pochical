package app.pochical.calendar

import app.pochical.kit.AppDatabase
import app.pochical.kit.OwnEdits
import app.pochical.kit.firstCharacter
import app.pochical.v1.Pattern
import app.pochical.v1.PatternKt
import app.pochical.v1.pattern
import java.io.Closeable
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.robolectric.RuntimeEnvironment

/** A pattern named [name] with a star for its mark, as the server takes one, and [more] set. */
fun markedPattern(name: String, more: PatternKt.Dsl.() -> Unit = {}): Pattern = pattern {
  this.name = name
  emoji = "⭐️"
  symbol = firstCharacter(name)
  icon = "star"
  more()
}

/** The person's days as the app keeps them, over a database in memory. */
class TestDays : Closeable {
  val database = AppDatabase.open(RuntimeEnvironment.getApplication(), inMemory = true)
  val edits = OwnEdits(database)
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
  val days: OwnDays = SyncedDays(database, edits, scope)

  /** The calendar once it shows what [shows] asks for: edits reach it a moment after they are made. */
  fun awaitCalendar(shows: (OwnCalendar) -> Boolean): OwnCalendar = runBlocking {
    withTimeout(5_000) { days.calendar.first(shows) }
  }

  override fun close() {
    scope.cancel()
    database.close()
  }
}
