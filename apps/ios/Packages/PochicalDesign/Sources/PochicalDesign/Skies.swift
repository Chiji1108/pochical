// Code generated from design/ by `mise run gen`. Do not edit.

import SwiftUI

/// おたのしみ's skies (design/src/skies.ts): three lights each, left,
/// middle and right, in light mode, on the dark screen, and on the
/// grounds of the テーマ that color their own.
public struct SkyLights: Sendable {
  let light: [UInt32]
  let dark: [UInt32]
  /// By the テーマ's id.
  let darkOn: [String: [UInt32]]

  /// The lights as the テーマ shows them in light or dark.
  public func colors(dark isDark: Bool, theme: String) -> [Color] {
    (isDark ? darkOn[theme] ?? dark : light).map { hex in
      Color(
        red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255,
        blue: Double(hex & 0xFF) / 255)
    }
  }
}

public enum Skies {
  /// The skies anyone may get, besides the テーマ's own.
  public static let anyone = ["asayake", "hakumei", "koori", "mikan", "momo", "ramune", "wakakusa", "yunagi"]

  /// A テーマ's own sky, kept by its own id so it stays when the テーマ
  /// changes.
  public static func own(_ theme: String) -> String { "theme-\(theme)" }

  /// Seconds one sky takes to give way to the next, and one breath of
  /// its light, out and back.
  public static let changeSeconds = 0.9
  public static let breathSeconds = 9.0

