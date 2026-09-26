import type { CSSProperties } from "react";

// The app's neutral colors by role, for light and dark. design.css reads them
// as CSS variables (`--bg`, `--text-3`, ...); /design/colors lists them, and
// the native apps will export the same values. Dark values keep each light
// color's hue and flip its lightness in OKLCH.

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
      { dark: "#131412", label: "画面", light: "#ffffff", name: "bg" },
      {
        dark: "#2c2f2b",
        label: "カード・選択中のボタン",
        light: "#ffffff",
        name: "surface",
      },
      {
        dark: "#20221f",
        label: "シート・ダイアログ",
        light: "#ffffff",
        name: "raised",
      },
      {
        dark: "#1d1f1c",
        label: "リスト・入力欄",
        light: "#f6f7f3",
        name: "fill",
      },
      {
        dark: "#262925",
        label: "セグメント・吹き出し",
        light: "#f0f1ec",
        name: "fill-2",
      },
      {
        dark: "#2e312d",
        label: "アバター・空の枠",
        light: "#e6e8e1",
        name: "fill-3",
      },
      {
        dark: "#434641",
        label: "オフのスイッチ・無効なボタン",
        light: "#d5d9cf",
        name: "control-off",
      },
    ],
  },
  {
    label: "文字",
    tokens: [
      { dark: "#e6e9e5", label: "本文", light: "#30332f", name: "text" },
      { dark: "#bec3bb", label: "ラベル", light: "#565e52", name: "text-2" },
      { dark: "#9ea49b", label: "補足", light: "#72796e", name: "text-3" },
      {
        dark: "#868b83",
        label: "注記・曜日",
        light: "#8a9086",
        name: "text-4",
      },
      {
        dark: "#6f736c",
        label: "時刻・矢印",
        light: "#a7ada1",
        name: "text-faint",
      },
      {
        dark: "#535751",
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
        dark: "#383c37",
        label: "ボタン・入力欄の枠",
        light: "#e0e3db",
        name: "border",
      },
      {
        dark: "#282b27",
        label: "区切り線",
        light: "#eceee8",
        name: "separator",
      },
      {
        dark: "#212420",
        label: "表の罫線",
        light: "#f0f1ec",
        name: "separator-faint",
      },
      {
        dark: "#555a52",
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
        dark: "#d8938e",
        label: "日曜・祝日",
        light: "#a96561",
        name: "holiday",
      },
      { dark: "#8cabcd", label: "土曜", light: "#6682a0", name: "saturday" },
      {
        dark: "#df7f77",
        label: "削除・警告",
        light: "#b0564f",
        name: "danger",
      },
      { dark: "#c25d56", label: "未読バッジ", light: "#b0564f", name: "badge" },
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
        dark: "#131412",
        label: "テーマ色の上の文字",
        light: "#ffffff",
        name: "on-accent",
      },
      {
        dark: "#e6e9e5",
        label: "反転ボタン・トースト",
        light: "#30332f",
        name: "inverse",
      },
      {
        dark: "#131412",
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
        dark: "#dcdfdb",
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

export function neutralStyle(scheme: ColorScheme): CSSProperties {
  return {
    ...Object.fromEntries(
      neutralTokens.map((token) => [`--${token.name}`, token[scheme]])
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
    dark: { color: "#9cbb98", tint: "#283426" },
    name: "モス",
    tint: "#e4ecdf",
  },
  {
    color: "#8a6d1a",
    dark: { color: "#ccad61", tint: "#3a2f14" },
    name: "からし",
    tint: "#f3ead0",
  },
  {
    color: "#95602e",
    dark: { color: "#dda371", tint: "#412b17" },
    name: "オレンジ",
    tint: "#f5e4d2",
  },
  {
    color: "#93503a",
    dark: { color: "#e69c84", tint: "#44281f" },
    name: "テラコッタ",
    tint: "#f3dfd6",
  },
  {
    color: "#9b3f35",
    dark: { color: "#f69183", tint: "#442723" },
    name: "赤",
    tint: "#f4dcd8",
  },
  {
    color: "#8d4a5a",
    dark: { color: "#e499a8", tint: "#44262d" },
    name: "ローズ",
    tint: "#f2e0e4",
  },
  {
    color: "#75497a",
    dark: { color: "#ce9dd3", tint: "#3b283d" },
    name: "すみれ",
    tint: "#eee1ef",
  },
  {
    color: "#5f4f86",
    dark: { color: "#b6a6e3", tint: "#322c44" },
    name: "ラベンダー",
    tint: "#e8e2f0",
  },
  {
    color: "#4a5388",
    dark: { color: "#a1ade9", tint: "#2a2e46" },
    name: "藍",
    tint: "#e3e6f2",
  },
  {
    color: "#3d4a73",
    dark: { color: "#9fb0df", tint: "#293043" },
    name: "紺",
    tint: "#dde2ee",
  },
  {
    color: "#36706c",
    dark: { color: "#83beb9", tint: "#1d3534" },
    name: "青緑",
    tint: "#dcebea",
  },
  {
    color: "#56636d",
    dark: { color: "#a5b3be", tint: "#2b3136" },
    name: "グレー",
    tint: "#e3e7ea",
  },
] as const;

// A shift color as drawn in light or dark mode.
export function markColorIn(
  option: (typeof markColors)[number],
  scheme: ColorScheme
) {
  const { color, tint } = scheme === "dark" ? option.dark : option;
  return { color, name: option.name, tint };
}
