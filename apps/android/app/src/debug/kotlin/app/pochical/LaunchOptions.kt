package app.pochical

import android.content.Intent
import app.pochical.calendar.putSampleDays
import app.pochical.kit.PochicalKit
import java.time.LocalDate

/**
 * What a debug build takes from the intent that launched it, as iOS's Debug builds take launch
 * arguments: the extra `sample` puts in the sample month (AGENTS.md, Android).
 */
suspend fun takeLaunchOptions(intent: Intent, kit: PochicalKit) {
  if (intent.getBooleanExtra("sample", false)) putSampleDays(kit.database, kit.edits, LocalDate.now())
}
