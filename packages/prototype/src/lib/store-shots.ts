import type { PresetShift } from "./design-patterns";

// The stores' screenshots (#806): each is a screen of the real app,
// photographed by its platform's own UI test into
// `.build/store-screenshots/<store>` under the name `raw` gives here, the
// same on both platforms, and
// drawn on the site's sky under its headline at the store's size by
// apps/design's /_render/store-shot, which `pnpm --dir apps/design
// image:store` photographs into `store/screenshots/<store>`.

// A phone screenshot's size in each store. The App Store's is the one
// App Store Connect requires on a version's page, for an iPhone with
// Dynamic Island (medium display, 6.3 inches), as tall for its width as
// the Pro Max's screen the capture photographs:
// https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications
// Google Play's is the 9:16 it asks of the pictures it features, no side
// more than twice the other:
// https://support.google.com/googleplay/android-developer/answer/9866151
// `widgetRow` is how tall a Home Screen's cell is in its widths, by the
// platform's small widget (Android's SMALL, WidgetParts.kt).
export const STORES = {
  android: { height: 1920, widgetRow: 202 / 179, width: 1080 },
  ios: { height: 2622, widgetRow: 1, width: 1206 },
} as const;

export type StoreId = keyof typeof STORES;

// Google Play's feature graphic, which needs no screen: the sky, the app's
// icon and its name over the site's line, in `store/feature-graphic.png`.
export const FEATURE_GRAPHIC = {
  height: 500,
  line: "シフトを、ポチッと。",
  name: "feature-graphic",
  width: 1024,
} as const;

// How much of a picture's height its headline may take, with the room
// around it: Google Play asks that a tagline take no more than about a
// fifth of a screenshot, and the App Store's pictures keep to it too.
export const HEADLINE_SHARE = 0.2;

// How large a headline's letters are, in hundredths of the picture's
// width, and the room a line of it keeps to each of the picture's sides:
// a line is one row, never broken.
export const HEADLINE = { margin: 2, size: 8.6 } as const;

// How a picture's title is set (apps/design's site-picture.tsx): how tall
// a line is in its letters' size, and how far apart the letters are, in
// it too.
export const TITLE = { line: 1.35, spacing: 0.01 } as const;

// A shot of one screen may lift a part of it, its `callout`: the part the
// headline is about, drawn again larger on a card of the picture's over
// where it is in the phone, wider than the phone. It names the part as the
// capture measured it, by an element of the screen, in the file beside
// the screen (`<raw>.json`: `parts`, each one's left, top, width and
// height in the screen's pixels, and `pieces`, the same of everything on
// the screen that says something, which the card must not cut through).
//
// What a shot is drawn from: one screen; two screens side by side; tiles,
// each a part of a screen under its words; or a wall of the widgets in the
// looks it mixes, each look a folder of `raw`
// holding every widget as a PNG named
// `<widget>-<small | medium | large>.png`, the same names in each, and
// `tiles` saying which goes where.
type StoreShot = { headline: readonly string[]; name: string } & (
  | { kind: "pair"; raw: readonly [string, string] }
  | { callout?: string; kind: "screen"; raw: string }
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
// every picture drawn from the wall (WALL_PICTURES), inside what it shows
// on every device.
export type WallPlace = {
  column: number;
  file: string;
  look: number;
  row: number;
  whole?: true;
};

// The shot the wall of widgets is, which other pictures are drawn from too
// (WALL_PICTURES).
export const WALL_SHOT = {
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
    { column: 5, file: "simple-night-small.png", look: 1, row: 5 },
    { column: 0, file: "simple-medium.png", look: 1, row: 6 },
    { column: 2, file: "upcoming-medium.png", look: 0, row: 6 },
    { column: 4, file: "upcoming-day-medium.png", look: 0, row: 6 },
    { column: 0, file: "upcoming-person-medium.png", look: 0, row: 7 },
    { column: 2, file: "calendar-large.png", look: 1, row: 7 },
    { column: 4, file: "simple-day-medium.png", look: 1, row: 7 },
    { column: 0, file: "simple-night-medium.png", look: 1, row: 8 },
    { column: 4, file: "calendar-medium.png", look: 0, row: 8 },
  ],
} as const satisfies StoreShot;

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
// details' shot sets three tiles one over the other, each a way a roster
// has of its own, and the cares' shot three more, each a thing the app
// does for the person. A tile's part of a screen is named for what it is,
// not for the shot it is in.
export const STORE_SHOTS = [
  {
    headline: ["勤務表を見ながら、", "ポチポチ。"],
    kind: "screen",
    name: "entry",
    raw: "01-entry.png",
  },
  WALL_SHOT,
  {
    callout: "together",
    headline: ["家族や友人と、", "シフトを共有。"],
    kind: "screen",
    name: "group-shifts",
    raw: "03-group-shifts.png",
  },
  {
    callout: "poll",
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
    callout: "reflect",
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
        raw: "tile-repeat.png",
        words: "決まった並びは、繰り返しで",
      },
      {
        raw: "tile-period.png",
        words: "15日始まりの月にも",
      },
      {
        pieces: [
          { date: 13, early: true, kind: "day", says: "早出", shift: "day" },
          { date: 8, kind: "day", late: true, says: "残業", shift: "day" },
        ],
        words: "早出・残業が、アイコンでわかる",
      },
    ],
  },
  {
    headline: ["小さな気づかいも、", "忘れずに。"],
    kind: "tiles",
    name: "cares",
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
        raw: "tile-reminder.png",
        words: "前の晩、明日のシフトをお知らせ",
      },
      {
        raw: "tile-group-end.png",
        words: "グループに、終了日をつけられる",
      },
    ],
  },
] as const satisfies readonly StoreShot[];

