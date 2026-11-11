import { existsSync } from "node:fs";
import path from "node:path";

import {
  calloutOf,
  FEATURE_GRAPHIC,
  HEADLINE_SHARE,
  lineBoxOf,
  STORE_SHOTS,
  STORES,
  storeShotFile,
  WALL,
  WALL_PICTURES,
  WALL_SHAPE,
  WALL_SHOT,
  wallCornersOf,
  wallLieOf,
  wallOf,
} from "@pochical/prototype/lib/store-shots";
import type {
  Rect,
  WallPicture,
  WallTile,
} from "@pochical/prototype/lib/store-shots";
import { expect, test } from "vitest";

import { pngHeader } from "../scripts/png";

// The stores' pictures are checked in, drawn by
// `mise run store:screenshots`: every shot of store-shots.ts has its
// picture for each store at the size it asks for, and so has every
// picture drawn from the wall, without the alpha channel the App Store
// refuses.
const root = path.join(import.meta.dirname, "../../..");
const pictures: readonly WallPicture[] = WALL_PICTURES;

const drawn = (["ios", "android"] as const).flatMap((id) =>
  STORE_SHOTS.map((shot) => ({
    file: path.join("store/screenshots", id, storeShotFile(shot.name)),
    size: STORES[id],
  }))
);

test.each([
  ...drawn,
  ...pictures.map(({ file, height, width }) => ({
    file,
    size: { height, width },
  })),
  { file: `store/${FEATURE_GRAPHIC.name}.png`, size: FEATURE_GRAPHIC },
])("$file is drawn at its store's size", ({ file, size }) => {
  const full = path.join(root, file);
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

// A rectangle of a picture, back in its screen's pixels.
const onScreen = (
  card: Rect,
  phone: number,
  screen: { width: number },
  picture: { height: number; width: number }
) => ({
  foot: (card.top + card.height - picture.height * HEADLINE_SHARE) / phone,
  left: (card.left - picture.width / 2) / phone + screen.width / 2,
  right:
    (card.left + card.width - picture.width / 2) / phone + screen.width / 2,
  top: (card.top - picture.height * HEADLINE_SHARE) / phone,
});

test("a callout's card cuts through no piece of the screen over or under it: it takes the piece in whole", () => {
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
  const over = onScreen(card, phone, screen, STORES.ios);
  expect(over.top).toBeCloseTo(1300);
  expect(over.foot).toBeCloseTo(1700);
});

test("a callout's card cuts through no piece beside it either, and leaves alone what it does not reach", () => {
  const screen = SCREENS.ios;
  // A bubble set in from the screen's sides, a face its card's side would
  // cut in two, and a button clear of the card.
  const bubble = { height: 600, left: 300, top: 1500, width: 600 };
  const face = { height: 96, left: 150, top: 1500, width: 96 };
  const button = { height: 96, left: 1200, top: 1500, width: 96 };
  const alone = calloutOf(bubble, [button], screen, STORES.ios);
  const { card, phone } = calloutOf(bubble, [face, button], screen, STORES.ios);
  const bare = onScreen(alone.card, alone.phone, screen, STORES.ios);
  const over = onScreen(card, phone, screen, STORES.ios);
  // The card's own side falls inside the face,
  expect(bare.left).toBeGreaterThan(face.left);
  expect(bare.left).toBeLessThan(face.left + face.width);
  // so it goes on to the face's far side, and no other side moves.
  expect(over.left).toBeCloseTo(face.left);
  expect(over.right).toBeCloseTo(bare.right);
  expect(over.top).toBeCloseTo(bare.top);
  expect(over.foot).toBeCloseTo(bare.foot);
  expect(over.right).toBeLessThan(button.left);
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

const tiles = wallOf(WALL_SHOT.tiles);

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
    expect(look).toBeLessThan(WALL_SHOT.raw.length);
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

// The widgets marked whole, where the eye lands first.
const whole = WALL_SHOT.tiles.flatMap((place, index) =>
  "whole" in place ? [index] : []
);

test("the widgets marked whole show whole in every store's picture, clear of the fade under its headline", () => {
  expect(whole.map((index) => tiles[index]?.file)).toEqual([
    "next-off-small.png",
    "next-off-day-small.png",
    "now-small.png",
  ]);
  for (const { height, widgetRow, width } of Object.values(STORES)) {
    const corners = whole.flatMap((index) => {
      const tile = tiles[index];
      return tile
        ? wallCornersOf(tile, widgetRow, wallLieOf({ height, width }))
        : [];
    });
    expect(corners).toHaveLength(whole.length * 4);
    for (const [across, down] of corners) {
      expect(across).toBeGreaterThanOrEqual(0);
      expect(across).toBeLessThanOrEqual(width);
      expect(down).toBeGreaterThanOrEqual(
        height * HEADLINE_SHARE * WALL_SHAPE.clear
      );
      expect(down).toBeLessThanOrEqual(height);
    }
  }
});

// A picture drawn from the wall: its line's room is inside its safe area,
// the part of it every device shows, and so are the widgets marked whole,
// in one of the wall's copies side by side, clear of the line. One with no
// safe area shows them whole anywhere in it.
test.each([...pictures])(
  "$name holds its line and the widgets marked whole inside its safe area",
  (picture) => {
    const lie = picture.lie ?? wallLieOf(picture);
    const safe = picture.safe ?? { ...picture, left: 0, top: 0 };
    const inside = ([across, down]: [number, number]) =>
      across >= safe.left &&
      across <= safe.left + safe.width &&
      down >= safe.top &&
      down <= safe.top + safe.height;
    const box = picture.line && lineBoxOf(picture.line);
    if (box !== undefined) {
      expect(inside([box.left, box.top])).toBe(true);
      expect(inside([box.left + box.width, box.top + box.height])).toBe(true);
    }
    const copies = Array.from({ length: lie.across }, (_, copy) =>
      whole.flatMap((index) => {
        const tile = wallOf(WALL_SHOT.tiles, lie.across)[
          copy * WALL_SHOT.tiles.length + index
        ];
        return tile
          ? wallCornersOf(tile, STORES[picture.store].widgetRow, lie)
          : [];
      })
    );
    const shown = copies.filter(
      (corners) =>
        corners.length === whole.length * 4 &&
        corners.every(inside) &&
        corners.every(
          ([across]) =>
            box === undefined ||
            across <= box.left ||
            across >= box.left + box.width
        )
    );
    expect(shown).toHaveLength(1);
  }
);

// Apple's sizes for the pictures it takes besides screenshots: the product
// page header is 3840 by 1646.
// https://developer.apple.com/help/app-store-connect/reference/app-information/creative-assets-specifications
test("the App Store's product page header is the size Apple asks for", () => {
  expect(
    pictures.find(({ name }) => name === "product-page-header")
  ).toMatchObject({ height: 1646, width: 3840 });
});
