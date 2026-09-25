import { type CSSProperties, createContext, useContext } from "react";

// Accent palettes for the app. Each sets the variables design.css reads
// inside the phone; the shift colors stay as they are.
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

export function themeStyle(id: ThemeId) {
  const theme = themeOf(id);
  return {
    "--accent": theme.accent,
    "--accent-strong": theme.strong,
    "--accent-line": theme.line,
    "--accent-muted": theme.muted,
    "--accent-soft": theme.soft,
    "--accent-soft-2": theme.soft2,
    "--accent-press": theme.press,
    "--accent-border": theme.border,
  } as CSSProperties;
}

export function useThemeStyle() {
  return themeStyle(useContext(ThemeContext).theme);
}
