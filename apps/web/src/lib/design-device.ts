import { create } from "zustand";

import { wallpaperSamples } from "./material-you";

// The phone the prototype stands in for, beyond what the person sets: its
// platform and, on Android, the main color of its wallpaper, which the
// colors Android is set to come from here. /demo sets them from its
// design choices; a real app reads Android's colors from the system, for
// the テーマ 端末の色.
export type Platform = "ios" | "android";

// The app's version the prototype stands in for, and the phone it says it
// is (the reference devices), in place of what the apps read from the
// system: settings show the version, and a message to support carries
// both.
export const APP_VERSION = "1.0.0";
export const deviceNames: Record<Platform, string> = {
  android: "Pixel 9a・Android 16",
  ios: "iPhone 16 Pro・iOS 26.0",
};

// Whether the system lets the app notify: not asked yet, refused (only the
// system's settings can turn it back on), or allowed.
export type NotificationPermission = "notAsked" | "denied" | "allowed";

type DeviceState = {
  platform: Platform;
  wallpaperHue: number;
  notifications: NotificationPermission;
};

export const useDevice = create<DeviceState>()(() => ({
  notifications: "notAsked",
  platform: "ios",
  wallpaperHue: wallpaperSamples[0].hue,
}));
