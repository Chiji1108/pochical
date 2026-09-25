// Design decisions that /design lets you switch between. The first choice of
// each entry is the current proposal and is used when the URL omits it.
export const designVariantOptions = {
  shiftMark: {
    label: "シフトの見た目",
    choices: [
      { value: "icon", label: "アイコン" },
      { value: "emoji", label: "絵文字" },
      { value: "badge", label: "文字" },
    ],
  },
  headerLayout: {
    label: "見出しの並び",
    choices: [
      { value: "title", label: "月の横に ‹ ›" },
      { value: "swipe", label: "‹ › なし（スワイプ）" },
    ],
  },
  importAccess: {
    label: "写真の取り込み",
    choices: [
      { value: "normal", label: "通常" },
      { value: "limit", label: "上限に到達" },
    ],
  },
  memberSample: {
    label: "登録メンバー",
    choices: [
      { value: "some", label: "5人" },
      { value: "none", label: "0人" },
    ],
  },
} as const;

type VariantKey = keyof typeof designVariantOptions;

export type DesignVariants = {
  [K in VariantKey]: (typeof designVariantOptions)[K]["choices"][number]["value"];
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
