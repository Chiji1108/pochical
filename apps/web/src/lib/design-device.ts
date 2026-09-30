import { create } from "zustand";

import { wallpaperSamples } from "./material-you";

// The phone the prototype stands in for, beyond what the person sets: its
// platform and its wallpaper's main color. /demo sets them from its
// design choices; a real app reads them from the system. Only Android
// gives an app its wallpaper's colors, for the テーマ 壁紙の色.
export type Platform = "ios" | "android";

// Where 壁紙の色 sits among the テーマ: in a row of its own over the
// pager, as Pixel's 壁紙とスタイル keeps wallpaper colors apart from the
// basic ones, or on a page of its own at either end.
export type WallpaperThemePlace = "row" | "first" | "last";

type DeviceState = {
  platform: Platform;
  wallpaperHue: number;
  wallpaperThemePlace: WallpaperThemePlace;
};

export const useDevice = create<DeviceState>()(() => ({
  platform: "ios",
  wallpaperHue: wallpaperSamples[0].hue,
  wallpaperThemePlace: "row",
}));
