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
  // How the group rail stands beside the hub: on its own ground against
  // the phone's left edge, fading out under the tab bar (the proposal);
  // on the screen's ground with a line between; Discord's way round, the
  // hub raised as a pane beside a rail on the ground; or as it was, held
  // 8px off the edge.
  groupRail: {
    choices: [
      { label: "端に付ける", value: "edge" },
      { label: "線で区切る", value: "line" },
      { label: "本文を面に", value: "pane" },
      { label: "端を空ける", value: "inset" },
    ],
    label: "グループの列",
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