  /// A sky's lights by the id the settings keep; none for one not known.
  public static func lights(_ id: String) -> SkyLights? {
    switch id {
    case "asayake":
      SkyLights(
        light: [0xFEEADD, 0xDDF2FF, 0xF1EBFE],
        dark: [0x321906, 0x012334, 0x241A34],
        darkOn: ["tsukiyo": [0x341A07, 0x032536, 0x251C36], "kokuban": [0x3A200E, 0x092B3D, 0x2B223C]])
    case "hakumei":
      SkyLights(
        light: [0xEEECFE, 0xE3F0FE, 0xFEE8E9],
        dark: [0x201B36, 0x0B2137, 0x341518],
        darkOn: ["tsukiyo": [0x211D38, 0x0D2339, 0x36171A], "kokuban": [0x27233E, 0x13293F, 0x3D1D20]])
    case "koori":
      SkyLights(
        light: [0xD3F6FF, 0xEBEDFF, 0xD3F8EF],
        dark: [0x01252C, 0x1B1D37, 0x002721],
        darkOn: ["tsukiyo": [0x00272F, 0x1D1E39, 0x012822], "kokuban": [0x012D36, 0x232540, 0x002F29]])
    case "mikan":
      SkyLights(
        light: [0xFFEBD2, 0xF4F0D1, 0xFFE8EC],
        dark: [0x2E1C01, 0x262000, 0x33151D],
        darkOn: ["tsukiyo": [0x2F1E02, 0x272201, 0x35161E], "kokuban": [0x362407, 0x2D2806, 0x3C1C24]])
    case "momo":
      SkyLights(
        light: [0xFEE8EB, 0xFEEBD9, 0xFAE7FF],
        dark: [0x34151A, 0x301A03, 0x2A172F],
        darkOn: ["tsukiyo": [0x36161C, 0x321C04, 0x2C1930], "kokuban": [0x3C1D22, 0x38220A, 0x321F37]])
    case "ramune":
      SkyLights(
        light: [0xD7F8E8, 0xF2F1D2, 0xD3F6FF],
        dark: [0x01271A, 0x242101, 0x01252C],
        darkOn: ["tsukiyo": [0x02291C, 0x252302, 0x00272F], "kokuban": [0x092F21, 0x2B2907, 0x012D36]])
    case "wakakusa":
      SkyLights(
        light: [0xE6F4D9, 0xF7EFD1, 0xD1F7F7],
        dark: [0x182409, 0x271F00, 0x022626],
        darkOn: ["tsukiyo": [0x19260B, 0x292101, 0x012828], "kokuban": [0x1F2C11, 0x2F2706, 0x012F2F]])
    case "yunagi":
      SkyLights(
        light: [0xFEE9E4, 0xFEE7F1, 0xEAEEFE],
        dark: [0x34160F, 0x311523, 0x191D37],
        darkOn: ["tsukiyo": [0x361810, 0x331725, 0x1B1F39], "kokuban": [0x3D1E16, 0x3A1D2B, 0x212540]])
    case "theme-cocoa":
      SkyLights(
        light: [0xFEEAE0, 0xFCECD7, 0xFEE8EB],
        dark: [0x30190F, 0x2B1D08, 0x30171B],
        darkOn: ["tsukiyo": [0x311B11, 0x2D1F0A, 0x32191D], "kokuban": [0x382117, 0x332510, 0x391F23]])
    case "theme-kissa":
      SkyLights(
        light: [0xFEEADB, 0xFEE9E4, 0xFBEDD1],
        dark: [0x311904, 0x34160F, 0x2B1E00],
        darkOn: ["tsukiyo": [0x331B06, 0x361810, 0x2D1F01], "kokuban": [0x39210C, 0x3D1E16, 0x332506]])
    case "theme-kokuban":
      SkyLights(
        light: [0xDCF6E9, 0xD7F5FC, 0xFEE7F3],
        dark: [0x0A261B, 0x03252C, 0x2D1824],
        darkOn: ["tsukiyo": [0x0C281D, 0x04262E, 0x2F1A26], "kokuban": [0x122E23, 0x0B2D34, 0x361F2C]])
    case "theme-matcha":
      SkyLights(
        light: [0xEBF3D5, 0xF9EED1, 0xFEE7F1],
        dark: [0x1D2305, 0x291E00, 0x311523],
        darkOn: ["tsukiyo": [0x1F2506, 0x2B2001, 0x331725], "kokuban": [0x252B0C, 0x312606, 0x3A1D2B]])
    case "theme-milktea":
      SkyLights(
        light: [0xFEEADD, 0xFAEDD7, 0xFEE9E8],
        dark: [0x2E1A0C, 0x2A1E07, 0x301818],
        darkOn: ["tsukiyo": [0x301C0E, 0x2C1F09, 0x32191A], "kokuban": [0x372214, 0x32250F, 0x391F1F]])
    case "theme-pochical":
      SkyLights(
        light: [0xF4F0D1, 0xDCF7E1, 0xD9F4FF],
        dark: [0x262000, 0x0B2613, 0x002430],
        darkOn: ["tsukiyo": [0x272201, 0x0D2814, 0x012632], "kokuban": [0x2D2806, 0x142E1A, 0x032C3A]])
    case "theme-sakura":
      SkyLights(
        light: [0xFEE9E4, 0xFEE8EF, 0xF1EBFE],
        dark: [0x34160F, 0x321521, 0x241A34],
        darkOn: ["tsukiyo": [0x361810, 0x341723, 0x251C36], "kokuban": [0x3D1E16, 0x3B1D29, 0x2B223C]])
    case "theme-soda":
      SkyLights(
        light: [0xD5F8EA, 0xD3F6FF, 0xF4F0D1],
        dark: [0x00271C, 0x01252C, 0x262000],
        darkOn: ["tsukiyo": [0x01291E, 0x00272F, 0x272201], "kokuban": [0x052F24, 0x012D36, 0x2D2806]])
    case "theme-sumi":
      SkyLights(
        light: [0xE7F0F9, 0xF3EEE3, 0xF0ECF8],
        dark: [0x192129, 0x242015, 0x211E28],
        darkOn: ["tsukiyo": [0x1A222B, 0x252117, 0x23202A], "kokuban": [0x202931, 0x2B271C, 0x292630]])
    case "theme-sumire":
      SkyLights(
        light: [0xF5E9FE, 0xEBEDFF, 0xFEE9E8],
        dark: [0x271932, 0x1B1D37, 0x341516],
        darkOn: ["tsukiyo": [0x291A33, 0x1D1E39, 0x361717], "kokuban": [0x2F203A, 0x232540, 0x3D1D1D]])
    case "theme-tsukiyo":
      SkyLights(
        light: [0xEEECFE, 0xE3F0FE, 0xD3F6FF],
        dark: [0x201B36, 0x0B2137, 0x01252C],
        darkOn: ["tsukiyo": [0x211D38, 0x0D2339, 0x00272F], "kokuban": [0x27233E, 0x13293F, 0x012D36]])
    case "theme-zen":
      SkyLights(
        light: [0xEFF0DE, 0xF5EEDD, 0xE4F3E6],
        dark: [0x212110, 0x251F0F, 0x152418],
        darkOn: ["tsukiyo": [0x222312, 0x272110, 0x17261A], "kokuban": [0x282918, 0x2D2716, 0x1D2C20]])
    default: nil
    }
  }
}
