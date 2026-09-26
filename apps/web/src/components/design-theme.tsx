import { Moon, Sun } from "lucide-react";
import { createContext, useContext } from "react";
import type { CSSProperties } from "react";

import { neutralStyle } from "../lib/design-tokens";
import type { ColorScheme, NeutralTint, Tone } from "../lib/design-tokens";
import { hexToOklch } from "../lib/oklch";
import { toneNeutrals, toneRoles } from "../lib/tones";

// Accent palettes for the app. Each sets the variables design.css reads
// inside the phone; the shift colors stay as they are. `dark` holds the same
// roles for dark mode, lighter so they read on the dark background.
export const themes = [
  {
    id: "moss",
    name: "モス",
    accent: "#486444",
    strong: "#445d43",
    line: "#698367",
    muted: "#a1af8f",
    soft: "#f0f4ed",
    soft2: "#eaf0e9",
    press: "#dfe9d9",
    border: "#d9e2d3",
    // Light tint for shifts that use the theme color, like 休み.
    markTint: "#e4ecdf",
    dark: {
      accent: "#a4c19f",
      border: "#4c5a4a",
      line: "#8ea68b",
      markTint: "#3b4a39",
      muted: "#697a66",
      press: "#424e41",
      soft: "#333c32",
      soft2: "#394337",
      strong: "#92ae8e",
    },
  },
  {
    id: "indigo",
    name: "藍",
    accent: "#3f5a7a",
    strong: "#3a5270",
    line: "#5f7a99",
    muted: "#9fb0c4",
    soft: "#edf1f5",
    soft2: "#e5ebf2",
    press: "#d9e1eb",
    border: "#d3dce7",
    // Light tint for shifts that use the theme color, like 休み.
    markTint: "#dfe5ee",
    dark: {
      accent: "#9dbadd",
      border: "#495766",
      line: "#89a1bd",
      markTint: "#384657",
      muted: "#65768a",
      press: "#404b59",
      soft: "#313a44",
      soft2: "#37414d",
      strong: "#8ca7c7",
    },
  },
  {
    id: "rose",
    name: "ローズ",
    accent: "#8a4f5c",
    strong: "#7f4955",
    line: "#a8707c",
    muted: "#c9a3ab",
    soft: "#f7eef0",
    soft2: "#f2e5e8",
    press: "#ead8dc",
    border: "#e6d3d7",
    // Light tint for shifts that use the theme color, like 休み.
    markTint: "#f2e0e4",
    dark: {
      accent: "#e3a3b0",
      border: "#664e52",
      line: "#c28e98",
      markTint: "#563d42",
      muted: "#8e6970",
      press: "#594448",
      soft: "#443537",
      soft2: "#4c3a3e",
      strong: "#cd929d",
    },
  },
  {
    id: "terracotta",
    name: "テラコッタ",
    accent: "#93583a",
    strong: "#875136",
    line: "#b07a5c",
    muted: "#cfaa92",
    soft: "#f7efe9",
    soft2: "#f3e6dc",
    press: "#ebd9cc",
    border: "#e8d6c9",
    // Light tint for shifts that use the theme color, like 休み.
    markTint: "#f3e3d8",
    dark: {
      accent: "#e5a789",
      border: "#665045",
      line: "#c49178",
      markTint: "#563f34",
      muted: "#8f6b59",
      press: "#59463d",
      soft: "#433630",
      soft2: "#4b3c35",
      strong: "#cf9579",
    },
  },
  {
    id: "lavender",
    name: "ラベンダー",
    accent: "#5f5286",
    strong: "#574b7c",
    line: "#7f73a3",
    muted: "#b1a9cc",
    soft: "#f1eff6",
    soft2: "#e9e6f2",
    press: "#dfdaec",
    border: "#dbd6e9",
    // Light tint for shifts that use the theme color, like 休み.
    markTint: "#e6e2f0",
    dark: {
      accent: "#baaee6",
      border: "#565267",
      line: "#a197c4",
      markTint: "#464157",
      muted: "#766f8f",
      press: "#4b4759",
      soft: "#3a3744",
      soft2: "#403d4c",
      strong: "#a79ccf",
    },
  },
  {
    id: "sumi",
    name: "墨",
    accent: "#3c3f3b",
    strong: "#353834",
    line: "#62665f",
    muted: "#a9aca5",
    soft: "#f2f2ef",
    soft2: "#eaeae6",
    press: "#dfdfda",
    border: "#dadad4",
    // Light tint for shifts that use the theme color, like 休み.
    markTint: "#e4e5e1",
    dark: {
      accent: "#b5b8b4",
      border: "#545654",
      line: "#9c9f9c",
      markTint: "#444643",
      muted: "#737572",
      press: "#494b49",
      soft: "#383938",
      soft2: "#3f403e",
      strong: "#a2a6a1",
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

// カラー in the style settings: マルチカラー keeps each shift pattern's own
// color with the moss theme it was tuned for; any single theme color also
// draws every mark in that color. Only the viewer's screen changes.
export type ColorChoice = "multi" | ThemeId;
export const ColorChoiceContext = createContext<{
  color: ColorChoice;
  setColor?: (color: ColorChoice) => void;
}>({ color: "multi" });

export function themeOfColor(color: ColorChoice): ThemeId {
  return color === "multi" ? "moss" : color;
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
    border: colors.border,
    fill: colors.accent,
    line: colors.line,
    markTint: colors.markTint,
    muted: colors.muted,
    onFill: onFillByScheme[scheme],
    press: colors.press,
    soft: colors.soft,
    soft2: colors.soft2,
    strong: colors.strong,
  };
}

// The viewer's tone (トーン), picked in the style settings. It stays
// the viewer's even where another member's theme color is drawn.
export const ToneContext = createContext<Tone>("deep");
export const SetToneContext = createContext<((tone: Tone) => void) | undefined>(
  undefined
);

// 外観 in settings: follow the device, or force light or dark.
export type Appearance = "system" | ColorScheme;
export const AppearanceContext = createContext<{
  appearance: Appearance;
  setAppearance?: (appearance: Appearance) => void;
}>({ appearance: "system" });

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
    "--bg": bg,
    "--raised": bg,
    "--surface": bg,
  } as CSSProperties;
}

