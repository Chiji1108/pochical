// The wallpaper behind Android's widgets and screens, whose colors they
// take (lib/material-you.ts); /design and /design/widgets both offer it.
export const wallpaperVariant = {
  choices: [
    { label: "青緑", value: "teal" },
    { label: "桃", value: "peach" },
    { label: "山吹", value: "yamabuki" },
  ],
  label: "Android の壁紙",
} as const;

// The choice the URL names for each key, else the first, which is the
// current proposal.
export function chosenVariants<Key extends string>(
  options: Record<
    Key,
    { choices: readonly [{ value: string }, ...{ value: string }[]] }
  >,
  keys: readonly Key[],
  search: Record<string, unknown>
) {
  return Object.fromEntries(
    keys.map((key) => {
      const { choices } = options[key];
      const choice = choices.find(({ value }) => value === search[key]);
      return [key, (choice ?? choices[0]).value];
    })
  );
}

// Design decisions that /design lets you switch between. The first choice of
// each entry is the current proposal and is used when the URL omits it.
export const designVariantOptions = {
  groupSample: {
    choices: [
      { label: "参加中", value: "some" },
      { label: "なし", value: "none" },
    ],
    label: "グループ",
  },
  inviteLink: {
    choices: [
      { label: "なし", value: "none" },
      { label: "開いた", value: "opened" },
    ],
    label: "招待リンク",
  },
  memberSample: {
    choices: [
      { label: "5人", value: "some" },
      { label: "0人", value: "none" },
    ],
    label: "一緒に働く人",
  },
  patternSample: {
    choices: [
      { label: "4個", value: "few" },
      { label: "13個", value: "many" },
    ],
    label: "パターン",
  },
  // How 端末カレンダーに追加 goes: the calendars allowed, refused, or
  // allowed and the adding failing.
  calendarAccess: {
    choices: [
      { label: "許可済み", value: "granted" },
      { label: "許可しない", value: "denied" },
      { label: "追加に失敗", value: "fails" },
    ],
    label: "端末カレンダー",
  },
  photoSend: {
    choices: [
      { label: "届く", value: "ok" },
      { label: "失敗する", value: "fails" },
    ],
    label: "写真の送信",
  },
  platform: {
    choices: [
      { label: "iPhone", value: "ios" },
      { label: "Android", value: "android" },
    ],
    label: "端末",
  },
  // The person's repeating orders: none, one in use, or one in use with
  // an earlier one over and a later one to come, for 繰り返し's timeline.
  repeatSample: {
    choices: [
      { label: "なし", value: "none" },
      { label: "今だけ", value: "now" },
      { label: "切り替え予定", value: "planned" },
    ],
    label: "繰り返し",
  },
  scanResult: {
    choices: [
      { label: "招待", value: "invite" },
      { label: "ほかのQR", value: "other" },
      { label: "使えない招待", value: "expired" },
      { label: "QRなし", value: "none" },
    ],
    label: "読み取るQR",
  },
  scheduleSample: {
    choices: [
      { label: "入力済み", value: "filled" },
      { label: "空", value: "empty" },
    ],
    label: "予定",
  },
  supportSample: {
    choices: [
      { label: "はじめて", value: "none" },
      { label: "返事あり", value: "answered" },
    ],
    label: "お問い合わせ",
  },
  wallpaper: wallpaperVariant,
} as const;

type VariantKey = keyof typeof designVariantOptions;

export type DesignVariants = {
  [
    K in VariantKey
  ]: (typeof designVariantOptions)[K]["choices"][number]["value"];
};

export const designVariantKeys = Object.keys(
  designVariantOptions
) as VariantKey[];

export function parseDesignVariants(
  search: Record<string, unknown>
): DesignVariants {
  return chosenVariants(
    designVariantOptions,
    designVariantKeys,
    search
  ) as DesignVariants;
}