type StoreShotName = (typeof STORE_SHOTS)[number]["name"];

// The room under a phone, in hundredths of the picture's width.
export const STAGE_FOOT = 5;

// A callout's card, lengths in hundredths of the picture's width: the room
// it leaves to the picture's sides, how many times larger than the phone
// has it the part is drawn at most, and the room it keeps around its part.
const CALLOUT = { margin: 2, most: 1.35, pad: 1.5 } as const;

// A rectangle of a screen or a picture, in its pixels.
export type Rect = { height: number; left: number; top: number; width: number };

// A callout as it is drawn: how many times larger than the phone has it
// the part is; and the card in the picture, over the part in the phone,
// which stands in the picture's middle as tall as the room under the
// headline. A screen reads from its top, so what is over the part leads
// to it and stays in sight: the card's top is where the part's is, with
// its own room, and the part grows down from there, and to both sides
// alike. It is as large as lets a row as wide as the screen keep the
// card's margin to the picture's sides, and the card leave as much of the
// phone under it as the picture leaves under the phone. The card then
// takes in every piece of the screen it would lie over a part of, on
// whichever side that is: what shows beside the card is whole, and what
// it covers is covered whole. The part is drawn in the card's middle.
export const calloutOf = (
  measured: Rect,
  pieces: readonly Rect[],
  screen: { height: number; width: number },
  picture: { height: number; width: number }
) => {
  const unit = picture.width / 100;
  const headline = picture.height * HEADLINE_SHARE;
  const phone = (picture.height - headline - STAGE_FOOT * unit) / screen.height;
  const pad = (CALLOUT.pad * unit) / phone;
  const top = measured.top - pad;
  const scale = Math.min(
    CALLOUT.most,
    (100 - 2 * CALLOUT.margin - 2 * CALLOUT.pad) /
      ((screen.width * phone) / unit),
    (screen.height - (STAGE_FOOT * unit) / phone - pad - measured.top) /
      measured.height
  );
  const beside = ((scale - 1) * measured.width) / 2 + pad;
  const sides = pieces.map((piece) => ({
    foot: piece.top + piece.height,
    left: piece.left,
    right: piece.left + piece.width,
    top: piece.top,
  }));
  type Sides = (typeof sides)[number];
  // A piece `card` lies over a part of.
  const cutBy = (card: Sides) =>
    sides.find(
      (piece) =>
        piece.left < card.right &&
        card.left < piece.right &&
        piece.top < card.foot &&
        card.top < piece.foot &&
        (piece.left < card.left ||
          card.right < piece.right ||
          piece.top < card.top ||
          card.foot < piece.foot)
    );
  // The card over the phone, in the screen's pixels: each turn takes one
  // more piece in whole, and none in leaves again.
  let card = {
    foot: measured.top + scale * measured.height + pad,
    left: measured.left - beside,
    right: measured.left + measured.width + beside,
    top,
  };
  let cut = cutBy(card);
  while (cut !== undefined) {
    card = {
      foot: Math.max(card.foot, cut.foot),
      left: Math.min(card.left, cut.left),
      right: Math.max(card.right, cut.right),
      top: Math.min(card.top, cut.top),
    };
    cut = cutBy(card);
  }
  return {
    card: {
      height: (card.foot - card.top) * phone,
      left: picture.width / 2 + (card.left - screen.width / 2) * phone,
      top: headline + card.top * phone,
      width: (card.right - card.left) * phone,
    },
    phone,
    scale,
  };
};

// A shot's picture in `store/screenshots/<store>`, numbered in the stores'
// order.
export const storeShotFile = (name: StoreShotName): string => {
  const order = STORE_SHOTS.findIndex((shot) => shot.name === name) + 1;
  return `${String(order).padStart(2, "0")}-${name}.png`;
};

// The sizes a widget on the wall comes in, by the cells of a Home Screen
// it covers across and down.
const WIDGET_CELLS = {
  large: { columns: 2, rows: 2 },
  medium: { columns: 2, rows: 1 },
  small: { columns: 1, rows: 1 },
} as const;

type WidgetSize = keyof typeof WIDGET_CELLS;

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

// How the wall is shaped, lengths in units, a unit a hundredth of the
// width of a store's picture: a cell's width and the gap between cells;
// how far down a store's picture the grid's middle is, in its heights;
// how far the grid is turned, in degrees; and where the fade under the
// headline ends, in the headline's heights.
export const WALL_SHAPE = {
  cell: 25,
  clear: 1.25,
  gap: 3.5,
  middle: 0.54,
  turn: -12,
} as const;

