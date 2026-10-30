// The screens the web app manifest shows where a browser offers to install
// apps/try (Android's install sheet among them): photographed by
// scripts/app-screenshots.ts (pnpm run image:screens) into public/app, and
// listed in the manifest by scripts/app-assets.ts (pnpm run icon:app).

// A phone held upright: 360 by 640 points at three pixels a point.
export const APP_SCREENSHOT = { height: 1920, scale: 3, width: 1080 } as const;

export const appScreenshots = [
  { label: "ひと月のシフトが並ぶカレンダー", name: "calendar" },
  { label: "シフトをポチポチ押して入力する", name: "entering" },
  { label: "グループのみんなのシフトとチャット", name: "group" },
  { label: "グループのチャット", name: "group-chat" },
] as const;

export type AppScreenshotName = (typeof appScreenshots)[number]["name"];

export const appScreenshotFile = (name: AppScreenshotName) =>
  `screenshot-${name}-${APP_SCREENSHOT.width}x${APP_SCREENSHOT.height}.png`;
