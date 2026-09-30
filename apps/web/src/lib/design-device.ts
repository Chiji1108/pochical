import { create } from "zustand";

import { wallpaperSamples } from "./material-you";

// The phone the prototype stands in for, beyond what the person sets: its
// platform and, on Android, the main color of its wallpaper, which the
// colors Android is set to come from here. /demo sets them from its
// design choices; a real app reads Android's colors from the system, for
// the テーマ 端末の色.
export type Platform = "ios" | "android";

type DeviceState = {
  platform: Platform;
  wallpaperHue: number;
};

export const useDevice = create<DeviceState>()(() => ({
  platform: "ios",
  wallpaperHue: wallpaperSamples[0].hue,
}));
