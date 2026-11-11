import { existsSync } from "node:fs";
import path from "node:path";

import {
  FEATURE_GRAPHIC,
  HEADLINE_SHARE,
  SITE_WALL,
  STORE_SHOTS,
  STORES,
  storeShotFile,
  WALL,
  WALL_SHAPE,
  wallCornersOf,
  wallOf,
} from "@pochical/prototype/lib/store-shots";
import type { WallTile } from "@pochical/prototype/lib/store-shots";
import { expect, test } from "vitest";

import { pngHeader } from "../scripts/png";

// The stores' pictures (store/) are checked in, drawn by
// `mise run store:screenshots`: every shot of store-shots.ts has its
// picture for each store at the size it asks for, without the alpha
// channel the App Store refuses.
const store = path.join(import.meta.dirname, "../../../store");

const drawn = (["ios", "android"] as const).flatMap((id) =>
  STORE_SHOTS.map((shot) => ({
    file: path.join("screenshots", id, storeShotFile(shot.name)),
    size: STORES[id],
  }))
);

test.each([
  ...drawn,
  { file: `${FEATURE_GRAPHIC.name}.png`, size: FEATURE_GRAPHIC },
])("$file is drawn at its store's size", ({ file, size }) => {
  const full = path.join(store, file);
  expect(existsSync(full), `${file}: run mise run store:screenshots`).toBe(
    true
  );
  expect(pngHeader(full)).toEqual({
    alpha: false,
    height: size.height,
    width: size.width,
  });
});

// The wall of widgets the site's top page shows is drawn with them, into
// @pochical/prototype's assets, where the site takes its pictures from.
test("the site's wall of widgets is drawn at its size", () => {
  const file = path.join(
    import.meta.dirname,
    "../../../packages/prototype/src/assets",
    `${SITE_WALL.name}.png`
  );
  expect(existsSync(file), "run mise run store:images").toBe(true);
  expect(pngHeader(file)).toMatchObject({
    height: SITE_WALL.height,
    width: SITE_WALL.width,
  });
});

// Google Play asks that a tagline take no more than a fifth of a
// screenshot, which the App Store's pictures keep to too; every shot is
// the app itself under one, its screens or its widgets:
// https://support.google.com/googleplay/android-developer/answer/9866151
test("a headline takes a fifth of its picture at most", () => {
  expect(HEADLINE_SHARE).toBeLessThanOrEqual(0.2);
});

// Google Play takes eight screenshots of a phone at most, the App Store ten.
test("the shots are no more than both stores take", () => {
  expect(STORE_SHOTS.length).toBeLessThanOrEqual(8);
});

// The widgets both platforms photograph, in each look: every kind at each
// size it has for a Home Screen, those that can be set to someone set to
// a person and to the group too, and those today's shift changes on a
// working day's shifts (day, night, after) besides a day off.
const WIDGETS = [
  "calendar-large.png",
  "calendar-medium.png",
  "next-off-day-small.png",
  "next-off-group-small.png",
  "next-off-person-small.png",
  "next-off-small.png",
  "now-small.png",
  "simple-after-medium.png",
  "simple-after-small.png",
  "simple-day-medium.png",
  "simple-day-small.png",
  "simple-medium.png",
  "simple-night-medium.png",
  "simple-night-small.png",
  "simple-small.png",
  "upcoming-day-medium.png",
  "upcoming-day-small.png",
  "upcoming-medium.png",
  "upcoming-person-medium.png",
  "upcoming-person-small.png",
  "upcoming-small.png",
];

const [wall] = STORE_SHOTS.flatMap((shot) =>
  shot.kind === "wall" ? [shot] : []
);
const tiles = wallOf(wall?.tiles ?? []);

test("the wall covers its grid with widgets both platforms photograph", () => {
  const cells = tiles.flatMap(({ column, columns, row, rows }) =>
    Array.from(
      { length: columns * rows },
      (_, cell) =>
        `${column + (cell % columns)} ${row + Math.floor(cell / columns)}`
    )
  );
  expect(new Set(cells).size).toBe(cells.length);
  expect(cells).toHaveLength(WALL.columns * WALL.rows);
  for (const { column, columns, file, look, row, rows } of tiles) {
    expect(WIDGETS).toContain(file);
    expect(look).toBeLessThan(wall?.raw.length ?? 0);
    expect(column + columns).toBeLessThanOrEqual(WALL.columns);
    expect(row + rows).toBeLessThanOrEqual(WALL.rows);
  }
});

// How many cells lie between two tiles: none for two side by side or
// corner to corner.
const between = (a: WallTile, b: WallTile): number =>
  Math.max(
    a.column - b.column - b.columns,
    b.column - a.column - a.columns,
    a.row - b.row - b.rows,
    b.row - a.row - a.rows
  );

test("no picture on the wall is beside itself, even corner to corner", () => {
  for (const tile of tiles) {
    for (const other of tiles) {
      if (
        other !== tile &&
        other.file === tile.file &&
        other.look === tile.look
      ) {
        expect(
          between(tile, other),
          `${tile.file} at ${tile.column}, ${tile.row}`
        ).toBeGreaterThan(0);
      }
    }
  }
});

// The frames the wall is seen in: each store's picture under the fade
// below its headline, and the frame the site's top page shows of the App
// Store's wall, which has no headline (SITE_WALL, on the page's branch).
const FRAMES = [
  ...Object.values(STORES).map(({ height, widgetRow, width }) => ({
    row: widgetRow,
    tall: height / width,
    top: HEADLINE_SHARE * WALL_SHAPE.clear,
  })),
  { row: STORES.ios.widgetRow, tall: 1200 / 780, top: 0 },
];

test("the widgets marked whole show whole in every frame", () => {
  const whole = (wall?.tiles ?? []).flatMap((place, index) =>
    place.whole === true ? [tiles[index]] : []
  );
  expect(whole.map((tile) => tile?.file)).toEqual([
    "next-off-small.png",
    "next-off-day-small.png",
    "now-small.png",
  ]);
  for (const { row, tall, top } of FRAMES) {
    for (const tile of whole) {
      for (const [across, down] of tile ? wallCornersOf(tile, row, tall) : []) {
        expect(across).toBeGreaterThanOrEqual(0);
        expect(across).toBeLessThanOrEqual(100);
        expect(down).toBeGreaterThanOrEqual(100 * tall * top);
        expect(down).toBeLessThanOrEqual(100 * tall);
      }
    }
  }
});
