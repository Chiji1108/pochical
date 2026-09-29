import { Moon, Sun } from "lucide-react";
import { createContext, useContext } from "react";
import type { CSSProperties } from "react";
import { css, cva } from "styled-system/css";

import { neutralStyle, neutralTokens } from "../lib/design-tokens";
import type { ColorScheme } from "../lib/design-tokens";
import { hexToOklch, oklchToHex } from "../lib/oklch";
import { Choice, ChoiceGrid } from "./design-ui";

// テーマ in the style settings: moods each drawing every color from one
// hue, so none clashes with the shifts' own colors, and a few characters
// that go further with where color goes: a cream screen with its own ink,
// or a night that is always dark. None is a pairing that clashes.
// Whether shifts keep their own colors is a switch of its own,
// シフトを色分けする, since it carries meaning rather than taste. Only
// the viewer's screen changes; a shift's color slot is what syncs.
type Oklch = { lightness: number; chroma: number; hue: number };

export type Preset = {
  id: string;
  name: string;
  // The theme color as drawn on the テーマ's own screen: text, icons and
  // lines. Every other role, and dark mode's, follows from it by the steps
  // in roleSteps.
  accent: Oklch;
  // The hue the grays lean toward, and how far: 1 leans as far as moss's
  // grays do, 0 is plain gray.
  grays: { hue: number; strength: number };
  // Text in a color of its own rather than gray: the body text's chroma
  // and hue, and, if set, its lightness on a light screen. Lighter text
  // keeps its lightness and takes less of the color.
  ink?: { chroma: number; hue: number; lightness?: number };
  // A colored screen instead of white (or, for an always-dark テーマ,
  // instead of the dark gray). Cards and sheets share its color.
  ground?: { chroma: number; hue: number; lightness: number };
  // Drawn dark whatever 外観 says: a テーマ whose character is its night.
  scheme?: "dark";
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
  // Soft and warm: a milky caramel on a faintly warm screen, the shifts
  // softened to sit with it. Yellower than ココア, which leans red.
  {
    accent: { chroma: 0.052, hue: 72, lightness: 0.52 },
    grays: { hue: 68, strength: 1.3 },
    ground: { chroma: 0.005, hue: 75, lightness: 0.992 },
    id: "milktea",
    name: "ミルクティー",
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
  // Ink alone, in black.
  {
    accent: { chroma: 0.008, hue: 138, lightness: 0.363 },
    grays: { hue: 138, strength: 0.3 },
    id: "sumi",
    name: "墨",
  },
  // Indigo on unbleached cotton: a deep indigo, the screen only a breath
  // off white toward the cotton's warmth.
  {
    accent: { chroma: 0.075, hue: 258, lightness: 0.43 },
    grays: { hue: 80, strength: 0.7 },
    ground: { chroma: 0.006, hue: 85, lightness: 0.992 },
    id: "aizome",
    name: "藍染め",
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
  // A deep violet.
  {
    accent: { chroma: 0.083, hue: 294, lightness: 0.474 },
    grays: { hue: 294, strength: 0.8 },
    id: "sumire",
    name: "すみれ",
  },
  // An old coffee shop: a cream screen, text in dark roast brown, and
  // the vermilion of its sign; the shifts softened as if printed.
  {
    accent: { chroma: 0.14, hue: 35, lightness: 0.53 },
    grays: { hue: 65, strength: 1.8 },
    ground: { chroma: 0.02, hue: 85, lightness: 0.972 },
    id: "kissa",
    ink: { chroma: 0.035, hue: 50, lightness: 0.3 },
    name: "喫茶",
    vividness: 0.75,
  },
  // A moonlit night, always: a deep navy screen and a moon yellow.
  {
    accent: { chroma: 0.11, hue: 95, lightness: 0.87 },
    grays: { hue: 265, strength: 3 },
    ground: { chroma: 0.035, hue: 268, lightness: 0.21 },
    id: "tsukiyo",
    name: "月夜",
    scheme: "dark",
    vividness: 0.85,
  },
  // A school blackboard, always: dark green, chalk white, and the shifts
  // in chalk colors.
  {
    accent: { chroma: 0.012, hue: 165, lightness: 0.94 },
    grays: { hue: 165, strength: 3 },
    ground: { chroma: 0.04, hue: 168, lightness: 0.3 },
    id: "kokuban",
    name: "黒板",
    scheme: "dark",
    vividness: 0.8,
  },
] as const satisfies readonly Preset[];

export type PresetId = (typeof presets)[number]["id"];

export function presetOf(id: PresetId): Preset {
  return presets.find((preset) => preset.id === id) ?? presets[0];
}

// The scheme a テーマ is drawn in: its own if it is always dark, else the
// one asked for.
export function schemeOf(id: PresetId, scheme: ColorScheme): ColorScheme {
  return presetOf(id).scheme ?? scheme;
}

// The テーマ drawn: the person's own, or another's where a card or the
// states page shows one.
export const ThemeContext = createContext<{ theme: PresetId }>({
  theme: "pochical",
});

// The scheme in effect: the device's unless 外観 in settings keeps one.
export const ColorSchemeContext = createContext<ColorScheme>("light");

// 外観 in settings: follow the device, or force light or dark.
export type Appearance = "system" | ColorScheme;

// Each role as a step from the theme color: a lightness of its own (in
// light, the accent's lightness plus a step for `line`) and a share of the
// accent's chroma. Dark mode sets every theme at the same lightness, so
// they read alike on the dark ground. `accent` draws text, icons and lines;
// `fill` is solid grounds with `onFill` text on top; `soft` is a selected
// ground, `markTint` a day off's tile and `muted` a border.
const roleSteps = {
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
const LIGHT_FILL = 0.7;
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
    markTint: paint(roleSteps[scheme].markTint),
    muted: paint(roleSteps[scheme].muted),
    onFill: onFillOf(accent),
    soft: paint(roleSteps[scheme].soft),
  };
}

// Text roles that take an ink, and how much of its color each keeps.
const inkShares: Record<string, number> = {
  "home-indicator": 1,
  "inverse-background": 1,
  "text-disabled": 0.45,
  "text-primary": 1,
  "text-quaternary": 0.6,
  "text-secondary": 0.85,
  "text-tertiary": 0.7,
};
// Ink is fainter on a dark screen, where color reads stronger.
const DARK_INK_SHARE = 0.6;

function inkStyle(preset: Preset, scheme: ColorScheme) {
  const { ink } = preset;
  if (!ink) {
    return {};
  }
  return Object.fromEntries(
    neutralTokens
      .filter((token) => token.name in inkShares)
      .map((token) => {
        const value = token[scheme];
        const share =
          (inkShares[token.name] ?? 1) *
          (scheme === "dark" ? DARK_INK_SHARE : 1);
        const body =
          token.name === "text-primary" || token.name === "inverse-background";
        const lightness =
          scheme === "light" && body && ink.lightness !== undefined
            ? ink.lightness
            : hexToOklch(value.slice(0, 7)).lightness;
        return [
          `--${token.name}`,
          `${oklchToHex({ chroma: ink.chroma * share, hue: ink.hue, lightness })}${value.slice(7)}`,
        ];
      })
  );
}

// The grays leaning the テーマ's way, its text's ink, and its ground.
function neutralsFor(preset: Preset, scheme: ColorScheme): CSSProperties {
  const style = {
    ...neutralStyle(scheme, preset.grays),
    ...inkStyle(preset, scheme),
  };
  // A light テーマ's ground is its light screen's; in dark mode it takes
  // the dark gray like the rest.
  const ownScheme = preset.scheme ?? "light";
  if (!preset.ground || scheme !== ownScheme) {
    return style;
  }
  const ground = oklchToHex(preset.ground);
  if (scheme === "dark") {
    return { ...style, "--background-base": ground } as CSSProperties;
  }
  // Cards and sheets share the screen's color, as white on white does, so
  // a tinted screen does not leave them floating pure white.
  return {
    ...style,
    "--background-base": ground,
    "--background-card": ground,
    "--background-elevated": ground,
  } as CSSProperties;
}

// Every color variable the screens read: the neutral roles plus the theme.
export function themeStyle(id: PresetId, requested: ColorScheme = "light") {
  const preset = presetOf(id);
  const scheme = schemeOf(id, requested);
  const colors = themeColors(preset, scheme);
  return {
    ...neutralsFor(preset, scheme),
    "--accent-border": colors.muted,
    "--accent-container": colors.soft,
    "--accent-default": colors.accent,
    "--accent-fill": colors.fill,
    "--accent-focus": colors.line,
    "--accent-on-fill": colors.onFill,
    "--calendar-off-tint": colors.markTint,
    // A note's stroke under its date: a neutral gray, so no color beyond
    // the theme's, and apart from the green of days off. On paper a step
    // deeper than the switches' gray, to show on a day off's pale tile.
    "--calendar-note-marker":
      scheme === "dark"
        ? "var(--fill-primary)"
        : "color-mix(in oklab, var(--fill-primary), var(--text-quaternary) 25%)",
  } as CSSProperties;
}

// The screen's own color, which the device's status bar and the home
// screen app's launch images take.
export function screenColor(id: PresetId, scheme: ColorScheme) {
  const neutrals = neutralsFor(presetOf(id), schemeOf(id, scheme)) as Record<
    string,
    string | undefined
  >;
  const color = neutrals["--background-base"];
  if (color === undefined) {
    throw new Error(`No screen color for ${id} in ${scheme}`);
  }
  return color;
}

export function useThemeStyle() {
  return themeStyle(
    useContext(ThemeContext).theme,
    useContext(ColorSchemeContext)
  );
}

// The scheme the current テーマ is drawn in, for colors worked out in
// code: an always-dark テーマ's dark, else the context's.
export function useColorScheme() {
  return schemeOf(
    useContext(ThemeContext).theme,
    useContext(ColorSchemeContext)
  );
}

// The /design pages' own ground around the phones stays light: an
// always-dark テーマ lends it ポチカル's colors instead.
export function pageStyle(id: PresetId) {
  return themeStyle(presetOf(id).scheme ? "pochical" : id, "light");
}

const previewSchemes = [
  { Icon: Sun, name: "ライトで見る", scheme: "light" },
  { Icon: Moon, name: "ダークで見る", scheme: "dark" },
] as const;

// ☀︎ / ☾ on a preview's top edge, to see it in the other of light and dark
// without changing 外観. Sits inside a previewWrap, with the preview, or
// inline at the end of a section's title for what the section shows.
export const previewWrap = css({ position: "relative" });
const schemeSwitch = {
  // Drawn small, but each side takes its half of the whole switch and a
  // 44px height to tap, so a tap anywhere on it picks the side it lands on.
  choice: css({
    "&[data-scheme=dark]::after": { right: "-3px" },
    "&[data-scheme=light]::after": { left: "-3px" },
    _after: {
      bottom: "-13px",
      content: '""',
      left: "-1px",
      position: "absolute",
      right: "-1px",
      top: "-13px",
    },
    _checked: { bg: "fill.tertiary", color: "text.primary" },
    bg: "transparent",
    border: 0,
    borderRadius: "8px",
    color: "text.quaternary",
    display: "grid",
    height: "18px",
    padding: 0,
    placeItems: "center",
    position: "relative",
    width: "24px",
  }),
  // Ark keeps the group itself relatively positioned, so the choices
  // flow into the wrapper that sits on the edge.
  choices: css({ display: "contents" }),
  frame: cva({
    base: {
      bg: "background.card",
      border: "1px solid token(colors.separator)",
      borderRadius: "12px",
      display: "flex",
      gap: "2px",
      margin: 0,
      padding: "2px",
    },
    variants: {
      placement: {
        edge: { left: "12px", position: "absolute", top: "-10px" },
        inline: {},
      },
    },
  }),
};
export function PreviewSchemeSwitch({
  shown,
  onPick,
  placement = "edge",
}: {
  shown: ColorScheme;
  onPick: (scheme: ColorScheme) => void;
  placement?: "edge" | "inline";
}) {
  return (
    // Ark keeps the group itself relatively positioned, so a wrapper
    // places it on the edge.
    <div className={schemeSwitch.frame({ placement })}>
      <ChoiceGrid
        className={schemeSwitch.choices}
        label="プレビューの明るさ"
        onValueChange={onPick}
        value={shown}
      >
        {previewSchemes.map((option) => (
          <Choice
            className={schemeSwitch.choice}
            data-scheme={option.scheme}
            key={option.scheme}
            label={option.name}
            value={option.scheme}
          >
            <option.Icon aria-hidden="true" size={13} />
          </Choice>
        ))}
      </ChoiceGrid>
    </div>
  );
}
