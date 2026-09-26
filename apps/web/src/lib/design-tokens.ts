import type { CSSProperties } from "react";

import { hexToOklch, oklchToHex } from "./oklch";
import { familyMarkColor, generatedFamilies } from "./theme-families";

// The app's neutral colors by role, for light and dark. design.css reads them
// as CSS variables (`--bg`, `--text-3`, ...); /design/colors lists them, and
// the native apps will export the same values. Dark values keep each light
// color's hue and flip its lightness in OKLCH, on a soft gray ground about as
// light as Discord's rather than near-black.

export const colorSchemes = ["light", "dark"] as const;
export type ColorScheme = (typeof colorSchemes)[number];

export type ColorToken = {
  name: string;
  label: string;
  light: string;
  dark: string;
};

export type ColorTokenGroup = {
  label: string;
  tokens: ColorToken[];
};

export const neutralTokenGroups: ColorTokenGroup[] = [
  {
    label: "背景",
    tokens: [
      { dark: "#2a2c29", label: "画面", light: "#ffffff", name: "bg" },
      {
        dark: "#424540",
        label: "カード・選択中のボタン",
        light: "#ffffff",
        name: "surface",
      },
      {
        dark: "#343632",
        label: "シート・ダイアログ",
        light: "#ffffff",
        name: "raised",
      },
      {
        dark: "#323531",
        label: "リスト・入力欄",
        light: "#f6f7f3",
        name: "fill",
      },
      {
        dark: "#3a3d38",
        label: "セグメント・吹き出し",
        light: "#f0f1ec",
        name: "fill-2",
      },
      {
        dark: "#434641",
        label: "アバター・空の枠",
        light: "#e6e8e1",
        name: "fill-3",
      },
      {
        dark: "#585c56",
        label: "オフのスイッチ・無効なボタン",
        light: "#d5d9cf",
        name: "control-off",
      },
    ],
  },
  {
    label: "文字",
    tokens: [
      { dark: "#dcdfdb", label: "本文", light: "#30332f", name: "text" },
      { dark: "#bec3bc", label: "ラベル", light: "#565e52", name: "text-2" },
      { dark: "#a7ada5", label: "補足", light: "#72796e", name: "text-3" },
      {
        dark: "#959a92",
        label: "注記・曜日",
        light: "#8a9086",
        name: "text-4",
      },
      {
        dark: "#80857e",
        label: "時刻・矢印",
        light: "#a7ada1",
        name: "text-faint",
      },
      {
        dark: "#666a65",
        label: "無効・月の外の日",
        light: "#b9beb4",
        name: "text-disabled",
      },
    ],
  },
  {
    label: "線",
    tokens: [
      {
        dark: "#4d514c",
        label: "ボタン・入力欄の枠",
        light: "#e0e3db",
        name: "border",
      },
      {
        dark: "#3f423d",
        label: "区切り線",
        light: "#eceee8",
        name: "separator",
      },
      {
        dark: "#373a36",
        label: "表の罫線",
        light: "#f0f1ec",
        name: "separator-faint",
      },
      {
        dark: "#696e66",
        label: "点線の追加ボタン",
        light: "#b9c2b1",
        name: "border-strong",
      },
    ],
  },
  {
    label: "意味のある色",
    tokens: [
      {
        dark: "#dd9f9a",
        label: "日曜・祝日",
        light: "#a96561",
        name: "holiday",
      },
      { dark: "#98b4d4", label: "土曜", light: "#6682a0", name: "saturday" },
      {
        dark: "#e58c83",
        label: "削除・警告",
        light: "#b0564f",
        name: "danger",
      },
      { dark: "#c4675f", label: "未読バッジ", light: "#b0564f", name: "badge" },
      {
        dark: "#ffffff",
        label: "未読バッジの文字",
        light: "#ffffff",
        name: "on-badge",
      },
    ],
  },
  {
    label: "反転・重なり",
    tokens: [
      {
        dark: "#dcdfdb",
        label: "反転ボタン・トースト",
        light: "#30332f",
        name: "inverse",
      },
      {
        dark: "#2a2c29",
        label: "反転の上の文字",
        light: "#ffffff",
        name: "on-inverse",
      },
      {
        dark: "#ffffff",
        label: "スイッチのつまみ",
        light: "#ffffff",
        name: "knob",
      },
      {
        dark: "#cfd2ce",
        label: "ホームインジケーター",
        light: "#363a33",
        name: "home-indicator",
      },
      { dark: "#0000008c", label: "暗幕", light: "#30332f35", name: "scrim" },
      {
        dark: "#00000040",
        label: "影（弱）",
        light: "#30332f14",
        name: "shadow-faint",
      },
      { dark: "#00000059", label: "影", light: "#30332f1f", name: "shadow" },
      {
        dark: "#00000080",
        label: "影（強）",
        light: "#30332f2e",
        name: "shadow-strong",
      },
    ],
  },
];

export const neutralTokens = neutralTokenGroups.flatMap(({ tokens }) => tokens);

