package app.pochical.kit

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network

/**
 * What the OS says of the network (spec/sync-protocol.md, Keepalive; Reconnecting): the sockets
 * close at once as it goes, rather than waiting for their keepalive, and try at once as it comes
 * back.
 */
interface NetworkWatch {
  fun watch(lost: () -> Unit, back: () -> Unit)
}

/** The device's default network, as ConnectivityManager tells of it. */
class DefaultNetworkWatch(private val context: Context) : NetworkWatch {
  override fun watch(lost: () -> Unit, back: () -> Unit) {
    val connectivity = context.getSystemService(ConnectivityManager::class.java)
    connectivity.registerDefaultNetworkCallback(
      object : ConnectivityManager.NetworkCallback() {
        // Only after one went: the OS also says a network is there as the watch begins.
        private var gone = false

        override fun onAvailable(network: Network) {
          if (gone) back()
          gone = false
        }

        override fun onLost(network: Network) {
          gone = true
          lost()
        }
      }
    )
  }
}
