import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server";

const GROUP_THREAD_PAIR_KEY = "group";
const MAX_MESSAGE_BODY_LENGTH = 1000;
const MESSAGE_PREVIEW_LENGTH = 80;

type ChatKind = Doc<"chatThreads">["kind"];

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

const createDirectPair = (jazzUserId: string, targetJazzUserId: string) => {
  if (jazzUserId === targetJazzUserId) {
    throw new ConvexError("Direct chat target is invalid");
  }

  const [directParticipantA, directParticipantB] = [
    jazzUserId,
    targetJazzUserId,
  ].sort();

  return {
    directParticipantA,
    directParticipantB,
    pairKey: JSON.stringify([directParticipantA, directParticipantB]),
  };
};

const createMessagePreview = (body: string) =>
  body.length > MESSAGE_PREVIEW_LENGTH
    ? `${body.slice(0, MESSAGE_PREVIEW_LENGTH)}...`
    : body;

const getGroup = async (ctx: QueryCtx | MutationCtx, groupId: Id<"groups">) =>
  ctx.db.get(groupId);

const getMembership = async (
  ctx: QueryCtx | MutationCtx,
  groupId: Id<"groups">,
  jazzUserId: string
) =>
  ctx.db
    .query("groupMembers")
    .withIndex("by_groupId_jazzUserId", (q) =>
      q.eq("groupId", groupId).eq("jazzUserId", jazzUserId)
    )
    .unique();

const requireMembership = async (
  ctx: QueryCtx | MutationCtx,
  groupId: Id<"groups">,
  jazzUserId: string
) => {
  const [group, membership] = await Promise.all([
    getGroup(ctx, groupId),
    getMembership(ctx, groupId, jazzUserId),
  ]);

  if (!(group && membership)) {
    throw new ConvexError("Group not found");
  }

  return { group, membership };
};

const requireDirectMembership = async (
  ctx: QueryCtx | MutationCtx,
  groupId: Id<"groups">,
  jazzUserId: string,
  targetJazzUserId: string
) => {
  const { group, membership } = await requireMembership(
    ctx,
    groupId,
    jazzUserId
  );
  const targetMembership = await getMembership(ctx, groupId, targetJazzUserId);

  if (!targetMembership) {
    throw new ConvexError("Member not found");
  }

  return { group, membership, targetMembership };
};

const getThread = async (
  ctx: QueryCtx | MutationCtx,
  groupId: Id<"groups">,
  kind: ChatKind,
  pairKey: string
) =>
  ctx.db
    .query("chatThreads")
    .withIndex("by_groupId_kind_pairKey", (q) =>
      q.eq("groupId", groupId).eq("kind", kind).eq("pairKey", pairKey)
    )
    .unique();

const getOrCreateThread = async (
  ctx: MutationCtx,
  groupId: Id<"groups">,
  kind: ChatKind,
  pairKey: string,
  directParticipants?: {
    directParticipantA: string;
    directParticipantB: string;
  }
) => {
  const existingThread = await getThread(ctx, groupId, kind, pairKey);

  if (existingThread) {
    return existingThread;
  }

  const now = Date.now();
  const threadId = await ctx.db.insert("chatThreads", {
    ...directParticipants,
    createdAt: now,
    groupId,
    kind,
    pairKey,
    updatedAt: now,
  });
  const thread = await ctx.db.get(threadId);

  if (!thread) {
    throw new ConvexError("Failed to create chat");
  }

  return thread;
};

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

const getDisplayNameByJazzUserId = async (
  ctx: QueryCtx,
  groupId: Id<"groups">,
  jazzUserId: string
) => {
  const membership = await getMembership(ctx, groupId, jazzUserId);

  return membership?.displayName ?? "脱退済みメンバー";
};

const addMessageMetadata = async (
  ctx: QueryCtx,
  thread: Doc<"chatThreads"> | null,
  page: Doc<"chatMessages">[]
) => {
  const displayNames = new Map<string, string>();
  const reads = thread
    ? await ctx.db
        .query("chatReads")
        .filter((q) => q.eq(q.field("threadId"), thread._id))
        .collect()
    : [];
  const messages: (Doc<"chatMessages"> & {
    authorDisplayName: string;
    readCount: number;
  })[] = [];

  for (const message of page) {
    let displayName =
      message.authorDisplayNameSnapshot ||
      displayNames.get(message.authorJazzUserId);

    if (!displayName) {
      displayName = await getDisplayNameByJazzUserId(
        ctx,
        message.groupId,
        message.authorJazzUserId
      );
      displayNames.set(message.authorJazzUserId, displayName);
    }

    messages.push({
      ...message,
      authorDisplayName: displayName,
      readCount: reads.filter(
        (read) =>
          read.jazzUserId !== message.authorJazzUserId &&
          read.lastReadMessageCreatedAt >= message.createdAt
      ).length,
    });
  }

  return messages;
};

