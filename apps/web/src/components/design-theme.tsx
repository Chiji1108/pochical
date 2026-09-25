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
  icon: AppIconId;
  setIcon?: (icon: AppIconId) => void;
}>({ theme: "moss", icon: "calendar" });

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

// Placeholder home screen icons. They take the theme's colors, so every icon
// works with every theme.
export const appIcons = [
  { id: "calendar", name: "カレンダー" },
  { id: "po", name: "ポ" },
  { id: "leaf", name: "葉っぱ" },
  { id: "dots", name: "ドット" },
  { id: "night", name: "夜" },
  { id: "check", name: "チェック" },
] as const;

export type AppIconId = (typeof appIcons)[number]["id"];

export function AppIcon({
  icon,
  theme,
  size,
}: {
  icon: AppIconId;
  theme: ThemeId;
  size: number;
}) {
  const { accent, soft, line, muted } = themeOf(theme);
  return (
    <svg
      aria-hidden="true"
      className="app-icon"
      height={size}
      viewBox="0 0 60 60"
      width={size}
    >
      <AppIconArt
        accent={accent}
        icon={icon}
        line={line}
        muted={muted}
        soft={soft}
      />
    </svg>
  );
}

function AppIconArt({
  icon,
  accent,
  soft,
  line,
  muted,
}: {
  icon: AppIconId;
  accent: string;
  soft: string;
  line: string;
  muted: string;
}) {
  if (icon === "po") {
    return (
      <>
        <rect fill={soft} height="60" rx="13.5" width="60" />
        <text
          fill={accent}
          fontFamily="-apple-system, 'Hiragino Kaku Gothic ProN', sans-serif"
          fontSize="34"
          fontWeight="700"
          textAnchor="middle"
          x="30"
          y="42"
        >
          ポ
        </text>
      </>
    );
  }
  if (icon === "leaf") {
    return (
      <>
        <rect fill="#fbfaf7" height="60" rx="13.5" width="60" />
        <rect
          fill="none"
          height="30"
          rx="5"
          stroke={muted}
          strokeWidth="2.5"
          width="34"
          x="13"
          y="17"
        />
        <path d="M13 25h34" stroke={muted} strokeWidth="2.5" />
        <path
          d="M24 43c0-10 8-16 16-16 0 9-6 16-16 16Z"
          fill={accent}
          stroke={accent}
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
        <path d="M26 41l10-9" stroke={soft} strokeWidth="1.6" />
      </>
    );
  }
  if (icon === "dots") {
    const dots = [0, 1, 2].flatMap((row) =>
      [0, 1, 2].map((column) => ({ row, column }))
    );
    return (
      <>
        <rect fill={accent} height="60" rx="13.5" width="60" />
        {dots.map(({ row, column }) => (
          <circle
            cx={18 + column * 12}
            cy={18 + row * 12}
            fill={row === 1 && column === 2 ? soft : line}
            key={`${row}-${column}`}
            r={row === 1 && column === 2 ? 4.5 : 3.5}
          />
        ))}
      </>
    );
  }
  if (icon === "night") {
    return (
      <>
        <rect fill="#2b2e2a" height="60" rx="13.5" width="60" />
        <path
          d="M36 16a14 14 0 1 0 8 25 11 11 0 1 1-8-25Z"
          fill={soft}
          opacity="0.95"
        />
        <circle cx="42" cy="20" fill={muted} r="2" />
      </>
    );
  }
  if (icon === "check") {
    return (
      <>
        <rect fill={soft} height="60" rx="13.5" width="60" />
        <rect
          fill="#fff"
          height="32"
          rx="6"
          stroke={accent}
          strokeWidth="2.5"
          width="34"
          x="13"
          y="16"
        />
        <path d="M22 13v6M38 13v6" stroke={accent} strokeWidth="2.5" />
        <path
          d="M22 32l6 6 11-12"
          fill="none"
          stroke={accent}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3.5"
        />
      </>
    );
  }
  return (
    <>
      <rect fill={accent} height="60" rx="13.5" width="60" />
      <rect fill="#fff" height="30" rx="5" width="34" x="13" y="17" />
      <rect fill={line} height="7" rx="1" width="34" x="13" y="17" />
      <path d="M22 13v7M38 13v7" stroke="#fff" strokeWidth="3" />
      {[0, 1, 2].flatMap((row) =>
        [0, 1, 2, 3].map((column) => (
          <rect
            fill={row === 1 && column === 2 ? accent : muted}
            height="4"
            key={`${row}-${column}`}
            rx="1"
            width="5"
            x={17 + column * 7}
            y={28 + row * 6}
          />
        ))
      )}
    </>
  );
}