// Tints the neutrals toward a theme: each token keeps its lightness, turns to
// the theme's hue, and scales its chroma by `strength` (0 = pure gray).
export type NeutralTint = { hue: number; strength: number };

// Colors that carry their own meaning and stay put whatever the theme.
const untintedTokens = new Set([
  "holiday",
  "saturday",
  "danger",
  "badge",
  "on-badge",
  "knob",
]);

export function neutralValue(
  token: ColorToken,
  scheme: ColorScheme,
  tint?: NeutralTint
): string {
  const value = token[scheme];
  if (!tint || untintedTokens.has(token.name)) {
    return value;
  }
  const { lightness, chroma } = hexToOklch(value.slice(0, 7));
  const tinted = oklchToHex({
    chroma: chroma * tint.strength,
    hue: tint.hue,
    lightness,
  });
  return `${tinted}${value.slice(7)}`;
}

export function neutralStyle(
  scheme: ColorScheme,
  tint?: NeutralTint
): CSSProperties {
  return {
    ...Object.fromEntries(
      neutralTokens.map((token) => [
        `--${token.name}`,
        neutralValue(token, scheme, tint),
      ])
    ),
    colorScheme: scheme,
  };
}

// Twelve muted colors a shift pattern can take, chosen to sit with the moss
// green theme: `color` draws the mark and text, `tint` fills the ground
// behind it. `dark` holds both for dark mode.
export const markColors = [
  {
    color: "#486444",
    dark: { color: "#abc7a7", tint: "#3c483a" },
    name: "モス",
    tint: "#e4ecdf",
  },
  {
    color: "#8a6d1a",
    dark: { color: "#d6bb77", tint: "#4d432a" },
    name: "からし",
    tint: "#f3ead0",
  },
  {
    color: "#95602e",
    dark: { color: "#e6b285", tint: "#533f2d" },
    name: "オレンジ",
    tint: "#f5e4d2",
  },
  {
    color: "#93503a",
    dark: { color: "#efab95", tint: "#573c34" },
    name: "テラコッタ",
    tint: "#f3dfd6",
  },
  {
    color: "#9b3f35",
    dark: { color: "#fea194", tint: "#573c37" },
    name: "赤",
    tint: "#f4dcd8",
  },
  {
    color: "#8d4a5a",
    dark: { color: "#eda8b6", tint: "#563b40" },
    name: "ローズ",
    tint: "#f2e0e4",
  },
  {
    color: "#75497a",
    dark: { color: "#d8acdd", tint: "#4e3d50" },
    name: "すみれ",
    tint: "#eee1ef",
  },
  {
    color: "#5f4f86",
    dark: { color: "#c2b4ec", tint: "#453f57" },
    name: "ラベンダー",
    tint: "#e8e2f0",
  },
  {
    color: "#4a5388",
    dark: { color: "#afbaf1", tint: "#3d4259" },
    name: "藍",
    tint: "#e3e6f2",
  },
  {
    color: "#3d4a73",
    dark: { color: "#c0d0fc", tint: "#3d4355" },
    name: "紺",
    tint: "#dde2ee",
  },
  {
    color: "#36706c",
    dark: { color: "#95cac5", tint: "#334947" },
    name: "青緑",
    tint: "#dcebea",
  },
  {
    color: "#56636d",
    dark: { color: "#b3c0ca", tint: "#3f4449" },
    name: "グレー",
    tint: "#e3e7ea",
  },
] as const;

// Theme families: `deep` is the muted, hand-tuned palette; the others are
// generated from the same hues (see theme-families.ts).
export const themeFamilies = ["deep", ...generatedFamilies] as const;
export type ThemeFamily = (typeof themeFamilies)[number];

// The deep shift colors' average lightness; generated families keep each
// color's offset from it.
const MARK_MEAN_LIGHTNESS =
  markColors.reduce(
    (sum, option) => sum + hexToOklch(option.color).lightness,
    0
  ) / markColors.length;

// Low chroma crowds the warm hues together, so dusty spreads them a little
// (degrees of OKLCH hue) to keep テラコッタ and 赤 apart. Each still reads as
// the same color name.
const familyHueShifts: Partial<
  Record<
    ThemeFamily,
    Partial<Record<(typeof markColors)[number]["name"], number>>
  >
> = {
  dusty: { からし: 8, オレンジ: 10, テラコッタ: 2, ローズ: -12, 赤: -8 },
};

// A shift color as drawn in light or dark mode and the given family.
export function markColorIn(
  option: (typeof markColors)[number],
  scheme: ColorScheme,
  family: ThemeFamily = "deep"
) {
  const deep = scheme === "dark" ? option.dark : option;
  const { color, tint } =
    family === "deep"
      ? deep
      : familyMarkColor(
          family,
          option.color,
          scheme,
          hexToOklch(option.color).lightness - MARK_MEAN_LIGHTNESS,
          familyHueShifts[family]?.[option.name]
        );
  return { color, name: option.name, tint };
}
