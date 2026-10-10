import { chosenVariants, wallpaperVariant } from "./design-variants";

// What /design/widgets switches between, as /demo's choices do: each kept
// in the URL, the first of each the one shown when the URL leaves it out.
// The widgets' own settings, the day they show and the device they sit
// on, so a widget can be looked at in any state without a page of rows.
export const widgetVariantOptions = {
  // Who 次の休み and これから are set to, as editing the widget picks:
  // someone, or for 次の休み a whole group.
  companion: {
    choices: [
      { label: "なし", value: "none" },
      { label: "ゆうき", value: "partner" },
      { label: "お母さん", value: "mother" },
      { label: "未入力の人", value: "notEntered" },
      { label: "家族", value: "family" },
      { label: "看護学校の友達", value: "friends" },
      { label: "高校の同級生", value: "school" },
    ],
    label: "一緒に見る相手",
  },
  day: {
    choices: [
      { label: "ふつう", value: "plain" },
      { label: "残業とメモ", value: "busy" },
      { label: "早出", value: "early" },
      { label: "早出と残業", value: "earlyLate" },
      { label: "休み", value: "off" },
      { label: "明日休み", value: "offTomorrow" },
      { label: "当番", value: "duty" },
      { label: "当番明けの非番", value: "afterDuty" },
      { label: "未入力", value: "blank" },
      { label: "何も入れていない", value: "empty" },
    ],
    label: "今日",
  },
  kind: {
    choices: [
      { label: "すべて", value: "all" },
      { label: "シンプル", value: "simple" },
      { label: "次の休み", value: "nextOff" },
      { label: "これから", value: "upcoming" },
      { label: "カレンダー", value: "calendar" },
      { label: "いまのシフト", value: "now" },
      { label: "ロック画面", value: "lock" },
    ],
    label: "種類",
  },
  // The time the widgets are looked at, for いまのシフト: before the
  // day's shift, during it, and after it; tHHMM, as a URL keeps a value
  // of digits alone as a number.
  clock: {
    choices: [
      { label: "6:45", value: "t0645" },
      { label: "10:00", value: "t1000" },
      { label: "19:00", value: "t1900" },
    ],
    label: "時刻",
  },
  language: {
    choices: [
      { label: "日本語", value: "ja" },
      { label: "英語", value: "en" },
    ],
    label: "月と曜日",
  },
  look: {
    choices: [
      { label: "ライト", value: "light" },
      { label: "ダーク", value: "dark" },
      { label: "色合い", value: "tinted" },
      { label: "クリア", value: "clear" },
    ],
    label: "見た目",
  },
  month: {
    choices: [
      { label: "9月（5週）", value: "september" },
      { label: "8月（6週）", value: "august" },
    ],
    label: "月",
  },
  names: {
    choices: [
      { label: "出さない", value: "hidden" },
      { label: "出す", value: "shown" },
    ],
    label: "名前",
  },
  offLook: {
    choices: [
      { label: "塗る", value: "tint" },
      { label: "塗らない", value: "plain" },
      { label: "空白", value: "blank" },
    ],
    label: "休みの見せ方",
  },
  platform: {
    choices: [
      { label: "iPhone", value: "ios" },
      { label: "Android", value: "android" },
    ],
    label: "端末",
  },
  shape: {
    choices: [
      { label: "塗り", value: "fill" },
      { label: "線", value: "line" },
      { label: "絵文字", value: "emoji" },
      { label: "文字", value: "badge" },
    ],
    label: "シフトの見た目",
  },
  shiftColors: {
    choices: [
      { label: "色分け", value: "multi" },
      { label: "ワントーン", value: "mono" },
    ],
    label: "シフトの色",
  },
  theme: {
    choices: [
      { label: "ポチカル", value: "pochical" },
      { label: "墨", value: "sumi" },
      { label: "月夜", value: "tsukiyo" },
      { label: "喫茶", value: "kissa" },
    ],
    label: "テーマ",
  },
  wallpaper: wallpaperVariant,
  weekend: {
    choices: [
      { label: "色をつける", value: "colored" },
      { label: "つけない", value: "plain" },
    ],
    label: "土日祝",
  },
} as const;

type WidgetVariantKey = keyof typeof widgetVariantOptions;

export type WidgetVariants = {
  [
    K in WidgetVariantKey
  ]: (typeof widgetVariantOptions)[K]["choices"][number]["value"];
};

// The choices in the order the panel lists them: what is shown, then the
// device, then the person's settings.
export const widgetVariantKeys: WidgetVariantKey[] = [
  "kind",
  "day",
  "clock",
  "companion",
  "month",
  "platform",
  "look",
  "wallpaper",
  "theme",
  "shiftColors",
  "shape",
  "names",
  "offLook",
  "weekend",
  "language",
];

export function parseWidgetVariants(
  search: Record<string, unknown>
): WidgetVariants {
  return chosenVariants(
    widgetVariantOptions,
    widgetVariantKeys,
    search
  ) as WidgetVariants;
}
