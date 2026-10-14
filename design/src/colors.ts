import { hexToOklch, oklchToHex } from "./oklch";

// The app's neutral colors by role, for light and dark, before a テーマ
// leans them its way (themes.ts). The web reads each role as a CSS
// variable of its name (`--text-secondary`), the native apps as generated
// code; /design/colors lists them. Dark values keep each light color's hue
// and flip its lightness in OKLCH, on a ground a breath off black with
// text near white, as the system draws its own dark screens, so the app
// and its widgets sit crisp among the others rather than a dull gray.

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
      {
        dark: "#131513",
        label: "画面",
        light: "#ffffff",
        name: "background-base",
      },
      {
        dark: "#252823",
        label: "カード・選択中のボタン",
        light: "#ffffff",
        name: "background-card",
      },
      {
        dark: "#1e201c",
        label: "シート・ダイアログ",
        light: "#ffffff",
        name: "background-elevated",
      },
      {
        dark: "#1c201b",
        label: "リスト・入力欄",
        light: "#f6f7f3",
        name: "fill-quaternary",
      },
      {
        dark: "#242722",
        label: "セグメント・吹き出し",
        light: "#f0f1ec",
        name: "fill-tertiary",
      },
      {
        // Lighter than a card (#252823) in the dark, as the light one is
        // darker than a white card, so a letter's round shows on either.
        dark: "#373b35",
        label: "アバター・空の枠",
        light: "#e6e8e1",
        name: "fill-secondary",
      },
      {
        dark: "#3f423d",
        label: "オフのスイッチ・無効なボタン",
        light: "#d5d9cf",
        name: "fill-primary",
      },
    ],
  },
  {
    label: "文字",
    tokens: [
      {
        dark: "#f1f4f0",
        label: "本文",
        light: "#30332f",
        name: "text-primary",
      },
      {
        dark: "#cacfc8",
        label: "ラベル",
        light: "#565e52",
        name: "text-secondary",
      },
      {
        dark: "#adb3ab",
        label: "補足",
        light: "#72796e",
        name: "text-tertiary",
      },
      {
        dark: "#989d95",
        label: "注記・曜日",
        light: "#8a9086",
        name: "text-quaternary",
      },
      {
        dark: "#555954",
        label: "無効",
        light: "#b9beb4",
        name: "text-disabled",
      },
    ],
  },
  {
    label: "線",
    tokens: [
      {
        dark: "#343833",
        label: "ボタン・入力欄の枠",
        light: "#e0e3db",
        name: "border-default",
      },
      {
        dark: "#2a2d28",
        label: "区切り線",
        light: "#eceee8",
        name: "separator",
      },
      {
        dark: "#535851",
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
        name: "calendar-holiday",
      },
      {
        dark: "#98b4d4",
        label: "土曜",
        light: "#6682a0",
        name: "calendar-saturday",
      },
      {
        dark: "#e58c83",
        label: "削除・警告",
        light: "#b0564f",
        name: "danger-default",
      },
      {
        dark: "#c4675f",
        label: "未読バッジ",
        light: "#b0564f",
        name: "danger-fill",
      },
      {
        dark: "#ffffff",
        label: "未読バッジの文字",
        light: "#ffffff",
        name: "danger-on-fill",
      },
    ],
  },
  {
    label: "反転・重なり",
    tokens: [
      {
        dark: "#f1f4f0",
        label: "反転ボタン・トースト",
        light: "#30332f",
        name: "inverse-background",
      },
      {
        dark: "#131513",
        label: "反転の上の文字",
        light: "#ffffff",
        name: "inverse-text",
      },
      {
        dark: "#ffffff",
        label: "スイッチのつまみ",
        light: "#ffffff",
        name: "control-knob",
      },
      {
        dark: "#e2e6e1",
        label: "ホームインジケーター",
        light: "#363a33",
        name: "home-indicator",
      },
      { dark: "#0000008c", label: "暗幕", light: "#30332f35", name: "scrim" },
      {
        dark: "#00000040",
        label: "影（弱）",
        light: "#30332f14",
        name: "shadow-small",
      },
      {
        dark: "#00000059",
        label: "影",
        light: "#30332f1f",
        name: "shadow-medium",
      },
      {
        dark: "#00000080",
        label: "影（強）",
        light: "#30332f2e",
        name: "shadow-large",
      },
    ],
  },
  {
    // Over a photo or the camera, whose black stays black whatever the
    // テーマ and light or dark: white words and buttons on it, and black
    // laid over a photo to dim it or hold a button.
    label: "写真・カメラの上",
    tokens: [
      {
        dark: "#000000",
        label: "カメラ・写真の地",
        light: "#000000",
        name: "media-background",
      },
      {
        dark: "#ffffff",
        label: "文字・アイコン",
        light: "#ffffff",
        name: "media-text",
      },
      {
        dark: "#ffffff73",
        label: "補足",
        light: "#ffffff73",
        name: "media-text-secondary",
      },
      {
        dark: "#ffffff29",
        label: "ボタン・メモ",
        light: "#ffffff29",
        name: "media-fill",
      },
      {
        dark: "#ffffff0f",
        label: "読み取る枠",
        light: "#ffffff0f",
        name: "media-fill-faint",
      },
      {
        dark: "#00000052",
        label: "送信中の写真",
        light: "#00000052",
        name: "media-dim",
      },
      {
        dark: "#00000099",
        label: "写真の上のボタン",
        light: "#00000099",
        name: "media-shade",
      },
      {
        dark: "#ffd60a",
        label: "注意",
        light: "#ffd60a",
        name: "media-warning",
      },
    ],
  },
];

