import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import { requireUserId } from "../convex-lib/auth";
import {
  getReplySnapshot,
  requireMessageAccess,
} from "../convex-lib/chatInteractions";
import { addMessageMetadata } from "../convex-lib/chatMessageMetadata";
import {
  createDirectPair,
  GROUP_THREAD_PAIR_KEY,
  getOrCreateThread,
  getThread,
} from "../convex-lib/chatThreads";
import {
  requireDirectMembership,
  requireMembership,
} from "../convex-lib/groupMembers";
import { markThreadRead, recordChatMessageUnread } from "../convex-lib/unreads";
import {
  isReactionEmoji,
  MAX_CHAT_MESSAGE_LENGTH,
  toggleMessageReaction,
} from "../shared/chat";
import { chatMessageValidator } from "../shared/chat-schema";
import type { Doc } from "./_generated/dataModel";
import { mutation, type QueryCtx, query } from "./_generated/server";

const MESSAGE_PREVIEW_LENGTH = 80;
const MAX_REACTION_USERS = 1000;

const normalizeMessageBody = (body: string) => {
  const trimmedBody = body.trim();

  if (!trimmedBody) {
    throw new ConvexError("Message is required");
  }

  if (trimmedBody.length > MAX_CHAT_MESSAGE_LENGTH) {
    throw new ConvexError("Message is too long");
  }

  return trimmedBody;
};

const createMessagePreview = (body: string) =>
  body.length > MESSAGE_PREVIEW_LENGTH
    ? `${body.slice(0, MESSAGE_PREVIEW_LENGTH)}...`
    : body;

const emptyPage = <T>(cursor: string | null) => ({
  continueCursor: cursor ?? "",
  isDone: true,
  page: [] as T[],
});

const listMessagesForThread = (
  ctx: QueryCtx,
  thread: Doc<"chatThreads"> | null,
  paginationOpts: {
    cursor: string | null;
    numItems: number;
    endCursor?: string | null;
    id?: number;
    maximumBytesRead?: number;
    maximumRowsRead?: number;
  }
) => {
  if (!thread) {
    return emptyPage<Doc<"chatMessages">>(paginationOpts.cursor);
  }

  return ctx.db
    .query("chatMessages")
    .withIndex("by_threadId_createdAt", (q) => q.eq("threadId", thread._id))
    .order("desc")
    .paginate(paginationOpts);
};