// Where the wall lies in a picture, in the picture's pixels: how long a
// unit is, where the grid's middle is, and how many times the grid is laid
// side by side, for a picture wider than one covers.
export type WallLie = {
  across: number;
  middle: readonly [number, number];
  unit: number;
};

// The wall as it lies in a store's picture, and in any other of its shape.
export const wallLieOf = (picture: {
  height: number;
  width: number;
}): WallLie => ({
  across: 1,
  middle: [picture.width / 2, picture.height * WALL_SHAPE.middle],
  unit: picture.width / 100,
});

// A line of words a picture carries: its lines, their size in the
// picture's pixels, and where their middle is.
type PictureLine = {
  middle: readonly [number, number];
  size: number;
  words: readonly string[];
};

// The room a picture's line takes at most, every letter as wide as it is
// tall: what the wall clears around, and what a safe area is to hold.
export const lineBoxOf = ({ middle, size, words }: PictureLine): Rect => {
  const letters = Math.max(...words.map((line) => line.length));
  const width = letters * size * (1 + TITLE.spacing);
  const height = words.length * size * TITLE.line;
  return {
    height,
    left: middle[0] - width / 2,
    top: middle[1] - height / 2,
    width,
  };
};

// The sky a wall's picture clears around its line: how far the clearing
// reaches from the line's middle, in the widths and heights of the line's
// room, and how much of that reach has no wall at all.
const LINE_CLEAR = { across: 0.87, down: 0.9, whole: 0.8 } as const;

// The clearing around a picture's line, an ellipse about the line's
// middle: its reach across and down in the picture's pixels, inside which
// the wall fades, and the share of it the wall is gone from.
export const lineClearOf = (line: PictureLine) => {
  const box = lineBoxOf(line);
  return {
    across: box.width * LINE_CLEAR.across,
    down: box.height * LINE_CLEAR.down,
    middle: line.middle,
    whole: LINE_CLEAR.whole,
  };
};

// A picture drawn from the wall besides the stores' shot of it: the name
// /_render/store-shot knows it by, its size, the file it is written to,
// from the repository's root, and the store whose widgets it shows.
// `lie` is where the wall lies in it, as in a store's picture without;
// `line` the words it carries over the wall, which clears around them
// (lineClearOf), none without; and `safe` the part of it every device
// shows, which is to hold the line and the widgets marked `whole`, clear
// of the line's clearing, the whole picture without.
export type WallPicture = {
  file: string;
  height: number;
  lie?: WallLie;
  line?: PictureLine;
  name: string;
  safe?: Rect;
  store: StoreId;
  width: number;
};

// The pictures drawn from the wall. The App Store's product page header
// (iOS 27) is 21:9, and devices crop it to no less than its art safe area:
// the rectangle inside the line Apple's template draws, which is 4 pixels
// wide from 1097, 493 to 2742, 1153.
// https://developer.apple.com/help/app-store-connect/reference/app-information/creative-assets-specifications
// The wall fills it at a quarter of the size a store's picture of that
// width would have it, laid four times side by side, the widgets marked
// `whole` at the safe area's leading side and the site's own line beside
// them.
export const WALL_PICTURES = [
  {
    file: "store/product-page-header.png",
    height: 1646,
    lie: { across: 4, middle: [2294, 755], unit: 10 },
    line: {
      middle: [2360, 823],
      size: 140,
      words: ["シフトを、", "ポチッと。"],
    },
    name: "product-page-header",
    safe: { height: 653, left: 1101, top: 497, width: 1638 },
    store: "ios",
    width: 3840,
  },
] as const satisfies readonly WallPicture[];

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

// The wall as it is placed, `across` times side by side: each widget with
// the cells its size covers.
export const wallOf = (places: readonly WallPlace[], across = 1): WallTile[] =>
  Array.from({ length: across }, (_, copy) =>
    places.map(({ column, file, look, row }) => ({
      ...cellsOf(file),
      column: column + copy * WALL.columns,
      file,
      look,
      row,
    }))
  ).flat();

// A widget's four corners in a picture the wall lies in as `lie` says,
// its cells `cellRow` times as tall as they are wide, as [across, down] in
// the picture's pixels.
export const wallCornersOf = (
  { column, columns, row, rows }: WallTile,
  cellRow: number,
  lie: WallLie
): [number, number][] => {
  const { cell, gap, turn } = WALL_SHAPE;
  const high = cell * cellRow;
  const across = WALL.columns * lie.across;
  const wide = across * cell + (across - 1) * gap;
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
  ].map(([along = 0, under = 0]) => {
    const x = along - wide / 2;
    const y = under - down / 2;
    return [
      lie.middle[0] + lie.unit * (x * Math.cos(angle) - y * Math.sin(angle)),
      lie.middle[1] + lie.unit * (x * Math.sin(angle) + y * Math.cos(angle)),
    ];
  });
};
