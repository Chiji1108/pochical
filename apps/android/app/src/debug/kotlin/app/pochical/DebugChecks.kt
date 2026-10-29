package app.pochical

import android.os.StrictMode

/**
 * A debug build reports the main thread's disk and network work, and what is left unclosed, as
 * StrictMode finds them, into the log under StrictMode. Called first as the app starts, so the
 * app's own start is checked too.
 */
fun startDebugChecks() {
  StrictMode.setThreadPolicy(StrictMode.ThreadPolicy.Builder().detectAll().penaltyLog().build())
  StrictMode.setVmPolicy(StrictMode.VmPolicy.Builder().detectAll().penaltyLog().build())
}
