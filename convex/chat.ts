import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
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
import type { Doc } from "./_generated/dataModel";
import { mutation, type QueryCtx, query } from "./_generated/server";

const MAX_MESSAGE_BODY_LENGTH = 1000;
const MESSAGE_PREVIEW_LENGTH = 80;

const normalizeMessageBody = (body: string) => {
  const trimmedBody = body.trim();

  if (!trimmedBody) {
    throw new ConvexError("Message is required");
  }

  if (trimmedBody.length > MAX_MESSAGE_BODY_LENGTH) {
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
  args: {
    groupId: v.id("groups"),
    instantUserId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.groupId, args.instantUserId);
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
  args: {
    groupId: v.id("groups"),
    instantUserId: v.string(),
    paginationOpts: paginationOptsValidator,
    targetInstantUserId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireDirectMembership(
      ctx,
      args.groupId,
      args.instantUserId,
      args.targetInstantUserId
    );
    const { pairKey } = createDirectPair(
      args.instantUserId,
      args.targetInstantUserId
    );
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
  args: {
    body: v.string(),
    groupId: v.id("groups"),
    instantUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const { membership } = await requireMembership(
      ctx,
      args.groupId,
      args.instantUserId
    );
    const body = normalizeMessageBody(args.body);
    const thread = await getOrCreateThread(
      ctx,
      args.groupId,
      "group",
      GROUP_THREAD_PAIR_KEY
    );
    const now = Date.now();

    await ctx.db.insert("chatMessages", {
      authorDisplayNameSnapshot: membership.displayName,
      authorInstantUserId: args.instantUserId,
      body,
      createdAt: now,
      groupId: args.groupId,
      threadId: thread._id,
    });
    await recordChatMessageUnread(ctx, {
      authorInstantUserId: args.instantUserId,
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
  args: {
    body: v.string(),
    groupId: v.id("groups"),
    instantUserId: v.string(),
    targetInstantUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const { membership } = await requireDirectMembership(
      ctx,
      args.groupId,
      args.instantUserId,
      args.targetInstantUserId
    );
    const body = normalizeMessageBody(args.body);
    const { directParticipantA, directParticipantB, pairKey } =
      createDirectPair(args.instantUserId, args.targetInstantUserId);
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
    const now = Date.now();

    await ctx.db.insert("chatMessages", {
      authorDisplayNameSnapshot: membership.displayName,
      authorInstantUserId: args.instantUserId,
      body,
      createdAt: now,
      groupId: args.groupId,
      threadId: thread._id,
    });
    await recordChatMessageUnread(ctx, {
      authorInstantUserId: args.instantUserId,
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
  args: {
    groupId: v.id("groups"),
    instantUserId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.groupId, args.instantUserId);
    const thread = await getThread(
      ctx,
      args.groupId,
      "group",
      GROUP_THREAD_PAIR_KEY
    );

    if (!thread?.lastMessageCreatedAt) {
      return;
    }

    await markThreadRead(ctx, { instantUserId: args.instantUserId, thread });
  },
});

export const markDirectRead = mutation({
  args: {
    groupId: v.id("groups"),
    instantUserId: v.string(),
    targetInstantUserId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireDirectMembership(
      ctx,
      args.groupId,
      args.instantUserId,
      args.targetInstantUserId
    );
    const { pairKey } = createDirectPair(
      args.instantUserId,
      args.targetInstantUserId
    );
    const thread = await getThread(ctx, args.groupId, "direct", pairKey);

    if (!thread?.lastMessageCreatedAt) {
      return;
    }

    await markThreadRead(ctx, { instantUserId: args.instantUserId, thread });
  },
});
