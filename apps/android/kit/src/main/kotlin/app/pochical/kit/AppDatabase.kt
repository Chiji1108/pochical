package app.pochical.kit

import android.content.Context
import androidx.room3.Database
import androidx.room3.Room
import androidx.room3.RoomDatabase
import androidx.room3.withReadTransaction
import androidx.room3.withWriteTransaction
import androidx.sqlite.SQLiteConnection
import androidx.sqlite.execSQL

/**
 * The device's database: what it holds of the user's own values and of their groups, and its outbox
 * (spec/sync-protocol.md).
 *
 * Nothing is released yet, so what the device stores changes shape with no migration: a new
 * [VERSION] erases the database, which syncs again from the server (AGENTS.md). Room refuses to open
 * a database whose shape changed under the same version, and CI fails a build that rewrites the
 * schema `kit/schemas` holds for a version, so a shape change cannot ship without its version raised.
 * At release, destructive migration is turned off and migrations follow from then on.
 */
@Database(
  version = AppDatabase.VERSION,
  entities =
    [
      DayRow::class,
      PatternRow::class,
      PatternOrderRow::class,
      RepeatOrderRow::class,
      CoworkerRow::class,
      CoworkerOrderRow::class,
      PreferenceRow::class,
      ServerValue::class,
      OutboxEdit::class,
      SyncState::class,
      GroupRow::class,
      GroupMemberRow::class,
      MemberDayRow::class,
      MemberPatternRow::class,
      MemberOrderRow::class,
      GroupCursorRow::class,
      ProfileRow::class,
      ChatLineRow::class,
      ReadMarkRow::class,
      ChatOutboxRow::class,
      UnreadCountRow::class,
      BlockRow::class,
      ChatMuteRow::class,
      ChatNotificationSettingsRow::class,
      ChatDraftRow::class,
    ],
)
abstract class AppDatabase : RoomDatabase() {
  internal abstract fun sync(): SyncDao

  /** What the screens read, as it changes. */
  abstract fun values(): Values

  /** Runs [block] in one write transaction, as everything sync takes in or sends from does. */
  internal suspend fun <T> write(block: suspend SyncDao.() -> T): T = withWriteTransaction { sync().block() }

  /** Runs [block] in one read transaction, as what a socket sends is read. */
  internal suspend fun <T> read(block: suspend SyncDao.() -> T): T = withReadTransaction { sync().block() }

  /**
   * The user whose data the database holds, the one the device is signed in as, known without the
   * network or a session as the app wakes in the background; null while it is no one's.
   */
  suspend fun owner(): String? = read { state().owner }.ifEmpty { null }

  companion object {
    const val VERSION = 9

    /** The app's database in [context]'s files, or one in memory alone for tests. */
    fun open(context: Context, inMemory: Boolean = false): AppDatabase =
      (if (inMemory) Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java)
        else Room.databaseBuilder(context, AppDatabase::class.java, "pochical.db"))
        .fallbackToDestructiveMigration(dropAllTables = true)
        .addCallback(TakeAllAgainIfOlder)
        .build()
  }
}

/**
 * A device that took its values under an older sync schema than the app's moves every cursor back
 * to the start, its User DO's and every group's, so its next Hellos bring everything again, read as
 * the app reads now (spec/sync-protocol.md, Change log and cursor). Its values stay until
 * overwritten, so its screens still show offline, and its outboxes stay to send. Its chats' lines
 * go, as at a Reset: a catch-up from the start brings only each chat's latest page, so a change to
 * an earlier line held would never come; they come again as pages.
 */
private object TakeAllAgainIfOlder : RoomDatabase.Callback() {
  override suspend fun onOpen(connection: SQLiteConnection) {
    // One transaction, so the schema is never raised without its cursors rewound.
    connection.execSQL("BEGIN IMMEDIATE")
    for (table in listOf("chatLines", "readMarks")) {
      connection.execSQL("DELETE FROM $table WHERE (SELECT schema FROM syncState WHERE id = 1) < $SYNC_SCHEMA")
    }
    connection.execSQL(
      "UPDATE groupCursors SET cursor = 0 WHERE (SELECT schema FROM syncState WHERE id = 1) < $SYNC_SCHEMA"
    )
    connection.execSQL("UPDATE syncState SET cursor = 0, schema = $SYNC_SCHEMA WHERE schema < $SYNC_SCHEMA")
    connection.execSQL("COMMIT")
  }
}
