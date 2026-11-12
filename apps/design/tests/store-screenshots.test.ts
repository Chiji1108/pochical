import { existsSync } from "node:fs";
import path from "node:path";

import {
  calloutOf,
  FEATURE_GRAPHIC,
  HEADLINE,
  HEADLINE_SHARE,
  lineBoxOf,
  lineClearOf,
  STORE_SHOTS,
  STORES,
  storeShotFile,
  TITLE,
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
import { unsaid } from "./store-words";

// The stores' pictures are checked in, drawn by
// `mise run store:screenshots`. What each store asks of them, from its
// own page, once:
// - the App Store's screenshots of an iPhone with Dynamic Island (medium
//   display, 6.3 inches), the ones App Store Connect requires on a
//   version's page, 1206 by 2622, with no alpha channel:
//   https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications
// - its product page header, 3840 by 1646, with none either:
//   https://developer.apple.com/help/app-store-connect/reference/app-information/creative-assets-specifications
// - Google Play's feature graphic, 1024 by 500, and its screenshots, each
//   side from 320 to 3840 pixels, the longer no more than twice the
//   shorter, 9:16 for those it features, their words no more than a fifth
//   of the picture, eight at most:
//   https://support.google.com/googleplay/android-developer/answer/9866151
const ASKED = {
  appStoreScreenshot: { height: 2622, width: 1206 },
  featureGraphic: { height: 500, width: 1024 },
  headlineShare: 0.2,
  productPageHeader: { height: 1646, width: 3840 },
  screenshots: 8,
  side: { least: 320, most: 3840 },
} as const;

const root = path.join(import.meta.dirname, "../../..");
const pictures: readonly WallPicture[] = WALL_PICTURES;

test("the pictures are of the sizes the stores ask for", () => {
  expect(STORES.ios).toMatchObject(ASKED.appStoreScreenshot);
  const { height, width } = STORES.android;
  expect(width).toBeGreaterThanOrEqual(ASKED.side.least);
  expect(height).toBeLessThanOrEqual(ASKED.side.most);
  expect(height / width).toBeCloseTo(16 / 9);
  expect(FEATURE_GRAPHIC).toMatchObject(ASKED.featureGraphic);
  expect(
    pictures.find(({ name }) => name === "product-page-header")
  ).toMatchObject(ASKED.productPageHeader);
  expect(STORE_SHOTS.length).toBeLessThanOrEqual(ASKED.screenshots);
  expect(HEADLINE_SHARE).toBeLessThanOrEqual(ASKED.headlineShare);
});

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
])(
  "$file is drawn at its size, with no alpha channel",
  async ({ file, size }) => {
    const full = path.join(root, file);
    expect(existsSync(full), `${file}: run mise run store:screenshots`).toBe(
      true
    );
    expect(await pngHeader(full)).toEqual({
      alpha: false,
      height: size.height,
      width: size.width,
    });
  }
);

// A headline is set in rows that are never broken, every letter as wide
// as it is tall at most: each row keeps the picture's margin at both
// sides, and the rows, under the room over them, keep to the headline's
// share of the shortest picture.
test.each(STORE_SHOTS.map(({ headline, name }) => ({ headline, name })))(
  "$name's headline fits its room",
  ({ headline }) => {
    for (const line of headline) {
      expect(
        line.length * HEADLINE.size * (1 + TITLE.spacing)
      ).toBeLessThanOrEqual(100 - 2 * HEADLINE.margin);
    }
    for (const { height, width } of Object.values(STORES)) {
      expect(headline.length * HEADLINE.size * TITLE.line).toBeLessThanOrEqual(
        (100 * height * HEADLINE_SHARE) / width
      );
    }
  }
);

// Every word a picture is drawn with: the headlines, the tiles' words and
// their pieces', the lines of the pictures drawn from the wall, and the
// feature graphic's.
const words = [
  ...STORE_SHOTS.flatMap((shot) => [
    ...shot.headline,
    ...(shot.kind === "tiles"
      ? shot.tiles.flatMap((tile) => [
          tile.words,
          ...("pieces" in tile
            ? tile.pieces.flatMap((piece) =>
                piece.kind === "day"
                  ? [
                      ...("says" in piece ? [piece.says] : []),
                      ...("tag" in piece ? [piece.tag] : []),
                    ]
                  : []
              )
            : []),
        ])
      : []),
  ]),
  ...pictures.flatMap(({ line }) => line?.words ?? []),
  FEATURE_GRAPHIC.line,
];

test.each(unsaid)("no picture says %s", (word) => {
  expect(words.length).toBeGreaterThan(STORE_SHOTS.length * 2);
  for (const said of words) {
    expect(said).not.toContain(word);
  }
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

const tiles = wallOf(WALL_SHOT.tiles);

// Which widgets there are to place is the captures' to say: the script
// fails a wall whose widget is not among those photographed.
test("the wall covers its grid, each widget in one of its looks", () => {
  const cells = tiles.flatMap(({ column, columns, row, rows }) =>
    Array.from(
      { length: columns * rows },
      (_, cell) =>
        `${column + (cell % columns)} ${row + Math.floor(cell / columns)}`
    )
  );
  expect(new Set(cells).size).toBe(cells.length);
  expect(cells).toHaveLength(WALL.columns * WALL.rows);
  for (const { column, columns, look, row, rows } of tiles) {
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

// Points over a widget, its corners and between them: what lies across
// it lies across one of them, for anything as large as a line's clearing.
const over = (corners: [number, number][]): [number, number][] => {
  const [a = [0, 0], b = [0, 0], c = [0, 0], d = [0, 0]] = corners;
  const steps = [0, 0.25, 0.5, 0.75, 1];
  return steps.flatMap((down) =>
    steps.map((across): [number, number] => [
      (a[0] + (b[0] - a[0]) * across) * (1 - down) +
        (c[0] + (d[0] - c[0]) * across) * down,
      (a[1] + (b[1] - a[1]) * across) * (1 - down) +
        (c[1] + (d[1] - c[1]) * across) * down,
    ])
  );
};

// A picture drawn from the wall: its line's room is inside its safe area,
// the part of it every device shows, and so are the widgets marked whole,
// in one of the wall's copies side by side, none of them reached by the
// clearing around the line, where the wall fades. One with no safe area
// shows them whole anywhere in it.
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
    const clearing = picture.line && lineClearOf(picture.line);
    const faded = ([across, down]: [number, number]) =>
      clearing !== undefined &&
      ((across - clearing.middle[0]) / clearing.across) ** 2 +
        ((down - clearing.middle[1]) / clearing.down) ** 2 <
        1;
    const placed = wallOf(WALL_SHOT.tiles, lie.across);
    const copies = Array.from({ length: lie.across }, (_, copy) =>
      whole.map((index) => {
        const tile = placed[copy * WALL_SHOT.tiles.length + index];
        return tile
          ? wallCornersOf(tile, STORES[picture.store].widgetRow, lie)
          : [];
      })
    );
    const shown = copies.filter((widgets) =>
      widgets.every(
        (corners) =>
          corners.length === 4 &&
          corners.every(inside) &&
          !over(corners).some(faded)
      )
    );
    expect(shown).toHaveLength(1);
  }
);
