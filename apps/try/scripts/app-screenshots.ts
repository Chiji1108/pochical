// Takes the manifest's screenshots (src/lib/app-screenshots.ts) of the app
// as a phone shows it, on a dev server of its own, into public/app. Run
// again after changing those screens: pnpm run image:screens
// It drives the installed Google Chrome.
import { chromium } from "playwright-core";
import type { Browser, Page } from "playwright-core";
import { createServer } from "vite";

import {
  APP_SCREENSHOT,
  appScreenshotFile,
  appScreenshots,
} from "../src/lib/app-screenshots";
import type { AppScreenshotName } from "../src/lib/app-screenshots";
import { firstLaunchNotedKey } from "../src/lib/first-launch-note";

const ROOT = new URL("..", import.meta.url).pathname;
const FOLDER = new URL("../public/app/", import.meta.url).pathname;

const tap = async (page: Page, name: string | RegExp) => {
  await page.getByRole("button", { name }).first().click();
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
  // Japanese text has a <wbr> between its phrases (packages/jsx), which
  // Playwright reads as a space in a button's name.
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

// On any free port and with its own prebundled modules, so it never meets
// a dev server already running. head.ts imports the workspace's
// TypeScript, so the config loads as package.json's scripts load it.
const server = await createServer({
  cacheDir: "node_modules/.vite-app-screenshots",
  configLoader: "runner",
  root: ROOT,
  server: { port: 0, strictPort: false },
});
await server.listen();
const [origin] = server.resolvedUrls?.local ?? [];
if (!origin) {
  throw new Error("The dev server has no address");
}

// A fresh phone for each screen, starting from the sample as the app does
// on each opening, with the first launch's note already read.
const photograph = async (browser: Browser, name: AppScreenshotName) => {
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
    await context.addInitScript((key) => {
      localStorage.setItem(key, "1");
    }, firstLaunchNotedKey);
    const page = await context.newPage();
    await page.goto(origin, { waitUntil: "networkidle" });
    await steps[name](page);
    await page.waitForLoadState("networkidle");
    // Every picture on the screen drawn. A lazy one below it, as in the
    // chat, does not load until scrolled to.
    await page.waitForFunction(() =>
      [...document.images].every((image) => {
        const { bottom, top } = image.getBoundingClientRect();
        return image.complete || bottom <= 0 || top >= innerHeight;
      })
    );
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await page.screenshot({
      animations: "disabled",
      path: `${FOLDER}${appScreenshotFile(name)}`,
    });
  } finally {
    await context.close();
  }
};

const browser = await chromium.launch({ channel: "chrome" });
try {
  await Promise.all(
    appScreenshots.map(async ({ name }) => {
      await photograph(browser, name);
    })
  );
} finally {
  await browser.close();
  await server.close();
}
