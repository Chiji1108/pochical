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

// The wall of widgets mixes its looks (the app as it starts, and 墨 in
// black and white), over the widgets both platforms photograph: every
// kind at each size it has for a Home Screen, and those that can be set
// to someone, set to a person and to the group too.
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

// Whether two runs of cells, each from a cell and so many long, share one.
const overlap = (from: number, length: number, other: number, its: number) =>
  from < other + its && other < from + length;

// Whether two tiles share an edge.
const touch = (a: WallTile, b: WallTile): boolean => {
  const beside =
    (a.column + a.columns === b.column || b.column + b.columns === a.column) &&
    overlap(a.row, a.rows, b.row, b.rows);
  const above =
    (a.row + a.rows === b.row || b.row + b.rows === a.row) &&
    overlap(a.column, a.columns, b.column, b.columns);
  return beside || above;
};

// How many cells lie between two tiles: none for two side by side or
// corner to corner.
const between = (a: WallTile, b: WallTile): number =>
  Math.max(
    a.column - b.column - b.columns,
    b.column - a.column - a.columns,
    a.row - b.row - b.rows,
    b.row - a.row - a.rows
  );

test("the wall is covered, a picture on it again only once every one is on it, apart from itself, and never a pinned one", () => {
  const { alike, pinned } = STORE_SHOTS.find(
    (shot) => shot.kind === "wall"
  ) ?? { alike: [], pinned: [] };
  const tiles = wallOf(WIDGETS, 2, pinned, alike);
  const pictureOf = ({ file, look }: Pick<WallTile, "file" | "look">) =>
    alike.includes(file) ? file : `${file} in look ${look}`;
  const covered = tiles.reduce(
    (cells, { columns, rows }) => cells + columns * rows,
    0
  );
  expect(covered).toBe(WALL.columns * WALL.rows);
  const again = tiles.filter(
    (tile, index) =>
      tiles.findIndex((other) => pictureOf(other) === pictureOf(tile)) !== index
  );
  if (again.length > 0) {
    const every = new Set(
      WIDGETS.flatMap((file) => [0, 1].map((look) => pictureOf({ file, look })))
    );
    expect(new Set(tiles.map(pictureOf)).size).toBe(every.size);
  }
  for (const tile of again) {
    expect(pinned.map((pin) => pin.file)).not.toContain(tile.file);
    for (const other of tiles) {
      if (other !== tile && pictureOf(other) === pictureOf(tile)) {
        expect(between(tile, other)).toBeGreaterThan(0);
      }
    }
  }
});

test("the wall alternates its two looks, no widget beside itself, the pinned where they are told", () => {
  const { alike, pinned } = STORE_SHOTS.find(
    (shot) => shot.kind === "wall"
  ) ?? { alike: [], pinned: [] };
  const tiles = wallOf(WIDGETS, 2, pinned, alike);
  for (const pin of pinned) {
    expect(
      tiles.filter((tile) => tile.file === pin.file && tile.look === pin.look)
    ).toEqual([expect.objectContaining(pin)]);
  }
  const first = tiles.filter((tile) => tile.look === 0).length;
  expect(Math.abs(tiles.length - 2 * first)).toBeLessThanOrEqual(2);
  for (const tile of tiles) {
    const neighbors = tiles.filter((other) => touch(tile, other));
    expect(neighbors.map((other) => other.file)).not.toContain(tile.file);
    // Never only its own look around a widget: with each picture on the
    // wall once, the looks cannot take turns everywhere.
    const own = neighbors.filter((other) => other.look === tile.look).length;
    expect(own, `${tile.file} at ${tile.column}, ${tile.row}`).toBeLessThan(
      neighbors.length
    );
  }
});
