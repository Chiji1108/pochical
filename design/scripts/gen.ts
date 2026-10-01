// Writes the design tokens out for the native apps and as JSON for anyone
// else: every テーマ's colors worked out for light and dark, the shift
// colors as each テーマ draws them, the text styles and the sizes. Run by
// `mise run gen`; with --check it only reports files that are out of date,
// as CI does.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  colorSchemes,
  markColors,
  neutralTokens,
  untintedTokens,
} from "../src/colors";
import type { ColorScheme } from "../src/colors";
import { GROUP_MAX_MEMBERS, SHARED_DAYS_MAX, textLimits } from "../src/limits";
import {
  HAIRLINE_MAX,
  radii,
  shadows,
  SPACING_STEP,
  sizes,
  springs,
  stateLayers,
} from "../src/metrics";
import {
  colorRoleNames,
  inkShares,
  LIGHT_FILL,
  markPalette,
  noteMarkerSteps,
  presets,
  roleSteps,
  themeRoles,
} from "../src/themes";
import type { Preset } from "../src/themes";
import { textStyles } from "../src/type";

const root = path.join(import.meta.dir, "../..");
const themes: readonly Preset[] = presets;
const HEADER = "Code generated from design/ by `mise run gen`. Do not edit.";

// The schemes a テーマ has: an always-dark one only its dark.
const schemesOf = (preset: Preset): ColorScheme[] =>
  preset.scheme ? [preset.scheme] : [...colorSchemes];

const drawn = (preset: Preset, scheme: ColorScheme) => ({
  marks: markPalette(preset, scheme).map(({ color, tint }) => ({
    color,
    tint,
  })),
  roles: themeRoles(preset, scheme),
});

// The radii from the smallest up.
const radiusScale = Object.entries(radii).toSorted(
  ([, first], [, second]) => first - second
);

// A radius's name as code can spell it: 2xl as xxl.
const radiusName = (name: string) =>
  name.replace(/^(?<times>\d)x/u, (_, times: string) =>
    "x".repeat(Number(times))
  );

// A spring without bounce as Compose has it: SwiftUI's duration is
// 2π / √stiffness, and its bounce 1 - the damping ratio.
const stiffnessOf = (duration: number) =>
  Math.round(((2 * Math.PI) / duration) ** 2 * 100) / 100;

const camel = (name: string) =>
  name.replaceAll(/-(?<letter>[a-z])/gu, (_, letter: string) =>
    letter.toUpperCase()
  );
const pascal = (name: string) => {
  const word = camel(name);
  return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
};

// #rrggbb or #rrggbbaa as its channels.
function channels(hex: string) {
  const rgb = hex.slice(1, 7).toUpperCase();
  const alpha = hex.length > 7 ? hex.slice(7, 9).toUpperCase() : "FF";
  return { alpha, rgb };
}

function swiftColor(hex: string) {
  const { alpha, rgb } = channels(hex);
  return alpha === "FF"
    ? `Color(hex: 0x${rgb})`
    : `Color(hex: 0x${rgb}, alpha: 0x${alpha})`;
}

function kotlinColor(hex: string) {
  const { alpha, rgb } = channels(hex);
  return `Color(0x${alpha}${rgb})`;
}

function json() {
  const tokens = {
    $comment: HEADER,
    colors: {
      // The shift colors' names, in picker order; the first is the
      // テーマ's own color.
      marks: ["テーマカラー", ...markColors.slice(1).map(({ name }) => name)],
      roles: colorRoleNames,
      themes: themes.map((preset) => ({
        alwaysDark: preset.scheme === "dark",
        id: preset.id,
        // What the テーマ is made from, which with `derivation` works out
        // the colors below: the Android app does so for 端末の色, whose
        // accent and grays come from the wallpaper, and can test that it
        // gets these.
        input: preset,
        name: preset.name,
        schemes: Object.fromEntries(
          schemesOf(preset).map((scheme) => [scheme, drawn(preset, scheme)])
        ),
      })),
    },
    derivation: {
      inkShares,
      lightFill: LIGHT_FILL,
      markColors: markColors.map(({ color, dark, tint }) => ({
        dark,
        light: { color, tint },
      })),
      neutrals: neutralTokens.map(({ dark, light, name }) => ({
        dark,
        light,
        name,
        tinted: !untintedTokens.has(name),
      })),
      noteMarkerSteps,
      roleSteps,
    },
    limits: {
      groupMaxMembers: GROUP_MAX_MEMBERS,
      sharedDaysMax: SHARED_DAYS_MAX,
      text: textLimits,
    },
    metrics: {
      hairlineMax: HAIRLINE_MAX,
      radii,
      shadows,
      sizes,
      spacingStep: SPACING_STEP,
      springs,
      stateLayers,
    },
    textStyles,
  };
  return `${JSON.stringify(tokens, null, 2)}\n`;
}

