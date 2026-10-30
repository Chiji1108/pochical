// Takes the manifest's screenshots (src/lib/app-screenshots.ts) of the app
// as a phone shows it, on a dev server of its own, into public/app. Run
// again after changing those screens: pnpm run image:screens
import { fileURLToPath } from "node:url";

import {
  photographDevServer,
  waitUntilDrawn,
} from "@pochical/prototype/scripts/photograph";
import type { Browser, Page } from "playwright-core";

import {
  APP_SCREENSHOT,
  appScreenshotFile,
  appScreenshots,
} from "../src/lib/app-screenshots";
import type { AppScreenshotName } from "../src/lib/app-screenshots";

const FOLDER = fileURLToPath(new URL("../public/app/", import.meta.url));

// Japanese text has a <wbr> between its phrases (packages/jsx), which
// Playwright reads as a space in a button's name, so a name of more than
// one phrase is matched by a pattern.
const tap = async (page: Page, name: string | RegExp) => {
  await page.getByRole("button", { exact: true, name }).click();
};

// The taps from the calendar, as the app opens, to each screen.
const steps: Record<AppScreenshotName, (page: Page) => Promise<void>> = {
  calendar: async () => {
    // The calendar is the screen the app opens on.
  },
  entering: async (page) => {
    await tap(page, "ポチポチ入力");
  },
  group: async (page) => {
    await tap(page, "グループ");
  },
  "group-chat": async (page) => {
    await tap(page, "グループ");
    await tap(page, /^全体\s*チャット/u);
    // Someone else's photo comes a moment later, as over the network, and
    // shows once drawn.
    const photos = await page
      .getByRole("button", { name: /大きく\s*表示/u })
      .all();
    await Promise.all(
      photos.map(async (photo) => {
        await photo.locator("img").waitFor();
      })
    );
  },
};

// A fresh phone for each screen, starting from the sample as the app does
// on each opening. Its first launch's note is read and closed first, as a
// person does.
const photograph = async (
  browser: Browser,
  origin: string,
  name: AppScreenshotName
) => {
  const context = await browser.newContext({
    colorScheme: "light",
    deviceScaleFactor: APP_SCREENSHOT.scale,
    hasTouch: true,
    isMobile: true,
    locale: "ja-JP",
    reducedMotion: "reduce",
    serviceWorkers: "block",
    timezoneId: "Asia/Tokyo",
    viewport: {
      height: APP_SCREENSHOT.height / APP_SCREENSHOT.scale,
      width: APP_SCREENSHOT.width / APP_SCREENSHOT.scale,
    },
  });
  try {
    const page = await context.newPage();
    await page.goto(origin, { waitUntil: "networkidle" });
    await tap(page, "はじめる");
    await steps[name](page);
    await waitUntilDrawn(page);
    await page.screenshot({
      animations: "disabled",
      path: `${FOLDER}${appScreenshotFile(name)}`,
    });
  } finally {
    await context.close();
  }
};

// head.ts imports the workspace's TypeScript, so the config loads as
// package.json's scripts load it.
await photographDevServer(
  {
    cacheDir: "node_modules/.vite-app-screenshots",
    configLoader: "runner",
    root: fileURLToPath(new URL("..", import.meta.url)),
  },
  async ({ browser, origin }) => {
    // One after another: a screen that reaches a module the dev server has
    // yet to prebundle reloads every open page.
    for (const { name } of appScreenshots) {
      // oxlint-disable-next-line no-await-in-loop
      await photograph(browser, origin, name);
    }
  }
);
