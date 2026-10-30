import { fileURLToPath } from "node:url";

// Takes the picture a link to the site shows (@pochical/prototype's
// assets/share.png) from /_render/share-image, drawn by the prototype's
// components, on a dev server of its own. Run again after changing it: pnpm run image:share
import { SHARE_IMAGE } from "@pochical/prototype/lib/brand";
import {
  photographDevServer,
  waitUntilDrawn,
} from "@pochical/prototype/scripts/photograph";

const OUTPUT = fileURLToPath(
  import.meta.resolve("@pochical/prototype/assets/share.png")
);

await photographDevServer(
  {
    cacheDir: "node_modules/.vite-share-image",
    root: fileURLToPath(new URL("..", import.meta.url)),
  },
  async ({ browser, origin }) => {
    const page = await browser.newPage({
      colorScheme: "light",
      deviceScaleFactor: 1,
      viewport: { height: SHARE_IMAGE.height + 400, width: SHARE_IMAGE.width },
    });
    await page.goto(new URL("/_render/share-image", origin).href, {
      waitUntil: "networkidle",
    });
    await waitUntilDrawn(page);
    await page
      .locator("[data-share-image]")
      .screenshot({ animations: "disabled", path: OUTPUT });
  }
);
