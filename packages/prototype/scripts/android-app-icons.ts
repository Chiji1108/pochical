// Paints the Android app's launcher icon from the poodle drawing in the
// app's own colors, モス, as ios-app-icons.ts paints the iOS one: an adaptive
// icon of the ground's color behind the drawing, with the drawing alone as
// the mask Android 13's themed icons tint, and the 512-pixel icon Google
// Play's store listing asks for beside the sources.
// Run again after changing the drawing or the colors: pnpm run icon:android
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";

import sharp from "sharp";

import { DRAWING_SHARE, paintedPixels } from "../src/lib/app-icon-paint";
import {
  colorsOf,
  cutIcon,
  height,
  lightness,
  paint,
  peekingPoodle,
  width,
} from "./app-icon";

const MAIN = new URL("../../../apps/android/app/src/main/", import.meta.url)
  .pathname;
const RES = `${MAIN}res/`;
const RGBA = 4;
// An adaptive icon's layers are 108dp squares, of which a launcher's mask
// shows at most the middle 72dp.
const LAYER_DP = 108;
const SHOWN_DP = 72;
// The drawing takes the same share of what is shown as of iOS's icon.
const LAYER_SHARE = (DRAWING_SHARE * SHOWN_DP) / LAYER_DP;
const DENSITIES = { hdpi: 1.5, mdpi: 1, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const PLAY_SIZE = 512;
// 次の休み's 92dp dog peeking from the widget's corner, at xxxhdpi.
const PEEKING_SIZE = 368;
const GENERATED =
  "<!-- Written by packages/prototype/scripts/android-app-icons.ts (pnpm run icon:android). -->";

const moss = colorsOf("moss");
const foreground = paintedPixels(lightness, width, height, moss, true);
// The dog's share of each pixel, as white on black, made the opacity of a
// white drawing: the themed icon tints the dog and leaves the lines clear.
// The ground and the lines take one color there, as on ダーク's icon, so
// it borrows ダーク's rim to keep the nose and the marks above the head,
// which sit outside the outline.
const dogShare = paintedPixels(lightness, width, height, {
  ...moss,
  dog: "#ffffff",
  ground: "#000000",
  line: "#000000",
  rim: colorsOf("dark").rim,
});
const monochrome = new Uint8ClampedArray(dogShare.length).fill(255);
for (let offset = 3; offset < monochrome.length; offset += RGBA) {
  monochrome[offset] = dogShare[offset - 3] ?? 0;
}

// The mipmaps hold the launcher icon alone, so a density or layer dropped
// here leaves nothing behind.
const folders = await readdir(RES);
await Promise.all(
  folders
    .filter((folder) => folder.startsWith("mipmap-"))
    .map(async (folder) => {
      await rm(`${RES}${folder}`, { force: true, recursive: true });
    })
);

await Promise.all(
  Object.entries(DENSITIES).map(async ([density, scale]) => {
    const folder = `${RES}mipmap-${density}/`;
    const size = LAYER_DP * scale;
    await mkdir(folder, { recursive: true });
    const [front, mask] = await Promise.all(
      [foreground, monochrome].map(
        async (pixels) => await cutIcon(pixels, size, { share: LAYER_SHARE })
      )
    );
    await Promise.all([
      writeFile(`${folder}ic_launcher_foreground.png`, front),
      writeFile(`${folder}ic_launcher_monochrome.png`, mask),
    ]);
  })
);

await mkdir(`${RES}mipmap-anydpi/`, { recursive: true });
await mkdir(`${RES}values/`, { recursive: true });
await Promise.all([
  writeFile(
    `${RES}mipmap-anydpi/ic_launcher.xml`,
    `<?xml version="1.0" encoding="utf-8"?>
${GENERATED}
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@color/ic_launcher_background" />
  <foreground android:drawable="@mipmap/ic_launcher_foreground" />
  <monochrome android:drawable="@mipmap/ic_launcher_monochrome" />
</adaptive-icon>
`
  ),
  writeFile(
    `${RES}values/ic_launcher_background.xml`,
    `<?xml version="1.0" encoding="utf-8"?>
${GENERATED}
<resources>
  <color name="ic_launcher_background">${moss.ground}</color>
</resources>
`
  ),
  // Play takes a 32-bit PNG, and cuts the corners itself.
  writeFile(
    `${MAIN}ic_launcher-playstore.png`,
    await sharp(await paint(moss, PLAY_SIZE))
      .ensureAlpha()
      .png({ compressionLevel: 9 })
      .toBuffer()
  ),
]);

// 次の休み's peeking dog (app-icon.ts's peekingPoodle), as ios-app-icons.ts
// writes iOS's: Glance shows the one the launcher's light or dark picks.
const { light, dark } = await peekingPoodle(PEEKING_SIZE);
const peeking: [string, Buffer][] = [
  ["drawable-nodpi", light],
  ["drawable-night-nodpi", dark],
];
await Promise.all(
  peeking.map(async ([folder, picture]) => {
    await mkdir(`${RES}${folder}/`, { recursive: true });
    await writeFile(`${RES}${folder}/widget_poodle.png`, picture);
  })
);
