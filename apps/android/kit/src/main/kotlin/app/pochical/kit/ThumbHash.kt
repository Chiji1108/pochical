package app.pochical.kit

import android.graphics.Bitmap
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * A photo's ThumbHash (https://evanw.github.io/thumbhash/, spec/chat.md, Photos): a few bytes its
 * sender makes, from which a blur of the photo is drawn where it will be while it comes. Ported from
 * Evan Wallace's reference (MIT), as iOS's ThumbHash.swift is, and pinned by spec/vectors/thumbhash.json.
 * No maintained Kotlin library carries it: the reference's own Java port is not published.
 */
object ThumbHash {
  /** The longest side a photo is drawn at to make its ThumbHash, the most the format reads. */
  const val MAX_EDGE = 100

  /** The blur a ThumbHash draws: [width] by [height], at most 32 each, its pixels RGBA, not premultiplied. */
  class Blur(val width: Int, val height: Int, val rgba: ByteArray) {
    /** The blur as a bitmap, to be stretched to its photo's place. */
    fun bitmap(): Bitmap {
      val pixels = IntArray(width * height) { i ->
        val j = i * 4
        (rgba[j + 3].toInt() and 255 shl 24) or (rgba[j].toInt() and 255 shl 16) or (rgba[j + 1].toInt() and 255 shl 8) or (rgba[j + 2].toInt() and 255)
      }
      return Bitmap.createBitmap(pixels, width, height, Bitmap.Config.ARGB_8888)
    }
  }

  /** The ThumbHash of a photo as it is sent, drawn at most [MAX_EDGE] on its longer side. */
  fun of(image: Bitmap): ByteArray {
    val scale = min(MAX_EDGE.toDouble() / max(image.width, image.height), 1.0)
    val width = max(1, (image.width * scale).roundToInt())
    val height = max(1, (image.height * scale).roundToInt())
    val drawn = if (width == image.width && height == image.height) image else Bitmap.createScaledBitmap(image, width, height, true)
    val pixels = IntArray(width * height)
    drawn.getPixels(pixels, 0, width, 0, 0, width, height)
    // Opaque, as the JPEG it goes as; the top row first, as encode reads it.
    val rgba = ByteArray(width * height * 4)
    for ((i, pixel) in pixels.withIndex()) {
      rgba[i * 4] = (pixel shr 16).toByte()
      rgba[i * 4 + 1] = (pixel shr 8).toByte()
      rgba[i * 4 + 2] = pixel.toByte()
      rgba[i * 4 + 3] = 255.toByte()
    }
    return encode(width, height, rgba)
  }

