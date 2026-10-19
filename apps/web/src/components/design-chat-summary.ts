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

// One of yours not sent, as the chats' list says it: the line's red ! and
// 送れませんでした in place of its words (spec/chat.md, Lines on their way).
export const failedLine = { failed: true } as const;

// What a chat's row says of its latest line.
export type ListedLine = string | typeof failedLine;

// A chat's latest line in the chats' list: what was shared or sent rather
// than the card's words, and 自分： before your own (spec/chat.md, Photos).
export function lastLineOf(
  last: Message,
  writer: Member | undefined,
  nameOf: (id: string) => string,
  blocked: boolean
): ListedLine {
  if (last.failed) {
    return failedLine;
  }
  if (last.notice) {
    return last.notice;
  }
  if (last.unsent) {
    return unsentLine(writer);
  }
  if (blocked) {
    return blockedLine;
  }
  let text = summaryOf(last, nameOf);
  if (last.days || (last.poll && !last.poll.decided)) {
    text = `${text}を共有しました`;
  } else if (last.photo) {
    text = "写真を送りました";
  }
  return writer?.me ? `自分：${text}` : text;
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
