package app.pochical.kit

import android.content.Context
import com.google.android.gms.auth.blockstore.Blockstore
import com.google.android.gms.auth.blockstore.DeleteBytesRequest
import com.google.android.gms.auth.blockstore.RetrieveBytesRequest
import com.google.android.gms.auth.blockstore.StoreBytesData
import com.google.android.gms.common.api.ApiException
import kotlinx.coroutines.tasks.await
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json

/**
 * The session the device signed in with (spec/sync-protocol.md, Signing in): its token, the user it
 * is and the account that user is linked to, kept as one, so a session never names another user's
 * account. [ended] once the server said it does not know it (a 401, Reconnecting): kept so a
 * relaunch says so too and tries nothing, until the person chooses.
 */
@Serializable
data class StoredSession(
  val token: String,
  val userId: String,
  val ended: Boolean = false,
  /** Null while the user is anonymous. */
  val linked: LinkedAccount? = null,
)

/**
 * What the store keeps, as one value: the device's session, null after the device let go of its
 * user (its account deleted, or はじめから使う) until it signs in anew; and the sessions of the anonymous users switches to an account's data left
 * behind, each kept until the server deletes that user (spec/sync-protocol.md, Switching to an
 * account in use), whatever the device's session does meanwhile.
 */
@Serializable
private data class Kept(val session: StoredSession? = null, val leftBehind: List<String> = emptyList())

/** The store cannot be reached now, as without Google Play services: nothing in it is lost. */
class StoreUnreachable(cause: Throwable) : Exception(cause)

/** Bytes kept for the app outside it, under one key. */
interface KeptBytes {
  /** The bytes, null when none are kept, or [StoreUnreachable]. */
  suspend fun read(): ByteArray?

  /** Keeps [bytes] in place of those before, or [StoreUnreachable]. */
  suspend fun write(bytes: ByteArray)
}

/**
 * Where the device keeps its session. Until release, a kept session the app cannot read (its shape
 * changed) is no session: the app signs in anew and keeps the new one in its place (AGENTS.md). A
 * store it cannot reach is not unreadable: [read] says so, and nothing is forgotten.
 */
class SessionStore(private val kept: KeptBytes) {
  private val json = Json { ignoreUnknownKeys = false }

  /** The kept session, or null when there is none the app can read; [StoreUnreachable]. */
  suspend fun read(): StoredSession? = keptNow().session

  /** Keeps [session] in place of any before it; [StoreUnreachable]. */
  suspend fun write(session: StoredSession) = change { it.copy(session = session) }

  /** The sessions of the users switches left behind, not deleted yet; [StoreUnreachable]. */
  suspend fun leftBehind(): List<String> = keptNow().leftBehind

  /**
   * Keeps [session], switched to, in place of the one before, whose token [leaving] is kept to
   * delete its user, in one write; [StoreUnreachable].
   */
  suspend fun switchTo(session: StoredSession, leaving: String) =
    change { Kept(session, it.leftBehind + leaving) }

  /** The user of the session [token] left behind is deleted: it is kept no more; [StoreUnreachable]. */
  suspend fun deleted(token: String) = change { it.copy(leftBehind = it.leftBehind - token) }

  /** Keeps no session from now on, as after the account is deleted, the ones left behind kept; [StoreUnreachable]. */
  suspend fun forgetSession() = change { it.copy(session = null) }

  private suspend fun keptNow(): Kept {
    val bytes = kept.read() ?: return Kept()
    return try {
      json.decodeFromString(Kept.serializer(), bytes.decodeToString())
    } catch (_: SerializationException) {
      Kept()
    } catch (_: IllegalArgumentException) {
      Kept()
    }
  }

  private suspend fun change(change: (Kept) -> Kept) {
    kept.write(json.encodeToString(Kept.serializer(), change(keptNow())).encodeToByteArray())
  }
}

/**
 * Google Play services' Block Store, which keeps the bytes through the app's reinstall and moves
 * them to a new phone restored from this one, and to Google's cloud backup only while it can
 * encrypt them end to end (a screen lock set), as an encrypted backup carries the iOS Keychain's.
 */
class BlockStoreBytes(context: Context, private val key: String = "app.pochical.session") : KeptBytes {
  private val client = Blockstore.getClient(context)

  override suspend fun read(): ByteArray? = reaching {
    client.retrieveBytes(RetrieveBytesRequest.Builder().setKeys(listOf(key)).build()).await().blockstoreDataMap[key]?.bytes
  }

  override suspend fun write(bytes: ByteArray) = reaching {
    val toCloud = client.isEndToEndEncryptionAvailable.await()
    client
      .storeBytes(StoreBytesData.Builder().setKey(key).setBytes(bytes).setShouldBackupToCloud(toCloud).build())
      .await()
    Unit
  }

  /** Forgets the bytes, as a test starting afresh does. */
  suspend fun forget() = reaching {
    client.deleteBytes(DeleteBytesRequest.Builder().setKeys(listOf(key)).build()).await()
    Unit
  }

  private suspend fun <T> reaching(body: suspend () -> T): T =
    try {
      body()
    } catch (e: ApiException) {
      throw StoreUnreachable(e)
    }
}
