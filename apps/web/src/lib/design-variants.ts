// Design decisions that /design lets you switch between. The first choice of
// each entry is the current proposal and is used when the URL omits it.
export const designVariantOptions = {
  dayDetail: {
    label: "詳細の開き方",
    choices: [
      { value: "week", label: "週表示に縮む" },
      { value: "sheet", label: "シート" },
    ],
  },
  shiftMark: {
    label: "シフトの見た目",
    choices: [
      { value: "emoji", label: "絵文字（今）" },
      { value: "badge", label: "文字バッジ" },
      { value: "icon", label: "アイコン" },
    ],
  },
  iconSet: {
    label: "アイコンの種類",
    choices: [
      { value: "phosphorDuotone", label: "Phosphor（二色）" },
      { value: "lucide", label: "lucide（線）" },
      { value: "phosphorRegular", label: "Phosphor（線）" },
      { value: "phosphorFill", label: "Phosphor（塗り）" },
    ],
  },
  headerLayout: {
    label: "見出しの並び",
    choices: [
      { value: "title", label: "月の横に ‹ ›" },
      { value: "swipe", label: "‹ › なし（スワイプ）" },
      { value: "current", label: "右にまとめる" },
    ],
  },
  importAccess: {
    label: "写真の取り込み",
    choices: [
      { value: "normal", label: "通常" },
      { value: "limit", label: "上限に到達" },
    ],
  },
  startLabel: {
    label: "入力ボタンの名前",
    choices: [
      { value: "pochi", label: "ポチポチ入力" },
      { value: "manual", label: "手で入力" },
      { value: "bulk", label: "まとめて入力" },
    ],
  },
  memberSample: {
    label: "登録メンバー",
    choices: [
      { value: "some", label: "5人" },
      { value: "none", label: "0人" },
    ],
  },
  inputLabel: {
    label: "入力日の表示",
    choices: [
      { value: "date", label: "日付だけ" },
      { value: "suffix", label: "「に入力」つき" },
    ],
  },
  dateChip: {
    label: "日付チップ",
    choices: [
      { value: "quiet", label: "控えめ" },
      { value: "filled", label: "背景あり" },
    ],
  },
  dayActions: {
    label: "消す・翌日",
    choices: [
      { value: "split", label: "2つ並べる" },
      { value: "toggle", label: "切り替え（mobile）" },
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
