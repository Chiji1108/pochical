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
      accent: "#9bbc96",
      border: "#364434",
      line: "#809b7c",
      markTint: "#263524",
      muted: "#566a53",
      press: "#2d392b",
      soft: "#1e271c",
      soft2: "#242f22",
      strong: "#8aa885",
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
      accent: "#94b4da",
      border: "#334152",
      line: "#7a95b4",
      markTint: "#233143",
      muted: "#52657c",
      press: "#2a3645",
      soft: "#1c2530",
      soft2: "#222c39",
      strong: "#84a1c5",
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
      accent: "#e09ba9",
      border: "#50383d",
      line: "#b9808b",
      markTint: "#42282d",
      muted: "#7f565e",
      press: "#442f33",
      soft: "#2f1f22",
      soft2: "#382629",
      strong: "#ca8996",
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
      accent: "#e39f7d",
      border: "#503a30",
      line: "#bc8367",
      markTint: "#412a1f",
      muted: "#815844",
      press: "#433027",
      soft: "#2e201a",
      soft2: "#37271f",
      strong: "#cd8d6e",
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
      accent: "#b4a6e4",
      border: "#413c51",
      line: "#9589bc",
      markTint: "#312c43",
      muted: "#655d82",
      press: "#363244",
      soft: "#25222f",
      soft2: "#2c2938",
      strong: "#a194cd",
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
      accent: "#afb2ad",
      border: "#3f403e",
      line: "#90938f",
      markTint: "#2f312f",
      muted: "#626461",
      press: "#343634",
      soft: "#232423",
      soft2: "#2a2c2a",
      strong: "#9ca09b",
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
