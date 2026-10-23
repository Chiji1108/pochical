package app.pochical.kit

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters

/**
 * Sends what the outbox holds once the app has gone to the background, in time the OS gives
 * (spec/sync-protocol.md, Sockets), so an edit made just before leaving reaches the user's other
 * devices and groups though Android ends the app meanwhile. The app's own socket and this share
 * one [SyncAccount], and the server takes each edit once by its op id, so nothing goes twice.
 */
class SendOutboxWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
  override suspend fun doWork(): Result {
    // A session the server no longer knows sends nothing until the person chooses: nothing to retry.
    (applicationContext as PochicalKit.Holder).pochicalKit.account.sendOutbox()
    return Result.success()
  }

  companion object {
    private const val NAME = "pochical.sendOutbox"

    /**
     * Asks for it once the network is there, after any already asked for: one running may be past
     * the edits made since, and one with nothing left to send ends at once.
     */
    fun enqueue(context: Context) {
      WorkManager.getInstance(context)
        .enqueueUniqueWork(
          NAME,
          ExistingWorkPolicy.APPEND_OR_REPLACE,
          OneTimeWorkRequestBuilder<SendOutboxWorker>()
            .setConstraints(Constraints(requiredNetworkType = NetworkType.CONNECTED))
            .build(),
        )
    }
  }
}
