import { UnreadTracking } from "convex-unread-tracking";
import { components } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../convex/_generated/server";

export const unreads = new UnreadTracking<
  string,
  Id<"chatThreads">,
  Id<"groups">
>(components.unreadTracking);

export const ensureOwnMessagesIgnored = async (
  ctx: MutationCtx,
  jazzUserId: string
) => {
  await unreads.muteSender(ctx, {
    targetUserId: jazzUserId,
    userId: jazzUserId,
  });
};

export const recordChatMessageUnread = async (
  ctx: MutationCtx,
  message: {
    authorJazzUserId: string;
    createdAt: number;
    threadId: Id<"chatThreads">;
  }
) => {
  await ensureOwnMessagesIgnored(ctx, message.authorJazzUserId);
  await unreads.insertMessage(ctx, {
    authorId: message.authorJazzUserId,
    channelId: message.threadId,
    timestamp: message.createdAt,
  });
};

export const markThreadRead = async (
  ctx: MutationCtx,
  args: {
    jazzUserId: string;
    thread: Doc<"chatThreads">;
  }
) => {
  if (!args.thread.lastMessageCreatedAt) {
    return;
  }

  await ensureOwnMessagesIgnored(ctx, args.jazzUserId);
  await unreads.markReadUpTo(ctx, {
    channelId: args.thread._id,
    timestamp: args.thread.lastMessageCreatedAt,
    userId: args.jazzUserId,
  });
};

export const getLastReadByChannelId = async (
  ctx: QueryCtx,
  args: {
    channelId: Id<"chatThreads">;
    jazzUserId: string;
  }
) =>
  (await unreads.getLastRead(ctx, {
    channelId: args.channelId,
    userId: args.jazzUserId,
  })) ?? 0;

export const getUnreadCountsByThreadId = async (
  ctx: QueryCtx,
  threads: Doc<"chatThreads">[],
  jazzUserId: string
) => {
  const unreadCountsByThreadId = new Map<Id<"chatThreads">, number>();
  const channelIds = threads
    .filter((thread) => thread.lastMessageCreatedAt)
    .map((thread) => thread._id);

  if (channelIds.length === 0) {
    return unreadCountsByThreadId;
  }

  for (const result of await unreads.getSingleUnreads(ctx, {
    channelIds,
    userId: jazzUserId,
  })) {
    unreadCountsByThreadId.set(result.channelId, result.count);
  }

  return unreadCountsByThreadId;
};

export const archiveUnreadThread = async (
  ctx: MutationCtx,
  threadId: Id<"chatThreads">
) => {
  await unreads.archive(ctx, { channelId: threadId });
};
