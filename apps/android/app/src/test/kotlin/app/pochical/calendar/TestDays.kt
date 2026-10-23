package app.pochical.calendar

import app.pochical.kit.AppDatabase
import app.pochical.kit.OwnEdits
import java.io.Closeable
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.robolectric.RuntimeEnvironment

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