function swift() {
  const colorSets = themes.flatMap((preset) =>
    schemesOf(preset).map((scheme) => {
      const { marks, roles } = drawn(preset, scheme);
      const fields = colorRoleNames.map(
        (name) => `    ${camel(name)}: ${swiftColor(roles[name] ?? "")},`
      );
      const markList = marks.map(
        (mark, index) =>
          `      MarkColor(name: "${index === 0 ? "テーマカラー" : markColors[index]?.name}", color: ${swiftColor(mark.color)}, tint: ${swiftColor(mark.tint)}),`
      );
      return [
        `  static let ${preset.id}${pascal(scheme)} = ThemeColors(`,
        ...fields,
        "    marks: [",
        ...markList,
        "    ]",
        "  )",
      ].join("\n");
    })
  );
  const pick = themes.map((preset) =>
    preset.scheme
      ? `    case .${preset.id}: .${preset.id}${pascal(preset.scheme)}`
      : `    case .${preset.id}: dark ? .${preset.id}Dark : .${preset.id}Light`
  );
  const lines = [
    `// ${HEADER}`,
    "",
    "import SwiftUI",
    "",
    "/// A テーマ in the style settings, by the id that is saved.",
    "public enum Theme: String, CaseIterable, Sendable {",
    ...themes.map((preset) => `  case ${preset.id}`),
    "",
    "  public var name: String {",
    "    switch self {",
    ...themes.map((preset) => `    case .${preset.id}: "${preset.name}"`),
    "    }",
    "  }",
    "",
    "  /// Drawn dark whatever 外観 says.",
    "  public var isAlwaysDark: Bool {",
    "    switch self {",
    ...themes.map(
      (preset) => `    case .${preset.id}: ${preset.scheme === "dark"}`
    ),
    "    }",
    "  }",
    "",
    "  public func colors(_ scheme: ColorScheme) -> ThemeColors {",
    "    let dark = scheme == .dark",
    "    return switch self {",
    ...pick,
    "    }",
    "  }",
    "}",
    "",
    "/// A shift color as a テーマ draws it: `color` for the mark and its",
    "/// words, `tint` for the ground behind it.",
    "public struct MarkColor: Sendable {",
    "  public let name: String",
    "  public let color: Color",
    "  public let tint: Color",
    "}",
    "",
    "/// Every color role a screen reads, for one テーマ in light or dark.",
    "public struct ThemeColors: Sendable {",
    ...colorRoleNames.map((name) => `  public let ${camel(name)}: Color`),
    "  /// The shift colors in picker order; the first is the テーマ's own.",
    "  public let marks: [MarkColor]",
    "}",
    "",
    "extension ThemeColors {",
    colorSets.join("\n\n"),
    "}",
    "",
    "public enum Metrics {",
    `  public static let spacingStep: CGFloat = ${SPACING_STEP}`,
    ...Object.entries(sizes).map(
      ([name, value]) => `  public static let ${name}: CGFloat = ${value}`
    ),
    ...Object.entries(stateLayers).map(
      ([name, value]) => `  public static let ${name}Opacity: Double = ${value}`
    ),
    "}",
    "",
    "/// The corners by size; `full` is a Capsule's.",
    "public enum Radius {",
    ...radiusScale.map(
      ([name, value]) =>
        `  public static let ${radiusName(name)}: CGFloat = ${value}`
    ),
    "}",
    "",
    "/// A shadow by how far a piece floats: `.shadow(color:radius:x:y:)` with",
    "/// radius about half the blur, in the テーマ's color of that name.",
    "public struct Shadow: Sendable {",
    "  public let y: CGFloat",
    "  public let blur: CGFloat",
    "  public let color: any KeyPath<ThemeColors, Color> & Sendable",
    "",
    ...Object.entries(shadows).map(
      ([name, { blur, color, y }]) =>
        `  public static let ${name} = Shadow(y: ${y}, blur: ${blur}, color: \\.${camel(color)})`
    ),
    "}",
    "",
    "/// Pochical's own motion, for withAnimation.",
    "public enum Springs {",
    ...Object.entries(springs).map(
      ([name, { bounce, duration }]) =>
        `  public static let ${name}: Animation = .spring(duration: ${duration}, bounce: ${bounce})`
    ),
    "}",
    "",
    "extension Color {",
    "  fileprivate init(hex: UInt32, alpha: UInt32 = 0xFF) {",
    "    self.init(",
    "      .sRGB,",
    "      red: Double((hex >> 16) & 0xFF) / 255,",
    "      green: Double((hex >> 8) & 0xFF) / 255,",
    "      blue: Double(hex & 0xFF) / 255,",
    "      opacity: Double(alpha) / 255",
    "    )",
    "  }",
    "}",
    "",
  ];
  return lines.join("\n");
}