  /** Encodes an image, its RGBA not premultiplied, at most 100 by 100. */
  fun encode(w: Int, h: Int, rgba: ByteArray): ByteArray {
    require(w <= MAX_EDGE && h <= MAX_EDGE && rgba.size == w * h * 4)
    fun at(index: Int) = (rgba[index].toInt() and 255).toDouble()
    // The average color.
    var avgR = 0.0
    var avgG = 0.0
    var avgB = 0.0
    var avgA = 0.0
    for (i in 0 until w * h) {
      val j = i * 4
      val alpha = at(j + 3) / 255
      avgR += alpha / 255 * at(j)
      avgG += alpha / 255 * at(j + 1)
      avgB += alpha / 255 * at(j + 2)
      avgA += alpha
    }
    if (avgA > 0) {
      avgR /= avgA
      avgG /= avgA
      avgB /= avgA
    }

    val hasAlpha = avgA < w * h
    val lLimit = if (hasAlpha) 5 else 7
    val longer = max(w, h)
    val lx = max(1, (lLimit * w.toDouble() / longer).roundUp())
    val ly = max(1, (lLimit * h.toDouble() / longer).roundUp())
    val l = DoubleArray(w * h)
    val p = DoubleArray(w * h)
    val q = DoubleArray(w * h)
    val a = DoubleArray(w * h)

    // RGBA to LPQA, over the average color.
    for (i in 0 until w * h) {
      val j = i * 4
      val alpha = at(j + 3) / 255
      val r = avgR * (1 - alpha) + alpha / 255 * at(j)
      val g = avgG * (1 - alpha) + alpha / 255 * at(j + 1)
      val b = avgB * (1 - alpha) + alpha / 255 * at(j + 2)
      l[i] = (r + g + b) / 3
      p[i] = (r + g) / 2 - b
      q[i] = r - g
      a[i] = alpha
    }

    // The DCT: a constant term, and varying ones scaled to 0..1.
    class Channel(val dc: Double, val ac: List<Double>, val scale: Double)
    fun encodeChannel(channel: DoubleArray, nx: Int, ny: Int): Channel {
      var dc = 0.0
      val ac = mutableListOf<Double>()
      var scale = 0.0
      val fx = DoubleArray(w)
      for (cy in 0 until ny) {
        var cx = 0
        while (cx * ny < nx * (ny - cy)) {
          var f = 0.0
          for (x in 0 until w) fx[x] = cos(PI / w * cx * (x + 0.5))
          for (y in 0 until h) {
            val fy = cos(PI / h * cy * (y + 0.5))
            for (x in 0 until w) f += channel[x + y * w] * fx[x] * fy
          }
          f /= w * h
          if (cx > 0 || cy > 0) {
            ac += f
            scale = max(scale, abs(f))
          } else {
            dc = f
          }
          cx++
        }
      }
      return Channel(dc, if (scale > 0) ac.map { 0.5 + 0.5 / scale * it } else ac, scale)
    }
    val lc = encodeChannel(l, max(3, lx), max(3, ly))
    val pc = encodeChannel(p, 3, 3)
    val qc = encodeChannel(q, 3, 3)
    val ac = if (hasAlpha) encodeChannel(a, 5, 5) else null

    // The constants.
    val isLandscape = w > h
    val header24 =
      (63 * lc.dc).roundUp() or ((31.5 + 31.5 * pc.dc).roundUp() shl 6) or
        ((31.5 + 31.5 * qc.dc).roundUp() shl 12) or ((31 * lc.scale).roundUp() shl 18) or
        ((if (hasAlpha) 1 else 0) shl 23)
    val header16 =
      (if (isLandscape) ly else lx) or ((63 * pc.scale).roundUp() shl 3) or ((63 * qc.scale).roundUp() shl 9) or
        ((if (isLandscape) 1 else 0) shl 15)
    val hash = mutableListOf(header24 and 255, (header24 shr 8) and 255, header24 shr 16, header16 and 255, header16 shr 8)
    val acStart = if (hasAlpha) 6 else 5
    var acIndex = 0
    if (ac != null) hash += (15 * ac.dc).roundUp() or ((15 * ac.scale).roundUp() shl 4)

    // The varying terms, four bits each.
    for (channel in listOfNotNull(lc, pc, qc, ac)) {
      for (f in channel.ac) {
        val index = acStart + (acIndex shr 1)
        if (index >= hash.size) hash += 0
        hash[index] = hash[index] or ((15 * f).roundUp() shl ((acIndex and 1) shl 2))
        acIndex++
      }
    }
    return ByteArray(hash.size) { hash[it].toByte() }
  }

