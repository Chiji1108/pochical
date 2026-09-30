// Takes the picture a shared link shows (public/share.png) from
// /design/share-image, drawn by the site's own components, on a dev server
// of its own. Run again after changing it: bun run image:share
// It drives the installed Google Chrome.
import { chromium } from "playwright-core";
import { createServer } from "vite";

import { SHARE_IMAGE } from "../src/lib/site";

const OUTPUT = new URL("../public/share.png", import.meta.url).pathname;

const ROOT = new URL("..", import.meta.url).pathname;

// On any free port and with its own prebundled modules, so it never meets
// a dev server already running.
const server = await createServer({
  cacheDir: "node_modules/.vite-share-image",
  root: ROOT,
  server: { port: 0 },
});
await server.listen();
const [origin] = server.resolvedUrls?.local ?? [];
if (!origin) {
  throw new Error("The dev server has no address");
}

const browser = await chromium.launch({ channel: "chrome" });
try {
  const page = await browser.newPage({
    colorScheme: "light",
    deviceScaleFactor: 1,
    viewport: { height: SHARE_IMAGE.height + 400, width: SHARE_IMAGE.width },
  });
  await page.goto(new URL("/design/share-image", origin).href, {
    waitUntil: "networkidle",
  });
  await page.waitForFunction(() =>
    [...document.images].every((image) => image.complete)
  );
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page
    .locator("[data-share-image]")
    .screenshot({ animations: "disabled", path: OUTPUT });
} finally {
  await browser.close();
  await server.close();
}