function kotlin() {
  const colorSets = themes.flatMap((preset) =>
    schemesOf(preset).map((scheme) => {
      const { marks, roles } = drawn(preset, scheme);
      const fields = colorRoleNames.map(
        (name) => `      ${camel(name)} = ${kotlinColor(roles[name] ?? "")},`
      );
      const markList = marks.map(
        (mark, index) =>
          `          MarkColor("${index === 0 ? "テーマカラー" : markColors[index]?.name}", ${kotlinColor(mark.color)}, ${kotlinColor(mark.tint)}),`
      );
      return [
        `    val ${pascal(preset.id)}${pascal(scheme)} =`,
        "      ThemeColors(",
        ...fields,
        "        marks =",
        "          listOf(",
        ...markList,
        "          ),",
        "      )",
      ].join("\n");
    })
  );
  const pick = themes.map((preset) =>
    preset.scheme
      ? `      ${pascal(preset.id)} -> ThemeColors.${pascal(preset.id)}${pascal(preset.scheme)}`
      : `      ${pascal(preset.id)} -> if (dark) ThemeColors.${pascal(preset.id)}Dark else ThemeColors.${pascal(preset.id)}Light`
  );
  const lines = [
    `// ${HEADER}`,
    "",
    "package tech.chiji.pochical.design",
    "",
    "import androidx.compose.animation.core.SpringSpec",
    "import androidx.compose.animation.core.spring",
    "import androidx.compose.ui.graphics.Color",
    "import androidx.compose.ui.text.TextStyle",
    "import androidx.compose.ui.text.font.FontWeight",
    "import androidx.compose.ui.unit.Dp",
    "import androidx.compose.ui.unit.dp",
    "import androidx.compose.ui.unit.sp",
    "",
    "/** A テーマ in the style settings; `id` is what is saved. */",
    "enum class Theme(val id: String, val displayName: String, val isAlwaysDark: Boolean) {",
    ...themes.map(
      (preset) =>
        `  ${pascal(preset.id)}("${preset.id}", "${preset.name}", ${preset.scheme === "dark"}),`
    ),
    "  ;",
    "",
    "  fun colors(dark: Boolean): ThemeColors =",
    "    when (this) {",
    ...pick,
    "    }",
    "}",
    "",
    "/** A shift color as a テーマ draws it: `color` for the mark and its words, `tint` for the ground behind it. */",
    "data class MarkColor(val name: String, val color: Color, val tint: Color)",
    "",
    "/** Every color role a screen reads, for one テーマ in light or dark. */",
    "data class ThemeColors(",
    ...colorRoleNames.map((name) => `  val ${camel(name)}: Color,`),
    "  /** The shift colors in picker order; the first is the テーマ's own. */",
    "  val marks: List<MarkColor>,",
    ") {",
    "  companion object {",
    colorSets.join("\n\n"),
    "  }",
    "}",
    "",
    "/** iOS's text styles at their default sizes, which the app's type scale follows. */",
    "object PochicalTextStyles {",
    ...Object.entries(textStyles).map(
      ([name, { size, weight }]) =>
        `  val ${name} = TextStyle(fontSize = ${size}.sp, fontWeight = FontWeight(${weight}))`
    ),
    "}",
    "",
    "object Metrics {",
    `  val spacingStep = ${SPACING_STEP}.dp`,
    ...Object.entries(sizes).map(
      ([name, value]) => `  val ${name} = ${value}.dp`
    ),
    ...Object.entries(stateLayers).map(
      ([name, value]) => `  const val ${name.toUpperCase()}_OPACITY = ${value}f`
    ),
    "}",
    "",
    "/** The corners by size; `full` is a pill's, as CircleShape. */",
    "object Radius {",
    ...radiusScale.map(
      ([name, value]) => `  val ${radiusName(name)} = ${value}.dp`
    ),
    "}",
    "",
    "/** A shadow by how far a piece floats, in the テーマ's color of that name. */",
    "data class Shadow(val y: Dp, val blur: Dp, val color: (ThemeColors) -> Color) {",
    "  companion object {",
    ...Object.entries(shadows).map(
      ([name, { blur, color, y }]) =>
        `    val ${name} = Shadow(${y}.dp, ${blur}.dp, ThemeColors::${camel(color)})`
    ),
    "  }",
    "}",
    "",
    "/** Pochical's own motion, as SwiftUI's .spring(duration:bounce:). */",
    "object Springs {",
    ...Object.entries(springs).map(
      ([name, { bounce, duration }]) =>
        `  fun <T> ${name}(): SpringSpec<T> = spring(dampingRatio = ${1 - bounce}f, stiffness = ${stiffnessOf(duration)}f)`
    ),
    "}",
    "",
  ];
  return lines.join("\n");
}

