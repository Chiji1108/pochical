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
  instantUserId: string
) => {
  await unreads.muteSender(ctx, {
    targetUserId: instantUserId,
    userId: instantUserId,
  });
};

export const recordChatMessageUnread = async (
  ctx: MutationCtx,
  message: {
    authorInstantUserId: string;
    createdAt: number;
    threadId: Id<"chatThreads">;
  }
) => {
  await ensureOwnMessagesIgnored(ctx, message.authorInstantUserId);
  await unreads.insertMessage(ctx, {
    authorId: message.authorInstantUserId,
    channelId: message.threadId,
    timestamp: message.createdAt,
  });
};

export const markThreadRead = async (
  ctx: MutationCtx,
  args: {
    instantUserId: string;
    thread: Doc<"chatThreads">;
  }
) => {
  if (!args.thread.lastMessageCreatedAt) {
    return;
  }

  await ensureOwnMessagesIgnored(ctx, args.instantUserId);
  await unreads.markReadUpTo(ctx, {
    channelId: args.thread._id,
    timestamp: args.thread.lastMessageCreatedAt,
    userId: args.instantUserId,
  });
};

export const markThreadsReadUpTo = async (
  ctx: MutationCtx,
  args: {
    instantUserId: string;
    threads: Doc<"chatThreads">[];
    timestamp: number;
  }
) => {
  await ensureOwnMessagesIgnored(ctx, args.instantUserId);

  for (const thread of args.threads) {
    if (!thread.lastMessageCreatedAt) {
      continue;
    }

    await unreads.markReadUpTo(ctx, {
      channelId: thread._id,
      timestamp: args.timestamp,
      userId: args.instantUserId,
    });
  }
};

export const getLastReadByChannelId = async (
  ctx: QueryCtx,
  args: {
    channelId: Id<"chatThreads">;
    instantUserId: string;
  }
) =>
  (await unreads.getLastRead(ctx, {
    channelId: args.channelId,
    userId: args.instantUserId,
  })) ?? 0;

export const getUnreadCountsByThreadId = async (
  ctx: QueryCtx,
  threads: Doc<"chatThreads">[],
  instantUserId: string
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
    userId: instantUserId,
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
