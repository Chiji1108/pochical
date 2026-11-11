import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  FEATURE_GRAPHIC,
  HEADLINE_SHARE,
  STORE_SHOTS,
  STORES,
  storeShotFile,
  wallOf,
} from "@pochical/prototype/lib/store-shots";
import type { WallTile } from "@pochical/prototype/lib/store-shots";
import { expect, test } from "vitest";

// The stores' pictures (store/) are checked in, drawn by
// `mise run store:screenshots`: every shot of store-shots.ts has its
// picture for each store at the size it asks for, without the alpha
// channel the App Store refuses.
const store = path.join(import.meta.dirname, "../../../store");

// A PNG's size and whether it has an alpha channel, from its IHDR chunk,
// the file's first.
const header = (file: string) => {
  const bytes = readFileSync(file);
  const colorType = bytes.readUInt8(25);
  return {
    alpha: colorType === 4 || colorType === 6,
    height: bytes.readUInt32BE(20),
    width: bytes.readUInt32BE(16),
  };
};

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
  expect(header(full)).toEqual({
    alpha: false,
    height: size.height,
    width: size.width,
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
// black and white), over the widgets both platforms photograph.
const WIDGETS = [
  "calendar-large.png",
  "calendar-medium.png",
  "next-off-group-small.png",
  "next-off-person-small.png",
  "next-off-small.png",
  "now-small.png",
  "simple-medium.png",
  "simple-small.png",
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

test("the wall alternates its two looks, no widget beside itself, the pinned where they are told", () => {
  const { pinned } = STORE_SHOTS.find((shot) => shot.kind === "wall") ?? {
    pinned: [],
  };
  const tiles = wallOf(WIDGETS, 2, pinned);
  for (const pin of pinned) {
    expect(tiles).toContainEqual(expect.objectContaining(pin));
  }
  const first = tiles.filter((tile) => tile.look === 0).length;
  expect(Math.abs(tiles.length - 2 * first)).toBeLessThanOrEqual(2);
  for (const tile of tiles) {
    const neighbors = tiles.filter((other) => touch(tile, other));
    expect(neighbors.map((other) => other.file)).not.toContain(tile.file);
    // Never more of its own look around a widget than of the other.
    const own = neighbors.filter((other) => other.look === tile.look).length;
    expect(
      own,
      `${tile.file} at ${tile.column}, ${tile.row}`
    ).toBeLessThanOrEqual(neighbors.length - own);
  }
});
