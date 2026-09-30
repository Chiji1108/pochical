import { markColorIn, markColors, neutralRoles, neutralTokens } from "./colors";
import type { ColorScheme } from "./colors";
import { hexToOklch, mixOklab, oklchToHex } from "./oklch";
import type { Oklch } from "./oklch";

// テーマ in the style settings: twelve, three to a row, each keeping one
// color on the screen at about the shifts' own strength, so none clashes
// with them. The first row is the basics: the app's moss, the same moss
// softened on cream, and black ink. The second is warm, earthy ones:
// milk tea, matcha and cocoa. The third is colors: blue, pink and violet.
// The fourth is always dark, its character a night: a coffee shop, a
// moonlit night, a blackboard. Whether shifts keep their own colors is a
// choice of its own, シフトの色, since it carries meaning rather than
// taste. Only the viewer's screen changes; a shift's color slot is what
// syncs.

export type Preset = {
  id: string;
  name: string;
  // The theme color as drawn on the テーマ's own screen: text, icons and
  // lines. Every other role, and a light テーマ's dark mode, follows from
  // it by the steps in roleSteps.
  accent: Oklch;
  // The color of tinted grounds (a day off's tile, what is picked) when
  // the accent is too pale to lend them one, as chalk white is.
  tint?: { chroma: number; hue: number };
  // The hue the grays lean toward, and how far: 1 leans as far as moss's
  // grays do, 0 is plain gray.
  grays: { hue: number; strength: number };
  // Text in a color of its own rather than gray: the body text's chroma
  // and hue. Lighter text takes less of it.
  ink?: { chroma: number; hue: number };
  // Drawn dark whatever 外観 says: a テーマ whose character is its night.
  scheme?: "dark";
  // A screen of its own color instead of white, or instead of the dark
  // gray for an always-dark テーマ. A light テーマ's dark mode keeps the
  // dark gray.
  ground?: { chroma: number; hue: number; lightness: number };
  // The share of each shift color's chroma kept when shifts are colored,
  // 1 as tuned; the soft テーマ lower theirs to sit with them.
  vividness?: number;
};

export const presets = [
  // The app's own: moss, as its icon.
  {
    accent: { chroma: 0.06, hue: 141, lightness: 0.472 },
    grays: { hue: 141, strength: 1 },
    id: "pochical",
    name: "ポチカル",
  },
  // A temple's moss garden: the moss softened to sage on a screen a breath
  // off white toward shoji paper, the grays warmed with it and the shifts
  // quieted.
  {
    accent: { chroma: 0.04, hue: 132, lightness: 0.5 },
    grays: { hue: 90, strength: 1.1 },
    ground: { chroma: 0.005, hue: 92, lightness: 0.993 },
    id: "zen",
    name: "禅",
    vividness: 0.75,
  },
  // Ink alone, in black.
  {
    accent: { chroma: 0.008, hue: 138, lightness: 0.363 },
    grays: { hue: 138, strength: 0.3 },
    id: "sumi",
    name: "墨",
  },
  // Soft and warm: a milky caramel on a screen a breath off white toward
  // warmth, the shifts softened to sit with it. Yellower than ココア, which
  // leans red.
  {
    accent: { chroma: 0.052, hue: 72, lightness: 0.52 },
    grays: { hue: 68, strength: 1.3 },
    ground: { chroma: 0.005, hue: 75, lightness: 0.993 },
    id: "milktea",
    name: "ミルクティー",
    vividness: 0.75,
  },
  // An olive yellow-green, as the tea.
  {
    accent: { chroma: 0.095, hue: 116, lightness: 0.5 },
    grays: { hue: 110, strength: 1 },
    id: "matcha",
    name: "抹茶",
    vividness: 0.75,
  },
  // A deep chocolate brown, leaning red.
  {
    accent: { chroma: 0.045, hue: 40, lightness: 0.38 },
    grays: { hue: 45, strength: 1 },
    id: "cocoa",
    name: "ココア",
    vividness: 0.75,
  },
  // Fresh: a clear blue-green on cool grays.
  {
    accent: { chroma: 0.072, hue: 205, lightness: 0.48 },
    grays: { hue: 205, strength: 0.8 },
    id: "soda",
    name: "ソーダ",
  },
  // Sweet: a grayed pink, the shifts softened with it.
  {
    accent: { chroma: 0.075, hue: 6, lightness: 0.5 },
    grays: { hue: 10, strength: 0.9 },
    id: "sakura",
    name: "さくら",
    vividness: 0.75,
  },
  // A deep violet.
  {
    accent: { chroma: 0.083, hue: 294, lightness: 0.474 },
    grays: { hue: 294, strength: 0.8 },
    id: "sumire",
    name: "すみれ",
  },
  // An old coffee shop after dark: grays warmed toward roast, text with a
  // breath of brown, the amber of its lamps, and days off in coffee; the
  // shifts softened as if printed. Amber rather than red keeps it apart
  // from Sundays and holidays, and oranger than 月夜's moon.
  {
    accent: { chroma: 0.115, hue: 68, lightness: 0.8 },
    grays: { hue: 65, strength: 1.8 },
    id: "kissa",
    ink: { chroma: 0.021, hue: 50 },
    name: "喫茶",
    scheme: "dark",
    tint: { chroma: 0.085, hue: 55 },
    vividness: 0.75,
  },
  // A moonlit night: a deep navy screen and a moon yellow.
  {
    accent: { chroma: 0.11, hue: 95, lightness: 0.87 },
    grays: { hue: 265, strength: 3 },
    ground: { chroma: 0.035, hue: 268, lightness: 0.21 },
    id: "tsukiyo",
    name: "月夜",
    scheme: "dark",
    vividness: 0.85,
  },
  // A school blackboard: dark green, chalk white, and the shifts in chalk
  // colors. Days off sit on the board's own green, a shade lighter, as
  // chalk rubbed out leaves it.
  {
    accent: { chroma: 0.012, hue: 165, lightness: 0.94 },
    grays: { hue: 165, strength: 3 },
    ground: { chroma: 0.04, hue: 168, lightness: 0.3 },
    id: "kokuban",
    name: "黒板",
    scheme: "dark",
    tint: { chroma: 0.1, hue: 162 },
    vividness: 0.8,
  },
] as const satisfies readonly Preset[];

