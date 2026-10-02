// Writes the design tokens out for the native apps and as JSON for anyone
// else: every テーマ's colors worked out for light and dark, the shift
// colors as each テーマ draws them, the text styles and the sizes, and the
// shared numbers and national holidays beside them. Run by
// `mise run gen`; with --check it only reports files that are out of date,
// as CI does.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { chatRules } from "../src/chat";
import {
  colorSchemes,
  markColors,
  neutralTokens,
  untintedTokens,
} from "../src/colors";
import type { ColorScheme } from "../src/colors";
import { inviteRules } from "../src/invite";
import {
  GROUP_MAX_MEMBERS,
  SHARED_DAYS_MAX,
  syncLimits,
  textFields,
  textLimits,
} from "../src/limits";
import {
  HAIRLINE_MAX,
  radii,
  shadows,
  SPACING_STEP,
  sizes,
  springs,
  stateLayers,
} from "../src/metrics";
import { reviewRules } from "../src/review";
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
import { widgetRules } from "../src/widgets";
import { kotlinHolidays, swiftHolidays, webHolidays } from "./holidays";
import { swiftPhrases } from "./phrases";

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
    chat: chatRules,
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
    invite: inviteRules,
    limits: {
      groupMaxMembers: GROUP_MAX_MEMBERS,
      sharedDaysMax: SHARED_DAYS_MAX,
      sync: syncLimits,
      text: textLimits,
      textFields,
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
    review: reviewRules,
    textStyles,
    widgets: widgetRules,
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
    "package app.pochical.design",
    "",
    "import androidx.compose.animation.core.SpringSpec",
    "import androidx.compose.animation.core.spring",
    "import androidx.compose.ui.graphics.Color",
    "import androidx.compose.ui.text.TextStyle",
    "import androidx.compose.ui.text.font.FontWeight",
    "import androidx.compose.ui.text.style.LineBreak",
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
    "/**",
    " * iOS's text styles at their default sizes, which the app's type scale follows.",
    " * Japanese breaks between phrases (Android 13 and later), not in the middle of",
    " * a word, as the site's does with BudouX.",
    " */",
    "object PochicalTextStyles {",
    "  private val phrases =",
    "    LineBreak(",
    "      strategy = LineBreak.Strategy.HighQuality,",
    "      strictness = LineBreak.Strictness.Strict,",
    "      wordBreak = LineBreak.WordBreak.Phrase,",
    "    )",
    "",
    ...Object.entries(textStyles).map(
      ([name, { size, weight }]) =>
        `  val ${name} = TextStyle(fontSize = ${size}.sp, fontWeight = FontWeight(${weight}), lineBreak = phrases)`
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

// The shared numbers (design/src/limits.ts, chat.ts, invite.ts, review.ts
// and widgets.ts) for the apps, a namespace each; what each means is written
// beside it in the TypeScript.
type Values = Readonly<Record<string, number | string>>;

const swiftValue = (value: number | string) =>
  typeof value === "string" ? JSON.stringify(value) : String(value);

const kotlinValue = (value: number | string) => {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  return Number.isInteger(value) ? String(value) : `${value}f`;
};

function swiftEnum(name: string, doc: string, values: Values) {
  return [
    `/// ${doc}`,
    `public enum ${name} {`,
    ...Object.entries(values).map(
      ([key, value]) => `  public static let ${key} = ${swiftValue(value)}`
    ),
    "}",
  ];
}

function kotlinObject(name: string, doc: string, values: Values) {
  return [
    `/** ${doc} */`,
    `object ${name} {`,
    ...Object.entries(values).map(
      ([key, value]) => `  const val ${key} = ${kotlinValue(value)}`
    ),
    "}",
  ];
}

const swiftFile = (...sections: string[][]) =>
  [`// ${HEADER}`, "", ...sections.flatMap((lines) => [...lines, ""])].join(
    "\n"
  );

const kotlinFile = (...sections: string[][]) =>
  [
    `// ${HEADER}`,
    "",
    "package app.pochical.design",
    "",
    ...sections.flatMap((lines) => [...lines, ""]),
  ].join("\n");

const SWIFT_DIR = "apps/ios/Packages/PochicalDesign/Sources/PochicalDesign";
const KOTLIN_DIR = "apps/android/design/src/main/kotlin/app/pochical/design";

const TEXT_LIMITS_DOC =
  "How long free text may be, in characters as a reader sees them, by what it is (spec/text-limits.md).";
const TEXT_FIELDS_DOC =
  "How a field shows its count and how a shift's name shortens in a day (spec/text-limits.md).";
const SYNC_LIMITS_DOC =
  "How much of what a user owns one synced value may hold (spec/sync-protocol.md).";
const SHARED_DAYS_DOC = "The most days one chat message shares.";
const GROUP_MEMBERS_DOC = "The most people in one group.";

// Chat.swift, Invite.swift, Review.swift and Widgets.swift, and their
// Kotlin twins.
const shared: [string, string, Values][] = [
  [
    "Chat",
    "The chat's shared numbers (spec/chat.md); times in milliseconds.",
    chatRules,
  ],
  ["Invite", "What an invitation code is made of.", inviteRules],
  [
    "Review",
    "When the apps ask the store for its review prompt (spec/review.md).",
    reviewRules,
  ],
  ["Widgets", "The widgets' shared numbers (spec/widgets.md).", widgetRules],
];

const sharedOutputs = Object.fromEntries(
  shared.flatMap(([name, doc, values]) => [
    [`${SWIFT_DIR}/${name}.swift`, swiftFile(swiftEnum(name, doc, values))],
    [`${KOTLIN_DIR}/${name}.kt`, kotlinFile(kotlinObject(name, doc, values))],
  ])
);

const outputs = {
  "apps/android/design/src/main/kotlin/app/pochical/design/DesignTokens.kt":
    kotlin(),
  [`${KOTLIN_DIR}/Limits.kt`]: kotlinFile(
    kotlinObject("TextLimits", TEXT_LIMITS_DOC, textLimits),
    kotlinObject("TextFields", TEXT_FIELDS_DOC, textFields),
    kotlinObject("SyncLimits", SYNC_LIMITS_DOC, syncLimits),
    [
      `/** ${SHARED_DAYS_DOC} */`,
      `const val SHARED_DAYS_MAX = ${SHARED_DAYS_MAX}`,
    ],
    [
      `/** ${GROUP_MEMBERS_DOC} */`,
      `const val GROUP_MAX_MEMBERS = ${GROUP_MAX_MEMBERS}`,
    ]
  ),
  "apps/ios/Packages/PochicalDesign/Sources/PochicalDesign/DesignTokens.swift":
    swift(),
  [`${SWIFT_DIR}/Limits.swift`]: swiftFile(
    swiftEnum("TextLimits", TEXT_LIMITS_DOC, textLimits),
    swiftEnum("TextFields", TEXT_FIELDS_DOC, textFields),
    swiftEnum("SyncLimits", SYNC_LIMITS_DOC, syncLimits),
    [`/// ${SHARED_DAYS_DOC}`, `public let sharedDaysMax = ${SHARED_DAYS_MAX}`],
    [
      `/// ${GROUP_MEMBERS_DOC}`,
      `public let groupMaxMembers = ${GROUP_MAX_MEMBERS}`,
    ]
  ),
  [`${SWIFT_DIR}/Phrases.swift`]: swiftFile(swiftPhrases()),
  [`${SWIFT_DIR}/Holidays.swift`]: swiftFile(swiftHolidays()),
  [`${KOTLIN_DIR}/Holidays.kt`]: kotlinFile(kotlinHolidays()),
  "apps/web/src/lib/holiday-names.ts": webHolidays(HEADER),
  ...sharedOutputs,
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
