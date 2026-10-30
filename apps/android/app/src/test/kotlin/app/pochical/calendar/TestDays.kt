package app.pochical.calendar

import app.pochical.kit.AppDatabase
import app.pochical.kit.OwnEdits
import app.pochical.kit.firstCharacter
import app.pochical.kit.ownCalendar
import app.pochical.v1.Pattern
import app.pochical.v1.PatternKt
import app.pochical.v1.pattern
import androidx.compose.ui.test.junit4.ComposeTestRule
import java.io.Closeable
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.job
import kotlinx.coroutines.launch
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
  val days: OwnDays = SyncedDays(database, edits, database.ownCalendar(), scope)

  init {
    // Read from the start, as the app's screens read it, so there is a calendar to wait on.
    scope.launch { days.calendar.collect {} }
  }

  /** The calendar once it shows what [shows] asks for: edits reach it a moment after they are made. */
  fun awaitCalendar(shows: (OwnCalendar) -> Boolean): OwnCalendar = runBlocking {
    withTimeout(5_000) { days.calendar.first(shows) }
  }

  /**
   * The calendar once it shows what [shows] asks for, waited on with [compose]'s main thread going
   * on: a page's coroutine resumes there between its writes, as it does in the app.
   */
  fun awaitCalendar(compose: ComposeTestRule, shows: (OwnCalendar) -> Boolean): OwnCalendar {
    compose.waitUntil(5_000) { shows(days.calendar.value) }
    return days.calendar.value
  }

  // The calendar's reads end before the database closes: one still running on another thread would
  // throw past the test, into the next one's.
  override fun close() {
    runBlocking { scope.coroutineContext.job.cancelAndJoin() }
    database.close()
  }
}
