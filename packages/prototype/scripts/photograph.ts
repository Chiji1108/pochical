// What the scripts that photograph a web app's screens share: apps/design's
// share image (image:share) and apps/try's manifest screenshots
// (image:screens). Each drives the installed Google Chrome.
import { chromium } from "playwright-core";
import type { Browser, Page } from "playwright-core";
import { createServer } from "vite";
import type { InlineConfig } from "vite";

// Serves the app at `config`'s root with Vite's dev server and opens Chrome
// for `shoot`, closing both after it. On any free port and with its own
// prebundled modules in `cacheDir`, so it never meets a dev server already
// running.
export async function photographDevServer(
  config: InlineConfig & { cacheDir: string; root: string },
  shoot: (studio: { browser: Browser; origin: string }) => Promise<void>
) {
  const server = await createServer({
    ...config,
    server: { port: 0, strictPort: false },
  });
  try {
    await server.listen();
    const [origin] = server.resolvedUrls?.local ?? [];
    if (!origin) {
      throw new Error("The dev server has no address");
    }
    const browser = await chromium.launch({ channel: "chrome" });
    try {
      await shoot({ browser, origin });
    } finally {
      await browser.close();
    }
  } finally {
    await server.close();
  }
}

// Waits until the screen is drawn: every picture on it loaded (one that
// fails to load keeps it waiting, so the step times out rather than a
// broken picture being taken), and the fonts. A lazy picture below the
// screen does not load until scrolled to, so it is left out.
export async function waitUntilDrawn(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() =>
    [...document.images].every((image) => {
      const { bottom, top } = image.getBoundingClientRect();
      const drawn = image.complete && image.naturalWidth > 0;
      return drawn || bottom <= 0 || top >= innerHeight;
    })
  );
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}
