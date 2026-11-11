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
// `<widget>-<small | medium | large>.png`, the same names in each, and
// `tiles` saying which goes where.
type StoreShot = { headline: readonly string[]; name: string } & (
  | { kind: "pair"; raw: readonly [string, string] }
  | { kind: "screen"; raw: string }
  | { kind: "tiles"; tiles: readonly Tile[] }
  | { kind: "wall"; raw: readonly string[]; tiles: readonly WallPlace[] }
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

// A widget on the wall, placed by hand: its file, the look it is in,
// counted in `raw`, and the cell its top leading corner takes, counted
// from 0. One marked `whole` is to show whole, where the eye lands first:
// in every store's picture, clear of the fade under the headline, and in
// the frame the site's top page shows of the wall.
export type WallPlace = {
  column: number;
  file: string;
  look: number;
  row: number;
  whole?: true;
};

// The shots in the stores' order, each headline a line an entry. They speak
// to people on night and rotating shifts. The first three are what a
// search's results show, so they carry the look; Google Play takes eight
// at most, the App Store ten. A raw file or folder named `-sumi` is in the
// look the app's own settings give it in black and white: テーマ 墨,
// シフトの色 ワントーン, シフトの見た目 線, 休みの見せ方 印だけ, and
// 色をつける日 all off; one named `-letters` has the shifts as letters,
// シフトの見た目 文字, in テーマ ソーダ. Everything else is as the app
// starts. The wall is placed by hand and mixes the two, medium and large
// widgets carrying it and small ones its accents, those set to someone
// or to the group among them, with 次の休み counting to a day off and on
// one, and いまのシフト, its ring drawn while a shift is on, together
// where they show whole; the themes' shot sets the month in 墨 and
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
    headline: ["次の休みも、", "ウィジェットで。"],
    kind: "wall",
    name: "widgets",
    raw: ["02-widgets", "02-widgets-sumi"],
    tiles: [
      { column: 0, file: "calendar-large.png", look: 1, row: 0 },
      { column: 2, file: "calendar-medium.png", look: 0, row: 0 },
      { column: 4, file: "simple-day-medium.png", look: 0, row: 0 },
      { column: 2, file: "simple-medium.png", look: 1, row: 1 },
      { column: 4, file: "upcoming-day-medium.png", look: 1, row: 1 },
      { column: 0, file: "upcoming-medium.png", look: 0, row: 2 },
      { column: 2, file: "upcoming-small.png", look: 1, row: 2 },
      { column: 3, file: "next-off-group-small.png", look: 0, row: 2 },
      { column: 4, file: "next-off-person-small.png", look: 1, row: 2 },
      { column: 5, file: "simple-after-small.png", look: 0, row: 2 },
      { column: 0, file: "upcoming-person-medium.png", look: 1, row: 3 },
      { column: 2, file: "next-off-small.png", look: 0, row: 3, whole: true },
      { column: 3, file: "upcoming-person-small.png", look: 1, row: 3 },
      { column: 4, file: "simple-night-medium.png", look: 0, row: 3 },
      { column: 0, file: "calendar-large.png", look: 0, row: 4 },
      {
        column: 2,
        file: "next-off-day-small.png",
        look: 0,
        row: 4,
        whole: true,
      },
      { column: 3, file: "now-small.png", look: 0, row: 4, whole: true },
      { column: 4, file: "simple-after-medium.png", look: 1, row: 4 },
      { column: 2, file: "calendar-medium.png", look: 1, row: 5 },
      { column: 4, file: "upcoming-person-small.png", look: 0, row: 5 },
      { column: 5, file: "now-small.png", look: 1, row: 5 },
      { column: 0, file: "simple-medium.png", look: 1, row: 6 },
      { column: 2, file: "upcoming-medium.png", look: 0, row: 6 },
      { column: 4, file: "upcoming-day-medium.png", look: 0, row: 6 },
      { column: 0, file: "upcoming-person-medium.png", look: 0, row: 7 },
      { column: 2, file: "calendar-large.png", look: 1, row: 7 },
      { column: 4, file: "simple-day-medium.png", look: 1, row: 7 },
      { column: 0, file: "simple-night-medium.png", look: 1, row: 8 },
      { column: 4, file: "calendar-medium.png", look: 0, row: 8 },
    ],
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

// How the wall lies in its picture, lengths in hundredths of the
// picture's width: a cell's width and the gap between cells; how far down
// the picture the grid's middle is, in its heights; how far the grid is
// turned, in degrees; and where the fade under the headline ends, in the
// headline's heights.
export const WALL_SHAPE = {
  cell: 25,
  clear: 1.25,
  gap: 3.5,
  middle: 0.54,
  turn: -12,
} as const;

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

// The wall as it is placed: each widget with the cells its size covers.
export const wallOf = (places: readonly WallPlace[]): WallTile[] =>
  places.map(({ column, file, look, row }) => ({
    ...cellsOf(file),
    column,
    file,
    look,
    row,
  }));

// A widget's four corners on a picture `tall` times as tall as it is
// wide, whose cells are `row` times as tall as they are wide, as [across,
// down] in hundredths of the picture's width.
export const wallCornersOf = (
  { column, columns, row, rows }: WallTile,
  cellRow: number,
  tall: number
): [number, number][] => {
  const { cell, gap, middle, turn } = WALL_SHAPE;
  const high = cell * cellRow;
  const wide = WALL.columns * cell + (WALL.columns - 1) * gap;
  const down = WALL.rows * high + (WALL.rows - 1) * gap;
  const left = column * (cell + gap);
  const top = row * (high + gap);
  const right = left + columns * cell + (columns - 1) * gap;
  const foot = top + rows * high + (rows - 1) * gap;
  const angle = (turn * Math.PI) / 180;
  return [
    [left, top],
    [right, top],
    [left, foot],
    [right, foot],
  ].map(([across = 0, along = 0]) => {
    const x = across - wide / 2;
    const y = along - down / 2;
    return [
      50 + x * Math.cos(angle) - y * Math.sin(angle),
      100 * tall * middle + x * Math.sin(angle) + y * Math.cos(angle),
    ];
  });
};