export type PresetId = (typeof presets)[number]["id"];

// The scheme a テーマ is drawn in: its own if it is always dark, else the
// one asked for.
export function schemeIn(preset: Preset, requested: ColorScheme): ColorScheme {
  return preset.scheme ?? requested;
}

// Each role as a step from the theme color: a lightness of its own (in
// light, the accent's lightness plus a step for `line`) and a share of the
// accent's chroma. Dark mode sets every theme at the same lightness, so
// they read alike on the dark ground. `accent` draws text, icons and lines;
// `fill` is solid grounds with `onFill` text on top; `soft` is a selected
// ground, `markTint` a day off's tile and `muted` a border.
export const roleSteps = {
  dark: {
    accent: { chroma: 0.95, lightness: 0.78 },
    line: { chroma: 0.8, lightness: 0.7 },
    markTint: { chroma: 0.44, lightness: 0.39 },
    muted: { chroma: 0.6, lightness: 0.56 },
    soft: { chroma: 0.27, lightness: 0.345 },
  },
  light: {
    line: { chroma: 0.9, lightness: 0.11 },
    markTint: { chroma: 0.27, lightness: 0.925 },
    muted: { chroma: 0.62, lightness: 0.75 },
    soft: { chroma: 0.14, lightness: 0.958 },
  },
} as const;

// Text on a solid fill: white on a deep one, dark in the fill's own hue
// on a light one.
export const LIGHT_FILL = 0.7;
function onFillOf(fill: string) {
  const { chroma, hue, lightness } = hexToOklch(fill);
  return lightness > LIGHT_FILL
    ? oklchToHex({ chroma: chroma * 0.4, hue, lightness: 0.27 })
    : "#ffffff";
}

export function themeColors(preset: Preset, scheme: ColorScheme) {
  const { chroma, hue, lightness } = preset.accent;
  const paint = (step: { chroma: number; lightness: number }) =>
    oklchToHex({
      chroma: chroma * step.chroma,
      hue,
      lightness: step.lightness,
    });
  const { light } = roleSteps;
  const { dark } = roleSteps;
  // An always-dark テーマ gives its colors as drawn on its dark screen;
  // a light one's dark mode follows from its light colors.
  const own = scheme === "light" || preset.scheme === "dark";
  const accent = own ? oklchToHex(preset.accent) : paint(dark.accent);
  // Tinted grounds take `tint` when the テーマ has one.
  const tint = preset.tint ?? { chroma, hue };
  const paintTint = (step: { chroma: number; lightness: number }) =>
    oklchToHex({
      chroma: tint.chroma * step.chroma,
      hue: tint.hue,
      lightness: step.lightness,
    });
  return {
    accent,
    fill: accent,
    line:
      scheme === "dark"
        ? paint(dark.line)
        : paint({
            chroma: light.line.chroma,
            lightness: lightness + light.line.lightness,
          }),
    markTint: paintTint(roleSteps[scheme].markTint),
    muted: paint(roleSteps[scheme].muted),
    onFill: onFillOf(accent),
    soft: paintTint(roleSteps[scheme].soft),
  };
}

