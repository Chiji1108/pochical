package app.pochical.kit

import android.content.Context
import java.io.File
import okhttp3.HttpUrl
import okhttp3.OkHttpClient

/** What uploads the chat photos of a device the test names, in folders of its own on the phone. */
internal fun linePhotos(context: Context, http: OkHttpClient, server: HttpUrl, name: String): LinePhotos =
  LinePhotos(
    Photos(http, server, File(context.cacheDir, "e2e-$name/held")),
    ChatPhotoFiles(File(context.cacheDir, "e2e-$name"), File(context.filesDir, "e2e-$name")),
    PhotoUploads(),
  )
