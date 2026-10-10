// おたのしみ's skies (spec/calendar.md, The month): a pale light at the top
// of the calendar, three hues warm to cool across it, the left corner's,
// the middle's and the right corner's. `vivid` scales their chroma. Plain
// gradients, which the web's CSS, SwiftUI and Compose draw the same; `mise
// run gen` writes each sky's lights out for the native apps.

import { oklchToHex } from "./oklch";
import { presets } from "./themes";
import type { PresetId } from "./themes";

export type Sky = {
  name: string;
  hues: readonly [number, number, number];
  vivid?: number;
};

// The skies anyone may get, by the id the device settings keep.
export const skies = {
  asayake: { hues: [55, 235, 300], name: "朝焼け" },
  hakumei: { hues: [290, 250, 15], name: "薄明" },
  koori: { hues: [215, 280, 180], name: "氷" },
  mikan: { hues: [75, 100, 5], name: "蜜柑" },
  momo: { hues: [10, 65, 320], name: "桃" },
  ramune: { hues: [165, 105, 215], name: "ラムネ" },
  wakakusa: { hues: [130, 95, 195], name: "若草" },
  yunagi: { hues: [35, 350, 275], name: "夕凪" },
} as const satisfies Record<string, Sky>;

// Each テーマ's own sky, picked to its mood rather than drawn from its
// accent alone: 墨's nearly a silver haze, 抹茶's with a sakura sweet's
// pink, 喫茶's its lamps' amber, 月夜's the night's blues (its accent is
// the moon), 黒板's chalk.
export const themeSkies = {
  cocoa: { hues: [45, 75, 10], name: "ココア", vivid: 0.8 },
  kissa: { hues: [60, 35, 85], name: "喫茶" },
  kokuban: { hues: [165, 215, 345], name: "黒板", vivid: 0.8 },
  matcha: { hues: [120, 90, 350], name: "抹茶" },
  milktea: { hues: [55, 80, 20], name: "ミルクティー", vivid: 0.8 },
  pochical: { hues: [100, 150, 225], name: "ポチカル" },
  sakura: { hues: [35, 355, 300], name: "さくら" },
  soda: { hues: [170, 215, 100], name: "ソーダ" },
  sumi: { hues: [250, 90, 300], name: "墨", vivid: 0.4 },
  sumire: { hues: [310, 280, 20], name: "すみれ" },
  tsukiyo: { hues: [290, 250, 215], name: "月夜" },
  zen: { hues: [110, 90, 150], name: "禅", vivid: 0.6 },
} as const satisfies Record<PresetId, Sky>;

// A テーマ's sky is kept as its own id, so it stays when the テーマ changes.
export const themeSkyId = (theme: string) => `theme-${theme}`;

// Pale and airy in light mode; deep, like jewels in shade, in dark mode,
// a step lighter than the screen, whose ground a night テーマ colors (月夜's
// navy, 黒板's board).
export const skyTones = {
  dark: { chroma: 0.05, lift: 0.05 },
  light: { chroma: 0.04, lightness: 0.95 },
} as const;

// The dark gray screen (background-base) in OKLCH lightness.
export const DARK_GROUND = 0.28;

// The ground a sky stands on in dark mode: a テーマ drawn dark has its
// own when it colors one; a light テーマ's ground is only its light mode's.
export function darkGroundOf(theme: string) {
  const preset = presets.find((item) => item.id === theme);
  return preset !== undefined &&
    "scheme" in preset &&
    preset.scheme === "dark" &&
    "ground" in preset
    ? preset.ground.lightness
    : DARK_GROUND;
}

// A sky's three lights, left, middle and right.
export function skyLights(
  sky: Sky,
  scheme: "light" | "dark",
  ground = DARK_GROUND
) {
  const { chroma } = skyTones[scheme];
  const lightness =
    scheme === "light" ? skyTones.light.lightness : ground + skyTones.dark.lift;
  return sky.hues.map((hue) =>
    oklchToHex({ chroma: chroma * (sky.vivid ?? 1), hue, lightness })
  );
}

// How one sky gives way to the next, in seconds, and how slowly the light
// breathes while it stays.
export const skyMotion = { breathSeconds: 9, changeSeconds: 0.9 } as const;