// The roles a テーマ sets from its own color, by the key themeColors gives
// each, in the order a screen uses them.
export const themeRoleTokens = [
  { key: "accent", label: "文字・線", name: "accent-default" },
  { key: "fill", label: "塗り", name: "accent-fill" },
  { key: "onFill", label: "塗りの上の文字", name: "accent-on-fill" },
  { key: "line", label: "フォーカス・見出し", name: "accent-focus" },
  { key: "muted", label: "選択中の枠", name: "accent-border" },
  { key: "soft", label: "薄い背景", name: "accent-container" },
  { key: "markTint", label: "休みの地", name: "calendar-off-tint" },
] as const;

// Text roles that take an ink, and how much of its color each keeps.
export const inkShares: Record<string, number> = {
  "home-indicator": 1,
  "inverse-background": 1,
  "text-disabled": 0.45,
  "text-primary": 1,
  "text-quaternary": 0.6,
  "text-secondary": 0.85,
  "text-tertiary": 0.7,
};

// Each text role keeps its lightness and takes the ink's hue at its share
// of the ink's chroma.
function inkRoles(preset: Preset, scheme: ColorScheme) {
  const { ink } = preset;
  if (!ink) {
    return {};
  }
  return Object.fromEntries(
    neutralTokens
      .filter((token) => token.name in inkShares)
      .map((token) => {
        const value = token[scheme];
        const { lightness } = hexToOklch(value.slice(0, 7));
        const chroma = ink.chroma * (inkShares[token.name] ?? 1);
        return [
          token.name,
          `${oklchToHex({ chroma, hue: ink.hue, lightness })}${value.slice(7)}`,
        ];
      })
  );
}

// The grays leaning the テーマ's way, its text's ink, and its ground.
function neutralsFor(preset: Preset, scheme: ColorScheme) {
  const roles = {
    ...neutralRoles(scheme, preset.grays),
    ...inkRoles(preset, scheme),
  };
  if (!preset.ground || scheme !== (preset.scheme ?? "light")) {
    return roles;
  }
  const ground = oklchToHex(preset.ground);
  if (scheme === "dark") {
    return { ...roles, "background-base": ground };
  }
  // Cards and sheets share a light screen's color, as white on white
  // does, so a tinted screen does not leave them floating pure white.
  return {
    ...roles,
    "background-base": ground,
    "background-card": ground,
    "background-elevated": ground,
  };
}

// A note's stroke under its date: a neutral gray, so no color beyond the
// theme's, and apart from the green of days off. On paper a step deeper
// than the switches' gray, to show on a day off's pale tile.
export const NOTE_MARKER_DEPTH = 0.25;
function noteMarkerOf(neutrals: Record<string, string>, scheme: ColorScheme) {
  const fill = neutrals["fill-primary"] ?? "";
  if (scheme === "dark") {
    return fill;
  }
  return mixOklab(fill, neutrals["text-quaternary"] ?? "", NOTE_MARKER_DEPTH);
}

export const colorRoleNames = [
  ...neutralTokens.map((token) => token.name),
  ...themeRoleTokens.map((role) => role.name),
  "calendar-note-marker",
];

// Every color role a screen reads, by name, for a テーマ in the scheme it
// is drawn in (schemeIn): the neutral roles plus the theme's.
export function themeRoles(
  preset: Preset,
  scheme: ColorScheme
): Record<string, string> {
  const neutrals = neutralsFor(preset, scheme);
  const colors = themeColors(preset, scheme);
  return {
    ...neutrals,
    ...Object.fromEntries(
      themeRoleTokens.map((role) => [role.name, colors[role.key]])
    ),
    "calendar-note-marker": noteMarkerOf(neutrals, scheme),
  };
}

// The first shift color is the theme's own, as 休み takes it: モス in
// ポチカル, and whatever color another テーマ is, so its days off are
// its color rather than a green beside it.
export const THEME_SLOT = 0;

// The theme's own color as a shift color, for its slot and for marks drawn
// all in one color (ワントーン).
export function themeMarkColor(preset: Preset, scheme: ColorScheme) {
  const { accent, markTint } = themeColors(preset, scheme);
  return { color: accent, name: "テーマカラー", tint: markTint };
}

// All shift colors as a テーマ draws them, in picker order.
export function markPalette(preset: Preset, scheme: ColorScheme) {
  return markColors.map((option, index) =>
    index === THEME_SLOT
      ? themeMarkColor(preset, scheme)
      : markColorIn(option, scheme, preset.vividness)
  );
}