export const listGroupMessages = query({
  returns: paginationResultValidator(chatMessageValidator),
  args: {
    groupId: v.id("groups"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireMembership(ctx, args.groupId, userId);
    const thread = await getThread(
      ctx,
      args.groupId,
      "group",
      GROUP_THREAD_PAIR_KEY
    );
    const result = await listMessagesForThread(
      ctx,
      thread,
      args.paginationOpts
    );

    return {
      ...result,
      page: await addMessageMetadata(ctx, thread, result.page),
    };
  },
});

export const listDirectMessages = query({
  returns: paginationResultValidator(chatMessageValidator),
  args: {
    groupId: v.id("groups"),
    paginationOpts: paginationOptsValidator,
    targetUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireDirectMembership(ctx, args.groupId, userId, args.targetUserId);
    const { pairKey } = createDirectPair(userId, args.targetUserId);
    const thread = await getThread(ctx, args.groupId, "direct", pairKey);
    const result = await listMessagesForThread(
      ctx,
      thread,
      args.paginationOpts
    );

    return {
      ...result,
      page: await addMessageMetadata(ctx, thread, result.page),
    };
  },
});

export const sendGroupMessage = mutation({
  returns: v.object({ threadId: v.id("chatThreads") }),
  args: {
    body: v.string(),
    replyToMessageId: v.optional(v.id("chatMessages")),
    groupId: v.id("groups"),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const { membership } = await requireMembership(ctx, args.groupId, userId);
    const body = normalizeMessageBody(args.body);
    const thread = await getOrCreateThread(
      ctx,
      args.groupId,
      "group",
      GROUP_THREAD_PAIR_KEY
    );
    const reply = await getReplySnapshot(ctx, thread, args.replyToMessageId);
    const now = Date.now();

    await ctx.db.insert("chatMessages", {
      ...(reply ? { reply } : {}),
      authorDisplayNameSnapshot: membership.displayName,
      authorUserId: userId,
      body,
      createdAt: now,
      groupId: args.groupId,
      threadId: thread._id,
    });
    await recordChatMessageUnread(ctx, {
      authorUserId: userId,
      createdAt: now,
      threadId: thread._id,
    });
    await ctx.db.patch(thread._id, {
      lastMessageCreatedAt: now,
      lastMessagePreview: createMessagePreview(body),
      updatedAt: now,
    });

    return { threadId: thread._id };
  },
});

export const sendDirectMessage = mutation({
  returns: v.object({ threadId: v.id("chatThreads") }),
  args: {
    body: v.string(),
    replyToMessageId: v.optional(v.id("chatMessages")),
    groupId: v.id("groups"),
    targetUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const { membership } = await requireDirectMembership(
      ctx,
      args.groupId,
      userId,
      args.targetUserId
    );
    const body = normalizeMessageBody(args.body);
    const { directParticipantA, directParticipantB, pairKey } =
      createDirectPair(userId, args.targetUserId);
    const thread = await getOrCreateThread(
      ctx,
      args.groupId,
      "direct",
      pairKey,
      {
        directParticipantA,
        directParticipantB,
      }
    );
    const reply = await getReplySnapshot(ctx, thread, args.replyToMessageId);
    const now = Date.now();

    await ctx.db.insert("chatMessages", {
      ...(reply ? { reply } : {}),
      authorDisplayNameSnapshot: membership.displayName,
      authorUserId: userId,
      body,
      createdAt: now,
      groupId: args.groupId,
      threadId: thread._id,
    });
    await recordChatMessageUnread(ctx, {
      authorUserId: userId,
      createdAt: now,
      threadId: thread._id,
    });
    await ctx.db.patch(thread._id, {
      lastMessageCreatedAt: now,
      lastMessagePreview: createMessagePreview(body),
      updatedAt: now,
    });

    return { threadId: thread._id };
  },
});

export const markGroupRead = mutation({
  returns: v.null(),
  args: {
    groupId: v.id("groups"),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireMembership(ctx, args.groupId, userId);
    const thread = await getThread(
      ctx,
      args.groupId,
      "group",
      GROUP_THREAD_PAIR_KEY
    );

    if (!thread?.lastMessageCreatedAt) {
      return null;
    }

    await markThreadRead(ctx, { userId, thread });
    return null;
  },
});

export const markDirectRead = mutation({
  returns: v.null(),
  args: {
    groupId: v.id("groups"),
    targetUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireDirectMembership(ctx, args.groupId, userId, args.targetUserId);
    const { pairKey } = createDirectPair(userId, args.targetUserId);
    const thread = await getThread(ctx, args.groupId, "direct", pairKey);

    if (!thread?.lastMessageCreatedAt) {
      return null;
    }

    await markThreadRead(ctx, { userId, thread });
    return null;
  },
});

export const toggleReaction = mutation({
  args: { messageId: v.id("chatMessages"), emoji: v.string() },
  returns: v.null(),
  handler: async (ctx, { messageId, emoji }) => {
    const userId = await requireUserId(ctx);
    const message = await requireMessageAccess(ctx, messageId, userId);
    if (!isReactionEmoji(emoji)) {
      throw new ConvexError("このリアクションは使用できません");
    }
    const reactions = message.reactions ?? [];
    const existing = reactions.find((reaction) => reaction.emoji === emoji);
    if (!existing && reactions.length >= 100) {
      throw new ConvexError("リアクションの種類の上限に達しました");
    }
    const userIds = existing?.userIds ?? [];
    const removing = userIds.includes(userId);
    if (!removing && userIds.length >= MAX_REACTION_USERS) {
      throw new ConvexError("リアクションの上限に達しました");
    }
    await ctx.db.patch(messageId, {
      reactions: toggleMessageReaction(reactions, emoji, userId),
    });
    return null;
  },
});
