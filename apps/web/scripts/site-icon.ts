// Paints the site icon (public/icon.png) from the poodle drawing, in the
// app icon's モス colors, the way /design/assets paints the app icons.
// Run again after changing the drawing: bun run icon:site
import sharp from "sharp";

import {
  DRAWING_SHARE,
  ICON_SIZE,
  iconColorOptions,
  inkBounds,
  outsideOf,
  rgbOf,
} from "../src/components/design-app-icon";

const SOURCE = new URL("../public/design/poodle.png", import.meta.url).pathname;
const OUTPUT = new URL("../public/icon.png", import.meta.url).pathname;
const CHANNELS = 3;

const moss = iconColorOptions.find((option) => option.id === "moss");
if (!moss) {
  throw new Error("The モス icon colors are missing");
}

const { data, info } = await sharp(SOURCE)
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const { width, height } = info;
const lightness = new Uint8Array(width * height);
for (let index = 0; index < lightness.length; index += 1) {
  const offset = index * CHANNELS;
  lightness[index] = Math.round(
    ((data[offset] ?? 0) + (data[offset + 1] ?? 0) + (data[offset + 2] ?? 0)) /
      CHANNELS
  );
}

// Each pixel is its region's color darkened toward the line color by how
// dark the drawing is there, as on the app icon.
const outside = outsideOf(lightness, width, height);
const ground = rgbOf(moss.ground);
const dog = rgbOf(moss.dog);
const line = rgbOf(moss.line);
const painted = Buffer.alloc(width * height * CHANNELS);
for (let index = 0; index < lightness.length; index += 1) {
  const base = outside[index] ? ground : dog;
  const ink = 1 - (lightness[index] ?? 255) / 255;
  for (let channel = 0; channel < CHANNELS; channel += 1) {
    painted[index * CHANNELS + channel] = Math.round(
      base[channel] * (1 - ink) + line[channel] * ink
    );
  }
}

// Center the lines and scale them to the app icon's share of the width:
// cut a square around them from the painted drawing, padded with the
// ground, and shrink it to the icon size.
const bounds = inkBounds(lightness, width, height);
const drawn = Math.max(bounds.right - bounds.left, bounds.bottom - bounds.top);
const crop = Math.round(ICON_SIZE / ((ICON_SIZE * DRAWING_SHARE) / drawn));
const [red, green, blue] = ground;
const padded = await sharp(painted, {
  raw: { channels: CHANNELS, height, width },
})
  .extend({
    background: { b: blue, g: green, r: red },
    bottom: crop,
    left: crop,
    right: crop,
    top: crop,
  })
  .raw()
  .toBuffer({ resolveWithObject: true });
await sharp(padded.data, { raw: padded.info })
  .extract({
    height: crop,
    left: Math.round((bounds.left + bounds.right - crop) / 2 + crop),
    top: Math.round((bounds.top + bounds.bottom - crop) / 2 + crop),
    width: crop,
  })
  .resize(ICON_SIZE, ICON_SIZE, { kernel: "lanczos3" })
  .png({ compressionLevel: 9 })
  .toFile(OUTPUT);
