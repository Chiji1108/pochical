import type { PresetShift } from "./design-patterns";

// The stores' screenshots (#806): each is a screen of the real app,
// photographed by its platform's own UI test into
// `.build/store-screenshots/<store>` under the name `raw` gives here, the
// same on both platforms, and
// drawn on the site's sky under its headline at the store's size by
// apps/design's /_render/store-shot, which `pnpm --dir apps/design
// image:store` photographs into `store/screenshots/<store>`.

// A phone screenshot's size in each store. The App Store's is the largest
// it takes for an iPhone with Dynamic Island (large display), an iPhone
// Pro Max's own screen, which it scales down for the smaller iPhones:
// https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications
// Google Play's is the 9:16 it asks of the pictures it features, no side
// more than twice the other:
// https://support.google.com/googleplay/android-developer/answer/9866151
// `widgetRow` is how tall a Home Screen's cell is in its widths, by the
// platform's small widget (Android's SMALL, WidgetParts.kt).
export const STORES = {
  android: { height: 1920, widgetRow: 202 / 179, width: 1080 },
  ios: { height: 2868, widgetRow: 1, width: 1320 },
} as const;

export type StoreId = keyof typeof STORES;

// Google Play's feature graphic, which needs no screen: the sky, the app's
// icon and its name, in `store/feature-graphic.png`.
export const FEATURE_GRAPHIC = {
  height: 500,
  name: "feature-graphic",
  width: 1024,
} as const;

// How much of a picture's height its headline may take, with the room
// around it: Google Play asks that a tagline take no more than about a
// fifth of a screenshot, and the App Store's pictures keep to it too.
export const HEADLINE_SHARE = 0.2;

// What a shot is drawn from: one screen; two screens side by side; tiles,
// each a part of a screen under its words; or a wall of the widgets in the
// looks it mixes, each look a folder of `raw`
// holding every widget as a PNG named
// `<widget>-<small | medium | large>.png`, the same names in each;
// `alike` are those the looks draw all but the same, words and a small
// mark, which the wall holds in one look alone.
type StoreShot = { headline: readonly string[]; name: string } & (
  | { kind: "pair"; raw: readonly [string, string] }
  | { kind: "screen"; raw: string }
  | { kind: "tiles"; tiles: readonly Tile[] }
  | {
      alike: readonly string[];
      kind: "wall";
      pinned: readonly WallPin[];
      raw: readonly string[];
    }
);

// A tile of a shot of details, under a line of words: a part of a screen,
// whole rows of it, as wide as it, which the platform's UI test cuts by
// where the screen's own pieces lie; or `pieces`, which the page draws in
// a row from the app's own marks, larger than a screen has them, with
// words and lines of the picture's own that say what happens.
export type Tile = { words: string } & (
  | { raw: string }
  | { pieces: readonly Piece[] }
);

// A piece of a tile the page draws: ポチポチ入力's key of a shift, being
// pressed; an arrow to what comes of it; or a day of the calendar with its
// shift, 早出 or 残業 on its mark, `tag` a word pinned to its corner and
// `says` a word pointing at the mark's corner.
export type Piece =
  | { kind: "key"; shift: PresetShift }
  | { kind: "then" }
  | {
      date: number;
      early?: boolean;
      kind: "day";
      late?: boolean;
      says?: string;
      shift: PresetShift;
      tag?: string;
    };

// How tall a tile of pieces is, in its widths.
export const PIECES_TALL = 0.32;

// A widget the wall shows whole where the eye lands first, under the
// headline in its middle columns: its file, the look it is in, counted in
// `raw`, and the cell its top leading corner takes, counted from 0.
export type WallPin = {
  column: number;
  file: string;
  look: number;
  row: number;
};

