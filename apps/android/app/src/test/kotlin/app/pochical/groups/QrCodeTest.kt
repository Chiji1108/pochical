package app.pochical.groups

import android.graphics.Color
import app.pochical.kit.inviteLink
import com.google.zxing.BinaryBitmap
import com.google.zxing.RGBLuminanceSource
import com.google.zxing.common.HybridBinarizer
import com.google.zxing.qrcode.QRCodeReader
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class QrCodeTest {
  @Test
  fun anInvitationsCodeReadsAsItsLinkWithAWhiteMargin() {
    val link = inviteLink("Toko2345")
    val qr = qrCode(link)
    val pixels = IntArray(qr.width * qr.height).also { qr.getPixels(it, 0, qr.width, 0, 0, qr.width, qr.height) }
    val read = QRCodeReader().decode(BinaryBitmap(HybridBinarizer(RGBLuminanceSource(qr.width, qr.height, pixels))))
    assertEquals(link, read.text)
    assertEquals("four modules of white round it", Color.WHITE, qr.getPixel(4 * 16 - 1, 4 * 16 - 1))
    assertEquals(Color.BLACK, qr.getPixel(4 * 16, 4 * 16))
  }
}
