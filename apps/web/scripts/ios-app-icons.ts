// Paints the iOS app's icons from the poodle drawing, the way /design
// paints them (src/components/design-app-icon.tsx): each pickable color as
// an app icon set, with its dark twin for a home screen set to dark icons,
// and a small preview of each for 設定 > アプリアイコン to show.
// Run again after changing the drawing or the colors: bun run icon:ios
import { mkdir, rm, writeFile } from "node:fs/promises";

import sharp from "sharp";

import {
  darkTwinOf,
  darkTwins,
  DRAWING_SHARE,
  ICON_SIZE,
  iconColorOptions,
  inkBounds,
  paintedPixels,
} from "../src/components/design-app-icon";
import type { IconColors } from "../src/components/design-app-icon";

const SOURCE = new URL("../public/design/poodle.png", import.meta.url).pathname;
const ASSETS = new URL(
  "../../ios/Pochical/Pochical/Assets.xcassets/",
  import.meta.url
).pathname;
const CHANNELS = 3;
const RGBA = 4;
// Big enough for 設定's two-across grid on a 3x screen.
const PREVIEW_SIZE = 312;
// The app's own icon set; the others are named after it.
const PRIMARY = "moss";

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
const bounds = inkBounds(lightness, width, height);
const drawn = Math.max(bounds.right - bounds.left, bounds.bottom - bounds.top);
// A square around the lines, at the share of the icon they take.
const crop = Math.round(ICON_SIZE / ((ICON_SIZE * DRAWING_SHARE) / drawn));

const colorsOf = (id: string): IconColors => {
  const colors = [...iconColorOptions, ...darkTwins].find(
    (option) => option.id === id
  );
  if (!colors) {
    throw new Error(`No icon colors named ${id}`);
  }
  return colors;
};

// The icon in these colors at `size`, opaque, as iOS asks of app icons.
const paint = async (colors: IconColors, size: number) => {
  const painted = Buffer.from(
    paintedPixels(lightness, width, height, colors).buffer
  );
  const [red, green, blue] = [1, 3, 5].map((start) =>
    Number.parseInt(colors.ground.slice(start, start + 2), 16)
  );
  const background = { alpha: 1, b: blue ?? 0, g: green ?? 0, r: red ?? 0 };
  const padded = await sharp(painted, {
    raw: { channels: RGBA, height, width },
  })
    .extend({ background, bottom: crop, left: crop, right: crop, top: crop })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return await sharp(padded.data, { raw: padded.info })
    .extract({
      height: crop,
      left: Math.round((bounds.left + bounds.right - crop) / 2 + crop),
      top: Math.round((bounds.top + bounds.bottom - crop) / 2 + crop),
      width: crop,
    })
    .resize(size, size, { kernel: "lanczos3" })
    .flatten({ background })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toBuffer();
};

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const author = { author: "xcode", version: 1 };

// An icon set: the icon, its dark twin, and the preview 設定 shows.
const writeIconSet = async (option: IconColors) => {
  const set = option.id === PRIMARY ? "AppIcon" : `AppIcon-${option.id}`;
  const dark = darkTwinOf[option.id] ?? option.id;
  const folder = `${ASSETS}${set}.appiconset/`;
  const preview = `${ASSETS}AppIconPreview-${option.id}.imageset/`;
  await Promise.all(
    [folder, preview].map(async (path) => {
      await rm(path, { force: true, recursive: true });
      await mkdir(path, { recursive: true });
    })
  );
  const [light, darkIcon, small] = await Promise.all([
    paint(option, ICON_SIZE),
    paint(colorsOf(dark), ICON_SIZE),
    paint(option, PREVIEW_SIZE),
  ]);
  await Promise.all([
    writeFile(`${folder}light.png`, light),
    writeFile(`${folder}dark.png`, darkIcon),
    writeFile(
      `${folder}Contents.json`,
      json({
        images: [
          {
            filename: "light.png",
            idiom: "universal",
            platform: "ios",
            size: "1024x1024",
          },
          {
            appearances: [{ appearance: "luminosity", value: "dark" }],
            filename: "dark.png",
            idiom: "universal",
            platform: "ios",
            size: "1024x1024",
          },
        ],
        info: author,
      })
    ),
    writeFile(`${preview}icon.png`, small),
    writeFile(
      `${preview}Contents.json`,
      json({
        images: [{ filename: "icon.png", idiom: "universal" }],
        info: author,
      })
    ),
  ]);
};

await Promise.all(iconColorOptions.map(writeIconSet));