// The shots in the stores' order, each headline a line an entry. They speak
// to people on night and rotating shifts. The first three are what a
// search's results show, so they carry the look; Google Play takes eight
// at most, the App Store ten. A raw file or folder named `-sumi` is in the
// look the app's own settings give it in black and white: テーマ 墨,
// シフトの色 ワントーン, シフトの見た目 線, 休みの見せ方 印だけ, and
// 色をつける日 all off; one named `-letters` has the shifts as letters,
// シフトの見た目 文字, in テーマ ソーダ. Everything else is as the app
// starts. The wall
// mixes the two, the widgets set to someone or to the group among them,
// with 次の休み and いまのシフト, its ring drawn while a shift is on,
// pinned where they show whole; the themes' shot sets the month in 墨 and
// in letters side by side, the app as it starts being in the others; the
// details' shot sets three parts of screens one over the other, each for
// those whose roster has that way of its own, and the cares' shot three
// more, each a small thing the app looks after.
export const STORE_SHOTS = [
  {
    headline: ["勤務表を見ながら、", "ポチポチ。"],
    kind: "screen",
    name: "entry",
    raw: "01-entry.png",
  },
  {
    alike: [
      "next-off-day-small.png",
      "next-off-group-small.png",
      "next-off-person-small.png",
      "next-off-small.png",
    ],
    headline: ["次の休みも、", "ウィジェットで。"],
    kind: "wall",
    name: "widgets",
    pinned: [
      { column: 2, file: "next-off-small.png", look: 0, row: 3 },
      { column: 3, file: "now-small.png", look: 0, row: 4 },
    ],
    raw: ["02-widgets", "02-widgets-sumi"],
  },
  {
    headline: ["家族や友人と、", "シフトを共有。"],
    kind: "screen",
    name: "group-shifts",
    raw: "03-group-shifts.png",
  },
  {
    headline: ["職場の人にも、", "ちょっと聞ける。"],
    kind: "screen",
    name: "chat",
    raw: "04-chat.png",
  },
  {
    headline: ["色も印も、", "好きな見た目に。"],
    kind: "pair",
    name: "themes",
    raw: ["05-calendar-sumi.png", "05-calendar-letters.png"],
  },
  {
    headline: ["いつものカレンダーに、", "自動で反映。"],
    kind: "screen",
    name: "device-calendar",
    raw: "06-device-calendar.png",
  },
  {
    headline: ["勤務表のクセにも、", "合わせます。"],
    kind: "tiles",
    name: "details",
    tiles: [
      {
        pieces: [
          { kind: "key", shift: "night" },
          { kind: "then" },
          { date: 16, kind: "day", shift: "night" },
          { date: 17, kind: "day", shift: "after", tag: "自動" },
        ],
        words: "夜勤を入れると、明けも自動で",
      },
      {
        raw: "07-details-period.png",
        words: "15日始まりの月にも",
      },
      {
        raw: "07-details-repeat.png",
        words: "決まった並びは、繰り返しで",
      },
    ],
  },
  {
    headline: ["小さな気づかいも。"],
    kind: "tiles",
    name: "cares",
    tiles: [
      {
        pieces: [
          { date: 13, early: true, kind: "day", says: "早出", shift: "day" },
          { date: 8, kind: "day", late: true, says: "残業", shift: "day" },
        ],
        words: "早出・残業が、アイコンでわかる",
      },
      {
        raw: "08-cares-reminder.png",
        words: "前の晩、明日のシフトをお知らせ",
      },
      {
        raw: "08-cares-group-end.png",
        words: "グループに、終了日をつけられる",
      },
    ],
  },
] as const satisfies readonly StoreShot[];

export type StoreShotName = (typeof STORE_SHOTS)[number]["name"];

// A shot's picture in `store/screenshots/<store>`, numbered in the stores'
// order.
export const storeShotFile = (name: StoreShotName): string => {
  const order = STORE_SHOTS.findIndex((shot) => shot.name === name) + 1;
  return `${String(order).padStart(2, "0")}-${name}.png`;
};

// The wall of widgets once more, for the site's top page (apps/web): the
// `shot` of `store` with no headline and no sky, on the paper alone, at
// twice the size the page shows it, in assets/widget-wall.png.
export const SITE_WALL = {
  height: 1200,
  name: "widget-wall",
  shot: "widgets",
  store: "ios",
  width: 780,
} as const satisfies {
  height: number;
  name: string;
  shot: StoreShotName;
  store: StoreId;
  width: number;
};

// The sizes a widget on the wall comes in, by the cells of a Home Screen
// it covers across and down.
export const WIDGET_CELLS = {
  large: { columns: 2, rows: 2 },
  medium: { columns: 2, rows: 1 },
  small: { columns: 1, rows: 1 },
} as const;

export type WidgetSize = keyof typeof WIDGET_CELLS;

const isWidgetSize = (value: string | undefined): value is WidgetSize =>
  value !== undefined && Object.hasOwn(WIDGET_CELLS, value);

// The cells a widget covers, by its size, the last word of its file's name.
const cellsOf = (file: string) => {
  const size = file
    .replace(/\.png$/u, "")
    .split("-")
    .at(-1);
  return WIDGET_CELLS[isWidgetSize(size) ? size : "small"];
};

// The wall's grid of a Home Screen's cells: as wide as it must be to run
// off the picture's edges once tilted, and as many rows as cover the
// picture's height.
export const WALL = { columns: 6, rows: 9 } as const;

// A widget on the wall: its file in the look numbered `look`, and the
// cells it covers, counted from 0.
export type WallTile = {
  column: number;
  columns: number;
  file: string;
  look: number;
  row: number;
  rows: number;
};

