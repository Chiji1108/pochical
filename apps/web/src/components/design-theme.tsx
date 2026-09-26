import { createContext, useContext } from "react";
import type { CSSProperties } from "react";

import { neutralStyle } from "../lib/design-tokens";
import type { ColorScheme } from "../lib/design-tokens";

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

// Light or dark, picked on /design by the 外観 variant.
export const ColorSchemeContext = createContext<ColorScheme>("light");

export function themeColors(theme: Theme, scheme: ColorScheme) {
  return scheme === "dark" ? theme.dark : theme;
}

// Every color variable design.css reads: the neutral roles plus the theme.
export function themeStyle(id: ThemeId, scheme: ColorScheme = "light") {
  const colors = themeColors(themeOf(id), scheme);
  return {
    ...neutralStyle(scheme),
    "--accent": colors.accent,
    "--accent-border": colors.border,
    "--accent-line": colors.line,
    "--accent-mark-tint": colors.markTint,
    "--accent-muted": colors.muted,
    "--accent-press": colors.press,
    "--accent-soft": colors.soft,
    "--accent-soft-2": colors.soft2,
    "--accent-strong": colors.strong,
  } as CSSProperties;
}

export function useThemeStyle() {
  return themeStyle(
    useContext(ThemeContext).theme,
    useContext(ColorSchemeContext)
  );
}
