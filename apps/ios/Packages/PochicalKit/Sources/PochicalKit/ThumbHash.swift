import CoreGraphics
import Foundation

/// A photo's ThumbHash (https://evanw.github.io/thumbhash/, spec/chat.md,
/// Photos): a few bytes its sender makes, from which a blur of the photo
/// is drawn where it will be while it comes. Ported from Evan Wallace's
/// reference (MIT), which /design uses as the `thumbhash` package.
public enum ThumbHash {
  /// The longest side a photo is drawn at to make its ThumbHash, the most
  /// the format reads.
  static let maxEdge = 100

  /// The ThumbHash of a photo as it is sent, drawn at most `maxEdge` on
  /// its longer side; nil when it cannot be drawn.
  public static func of(_ image: CGImage) -> Data? {
    let scale = min(Double(maxEdge) / Double(max(image.width, image.height)), 1)
    let width = max(1, Int((Double(image.width) * scale).rounded()))
    let height = max(1, Int((Double(image.height) * scale).rounded()))
    var rgba = [UInt8](repeating: 0, count: width * height * 4)
    // Opaque, as the JPEG it goes as. The buffer holds the top row first,
    // as encode reads it.
    let drawn = rgba.withUnsafeMutableBytes { pixels -> Bool in
      guard
        let context = CGContext(
          data: pixels.baseAddress, width: width, height: height, bitsPerComponent: 8,
          bytesPerRow: width * 4, space: CGColorSpace(name: CGColorSpace.sRGB)!,
          bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)
      else { return false }
      context.interpolationQuality = .high
      context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
      return true
    }
    guard drawn else { return nil }
    for index in stride(from: 3, to: rgba.count, by: 4) {
      rgba[index] = 255
    }
    return encode(width: width, height: height, rgba: rgba)
  }