// The wall, filled cell by cell from its first. A picture is a widget in
// a look, one of the `alike` in either: the same kind comes again as
// another picture, in another size, the other look, set to someone else,
// or on another of today's shifts. Each place takes, of the pictures not
// yet on the wall, the one that there touches the least of the same
// widget, then of the same look, then whose widget and look were used the
// least so far: the looks alternate across the wall, and no widget sits
// beside itself where another fits. Only where none of those fits does a
// picture come again, never a pinned one, the one whose other self is
// farthest off and not beside the place, even corner to corner. The
// `pinned` are put first, where they are told. A cell that nothing fits
// stays sky.
export const wallOf = (
  files: readonly string[],
  looks: number,
  pinned: readonly WallPin[] = [],
  alike: readonly string[] = []
): WallTile[] => {
  const tiles: WallTile[] = [];
  const pins = new Set(pinned.map((pin) => pin.file));
  // Which tile covers each cell, by its place in `tiles`.
  const covered = new Map<string, number>();
  const used = new Map<string, number>();
  const usedOf = (key: string) => used.get(key) ?? 0;
  const on = ({ file, look }: Pick<WallTile, "file" | "look">) =>
    alike.includes(file) ? file : `${file} in look ${look}`;
  // How much of its edge a tile there would share with the tiles `counts`.
  const touching = (
    { column, columns, row, rows }: Omit<WallTile, "file" | "look">,
    counts: (tile: WallTile) => boolean
  ) => {
    let edge = 0;
    const count = (atColumn: number, atRow: number) => {
      const tile = tiles[covered.get(`${atColumn} ${atRow}`) ?? -1];
      edge += tile !== undefined && counts(tile) ? 1 : 0;
    };
    for (let at = column; at < column + columns; at += 1) {
      count(at, row - 1);
      count(at, row + rows);
    }
    for (let at = row; at < row + rows; at += 1) {
      count(column - 1, at);
      count(column + columns, at);
    }
    return edge;
  };
  // How many cells lie between a tile there and the nearest of the same
  // picture: none for one beside it, edge to edge or corner to corner.
  const apart = (tile: WallTile): number =>
    Math.min(
      ...tiles
        .filter((other) => on(other) === on(tile))
        .map((other) =>
          Math.max(
            tile.column - other.column - other.columns,
            other.column - tile.column - tile.columns,
            tile.row - other.row - other.rows,
            other.row - tile.row - tile.rows
          )
        )
    );
  const put = (tile: WallTile) => {
    for (let across = 0; across < tile.columns; across += 1) {
      for (let down = 0; down < tile.rows; down += 1) {
        covered.set(`${tile.column + across} ${tile.row + down}`, tiles.length);
      }
    }
    tiles.push(tile);
    used.set(on(tile), usedOf(on(tile)) + 1);
    used.set(tile.file, usedOf(tile.file) + 1);
    used.set(`look ${tile.look}`, usedOf(`look ${tile.look}`) + 1);
  };
  for (const pin of pinned) {
    put({ ...cellsOf(pin.file), ...pin });
  }
  for (let row = 0; row < WALL.rows; row += 1) {
    for (let column = 0; column < WALL.columns; column += 1) {
      if (covered.has(`${column} ${row}`)) {
        continue;
      }
      const fitting = files.flatMap((file) => {
        const place = { ...cellsOf(file), column, row };
        const fits =
          column + place.columns <= WALL.columns &&
          row + place.rows <= WALL.rows &&
          Array.from({ length: place.columns * place.rows }, (_, cell) => [
            column + (cell % place.columns),
            row + Math.floor(cell / place.columns),
          ]).every(([across, down]) => !covered.has(`${across} ${down}`));
        return fits
          ? Array.from({ length: looks }, (_, look) => ({
              ...place,
              file,
              look,
            }))
          : [];
      });
      const fresh = fitting.filter((tile) => usedOf(on(tile)) === 0);
      const again = fitting.filter(
        (tile) => !pins.has(tile.file) && apart(tile) > 0
      );
      const costOf = (tile: WallTile) => [
        fresh.length > 0 ? 0 : -apart(tile),
        touching(tile, (other) => other.file === tile.file),
        touching(tile, (other) => other.look === tile.look),
        usedOf(tile.file),
        usedOf(`look ${tile.look}`),
      ];
      const [tile] = (fresh.length > 0 ? fresh : again).toSorted((a, b) => {
        const costs = costOf(b);
        return (
          costOf(a)
            .map((cost, index) => cost - (costs[index] ?? 0))
            .find((difference) => difference !== 0) ?? 0
        );
      });
      // Nothing is small enough for what is left here, or far enough from
      // its other self.
      if (tile === undefined) {
        continue;
      }
      put(tile);
    }
  }
  return tiles;
};
