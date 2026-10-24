package app.pochical.kit

import android.Manifest
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.ParcelFileDescriptor
import android.os.Process
import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import app.pochical.v1.DayField
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The emulator's Wi-Fi and cellular, switched with `svc wifi` against the server `mise run server`
 * runs on this computer (LocalServerTest): as Wi-Fi comes back, Android makes it the default while
 * cellular lingers unlost, and the user's socket moves to it at once rather than staying on cellular
 * until it is torn down.
 */
@RunWith(AndroidJUnit4::class)
class NetworkSwitchTest {
  private val instrumentation = InstrumentationRegistry.getInstrumentation()
  private val context = instrumentation.targetContext
  private val server = InstrumentationRegistry.getArguments().getString("server")!!.toHttpUrl()
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
  private val connectivity = context.getSystemService(ConnectivityManager::class.java)

  init {
    instrumentation.uiAutomation.grantRuntimePermission(context.packageName, Manifest.permission.ACCESS_LOCAL_NETWORK)
  }

  @After
  fun end() {
    shell("svc wifi enable")
    scope.cancel()
  }

  @Test
  fun anEditRightAfterWifiTakesOverReachesTheServerOverIt() = runBlocking<Unit> {
    val database = AppDatabase.open(context, inMemory = true)
    val sessions = SessionStore(BlockStoreBytes(context, "e2e-switch").also { it.forget() })
    val http = OkHttpClient()
    val account = SyncAccount(database, sessions, server, http, scope, DefaultNetworkWatch(context))
    val edits = OwnEdits(database)

    shell("svc wifi disable")
    withTimeout(30_000) { while (!defaultIs(NetworkCapabilities.TRANSPORT_CELLULAR)) delay(50) }
    account.foreground()
    withTimeout(20_000) { account.userSocket.first { it == SocketState.Current } }
    // Sign-in's connection, kept for reuse, would be told from the socket by nothing in the kernel's tables.
    http.connectionPool.evictAll()
    Log.i(TAG, "Socket current over cellular")

    shell("svc wifi enable")
    withTimeout(30_000) { while (!defaultIs(NetworkCapabilities.TRANSPORT_WIFI)) delay(20) }
    val switchedMs = System.currentTimeMillis()
    val wifi = connectivity.getLinkProperties(connectivity.activeNetwork)!!.linkAddresses.map { it.address.hostAddress }
    edits.setDay("2026-10-25", DayField.DAY_FIELD_NOTE, "Wi-Fiに切り替えた直後")
    Log.i(TAG, "Wi-Fi ($wifi) is the default; edit made")

    withTimeout(20_000) { database.sync().lastWaiting().first { it == null } }
    val ackedMs = System.currentTimeMillis() - switchedMs
    withTimeout(20_000) { while (socketsFrom().let { it.isEmpty() || !wifi.containsAll(it) }) delay(50) }
    val movedMs = System.currentTimeMillis() - switchedMs
    Log.i(TAG, "Edit acknowledged $ackedMs ms after the switch; the socket went from Wi-Fi within $movedMs ms")
    assertTrue("acknowledged in $ackedMs ms", ackedMs < 5_000)
    assertTrue("moved to Wi-Fi in $movedMs ms", movedMs < 5_000)
  }

  /** The local addresses of this app's established TCP connections to the server, from the kernel's tables. */
  private fun socketsFrom(): List<String> {
    val uid = Process.myUid().toString()
    val serverPort = "%04X".format(server.port)
    return (shell("cat /proc/net/tcp") + shell("cat /proc/net/tcp6")).lines().mapNotNull { line ->
      val fields = line.trim().split(Regex("\\s+"))
      val established = fields.size > 7 && fields[3] == "01" && fields[2].endsWith(":$serverPort") && fields[7] == uid
      if (established) ipv4(fields[1].substringBefore(':').takeLast(8)) else null
    }
  }

  /** /proc/net's hex of an IPv4 address, its bytes in the host's order (little-endian). */
  private fun ipv4(hex: String) = hex.chunked(2).reversed().joinToString(".") { it.toInt(16).toString() }

  private fun defaultIs(transport: Int) =
    connectivity.getNetworkCapabilities(connectivity.activeNetwork)?.hasTransport(transport) == true

  private fun shell(command: String): String =
    ParcelFileDescriptor.AutoCloseInputStream(instrumentation.uiAutomation.executeShellCommand(command)).use {
      it.readBytes().decodeToString()
    }

  private companion object {
    const val TAG = "PochicalE2E"
  }
}
