import type { IMessage } from "@kesha-antonov/react-native-chat";
import type { Doc, Id } from "../../../convex/_generated/dataModel";

export type ChatMessage = Pick<
  Doc<"chatMessages">,
  | "_id"
  | "authorUserId"
  | "body"
  | "createdAt"
  | "reactions"
  | "reply"
  | "deletedAt"
> & { authorDisplayName: string; readCount: number };
export type ReadReceiptMode = "count" | "direct";
export interface DisplayMessage extends IMessage {
  _id: string;
  messageId?: Id<"chatMessages">;
  readCount?: number;
  readReceiptMode?: ReadReceiptMode;
}

export type ChatEvent = {
  _id: string;
  actorDisplayNameSnapshot: string;
  actorUserId: string;
  body: string;
  createdAt: number;
  kind:
    | "group_name_updated"
    | "group_emoji_updated"
    | "display_name_updated"
    | "invite_code_regenerated"
    | "member_joined"
    | "member_left"
    | "member_removed";
  nextValue?: string;
  previousValue?: string;
  targetDisplayNameSnapshot?: string;
  targetUserId?: string;
};

const formatEventActor = (event: ChatEvent, currentUserId: string) =>
  event.actorUserId === currentUserId
    ? "あなた"
    : `${event.actorDisplayNameSnapshot}さん`;

const formatValueChangeEvent = (
  actor: string,
  event: ChatEvent,
  label: string
) =>
  event.previousValue && event.nextValue
    ? `${actor}が${label}を「${event.previousValue}」から「${event.nextValue}」に変更しました`
    : event.body;

const formatEventBody = (event: ChatEvent, currentUserId: string) => {
  if (event.actorUserId === "deleted-account") {
    return event.body;
  }
  const actor = formatEventActor(event, currentUserId);

  if (event.kind === "group_name_updated") {
    return formatValueChangeEvent(actor, event, "グループ名");
  }

  if (event.kind === "group_emoji_updated") {
    return formatValueChangeEvent(actor, event, "グループアイコン");
  }

  if (event.kind === "display_name_updated") {
    return formatValueChangeEvent(actor, event, "名前");
  }

  if (event.kind === "invite_code_regenerated") {
    return `${actor}が招待リンクを再発行しました`;
  }

  if (event.kind === "member_joined" || event.kind === "member_left") {
    return event.actorUserId === currentUserId
      ? event.body.replace(`${event.actorDisplayNameSnapshot}さん`, "あなた")
      : event.body;
  }

  if (event.kind === "member_removed") {
    const targetDisplayName = event.targetDisplayNameSnapshot ?? "メンバー";
    const target =
      event.targetUserId === currentUserId
        ? "あなた"
        : `${targetDisplayName}さん`;

    return `${actor}が${target}をグループから削除しました`;
  }

  return event.body;
};

export const toDisplayMessage = (
  message: ChatMessage,
  readReceiptMode: ReadReceiptMode
): DisplayMessage => {
  const pending = message._id.startsWith("message:");
  return {
    _id: message._id,
    messageId:
      pending || message.deletedAt !== undefined ? undefined : message._id,
    text:
      message.deletedAt === undefined
        ? message.body
        : "メッセージは削除されました",
    createdAt: message.createdAt,
    user: { _id: message.authorUserId, name: message.authorDisplayName },
    pending,
    sent: !pending,
    received: message.readCount > 0,
    readCount: message.readCount,
    readReceiptMode,
    reactions: message.reactions,
    replyMessage: message.reply
      ? {
          _id: message.reply.messageId,
          text: message.reply.body,
          user: {
            _id: message.reply.authorUserId,
            name: message.reply.authorDisplayName,
          },
        }
      : undefined,
  };
};

export const buildChatMessages = (
  messages: ChatMessage[],
  events: ChatEvent[],
  currentUserId: string,
  readReceiptMode: ReadReceiptMode
): DisplayMessage[] =>
  [
    ...messages.map((message) => toDisplayMessage(message, readReceiptMode)),
    ...events.map(
      (event): DisplayMessage => ({
        _id: event._id,
        text: formatEventBody(event, currentUserId),
        createdAt: event.createdAt,
        user: { _id: event.actorUserId },
        system: true,
      })
    ),
  ].sort(
    (a, b) =>
      Number(b.createdAt) - Number(a.createdAt) || a._id.localeCompare(b._id)
  );

export const findChatReply = (
  messages: ChatMessage[],
  messageId?: Id<"chatMessages">
): ChatMessage["reply"] => {
  const message = messages.find((item) => item._id === messageId);
  return message
    ? {
        messageId: message._id,
        authorUserId: message.authorUserId,
        authorDisplayName: message.authorDisplayName,
        body: message.body,
      }
    : undefined;
};
