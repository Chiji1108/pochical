import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { colorRoleNames } from "@pochical/design/themes";

// The app's pieces take their colors from the color tokens (design/), by
// name, so a テーマ reaches every one and the native apps have the same
// roles to draw them with. What is not the app's own keeps its colors.
const components = path.join(import.meta.dir, "../src/components");

// The design pages and the device's stand-ins draw with their own colors.
const outside = new Set([
  "design-app-icon.tsx",
  "design-colors.tsx",
  "design-frames.tsx",
  "design-home-screen.tsx",
  "design-page.tsx",
  "design-phone.tsx",
  "design-variant-panel.tsx",
  "design-widget-frame.tsx",
  // An invitation's share image, in the site's colors (styles.css) as the
  // site's own share image is.
  "invite-share-image.tsx",
]);

// Colors that are not the app's to choose, each where it is drawn.
const allowed = new Set([
  // Google's logo and the sign-in buttons, in their makers' own colors.
  "design-account.tsx #EA4335",
  "design-account.tsx #4285F4",
  "design-account.tsx #FBBC05",
  "design-account.tsx #34A853",
  "design-account.tsx #000000",
  "design-account.tsx #ffffff",
  "design-account.tsx #131314",
  "design-account.tsx #747775",
  "design-account.tsx #8e918f",
  "design-account.tsx #1f1f1f",
  "design-account.tsx #e3e3e3",
  // The device's calendars, each in the color it has there.
  "design-save-sheet.tsx #5b8def",
  "design-save-sheet.tsx #e0894a",
  "design-save-sheet.tsx #c46fd6",
  "design-save-sheet.tsx #4f9d69",
  "design-save-sheet.tsx #d9534f",
  "design-save-sheet.tsx #8a8f98",
  // iOS's own alert, drawn in its blue.
  "design-sheet.tsx #0a84ff",
  // A fade's mask, which reads only how opaque it is.
  "design-group-hub.tsx #000",
  // What the OS draws a widget in when it renders it in one color.
  "design-widgets-calendar.tsx rgb(255 255 255 / 0.24)",
  "design-widgets-upcoming.tsx rgb(255 255 255 / 0.24)",
  "design-widgets-lock.tsx rgb(255 255 255 / 0.16)",
]);

const literal =
  /#[0-9a-fA-F]{3,8}\b|\brgba?\([^)]*\)|\bhsla?\([^)]*\)|"(?:white|black)"/gu;
const roleVariable = new RegExp(
  `var\\(--(?:${colorRoleNames.join("|")})\\)`,
  "gu"
);

const sources = readdirSync(components)
  .filter((file) => file.endsWith(".tsx") && !outside.has(file))
  .map((file) => ({
    file,
    // Comments may name colors freely.
    source: readFileSync(path.join(components, file), "utf-8").replaceAll(
      /^\s*\/\/.*$/gmu,
      ""
    ),
  }));

test("colors come from the color tokens", () => {
  expect(
    sources.flatMap(({ file, source }) =>
      [...source.matchAll(literal)]
        .map(([value]) => `${file} ${value.replaceAll('"', "")}`)
        .filter((found) => !allowed.has(found))
    )
  ).toEqual([]);
});

// A role by its token name ("text.secondary", token(colors.text.secondary)),
// not by the variable under it.
test("colors are named as tokens, not as variables", () => {
  expect(
    sources.flatMap(({ file, source }) =>
      [...source.matchAll(roleVariable)].map(([value]) => `${file} ${value}`)
    )
  ).toEqual([]);
});