// design/src/limits.ts for the apps: field limits and group size.
function swiftLimits() {
  return [
    `// ${HEADER}`,
    "",
    "/// How long free text may be, in characters as a reader sees them",
    "/// (`String.count`), by what it is. spec/text-limits.md says how fields",
    "/// hold to them.",
    "public enum TextLimits {",
    ...Object.entries(textLimits).map(
      ([name, value]) => `  public static let ${name} = ${value}`
    ),
    "}",
    "",
    "/// The most days one chat message shares.",
    `public let sharedDaysMax = ${SHARED_DAYS_MAX}`,
    "",
    "/// The most people in one group.",
    `public let groupMaxMembers = ${GROUP_MAX_MEMBERS}`,
    "",
  ].join("\n");
}

function kotlinLimits() {
  return [
    `// ${HEADER}`,
    "",
    "package tech.chiji.pochical.design",
    "",
    "/**",
    " * How long free text may be, in characters as a reader sees them (grapheme",
    " * clusters, ICU's BreakIterator), by what it is. spec/text-limits.md says",
    " * how fields hold to them.",
    " */",
    "object TextLimits {",
    ...Object.entries(textLimits).map(
      ([name, value]) => `  const val ${name} = ${value}`
    ),
    "}",
    "",
    "/** The most days one chat message shares. */",
    `const val SHARED_DAYS_MAX = ${SHARED_DAYS_MAX}`,
    "",
    "/** The most people in one group. */",
    `const val GROUP_MAX_MEMBERS = ${GROUP_MAX_MEMBERS}`,
    "",
  ].join("\n");
}

const outputs = {
  "apps/android/design/src/main/kotlin/tech/chiji/pochical/design/DesignTokens.kt":
    kotlin(),
  "apps/android/design/src/main/kotlin/tech/chiji/pochical/design/Limits.kt":
    kotlinLimits(),
  "apps/ios/Packages/PochicalDesign/Sources/PochicalDesign/DesignTokens.swift":
    swift(),
  "apps/ios/Packages/PochicalDesign/Sources/PochicalDesign/Limits.swift":
    swiftLimits(),
  "spec/design-tokens.json": json(),
};

const read = (file: string) => {
  try {
    return readFileSync(file, "utf-8");
  } catch {
    return null;
  }
};

const check = process.argv.includes("--check");
const stale = Object.entries(outputs).filter(
  ([file, content]) => read(path.join(root, file)) !== content
);
if (check) {
  if (stale.length > 0) {
    console.error(
      `Out of date; run \`mise run gen\`:\n${stale.map(([file]) => `  ${file}`).join("\n")}`
    );
    process.exit(1);
  }
} else {
  for (const [file, content] of stale) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
}
