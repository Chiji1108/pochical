package app.pochical.kit

import android.net.TrafficStats
import java.net.InetAddress
import java.net.Socket
import javax.net.SocketFactory
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.coroutines.executeAsync

/**
 * The server's answer to [request], the one way :kit's plain HTTP calls go (sign-in, photos):
 * cancelling the caller cancels the call, a body still going up with it, as × stops a photo's
 * upload. OkHttp's own coroutine bridge (okhttp-coroutines); the caller closes the response.
 */
internal suspend fun OkHttpClient.answer(request: Request): Response = newCall(request).executeAsync()

/**
 * The one client the kit's calls, sockets and photos go through, its sockets tagged as the app's
 * traffic for the system's network statistics, which StrictMode asks of every socket. Made off the
 * main thread: an OkHttpClient sets up TLS as it is made.
 */
internal fun pochicalHttp(): OkHttpClient = OkHttpClient.Builder().socketFactory(TaggedSockets).build()

/**
 * The system's sockets, made on the thread that goes on to connect them, as OkHttp does: the thread
 * carries the tag the socket takes as it opens.
 */
private object TaggedSockets : SocketFactory() {
  private const val TAG = 0x9C41
  private val sockets = getDefault()

  private fun <T> tagged(make: () -> T): T {
    TrafficStats.setThreadStatsTag(TAG)
    return make()
  }

  override fun createSocket(): Socket = tagged { sockets.createSocket() }

  override fun createSocket(host: String, port: Int): Socket = tagged { sockets.createSocket(host, port) }

  override fun createSocket(host: String, port: Int, localHost: InetAddress, localPort: Int): Socket =
    tagged { sockets.createSocket(host, port, localHost, localPort) }

  override fun createSocket(host: InetAddress, port: Int): Socket = tagged { sockets.createSocket(host, port) }

  override fun createSocket(address: InetAddress, port: Int, localAddress: InetAddress, localPort: Int): Socket =
    tagged { sockets.createSocket(address, port, localAddress, localPort) }
}
