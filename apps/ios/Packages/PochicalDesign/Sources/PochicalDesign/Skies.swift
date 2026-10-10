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
        dark: [0x492E1B, 0x18394B, 0x392F4B],
        darkOn: ["tsukiyo": [0x361D0A, 0x052739, 0x281E39], "kokuban": [0x4F3320, 0x1E3F51, 0x3E3451]])
    case "hakumei":
      SkyLights(
        light: [0xEEECFE, 0xE3F0FE, 0xFEE8E9],
        dark: [0x35314D, 0x21374E, 0x4C2A2D],
        darkOn: ["tsukiyo": [0x241F3A, 0x0F253B, 0x39191C], "kokuban": [0x3A3653, 0x263C54, 0x512F32]])
    case "koori":
      SkyLights(
        light: [0xD3F6FF, 0xEBEDFF, 0xD3F8EF],
        dark: [0x0F3C45, 0x30324F, 0x113E36],
        darkOn: ["tsukiyo": [0x002932, 0x1F213C, 0x012B25], "kokuban": [0x15414B, 0x353854, 0x17433B]])
    case "mikan":
      SkyLights(
        light: [0xFFEBD2, 0xF4F0D1, 0xFFE8EC],
        dark: [0x443116, 0x3B3615, 0x4B2A32],
        darkOn: ["tsukiyo": [0x322004, 0x2A2403, 0x381921], "kokuban": [0x4A371B, 0x413B1B, 0x512F37]])
    case "momo":
      SkyLights(
        light: [0xFEE8EB, 0xFEEBD9, 0xFAE7FF],
        dark: [0x4B2A2F, 0x473018, 0x412D45],
        darkOn: ["tsukiyo": [0x38191E, 0x341E06, 0x2F1C33], "kokuban": [0x512F34, 0x4D351D, 0x46324B]])
    case "ramune":
      SkyLights(
        light: [0xD7F8E8, 0xF2F1D2, 0xD3F6FF],
        dark: [0x193D2F, 0x393716, 0x0F3C45],
        darkOn: ["tsukiyo": [0x052B1E, 0x282504, 0x002932], "kokuban": [0x1E4334, 0x3E3C1B, 0x15414B]])
    case "wakakusa":
      SkyLights(
        light: [0xE6F4D9, 0xF7EFD1, 0xD1F7F7],
        dark: [0x2D3B1E, 0x3D3515, 0x0C3D3D],
        darkOn: ["tsukiyo": [0x1C290D, 0x2C2303, 0x002A2B], "kokuban": [0x324023, 0x433A1A, 0x134343]])
    case "yunagi":
      SkyLights(
        light: [0xFEE9E4, 0xFEE7F1, 0xEAEEFE],
        dark: [0x4C2C24, 0x492A39, 0x2E334F],
        darkOn: ["tsukiyo": [0x381A13, 0x361927, 0x1D223C], "kokuban": [0x513129, 0x4E2F3E, 0x333855]])
    case "theme-cocoa":
      SkyLights(
        light: [0xFEEAE0, 0xFCECD7, 0xFEE8EB],
        dark: [0x472F24, 0x42321D, 0x482D31],
        darkOn: ["tsukiyo": [0x341E13, 0x2F210C, 0x351C20], "kokuban": [0x4C3429, 0x473822, 0x4D3236]])
    case "theme-kissa":
      SkyLights(
        light: [0xFEEADB, 0xFEE9E4, 0xFBEDD1],
        dark: [0x482F1A, 0x4C2C24, 0x413315],
        darkOn: ["tsukiyo": [0x351E08, 0x381A13, 0x2F2203], "kokuban": [0x4E341F, 0x513129, 0x46381A]])
    case "theme-kokuban":
      SkyLights(
        light: [0xDCF6E9, 0xD7F5FC, 0xFEE7F3],
        dark: [0x203C30, 0x1A3B42, 0x442D3A],
        darkOn: ["tsukiyo": [0x0E2A1F, 0x072930, 0x321C28], "kokuban": [0x264135, 0x204048, 0x4A323F]])
    case "theme-matcha":
      SkyLights(
        light: [0xEBF3D5, 0xF9EED1, 0xFEE7F1],
        dark: [0x32391A, 0x3F3414, 0x492A39],
        darkOn: ["tsukiyo": [0x212708, 0x2D2302, 0x361927], "kokuban": [0x373E20, 0x45391A, 0x4E2F3E]])
    case "theme-milktea":
      SkyLights(
        light: [0xFEEADD, 0xFAEDD7, 0xFEE9E8],
        dark: [0x463021, 0x40331D, 0x482D2D],
        darkOn: ["tsukiyo": [0x331F10, 0x2E220B, 0x351C1C], "kokuban": [0x4B3526, 0x463822, 0x4D3232]])
    case "theme-pochical":
      SkyLights(
        light: [0xF4F0D1, 0xDCF7E1, 0xD9F4FF],
        dark: [0x3B3615, 0x223D27, 0x133B49],
        darkOn: ["tsukiyo": [0x2A2403, 0x102B17, 0x012935], "kokuban": [0x413B1B, 0x27422C, 0x19404E]])
    case "theme-sakura":
      SkyLights(
        light: [0xFEE9E4, 0xFEE8EF, 0xF1EBFE],
        dark: [0x4C2C24, 0x4A2A37, 0x392F4B],
        darkOn: ["tsukiyo": [0x381A13, 0x371925, 0x281E39], "kokuban": [0x513129, 0x4F2F3C, 0x3E3451]])
    case "theme-soda":
      SkyLights(
        light: [0xD5F8EA, 0xD3F6FF, 0xF4F0D1],
        dark: [0x163E31, 0x0F3C45, 0x3B3615],
        darkOn: ["tsukiyo": [0x022C20, 0x002932, 0x2A2403], "kokuban": [0x1C4336, 0x15414B, 0x413B1B]])
    case "theme-sumi":
      SkyLights(
        light: [0xE7F0F9, 0xF3EEE3, 0xF0ECF8],
        dark: [0x2E363F, 0x39352A, 0x37333E],
        darkOn: ["tsukiyo": [0x1D252D, 0x282419, 0x25222C], "kokuban": [0x333C45, 0x3E3A2F, 0x3C3844]])
    case "theme-sumire":
      SkyLights(
        light: [0xF5E9FE, 0xEBEDFF, 0xFEE9E8],
        dark: [0x3D2E49, 0x30324F, 0x4C2B2B],
        darkOn: ["tsukiyo": [0x2B1D36, 0x1F213C, 0x39191A], "kokuban": [0x43334E, 0x353854, 0x523030]])
    case "theme-tsukiyo":
      SkyLights(
        light: [0xEEECFE, 0xE3F0FE, 0xD3F6FF],
        dark: [0x35314D, 0x21374E, 0x0F3C45],
        darkOn: ["tsukiyo": [0x241F3A, 0x0F253B, 0x002932], "kokuban": [0x3A3653, 0x263C54, 0x15414B]])
    case "theme-zen":
      SkyLights(
        light: [0xEFF0DE, 0xF5EEDD, 0xE4F3E6],
        dark: [0x363725, 0x3B3523, 0x2A3A2D],
        darkOn: ["tsukiyo": [0x252514, 0x2A2313, 0x19281C], "kokuban": [0x3B3C2A, 0x413A28, 0x2F3F32]])
    default: nil
    }
  }
}