export const listGroupMessages = query({
  args: {
    groupId: v.id("groups"),
    jazzUserId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.groupId, args.jazzUserId);
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

export const listGroupEvents = query({
  args: {
    groupId: v.id("groups"),
    jazzUserId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.groupId, args.jazzUserId);

    return ctx.db
      .query("chatEvents")
      .withIndex("by_groupId_createdAt", (q) => q.eq("groupId", args.groupId))
      .order("desc")
      .collect();
  },
});

export const listDirectEvents = query({
  args: {
    groupId: v.id("groups"),
    jazzUserId: v.string(),
    targetJazzUserId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireDirectMembership(
      ctx,
      args.groupId,
      args.jazzUserId,
      args.targetJazzUserId
    );
    const participantJazzUserIds = new Set([
      args.jazzUserId,
      args.targetJazzUserId,
    ]);
    const events = await ctx.db
      .query("chatEvents")
      .withIndex("by_groupId_createdAt", (q) => q.eq("groupId", args.groupId))
      .order("desc")
      .collect();

    return events.filter(
      (event) =>
        event.kind === "display_name_updated" &&
        participantJazzUserIds.has(event.actorJazzUserId)
    );
  },
});

export const listDirectMessages = query({
  args: {
    groupId: v.id("groups"),
    jazzUserId: v.string(),
    paginationOpts: paginationOptsValidator,
    targetJazzUserId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireDirectMembership(
      ctx,
      args.groupId,
      args.jazzUserId,
      args.targetJazzUserId
    );
    const { pairKey } = createDirectPair(
      args.jazzUserId,
      args.targetJazzUserId
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
    jazzUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const { membership } = await requireMembership(
      ctx,
      args.groupId,
      args.jazzUserId
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
      authorJazzUserId: args.jazzUserId,
      body,
      createdAt: now,
      groupId: args.groupId,
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
    jazzUserId: v.string(),
    targetJazzUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const { membership } = await requireDirectMembership(
      ctx,
      args.groupId,
      args.jazzUserId,
      args.targetJazzUserId
    );
    const body = normalizeMessageBody(args.body);
    const { directParticipantA, directParticipantB, pairKey } =
      createDirectPair(args.jazzUserId, args.targetJazzUserId);
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
      authorJazzUserId: args.jazzUserId,
      body,
      createdAt: now,
      groupId: args.groupId,
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
    jazzUserId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.groupId, args.jazzUserId);
    const thread = await getThread(
      ctx,
      args.groupId,
      "group",
      GROUP_THREAD_PAIR_KEY
    );

    if (!thread?.lastMessageCreatedAt) {
      return;
    }

    const existingRead = await ctx.db
      .query("chatReads")
      .withIndex("by_threadId_jazzUserId", (q) =>
        q.eq("threadId", thread._id).eq("jazzUserId", args.jazzUserId)
      )
      .unique();
    const now = Date.now();

    if (existingRead) {
      await ctx.db.patch(existingRead._id, {
        lastReadMessageCreatedAt: thread.lastMessageCreatedAt,
        updatedAt: now,
      });
      return;
    }

    await ctx.db.insert("chatReads", {
      jazzUserId: args.jazzUserId,
      lastReadMessageCreatedAt: thread.lastMessageCreatedAt,
      threadId: thread._id,
      updatedAt: now,
    });
  },
});

export const markDirectRead = mutation({
  args: {
    groupId: v.id("groups"),
    jazzUserId: v.string(),
    targetJazzUserId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireDirectMembership(
      ctx,
      args.groupId,
      args.jazzUserId,
      args.targetJazzUserId
    );
    const { pairKey } = createDirectPair(
      args.jazzUserId,
      args.targetJazzUserId
    );
    const thread = await getThread(ctx, args.groupId, "direct", pairKey);

    if (!thread?.lastMessageCreatedAt) {
      return;
    }

    const existingRead = await ctx.db
      .query("chatReads")
      .withIndex("by_threadId_jazzUserId", (q) =>
        q.eq("threadId", thread._id).eq("jazzUserId", args.jazzUserId)
      )
      .unique();
    const now = Date.now();

    if (existingRead) {
      await ctx.db.patch(existingRead._id, {
        lastReadMessageCreatedAt: thread.lastMessageCreatedAt,
        updatedAt: now,
      });
      return;
    }

    await ctx.db.insert("chatReads", {
      jazzUserId: args.jazzUserId,
      lastReadMessageCreatedAt: thread.lastMessageCreatedAt,
      threadId: thread._id,
      updatedAt: now,
    });
  },
});
