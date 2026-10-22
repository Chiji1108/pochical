import { presets } from "@pochical/design/themes";
import { site } from "@pochical/prototype/lib/brand";
import { deviceSettingsKey } from "@pochical/prototype/lib/design-settings-key";
import type { HtmlTagDescriptor } from "vite";

import { appSplashScreens } from "./src/lib/app-splash-screens";
import { screenColor } from "./src/lib/screen-color";

// The screen's color in each テーマ, light and dark.
const screenColors = Object.fromEntries(
  presets.map(({ id }) => [
    id,
    { dark: screenColor(id, "dark"), light: screenColor(id, "light") },
  ])
);

// Nothing is drawn until the app's script runs, and iOS colors the status
// bar from the page it first paints. Before that paint, this finds the
// screen's color from the saved 外観 and テーマ, or the device's light or
// dark, and gives it to the bar and to the empty page, so a dark screen
// does not start light.
const launchScript = `(() => {
  const colors = ${JSON.stringify(screenColors)};
  let device = {};
  try {
    device = JSON.parse(localStorage.getItem(${JSON.stringify(deviceSettingsKey)}) ?? "{}").state?.device ?? {};
  } catch {}
  const scheme = device.appearance === "light" || device.appearance === "dark"
    ? device.appearance
    : matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  const color = (colors[device.preset] ?? colors.pochical)[scheme];
  document.querySelector('meta[name="theme-color"]').content = color;
  document.documentElement.style.background = color;
})();`;

// What index.html's head takes from the design tokens and the generated
// launch images: the page's name, the bar's first color and the script
// that picks it, and iOS's launch images. After the head's own tags, so
// its charset stays in the first bytes.
export const head = (): HtmlTagDescriptor[] =>
  [
    { children: `試す | ${site.name}`, tag: "title" },
    {
      attrs: { content: "スマホで触れるポチカルの試作", name: "description" },
      tag: "meta",
    },
    {
      attrs: { content: site.name, name: "apple-mobile-web-app-title" },
      tag: "meta",
    },
    {
      attrs: { content: screenColors.pochical?.light, name: "theme-color" },
      tag: "meta",
    },
    { children: launchScript, tag: "script" },
    ...appSplashScreens.map((attrs) => ({ attrs, tag: "link" })),
  ].map((tag) => ({ ...tag, injectTo: "head" }));