export const neutralTokens = neutralTokenGroups.flatMap(({ tokens }) => tokens);

// Tints the neutrals toward a theme: each token keeps its lightness, turns to
// the theme's hue, and scales its chroma by `strength` (0 = pure gray).
export type NeutralTint = { hue: number; strength: number };

// Colors that carry their own meaning and stay put whatever the theme.
export const untintedTokens = new Set([
  "calendar-holiday",
  "calendar-saturday",
  "danger-default",
  "danger-fill",
  "danger-on-fill",
  "control-knob",
  "media-background",
  "media-text",
  "media-text-secondary",
  "media-fill",
  "media-fill-faint",
  "media-dim",
  "media-shade",
  "media-warning",
]);

function neutralValue(
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

export function neutralRoles(
  scheme: ColorScheme,
  tint?: NeutralTint
): Record<string, string> {
  return Object.fromEntries(
    neutralTokens.map((token) => [
      token.name,
      neutralValue(token, scheme, tint),
    ])
  );
}

// Twelve muted colors a shift pattern can take, chosen to sit with the moss
// green theme: `color` draws the mark and text, `tint` fills the ground
// behind it. `dark` holds both for dark mode.
export const markColors = [
  {
    color: "#486444",
    dark: { color: "#abc7a7", tint: "#2a3528" },
    name: "モス",
    tint: "#e4ecdf",
  },
  {
    color: "#8a6d1a",
    dark: { color: "#d6bb77", tint: "#3a3118" },
    name: "からし",
    tint: "#f3ead0",
  },
  {
    color: "#95602e",
    dark: { color: "#e6b285", tint: "#402d1c" },
    name: "オレンジ",
    tint: "#f5e4d2",
  },
  {
    color: "#93503a",
    dark: { color: "#efab95", tint: "#442a23" },
    name: "テラコッタ",
    tint: "#f3dfd6",
  },
  {
    color: "#9b3f35",
    dark: { color: "#fea194", tint: "#432a26" },
    name: "赤",
    tint: "#f4dcd8",
  },
  {
    color: "#8d4a5a",
    dark: { color: "#eda8b6", tint: "#43292e" },
    name: "ローズ",
    tint: "#f2e0e4",
  },
  {
    color: "#75497a",
    dark: { color: "#d8acdd", tint: "#3b2b3d" },
    name: "すみれ",
    tint: "#eee1ef",
  },
  {
    color: "#5f4f86",
    dark: { color: "#c2b4ec", tint: "#332e44" },
    name: "ラベンダー",
    tint: "#e8e2f0",
  },
  {
    color: "#4a5388",
    dark: { color: "#afbaf1", tint: "#2c3046" },
    name: "藍",
    tint: "#e3e6f2",
  },
  {
    color: "#3d4a73",
    dark: { color: "#c0d0fc", tint: "#2c3142" },
    name: "紺",
    tint: "#dde2ee",
  },
  {
    color: "#36706c",
    dark: { color: "#95cac5", tint: "#213635" },
    name: "青緑",
    tint: "#dcebea",
  },
  {
    color: "#56636d",
    dark: { color: "#b3c0ca", tint: "#2e3237" },
    name: "グレー",
    tint: "#e3e7ea",
  },
] as const;

// A shift color as drawn in light or dark mode, its chroma scaled by the
// テーマ's vividness and its lightness kept, so a softer テーマ grays its
// shifts without lightening or darkening them.
export function markColorIn(
  option: (typeof markColors)[number],
  scheme: ColorScheme,
  vividness = 1
) {
  const { color, tint } = scheme === "dark" ? option.dark : option;
  const soften = (hex: string) => {
    if (vividness === 1) {
      return hex;
    }
    const oklch = hexToOklch(hex);
    return oklchToHex({ ...oklch, chroma: oklch.chroma * vividness });
  };
  return { color: soften(color), name: option.name, tint: soften(tint) };
}
