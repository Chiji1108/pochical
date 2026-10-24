import { fileURLToPath } from "node:url";

// Takes the picture a link to the site shows (@pochical/prototype's
// assets/share.png) from /_render/share-image, drawn by the prototype's
// components, on a dev server of its own. Run again after changing it: pnpm run image:share
// It drives the installed Google Chrome.
import { SHARE_IMAGE } from "@pochical/prototype/lib/brand";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const OUTPUT = fileURLToPath(
  import.meta.resolve("@pochical/prototype/assets/share.png")
);

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
  await page.goto(new URL("/_render/share-image", origin).href, {
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
