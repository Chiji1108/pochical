// Design decisions that /design lets you switch between. The first choice of
// each entry is the current proposal and is used when the URL omits it.
export const designVariantOptions = {
  actionWidth: {
    choices: [
      { label: "今月のお休みと揃える", value: "aligned" },
      { label: "内側に入れる", value: "inset" },
    ],
    label: "入力ボタンの幅",
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
  importRun: {
    choices: [
      { label: "初めて", value: "first" },
      { label: "2回目から", value: "repeat" },
    ],
    label: "取り込みの確認",
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