  /** Decodes a ThumbHash to its blur, at most 32 on its longer side; null for bytes too short to be one. */
  fun decode(hash: ByteArray): Blur? {
    if (hash.size < 5) return null
    fun byte(index: Int) = hash[index].toInt() and 255
    // The constants.
    val header24 = byte(0) or (byte(1) shl 8) or (byte(2) shl 16)
    val header16 = byte(3) or (byte(4) shl 8)
    val lDC = (header24 and 63) / 63.0
    val pDC = ((header24 shr 6) and 63) / 31.5 - 1
    val qDC = ((header24 shr 12) and 63) / 31.5 - 1
    val lScale = ((header24 shr 18) and 31) / 31.0
    val hasAlpha = (header24 shr 23) != 0
    val pScale = ((header16 shr 3) and 63) / 63.0
    val qScale = ((header16 shr 9) and 63) / 63.0
    val isLandscape = (header16 shr 15) != 0
    val lx = max(3, if (isLandscape) (if (hasAlpha) 5 else 7) else header16 and 7)
    val ly = max(3, if (isLandscape) header16 and 7 else (if (hasAlpha) 5 else 7))
    if (hasAlpha && hash.size < 6) return null
    val aDC = if (hasAlpha) (byte(5) and 15) / 15.0 else 1.0
    val aScale = if (hasAlpha) (byte(5) shr 4) / 15.0 else 0.0

    // The varying terms, with saturation boosted 1.25 times for their rounding. One past the end
    // reads as nothing.
    val acStart = if (hasAlpha) 6 else 5
    var acIndex = 0
    fun decodeChannel(nx: Int, ny: Int, scale: Double): DoubleArray {
      val ac = mutableListOf<Double>()
      for (cy in 0 until ny) {
        var cx = if (cy > 0) 0 else 1
        while (cx * ny < nx * (ny - cy)) {
          val index = acStart + (acIndex shr 1)
          val bits = if (index < hash.size) byte(index) else 0
          ac += (((bits shr ((acIndex and 1) shl 2)) and 15) / 7.5 - 1) * scale
          acIndex++
          cx++
        }
      }
      return ac.toDoubleArray()
    }
    val lAC = decodeChannel(lx, ly, lScale)
    val pAC = decodeChannel(3, 3, pScale * 1.25)
    val qAC = decodeChannel(3, 3, qScale * 1.25)
    val aAC = if (hasAlpha) decodeChannel(5, 5, aScale) else DoubleArray(0)

    // The DCT back to RGB.
    val ratio = aspectRatio(hash)
    val w = (if (ratio > 1) 32.0 else 32 * ratio).roundUp()
    val h = (if (ratio > 1) 32 / ratio else 32.0).roundUp()
    val rgba = ByteArray(w * h * 4)
    val nx = max(lx, if (hasAlpha) 5 else 3)
    val ny = max(ly, if (hasAlpha) 5 else 3)
    val fx = DoubleArray(nx)
    val fy = DoubleArray(ny)
    var i = 0
    for (y in 0 until h) {
      for (x in 0 until w) {
        var l = lDC
        var p = pDC
        var q = qDC
        var a = aDC
        for (cx in 0 until nx) fx[cx] = cos(PI / w * (x + 0.5) * cx)
        for (cy in 0 until ny) fy[cy] = cos(PI / h * (y + 0.5) * cy)
        var j = 0
        for (cy in 0 until ly) {
          var cx = if (cy > 0) 0 else 1
          val fy2 = fy[cy] * 2
          while (cx * ly < lx * (ly - cy)) {
            l += lAC[j] * fx[cx] * fy2
            cx++
            j++
          }
        }
        j = 0
        for (cy in 0 until 3) {
          var cx = if (cy > 0) 0 else 1
          val fy2 = fy[cy] * 2
          while (cx < 3 - cy) {
            val f = fx[cx] * fy2
            p += pAC[j] * f
            q += qAC[j] * f
            cx++
            j++
          }
        }
        if (hasAlpha) {
          j = 0
          for (cy in 0 until 5) {
            var cx = if (cy > 0) 0 else 1
            val fy2 = fy[cy] * 2
            while (cx < 5 - cy) {
              a += aAC[j] * fx[cx] * fy2
              cx++
              j++
            }
          }
        }
        val b = l - 2.0 / 3 * p
        val r = (3 * l - b + q) / 2
        val g = r - q
        rgba[i] = toByte(r)
        rgba[i + 1] = toByte(g)
        rgba[i + 2] = toByte(b)
        rgba[i + 3] = toByte(a)
        i += 4
      }
    }
    return Blur(w, h, rgba)
  }

  /** A 0..1 value as a byte, cut as a Uint8Array cuts it. */
  private fun toByte(value: Double): Byte = max(0.0, 255 * min(1.0, value)).toInt().toByte()

  /** The photo's width over its height, roughly. */
  private fun aspectRatio(hash: ByteArray): Double {
    val header = hash[3].toInt() and 255
    val hasAlpha = (hash[2].toInt() and 0x80) != 0
    val isLandscape = (hash[4].toInt() and 0x80) != 0
    val lx = if (isLandscape) (if (hasAlpha) 5 else 7) else header and 7
    val ly = if (isLandscape) header and 7 else (if (hasAlpha) 5 else 7)
    return lx.toDouble() / max(ly, 1)
  }

  /** Rounded as the reference's Math.round rounds, a half up; every value rounded here is not below 0. */
  private fun Double.roundUp(): Int = Math.round(this).toInt()
}
