package app.pochical.kit

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.io.File
import java.security.GeneralSecurityException
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json

/**
 * The session the device signed in with (spec/sync-protocol.md, Signing in): its token and the
 * user it is, kept as one. [ended] once the server said it does not know it (a 401, Reconnecting):
 * kept so a relaunch says so too and tries nothing, until the person chooses.
 */
@Serializable
data class StoredSession(val token: String, val userId: String, val ended: Boolean = false)

/** What seals the kept session so that only this app on this device can read it. */
interface SessionSeal {
  fun seal(plain: ByteArray): ByteArray

  /** The plain bytes, or a [GeneralSecurityException] for bytes it cannot open. */
  fun open(sealed: ByteArray): ByteArray
}

/**
 * Where the device keeps its session, sealed. Until release, a kept session the app cannot read
 * (its key gone, as after a restore to another phone, or its shape changed) is no session: the app
 * signs in anew and keeps the new one in its place (AGENTS.md).
 *
 * The spec keeps it in Block Store, so a reinstall or a phone restored from this one comes back as
 * the same user; a Keystore-sealed file goes with the app. Sign-in proper (POC-204) moves it there
 * behind this same read and write.
 */
class SessionStore(private val file: File, private val seal: SessionSeal) {
  private val json = Json { ignoreUnknownKeys = false }

  /** The kept session, or null when there is none the app can read. */
  fun read(): StoredSession? {
    if (!file.exists()) return null
    return try {
      json.decodeFromString(StoredSession.serializer(), seal.open(file.readBytes()).decodeToString())
    } catch (_: GeneralSecurityException) {
      null
    } catch (_: SerializationException) {
      null
    } catch (_: IllegalArgumentException) {
      null
    }
  }

  /** Keeps [session] in place of any before it, in one step. */
  fun write(session: StoredSession) {
    val next = File(file.parentFile, "${file.name}.next")
    next.writeBytes(seal.seal(json.encodeToString(StoredSession.serializer(), session).encodeToByteArray()))
    check(next.renameTo(file)) { "The session could not be kept" }
  }
}

/**
 * Seals with an AES key that Android Keystore holds and never lets out: the sealed file is
 * unreadable anywhere else, a backup restored to another phone included.
 */
class KeystoreSeal(private val alias: String = "pochical.session") : SessionSeal {
  private val keyStore by lazy { KeyStore.getInstance(KEYSTORE).apply { load(null) } }

  private fun key(): SecretKey =
    (keyStore.getKey(alias, null) as SecretKey?)
      ?: KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
        .apply {
          init(
            KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
              .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
              .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
              .setKeySize(256)
              .build()
          )
        }
        .generateKey()

  override fun seal(plain: ByteArray): ByteArray {
    val cipher = Cipher.getInstance(TRANSFORMATION).apply { init(Cipher.ENCRYPT_MODE, key()) }
    return byteArrayOf(cipher.iv.size.toByte()) + cipher.iv + cipher.doFinal(plain)
  }

  override fun open(sealed: ByteArray): ByteArray {
    val key = keyStore.getKey(alias, null) as SecretKey? ?: throw GeneralSecurityException("No key to open it")
    val ivSize = sealed.firstOrNull()?.toInt() ?: throw GeneralSecurityException("Empty")
    if (sealed.size < 1 + ivSize) throw GeneralSecurityException("Too short")
    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, sealed, 1, ivSize))
    return cipher.doFinal(sealed, 1 + ivSize, sealed.size - 1 - ivSize)
  }

  private companion object {
    const val KEYSTORE = "AndroidKeyStore"
    const val TRANSFORMATION = "AES/GCM/NoPadding"
  }
}
