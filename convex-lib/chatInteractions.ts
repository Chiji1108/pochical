import { ConvexError } from "convex/values";
import type { Doc, Id } from "../convex/_generated/dataModel";
import type { QueryCtx } from "../convex/_generated/server";
import { requireDirectMembership, requireMembership } from "./groupMembers";

export const getReplySnapshot = async (
  ctx: QueryCtx,
  thread: Doc<"chatThreads">,
  messageId?: Id<"chatMessages">
): Promise<Doc<"chatMessages">["reply"]> => {
  if (!messageId) {
    return;
  }
  const message = await ctx.db.get(messageId);
  if (
    !message ||
    message.deletedAt !== undefined ||
    message.threadId !== thread._id
  ) {
    throw new ConvexError("返信先のメッセージが見つかりません");
  }
  return {
    messageId: message._id,
    authorUserId: message.authorUserId,
    authorDisplayName: message.authorDisplayNameSnapshot,
    body: message.body,
  };
};

export const requireMessageAccess = async (
  ctx: QueryCtx,
  messageId: Id<"chatMessages">,
  userId: string
) => {
  const message = await ctx.db.get(messageId);
  if (!message || message.deletedAt !== undefined) {
    throw new ConvexError("メッセージが見つかりません");
  }
  const thread = await ctx.db.get(message.threadId);
  if (!thread || thread.groupId !== message.groupId) {
    throw new ConvexError("チャットが見つかりません");
  }
  if (thread.kind === "group") {
    await requireMembership(ctx, thread.groupId, userId);
    return message;
  }
  const participants = [thread.directParticipantA, thread.directParticipantB];
  const otherUserId = participants.find((id) => id !== userId);
  if (!(participants.includes(userId) && otherUserId)) {
    throw new ConvexError("このチャットには参加していません");
  }
  await requireDirectMembership(ctx, thread.groupId, userId, otherUserId);
  return message;
};
