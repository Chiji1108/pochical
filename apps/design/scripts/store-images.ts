import { existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Draws the stores' pictures (#806) from the screens each platform's UI
// test photographed into .build/store-screenshots/<store>
// (`mise run store:shots:ios`): each shot of @pochical/prototype's
// lib/store-shots.ts from /_render/store-shot into
// store/screenshots/<store>, and Google Play's feature graphic into
// store/feature-graphic.png, on a dev server of its own. A store whose
// screens are not there is left as it is. Run again after changing the
// page or the shots: pnpm run image:store
import {
  FEATURE_GRAPHIC,
  STORE_SHOTS,
  STORES,
  storeShotFile,
} from "@pochical/prototype/lib/store-shots";
import type { StoreId } from "@pochical/prototype/lib/store-shots";
import {
  photographDevServer,
  waitUntilDrawn,
} from "@pochical/prototype/scripts/photograph";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const RAW = path.join(ROOT, ".build/store-screenshots");
const OUTPUT = path.join(ROOT, "store");
// Where the page asks for a screen, answered with its file.
const RAW_PATH = "/_render/store-raw/";

const storeIds: StoreId[] = ["ios", "android"];
const photographed = storeIds.filter((store) =>
  existsSync(path.join(RAW, store))
);

// The screens a shot is drawn from, each there, and the widgets found for
// a wall.
const screensOf = (store: StoreId, shot: (typeof STORE_SHOTS)[number]) => {
  const folder = path.join(RAW, store);
  const files = shot.kind === "pair" ? shot.raw : [shot.raw];
  for (const file of files) {
    if (!existsSync(path.join(folder, file))) {
      throw new Error(`${shot.name} has no ${path.join(folder, file)}`);
    }
  }
  if (shot.kind !== "wall") {
    return [];
  }
  const widgets = readdirSync(path.join(folder, shot.raw))
    .filter((file) => file.endsWith(".png"))
    .sort();
  if (widgets.length === 0) {
    throw new Error(`${shot.name} has no widget in ${folder}/${shot.raw}`);
  }
  return widgets;
};

await photographDevServer(
  {
    cacheDir: "node_modules/.vite-store-images",
    root: fileURLToPath(new URL("..", import.meta.url)),
  },
  async ({ browser, origin }) => {
    const photograph = async (
      search: Record<string, string>,
      size: { height: number; width: number },
      output: string,
      raw?: string
    ) => {
      const page = await browser.newPage({
        colorScheme: "light",
        deviceScaleFactor: 1,
        viewport: size,
      });
      if (raw !== undefined) {
        await page.route(`**${RAW_PATH}**`, async (route) => {
          const { pathname } = new URL(route.request().url());
          const file = decodeURIComponent(pathname.slice(RAW_PATH.length));
          await route.fulfill({ path: path.join(raw, file) });
        });
      }
      const url = new URL("/_render/store-shot", origin);
      url.search = new URLSearchParams(search).toString();
      await page.goto(url.href, { waitUntil: "networkidle" });
      await waitUntilDrawn(page);
      mkdirSync(path.dirname(output), { recursive: true });
      // No alpha channel, which the App Store refuses.
      await page
        .locator("[data-store-shot]")
        .screenshot({ animations: "disabled", path: output });
      await page.close();
      console.log(path.relative(ROOT, output));
    };

    for (const store of photographed) {
      for (const shot of STORE_SHOTS) {
        // oxlint-disable-next-line no-await-in-loop -- one page at a time
        await photograph(
          {
            shot: shot.name,
            store,
            widgets: screensOf(store, shot).join(","),
          },
          STORES[store],
          path.join(OUTPUT, "screenshots", store, storeShotFile(shot.name)),
          path.join(RAW, store)
        );
      }
    }
    await photograph(
      { shot: FEATURE_GRAPHIC.name },
      FEATURE_GRAPHIC,
      path.join(OUTPUT, `${FEATURE_GRAPHIC.name}.png`)
    );
  }
);