// Every color variable design.css reads: the neutral roles plus the theme.
export function themeStyle(
  id: ThemeId,
  scheme: ColorScheme = "light",
  tone: Tone = "deep"
) {
  const theme = themeOf(id);
  const colors = themeColors(theme, scheme, tone);
  return {
    ...neutralsFor(theme, scheme, tone),
    "--accent": colors.accent,
    "--accent-border": colors.border,
    "--accent-fill": colors.fill,
    "--accent-line": colors.line,
    "--accent-mark-tint": colors.markTint,
    "--accent-muted": colors.muted,
    "--accent-press": colors.press,
    "--accent-soft": colors.soft,
    "--accent-soft-2": colors.soft2,
    "--accent-strong": colors.strong,
    "--on-accent-fill": colors.onFill,
  } as CSSProperties;
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
// without changing 外観. Sits inside a `.st-preview-wrap`.
export function PreviewSchemeSwitch({
  shown,
  onPick,
}: {
  shown: ColorScheme;
  onPick: (scheme: ColorScheme) => void;
}) {
  return (
    <fieldset className="st-preview-scheme">
      <legend className="dc-sr-only">プレビューの明るさ</legend>
      {previewSchemes.map((option) => (
        <button
          aria-label={option.name}
          aria-pressed={shown === option.scheme}
          key={option.scheme}
          onClick={() => {
            onPick(option.scheme);
          }}
          type="button"
        >
          <option.Icon aria-hidden="true" size={13} />
        </button>
      ))}
    </fieldset>
  );
}
