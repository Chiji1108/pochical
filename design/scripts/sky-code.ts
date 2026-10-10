// Skies.swift and Skies.kt: おたのしみ's skies (src/skies.ts) for the
// native apps, each sky's three lights worked out for light mode and for
// every ground a テーマ draws dark on, so the apps only draw them.
import {
  DARK_GROUND,
  darkGroundOf,
  skies,
  skyLights,
  skyMotion,
  themeSkies,
  themeSkyId,
} from "../src/skies";
import type { Sky } from "../src/skies";
import { presets } from "../src/themes";

const quoted = (text: string) => JSON.stringify(text);

// Every sky by the id the settings keep: those anyone may get, then each
// テーマ's own.
const allSkies: [string, Sky][] = [
  ...Object.entries(skies),
  ...Object.entries(themeSkies).map(([theme, sky]): [string, Sky] => [
    themeSkyId(theme),
    sky,
  ]),
];

// The テーマ drawn dark on a ground of their own, whose dark lights differ.
const ownGrounds = presets
  .map((preset) => preset.id)
  .filter((id) => darkGroundOf(id) !== DARK_GROUND);

const hex = (color: string) => color.slice(1, 7).toUpperCase();

// Three lights as each language lists them.
const swiftLights = (colors: string[]) =>
  `[${colors.map((color) => `0x${hex(color)}`).join(", ")}]`;
const kotlinLights = (colors: string[]) =>
  `listOf(${colors.map((color) => `Color(0xFF${hex(color)})`).join(", ")})`;

export function swiftSkies() {
  const lights = swiftLights;
  return [
    "import SwiftUI",
    "",
    "/// おたのしみ's skies (design/src/skies.ts): three lights each, left,",
    "/// middle and right, in light mode, on the dark screen, and on the",
    "/// grounds of the テーマ that color their own.",
    "public struct SkyLights: Sendable {",
    "  let light: [UInt32]",
    "  let dark: [UInt32]",
    "  /// By the テーマ's id.",
    "  let darkOn: [String: [UInt32]]",
    "",
    "  /// The lights as the テーマ shows them in light or dark.",
    "  public func colors(dark isDark: Bool, theme: String) -> [Color] {",
    "    (isDark ? darkOn[theme] ?? dark : light).map { hex in",
    "      Color(",
    "        red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255,",
    "        blue: Double(hex & 0xFF) / 255)",
    "    }",
    "  }",
    "}",
    "",
    "public enum Skies {",
    "  /// The skies anyone may get, besides the テーマ's own.",
    `  public static let anyone = [${Object.keys(skies).map(quoted).join(", ")}]`,
    "",
    "  /// A テーマ's own sky, kept by its own id so it stays when the テーマ",
    "  /// changes.",
    '  public static func own(_ theme: String) -> String { "theme-\\(theme)" }',
    "",
    "  /// Seconds one sky takes to give way to the next, and one breath of",
    "  /// its light, out and back.",
    `  public static let changeSeconds = ${skyMotion.changeSeconds}`,
    `  public static let breathSeconds = ${skyMotion.breathSeconds}.0`,
    "",
    "  /// A sky's lights by the id the settings keep; none for one not known.",
    "  public static func lights(_ id: String) -> SkyLights? {",
    "    switch id {",
    ...allSkies.map(([id, sky]) => {
      const darkOn = ownGrounds
        .map(
          (theme) =>
            `${quoted(theme)}: ${lights(skyLights(sky, "dark", darkGroundOf(theme)))}`
        )
        .join(", ");
      return [
        `    case ${quoted(id)}:`,
        "      SkyLights(",
        `        light: ${lights(skyLights(sky, "light"))},`,
        `        dark: ${lights(skyLights(sky, "dark"))},`,
        `        darkOn: [${darkOn}])`,
      ].join("\n");
    }),
    "    default: nil",
    "    }",
    "  }",
    "}",
  ];
}

export function kotlinSkies() {
  const lights = kotlinLights;
  return [
    "import androidx.compose.ui.graphics.Color",
    "",
    "/** おたのしみ's skies (design/src/skies.ts): three lights each, left, middle and right, in light mode, on the dark screen, and on the grounds of the テーマ that color their own (by the テーマ's id). */",
    "class SkyLights(val light: List<Color>, val dark: List<Color>, val darkOn: Map<String, List<Color>>) {",
    "  fun colors(dark: Boolean, theme: String): List<Color> =",
    "    if (dark) darkOn[theme] ?: this.dark else light",
    "}",
    "",
    "object Skies {",
    `  val anyone = listOf(${Object.keys(skies).map(quoted).join(", ")})`,
    "",
    '  fun own(theme: String): String = "theme-$theme"',
    "",
    `  const val CHANGE_SECONDS = ${skyMotion.changeSeconds}f`,
    `  const val BREATH_SECONDS = ${skyMotion.breathSeconds}f`,
    "",
    "  val lights: Map<String, SkyLights> = mapOf(",
    ...allSkies.map(([id, sky]) => {
      const darkOn = ownGrounds
        .map(
          (theme) =>
            `${quoted(theme)} to ${lights(skyLights(sky, "dark", darkGroundOf(theme)))}`
        )
        .join(", ");
      return `    ${quoted(id)} to SkyLights(${lights(skyLights(sky, "light"))}, ${lights(skyLights(sky, "dark"))}, mapOf(${darkOn})),`;
    }),
    "  )",
    "}",
  ];
}
