import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Draws the stores' pictures (#806) from the screens each platform's UI
// test photographed into .build/store-screenshots/<store>
// (`mise run store:shots:ios`, `mise run store:shots:android`): each shot of @pochical/prototype's
// lib/store-shots.ts from /_render/store-shot into
// store/screenshots/<store>, each picture drawn from the wall of widgets
// (WALL_PICTURES) into its own file, and Google Play's feature graphic
// into store/feature-graphic.png, on a dev server of its own. A store
// whose screens are not there is left as it is, and so are the pictures
// drawn from its widgets. Run again after changing the
// page or the shots: pnpm run image:store
import {
  calloutOf,
  FEATURE_GRAPHIC,
  HEADLINE_SHARE,
  PIECES_TALL,
  STORE_SHOTS,
  STORES,
  storeShotFile,
  WALL_PICTURES,
  WALL_SHOT,
} from "@pochical/prototype/lib/store-shots";
import type { Rect, StoreId } from "@pochical/prototype/lib/store-shots";
import {
  photographDevServer,
  waitUntilDrawn,
} from "@pochical/prototype/scripts/photograph";

import { pngFirstPixel, pngHeader } from "./png.ts";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const RAW = path.join(ROOT, ".build/store-screenshots");
const OUTPUT = path.join(ROOT, "store");
// Where the page asks for a screen, answered with its file.
const RAW_PATH = "/_render/store-raw/";

const storeIds: StoreId[] = ["ios", "android"];
const photographed = storeIds.filter((store) =>
  existsSync(path.join(RAW, store))
);

// Fails unless every screen a shot is drawn from is there: a wall's
// widgets each in the folder of the look it is placed in.
const findScreens = (store: StoreId, shot: (typeof STORE_SHOTS)[number]) => {
  const tiles =
    shot.kind === "tiles"
      ? shot.tiles.flatMap((tile) => ("raw" in tile ? [tile.raw] : []))
      : [];
  const wall =
    shot.kind === "wall"
      ? shot.tiles.map(({ file, look }) =>
          path.join(shot.raw[look] ?? "", file)
        )
      : [];
  const raw = shot.kind === "tiles" || shot.kind === "wall" ? [] : shot.raw;
  for (const file of [
    ...tiles,
    ...wall,
    ...(typeof raw === "string" ? [raw] : raw),
  ]) {
    if (!existsSync(path.join(RAW, store, file))) {
      throw new Error(`${shot.name} has no ${path.join(RAW, store, file)}`);
    }
  }
};

const rectOf = ([
  left = 0,
  top = 0,
  width = 0,
  height = 0,
]: number[]): Rect => ({
  height,
  left,
  top,
  width,
});

// What a capture measured of a screen, beside it: its parts by name, and
// every piece of it that says something.
type Measured = { parts: Record<string, number[]>; pieces: number[][] };

// A shot's callout as the page takes it: its part's left, top, width and
// height in its screen's pixels, the screen's own width and height, and
// the card's left, top, width and height in the picture's. Fails if the
// card would leave the picture or reach into the headline.
const calloutFor = (store: StoreId, shot: (typeof STORE_SHOTS)[number]) => {
  if (shot.kind !== "screen" || !("callout" in shot)) {
    return "";
  }
  const file = path.join(RAW, store, shot.raw);
  const measured: Measured = JSON.parse(
    readFileSync(file.replace(/\.png$/u, ".json"), "utf-8")
  );
  const part = measured.parts[shot.callout];
  if (part === undefined) {
    throw new Error(`${shot.name} has no part ${shot.callout} measured`);
  }
  const screen = pngHeader(file);
  const picture = STORES[store];
  const { card } = calloutOf(
    rectOf(part),
    measured.pieces.map(rectOf),
    screen,
    picture
  );
  if (
    card.left < 0 ||
    card.left + card.width > picture.width ||
    card.top < picture.height * HEADLINE_SHARE ||
    card.top + card.height > picture.height
  ) {
    throw new Error(`${shot.name}'s callout leaves its picture on ${store}`);
  }
  return [
    ...part,
    screen.width,
    screen.height,
    card.left,
    card.top,
    card.width,
    card.height,
  ].join(",");
};

// How tall each tile is in its widths, a part of a screen as it was cut,
// and its ground, the color of the part's first pixel, which the tile's
// card takes around it.
const tilesOf = (store: StoreId, shot: (typeof STORE_SHOTS)[number]) =>
  (shot.kind === "tiles" ? shot.tiles : []).map((tile) => {
    if (!("raw" in tile)) {
      return { ground: "ffffff", part: PIECES_TALL };
    }
    const file = path.join(RAW, store, tile.raw);
    const { height, width } = pngHeader(file);
    return { ground: pngFirstPixel(file), part: height / width };
  });

await photographDevServer(
  {
    cacheDir: "node_modules/.vite-store-images",
    root: fileURLToPath(new URL("..", import.meta.url)),
  },
  async ({ browser, origin }) => {
    const photograph = async (
      search: Record<string, string>,
      { height, width }: { height: number; width: number },
      output: string,
      raw?: string
    ) => {
      const page = await browser.newPage({
        colorScheme: "light",
        deviceScaleFactor: 1,
        viewport: { height, width },
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
        findScreens(store, shot);
        const tiles = tilesOf(store, shot);
        // oxlint-disable-next-line no-await-in-loop -- one page at a time
        await photograph(
          {
            callout: calloutFor(store, shot),
            grounds: tiles.map(({ ground }) => ground).join(","),
            parts: tiles.map(({ part }) => part).join(","),
            shot: shot.name,
            store,
          },
          STORES[store],
          path.join(OUTPUT, "screenshots", store, storeShotFile(shot.name)),
          path.join(RAW, store)
        );
      }
    }
    for (const picture of WALL_PICTURES) {
      if (photographed.includes(picture.store)) {
        findScreens(picture.store, WALL_SHOT);
        // oxlint-disable-next-line no-await-in-loop -- one page at a time
        await photograph(
          { shot: picture.name },
          picture,
          path.join(ROOT, picture.file),
          path.join(RAW, picture.store)
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
