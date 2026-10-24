// Paints the site icon (src/assets/icon.png) from the poodle drawing, in the
// app icon's モス colors, the way /design/assets paints the app icons, and
// the small ones made from it: the home screen's (180) and the one an
// invitation's share image and the save sheet draw (192).
// Run again after changing the drawing: pnpm run icon:site
import { writeFile } from "node:fs/promises";

import sharp from "sharp";

import { ICON_SIZE } from "../src/lib/app-icon-paint";
import { colorsOf, paint } from "./app-icon";

const ASSETS = new URL("../src/assets/", import.meta.url).pathname;
const SMALL_SIZES = [180, 192];

const icon = await paint(colorsOf("moss"), ICON_SIZE);
await writeFile(`${ASSETS}icon.png`, icon);
await Promise.all(
  SMALL_SIZES.map(async (size) => {
    await sharp(icon)
      .resize(size, size, { kernel: "lanczos3" })
      // As @vite-pwa/assets-generator writes its icons: a palette PNG.
      .png({ compressionLevel: 9, quality: 60 })
      .toFile(`${ASSETS}icon-${size}.png`);
  })
);
