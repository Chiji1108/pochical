import type { Chat, Message } from "./design-group-data";

// A person's chat with the people who make Pochical (design-support-chat),
// kept with their account like their own data and as a group's chats are:
// its lines, written by you ("me") or Pochical's people ("support"); how
// many of the answers they have not read yet, which mark the way into it
// and the settings tab; and what is being written, kept as the chat is
// left (spec/chat.md, Drafts).

export type SupportSample = "none" | "answered";

const answeredLines: Message[] = [
  {
    content: {
      kind: "words",
      text: "夜勤と準夜の色が似ていて、月の表だと見分けにくいです。もう少し違う色にできたらうれしいです！",
    },
    from: "me",
    id: "s1",
    reactions: [{ by: ["support"], emoji: "👀" }],
    time: "22:41",
    when: "9月28日(月)",
  },
  {
    content: {
      kind: "words",
      text: "ご連絡ありがとうございます！並べると、たしかに似て見えますね。色の組み合わせを見直してみます。変えたら、ここでお知らせします。",
    },
    from: "support",
    id: "s2",
    time: "11:05",
    when: "9月30日(水)",
  },
];

// Nothing said yet, or an answer that has just come and is not read.
export function supportChatOf(sample: SupportSample): Chat {
  return sample === "answered"
    ? { messages: answeredLines, unread: 1 }
    : { messages: [], unread: 0 };
}
