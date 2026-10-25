// Paints the iOS app's icons from the poodle drawing, the way /design
// paints them (src/components/design-app-icon.tsx): each pickable color as
// an app icon set, with its dark twin for a home screen set to dark icons,
// and a small preview of each for 設定 > アプリアイコン to show; and the
// drawing alone, as the first run's welcome shows it.
// Run again after changing the drawing or the colors: pnpm run icon:ios
import { mkdir, rm, writeFile } from "node:fs/promises";

import {
  darkTwinOf,
  ICON_SIZE,
  iconColorOptions,
} from "../src/lib/app-icon-paint";
import type { IconColors } from "../src/lib/app-icon-paint";
import { colorsOf, paint, peekingPoodle, welcomePoodle } from "./app-icon";

const ASSETS = new URL(
  "../../../apps/ios/Pochical/Pochical/Assets.xcassets/",
  import.meta.url
).pathname;
const WIDGET_ASSETS = new URL(
  "../../../apps/ios/Pochical/PochicalWidgets/Assets.xcassets/",
  import.meta.url
).pathname;
// Big enough for 設定's two-across grid on a 3x screen.
const PREVIEW_SIZE = 312;
// The welcome's 200-point dog on a 3x screen.
const WELCOME_SIZE = 600;
// 次の休み's 92-point dog peeking from the corner, on a 3x screen.
const PEEKING_SIZE = 276;
// The app's own icon set; the others are named after it.
const PRIMARY = "moss";

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

// The welcome's dog (app-icon.ts's welcomePoodle), light and dark.
const writeWelcome = async () => {
  const folder = `${ASSETS}WelcomePoodle.imageset/`;
  await rm(folder, { force: true, recursive: true });
  await mkdir(folder, { recursive: true });
  const { light, dark } = await welcomePoodle(WELCOME_SIZE);
  await Promise.all([
    writeFile(`${folder}light.png`, light),
    writeFile(`${folder}dark.png`, dark),
    writeFile(
      `${folder}Contents.json`,
      json({
        images: [
          { filename: "light.png", idiom: "universal" },
          {
            appearances: [{ appearance: "luminosity", value: "dark" }],
            filename: "dark.png",
            idiom: "universal",
          },
        ],
        info: author,
      })
    ),
  ]);
};

await writeWelcome();

// 次の休み's peeking dog (app-icon.ts's peekingPoodle), light and dark.
const writePeeking = async () => {
  const folder = `${WIDGET_ASSETS}PeekingPoodle.imageset/`;
  await rm(folder, { force: true, recursive: true });
  await mkdir(folder, { recursive: true });
  const { light, dark } = await peekingPoodle(PEEKING_SIZE);
  await Promise.all([
    writeFile(`${folder}light.png`, light),
    writeFile(`${folder}dark.png`, dark),
    writeFile(
      `${folder}Contents.json`,
      json({
        images: [
          { filename: "light.png", idiom: "universal" },
          {
            appearances: [{ appearance: "luminosity", value: "dark" }],
            filename: "dark.png",
            idiom: "universal",
          },
        ],
        info: author,
      })
    ),
  ]);
};

await writePeeking();
