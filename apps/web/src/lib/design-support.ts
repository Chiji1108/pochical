import type { Photo } from "./design-sample-photos";

// A person's chat with the people who make Pochical (design-support-chat),
// kept with their account like their own data: the lines, and how many of
// the answers they have not read yet, which mark the way into it and the
// settings tab.

export type SupportLine = {
  id: string;
  // You, or Pochical's people.
  from: "me" | "support";
  text?: string;
  photo?: Photo;
  when: string;
  time: string;
};

export type SupportThread = { lines: SupportLine[]; unread: number };

export type SupportSample = "none" | "answered";

const answeredLines: SupportLine[] = [
  {
    from: "me",
    id: "s1",
    text: "夜勤と準夜の色が似ていて、月の表だと見分けにくいです。もう少し違う色にできたらうれしいです！",
    time: "22:41",
    when: "9月28日(月)",
  },
  {
    from: "support",
    id: "s2",
    text: "ご連絡ありがとうございます！並べると、たしかに似て見えますね。色の組み合わせを見直してみます。変えたら、ここでお知らせします。",
    time: "11:05",
    when: "9月30日(水)",
  },
];

// Nothing said yet, or an answer that has just come and is not read.
export function supportThreadOf(sample: SupportSample): SupportThread {
  return sample === "answered"
    ? { lines: answeredLines, unread: 1 }
    : { lines: [], unread: 0 };
}
