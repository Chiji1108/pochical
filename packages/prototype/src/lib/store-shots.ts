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

// What a shot is drawn from: one screen; two screens side by side; or a
// wall of the widgets, each a PNG in the folder `raw` named
// `<widget>-<small | medium | large>.png`.
type StoreShot = { headline: readonly string[]; name: string } & (
  | { kind: "pair"; raw: readonly [string, string] }
  | { kind: "screen"; raw: string }
  | { kind: "wall"; raw: string }
);

// The shots in the stores' order, each headline a line an entry. They speak
// to people on night and rotating shifts. The first three are screens,
// which Google Play asks its first pictures to show the app by. The wall
// and the last shot's second screen are in 墨 with シフトの色 at ワントーン,
// in black and white; every other screen is as the app starts.
export const STORE_SHOTS = [
  {
    headline: ["勤務表を見ながら、", "ポチポチ。"],
    kind: "screen",
    name: "entry",
    raw: "01-entry.png",
  },
  {
    headline: ["夜勤も明けも、", "ひと目で。"],
    kind: "screen",
    name: "calendar",
    raw: "02-calendar.png",
  },
  {
    headline: ["いつもの", "カレンダーにも。"],
    kind: "screen",
    name: "device-calendar",
    raw: "03-device-calendar.png",
  },
  {
    headline: ["ホーム画面にも。"],
    kind: "wall",
    name: "widgets",
    raw: "04-widgets",
  },
  {
    headline: ["「いつ休み？」が、", "ひと目で。"],
    kind: "screen",
    name: "group-shifts",
    raw: "05-group-shifts.png",
  },
  {
    headline: ["職場の人にも、", "ちょっと聞ける。"],
    kind: "screen",
    name: "chat",
    raw: "06-chat.png",
  },
  {
    headline: ["色も印も、", "好きな見た目に。"],
    kind: "pair",
    name: "themes",
    raw: ["02-calendar.png", "07-calendar-sumi.png"],
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
