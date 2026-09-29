import { Moon, Sun } from "lucide-react";
import { createContext, useContext } from "react";
import type { CSSProperties } from "react";
import { css, cva } from "styled-system/css";

import { neutralStyle } from "../lib/design-tokens";
import type { ColorScheme, NeutralTint, Tone } from "../lib/design-tokens";
import { hexToOklch } from "../lib/oklch";
import { toneNeutrals, toneRoles } from "../lib/tones";
import { Choice, ChoiceGrid } from "./design-ui";

// Accent palettes for the app. Each sets the variables the screens read
// inside the phone; the shift colors stay as they are. `dark` holds the same
// roles for dark mode, lighter so they read on the dark background.
export const themes = [
  {
    id: "moss",
    name: "モス",
    accent: "#486444",
    line: "#698367",
    muted: "#a1af8f",
    soft: "#f0f4ed",
    // Light tint for shifts that use the theme color, like 休み.
    markTint: "#e4ecdf",
    dark: {
      accent: "#a4c19f",
      line: "#8ea68b",
      markTint: "#3b4a39",
      muted: "#697a66",
      soft: "#333c32",
    },
  },
  {
    id: "indigo",
    name: "藍",
    accent: "#3f5a7a",
    line: "#5f7a99",
    muted: "#9fb0c4",
    soft: "#edf1f5",
    // Light tint for shifts that use the theme color, like 休み.
    markTint: "#dfe5ee",
    dark: {
      accent: "#9dbadd",
      line: "#89a1bd",
      markTint: "#384657",
      muted: "#65768a",
      soft: "#313a44",
    },
  },
  {
    id: "rose",
    name: "ローズ",
    accent: "#8a4f5c",
    line: "#a8707c",
    muted: "#c9a3ab",
    soft: "#f7eef0",
    // Light tint for shifts that use the theme color, like 休み.
    markTint: "#f2e0e4",
    dark: {
      accent: "#e3a3b0",
      line: "#c28e98",
      markTint: "#563d42",
      muted: "#8e6970",
      soft: "#443537",
    },
  },
  {
    id: "terracotta",
    name: "テラコッタ",
    accent: "#93583a",
    line: "#b07a5c",
    muted: "#cfaa92",
    soft: "#f7efe9",
    // Light tint for shifts that use the theme color, like 休み.
    markTint: "#f3e3d8",
    dark: {
      accent: "#e5a789",
      line: "#c49178",
      markTint: "#563f34",
      muted: "#8f6b59",
      soft: "#433630",
    },
  },
  {
    id: "lavender",
    name: "ラベンダー",
    accent: "#5f5286",
    line: "#7f73a3",
    muted: "#b1a9cc",
    soft: "#f1eff6",
    // Light tint for shifts that use the theme color, like 休み.
    markTint: "#e6e2f0",
    dark: {
      accent: "#baaee6",
      line: "#a197c4",
      markTint: "#464157",
      muted: "#766f8f",
      soft: "#3a3744",
    },
  },
  {
    id: "sumi",
    name: "墨",
    accent: "#3c3f3b",
    line: "#62665f",
    muted: "#a9aca5",
    soft: "#f2f2ef",
    // Light tint for shifts that use the theme color, like 休み.
    markTint: "#e4e5e1",
    dark: {
      accent: "#b5b8b4",
      line: "#9c9f9c",
      markTint: "#444643",
      muted: "#737572",
      soft: "#383938",
    },
  },
] as const;

export type ThemeId = (typeof themes)[number]["id"];
export type Theme = (typeof themes)[number];

export const ThemeContext = createContext<{
  theme: ThemeId;
  setTheme?: (theme: ThemeId) => void;
}>({ theme: "moss" });

export function themeOf(id: ThemeId): Theme {
  return themes.find((theme) => theme.id === id) ?? themes[0];
}

// テーマ in the style settings: named presets, each a theme color in a tone
// with the shifts either in their own colors or all in the theme's ink.
// Only the pairs that work are offered: shift colors were tuned beside
// モス, so the colorful ones keep it, and the one-color ones stay deep.
// Only the viewer's screen changes; a shift's color slot is what syncs.
export type Preset = {
  id: string;
  name: string;
  theme: ThemeId;
  tone: Tone;
  // "mono" draws icons and letters in the theme color; emoji keep theirs.
  marks: "multi" | "mono";
};

export const presets = [
  { id: "standard", marks: "multi", name: "標準", theme: "moss", tone: "deep" },
  { id: "dusty", marks: "multi", name: "くすみ", theme: "moss", tone: "dusty" },
  { id: "paper", marks: "multi", name: "紙", theme: "moss", tone: "paper" },
  { id: "sumi", marks: "mono", name: "墨", theme: "sumi", tone: "deep" },
  { id: "indigo", marks: "mono", name: "藍", theme: "indigo", tone: "deep" },
  { id: "moss", marks: "mono", name: "モス", theme: "moss", tone: "deep" },
  { id: "rose", marks: "mono", name: "ローズ", theme: "rose", tone: "deep" },
  {
    id: "terracotta",
    marks: "mono",
    name: "テラコッタ",
    theme: "terracotta",
    tone: "deep",
  },
  {
    id: "lavender",
    marks: "mono",
    name: "ラベンダー",
    theme: "lavender",
    tone: "deep",
  },
] as const satisfies readonly Preset[];

