import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// The app's spacing sits on a 4px grid and its corners on a few radii, so
// pieces line up and the native apps can share the same steps. 1 and 2px
// are left for hairlines and nudges.
const components = path.join(import.meta.dir, "../src/components");

// The design pages and the device's stand-ins draw to their own measure.
const outside = new Set([
  "design-app-icon.tsx",
  "design-colors.tsx",
  "design-frames.tsx",
  "design-home-screen.tsx",
  "design-page.tsx",
  "design-phone.tsx",
  "design-variant-panel.tsx",
  "design-widget-frame.tsx",
  "shift-mark.tsx",
]);
// A sheet pictured over the phone follows its screen's corner.
const devicePictures = new Set(["design-sheet.tsx 46px"]);

const spacingProperty =
  /\b(?:gap|rowGap|columnGap|padding\w*|margin\w*):\s*"(?<value>[^"]+)"/gu;
const radiusProperty = /\bborder\w*Radius:\s*"(?<value>[^"]+)"/gu;
const pixels = /(?<number>-?\d+(?:\.\d+)?)px/gu;
const radii = new Set([0, 1, 2, 4, 8, 12, 16, 20, 24, 28, 32, 999]);

const offGrid = (property: RegExp, allowed: (px: number) => boolean) =>
  readdirSync(components)
    .filter((file) => file.endsWith(".tsx") && !outside.has(file))
    .flatMap((file) => {
      const source = readFileSync(path.join(components, file), "utf-8");
      return [...source.matchAll(property)].flatMap((match) => {
        const value = match.groups?.value ?? "";
        return value.includes("calc(")
          ? []
          : [...value.matchAll(pixels)]
              .map((pixel) => ({
                px: Number(pixel.groups?.number),
                whole: pixel[0],
              }))
              .filter(({ px, whole }) => {
                const pictured = devicePictures.has(`${file} ${whole}`);
                return !(pictured || allowed(px));
              })
              .map(({ whole }) => `${file}: ${whole} in "${value}"`);
      });
    });

test("spacing is on the 4px grid", () => {
  expect(
    offGrid(spacingProperty, (px) => Math.abs(px) <= 2 || px % 4 === 0)
  ).toEqual([]);
});

test("corners are one of the radii", () => {
  expect(offGrid(radiusProperty, (px) => radii.has(px))).toEqual([]);
});
