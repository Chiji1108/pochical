import { plainText } from "../lib/chat-text";
import { dateKey, formatDay } from "../lib/design-days";
import type { Member, Message, Poll } from "./design-group-data";

// A chat's lines put in a few words, where a line is named rather than
// drawn: a quote, the pin bar, the line being answered or changed, and
// the chat list's last line.

// A blocked member's message, folded, as Discord shows one: the words say
// whose it is not, and a tap shows it this once.
export const blockedLine = "ブロック中のメンバーのメッセージ";

// What stays of a message taken back, as LINE says it: who took it back,
// or for your own, only that it was.
export function unsentLine(writer?: Member) {
  return writer?.me
    ? "メッセージの送信を取り消しました"
    : `${writer?.name ?? "メンバー"}がメッセージの送信を取り消しました`;
}

export function summaryOf(message: Message, nameOf: (id: string) => string) {
  if (message.unsent) {
    return "取り消されたメッセージ";
  }
  if (message.photo) {
    return "📷 写真";
  }
  if (message.poll) {
    return pollSummary(message.poll);
  }
  return message.days
    ? daysSummary(message.days)
    : plainText(message.text ?? "", nameOf);
}

// A poll in a line of words: what was settled, or that it is open.
function pollSummary(poll: Poll) {
  const decided = poll.days.find((day) => dateKey(day) === poll.decided);
  return decided
    ? `📅 ${formatDay(decided)}に決定`
    : `📅 日にちの投票：${daysSummary(poll.days).replace("📅 ", "")}`;
}

export function daysSummary(days: Date[]) {
  const [first] = days;
  const more = days.length > 1 ? "ほか" : "";
  return first ? `📅 ${formatDay(first)}${more}` : "";
}