  /// The blur a ThumbHash draws, at most 32 pixels on its longer side, to
  /// be stretched to its photo's place; nil for bytes that are not one.
  public static func image(_ hash: Data) -> CGImage? {
    guard let (width, height, rgba) = decode(hash),
      let provider = CGDataProvider(data: Data(rgba) as CFData)
    else { return nil }
    return CGImage(
      width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 32,
      bytesPerRow: width * 4, space: CGColorSpace(name: CGColorSpace.sRGB)!,
      bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.last.rawValue), provider: provider,
      decode: nil, shouldInterpolate: true, intent: .defaultIntent)
  }

  /// Encodes an image, its RGBA not premultiplied, at most 100 by 100.
  public static func encode(width w: Int, height h: Int, rgba: [UInt8]) -> Data {
    precondition(w <= maxEdge && h <= maxEdge && rgba.count == w * h * 4)
    // The average color.
    var avgR = 0.0
    var avgG = 0.0
    var avgB = 0.0
    var avgA = 0.0
    for i in 0..<(w * h) {
      let j = i * 4
      let alpha = Double(rgba[j + 3]) / 255
      avgR += alpha / 255 * Double(rgba[j])
      avgG += alpha / 255 * Double(rgba[j + 1])
      avgB += alpha / 255 * Double(rgba[j + 2])
      avgA += alpha
    }
    if avgA > 0 {
      avgR /= avgA
      avgG /= avgA
      avgB /= avgA
    }

    let hasAlpha = avgA < Double(w * h)
    let lLimit = hasAlpha ? 5 : 7
    let longer = max(w, h)
    let lx = max(1, Int(round(Double(lLimit * w) / Double(longer))))
    let ly = max(1, Int(round(Double(lLimit * h) / Double(longer))))
    var l = [Double](repeating: 0, count: w * h)
    var p = [Double](repeating: 0, count: w * h)
    var q = [Double](repeating: 0, count: w * h)
    var a = [Double](repeating: 0, count: w * h)

    // RGBA to LPQA, over the average color.
    for i in 0..<(w * h) {
      let j = i * 4
      let alpha = Double(rgba[j + 3]) / 255
      let r = avgR * (1 - alpha) + alpha / 255 * Double(rgba[j])
      let g = avgG * (1 - alpha) + alpha / 255 * Double(rgba[j + 1])
      let b = avgB * (1 - alpha) + alpha / 255 * Double(rgba[j + 2])
      l[i] = (r + g + b) / 3
      p[i] = (r + g) / 2 - b
      q[i] = r - g
      a[i] = alpha
    }

    // The DCT: a constant term, and varying ones scaled to 0...1.
    func encodeChannel(_ channel: [Double], _ nx: Int, _ ny: Int) -> (Double, [Double], Double) {
      var dc = 0.0
      var ac: [Double] = []
      var scale = 0.0
      var fx = [Double](repeating: 0, count: w)
      for cy in 0..<ny {
        var cx = 0
        while cx * ny < nx * (ny - cy) {
          var f = 0.0
          for x in 0..<w {
            fx[x] = cos(Double.pi / Double(w) * Double(cx) * (Double(x) + 0.5))
          }
          for y in 0..<h {
            let fy = cos(Double.pi / Double(h) * Double(cy) * (Double(y) + 0.5))
            for x in 0..<w {
              f += channel[x + y * w] * fx[x] * fy
            }
          }
          f /= Double(w * h)
          if cx > 0 || cy > 0 {
            ac.append(f)
            scale = max(scale, abs(f))
          } else {
            dc = f
          }
          cx += 1
        }
      }
      if scale > 0 {
        ac = ac.map { 0.5 + 0.5 / scale * $0 }
      }
      return (dc, ac, scale)
    }
    let (lDC, lAC, lScale) = encodeChannel(l, max(3, lx), max(3, ly))
    let (pDC, pAC, pScale) = encodeChannel(p, 3, 3)
    let (qDC, qAC, qScale) = encodeChannel(q, 3, 3)
    let (aDC, aAC, aScale) = hasAlpha ? encodeChannel(a, 5, 5) : (0, [], 0)

    // The constants.
    let isLandscape = w > h
    let header24 =
      Int(round(63 * lDC)) | (Int(round(31.5 + 31.5 * pDC)) << 6)
      | (Int(round(31.5 + 31.5 * qDC)) << 12) | (Int(round(31 * lScale)) << 18)
      | ((hasAlpha ? 1 : 0) << 23)
    let header16 =
      (isLandscape ? ly : lx) | (Int(round(63 * pScale)) << 3) | (Int(round(63 * qScale)) << 9)
      | ((isLandscape ? 1 : 0) << 15)
    var hash: [UInt8] = [
      UInt8(header24 & 255), UInt8((header24 >> 8) & 255), UInt8(header24 >> 16),
      UInt8(header16 & 255), UInt8(header16 >> 8),
    ]
    let acStart = hasAlpha ? 6 : 5
    var acIndex = 0
    if hasAlpha {
      hash.append(UInt8(Int(round(15 * aDC)) | (Int(round(15 * aScale)) << 4)))
    }

    // The varying terms, four bits each.
    for ac in hasAlpha ? [lAC, pAC, qAC, aAC] : [lAC, pAC, qAC] {
      for f in ac {
        let at = acStart + (acIndex >> 1)
        if at >= hash.count {
          hash.append(0)
        }
        hash[at] |= UInt8(Int(round(15 * f)) << ((acIndex & 1) << 2))
        acIndex += 1
      }
    }
    return Data(hash)
  }

  /// Decodes a ThumbHash to an RGBA image, not premultiplied, at most 32
  /// on its longer side; nil for bytes too short to be one.
  public static func decode(_ data: Data) -> (width: Int, height: Int, rgba: [UInt8])? {
    let hash = [UInt8](data)
    guard hash.count >= 5 else { return nil }
    // The constants.
    let header24 = Int(hash[0]) | (Int(hash[1]) << 8) | (Int(hash[2]) << 16)
    let header16 = Int(hash[3]) | (Int(hash[4]) << 8)
    let lDC = Double(header24 & 63) / 63
    let pDC = Double((header24 >> 6) & 63) / 31.5 - 1
    let qDC = Double((header24 >> 12) & 63) / 31.5 - 1
    let lScale = Double((header24 >> 18) & 31) / 31
    let hasAlpha = (header24 >> 23) != 0
    let pScale = Double((header16 >> 3) & 63) / 63
    let qScale = Double((header16 >> 9) & 63) / 63
    let isLandscape = (header16 >> 15) != 0
    let lx = max(3, isLandscape ? (hasAlpha ? 5 : 7) : header16 & 7)
    let ly = max(3, isLandscape ? header16 & 7 : (hasAlpha ? 5 : 7))
    guard !hasAlpha || hash.count >= 6 else { return nil }
    let aDC = hasAlpha ? Double(hash[5] & 15) / 15 : 1
    let aScale = hasAlpha ? Double(hash[5] >> 4) / 15 : 0

    // The varying terms, with saturation boosted 1.25 times for their
    // rounding. One past the end reads as nothing.
    let acStart = hasAlpha ? 6 : 5
    var acIndex = 0
    func decodeChannel(_ nx: Int, _ ny: Int, _ scale: Double) -> [Double] {
      var ac: [Double] = []
      for cy in 0..<ny {
        var cx = cy > 0 ? 0 : 1
        while cx * ny < nx * (ny - cy) {
          let at = acStart + (acIndex >> 1)
          let byte = at < hash.count ? Int(hash[at]) : 0
          ac.append((Double((byte >> ((acIndex & 1) << 2)) & 15) / 7.5 - 1) * scale)
          acIndex += 1
          cx += 1
        }
      }
      return ac
    }
    let lAC = decodeChannel(lx, ly, lScale)
    let pAC = decodeChannel(3, 3, pScale * 1.25)
    let qAC = decodeChannel(3, 3, qScale * 1.25)
    let aAC = hasAlpha ? decodeChannel(5, 5, aScale) : []

    // The DCT back to RGB.
    let ratio = aspectRatio(hash)
    let w = Int(round(ratio > 1 ? 32 : 32 * ratio))
    let h = Int(round(ratio > 1 ? 32 / ratio : 32))
    var rgba = [UInt8](repeating: 0, count: w * h * 4)
    let nx = max(lx, hasAlpha ? 5 : 3)
    let ny = max(ly, hasAlpha ? 5 : 3)
    var fx = [Double](repeating: 0, count: nx)
    var fy = [Double](repeating: 0, count: ny)
    var i = 0
    for y in 0..<h {
      for x in 0..<w {
        var l = lDC
        var p = pDC
        var q = qDC
        var a = aDC
        for cx in 0..<nx {
          fx[cx] = cos(Double.pi / Double(w) * (Double(x) + 0.5) * Double(cx))
        }
        for cy in 0..<ny {
          fy[cy] = cos(Double.pi / Double(h) * (Double(y) + 0.5) * Double(cy))
        }
        var j = 0
        for cy in 0..<ly {
          var cx = cy > 0 ? 0 : 1
          let fy2 = fy[cy] * 2
          while cx * ly < lx * (ly - cy) {
            l += lAC[j] * fx[cx] * fy2
            cx += 1
            j += 1
          }
        }
        j = 0
        for cy in 0..<3 {
          var cx = cy > 0 ? 0 : 1
          let fy2 = fy[cy] * 2
          while cx < 3 - cy {
            let f = fx[cx] * fy2
            p += pAC[j] * f
            q += qAC[j] * f
            cx += 1
            j += 1
          }
        }
        if hasAlpha {
          j = 0
          for cy in 0..<5 {
            var cx = cy > 0 ? 0 : 1
            let fy2 = fy[cy] * 2
            while cx < 5 - cy {
              a += aAC[j] * fx[cx] * fy2
              cx += 1
              j += 1
            }
          }
        }
        let b = l - 2 / 3 * p
        let r = (3 * l - b + q) / 2
        let g = r - q
        rgba[i] = byte(r)
        rgba[i + 1] = byte(g)
        rgba[i + 2] = byte(b)
        rgba[i + 3] = byte(a)
        i += 4
      }
    }
    return (w, h, rgba)
  }

  /// A 0...1 value as a byte, cut as a Uint8Array cuts it.
  private static func byte(_ value: Double) -> UInt8 {
    UInt8(max(0, 255 * min(1, value)))
  }

  /// The photo's width over its height, roughly.
  private static func aspectRatio(_ hash: [UInt8]) -> Double {
    let header = Int(hash[3])
    let hasAlpha = hash[2] & 0x80 != 0
    let isLandscape = hash[4] & 0x80 != 0
    let lx = isLandscape ? (hasAlpha ? 5 : 7) : header & 7
    let ly = isLandscape ? header & 7 : (hasAlpha ? 5 : 7)
    return Double(lx) / Double(max(ly, 1))
  }
}