export type PresetId = (typeof presets)[number]["id"];

export function presetOf(id: PresetId): Preset {
  return presets.find((preset) => preset.id === id) ?? presets[0];
}

// The scheme in effect: the device's unless 外観 in settings keeps one.
export const ColorSchemeContext = createContext<ColorScheme>("light");

// Text on a solid accent fill: white on the deep light accents, dark on the
// light accents of dark mode.
const onFillByScheme: Record<ColorScheme, string> = {
  dark: "#232521",
  light: "#ffffff",
};

// A theme's accent roles in light or dark. `accent` draws text, icons and
// lines; `fill` is for solid backgrounds with `onFill` text on top. The deep
// themes fill with the accent itself; generated tones set their own.
export function themeColors(
  theme: Theme,
  scheme: ColorScheme,
  tone: Tone = "deep"
) {
  if (tone !== "deep") {
    return toneRoles(tone, theme.accent, scheme);
  }
  const colors = scheme === "dark" ? theme.dark : theme;
  return {
    accent: colors.accent,
    fill: colors.accent,
    line: colors.line,
    markTint: colors.markTint,
    muted: colors.muted,
    onFill: onFillByScheme[scheme],
    soft: colors.soft,
  };
}

// The viewer's tone (トーン), picked in the style settings. It stays
// the viewer's even where another member's theme color is drawn.
export const ToneContext = createContext<Tone>("deep");

// 外観 in settings: follow the device, or force light or dark.
export type Appearance = "system" | ColorScheme;

// The neutral grays' base chroma suits moss; themes with more (or less)
// saturated accents tint the grays proportionally more (or less).
const MOSS_CHROMA = hexToOklch(themes[0].accent).chroma;
const MAX_TINT_STRENGTH = 1.3;

export function neutralTintOf(theme: Theme): NeutralTint {
  const { chroma, hue } = hexToOklch(theme.accent);
  return {
    hue,
    strength: Math.min(MAX_TINT_STRENGTH, chroma / MOSS_CHROMA),
  };
}

// The grays lean toward the theme's hue; generated tones bring their own.
function neutralsFor(
  theme: Theme,
  scheme: ColorScheme,
  tone: Tone
): CSSProperties {
  if (tone === "deep") {
    return neutralStyle(scheme, neutralTintOf(theme));
  }
  const { bg, tint } = toneNeutrals(tone, theme.accent, scheme);
  const style = neutralStyle(scheme, tint);
  if (!bg) {
    return style;
  }
  // Cards and sheets share the screen's color, as white on white does in
  // deep, so a tinted screen does not leave them floating pure white.
  return {
    ...style,
    "--background-base": bg,
    "--background-card": bg,
    "--background-elevated": bg,
  } as CSSProperties;
}

// Every color variable the screens read: the neutral roles plus the theme.
export function themeStyle(
  id: ThemeId,
  scheme: ColorScheme = "light",
  tone: Tone = "deep"
) {
  const theme = themeOf(id);
  const colors = themeColors(theme, scheme, tone);
  return {
    ...neutralsFor(theme, scheme, tone),
    "--accent-default": colors.accent,
    "--accent-fill": colors.fill,
    "--accent-focus": colors.line,
    // A note's stroke under its date: a neutral gray, so no color beyond
    // the theme's, and apart from the green of days off. On paper a step
    // deeper than the switches' gray, to show on a day off's pale tile.
    "--calendar-note-marker":
      scheme === "dark"
        ? "var(--fill-primary)"
        : "color-mix(in oklab, var(--fill-primary), var(--text-quaternary) 25%)",
    "--calendar-off-tint": colors.markTint,
    "--accent-border": colors.muted,
    "--accent-container": colors.soft,
    "--accent-on-fill": colors.onFill,
  } as CSSProperties;
}

// The screen's own color, which the device's status bar and the home
// screen app's launch images take.
export function screenColor(id: ThemeId, scheme: ColorScheme, tone: Tone) {
  const neutrals = neutralsFor(themeOf(id), scheme, tone) as Record<
    string,
    string | undefined
  >;
  const color = neutrals["--background-base"];
  if (color === undefined) {
    throw new Error(`No screen color for ${id} in ${scheme} and ${tone}`);
  }
  return color;
}

export function useThemeStyle() {
  return themeStyle(
    useContext(ThemeContext).theme,
    useContext(ColorSchemeContext),
    useContext(ToneContext)
  );
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
  choice: css({
    _checked: { bg: "fill.tertiary", color: "text.primary" },
    bg: "transparent",
    border: 0,
    borderRadius: "8px",
    color: "text.quaternary",
    display: "grid",
    height: "18px",
    padding: 0,
    placeItems: "center",
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
