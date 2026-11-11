import { existsSync } from "node:fs";
import path from "node:path";

import {
  calloutOf,
  FEATURE_GRAPHIC,
  HEADLINE_SHARE,
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

// A callout's card: a part of a screen lifted over the phone. A phone's
// screen on each store, and parts as the captures measure them: a row as
// wide as the screen, one set in from its sides, and a card near the
// screen's foot.
const SCREENS = {
  android: { height: 2424, width: 1080 },
  ios: { height: 2868, width: 1320 },
} as const;

test.each(
  (["ios", "android"] as const).flatMap((on) =>
    [
      { height: 0.08, left: 0, top: 0.5, width: 1 },
      { height: 0.1, left: 0.045, top: 0.54, width: 0.91 },
      { height: 0.2, left: 0.12, top: 0.68, width: 0.6 },
    ].map((part) => ({ on, part }))
  )
)(
  "a callout's card covers its part, inside $on's picture, under the headline",
  ({ on, part }) => {
    const screen = SCREENS[on];
    const picture = STORES[on];
    const measured = {
      height: part.height * screen.height,
      left: part.left * screen.width,
      top: part.top * screen.height,
      width: part.width * screen.width,
    };
    const { card, phone, scale } = calloutOf(measured, [], screen, picture);
    expect(scale).toBeGreaterThan(1);
    // Where the part is in the picture, the phone in its middle.
    const left = picture.width / 2 + (measured.left - screen.width / 2) * phone;
    const top = picture.height * HEADLINE_SHARE + measured.top * phone;
    expect(card.left).toBeLessThanOrEqual(left);
    expect(card.left + card.width).toBeGreaterThanOrEqual(
      left + measured.width * phone
    );
    expect(card.top).toBeLessThanOrEqual(top);
    expect(card.top + card.height).toBeGreaterThanOrEqual(
      top + measured.height * phone
    );
    expect(card.left).toBeGreaterThanOrEqual(0);
    expect(card.left + card.width).toBeLessThanOrEqual(picture.width);
    expect(card.top).toBeGreaterThanOrEqual(picture.height * HEADLINE_SHARE);
    expect(card.top + card.height).toBeLessThanOrEqual(picture.height);
  }
);

test("a callout's card cuts through no piece of the screen: its edge goes on to the piece's far side", () => {
  const screen = SCREENS.ios;
  const row = { height: 200, left: 0, top: 1400, width: screen.width };
  // A note close under the row, and rows of a list touching one another
  // over it.
  const note = { height: 90, left: 60, top: 1610, width: 900 };
  const list = [0, 1, 2, 3].map((index) => ({
    height: 100,
    left: 0,
    top: 1300 - index * 100,
    width: screen.width,
  }));
  const { card, phone } = calloutOf(row, [note, ...list], screen, STORES.ios);
  const headline = STORES.ios.height * HEADLINE_SHARE;
  expect((card.top - headline) / phone).toBeCloseTo(1300);
  expect((card.top + card.height - headline) / phone).toBeCloseTo(1700);
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
