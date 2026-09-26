// Design decisions that /design lets you switch between. The first choice of
// each entry is the current proposal and is used when the URL omits it.
export const designVariantOptions = {
  colorScheme: {
    choices: [
      { label: "ライト", value: "light" },
      { label: "ダーク", value: "dark" },
    ],
    label: "外観",
  },
  groupView: {
    choices: [
      { label: "表", value: "table" },
      { label: "重ねる", value: "overlay" },
      { label: "人ごと", value: "person" },
    ],
    label: "グループの見せ方",
  },
  headerLayout: {
    choices: [
      { label: "月の横に ‹ ›", value: "title" },
      { label: "‹ › なし（スワイプ）", value: "swipe" },
    ],
    label: "見出しの並び",
  },
  importAccess: {
    choices: [
      { label: "通常", value: "normal" },
      { label: "上限に到達", value: "limit" },
    ],
    label: "写真の取り込み",
  },
  memberLook: {
    choices: [
      { label: "相手のスタイル", value: "theirs" },
      { label: "自分のスタイル", value: "mine" },
    ],
    label: "相手のシフトの見た目",
  },
  memberSample: {
    choices: [
      { label: "5人", value: "some" },
      { label: "0人", value: "none" },
    ],
    label: "一緒に働く人",
  },
  neutralTint: {
    choices: [
      { label: "テーマに合わせる", value: "theme" },
      { label: "いつも同じ", value: "none" },
    ],
    label: "背景の色み",
  },
  scheduleSample: {
    choices: [
      { label: "入力済み", value: "filled" },
      { label: "空", value: "empty" },
    ],
    label: "予定",
  },
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
  return Object.fromEntries(
    designVariantKeys.map((key) => {
      const { choices } = designVariantOptions[key];
      const choice = choices.find(({ value }) => value === search[key]);
      return [key, (choice ?? choices[0]).value];
    })
  ) as DesignVariants;
}
