// The poodle drawing, read once, and the app icon cut from it the way
// /design paints it (src/components/design-app-icon.tsx), for the scripts
// that write each platform's icons: ios-app-icons.ts, android-app-icons.ts
// and site-icon.ts.
import sharp from "sharp";

import {
  darkTwins,
  DRAWING_SHARE,
  iconColorOptions,
  inkBounds,
  lightDrawing,
  paintedPixels,
  rgbOf,
} from "../src/lib/app-icon-paint";
import type { IconColors } from "../src/lib/app-icon-paint";

const SOURCE = new URL("../src/assets/poodle.png", import.meta.url).pathname;
const CHANNELS = 3;
const RGBA = 4;

const { data, info } = await sharp(SOURCE)
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
export const { width, height } = info;
export const lightness = new Uint8Array(width * height);
for (let index = 0; index < lightness.length; index += 1) {
  const offset = index * CHANNELS;
  lightness[index] = Math.round(
    ((data[offset] ?? 0) + (data[offset + 1] ?? 0) + (data[offset + 2] ?? 0)) /
      CHANNELS
  );
}
const bounds = inkBounds(lightness, width, height);
const drawn = Math.max(bounds.right - bounds.left, bounds.bottom - bounds.top);

export const colorsOf = (id: string): IconColors => {
  const colors = [...iconColorOptions, ...darkTwins].find(
    (option) => option.id === id
  );
  if (!colors) {
    throw new Error(`No icon colors named ${id}`);
  }
  return colors;
};

// The drawing's RGBA pixels at the source's size, centered on its lines and
// scaled so they take `share` of a square `size` wide. With a `ground`, the
// square is filled with it and opaque, as iOS asks of app icons; without,
// it is see-through around the drawing.
export const cutIcon = async (
  pixels: Uint8ClampedArray,
  size: number,
  { ground, share = DRAWING_SHARE }: { ground?: string; share?: number } = {}
) => {
  // A square around the lines, at the share of the icon they take.
  const crop = Math.round(drawn / share);
  const opaque = ground !== undefined;
  const [red, green, blue] = opaque ? rgbOf(ground) : [0, 0, 0];
  const background = { alpha: opaque ? 1 : 0, b: blue, g: green, r: red };
  const padded = await sharp(Buffer.from(pixels.buffer), {
    raw: { channels: RGBA, height, width },
  })
    .extend({ background, bottom: crop, left: crop, right: crop, top: crop })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const cut = sharp(padded.data, { raw: padded.info })
    .extract({
      height: crop,
      left: Math.round((bounds.left + bounds.right - crop) / 2 + crop),
      top: Math.round((bounds.top + bounds.bottom - crop) / 2 + crop),
      width: crop,
    })
    .resize(size, size, { kernel: "lanczos3" });
  return await (opaque ? cut.flatten({ background }).removeAlpha() : cut)
    .png({ compressionLevel: 9 })
    .toBuffer();
};

// The icon in these colors at `size`, opaque.
export const paint = async (colors: IconColors, size: number) =>
  await cutIcon(paintedPixels(lightness, width, height, colors), size, {
    ground: colors.ground,
  });

// The dog 次の休み's widget peeks from its corner with on a day off, as
// /design draws it, `size` pixels square: the whole drawing, white in dark
// lines for light and the default icon's dark look for dark, each without
// its ground. Each platform's script writes it where its widgets read it.
export const peekingPoodle = async (size: number) => {
  const [light, dark] = await Promise.all(
    [lightDrawing, colorsOf("moss-dark")].map(
      async (colors) =>
        await sharp(
          Buffer.from(
            paintedPixels(lightness, width, height, colors, true).buffer
          ),
          { raw: { channels: RGBA, height, width } }
        )
          .resize(size, size, { kernel: "lanczos3" })
          .png({ compressionLevel: 9 })
          .toBuffer()
    )
  );
  return { dark, light };
};
