package app.pochical.kit

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.util.Log

/**
 * What the OS says of the device's default network (spec/sync-protocol.md, Keepalive;
 * Reconnecting): the sockets close at once as it goes, rather than waiting for their keepalive, and
 * move at once to the one that becomes the default, after none or in place of another.
 */
interface NetworkWatch {
  fun watch(lost: () -> Unit, changed: () -> Unit)
}

/** The device's default network, as ConnectivityManager tells of it. */
class DefaultNetworkWatch(private val context: Context) : NetworkWatch {
  override fun watch(lost: () -> Unit, changed: () -> Unit) {
    val connectivity = context.getSystemService(ConnectivityManager::class.java)
    val default =
      DefaultNetwork(
        connectivity.activeNetwork,
        lost = {
          Log.i(TAG, "No default network")
          lost()
        },
        changed = { network ->
          Log.i(TAG, "Default network now $network")
          changed()
        },
      )
    connectivity.registerDefaultNetworkCallback(
      object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) = default.available(network)

        override fun onLost(network: Network) = default.lost(network)
      }
    )
  }

  private companion object {
    const val TAG = "PochicalNetwork"
  }
}

/**
 * Which network is the default, from a default network callback's onAvailable and onLost, [N] being
 * the OS's handle of a network and [now] the default as the watch begins, null for none. The OS
 * says onAvailable for each network that becomes the default, the one already the default as the
 * watch begins included, but onLost only for the default itself: another taking over is told by
 * its onAvailable alone, while the one before lingers until the OS tears it down.
 */
class DefaultNetwork<N : Any>(
  private var now: N?,
  private val lost: () -> Unit,
  private val changed: (N) -> Unit,
) {
  fun available(network: N) {
    if (network == now) return
    now = network
    changed(network)
  }

  fun lost(network: N) {
    if (network != now) return
    now = null
    lost()
  }
}
